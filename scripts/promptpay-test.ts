/**
 * ชุดทดสอบ QR พร้อมเพย์ — รันด้วย: npx tsx scripts/promptpay-test.ts
 *
 * ★ QR ที่ผิดจะสแกนไม่ผ่านโดยไม่มีอะไรบอก ★★ และคนจะคิดว่าแอปธนาคารพัง
 *   ไม่ใช่ว่าเราสร้างสายอักขระผิด — จึงต้องมีชุดทดสอบที่รันซ้ำได้
 */
import { promptPayPayload, isValidPromptPayId } from '@/lib/office/promptpay'
let fail = 0
const ck = (n: string, got: unknown, want: unknown) => {
  const ok = got === want; if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${n}${ok ? '' : ` → ${got} ควรเป็น ${want}`}`)
}
/* ★ ค่าอ้างอิงจากตัวอย่างที่ใช้กันทั่วไปของมาตรฐานพร้อมเพย์ */
const a = promptPayPayload('0812345678', 100)!
console.log('เบอร์+ยอด:', a)
ck('ขึ้นต้นเวอร์ชัน', a.slice(0, 6), '000201')
ck('ครั้งเดียวเมื่อมียอด', a.slice(6, 12), '010212')
ck('มีเบอร์แปลงแล้ว', a.includes('0066812345678'), true)
ck('สกุลเงินบาท', a.includes('5303764'), true)
ck('ยอด 100.00', a.includes('54061'[0] + '4'.slice(0,0) + '06100.00') || a.includes('5406100.00'), true)
ck('ประเทศ TH', a.includes('5802TH'), true)
ck('ยาวพอดีกับ CRC', a.slice(-8, -4), '6304')

const b = promptPayPayload('0812345678')!
ck('ไม่มียอด = ใช้ซ้ำได้', b.slice(6, 12), '010211')
ck('ไม่มียอด ไม่มีช่อง 54', /54\d{2}/.test(b.replace(/5802TH.*/, '')), false)

ck('บัตรประชาชน 13 หลัก', promptPayPayload('1234567890123', 50)!.includes('02131234567890123'), true)
ck('เลขผิด → null', promptPayPayload('123', 10), null)
ck('ตรวจเลขถูก', isValidPromptPayId('0812345678'), true)
ck('ตรวจเลขผิด', isValidPromptPayId('12345'), false)

/* ★ CRC ต้องเปลี่ยนเมื่อยอดเปลี่ยน */
ck('CRC ต่างเมื่อยอดต่าง', promptPayPayload('0812345678', 100)!.slice(-4) !== promptPayPayload('0812345678', 200)!.slice(-4), true)
console.log(fail === 0 ? '\nผ่านหมด' : `\n★ ล้ม ${fail}`)
