import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import {
  applyMove,
  findLegal,
  initialBoard,
  outcome,
  type Board,
  type Side,
} from '@/lib/games/checkers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/games/checkers?id=… — สถานะเกมหนึ่งเกม
 * GET /api/office/games/checkers      — เกมที่ค้างอยู่ + คำท้าที่ยังไม่ตอบ
 *
 * ★ แบบไม่มี id ใช้บนหน้าเมนูเกม ตามข้อกำหนด "ปิดแอปแล้วกลับมา
 *   ต้องเห็นเกมที่ค้างอยู่ในหน้าเมนูเกม"
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()
  const params = new URL(request.url).searchParams
  const id = params.get('id')

  if (params.get('board') === 'month') {
    /*
     * ★★ กระดานอันดับรายเดือน = 30 วันย้อนหลัง ไม่ใช่เดือนปฏิทิน
     *    ★ เหตุผลเดียวกับกระดานพิมพ์ดีด: เดือนปฏิทินทำให้กระดานว่างเปล่า
     *      ทุกวันที่ 1 ซึ่งไม่มีใครอยากเปิดดู
     */
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data, error } = await admin.rpc('checkers_leaderboard', { p_since: since })
    if (error) throw fromPostgresError(error)

    const rows = (data ?? []) as { user_id: string; wins: number; losses: number; draws: number }[]
    const names = await loadNames(admin, rows.map((r) => r.user_id))
    return ok({
      board: rows.slice(0, 20).map((r) => ({
        id: r.user_id,
        name: names.get(r.user_id) ?? '',
        wins: Number(r.wins),
        losses: Number(r.losses),
        draws: Number(r.draws),
        me: r.user_id === actor.id,
      })),
    })
  }

  if (params.get('opponents') === '1') {
    /*
     * ★★ "คนที่เล่นด้วยบ่อย" นับจากเกมจริงที่เคยเล่นกัน ไม่ใช่รายชื่อทั้งออฟฟิศ
     *    ★ ข้อกำหนด 2.2 ขอ "แถว avatar คนที่เล่นด้วยบ่อย" ซึ่งมีประโยชน์
     *      ก็ต่อเมื่อมันสะท้อนพฤติกรรมจริง ★★ ไม่งั้นมันคือรายชื่อเรียงมั่ว
     *      ที่กินพื้นที่บนจอโดยไม่ช่วยอะไร
     */
    const { data } = await admin
      .from('checkers_games')
      .select('bottom_id, top_id, updated_at')
      .or(`bottom_id.eq.${actor.id},top_id.eq.${actor.id}`)
      .order('updated_at', { ascending: false })
      .limit(200)

    const tally = new Map<string, number>()
    for (const g of data ?? []) {
      const other = g.bottom_id === actor.id ? g.top_id : g.bottom_id
      tally.set(other, (tally.get(other) ?? 0) + 1)
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const names = await loadNames(admin, top.map(([uid]) => uid))

    return ok({
      opponents: top.map(([uid, n]) => ({ id: uid, name: names.get(uid) ?? '', games: n })),
    })
  }

  if (id) {
    const { data, error } = await admin
      .from('checkers_games')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('ROOM_NOT_FOUND')

    /* ★ คนนอกเกมดูไม่ได้ — ตรวจที่ server ไม่ใช่ซ่อนลิงก์ใน UI */
    if (data.bottom_id !== actor.id && data.top_id !== actor.id) {
      throw new AppError('FORBIDDEN')
    }

    const names = await loadNames(admin, [data.bottom_id, data.top_id])
    return ok({ game: shape(data, actor.id, names) })
  }

  const [{ data: games }, { data: challenges }] = await Promise.all([
    admin
      .from('checkers_games')
      .select('*')
      .or(`bottom_id.eq.${actor.id},top_id.eq.${actor.id}`)
      .eq('status', 'PLAYING')
      .order('updated_at', { ascending: false })
      .limit(20),
    admin
      .from('game_challenges')
      .select('id, game, from_id, to_id, status, expires_at, game_id')
      /*
       * ★★★ กรองชนิดเกมด้วย — game_challenges เป็นตารางของกลางทุกเกม
       *
       *     ★ ไม่กรอง = คำท้า "เรียง 4" โผล่ในหน้าหมากฮอส กดรับแล้วได้
       *       เกมผิดชนิด ★★ ของเดิมไม่กรองแล้วไม่เคยพัง เพราะหมากฮอส
       *       เป็นเกมเดียวที่ใช้ตารางนี้ — ซึ่งไม่ใช่การกัน แค่ยังไม่มีใครเหยียบ
       */
      .eq('game', 'checkers')
      .eq('to_id', actor.id)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const ids = new Set<string>()
  for (const g of games ?? []) {
    ids.add(g.bottom_id)
    ids.add(g.top_id)
  }
  for (const c of challenges ?? []) ids.add(c.from_id)
  const names = await loadNames(admin, [...ids])

  return ok({
    /*
     * ★★ บอก id ของตัวเองกลับไปด้วย — หน้าลอบบี้ต้องใช้ตั้ง filter ของ Realtime
     *    ★ ให้หน้าจอไปถาม supabase.auth.getUser() เองได้ แต่นั่นคือคำขอ
     *      เพิ่มอีกหนึ่งรอบก่อนจะเริ่มฟังได้ ★★ ซึ่งคือช่วงที่คำท้าหลุดได้พอดี
     */
    meId: actor.id,
    games: (games ?? []).map((g) => shape(g, actor.id, names)),
    challenges: (challenges ?? []).map((c) => ({
      id: c.id,
      game: c.game,
      fromId: c.from_id,
      fromName: names.get(c.from_id) ?? null,
      expiresAt: c.expires_at,
    })),
  })
})

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('challenge'), to: z.uuid() }),
  z.object({ action: z.literal('accept'), challengeId: z.uuid() }),
  z.object({ action: z.literal('decline'), challengeId: z.uuid() }),
  z.object({ action: z.literal('rematch'), gameId: z.uuid() }),
  z.object({
    action: z.literal('move'),
    gameId: z.uuid(),
    version: z.number().int().min(0),
    from: z.number().int().min(0).max(63),
    to: z.number().int().min(0).max(63),
  }),
  z.object({
    action: z.literal('end'),
    gameId: z.uuid(),
    kind: z.enum(['RESIGN', 'OFFER_DRAW', 'ACCEPT_DRAW', 'TIMEOUT']),
  }),
])

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  const body = await parseJsonBody(request, bodySchema)
  const admin = getSupabaseAdminClient()

  if (body.action === 'challenge') {
    await enforceRateLimit('gameChallenge', actor.id)
    const { data, error } = await admin.rpc('challenge_create', {
      p_actor: actor.id,
      p_game: 'checkers',
      p_to: body.to,
    })
    if (error) throw fromPostgresError(error)
    return ok({ challengeId: data as string })
  }

  if (body.action === 'accept') {
    const { data, error } = await admin.rpc('challenge_accept', {
      p_actor: actor.id,
      p_id: body.challengeId,
      /* ★ กระดานเริ่มต้นสร้างที่ server — ไม่รับจาก client
           ★★ รับจาก client = เปิดทางให้ส่งกระดานที่ตัวเองได้เปรียบมาตั้งแต่ต้น */
      p_board: initialBoard(),
    })
    if (error) throw fromPostgresError(error)
    return ok({ gameId: data as string })
  }

  if (body.action === 'decline') {
    const { error } = await admin
      .from('game_challenges')
      .update({ status: 'DECLINED' })
      .eq('id', body.challengeId)
      .eq('to_id', actor.id)
      .eq('status', 'PENDING')
    if (error) throw fromPostgresError(error)
    return ok({ declined: true })
  }

  if (body.action === 'rematch') {
    /* ★ กระดานเริ่มต้นสร้างที่ server เหมือนตอนรับคำท้า — เหตุผลเดียวกัน */
    const { data, error } = await admin.rpc('checkers_rematch', {
      p_actor: actor.id,
      p_game: body.gameId,
      p_board: initialBoard(),
    })
    if (error) throw fromPostgresError(error)
    return ok({ gameId: data as string })
  }

  if (body.action === 'end') {
    const { data, error } = await admin.rpc('checkers_end', {
      p_actor: actor.id,
      p_game: body.gameId,
      p_action: body.kind,
    })
    if (error) throw fromPostgresError(error)
    const g = data as CheckersRow
    const names = await loadNames(admin, [g.bottom_id, g.top_id])
    return ok({ game: shape(g, actor.id, names) })
  }

  /* ── เดินหมาก ─────────────────────────────────────────────────── */
  await enforceRateLimit('gameMove', actor.id)

  const { data: row, error: readError } = await admin
    .from('checkers_games')
    .select('*')
    .eq('id', body.gameId)
    .maybeSingle()

  if (readError) throw fromPostgresError(readError)
  if (!row) throw new AppError('ROOM_NOT_FOUND')

  const side: Side | null =
    row.bottom_id === actor.id ? 'BOTTOM' : row.top_id === actor.id ? 'TOP' : null
  if (!side) throw new AppError('FORBIDDEN')

  /*
   * ★★★ ตรงนี้คือด่านกติกาฝั่ง server ตามข้อกำหนด 2.4
   *
   *     ★ ใช้ findLegal จาก lib/games/checkers — โมดูลเดียวกับที่หน้าจอ
   *       ใช้ไฮไลต์ช่องที่เดินได้
   *       ★★ จึงไม่มีทางที่สองฝั่งจะตัดสินต่างกัน ซึ่งเป็นเหตุผลทั้งหมด
   *          ที่กติกาถูกแยกเป็นโมดูลที่ไม่ผูกกับ UI ตั้งแต่แรก
   *
   *     ★ ไม่เชื่อ "กระดานหลังเดิน" ที่ client ส่งมา — เราคำนวณเอง
   *       จากกระดานในฐานข้อมูล ★★ client ส่งมาแค่ "จากช่องไหนไปช่องไหน"
   *         ซึ่งเป็นเจตนา ไม่ใช่ผลลัพธ์
   */
  const board = row.board as Board
  const move = findLegal(board, side, body.from, body.to, row.force_capture)
  if (!move) throw new AppError('VALIDATION_FAILED')

  const next = applyMove(board, move)
  const nextTurn: Side = side === 'BOTTOM' ? 'TOP' : 'BOTTOM'
  const quiet = move.captured.length > 0 ? 0 : row.quiet_plies + 1
  const result = outcome(next, nextTurn, quiet, row.force_capture)

  const finished = result.kind !== 'PLAYING'
  const winnerId =
    result.kind === 'WIN' ? (result.side === 'BOTTOM' ? row.bottom_id : row.top_id) : null

  const { data, error } = await admin.rpc('checkers_play', {
    p_actor: actor.id,
    p_game: body.gameId,
    p_version: body.version,
    p_from: body.from,
    p_to: body.to,
    p_captured: move.captured,
    p_board: next,
    p_turn: nextTurn,
    p_quiet: quiet,
    p_status: finished ? 'FINISHED' : 'PLAYING',
    p_winner: winnerId,
    p_reason: finished ? (result.kind === 'DRAW' ? 'DRAW' : 'WIN') : null,
  })

  if (error) throw fromPostgresError(error)
  const g = data as CheckersRow
  const names = await loadNames(admin, [g.bottom_id, g.top_id])
  return ok({ game: shape(g, actor.id, names) })
})

/* ═══════════════════════════════════════════════════════════════════ */

type CheckersRow = {
  id: string
  bottom_id: string
  top_id: string
  board: unknown
  turn: Side
  quiet_plies: number
  version: number
  status: string
  winner_id: string | null
  end_reason: string | null
  force_capture: boolean
  last_from: number | null
  last_to: number | null
  draw_offer_by: string | null
  updated_at: string
}

async function loadNames(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await admin
    .from('profiles')
    .select('id, display_name, nickname')
    .in('id', ids)
  return new Map((data ?? []).map((p) => [p.id, p.nickname || p.display_name]))
}

/**
 * แปลงแถวเป็นรูปที่หน้าจอใช้
 *
 * ★★ คำนวณ "ฝั่งของฉัน" ที่ server ที่เดียว
 *    ★ หน้าจอไม่ต้องเทียบ id เอง ซึ่งเป็นที่ที่พลาดแล้วผู้เล่นจะเดินหมาก
 *      ของอีกฝ่ายได้ในหน้าจอตัวเอง (แล้วค่อยถูก server ปฏิเสธ)
 */
function shape(g: CheckersRow, me: string, names: Map<string, string>) {
  const mySide: Side = g.bottom_id === me ? 'BOTTOM' : 'TOP'
  return {
    id: g.id,
    board: g.board,
    turn: g.turn,
    version: g.version,
    status: g.status,
    forceCapture: g.force_capture,
    mySide,
    myTurn: g.status === 'PLAYING' && g.turn === mySide,
    lastMove: g.last_from !== null && g.last_to !== null ? { from: g.last_from, to: g.last_to } : null,
    winnerId: g.winner_id,
    endReason: g.end_reason,
    /** ★ "อีกฝ่ายขอเสมอ" ไม่ใช่ "มีคนขอเสมอ" — หน้าจอต้องรู้ว่าควรขึ้นปุ่มรับไหม */
    drawOfferFromOpponent: g.draw_offer_by !== null && g.draw_offer_by !== me,
    bottom: { id: g.bottom_id, name: names.get(g.bottom_id) ?? '' },
    top: { id: g.top_id, name: names.get(g.top_id) ?? '' },
    /*
     * ★★ "คู่ต่อสู้คือใคร" คำนวณที่นี่ด้วย — ลอบบี้ใช้ร่วมกับเกมอื่น
     *    ★ หมากฮอสเรียกฝั่งว่า bottom/top เรียง 4 เรียกว่า red/gold
     *      ★★ ให้ลอบบี้เดาเองแปลว่ามันต้องรู้ชื่อคอลัมน์ของทุกเกม
     *         แล้วเกมที่สามจะต้องกลับมาแก้ลอบบี้ทุกครั้ง
     */
    opponent:
      mySide === 'BOTTOM'
        ? { id: g.top_id, name: names.get(g.top_id) ?? '' }
        : { id: g.bottom_id, name: names.get(g.bottom_id) ?? '' },
    updatedAt: g.updated_at,
  }
}
