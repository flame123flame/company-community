/**
 * ด่านตรวจกติกาหมากฮอส — ตามรายการในข้อกำหนดเฟส 4
 *
 * รันด้วย:  npx tsx scripts/checkers-test.ts
 *
 * ★★ ข้อกำหนดสั่งให้แยกกติกาเป็นโมดูลที่ unit test ได้ ★ ไฟล์นี้คือเหตุผล
 *    ของข้อนั้น — กติกาหมากฮอสมีกรณีขอบที่พิสูจน์ด้วยการเล่นจริงไม่ไหว
 *    (ลองกินต่อเนื่องสี่ตัวบนเบราว์เซอร์ให้ได้ทุกครั้งที่แก้โค้ด)
 */
import {
  EMPTY, B_MAN, B_KING, W_MAN, W_KING, SIZE,
  initialBoard, legalMoves, applyMove, findLegal, outcome, botMove, evaluate,
  isDark, sideOf, type Board, type Cell,
} from '../lib/games/checkers'

let pass = 0
let fail = 0
function check(ok: boolean, name: string, detail = '') {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

/** กระดานว่าง — ใช้วางฉากเฉพาะกรณีที่จะทดสอบ */
const blank = (): Board => Array.from({ length: 64 }, () => EMPTY as Cell)
/** (แถว, คอลัมน์) → index */
const sq = (r: number, c: number) => r * SIZE + c

head('กระดานเริ่มต้น')
const init = initialBoard()
check(init.filter((c) => c === B_MAN).length === 8, 'ฝ่ายล่างมี 8 ตัว')
check(init.filter((c) => c === W_MAN).length === 8, 'ฝ่ายบนมี 8 ตัว')
check(init.every((c, i) => c === EMPTY || isDark(i)), 'หมากอยู่บนช่องสีเข้มเท่านั้น')
check(
  init.filter((c, i) => c !== EMPTY && Math.floor(i / SIZE) >= 2 && Math.floor(i / SIZE) <= 5).length === 0,
  'แถวกลางสี่แถวว่าง',
)

head('เบี้ยเดินหน้าเท่านั้น')
{
  const b = blank()
  b[sq(4, 3)] = B_MAN
  const ms = legalMoves(b, 'BOTTOM')
  /* ★ ฝ่ายล่างเดินขึ้น = แถวลดลง */
  check(ms.every((m) => Math.floor(m.to / SIZE) < 4), 'เบี้ยฝ่ายล่างเดินขึ้นเท่านั้น', `${ms.length} ตา`)
  check(ms.length === 2, 'มีสองทิศให้เลือก', ms.map((m) => m.to).join(','))

  const w = blank()
  w[sq(3, 2)] = W_MAN
  const wm = legalMoves(w, 'TOP')
  check(wm.every((m) => Math.floor(m.to / SIZE) > 3), 'เบี้ยฝ่ายบนเดินลงเท่านั้น')
}

head('เบี้ยกินได้เฉพาะทางหน้า')
{
  /*
   * ฝ่ายล่างที่ (4,3) · เหยื่อข้างหลังที่ (5,4) · ช่องลง (6,5) ว่าง
   * ★ ถ้ากินถอยหลังได้ จะเจอตากินตรงนี้ — ซึ่งผิดกติกาไทย
   */
  const b = blank()
  b[sq(4, 3)] = B_MAN
  b[sq(5, 4)] = W_MAN
  const ms = legalMoves(b, 'BOTTOM')
  check(ms.every((m) => m.captured.length === 0), 'เบี้ยไม่กินถอยหลัง', `${ms.length} ตา`)

  /* เหยื่ออยู่ข้างหน้า → ต้องกินได้ */
  const f = blank()
  f[sq(4, 3)] = B_MAN
  f[sq(3, 4)] = W_MAN
  const fm = legalMoves(f, 'BOTTOM')
  check(fm.length === 1 && fm[0]!.captured.length === 1, 'เบี้ยกินทางหน้าได้', JSON.stringify(fm[0]?.captured))
  check(fm[0]!.to === sq(2, 5), 'ลงช่องถัดจากเหยื่อ')
}

head('บังคับกิน')
{
  const b = blank()
  b[sq(4, 3)] = B_MAN   // มีตากิน
  b[sq(3, 4)] = W_MAN
  b[sq(6, 1)] = B_MAN   // ตัวนี้เดินเฉย ๆ ได้

  const forced = legalMoves(b, 'BOTTOM', true)
  check(forced.every((m) => m.captured.length > 0), 'เปิดบังคับกิน → เหลือแต่ตากิน', `${forced.length} ตา`)

  const free = legalMoves(b, 'BOTTOM', false)
  check(free.some((m) => m.captured.length === 0), 'ปิดบังคับกิน → เดินเฉย ๆ ได้')
  check(free.length > forced.length, 'ปิดแล้วตัวเลือกมากกว่า', `${free.length} > ${forced.length}`)
}

head('กินต่อเนื่อง')
{
  /*
   * ★★ เบี้ยฝ่ายล่างที่ (6,1) กินขึ้นไปสองต่อ
   *    เหยื่อ (5,2) → ลง (4,3) · เหยื่อ (3,4) → ลง (2,5)
   */
  const b = blank()
  b[sq(6, 1)] = B_MAN
  b[sq(5, 2)] = W_MAN
  b[sq(3, 4)] = W_MAN

  const ms = legalMoves(b, 'BOTTOM')
  const best = ms.reduce((a, m) => (m.captured.length > a.captured.length ? m : a), ms[0]!)
  check(best.captured.length === 2, 'กินต่อเนื่องสองตัวในตาเดียว', `กิน ${best.captured.length}`)
  check(best.to === sq(2, 5), 'จบที่ช่องสุดท้ายถูกต้อง')

  const after = applyMove(b, best)
  check(after.filter((c) => c === W_MAN).length === 0, 'เหยื่อถูกเก็บออกครบ')
  check(after[sq(6, 1)] === EMPTY && after[sq(2, 5)] === B_MAN, 'หมากย้ายไปปลายทาง')
}

head('เลื่อนขั้นเป็นฮอส')
{
  const b = blank()
  b[sq(1, 2)] = B_MAN
  const ms = legalMoves(b, 'BOTTOM')
  check(ms.every((m) => m.promoted), 'เบี้ยถึงแถวสุดท้าย → เลื่อนขั้น')
  const after = applyMove(b, ms[0]!)
  check(after[ms[0]!.to] === B_KING, 'กลายเป็นฮอสจริง')

  /* ★ ฝ่ายบนเลื่อนขั้นที่แถวล่างสุด */
  const w = blank()
  w[sq(6, 3)] = W_MAN
  const wm = legalMoves(w, 'TOP')
  check(wm.every((m) => m.promoted), 'ฝ่ายบนเลื่อนขั้นที่แถวล่างสุด')
  check(applyMove(w, wm[0]!)[wm[0]!.to] === W_KING, 'ฝ่ายบนกลายเป็นฮอส')
}

head('ฮอสเดินและกิน')
{
  const b = blank()
  b[sq(4, 3)] = B_KING
  const ms = legalMoves(b, 'BOTTOM')
  check(ms.length > 8, 'ฮอสเดินได้หลายช่องทุกทิศ', `${ms.length} ตา`)
  check(ms.some((m) => Math.floor(m.to / SIZE) > 4), 'ฮอสถอยหลังได้')

  /*
   * ★★★ ข้อที่ต่างจากหมากฮอสสากล: ฮอสกินแล้วต้องลง "ช่องถัดจากเหยื่อทันที"
   *     ★ สากลให้ลงได้ทุกช่องว่างหลังเหยื่อ — ถ้าทำตามสากล คนเล่นจะบอกว่า
   *       กติกาผิด ซึ่งถูกของเขา
   */
  const k = blank()
  k[sq(6, 1)] = B_KING
  k[sq(4, 3)] = W_MAN
  const km = legalMoves(k, 'BOTTOM').filter((m) => m.captured.length > 0)
  check(km.length === 1, 'ฮอสมีทางกินทางเดียว', `${km.length} ตา`)
  check(km[0]!.to === sq(3, 4), 'ฮอสลงช่องถัดจากเหยื่อทันที ไม่ไกลกว่านั้น', `ลงที่แถว ${Math.floor(km[0]!.to / SIZE)}`)
}

head('แพ้ / เสมอ')
{
  const b = blank()
  b[sq(0, 1)] = B_MAN
  check(outcome(b, 'TOP', 0).kind === 'WIN', 'ฝ่ายที่ไม่มีตัวเหลือ = แพ้')
  check((outcome(b, 'TOP', 0) as { side: string }).side === 'BOTTOM', 'ผู้ชนะคือฝ่ายที่ยังมีตัว')

  /*
   * ★★ เดินไม่ได้ = แพ้ ไม่ใช่เสมอ (กติกาไทย)
   *    ฝ่ายล่างที่มุม (7,0) ถูกปิดทางด้วยตัวเองที่ (6,1)
   */
  /*
   * ★★ ฉากแรกที่ผมวาง (เรียงหมากตัวเองทแยง 8 ตัว) ไม่ได้ล้อมจริง —
   *    ตัวที่ (1,6) ยังเดินไป (0,5) ได้ ★ เทสต์จึงฟ้องว่า PLAYING
   *    ซึ่ง "ถูกต้อง" และเป็นความผิดของฉาก ไม่ใช่ของกติกา
   *
   * ★★★ ฉากที่ล้อมจริง: ฝ่ายล่างมีตัวเดียวที่มุม (7,0)
   *     ทางเดินหน้าทางเดียวคือ (6,1) ซึ่งมีตัวฝ่ายตรงข้ามยืนอยู่
   *     และช่องลงหลังกิน (5,2) ก็ถูกปิด → ไม่มีทั้งตาเดินและตากิน
   */
  const stuck = blank()
  stuck[sq(7, 0)] = B_MAN
  stuck[sq(6, 1)] = W_MAN
  stuck[sq(5, 2)] = W_MAN
  const r = outcome(stuck, 'BOTTOM', 0)
  check(r.kind === 'WIN' && r.side === 'TOP', 'ถูกล้อมจนเดินไม่ได้ = แพ้ ไม่ใช่เสมอ', r.kind)

  const draw = outcome(initialBoard(), 'BOTTOM', 30)
  check(draw.kind === 'DRAW', 'ไม่มีการกิน 30 ตา = เสมอ', draw.kind)
}

head('ตรวจตาเดินแบบที่ server ใช้')
{
  const b = blank()
  b[sq(4, 3)] = B_MAN
  b[sq(3, 4)] = W_MAN

  check(findLegal(b, 'BOTTOM', sq(4, 3), sq(2, 5)) !== null, 'ตาที่ถูกกติกา → ผ่าน')
  /* ★ บังคับกินอยู่ การเดินเฉย ๆ ต้องถูกปฏิเสธ */
  check(findLegal(b, 'BOTTOM', sq(4, 3), sq(3, 2)) === null, 'เดินเฉย ๆ ทั้งที่มีตากิน → ปฏิเสธ')
  check(findLegal(b, 'BOTTOM', sq(4, 3), sq(5, 2)) === null, 'เดินถอยหลัง → ปฏิเสธ')
  check(findLegal(b, 'TOP', sq(4, 3), sq(2, 5)) === null, 'สั่งเดินหมากของอีกฝ่าย → ปฏิเสธ')
  check(findLegal(b, 'BOTTOM', sq(0, 0), sq(1, 1)) === null, 'สั่งเดินช่องว่าง → ปฏิเสธ')
}

head('บอท')
{
  const b = blank()
  b[sq(4, 3)] = B_MAN
  b[sq(3, 4)] = W_MAN
  b[sq(6, 1)] = B_MAN
  const m = botMove(b, 'BOTTOM', 'MEDIUM')
  check(m !== null && m.captured.length > 0, 'บอทเลือกตากินเมื่อบังคับกิน')

  check(botMove(blank(), 'BOTTOM', 'EASY') === null, 'ไม่มีตาเดิน → null')

  /* ★ บอทต้องตอบภายใน 1 วินาที ตามข้อกำหนด */
  const t0 = Date.now()
  botMove(initialBoard(), 'BOTTOM', 'HARD')
  const ms = Date.now() - t0
  check(ms < 1000, 'ระดับยากตอบภายใน 1 วินาที', `${ms} มิลลิวินาที`)

  /* ★ คะแนนกระดานเริ่มต้นต้องเป็นศูนย์ — สองฝ่ายเท่ากันเป๊ะ
       ★★ ถ้าไม่ศูนย์ แปลว่าฟังก์ชันให้คะแนนลำเอียงตั้งแต่ก่อนเริ่มเล่น */
  check(Math.abs(evaluate(initialBoard())) < 1e-9, 'กระดานเริ่มต้นคะแนนเป็นศูนย์', `${evaluate(initialBoard())}`)

  /* ★ ฮอสมีค่ามากกว่าเบี้ย */
  const kb = blank(); kb[sq(4, 3)] = B_KING
  const mb = blank(); mb[sq(4, 3)] = B_MAN
  check(evaluate(kb) > evaluate(mb), 'ฮอสมีค่ามากกว่าเบี้ย')
}

head('ช่วยยืนยันชนิดข้อมูล')
check(sideOf(B_KING) === 'BOTTOM' && sideOf(W_KING) === 'TOP', 'แยกฝ่ายของฮอสถูก')
check(!isDark(0) && isDark(1), 'ช่องสีเข้มคือ (แถว+คอลัมน์) เป็นคี่')

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
