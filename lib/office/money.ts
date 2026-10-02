/**
 * เงิน — คำนวณเป็นสตางค์จำนวนเต็มเสมอ
 *
 * ★★★ ทำไมต้องมีไฟล์นี้ ทั้งที่ฐานข้อมูลเก็บเป็น numeric(12,2) ซึ่งแม่นอยู่แล้ว
 *
 *     ★ numeric ของ Postgres แม่นจริง — 0.1 + 0.2 ได้ 0.3 เป๊ะ
 *       ★★ แต่พอค่าเดินทางผ่าน JSON มาถึง JavaScript มันกลายเป็น number
 *          ซึ่งเป็น IEEE-754 double ★ บวกกัน 3 ครั้งก็เริ่มได้ 0.30000000000000004
 *     ★ และการ "หารเงินให้ลงตัว" เป็นงานที่ทำฝั่ง JS ทั้งหมด —
 *       ★★ หาร 100 บาทให้ 3 คนด้วย float จะได้ 33.333333333333336 × 3
 *          = 100.00000000000001 ซึ่งไม่เท่ากับยอดบิล
 *
 * ★★ กฎของไฟล์นี้: รับบาท → แปลงเป็นสตางค์ทันที → คำนวณเป็น integer →
 *    แปลงกลับเป็นบาทตอนจะเก็บหรือจะแสดงเท่านั้น
 *    ★ ไม่มีจุดไหนในระหว่างทางที่เป็นทศนิยม
 */

/** บาท (number จาก JSON หรือจากช่องกรอก) → สตางค์ (integer) */
export function toSatang(baht: number | string): number {
  const n = typeof baht === 'string' ? Number(baht) : baht
  if (!Number.isFinite(n)) return 0
  /*
   * ★★ Math.round ไม่ใช่ Math.trunc
   *    ★ 1.15 * 100 ใน IEEE-754 ได้ 114.99999999999999 ★★ trunc จะได้ 114
   *       ซึ่งคือการกินเงินผู้ใช้ไป 1 สตางค์ทุกครั้งที่เจอเลขแบบนี้
   */
  return Math.round(n * 100)
}

/** สตางค์ → บาท สำหรับเก็บลง numeric(12,2) หรือส่งออก */
export function toBaht(satang: number): number {
  return satang / 100
}

/**
 * หารยอดให้คน n คน โดยผลรวมเท่ากับยอดตั้งต้นเป๊ะเสมอ
 *
 * ★★★ เศษตกที่ "คนแรกในรายการ" ซึ่งผู้เรียกต้องส่งคนสร้างบิลมาเป็นคนแรก
 *
 *     ★ 100 บาท หาร 3 = 33.34 / 33.33 / 33.33 ★★ ไม่ใช่ 33.33 ทุกคน
 *       ซึ่งจะรวมได้ 99.99 แล้วเจ้าของบิลขาดไป 1 สตางค์ทุกครั้ง
 *     ★ ให้เศษตกที่คนสร้างบิลเพราะเขาคือคนที่ออกเงินไปก่อน —
 *       ★★ การให้คนอื่นจ่ายเกินคนละสตางค์โดยไม่รู้ตัว แย่กว่าให้คนที่
 *          ตั้งใจเป็นเจ้าภาพรับเศษไปเอง
 *
 * @param totalSatang ยอดรวมเป็นสตางค์
 * @param n           จำนวนคน (รวมคนสร้างบิลถ้าเขาร่วมจ่าย)
 * @returns           อาร์เรย์สตางค์ ยาว n · ผลรวมเท่ากับ totalSatang เป๊ะ
 */
export function splitEven(totalSatang: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(totalSatang / n)
  const rest = totalSatang - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0))
}

/**
 * หารแบบปัดขึ้นเป็นบาทเต็ม — ส่วนต่างตกที่คนแรก
 *
 * ★★ "คนละ ฿34" อ่านง่ายกว่า "คนละ ฿33.34" มากในชีวิตจริง
 *    ★ คนโอนเงินเป็นบาทเต็มอยู่แล้ว การขอ 33.34 ทำให้ต้องพิมพ์ทศนิยม
 *      ★★ และยอดที่ปัดขึ้นรวมแล้วเกินบิล — ส่วนเกินต้องไปลดของคนแรก
 *         ไม่ใช่ปล่อยให้เจ้าของบิลได้เงินเกินยอดที่จ่ายจริง
 *
 * @returns อาร์เรย์สตางค์ · คนที่ 1 คือคนสร้างบิล (รับส่วนต่าง)
 */
export function splitRounded(totalSatang: number, n: number): number[] {
  if (n <= 0) return []
  /* ★ ปัดขึ้นเป็นบาทเต็มต่อคน */
  const per = Math.ceil(totalSatang / n / 100) * 100
  const others = n - 1
  const firstShare = totalSatang - per * others
  /*
   * ★★ ถ้าปัดขึ้นแล้วคนอื่นจ่ายรวมเกินยอดบิล คนแรกจะติดลบ
   *    ★ เกิดได้กับยอดน้อย ๆ หารคนเยอะ (เช่น ฿10 หาร 5 คน → คนละ ฿2 พอดี
   *      แต่ ฿6 หาร 5 คน → ปัดเป็นคนละ ฿2 รวม ฿10 เกินไป ฿4)
   *      ★★ กรณีนี้ถอยไปใช้การหารแบบไม่ปัด ซึ่งรวมได้พอดีเสมอ
   */
  if (firstShare < 0) return splitEven(totalSatang, n)
  return [firstShare, ...Array.from({ length: others }, () => per)]
}

/**
 * กระจายส่วนลดตามสัดส่วนของแต่ละคน
 *
 * ★★ หักตามสัดส่วน ไม่ใช่หารเท่ากัน
 *    ★ คนที่สั่งของแพงกว่าควรได้ส่วนลดมากกว่า ★★ การหารส่วนลดเท่ากัน
 *      ในบิลที่แต่ละคนจ่ายไม่เท่ากัน ทำให้คนที่สั่งน้อยได้เปรียบเกินจริง
 *
 * ★ เศษจากการหารสัดส่วนตกที่คนแรกเหมือนทุกฟังก์ชันในไฟล์นี้
 */
export function applyDiscount(shares: number[], discountSatang: number): number[] {
  const total = shares.reduce((s, v) => s + v, 0)
  if (total <= 0 || discountSatang <= 0) return shares
  /* ★ ส่วนลดเกินยอดบิลไม่ได้ — ไม่งั้นจะได้หนี้ติดลบ */
  const cut = Math.min(discountSatang, total)

  const raw = shares.map((v) => Math.floor((v * cut) / total))
  const used = raw.reduce((s, v) => s + v, 0)
  let rest = cut - used

  return shares.map((v, i) => {
    /* ★ แจกเศษที่เหลือทีละสตางค์ตั้งแต่คนแรก จนหมด */
    const extra = rest > 0 ? 1 : 0
    if (extra) rest -= 1
    return v - raw[i]! - extra
  })
}

/** รวมยอดเป็นสตางค์จากรายการบาท — ไม่ให้ float เข้ามาระหว่างทาง */
export function sumSatang(bahtValues: (number | string)[]): number {
  return bahtValues.reduce<number>((s, v) => s + toSatang(v), 0)
}
