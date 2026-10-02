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
  const id = new URL(request.url).searchParams.get('id')

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
    updatedAt: g.updated_at,
  }
}
