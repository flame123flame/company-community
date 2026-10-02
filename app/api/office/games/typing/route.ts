import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { isCredible, pickText, type TextLang, type TextLength } from '@/lib/games/typing'

export const dynamic = 'force-dynamic'

/** นับถอยหลังกี่วินาทีก่อนเริ่มพิมพ์ — ตามข้อกำหนด 3-2-1 */
const COUNTDOWN_SECONDS = 3

/**
 * GET /api/office/games/typing?room=…   — สถานะห้อง + ผู้เล่นทุกคน
 * GET /api/office/games/typing?board=th — กระดานอันดับรายสัปดาห์
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()
  const url = new URL(request.url)
  const roomId = url.searchParams.get('room')
  const boardLang = url.searchParams.get('board')

  if (boardLang === 'th' || boardLang === 'en') {
    /*
     * ★★ กระดานอันดับรายสัปดาห์ = ผลตั้งแต่ 7 วันก่อนถึงตอนนี้
     *    ★ ไม่ใช่ "สัปดาห์ปฏิทิน" เพราะวันจันทร์เช้ากระดานจะว่างเปล่า
     *      ★★ กระดานที่ว่างทุกวันจันทร์ คือกระดานที่ไม่มีใครอยากเปิดดู
     */
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data, error } = await admin
      .from('typing_results')
      .select('user_id, wpm, accuracy, created_at')
      .eq('lang', boardLang)
      .gte('created_at', since)
      .order('wpm', { ascending: false })
      .limit(200)

    if (error) throw fromPostgresError(error)

    /* ★ เก็บผลที่ดีที่สุดของแต่ละคน ไม่ใช่ทุกครั้งที่เล่น */
    const best = new Map<string, { wpm: number; accuracy: number }>()
    for (const r of data ?? []) {
      const cur = best.get(r.user_id)
      if (!cur || r.wpm > cur.wpm) best.set(r.user_id, { wpm: r.wpm, accuracy: Number(r.accuracy) })
    }

    const names = await loadNames(admin, [...best.keys()])
    const rows = [...best.entries()]
      .map(([id, v]) => ({ id, name: names.get(id) ?? '', ...v, me: id === actor.id }))
      .sort((a, b) => b.wpm - a.wpm)
      .slice(0, 20)

    return ok({ board: rows })
  }

  if (!roomId) throw new AppError('VALIDATION_FAILED')

  const { data: room, error } = await admin
    .from('typing_rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()

  if (error) throw fromPostgresError(error)
  if (!room) throw new AppError('ROOM_NOT_FOUND')

  const { data: players } = await admin
    .from('typing_players')
    .select('user_id, progress, wpm, accuracy, finished_at')
    .eq('room_id', roomId)
    .order('progress', { ascending: false })

  const names = await loadNames(admin, (players ?? []).map((p) => p.user_id))

  return ok({
    room: {
      id: room.id,
      code: room.code,
      lang: room.lang,
      text: room.text_body,
      status: room.status,
      startedAt: room.started_at,
      createdAt: room.created_at,
      isOwner: room.owner_id === actor.id,
    },
    players: (players ?? []).map((p) => ({
      id: p.user_id,
      name: names.get(p.user_id) ?? '',
      progress: p.progress,
      wpm: p.wpm,
      accuracy: Number(p.accuracy),
      finished: p.finished_at !== null,
      me: p.user_id === actor.id,
    })),
  })
})

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('join'),
    code: z.string().trim().max(8).optional().nullable(),
    lang: z.enum(['th', 'en']),
    length: z.enum(['short', 'medium']),
  }),
  /* ★ force = เริ่มอัตโนมัติเมื่อรอครบ 30 วิ — server ตรวจเวลาเอง ไม่เชื่อ client */
  z.object({ action: z.literal('start'), roomId: z.uuid(), force: z.boolean().optional() }),
  z.object({ action: z.literal('rematch'), roomId: z.uuid(), lang: z.enum(['th','en']), length: z.enum(['short','medium']) }),
  z.object({
    action: z.literal('progress'),
    roomId: z.uuid(),
    chars: z.number().int().min(0),
    wpm: z.number().int().min(0),
    accuracy: z.number().min(0).max(100),
  }),
  z.object({
    action: z.literal('finish'),
    roomId: z.uuid(),
    correctChars: z.number().int().min(0),
    wpm: z.number().int().min(0),
    accuracy: z.number().min(0).max(100),
    elapsedMs: z.number().int().min(0),
  }),
  z.object({ action: z.literal('leave'), roomId: z.uuid() }),
  z.object({
    action: z.literal('solo'),
    lang: z.enum(['th', 'en']),
    correctChars: z.number().int().min(0),
    wpm: z.number().int().min(0),
    accuracy: z.number().min(0).max(100),
    elapsedMs: z.number().int().min(0),
  }),
])

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  const body = await parseJsonBody(request, bodySchema)
  const admin = getSupabaseAdminClient()

  if (body.action === 'join') {
    await enforceRateLimit('gameChallenge', actor.id)
    /*
     * ★★★ ข้อความถูกเลือกที่ server ไม่ใช่ที่เบราว์เซอร์
     *     ★ ถ้าให้ client ส่งมา คนที่รู้ข้อความล่วงหน้าจะซ้อมก่อนกดเริ่มได้
     *       ★★ และทุกคนในห้องต้องได้ข้อความเดียวกัน ซึ่งรับประกันได้
     *          ก็ต่อเมื่อมีที่เดียวที่เลือกมัน
     */
    const text = pickText(body.lang as TextLang, body.length as TextLength)
    const { data, error } = await admin.rpc('typing_join', {
      p_actor: actor.id,
      p_code: body.code || null,
      p_lang: body.lang,
      p_len: body.length,
      p_text: text,
      p_newcode: newRoomCode(),
    })
    if (error) throw fromPostgresError(error)
    return ok({ roomId: (data as { id: string }).id, code: (data as { code: string }).code })
  }

  if (body.action === 'start') {
    const { data, error } = await admin.rpc('typing_start', {
      p_actor: actor.id,
      p_room: body.roomId,
      p_delay: COUNTDOWN_SECONDS,
      p_force: body.force ?? false,
    })
    if (error) throw fromPostgresError(error)
    return ok({ startedAt: (data as { started_at: string }).started_at })
  }

  if (body.action === 'rematch') {
    /* ★ ข้อความใหม่เลือกที่ server เหมือนตอนสร้างห้อง */
    const { error } = await admin.rpc('typing_rematch', {
      p_actor: actor.id,
      p_room: body.roomId,
      p_text: pickText(body.lang as TextLang, body.length as TextLength),
    })
    if (error) throw fromPostgresError(error)
    return ok({ restarted: true })
  }

  if (body.action === 'progress') {
    const { error } = await admin.rpc('typing_progress', {
      p_actor: actor.id,
      p_room: body.roomId,
      p_chars: body.chars,
      p_wpm: body.wpm,
      p_acc: body.accuracy,
    })
    if (error) throw fromPostgresError(error)
    return ok({ saved: true })
  }

  if (body.action === 'leave') {
    const { error } = await admin.rpc('typing_leave', { p_actor: actor.id, p_room: body.roomId })
    if (error) throw fromPostgresError(error)
    return ok({ left: true })
  }

  /*
   * ── จบการพิมพ์ ───────────────────────────────────────────────
   * ★★★ ตรวจความสมเหตุสมผลที่ server ตามข้อกำหนด 3.4
   *     ★ ใช้ isCredible จาก lib/games/typing — เลขเดียวกับที่หน้าจอใช้
   *       ★★ ไม่ปล่อยให้ client ส่ง "ผ่าน/ไม่ผ่าน" มาเอง ซึ่งเท่ากับ
   *          ให้คนโกงเป็นคนตัดสินว่าตัวเองโกงไหม
   */
  const credible = isCredible(body.correctChars, body.elapsedMs)

  if (body.action === 'solo') {
    const { error } = await admin.rpc('typing_solo_result', {
      p_actor: actor.id,
      p_lang: body.lang,
      p_wpm: body.wpm,
      p_acc: body.accuracy,
      p_elapsed: body.elapsedMs,
      p_credible: credible,
    })
    if (error) throw fromPostgresError(error)
    return ok({ counted: credible })
  }

  const { error } = await admin.rpc('typing_finish', {
    p_actor: actor.id,
    p_room: body.roomId,
    p_wpm: body.wpm,
    p_acc: body.accuracy,
    p_elapsed: body.elapsedMs,
    p_credible: credible,
  })
  if (error) throw fromPostgresError(error)
  return ok({ counted: credible })
})

/**
 * รหัสห้อง 5 ตัว
 *
 * ★ ตัดตัวที่สับสนออก (0/O · 1/I/L) — รหัสนี้ถูกอ่านออกเสียงบอกกันข้ามโต๊ะ
 *   ★★ เหตุผลเดียวกับรหัสห้องของห้องเพลง
 */
function newRoomCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  let out = ''
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

async function loadNames(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await admin.from('profiles').select('id, display_name, nickname').in('id', ids)
  return new Map((data ?? []).map((p) => [p.id, p.nickname || p.display_name]))
}
