/**
 * หมากรุกไทย (Makruk) — กติกาและบอท ล้วน ๆ ไม่แตะ React
 *
 * ★ กระดาน 8×8 index = row * 8 + col · แถว 0 บนสุด (ฝั่งดำ) · แถว 7 ล่างสุด (ฝั่งขาว เดินก่อน)
 * ★ ตั้งหมากตามมาตรฐาน: ขาว เรือ ม้า โคน ขุน เม็ด โคน ม้า เรือ (ขุนช่อง d1)
 *                       ดำ  เรือ ม้า โคน เม็ด ขุน โคน ม้า เรือ (ขุนช่อง e8)
 *   เบี้ยอยู่แถวที่ 3 (ขาว) และ 6 (ดำ) · ขุนสองฝั่งไม่ประจันหน้ากัน
 *
 * การเดิน
 *   ขุน = 1 ช่องรอบตัว · เม็ด = ทแยง 1 ช่อง · โคน = ทแยง 1 ช่อง หรือตรงไปหน้า 1 ช่อง
 *   ม้า / เรือ = เหมือนหมากรุกสากล · เบี้ย = เดินหน้า 1 ช่อง กินทแยงหน้า (ไม่มีเดินสองช่อง)
 *   เบี้ยถึงแถวที่ 6 ของฝั่งตัวเอง (แถวเบี้ยฝั่งตรงข้าม) → หงายเป็นเม็ด
 *
 * จบเกม
 *   จน (ถูกรุกและไม่มีทางหนี) = แพ้ · อับ (ไม่ถูกรุกแต่ไม่มีตาเดิน) = เสมอ
 *   เหลือขุนสองตัว = เสมอ · ★ การนับแบบย่อ: 64 ตาติดไม่มีการกินหรือเดินเบี้ย = เสมอ
 *   (การนับศักดิ์หมากเต็มรูปแบบซับซ้อนมาก — แบบย่อพอสำหรับเล่นพักเที่ยง)
 */

export type Side = 'W' | 'B'
export type Kind = 'K' | 'M' | 'S' | 'N' | 'R' | 'P'
export type Piece = { id: number; side: Side; kind: Kind; promoted?: boolean }
export type Board = (Piece | null)[]
export type Move = { from: number; to: number; capture: boolean; promote: boolean }
export type BotLevel = 'EASY' | 'MEDIUM' | 'HARD'

export type Game = {
  board: Board
  turn: Side
  /** ตาที่ไม่มีการกินหรือเดินเบี้ย — ใช้นับเสมอแบบย่อ */
  quiet: number
  last: Move | null
  /** หมากที่ถูกกิน แยกตามฝั่งที่เสียไป */
  lost: { W: Piece[]; B: Piece[] }
  plies: number
}

export const QUIET_LIMIT = 128

const BACK_W: Kind[] = ['R', 'N', 'S', 'K', 'M', 'S', 'N', 'R']
const BACK_B: Kind[] = ['R', 'N', 'S', 'M', 'K', 'S', 'N', 'R']

export function newGame(): Game {
  const board: Board = Array(64).fill(null)
  let id = 1
  for (let c = 0; c < 8; c++) {
    board[c] = { id: id++, side: 'B', kind: BACK_B[c]! }
    board[16 + c] = { id: id++, side: 'B', kind: 'P' }
    board[40 + c] = { id: id++, side: 'W', kind: 'P' }
    board[56 + c] = { id: id++, side: 'W', kind: BACK_W[c]! }
  }
  return { board, turn: 'W', quiet: 0, last: null, lost: { W: [], B: [] }, plies: 0 }
}

export const other = (s: Side): Side => (s === 'W' ? 'B' : 'W')
const fwd = (s: Side) => (s === 'W' ? -1 : 1)
const rc = (i: number) => [Math.floor(i / 8), i % 8] as const
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8
/** แถวที่เบี้ยหงาย — แถวเบี้ยของฝั่งตรงข้าม */
const promoteRow = (s: Side) => (s === 'W' ? 2 : 5)

/** ★ เม็ดกับเบี้ยหงายเดินเหมือนกัน */
const kindOf = (p: Piece): Kind => (p.kind === 'P' && p.promoted ? 'M' : p.kind)

const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const
const DIAG_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const
const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

/** ช่องที่หมากตัวนี้ "โจมตี" (ใช้ทั้งสร้างตาเดินและตรวจรุก) */
function attacks(board: Board, i: number, out: number[]) {
  const p = board[i]!
  const [r, c] = rc(i)
  const k = kindOf(p)
  const step = (dr: number, dc: number) => {
    const rr = r + dr
    const cc = c + dc
    if (inside(rr, cc)) out.push(rr * 8 + cc)
  }
  switch (k) {
    case 'K':
      for (const [dr, dc] of KING_D) step(dr, dc)
      break
    case 'M':
      for (const [dr, dc] of DIAG_D) step(dr, dc)
      break
    case 'S':
      for (const [dr, dc] of DIAG_D) step(dr, dc)
      step(fwd(p.side), 0)
      break
    case 'N':
      for (const [dr, dc] of KNIGHT_D) step(dr, dc)
      break
    case 'R':
      for (const [dr, dc] of ROOK_D) {
        let rr = r + dr
        let cc = c + dc
        while (inside(rr, cc)) {
          out.push(rr * 8 + cc)
          if (board[rr * 8 + cc]) break
          rr += dr
          cc += dc
        }
      }
      break
    case 'P':
      step(fwd(p.side), -1)
      step(fwd(p.side), 1)
      break
  }
}

export function inCheck(board: Board, side: Side): boolean {
  const king = board.findIndex((p) => p?.side === side && p.kind === 'K')
  if (king < 0) return false
  const tmp: number[] = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p || p.side === side) continue
    tmp.length = 0
    attacks(board, i, tmp)
    if (tmp.includes(king)) return true
  }
  return false
}

function pseudoMoves(board: Board, side: Side): Move[] {
  const out: Move[] = []
  const tmp: number[] = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p || p.side !== side) continue
    const promoteAt = (to: number) => p.kind === 'P' && !p.promoted && Math.floor(to / 8) === promoteRow(side)
    if (kindOf(p) === 'P') {
      /* เบี้ย: เดินหน้า 1 ช่องเมื่อว่าง · กินทแยงเมื่อมีหมากฝ่ายตรงข้าม */
      const [r, c] = rc(i)
      const rr = r + fwd(side)
      if (inside(rr, c) && !board[rr * 8 + c]) out.push({ from: i, to: rr * 8 + c, capture: false, promote: promoteAt(rr * 8 + c) })
      for (const dc of [-1, 1]) {
        const cc = c + dc
        if (!inside(rr, cc)) continue
        const t = board[rr * 8 + cc]
        if (t && t.side !== side) out.push({ from: i, to: rr * 8 + cc, capture: true, promote: promoteAt(rr * 8 + cc) })
      }
      continue
    }
    tmp.length = 0
    attacks(board, i, tmp)
    for (const to of tmp) {
      const t = board[to]
      if (t && t.side === side) continue
      out.push({ from: i, to, capture: !!t, promote: false })
    }
  }
  return out
}

function apply(board: Board, m: Move): Board {
  const next = board.slice()
  const p = next[m.from]!
  next[m.to] = m.promote ? { ...p, promoted: true } : p
  next[m.from] = null
  return next
}

export function legalMoves(board: Board, side: Side): Move[] {
  return pseudoMoves(board, side).filter((m) => !inCheck(apply(board, m), side))
}

export function play(g: Game, m: Move): Game {
  const moved = g.board[m.from]!
  const captured = g.board[m.to]
  const board = apply(g.board, m)
  const lost = captured ? { ...g.lost, [captured.side]: [...g.lost[captured.side], captured] } : g.lost
  const progress = !!captured || moved.kind === 'P'
  return { board, turn: other(g.turn), quiet: progress ? 0 : g.quiet + 1, last: m, lost, plies: g.plies + 1 }
}

export type Outcome =
  | { kind: 'PLAYING'; check: boolean }
  | { kind: 'MATE'; winner: Side }
  | { kind: 'DRAW'; reason: 'STALEMATE' | 'BARE_KINGS' | 'COUNT' }

export function outcome(g: Game): Outcome {
  const moves = legalMoves(g.board, g.turn)
  const check = inCheck(g.board, g.turn)
  if (moves.length === 0) return check ? { kind: 'MATE', winner: other(g.turn) } : { kind: 'DRAW', reason: 'STALEMATE' }
  if (g.board.every((p) => !p || p.kind === 'K')) return { kind: 'DRAW', reason: 'BARE_KINGS' }
  if (g.quiet >= QUIET_LIMIT) return { kind: 'DRAW', reason: 'COUNT' }
  return { kind: 'PLAYING', check }
}

/* ── บอท ─────────────────────────────────────────────────────────── */

const VALUE: Record<Kind, number> = { K: 0, M: 180, S: 250, N: 300, R: 500, P: 100 }
const valueOf = (p: Piece) => (p.kind === 'P' && p.promoted ? 180 : VALUE[p.kind])

function evaluate(board: Board, me: Side): number {
  let s = 0
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p) continue
    const [r, c] = rc(i)
    /* ★ ศูนย์กลางกระดานมีค่ากว่าขอบ · เบี้ยที่รุกหน้าได้แต้มเพิ่มนิดหน่อย */
    let v = valueOf(p) + (3.5 - Math.abs(3.5 - c)) * 4 + (3.5 - Math.abs(3.5 - r)) * 3
    if (p.kind === 'P' && !p.promoted) v += (p.side === 'W' ? 5 - r : r - 2) * 6
    s += p.side === me ? v : -v
  }
  return s
}

/* ★ เรียงตาที่น่าสนใจก่อน (กินของแพงด้วยของถูก) — alpha-beta ตัดกิ่งได้มากขึ้นหลายเท่า */
function ordered(board: Board, moves: Move[]): Move[] {
  return moves
    .map((m) => ({ m, k: (m.capture ? valueOf(board[m.to]!) * 10 - valueOf(board[m.from]!) : 0) + (m.promote ? 500 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.m)
}

function search(board: Board, depth: number, alpha: number, beta: number, side: Side, me: Side): number {
  const moves = legalMoves(board, side)
  if (moves.length === 0) return inCheck(board, side) ? (side === me ? -100000 - depth : 100000 + depth) : 0
  if (depth === 0) return evaluate(board, me)
  if (side === me) {
    let best = -Infinity
    for (const m of ordered(board, moves)) {
      best = Math.max(best, search(apply(board, m), depth - 1, alpha, beta, other(side), me))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const m of ordered(board, moves)) {
    best = Math.min(best, search(apply(board, m), depth - 1, alpha, beta, other(side), me))
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

export function botMove(g: Game, level: BotLevel, rnd: () => number = Math.random): Move | null {
  const me = g.turn
  const moves = legalMoves(g.board, me)
  if (moves.length === 0) return null
  if (level === 'EASY' && rnd() < 0.35) return moves[Math.floor(rnd() * moves.length)]!
  const depth = level === 'EASY' ? 1 : level === 'MEDIUM' ? 2 : 3
  let bestScore = -Infinity
  let best: Move[] = []
  for (const m of ordered(g.board, moves)) {
    const s = search(apply(g.board, m), depth - 1, -Infinity, Infinity, other(me), me)
    if (s > bestScore + 0.5) {
      bestScore = s
      best = [m]
    } else if (Math.abs(s - bestScore) <= 0.5) best.push(m)
  }
  return best[Math.floor(rnd() * best.length)] ?? moves[0]!
}
