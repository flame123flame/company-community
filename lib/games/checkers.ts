/**
 * กติกาหมากฮอสไทย — โมดูลล้วน ไม่ผูกกับ UI และไม่ผูกกับฐานข้อมูล
 *
 * ★★★ ข้อกำหนดสั่งตรง ๆ ว่า "ให้แยก logic กติกาเป็นโมดูลที่ทดสอบได้
 *     (unit test) ไม่ผูกกับ UI"
 *
 *     ★ เหตุผลที่หนักกว่าความสะอาดของโค้ด: กติกาชุดนี้ต้องถูกใช้ "สองที่"
 *       — ในเบราว์เซอร์ (ไฮไลต์ช่องที่เดินได้) และบน server (ตรวจว่าตาเดิน
 *       ที่ส่งมาถูกกติกาจริง)
 *       ★★ ข้อกำหนดข้อ 2.4 เขียนว่า "ห้ามเชื่อข้อมูลจากฝั่ง client
 *          อย่างเดียว" ซึ่งแปลว่าต้องมีตัวตัดสินอีกชุดที่ฝั่ง server
 *          ★ ถ้ากติกาสองฝั่งเป็นคนละโค้ด มันจะค่อย ๆ ต่างกัน แล้วผู้เล่น
 *            จะเจอตาเดินที่หน้าจอบอกว่าได้ แต่ server ปฏิเสธ
 *
 * ── รูปแบบกระดาน ────────────────────────────────────────────────────
 * ★ เก็บเป็น array ยาว 64 ช่อง index 0 = มุมซ้ายบน (แถว 0 คอลัมน์ 0)
 *   ★★ ใช้ array แบนไม่ใช่ array ซ้อน เพราะมันถูกส่งข้ามเครือข่ายและ
 *      เก็บลงฐานข้อมูลเป็น JSON — รูปแบบแบนอ่าน/เทียบง่ายกว่ามาก
 */

/** ช่องว่าง */
export const EMPTY = 0
/** เบี้ยฝ่ายล่าง (เดินขึ้น — แถว index ลดลง) */
export const B_MAN = 1
/** ฮอสฝ่ายล่าง */
export const B_KING = 2
/** เบี้ยฝ่ายบน (เดินลง — แถว index เพิ่มขึ้น) */
export const W_MAN = -1
/** ฮอสฝ่ายบน */
export const W_KING = -2

export type Cell = typeof EMPTY | typeof B_MAN | typeof B_KING | typeof W_MAN | typeof W_KING
export type Board = Cell[]

/** BOTTOM = ฝ่ายที่อยู่แถวล่างของกระดาน (เดินขึ้น) */
export type Side = 'BOTTOM' | 'TOP'

export type Move = {
  from: number
  to: number
  /** ช่องของตัวที่ถูกกินในตานี้ — ว่าง = ตาเดินธรรมดา */
  captured: number[]
  /** ตานี้ทำให้เลื่อนขั้นเป็นฮอสไหม */
  promoted: boolean
}

export const SIZE = 8

export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE

/**
 * ช่องนี้เป็นช่องสีเข้มไหม — เดินได้เฉพาะช่องสีเข้ม
 *
 * ★ (row + col) คี่ = ช่องเข้ม ซึ่งเป็นข้อตกลงที่ต้องตรงกับที่ UI วาด
 *   ★★ ถ้าสองฝั่งนิยามไม่ตรงกัน หมากจะถูกวาดบนช่องสว่างทั้งกระดาน
 *      และทุกอย่างจะ "ทำงาน" อยู่ แค่ดูผิดไปทั้งหมด
 */
export const isDark = (i: number) => (rowOf(i) + colOf(i)) % 2 === 1

export const sideOf = (c: Cell): Side | null =>
  c === B_MAN || c === B_KING ? 'BOTTOM' : c === W_MAN || c === W_KING ? 'TOP' : null

export const isKing = (c: Cell) => c === B_KING || c === W_KING

/** กระดานเริ่มต้น — ฝ่ายละ 8 ตัวบน 2 แถวแรกของแต่ละฝั่ง */
export function initialBoard(): Board {
  const b: Board = Array.from({ length: SIZE * SIZE }, () => EMPTY as Cell)
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!isDark(i)) continue
    const r = rowOf(i)
    /* ★ 2 แถวแรกของแต่ละฝั่ง = 8 ตัวพอดี (4 ช่องเข้มต่อแถว) ตามข้อกำหนด */
    if (r <= 1) b[i] = W_MAN
    else if (r >= SIZE - 2) b[i] = B_MAN
  }
  return b
}

/** ทิศทแยงทั้งสี่ — [แถว, คอลัมน์] */
const DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** แปลง (แถว, คอลัมน์) เป็น index — นอกกระดานคืน -1 */
function at(r: number, c: number): number {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1
  return r * SIZE + c
}

/**
 * เบี้ยเดินหน้าไปทางไหน
 *
 * ★ BOTTOM อยู่แถวล่าง จึงเดินขึ้น = แถวลดลง
 */
const forwardOf = (side: Side) => (side === 'BOTTOM' ? -1 : 1)

/**
 * ตาเดินธรรมดา (ไม่กิน) ของหมากที่ช่อง from
 *
 * ★★ เบี้ยเดินทแยงไปข้างหน้าทีละ 1 ช่อง — ห้ามถอยหลัง
 *    ฮอสเดินทแยงได้หลายช่องทั้งเดินหน้าและถอยหลัง
 */
function quietMoves(board: Board, from: number): Move[] {
  const piece = board[from] as Cell
  const side = sideOf(piece)
  if (!side) return []

  const out: Move[] = []
  const r = rowOf(from)
  const c = colOf(from)

  for (const [dr, dc] of DIRS) {
    /* ★ เบี้ยเดินได้เฉพาะทางหน้า — ตัดทิศถอยหลังทิ้งตั้งแต่ตรงนี้ */
    if (!isKing(piece) && dr !== forwardOf(side)) continue

    /* ★ เบี้ยไปได้ 1 ช่อง · ฮอสไปได้เรื่อย ๆ จนกว่าจะชน */
    const reach = isKing(piece) ? SIZE - 1 : 1
    for (let step = 1; step <= reach; step++) {
      const to = at(r + dr * step, c + dc * step)
      if (to === -1) break
      if (board[to] !== EMPTY) break
      out.push({ from, to, captured: [], promoted: willPromote(piece, to) })
    }
  }
  return out
}

/** ไปถึงแถวสุดท้ายของฝั่งตรงข้ามแล้วเลื่อนขั้นไหม */
function willPromote(piece: Cell, to: number): boolean {
  if (isKing(piece)) return false
  const side = sideOf(piece)
  if (side === 'BOTTOM') return rowOf(to) === 0
  if (side === 'TOP') return rowOf(to) === SIZE - 1
  return false
}

/**
 * ตากินทั้งหมดของหมากที่ช่อง from (รวมการกินต่อเนื่อง)
 *
 * ★★★ กินต่อเนื่องต้องคิดแบบ "เดินต่อจากสถานะหลังกิน" ไม่ใช่หาคู่กินทีละคู่
 *
 *     ★ ตัวที่ถูกกินไปแล้วต้องหายออกจากกระดานก่อนมองหาตาถัดไป
 *       ไม่งั้นมันจะถูกนับเป็นตัวขวางของตัวเอง
 *     ★★ และต้องไม่กินตัวเดิมซ้ำในตาเดียว ซึ่งเกิดได้กับฮอสที่วนกลับมา
 */
function captureMoves(board: Board, from: number): Move[] {
  const piece = board[from] as Cell
  const side = sideOf(piece)
  if (!side) return []

  const results: Move[] = []

  const walk = (pos: number, cur: Board, taken: number[], promotedAlready: boolean) => {
    const p = cur[pos] as Cell
    const r = rowOf(pos)
    const c = colOf(pos)
    let extended = false

    for (const [dr, dc] of DIRS) {
      /* ★★ เบี้ยกินได้เฉพาะทางข้างหน้า — ข้อกำหนดระบุไว้ชัด */
      if (!isKing(p) && dr !== forwardOf(side)) continue

      /* ★ ฮอสมองไกลได้ แต่ต้องเจอ "ช่องว่างล้วนจนถึงตัวที่จะกิน" */
      const reach = isKing(p) ? SIZE - 1 : 1
      let victim = -1

      for (let step = 1; step <= reach; step++) {
        const sq = at(r + dr * step, c + dc * step)
        if (sq === -1) break
        const cell = cur[sq] as Cell

        if (cell === EMPTY) continue
        /* เจอตัวแรกที่ไม่ว่าง */
        if (sideOf(cell) === side) break
        if (taken.includes(sq)) break
        victim = sq
        break
      }

      if (victim === -1) continue

      /*
       * ★★★ ฮอสที่กินต้องลงช่อง "ถัดจากตัวที่ถูกกินทันที" — ข้อกำหนดระบุชัด
       *
       *     ★ หมากฮอสสากลให้ฮอสลงได้ทุกช่องว่างหลังเหยื่อ แต่ของไทยไม่ใช่
       *       ★★ ถ้าทำตามสากล ฮอสจะแข็งเกินไปมาก และคนเล่นจะบอกว่า
       *          "เกมนี้กติกาผิด" ซึ่งถูกของเขา
       */
      const vr = rowOf(victim)
      const vc = colOf(victim)
      const landing = at(vr + dr, vc + dc)
      if (landing === -1) continue
      if (cur[landing] !== EMPTY) continue

      const next: Board = [...cur]
      next[pos] = EMPTY
      next[victim] = EMPTY

      const promotes = !promotedAlready && willPromote(p, landing)
      /*
       * ★★ เลื่อนขั้นกลางทางแล้วกินต่อด้วยสิทธิ์ฮอสทันทีไหม
       *    ★ กติกาไทยไม่ให้ — เบี้ยที่ถึงแถวสุดท้ายระหว่างกินต่อเนื่อง
       *      จะกลายเป็นฮอสเมื่อ "ตาจบ" ไม่ใช่กลางคัน
       *      ★★ จึงวางตัวเดิมลงไปก่อน แล้วค่อยเลื่อนขั้นตอนปิดตา
       */
      next[landing] = p

      const nextTaken = [...taken, victim]
      extended = true
      walk(landing, next, nextTaken, promotedAlready || promotes)
    }

    /* ★ กินต่อไม่ได้แล้วและกินมาแล้วอย่างน้อยหนึ่งตัว = ตานี้จบ */
    if (!extended && taken.length > 0) {
      results.push({
        from,
        to: pos,
        captured: taken,
        promoted: promotedAlready || willPromote(piece, pos),
      })
    }
  }

  walk(from, board, [], false)
  return results
}

/**
 * ตาเดินที่ถูกกติกาทั้งหมดของฝ่ายนี้
 *
 * ★★★ บังคับกิน: ถ้ามีตากินอยู่ ต้องกิน — ตาเดินธรรมดาถูกตัดทิ้งทั้งหมด
 *     ★ ปิดได้ผ่าน forceCapture = false ตามข้อกำหนด ("มีตัวเลือกปิดได้")
 */
export function legalMoves(board: Board, side: Side, forceCapture = true): Move[] {
  const quiet: Move[] = []
  const caps: Move[] = []

  for (let i = 0; i < board.length; i++) {
    if (sideOf(board[i] as Cell) !== side) continue
    caps.push(...captureMoves(board, i))
    quiet.push(...quietMoves(board, i))
  }

  if (forceCapture && caps.length > 0) return caps
  return [...caps, ...quiet]
}

/**
 * เดินหนึ่งตา — คืนกระดานใหม่ ไม่แก้ของเดิม
 *
 * ★ ไม่ตรวจว่าถูกกติกาไหม ผู้เรียกต้องเลือกจาก legalMoves เสมอ
 *   ★★ แยกหน้าที่ "ตรวจ" กับ "ลงมือ" ออกจากกัน ทำให้บอทลองเดินเป็นพัน ๆ ตา
 *      ได้โดยไม่ต้องตรวจซ้ำทุกครั้ง
 */
export function applyMove(board: Board, move: Move): Board {
  const next = [...board]
  const piece = next[move.from] as Cell
  next[move.from] = EMPTY
  for (const v of move.captured) next[v] = EMPTY

  if (move.promoted) {
    next[move.to] = sideOf(piece) === 'BOTTOM' ? B_KING : W_KING
  } else {
    next[move.to] = piece
  }
  return next
}

/** ตาเดินที่ส่งมา ตรงกับตาที่ถูกกติกาอันไหนไหม — ใช้ตรวจฝั่ง server */
export function findLegal(
  board: Board,
  side: Side,
  from: number,
  to: number,
  forceCapture = true,
): Move | null {
  /*
   * ★★ เทียบแค่ from/to ไม่พอเมื่อมีทางกินต่อเนื่องหลายเส้นที่จบที่ช่องเดียวกัน
   *    ★ แต่ทั้งสองเส้นกินจำนวนเท่ากันเสมอหรือไม่ก็ได้ — เลือกเส้นที่กินมากสุด
   *      ★★ เป็นการเลือกที่เข้าข้างผู้เล่น และไม่มีทางทำให้ตาที่เขาเห็น
   *         บนจอกลายเป็นตาที่ผิดกติกา
   */
  const all = legalMoves(board, side, forceCapture).filter((m) => m.from === from && m.to === to)
  if (all.length === 0) return null
  return all.reduce((best, m) => (m.captured.length > best.captured.length ? m : best))
}

export type Outcome =
  | { kind: 'PLAYING' }
  | { kind: 'WIN'; side: Side }
  | { kind: 'DRAW'; reason: 'NO_CAPTURE' | 'AGREED' }

/** ไม่มีการกินติดต่อกันกี่ตาถือว่าเสมอ — ตามข้อกำหนด */
export const DRAW_AFTER_QUIET_PLIES = 30

/**
 * ผลของกระดาน ณ ตอนนี้
 *
 * ★★ "ไม่มีตัวเหลือ" กับ "ไม่มีตาเดินได้" ให้ผลเดียวกันคือแพ้ — ตามข้อกำหนด
 *    ★ ฝ่ายที่ถูกล้อมจนเดินไม่ได้แพ้ ไม่ใช่เสมอ ซึ่งเป็นกติกาไทย
 */
export function outcome(
  board: Board,
  turn: Side,
  quietPlies: number,
  forceCapture = true,
): Outcome {
  if (quietPlies >= DRAW_AFTER_QUIET_PLIES) return { kind: 'DRAW', reason: 'NO_CAPTURE' }

  const mine = board.filter((c) => sideOf(c) === turn).length
  if (mine === 0) return { kind: 'WIN', side: turn === 'BOTTOM' ? 'TOP' : 'BOTTOM' }

  if (legalMoves(board, turn, forceCapture).length === 0) {
    return { kind: 'WIN', side: turn === 'BOTTOM' ? 'TOP' : 'BOTTOM' }
  }
  return { kind: 'PLAYING' }
}

/* ═══════════════════════════════════════════════════════════════════
 * บอท — minimax + alpha-beta
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * คะแนนกระดานจากมุมมองของ BOTTOM
 *
 * ★ ฮอสมีค่ามากกว่าเบี้ยหลายเท่า และเบี้ยที่ใกล้แถวเลื่อนขั้นมีค่ามากขึ้น
 *   ★★ ถ้าให้คะแนนแค่ "จำนวนตัว" บอทจะไม่มีเหตุผลที่จะเดินไปข้างหน้าเลย
 *      แล้วมันจะยืนนิ่งจนเสมอทุกเกม ซึ่งน่าเบื่อกว่าบอทที่เล่นแย่
 */
export function evaluate(board: Board): number {
  let score = 0
  for (let i = 0; i < board.length; i++) {
    const c = board[i] as Cell
    if (c === EMPTY) continue
    const side = sideOf(c)!
    const base = isKing(c) ? 14 : 5
    /* ระยะถึงแถวเลื่อนขั้น — ยิ่งใกล้ยิ่งมีค่า */
    const advance = isKing(c) ? 0 : side === 'BOTTOM' ? SIZE - 1 - rowOf(i) : rowOf(i)
    const v = base + advance * 0.3
    score += side === 'BOTTOM' ? v : -v
  }
  return score
}

/** ความลึกของการค้นหาตามระดับความยาก — ตามข้อกำหนด (ง่าย/กลาง/ยาก) */
export const BOT_DEPTH = { EASY: 1, MEDIUM: 4, HARD: 6 } as const
export type BotLevel = keyof typeof BOT_DEPTH

function search(
  board: Board,
  turn: Side,
  depth: number,
  alpha: number,
  beta: number,
  forceCapture: boolean,
): number {
  if (depth === 0) return evaluate(board)

  const moves = legalMoves(board, turn, forceCapture)
  /* ★ เดินไม่ได้ = แพ้ ให้คะแนนสุดขั้วแต่ไม่ใช่ Infinity
       ★★ Infinity ทำให้เทียบ "แพ้ในสองตา" กับ "แพ้ในสิบตา" ไม่ออก
          บอทจึงไม่มีเหตุผลที่จะยืดเวลา ซึ่งดูเหมือนมันยอมแพ้เฉย ๆ */
  if (moves.length === 0) return turn === 'BOTTOM' ? -1000 + depth : 1000 - depth

  if (turn === 'BOTTOM') {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(board, m), 'TOP', depth - 1, alpha, beta, forceCapture))
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const m of moves) {
    best = Math.min(best, search(applyMove(board, m), 'BOTTOM', depth - 1, alpha, beta, forceCapture))
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

/**
 * ตาที่บอทเลือก
 *
 * ★★ ระดับง่ายใช้ความลึก 1 ซึ่งแปลว่า "มองแค่ตาเดียว" — ไม่ใช่สุ่ม
 *    ★ บอทที่สุ่มล้วนเดินตาที่ไร้เหตุผลจนคนรู้สึกว่ากำลังเล่นกับของเสีย
 *      ★★ บอทที่โลภแต่ตื้น แพ้ง่ายพอ ๆ กัน แต่ยังดูเหมือนกำลังพยายาม
 *
 * ★ rnd รับเข้ามาเพื่อให้เทสต์คุมการเลือกเมื่อคะแนนเท่ากันได้
 */
export function botMove(
  board: Board,
  turn: Side,
  level: BotLevel,
  forceCapture = true,
  rnd: () => number = Math.random,
): Move | null {
  const moves = legalMoves(board, turn, forceCapture)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0] as Move

  const depth = BOT_DEPTH[level]
  let best: Move[] = []
  let bestScore = turn === 'BOTTOM' ? -Infinity : Infinity

  for (const m of moves) {
    const s = search(applyMove(board, m), turn === 'BOTTOM' ? 'TOP' : 'BOTTOM', depth - 1, -Infinity, Infinity, forceCapture)
    const better = turn === 'BOTTOM' ? s > bestScore : s < bestScore
    if (better) {
      bestScore = s
      best = [m]
    } else if (s === bestScore) {
      best.push(m)
    }
  }

  /* ★ คะแนนเท่ากันหลายตา → สุ่มเลือก ไม่งั้นบอทเดินเหมือนเดิมทุกเกม */
  return best[Math.floor(rnd() * best.length)] as Move
}
