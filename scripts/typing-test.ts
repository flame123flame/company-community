/**
 * ด่านตรวจการนับและคิดคะแนนของแข่งพิมพ์ดีด
 *
 * รันด้วย:  npx tsx scripts/typing-test.ts
 *
 * ★★★ การนับตัวอักษรไทยคือจุดที่พลาดแล้วไม่มีอะไรฟ้อง
 *     ★ "สวัสดี" ตาเห็น 4 กลุ่ม แต่ JS บอก 6 เพราะสระบน-ล่างและวรรณยุกต์
 *       เป็น code point แยกที่ลอยอยู่เหนือ/ใต้พยัญชนะโดยไม่กินความกว้าง
 *     ★★ ไฟล์นี้ล็อกการตัดสินใจของข้อกำหนด (1 ตัวอักษร = 1 code point) ไว้
 */
import {
  toChars, compare, wpm, accuracy, isCredible, pickText, TEXTS,
  TypingCounter, MAX_CREDIBLE_WPM,
} from '../lib/games/typing'

let pass = 0, fail = 0
const check = (ok: boolean, n: string, d = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

head('นับตัวอักษร')
check(toChars('abc').length === 3, 'อังกฤษนับตรงไปตรงมา')
/* ★ "สวัสดี" = ส ว ั ส ด ี = 6 code point */
check(toChars('สวัสดี').length === 6, 'ไทยนับเป็น code point ตามข้อกำหนด', `${toChars('สวัสดี').length}`)
check(toChars('ก้').length === 2, 'พยัญชนะ+วรรณยุกต์ = 2 code point')
/* ★★ อีโมจินอก BMP ต้องไม่ถูกหั่นครึ่ง */
check(toChars('👍').length === 1, 'อีโมจิไม่ถูกหั่นเป็นคู่ surrogate', `${toChars('👍').length}`)
check('👍'.split('').length === 2, 'ยืนยันว่า split("") หั่นจริง (เหตุผลที่ใช้ [...s])')

head('เทียบสิ่งที่พิมพ์')
check(compare('hello', '').correct === 0, 'ยังไม่พิมพ์ = 0')
check(compare('hello', 'hel').correct === 3, 'พิมพ์ถูกสามตัว')
check(!compare('hello', 'hel').wrong, 'ถูกอยู่ = ไม่ผิด')
check(compare('hello', 'hex').wrong, 'พิมพ์ผิดตัวที่สาม = ผิด')
check(compare('hello', 'hex').correct === 2, 'ถูกสองตัว ผิดหนึ่ง')
check(compare('hello', 'hex').cursor === 3, 'ผิดแล้วเคอร์เซอร์เดินต่อ')
check(compare('hello', 'hello').done, 'พิมพ์ครบ = จบ')
check(compare('hello', 'helloo').cursor === 5, 'พิมพ์เกินถูกตัดที่ความยาวข้อความ')
check(compare('hellx', 'hello').done, 'พิมพ์ครบความยาว = จบ แม้มีตัวผิด')

/*
 * ★★★ ต้องแก้ให้ถูกก่อนไปต่อ — นับถูก "ต่อเนื่องจากต้น" ไม่ใช่ถูกรวม ๆ
 *     ★ ถ้านับรวม ๆ คนที่พิมพ์ผิดกลางทางแล้วพิมพ์ต่อไปเรื่อย ๆ จะได้คะแนน
 *       เท่าคนที่พิมพ์ถูกหมด ซึ่งผิดเจตนาของเกม
 */
check(compare('abcdef', 'abXdef').correct === 5, 'ผิดกลางทางแล้วพิมพ์ต่อ ตัวหลังจากนั้นนับถูกได้')
check(compare('abcdef', 'abXdef').errors === 1, 'นับตัวผิดได้ 1')

head('ไทย: พิมพ์ทีละ code point')
const thai = 'สวัสดี'
check(compare(thai, 'ส').correct === 1, 'พิมพ์พยัญชนะตัวแรก')
check(compare(thai, 'สว').correct === 2, 'พิมพ์ตัวที่สอง')
check(compare(thai, 'สวั').correct === 3, 'พิมพ์สระบน (ไม้หันอากาศ) นับเป็นตัวที่สาม')
check(compare(thai, 'สวัสดี').done, 'พิมพ์ครบทั้งคำ')
check(compare(thai, 'สวัา').wrong, 'พิมพ์สระผิด = ผิด')

head('WPM')
/* 50 ตัวถูก ใน 60 วินาที → 50/5 = 10 คำ ÷ 1 นาที = 10 */
check(wpm(50, 60_000) === 10, '50 ตัวใน 1 นาที = 10 WPM', `${wpm(50, 60_000)}`)
check(wpm(250, 60_000) === 50, '250 ตัวใน 1 นาที = 50 WPM')
check(wpm(50, 30_000) === 20, 'เวลาครึ่งเดียว = WPM สองเท่า')
/* ★ เวลาเป็นศูนย์ต้องไม่คืน Infinity ซึ่งจะทำให้กระดานอันดับเรียงพัง */
check(wpm(10, 0) === 0, 'เวลาเป็นศูนย์ → 0 ไม่ใช่ Infinity', `${wpm(10, 0)}`)

head('ความแม่นยำ')
check(accuracy(100, 100) === 100, 'ไม่พลาดเลย = 100%')
check(accuracy(50, 100) === 50, 'ถูกครึ่งหนึ่ง = 50%')
check(accuracy(0, 0) === 100, 'ยังไม่กดอะไร = 100% (ไม่ใช่หารศูนย์)')

head('ตัวนับระหว่างพิมพ์')
{
  /*
   * ★★★ "ถูกในครั้งแรก" ต้องจำว่าเคยถึงตำแหน่งไหนมาแล้ว
   *     ★ พิมพ์ผิดแล้วลบแก้จนถูก ต้องไม่ได้ 100%
   */
  const c = new TypingCounter()
  c.update('abcde', 'a', 1)
  c.update('abcde', 'ab', 1)
  c.update('abcde', 'abX', 1)   // ผิด
  c.update('abcde', 'ab', 1)    // ลบ
  c.update('abcde', 'abc', 1)   // แก้ถูก
  c.update('abcde', 'abcd', 1)
  c.update('abcde', 'abcde', 1)
  const s = c.stats(60_000)
  check(s.correct === 5, 'พิมพ์ครบ 5 ตัว', `${s.correct}`)
  check(s.keystrokes === 7, 'นับการกดทั้งหมด 7 ครั้ง', `${s.keystrokes}`)
  check(s.accuracy < 100, 'ลบแก้แล้วความแม่นยำต่ำกว่า 100%', `${s.accuracy}%`)
  check(Math.abs(s.accuracy - 57.1) < 0.2, 'ความแม่นยำ = 4/7 ≈ 57.1% (ตัวที่ลบแก้ไม่นับว่าถูกครั้งแรก)', `${s.accuracy}%`)
}
{
  const c = new TypingCounter()
  for (const t of ['a', 'ab', 'abc']) c.update('abc', t, 1)
  check(c.stats(60_000).accuracy === 100, 'ไม่เคยผิดเลย = 100%')
}

head('กันโกง')
check(isCredible(500, 60_000), 'ความเร็วปกติ → นับ')
check(!isCredible(5000, 60_000), 'เร็วเกินมนุษย์ → ไม่นับ', `${wpm(5000, 60_000)} WPM`)
check(!isCredible(100, 500), 'เวลาสั้นเกินจริง → ไม่นับ')
check(wpm(MAX_CREDIBLE_WPM * 5, 60_000) === MAX_CREDIBLE_WPM, 'เพดานตรงกับค่าในข้อกำหนด')

head('คลังข้อความ')
check(TEXTS.th.length >= 50, 'ไทยอย่างน้อย 50 ข้อความ', `${TEXTS.th.length}`)
check(TEXTS.en.length >= 50, 'อังกฤษอย่างน้อย 50 ข้อความ', `${TEXTS.en.length}`)
check(new Set(TEXTS.th).size === TEXTS.th.length, 'ข้อความไทยไม่ซ้ำกัน')
check(new Set(TEXTS.en).size === TEXTS.en.length, 'ข้อความอังกฤษไม่ซ้ำกัน')
check(TEXTS.th.every((t) => t.trim().length > 20), 'ไม่มีข้อความไทยที่สั้นเกินไป')
check(TEXTS.en.every((t) => t.trim().length > 20), 'ไม่มีข้อความอังกฤษที่สั้นเกินไป')

/*
 * ★★★ ทุกคนในห้องต้องได้ข้อความเดียวกัน
 *     ★ ห้องสุ่มเลขหนึ่งตัวแล้วแจกให้ทุกเครื่อง — ถ้าแต่ละเครื่องสุ่มเอง
 *       จะได้คนละข้อความ แล้วการแข่งไม่มีความหมาย
 */
const seeded = () => 0.42
check(
  pickText('th', 'short', seeded) === pickText('th', 'short', seeded),
  'เลขสุ่มเดียวกัน → ข้อความเดียวกัน',
)
check(pickText('en', 'medium', seeded).length > pickText('en', 'short', seeded).length, 'กลางยาวกว่าสั้น')
check(TEXTS.th.includes(pickText('th', 'short', seeded)), 'ข้อความสั้นมาจากคลังจริง')

/*
 * ★★ ข้อความกลางห้ามมีประโยคซ้ำ
 *    เคยสุ่มสามประโยคแยกกันอิสระ — ได้ "การจัดโต๊ะทำงาน…" สองรอบในข้อความเดียว
 *    ★ เลขสุ่มที่ทำให้ซ้ำแน่ ๆ (ค่าเดิมทุกครั้ง) + สุ่มจริง 2,000 รอบ
 */
for (const lang of ['th', 'en'] as const) {
  const same = pickText(lang, 'medium', seeded)
  const parts = TEXTS[lang].filter((t) => same.includes(t))
  check(parts.length === 3, `${lang}: เลขสุ่มเดิมทุกครั้งยังได้ 3 ประโยคไม่ซ้ำ`, `${parts.length} ประโยค`)
  let dup = 0
  for (let i = 0; i < 2000; i++) {
    const t = pickText(lang, 'medium')
    if (TEXTS[lang].some((s) => t.split(s).length > 2)) dup++
  }
  check(dup === 0, `${lang}: สุ่ม 2,000 ครั้งไม่มีประโยคซ้ำ`, `ซ้ำ ${dup} ครั้ง`)
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
