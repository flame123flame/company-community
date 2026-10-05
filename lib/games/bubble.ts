/**
 * ยิงบอลสี (Bubble Shooter) — ตารางรังผึ้ง กติกาจับคู่ และการหาบอลลอย ล้วน ๆ ไม่แตะ React
 *
 * ★ หน่วยเป็น "รัศมีบอล" (R = 1) ทั้งหมด — หน้าจอค่อยคูณขนาดจริงตอนวาด
 * ★ ตารางแบบรังผึ้ง: แถวคี่เยื้องขวาครึ่งลูกและมีน้อยกว่าหนึ่งช่อง
 *   shift = ความคี่คู่ของแถวบนสุด — เพิ่มแถวใหม่ด้านบนแล้วสลับค่า ตำแหน่งบอลเดิมจึงไม่ขยับข้าง
 */

export const COLS = 11
export const ROWS = 14
export const R = 1
export const ROW_H = Math.sqrt(3)
export const WIDTH = COLS * 2 * R
/** เส้นอันตราย — บอลติดถึงแถวนี้ = แพ้ */
export const DANGER_ROW = 12
export const HEIGHT = R + DANGER_ROW * ROW_H + 5.2 * R
export const SHOOTER = { x: WIDTH / 2, y: HEIGHT - 2.2 * R }

export type Grid = number[][]
export type Board = { grid: Grid; shift: 0 | 1 }
export type Cell = { r: number; c: number }
export type Level = 'EASY' | 'MEDIUM' | 'HARD'

export const LEVEL: Record<Level, { rows: number; colors: number; dropEvery: number }> = {
  EASY: { rows: 5, colors: 4, dropEvery: 8 },
  MEDIUM: { rows: 6, colors: 5, dropEvery: 6 },
  HARD: { rows: 7, colors: 6, dropEvery: 5 },
}

export const isOdd = (b: Board, r: number) => ((r + b.shift) & 1) === 1
export const rowLen = (b: Board, r: number) => (isOdd(b, r) ? COLS - 1 : COLS)
export const cellXY = (b: Board, r: number, c: number) => ({ x: R + c * 2 * R + (isOdd(b, r) ? R : 0), y: R + r * ROW_H })
export const get = (b: Board, r: number, c: number) => (r >= 0 && r < ROWS && c >= 0 && c < rowLen(b, r) ? b.grid[r]![c]! : -2)

export function neighbors(b: Board, r: number, c: number): Cell[] {
  const d = isOdd(b, r)
    ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
  return d.map(([dr, dc]) => ({ r: r + dr!, c: c + dc! })).filter((n) => get(b, n.r, n.c) !== -2)
}

export function newBoard(level: Level, rnd: () => number = Math.random): Board {
  const { rows, colors } = LEVEL[level]
  const b: Board = { grid: Array.from({ length: ROWS }, () => Array(COLS).fill(-1)), shift: 0 }
  for (let r = 0; r < rows; r++) for (let c = 0; c < rowLen(b, r); c++) b.grid[r]![c] = Math.floor(rnd() * colors)
  return b
}

/** เพิ่มแถวใหม่ด้านบน (เพดานเลื่อนลง) — สุ่มเฉพาะสีที่ยังเหลือบนกระดาน */
export function addRow(b: Board, palette: number[], rnd: () => number = Math.random): Board {
  const shift = (b.shift ^ 1) as 0 | 1
  const next: Board = { grid: [Array(COLS).fill(-1), ...b.grid.slice(0, ROWS - 1).map((row) => row.slice())], shift }
  const pal = palette.length ? palette : [0, 1, 2]
  for (let c = 0; c < rowLen(next, 0); c++) next.grid[0]![c] = pal[Math.floor(rnd() * pal.length)]!
  return next
}

/** ช่องว่างที่บอลที่บินมาจะไปติด — ต้องติดเพดานหรือติดบอลอื่น */
export function snapCell(b: Board, x: number, y: number): Cell {
  const rGuess = Math.max(0, Math.min(ROWS - 1, Math.round((y - R) / ROW_H)))
  let best: Cell | null = null
  let bestD = Infinity
  for (let r = Math.max(0, rGuess - 1); r <= Math.min(ROWS - 1, rGuess + 1); r++) {
    for (let c = 0; c < rowLen(b, r); c++) {
      if (b.grid[r]![c] !== -1) continue
      const attached = r === 0 || neighbors(b, r, c).some((n) => get(b, n.r, n.c) >= 0)
      if (!attached) continue
      const p = cellXY(b, r, c)
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestD) {
        bestD = d
        best = { r, c }
      }
    }
  }
  return best ?? { r: rGuess, c: Math.max(0, Math.min(rowLen(b, rGuess) - 1, Math.round((x - R) / (2 * R)))) }
}

export function cluster(b: Board, start: Cell): Cell[] {
  const color = get(b, start.r, start.c)
  const seen = new Set([`${start.r},${start.c}`])
  const out: Cell[] = [start]
  for (let i = 0; i < out.length; i++) {
    for (const n of neighbors(b, out[i]!.r, out[i]!.c)) {
      const k = `${n.r},${n.c}`
      if (seen.has(k) || get(b, n.r, n.c) !== color) continue
      seen.add(k)
      out.push(n)
    }
  }
  return out
}

/** บอลที่ไม่ได้ต่อถึงเพดานแล้ว — จะร่วงลงมา */
export function floating(b: Board): Cell[] {
  const seen = new Set<string>()
  const queue: Cell[] = []
  for (let c = 0; c < rowLen(b, 0); c++) {
    if (b.grid[0]![c]! >= 0) {
      seen.add(`0,${c}`)
      queue.push({ r: 0, c })
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors(b, queue[i]!.r, queue[i]!.c)) {
      const k = `${n.r},${n.c}`
      if (seen.has(k) || get(b, n.r, n.c) < 0) continue
      seen.add(k)
      queue.push(n)
    }
  }
  const out: Cell[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < rowLen(b, r); c++) if (b.grid[r]![c]! >= 0 && !seen.has(`${r},${c}`)) out.push({ r, c })
  return out
}

export function palette(b: Board): number[] {
  const s = new Set<number>()
  for (const row of b.grid) for (const v of row) if (v >= 0) s.add(v)
  return [...s]
}

export function lowestRow(b: Board): number {
  for (let r = ROWS - 1; r >= 0; r--) if (b.grid[r]!.some((v) => v >= 0)) return r
  return -1
}

/**
 * จำลองเส้นทางบอล (สะท้อนผนังซ้ายขวา) จนชนเพดานหรือบอล — ใช้ทั้งเส้นเล็งและการบินจริง
 * คืนจุดตามทางเป็นระยะ ๆ และจุดที่หยุด
 */
export function trace(b: Board, angle: number, step = 0.2, maxLen = 60) {
  let x = SHOOTER.x
  let y = SHOOTER.y
  let vx = Math.cos(angle)
  const vy = -Math.sin(angle)
  const path: { x: number; y: number }[] = []
  for (let t = 0; t < maxLen; t += step) {
    x += vx * step
    y += vy * step
    if (x < R) {
      x = 2 * R - x
      vx = -vx
    } else if (x > WIDTH - R) {
      x = 2 * (WIDTH - R) - x
      vx = -vx
    }
    path.push({ x, y })
    if (hits(b, x, y)) break
  }
  return { path, end: { x, y } }
}

export function hits(b: Board, x: number, y: number): boolean {
  if (y <= R) return true
  const rGuess = Math.round((y - R) / ROW_H)
  for (let r = Math.max(0, rGuess - 1); r <= Math.min(ROWS - 1, rGuess + 1); r++) {
    for (let c = 0; c < rowLen(b, r); c++) {
      if (b.grid[r]![c]! < 0) continue
      const p = cellXY(b, r, c)
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < (1.75 * R) ** 2) return true
    }
  }
  return false
}
