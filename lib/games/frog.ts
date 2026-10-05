/**
 * กบพ่นบอล (แนวเกมโซ่บอลวิ่งเข้าหลุม) — รางเกลียว + กติกาโซ่บอล ล้วน ๆ ไม่แตะ React
 *
 * ★ โลกเป็นสี่เหลี่ยม 100×100 หน่วย · บอลเส้นผ่านศูนย์กลาง D · กบอยู่กลาง
 * ★ รางเป็นเกลียวอาร์คิมิดีสจากขอบนอกวนเข้าหาหลุมใกล้กลาง — เก็บเป็นจุดถี่ ๆ + ตารางระยะทางสะสม
 *   ตำแหน่งบอลบนรางเก็บเป็น "ระยะทางตามราง" (s) ไม่ใช่พิกัด — ดัน ดึง แทรก จึงเป็นแค่บวกลบตัวเลข
 */

export const SIZE = 100
export const D = 6
export const FROG = { x: 50, y: 50 }
export type Level = 'EASY' | 'MEDIUM' | 'HARD'

export const LEVEL: Record<Level, { colors: number; balls: number; speed: number }> = {
  EASY: { colors: 4, balls: 50, speed: 2.6 },
  MEDIUM: { colors: 5, balls: 70, speed: 3.4 },
  HARD: { colors: 6, balls: 90, speed: 4.4 },
}

export type Track = { pts: { x: number; y: number }[]; len: number[]; total: number }

/** เกลียวจากรัศมี 44 วนเข้าไปรัศมี 21 ราว 1.65 รอบ — ระยะห่างระหว่างวง ~14 หน่วย บอลไม่ทับกัน */
export function makeTrack(): Track {
  const Ro = 44
  const Ri = 21
  const turns = 1.65
  const theta0 = -Math.PI * 0.62
  const pts: { x: number; y: number }[] = []
  const N = 900
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const r = Ro - (Ro - Ri) * t
    const th = theta0 + t * turns * Math.PI * 2
    pts.push({ x: SIZE / 2 + Math.cos(th) * r, y: SIZE / 2 + Math.sin(th) * r })
  }
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  return { pts, len, total: len[len.length - 1]! }
}

/** พิกัด + มุมสัมผัส ณ ระยะ s บนราง (นอกช่วงจะยืดเป็นเส้นตรงจากปลาย) */
export function posAt(tr: Track, s: number): { x: number; y: number; a: number } {
  const { pts, len, total } = tr
  if (s <= 0) {
    const a = Math.atan2(pts[1]!.y - pts[0]!.y, pts[1]!.x - pts[0]!.x)
    return { x: pts[0]!.x + Math.cos(a) * s, y: pts[0]!.y + Math.sin(a) * s, a }
  }
  if (s >= total) {
    const n = pts.length - 1
    const a = Math.atan2(pts[n]!.y - pts[n - 1]!.y, pts[n]!.x - pts[n - 1]!.x)
    return { x: pts[n]!.x, y: pts[n]!.y, a }
  }
  let lo = 0
  let hi = len.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (len[m]! <= s) lo = m
    else hi = m
  }
  const k = (s - len[lo]!) / (len[hi]! - len[lo]! || 1)
  const p = pts[lo]!
  const q = pts[hi]!
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, a: Math.atan2(q.y - p.y, q.x - p.x) }
}

export type Ball = { id: number; color: number; s: number; grow: number; check: boolean }

/** หาช่วงบอลสีเดียวกันที่ติดกันรอบตำแหน่ง i — ติดกัน = ระยะไม่เกิน D นิดหน่อย */
export function runAround(chain: Ball[], i: number): [number, number] {
  const c = chain[i]!.color
  let a = i
  let b = i
  while (a > 0 && chain[a - 1]!.color === c && chain[a]!.s - chain[a - 1]!.s <= D * 1.08) a--
  while (b < chain.length - 1 && chain[b + 1]!.color === c && chain[b + 1]!.s - chain[b]!.s <= D * 1.08) b++
  return [a, b]
}
