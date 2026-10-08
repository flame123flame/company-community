/**
 * ด่านตรวจเกมยิงบอลสี — เน้นเรื่อง "สีต้องแยกออกจากกันได้"
 *
 * รันด้วย:  npx tsx scripts/bubble-test.ts
 *
 * ★★★ ไฟล์นี้เกิดจากบั๊กจริงที่ผู้ใช้เจอเอง
 *
 *     ★ ระดับยากใช้ 6 สี ซึ่งสองสีในนั้นห่างกันแค่ 2 องศาบนวงล้อสี
 *       (#f6c444 กับ #ffd24d) ★★ ในเกมจับคู่สี นั่นแปลว่าแยกไม่ออก
 *       แล้วผู้เล่นยิงผิดโดยไม่รู้ว่าทำไมไม่แตก
 *     ★ ต้นเหตุคือเกมยืม token ของ UI มาใช้เป็นสีลูกบอล
 *       ★★ token พวกนั้นถูกปรับเพื่องานอื่น (สีคำเตือนต้องอ่านง่ายบนพื้นแต่ละธีม)
 *          วันที่มีคนปรับ เกมจะพังอีกโดยไม่มีใครรู้
 *
 * ★★ ด่านนี้อ่านค่าสีจาก globals.css จริง ไม่ได้ก๊อปตัวเลขมาไว้ในเทสต์
 *    ★ ก๊อปมาก็ได้ด่านที่ผ่านเสมอโดยไม่เกี่ยวกับของที่ใช้งานจริง
 */
import { readFileSync } from 'node:fs'
import { LEVEL, newBoard, rowLen, get, neighbors, type Level } from '../lib/games/bubble'

let pass = 0
let fail = 0
function check(ok: boolean, name: string, detail = '') {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

/* ── อ่านชุดสีจริงจาก globals.css ─────────────────────────────── */
const css = readFileSync('app/globals.css', 'utf8')
const palette: { name: string; hex: string }[] = []
for (let i = 1; i <= 6; i++) {
  const m = css.match(new RegExp(`--bub-${i}\\s*:\\s*(#[0-9a-fA-F]{6})`))
  if (m) palette.push({ name: `--bub-${i}`, hex: m[1]!.toLowerCase() })
}

/** hue · lightness · saturation จาก hex */
function hls(hex: string): { h: number; l: number; s: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, l, s: 0 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, l, s }
}

/** ระยะเชิงมุมบนวงล้อสี — 350 กับ 10 ห่างกัน 20 ไม่ใช่ 340 */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

head('ชุดสีลูกบอล')
check(palette.length === 6, 'ประกาศครบ 6 สีใน globals.css', `${palette.length} สี`)

/*
 * ★★★ หัวใจของด่านนี้
 *     ★ 30 องศาคือเส้นที่ผมตั้งจากของจริง: คู่ที่พังห่างกัน 2 องศา
 *       ส่วนชุดใหม่คู่ที่ใกล้สุดห่าง 39 ★★ ตั้งไว้ที่ 30 จึงจับของเดิมได้
 *       และไม่บีบจนเลือกสีไม่ได้
 */
{
  let worst = 999
  let pair = ''
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const a = palette[i]!
      const b = palette[j]!
      const gap = hueGap(hls(a.hex).h, hls(b.hex).h)
      if (gap < worst) {
        worst = gap
        pair = `${a.name} ${a.hex} ↔ ${b.name} ${b.hex}`
      }
    }
  }
  check(worst >= 30, 'ทุกคู่สีห่างกันอย่างน้อย 30 องศา', `คู่ที่ใกล้สุดห่าง ${worst.toFixed(0)}° · ${pair}`)
}

/*
 * ★ สว่างพอที่จะเห็นบนพื้นกระดานซึ่งเป็นม่วง-น้ำเงินเข้มทั้งสองธีม
 *   ★★ #8a6100 ของเดิม (ความสว่าง 27%) เป็นน้ำตาลโคลน อ่านเป็น "ลูกเสีย"
 *      ไม่ใช่ "อีกสีหนึ่ง"
 */
for (const p of palette) {
  const { l, s } = hls(p.hex)
  check(l >= 0.45 && l <= 0.8, `${p.name} สว่างพอมองเห็นบนพื้นเข้ม`, `${(l * 100).toFixed(0)}%`)
  check(s >= 0.5, `${p.name} สีสดพอที่จะเรียกชื่อสีได้`, `${(s * 100).toFixed(0)}%`)
}

head('สีที่แต่ละระดับใช้จริง')
{
  /*
   * ★★ ระดับยากใช้ 6 สี = ใช้ทุกสีในชุด ★ ถ้าชุดมีไม่ครบ เกมจะวาดสีเทา
   *    (ค่าสำรองใน resolveColors) ซึ่งซ้ำกันทุกลูกที่หาไม่เจอ
   */
  const most = Math.max(...(['EASY', 'MEDIUM', 'HARD'] as Level[]).map((l) => LEVEL[l].colors))
  check(most <= palette.length, 'ชุดสีมีพอสำหรับระดับที่ใช้สีเยอะที่สุด', `ต้องการ ${most} · มี ${palette.length}`)
}

head('กระดานตั้งต้น')
{
  /* ★ สุ่มแบบกำหนดเมล็ดได้ ไม่งั้นด่านจะผ่านบ้างล้มบ้าง */
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  for (const level of ['EASY', 'MEDIUM', 'HARD'] as Level[]) {
    const b = newBoard(level, rnd)
    const cfg = LEVEL[level]

    let filled = 0
    let outOfRange = 0
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < rowLen(b, r); c++) {
        const v = get(b, r, c)
        if (v >= 0) filled++
        if (v >= cfg.colors) outOfRange++
      }
    }
    check(filled > 0, `${level} · วางลูกบอลแถวบนแล้ว`, `${filled} ลูก`)
    check(outOfRange === 0, `${level} · ไม่มีลูกไหนใช้สีเกินจำนวนที่ระดับนี้กำหนด`, `${outOfRange} ลูก`)

    /* ★ แถวล่าง ๆ ต้องว่าง ไม่งั้นเริ่มเกมมาก็แพ้เลย */
    let below = 0
    for (let r = cfg.rows; r < 14; r++) {
      for (let c = 0; c < rowLen(b, r); c++) if (get(b, r, c) >= 0) below++
    }
    check(below === 0, `${level} · ใต้แถวที่กำหนดต้องว่าง`, `${below} ลูก`)
  }
}

head('ช่องข้างเคียง')
{
  let seed = 3
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const b = newBoard('HARD', rnd)

  /*
   * ★★ กระดานหกเหลี่ยม — ช่องกลางต้องมีเพื่อนบ้าน 6 ช่อง
   *    ★ ถ้าสูตรแถวคู่/คี่ผิด จะได้ 4 หรือ 8 แล้วการจับกลุ่มสีจะเพี้ยนทั้งเกม
   *      ★★ ซึ่งเป็นบั๊กที่มองไม่เห็นจนกว่าจะยิงแล้วไม่แตกทั้งที่สีตรง
   */
  const mid = neighbors(b, 3, 3)
  check(mid.length === 6, 'ช่องกลางกระดานมีเพื่อนบ้าน 6 ช่อง', `${mid.length}`)

  /* ★ มุมซ้ายบนต้องน้อยกว่า — ไม่งั้นแปลว่ามันนับช่องนอกกระดานด้วย */
  const corner = neighbors(b, 0, 0)
  check(corner.length < 6, 'มุมกระดานมีเพื่อนบ้านน้อยกว่าช่องกลาง', `${corner.length}`)

  /* ★★ ความเป็นเพื่อนบ้านต้องสองทางเสมอ — ข้างเดียวคือสูตรเลื่อนแถวผิด */
  let oneWay = 0
  for (const n of mid) {
    if (!neighbors(b, n.r, n.c).some((x) => x.r === 3 && x.c === 3)) oneWay++
  }
  check(oneWay === 0, 'เป็นเพื่อนบ้านกันสองทางเสมอ', `${oneWay} คู่ที่เป็นข้างเดียว`)
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
