/**
 * ด่านตรวจกติกาเรียง 4
 *
 * รันด้วย:  npx tsx scripts/connect4-test.ts
 *
 * ★★★ ไฟล์นี้เกิดตอนทำโหมดท้าเพื่อน และนั่นคือเหตุผลที่ต้องมี
 *
 *     ★ ก่อนมีออนไลน์ โมดูลนี้ตัดสินแค่ "หน้าจอของคนคนเดียว" ★ ตอนนี้
 *       route ฝั่ง server เรียกมันเพื่อตัดสินว่าจะเชื่อตาที่ client ส่งมาไหม
 *       ★★ มันกลายเป็นด่านความถูกต้อง ไม่ใช่โค้ดวาดภาพอีกแล้ว
 *     ★★ กรณีที่พิสูจน์ด้วยการเล่นจริงไม่ไหว: แถวชนะทแยงทั้งสองทิศ ·
 *        เรียงห้าเหรียญ · กระดานเต็มแบบไม่มีใครชนะ
 */
import {
  COLS,
  ROWS,
  botMove,
  dropRow,
  emptyBoard,
  other,
  outcome,
  play,
  validCols,
  winLine,
  type Board,
  type Cell,
  type Player,
} from '../lib/games/connect4'

let pass = 0
let fail = 0
function check(ok: boolean, name: string, detail = '') {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

/** (แถว, คอลัมน์) → index */
const at = (r: number, c: number) => r * COLS + c

/** หยอดตามลำดับคอลัมน์ที่ให้มา ผลัดสีเริ่มจากแดง */
function drops(cols: number[], first: Player = 1): Board {
  let b = emptyBoard()
  let p = first
  for (const c of cols) {
    const n = play(b, c, p)
    if (!n) throw new Error(`หยอดคอลัมน์ ${c} ไม่ได้ — ฉากทดสอบผิด`)
    b = n.board
    p = other(p)
  }
  return b
}

head('กระดานเริ่มต้น')
{
  const b = emptyBoard()
  check(b.length === COLS * ROWS, 'กระดานมี 42 ช่อง', `${b.length}`)
  check(b.every((c) => c === 0), 'ว่างทุกช่อง')
  check(validCols(b).length === COLS, 'หยอดได้ทุกคอลัมน์')
  check(outcome(b).kind === 'PLAYING', 'ยังไม่จบ')
}

head('เหรียญตกลงล่างสุดเสมอ')
{
  const b = emptyBoard()
  check(dropRow(b, 0) === ROWS - 1, 'คอลัมน์ว่างตกแถวล่างสุด', `แถว ${dropRow(b, 0)}`)

  const one = play(b, 3, 1)!
  check(one.index === at(ROWS - 1, 3), 'index = row*7+col', `${one.index}`)
  check(dropRow(one.board, 3) === ROWS - 2, 'เหรียญถัดไปซ้อนบนทันที')

  /* ★★ เหรียญลอยไม่ได้ — ไม่มีทางเลือกแถว มีแต่เลือกคอลัมน์
       ★ ด่านนี้คือกติกาที่ route ฝั่ง server พึ่งพา: client ส่งมาแค่คอลัมน์ */
  const stacked = drops([2, 2, 2])
  const col2 = Array.from({ length: ROWS }, (_, r) => stacked[at(r, 2)])
  check(
    col2.slice(0, ROWS - 3).every((v) => v === 0) && col2.slice(ROWS - 3).every((v) => v !== 0),
    'เหรียญกองจากล่างขึ้นบนไม่มีช่องว่างคั่น',
    col2.join(''),
  )
}

head('คอลัมน์เต็มแล้วหยอดไม่ได้')
{
  /* ★ หยอดคอลัมน์เดียว 6 ครั้ง สลับสีไปเรื่อย — ไม่มีใครเรียงสี่ได้ในแนวตั้ง
       เพราะสีสลับกันทุกใบ */
  const full = drops([0, 0, 0, 0, 0, 0])
  check(dropRow(full, 0) === null, 'คอลัมน์เต็ม dropRow คืน null')
  check(play(full, 0, 1) === null, 'คอลัมน์เต็ม play คืน null')
  check(!validCols(full).includes(0), 'คอลัมน์เต็มหายจากรายการที่หยอดได้')
  check(validCols(full).length === COLS - 1, 'คอลัมน์อื่นยังหยอดได้ครบ')

  /*
   * ★★★ นี่คือกรณีที่ route พึ่ง: play() คืน null → ตอบ VALIDATION_FAILED
   *     ★ ไม่เชื่อหน้าจอว่ากันคอลัมน์เต็มไว้แล้ว ★★ คำขอปลอมยิงตรงมาที่ API
   *       ได้ตลอด และต้องไม่ทำให้กระดานเพี้ยน
   */
}

head('เรียงสี่ทุกทิศ')
{
  const mk = (cells: number[], p: Player = 1): Board => {
    const b = emptyBoard()
    for (const i of cells) b[i] = p as Cell
    return b
  }

  const h = winLine(mk([at(5, 1), at(5, 2), at(5, 3), at(5, 4)]))
  check(h?.cells.length === 4 && h.player === 1, 'แนวนอน')

  const v = winLine(mk([at(5, 2), at(4, 2), at(3, 2), at(2, 2)], 2))
  check(v?.cells.length === 4 && v.player === 2, 'แนวตั้ง')

  const d1 = winLine(mk([at(5, 0), at(4, 1), at(3, 2), at(2, 3)]))
  check(d1?.cells.length === 4, 'ทแยงขึ้นขวา')

  const d2 = winLine(mk([at(2, 0), at(3, 1), at(4, 2), at(5, 3)]))
  check(d2?.cells.length === 4, 'ทแยงลงขวา')

  /* ★ เรียงห้าต้องคืนทั้งห้าช่อง ไม่ใช่ตัดเหลือสี่
       ★★ หน้าจอใช้ค่านี้ทำให้แถวชนะเรืองแสง — ตัดทิ้งหนึ่งช่องจะเห็นเหรียญ
          ที่ร่วมชนะอยู่แต่ถูกหรี่ไฟ ซึ่งอ่านว่า "ไม่นับใบนี้" */
  const five = winLine(mk([at(5, 1), at(5, 2), at(5, 3), at(5, 4), at(5, 5)]))
  check(five?.cells.length === 5, 'เรียงห้าคืนครบห้าช่อง', `${five?.cells.length}`)

  /* ★★ สามใบไม่ชนะ — ด่านกันการนับเกิน ซึ่งจะทำให้เกมจบก่อนเวลา */
  check(winLine(mk([at(5, 1), at(5, 2), at(5, 3)])) === null, 'สามใบยังไม่ชนะ')
  /* ★ สี่ใบคนละสีไม่ชนะ */
  const mixed = emptyBoard()
  mixed[at(5, 1)] = 1; mixed[at(5, 2)] = 1; mixed[at(5, 3)] = 2; mixed[at(5, 4)] = 1
  check(winLine(mixed) === null, 'สี่ใบคนละสีไม่ชนะ')

  /* ★★★ ต่อขอบกระดานไม่ได้ — ช่องขวาสุดของแถวหนึ่งกับซ้ายสุดของแถวถัดไป
       อยู่ติดกันในอาร์เรย์แบน แต่ไม่ได้ติดกันบนกระดาน
       ★ ถ้าโค้ดวนด้วย index ตรง ๆ แทนที่จะวนด้วย (แถว, คอลัมน์) มันจะนับผ่าน */
  const wrap = emptyBoard()
  wrap[at(4, 5)] = 1; wrap[at(4, 6)] = 1; wrap[at(5, 0)] = 1; wrap[at(5, 1)] = 1
  check(winLine(wrap) === null, 'เรียงข้ามขอบซ้าย-ขวาไม่นับว่าชนะ')
}

head('ผลของเกม')
{
  /* ★ แดงหยอด 0,1,2,3 · ทองหยอด 6 คั่น — แดงเรียงสี่แถวล่าง */
  const b = drops([0, 6, 1, 6, 2, 6, 3])
  const r = outcome(b)
  check(r.kind === 'WIN' && r.player === 1, 'ชนะแล้วบอกว่าใครชนะ')
  check(r.kind === 'WIN' && r.cells.length === 4, 'บอกช่องของแถวที่ชนะมาด้วย')

  /*
   * ★★★ กระดานเต็มแบบไม่มีใครชนะ
   *
   *     ★ ลำดับนี้มาจากการสุ่มเล่นจนเจอเกมที่เสมอจริง ไม่ใช่ลายที่ผมแต่งขึ้น
   *       ★★ รอบแรกผมแต่งลายเอง (สีเป็นบล็อกสองแถวสลับกัน) แล้วมันมีแถวชนะ
   *          แนวนอนอยู่ในนั้น — ด่านฟ้องว่า WIN ไม่ใช่ DRAW
   *          ★ บทเรียน: ฉากทดสอบที่ "ดูน่าจะถูก" คือฉากที่ยังไม่ได้ตรวจ
   *     ★ ใช้ลำดับการหยอดแทนตารางสี เพราะมันเป็นเกมที่เล่นได้จริง
   *       ★★ ตารางสีที่เขียนมือเป็นกระดานที่อาจไม่มีทางเกิดขึ้นได้เลย
   *          ซึ่งทำให้ด่านผ่านโดยไม่ได้พูดถึงอะไรจริง
   */
  const draw = drops([
    6, 5, 5, 2, 1, 3, 0, 2, 0, 6, 4, 0, 0, 3, 4, 6, 6, 2, 3, 4, 4,
    1, 2, 1, 2, 6, 4, 6, 4, 5, 1, 3, 5, 2, 3, 1, 0, 0, 1, 5, 5, 3,
  ])
  const dr = outcome(draw)
  check(validCols(draw).length === 0, 'ฉากเสมอ: กระดานเต็ม')
  check(draw.filter((c) => c === 1).length === 21, 'ฉากเสมอ: แดง 21 ใบ ทอง 21 ใบ')
  check(dr.kind === 'DRAW', 'กระดานเต็มไม่มีใครชนะ = เสมอ', dr.kind)
}

head('บอท')
{
  /* ★ ชนะได้ทันทีต้องชนะ — ทุกระดับ รวมง่ายสุด */
  for (const level of ['EASY', 'MEDIUM', 'HARD'] as const) {
    const b = drops([0, 6, 1, 6, 2, 5]) /* แดงมี 0,1,2 แถวล่าง ตาแดง */
    const c = botMove(b, 1, level, () => 0.99)
    check(c === 3, `${level} · ชนะได้ทันทีก็ชนะ`, `เลือกคอลัมน์ ${c}`)
  }

  /* ★★ กันแพ้ทันที — ระดับกลางกับยากต้องกันเสมอ
       ★ ทองเป็นคนเดิน และแดงกำลังจะเรียงสี่ที่คอลัมน์ 3 */
  for (const level of ['MEDIUM', 'HARD'] as const) {
    const b = drops([0, 6, 1, 6, 2]) /* แดง 0,1,2 · ตาทอง */
    const c = botMove(b, 2, level)
    check(c === 3, `${level} · กันไม่ให้อีกฝ่ายชนะตาถัดไป`, `เลือกคอลัมน์ ${c}`)
  }

  /* ★ ไม่เลือกคอลัมน์ที่เต็ม — ไม่งั้น route จะได้คอลัมน์ที่ play() คืน null */
  const b2 = drops([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
  for (const level of ['EASY', 'MEDIUM', 'HARD'] as const) {
    const c = botMove(b2, 1, level, () => 0.1)
    check(c !== null && validCols(b2).includes(c), `${level} · ไม่เลือกคอลัมน์ที่เต็ม`, `${c}`)
  }

  /* ★ กระดานเต็มต้องคืน null ไม่ใช่เดาคอลัมน์ */
  const fullBoard = Array<Cell>(COLS * ROWS).fill(1)
  check(botMove(fullBoard, 1, 'HARD') === null, 'กระดานเต็มคืน null')

  /* ★★ ระดับยากต้องตอบเร็วพอที่คนจะไม่คิดว่าแอปค้าง */
  const t0 = Date.now()
  botMove(emptyBoard(), 1, 'HARD')
  const ms = Date.now() - t0
  check(ms < 2000, 'ระดับยากตอบภายใน 2 วินาที', `${ms} มิลลิวินาที`)
}

head('สิ่งที่ฝั่ง server พึ่งพา')
{
  /*
   * ★★★ สามข้อนี้คือสัญญาที่ app/api/office/games/connect4 เชื่อ
   *     ★ ถ้าข้อไหนเพี้ยน กระดานในฐานข้อมูลจะไม่ตรงกับประวัติตาหยอด
   *       และไม่มีใครรู้จนกว่าจะมีคนทักว่าเกมแปลก ๆ
   */

  /* 1 · play() ไม่แก้กระดานเดิม — route อ่านกระดานจากฐานข้อมูลแล้วส่งใบใหม่ไปเขียน */
  const before = drops([3, 3])
  const snapshot = before.join(',')
  play(before, 3, 1)
  check(before.join(',') === snapshot, 'play() ไม่แก้กระดานที่รับเข้ามา')

  /* 2 · ช่องที่คืนมาต้องเป็นช่องที่เหรียญอยู่จริงบนกระดานใบใหม่ */
  const n = play(before, 4, 2)!
  check(n.board[n.index] === 2, 'ช่องที่คืนมาคือช่องที่เหรียญอยู่จริง')

  /* 3 · หยอดหนึ่งครั้งเพิ่มเหรียญหนึ่งใบเท่านั้น */
  const countBefore = before.filter((c) => c !== 0).length
  check(
    n.board.filter((c) => c !== 0).length === countBefore + 1,
    'หยอดหนึ่งครั้งเพิ่มเหรียญหนึ่งใบ',
  )
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
