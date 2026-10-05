/**
 * เรียง 4 (Connect Four) — กติกาและบอท ล้วน ๆ ไม่แตะ React
 *
 * ★ กระดาน 7 คอลัมน์ × 6 แถว เก็บเป็นอาร์เรย์แบน 42 ช่อง
 *   index = row * COLS + col · แถว 0 อยู่บนสุด (ตรงกับลำดับวาดบนจอ)
 *   ค่า 0 = ว่าง · 1 = ผู้เล่นคนแรก (แดง) · 2 = ผู้เล่นคนที่สอง (ทอง)
 *
 * ★★ หยอดลงคอลัมน์ = หาช่องว่างที่ต่ำที่สุดของคอลัมน์นั้น — ไม่มีการเลือกแถว
 *
 * ★ บอทใช้ minimax + alpha-beta
 *   EASY   = ลึก 1 + สุ่มพลาดบ่อย (ยังกันแพ้ทันทีบ้าง ไม่โง่จนน่าเบื่อ)
 *   MEDIUM = ลึก 4
 *   HARD   = ลึก 7 เรียงคอลัมน์กลางก่อน (ตัดกิ่งได้เยอะ จบในไม่กี่สิบมิลลิวินาที)
 */

export const COLS = 7
export const ROWS = 6
export type Player = 1 | 2
export type Cell = 0 | Player
export type Board = Cell[]
export type BotLevel = 'EASY' | 'MEDIUM' | 'HARD'

export function emptyBoard(): Board {
  return Array<Cell>(COLS * ROWS).fill(0)
}

export const other = (p: Player): Player => (p === 1 ? 2 : 1)

/** แถวที่เหรียญจะไปตกถ้าหยอดคอลัมน์นี้ — null = คอลัมน์เต็ม */
export function dropRow(board: Board, col: number): number | null {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === 0) return r
  return null
}

export function play(board: Board, col: number, p: Player): { board: Board; index: number } | null {
  const r = dropRow(board, col)
  if (r === null) return null
  const next = board.slice()
  const index = r * COLS + col
  next[index] = p
  return { board: next, index }
}

export function validCols(board: Board): number[] {
  const out: number[] = []
  for (let c = 0; c < COLS; c++) if (board[c] === 0) out.push(c)
  return out
}

const DIRS: [number, number][] = [
  [0, 1], // แนวนอน
  [1, 0], // แนวตั้ง
  [1, 1], // ทแยงลงขวา
  [1, -1], // ทแยงลงซ้าย
]

/** หาแถวที่ชนะ — คืน index ทั้งสี่ (หรือมากกว่า ถ้าเรียงเกินสี่) */
export function winLine(board: Board): { player: Player; cells: number[] } | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r * COLS + c]
      if (!p) continue
      for (const [dr, dc] of DIRS) {
        const cells = [r * COLS + c]
        let rr = r + dr
        let cc = c + dc
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr * COLS + cc] === p) {
          cells.push(rr * COLS + cc)
          rr += dr
          cc += dc
        }
        if (cells.length >= 4) return { player: p, cells }
      }
    }
  }
  return null
}

export type Outcome = { kind: 'PLAYING' } | { kind: 'WIN'; player: Player; cells: number[] } | { kind: 'DRAW' }

export function outcome(board: Board): Outcome {
  const w = winLine(board)
  if (w) return { kind: 'WIN', player: w.player, cells: w.cells }
  if (validCols(board).length === 0) return { kind: 'DRAW' }
  return { kind: 'PLAYING' }
}

/* ── บอท ─────────────────────────────────────────────────────────── */

/** คะแนนของหน้าต่าง 4 ช่อง — มีของเราเยอะและไม่มีของคู่แข่ง = ดี */
function scoreWindow(a: Cell, b: Cell, c: Cell, d: Cell, me: Player): number {
  const w = [a, b, c, d]
  const mine = w.filter((x) => x === me).length
  const theirs = w.filter((x) => x === other(me)).length
  const empty = 4 - mine - theirs
  if (mine === 4) return 1000
  if (mine === 3 && empty === 1) return 6
  if (mine === 2 && empty === 2) return 2
  if (theirs === 3 && empty === 1) return -8
  return 0
}

function evaluate(board: Board, me: Player): number {
  let s = 0
  /* ★ คอลัมน์กลางมีค่าที่สุด — ร่วมแถวชนะได้มากที่สุด */
  for (let r = 0; r < ROWS; r++) if (board[r * COLS + 3] === me) s += 3
  const at = (r: number, c: number) => board[r * COLS + c] as Cell
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 3; c++) s += scoreWindow(at(r, c), at(r, c + 1), at(r, c + 2), at(r, c + 3), me)
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS - 3; r++) s += scoreWindow(at(r, c), at(r + 1, c), at(r + 2, c), at(r + 3, c), me)
  for (let r = 0; r < ROWS - 3; r++)
    for (let c = 0; c < COLS - 3; c++) {
      s += scoreWindow(at(r, c), at(r + 1, c + 1), at(r + 2, c + 2), at(r + 3, c + 3), me)
      s += scoreWindow(at(r + 3, c), at(r + 2, c + 1), at(r + 1, c + 2), at(r, c + 3), me)
    }
  return s
}

const ORDER = [3, 2, 4, 1, 5, 0, 6]

function minimax(board: Board, depth: number, alpha: number, beta: number, turn: Player, me: Player): number {
  const w = winLine(board)
  if (w) return w.player === me ? 100000 + depth : -100000 - depth
  const cols = ORDER.filter((c) => board[c] === 0)
  if (cols.length === 0) return 0
  if (depth === 0) return evaluate(board, me)

  if (turn === me) {
    let best = -Infinity
    for (const c of cols) {
      const n = play(board, c, turn)!
      best = Math.max(best, minimax(n.board, depth - 1, alpha, beta, other(turn), me))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const c of cols) {
    const n = play(board, c, turn)!
    best = Math.min(best, minimax(n.board, depth - 1, alpha, beta, other(turn), me))
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

export function botMove(board: Board, me: Player, level: BotLevel, rnd: () => number = Math.random): number | null {
  const cols = validCols(board)
  if (cols.length === 0) return null

  /* ทุกระดับ: ชนะได้ทันทีก็ชนะ */
  for (const c of cols) if (winLine(play(board, c, me)!.board)?.player === me) return c

  if (level === 'EASY') {
    /* ★ กันแพ้ทันทีแค่ครึ่งหนึ่งของครั้ง — มือใหม่ยังชนะได้ แต่บอทไม่ดูโง่ */
    if (rnd() < 0.5) for (const c of cols) if (winLine(play(board, c, other(me))!.board)) return c
    return cols[Math.floor(rnd() * cols.length)] ?? null
  }

  const depth = level === 'MEDIUM' ? 4 : 7
  let bestScore = -Infinity
  let best: number[] = []
  for (const c of ORDER.filter((x) => cols.includes(x))) {
    const n = play(board, c, me)!
    const s = minimax(n.board, depth - 1, -Infinity, Infinity, other(me), me)
    if (s > bestScore) {
      bestScore = s
      best = [c]
    } else if (s === bestScore) best.push(c)
  }
  /* ★ เสมอกันหลายตา = สุ่มในกลุ่มนั้น เล่นซ้ำแล้วไม่ได้เกมเดิมทุกครั้ง */
  return best[Math.floor(rnd() * best.length)] ?? cols[0] ?? null
}
