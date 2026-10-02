/**
 * ชุดทดสอบการหารเงิน — รันด้วย: npx tsx scripts/split-test.ts
 *
 * ★ เงินเป็นส่วนที่พังแล้วคนเลิกเชื่อทั้งระบบ ★★ จึงต้องมีชุดทดสอบที่รันซ้ำได้
 *   ไม่ใช่ตรวจด้วยตาครั้งเดียวตอนเขียนเสร็จ
 */
import { computeSplit } from '@/lib/office/billDraft'
import { splitEven, splitRounded } from '@/lib/office/money'

let fail = 0
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`}`)
}
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

/* ── ฿100 หาร 3 คน ───────────────────────────────────────────── */
check('100/3 ไม่ปัด ผลรวมเท่าบิล', sum(splitEven(10000, 3)), 10000)
check('100/3 ไม่ปัด', splitEven(10000, 3), [3334, 3333, 3333])
check('100/3 ปัด ผลรวมเท่าบิล', sum(splitRounded(10000, 3)), 10000)
/* ★ คนอื่นจ่ายคนละ ฿34 (ปัดขึ้น) · ส่วนต่างตกที่คนสร้างบิล ฿32 · รวม ฿100
     ★★ ตรงตามสเปก "ปัดขึ้นเป็นบาทเต็ม ส่วนต่างตกที่คนสร้างบิล" */
check('100/3 ปัด', splitRounded(10000, 3), [3200, 3400, 3400])

/* ── ค่าส่ง + ส่วนลด ─────────────────────────────────────────── */
const r = computeSplit({ amount: 300, deliveryFee: 20, discount: 50, others: 2, includeSelf: true, rounded: false })
check('300 +20 -50 หาร 3 ผลรวม', r.mineSatang + sum(r.othersSatang), r.totalSatang)
check('300 +20 -50 ยอดสุทธิ', r.totalSatang, 27000)
check('300 +20 -50 แต่ละคน', [r.mineSatang, ...r.othersSatang], [9000, 9000, 9000])

/* ── ไม่ร่วมจ่าย ─────────────────────────────────────────────── */
const r2 = computeSplit({ amount: 100, deliveryFee: 0, discount: 0, others: 3, includeSelf: false, rounded: false })
check('ไม่ร่วมจ่าย ผลรวม', sum(r2.othersSatang), 10000)
check('ไม่ร่วมจ่าย ของฉัน', r2.mineSatang, 0)

/* ── ปัดแล้วเกิน → ถอยไปไม่ปัด ──────────────────────────────── */
const r3 = computeSplit({ amount: 6, deliveryFee: 0, discount: 0, others: 4, includeSelf: true, rounded: true })
check('ยอดน้อยหารคนเยอะ ผลรวม', r3.mineSatang + sum(r3.othersSatang), 600)

/* ── ส่วนลดเกินยอด ───────────────────────────────────────────── */
const r4 = computeSplit({ amount: 100, deliveryFee: 0, discount: 500, others: 2, includeSelf: true, rounded: true })
check('ส่วนลดเกินยอด ไม่ติดลบ', r4.totalSatang, 0)

/* ── เศษ 1 สตางค์ ───────────────────────────────────────────── */
for (const [t, n] of [[10001, 3], [999, 7], [1, 3], [123456, 11]] as const) {
  const a = splitEven(t, n)
  if (sum(a) !== t) { console.log(`✗ splitEven(${t},${n}) รวม ${sum(a)}`); fail++ }
  const b = splitRounded(t, n)
  if (sum(b) !== t) { console.log(`✗ splitRounded(${t},${n}) รวม ${sum(b)}`); fail++ }
}
console.log(fail === 0 ? '\nผ่านหมด' : `\n★ ล้ม ${fail}`)
