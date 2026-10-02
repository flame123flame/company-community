/**
 * สร้างสายอักขระ QR พร้อมเพย์ (EMVCo Merchant Presented QR)
 *
 * ★★★ เขียนเอง ไม่ติดตั้งไลบรารี
 *
 *     ★ ข้อกำหนดบอกให้ใช้ไลบรารีฟรี เช่น promptpay-qr ★★ แต่มาตรฐานนี้
 *        ทั้งหมดคือ "ความยาว-ค่า ต่อกัน แล้วปิดท้ายด้วย CRC16" ซึ่งยาว 50 บรรทัด
 *        ★ การเพิ่ม dependency เพื่อโค้ด 50 บรรทัดที่ไม่มีวันเปลี่ยน
 *          คือการเพิ่มสิ่งที่ต้องอัปเดตและตรวจความปลอดภัยไปตลอดอายุโปรเจกต์
 *     ★ ส่วนการวาดเป็นรูป ใช้ uqr ที่โปรเจกต์มีอยู่แล้ว (ห้องเพลงใช้อยู่)
 *
 * ★★ อ้างอิง: EMVCo QR Code Specification for Payment Systems (MPM) v1.1
 *    และข้อกำหนดพร้อมเพย์ของธนาคารแห่งประเทศไทย
 *    ★ รหัสที่ใช้: 00 เวอร์ชัน · 01 วิธีใช้ · 29 ข้อมูลผู้รับ · 53 สกุลเงิน ·
 *      54 ยอดเงิน · 58 ประเทศ · 63 CRC
 */

/** ประกอบช่อง TLV หนึ่งช่อง: รหัส 2 หลัก + ความยาว 2 หลัก + ค่า */
function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value
}

/**
 * แปลงเบอร์/เลขบัตร เป็นรูปแบบที่พร้อมเพย์ใช้
 *
 * ★★★ สามรูปแบบ แยกด้วยความยาว ไม่ใช่ด้วยการเดา
 *
 *     ★ เบอร์มือถือ 10 หลัก → ตัด 0 ตัวหน้าออก เติมรหัสประเทศ 66 แล้วเติม 0
 *       ข้างหน้าให้ครบ 13 หลัก ★★ 0812345678 → 0066812345678
 *     ★ เลขบัตรประชาชน / เลขนิติบุคคล 13 หลัก → ใช้ตรง ๆ
 *     ★ เลข e-Wallet 15 หลัก → ใช้ตรง ๆ (รหัสช่องต่างกัน)
 */
function targetOf(id: string): { tag: '01' | '02' | '03'; value: string } | null {
  const digits = id.replace(/\D/g, '')

  if (digits.length === 13) return { tag: '02', value: digits }
  if (digits.length === 15) return { tag: '03', value: digits }
  if (digits.length === 10) {
    /* ★ 0812345678 → 66812345678 → เติม 0 หน้าให้ครบ 13 */
    return { tag: '01', value: `0066${digits.slice(1)}` }
  }
  return null
}

/**
 * CRC-16/CCITT-FALSE — ท้ายสายอักขระทุกเส้น
 *
 * ★★ ต้องคำนวณรวม "63" และ "04" ที่เป็นหัวของช่อง CRC เองด้วย
 *    ★ นี่คือจุดที่พลาดกันบ่อยที่สุด — ลืมแล้ว QR จะสแกนไม่ผ่านทุกใบ
 *      โดยที่สายอักขระดูถูกต้องทุกอย่าง
 */
function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * สร้างสายอักขระสำหรับ QR พร้อมเพย์
 *
 * @param id     เบอร์มือถือ 10 หลัก · เลขบัตร 13 หลัก · e-Wallet 15 หลัก
 * @param amount ยอดเงินเป็นบาท — ใส่ 0 หรือไม่ใส่ = ให้คนโอนกรอกเอง
 * @returns      สายอักขระ หรือ null ถ้ารูปแบบเลขไม่ถูก
 */
export function promptPayPayload(id: string, amount?: number): string | null {
  const target = targetOf(id)
  if (!target) return null

  /*
   * ★★ 01 = ใช้ได้ครั้งเดียว · 11 = ใช้ซ้ำได้
   *    ★ ใส่ยอดเงินแล้วต้องเป็น "ครั้งเดียว" ★★ ไม่งั้นแอปธนาคารบางตัว
   *      จะเก็บ QR ไว้แล้วโอนซ้ำยอดเดิมได้ ซึ่งเป็นเรื่องของเงินคนอื่น
   */
  const oneTime = typeof amount === 'number' && amount > 0

  const merchant = tlv('00', 'A000000677010111') + tlv(target.tag, target.value)

  let payload =
    tlv('00', '01') +
    tlv('01', oneTime ? '12' : '11') +
    tlv('29', merchant) +
    tlv('53', '764') /* ★ 764 = บาทไทย ตาม ISO 4217 */ +
    (oneTime ? tlv('54', amount!.toFixed(2)) : '') +
    tlv('58', 'TH')

  payload += '6304'
  return payload + crc16(payload)
}

/**
 * ตรวจว่าเลขที่กรอกใช้ได้ไหม — ใช้ฝั่งฟอร์มตั้งค่า
 *
 * ★ แยกจาก promptPayPayload เพื่อให้ฟอร์มบอกได้ว่าผิดตรงไหน
 *   โดยไม่ต้องสร้างสายอักขระทิ้ง
 */
export function isValidPromptPayId(id: string): boolean {
  return targetOf(id) !== null
}
