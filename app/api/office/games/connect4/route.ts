import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { COLS, emptyBoard, other, outcome, play, type Board, type Player } from '@/lib/games/connect4'

export const dynamic = 'force-dynamic'

/**
 * เรียง 4 ออนไลน์
 *
 * ★★★ หน้าตาเหมือน route ของหมากฮอสทุกจุด และตั้งใจให้เหมือน
 *
 *     ★ คนที่เคยซ่อมบั๊กในเกมหนึ่งแล้วมาอ่านอีกเกมต้องไม่ต้องเรียนใหม่
 *     ★★ ต่างกันแค่ "เจตนาที่ client ส่งมา" — หมากฮอสส่ง from→to
 *        เกมนี้ส่งเลขคอลัมน์เดียว เพราะแถวที่เหรียญตกไม่ใช่สิ่งที่เลือกได้
 *
 * GET ?id=…        — สถานะเกมหนึ่งเกม
 * GET ?board=month — กระดานอันดับ 30 วันย้อนหลัง
 * GET ?opponents=1 — คนที่เล่นด้วยบ่อย
 * GET              — เกมที่ค้างอยู่ + คำท้าที่ยังไม่ตอบ
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()
  const params = new URL(request.url).searchParams
  const id = params.get('id')

  if (params.get('board') === 'month') {
    /* ★ 30 วันย้อนหลัง ไม่ใช่เดือนปฏิทิน — เดือนปฏิทินทำให้กระดานว่างทุกวันที่ 1 */
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data, error } = await admin.rpc('connect4_leaderboard', { p_since: since })
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
    const { data } = await admin
      .from('connect4_games')
      .select('red_id, gold_id, updated_at')
      .or(`red_id.eq.${actor.id},gold_id.eq.${actor.id}`)
      .order('updated_at', { ascending: false })
      .limit(200)

    const tally = new Map<string, number>()
    for (const g of data ?? []) {
      const foe = g.red_id === actor.id ? g.gold_id : g.red_id
      tally.set(foe, (tally.get(foe) ?? 0) + 1)
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const names = await loadNames(admin, top.map(([uid]) => uid))

    return ok({
      opponents: top.map(([uid, n]) => ({ id: uid, name: names.get(uid) ?? '', games: n })),
    })
  }

  if (id) {
    const { data, error } = await admin
      .from('connect4_games')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('ROOM_NOT_FOUND')

    /* ★ คนนอกเกมดูไม่ได้ — ตรวจที่ server ไม่ใช่ซ่อนลิงก์ใน UI */
    if (data.red_id !== actor.id && data.gold_id !== actor.id) {
      throw new AppError('FORBIDDEN')
    }

    const names = await loadNames(admin, [data.red_id, data.gold_id])
    return ok({ game: shape(data, actor.id, names) })
  }

  const [{ data: games }, { data: challenges }] = await Promise.all([
    admin
      .from('connect4_games')
      .select('*')
      .or(`red_id.eq.${actor.id},gold_id.eq.${actor.id}`)
      .eq('status', 'PLAYING')
      .order('updated_at', { ascending: false })
      .limit(20),
    admin
      .from('game_challenges')
      .select('id, game, from_id, to_id, status, expires_at, game_id')
      /* ★ กรองชนิดเกม — ตารางคำท้าเป็นของกลางทุกเกม */
      .eq('game', 'connect4')
      .eq('to_id', actor.id)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const ids = new Set<string>()
  for (const g of games ?? []) {
    ids.add(g.red_id)
    ids.add(g.gold_id)
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
    /* ★ คอลัมน์เท่านั้น — แถวที่เหรียญตกไม่ใช่สิ่งที่ผู้เล่นเลือกได้ */
    col: z.number().int().min(0).max(COLS - 1),
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
      p_game: 'connect4',
      p_to: body.to,
    })
    if (error) throw fromPostgresError(error)
    return ok({ challengeId: data as string })
  }

  if (body.action === 'accept') {
    const { data, error } = await admin.rpc('connect4_accept', {
      p_actor: actor.id,
      p_id: body.challengeId,
      /* ★ กระดานเริ่มต้นสร้างที่ server — ไม่รับจาก client */
      p_board: emptyBoard(),
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
    const { data, error } = await admin.rpc('connect4_rematch', {
      p_actor: actor.id,
      p_game: body.gameId,
      p_board: emptyBoard(),
    })
    if (error) throw fromPostgresError(error)
    return ok({ gameId: data as string })
  }

  if (body.action === 'end') {
    const { data, error } = await admin.rpc('connect4_end', {
      p_actor: actor.id,
      p_game: body.gameId,
      p_action: body.kind,
    })
    if (error) throw fromPostgresError(error)
    const g = data as Connect4Row
    const names = await loadNames(admin, [g.red_id, g.gold_id])
    return ok({ game: shape(g, actor.id, names) })
  }

  /* ── หยอดเหรียญ ───────────────────────────────────────────────── */
  await enforceRateLimit('gameMove', actor.id)

  const { data: row, error: readError } = await admin
    .from('connect4_games')
    .select('*')
    .eq('id', body.gameId)
    .maybeSingle()

  if (readError) throw fromPostgresError(readError)
  if (!row) throw new AppError('ROOM_NOT_FOUND')

  const me: Player | null = row.red_id === actor.id ? 1 : row.gold_id === actor.id ? 2 : null
  if (!me) throw new AppError('FORBIDDEN')

  /*
   * ★★★ ด่านกติกาฝั่ง server
   *
   *     ★ ใช้ play() จาก lib/games/connect4 — โมดูลเดียวกับที่หน้าจอใช้
   *       ตัดสินว่าคอลัมน์ไหนยังหยอดได้ ★★ จึงไม่มีทางที่สองฝั่งตัดสินต่างกัน
   *     ★ client ส่งมาแค่ "คอลัมน์ไหน" ซึ่งเป็นเจตนา ไม่ใช่ผลลัพธ์
   *       ★★ แถวที่ตก · กระดานใหม่ · แถวที่ชนะ คำนวณที่นี่ทั้งหมด
   */
  const board = row.board as Board
  const dropped = play(board, body.col, me)
  /* ★ null = คอลัมน์เต็ม ซึ่งหน้าจอกันไว้แล้ว แต่ไม่เชื่อหน้าจอ */
  if (!dropped) throw new AppError('VALIDATION_FAILED')

  const result = outcome(dropped.board)
  const finished = result.kind !== 'PLAYING'
  const winnerId =
    result.kind === 'WIN' ? (result.player === 1 ? row.red_id : row.gold_id) : null

  const { data, error } = await admin.rpc('connect4_play', {
    p_actor: actor.id,
    p_game: body.gameId,
    p_version: body.version,
    p_col: body.col,
    p_cell: dropped.index,
    p_board: dropped.board,
    /*
     * ★★ เกมจบแล้วไม่ต้องสลับตา — คงไว้ที่คนที่เพิ่งหยอด
     *    ★ สลับแล้วหน้าจอของฝ่ายที่แพ้จะขึ้นว่า "ตาคุณ" ค้างอยู่ใต้ป๊อปอัปจบเกม
     */
    p_turn: finished ? me : other(me),
    p_status: finished ? 'FINISHED' : 'PLAYING',
    p_winner: winnerId,
    p_reason: finished ? (result.kind === 'DRAW' ? 'DRAW' : 'WIN') : null,
    p_win: result.kind === 'WIN' ? result.cells : [],
  })

  if (error) throw fromPostgresError(error)
  const g = data as Connect4Row
  const names = await loadNames(admin, [g.red_id, g.gold_id])
  return ok({ game: shape(g, actor.id, names) })
})

/* ═══════════════════════════════════════════════════════════════════ */

type Connect4Row = {
  id: string
  red_id: string
  gold_id: string
  board: unknown
  turn: Player
  version: number
  status: string
  winner_id: string | null
  end_reason: string | null
  last_cell: number | null
  win_cells: number[]
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
 * ★★ คำนวณ "ฉันเป็นผู้เล่นหมายเลขไหน" และ "คู่ต่อสู้คือใคร" ที่ server
 *    ★ หน้าจอไม่ต้องเทียบ id เอง ซึ่งเป็นที่ที่พลาดแล้วผู้เล่นจะหยอดแทน
 *      อีกฝ่ายได้ในหน้าจอตัวเอง (แล้วค่อยถูก server ปฏิเสธ)
 */
function shape(g: Connect4Row, me: string, names: Map<string, string>) {
  const myPlayer: Player = g.red_id === me ? 1 : 2
  const red = { id: g.red_id, name: names.get(g.red_id) ?? '' }
  const gold = { id: g.gold_id, name: names.get(g.gold_id) ?? '' }
  return {
    id: g.id,
    board: g.board,
    turn: g.turn,
    version: g.version,
    status: g.status,
    myPlayer,
    myTurn: g.status === 'PLAYING' && g.turn === myPlayer,
    lastCell: g.last_cell,
    winCells: g.win_cells ?? [],
    winnerId: g.winner_id,
    endReason: g.end_reason,
    /** ★ "อีกฝ่ายขอเสมอ" ไม่ใช่ "มีคนขอเสมอ" — หน้าจอต้องรู้ว่าควรขึ้นปุ่มรับไหม */
    drawOfferFromOpponent: g.draw_offer_by !== null && g.draw_offer_by !== me,
    red,
    gold,
    opponent: myPlayer === 1 ? gold : red,
    updatedAt: g.updated_at,
  }
}
