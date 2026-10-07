/**
 * เวลาไทยสำหรับโค้ดฝั่ง server
 *
 * ★★★ Vercel รันทุกอย่างด้วยเขตเวลา UTC และเปลี่ยนไม่ได้
 *
 *     ★ ลองตั้งตัวแปรสภาพแวดล้อม TZ=Asia/Bangkok แล้ว — Vercel ตอบว่า
 *       "The name of your Environment Variable is reserved"
 *       ★★ จึงต้องแก้ที่โค้ด ซึ่งดีกว่าอยู่แล้ว เพราะไม่ผูกกับค่าตั้ง deploy
 *          ที่คนอื่นมองไม่เห็นตอนอ่านโค้ด
 *
 * ★★★ ผลที่เกิดจริงถ้าไม่แก้ — ไม่ใช่เรื่องความสวยงาม
 *
 *     ★ ตัวกรอง "เปิดอยู่ตอนนี้" ของหน้าร้านเด็ดเทียบเวลาร้าน (10:00–20:00
 *       ตามเวลาไทย) กับนาฬิกาของ server ★★ บ่ายสามโมงที่กรุงเทพคือ 08:00 UTC
 *       ซึ่งยังไม่ถึงเวลาเปิด — ร้านที่เปิดอยู่จริงจะถูกกรองทิ้งทั้งหมด
 *     ★ "กินร้านนี้กี่ครั้งเดือนนี้" คิดขอบเดือนจาก UTC ★★ ช่วงเที่ยงคืนถึง
 *       เจ็ดโมงเช้าของวันที่ 1 ตามเวลาไทย server ยังนับว่าเป็นเดือนก่อน
 *
 * ★★ ใช้ Intl ไม่ใช่บวกเจ็ดชั่วโมงเอง
 *    ★ บวกเองได้คำตอบเดียวกันวันนี้ เพราะไทยไม่มีเวลาออมแสง
 *      ★★ แต่มันคือการฝังสมมติฐานไว้ในเลข 7 ซึ่งไม่มีใครรู้ว่าทำไมในวันข้างหน้า
 *         และผิดทันทีถ้าวันหนึ่งต้องรองรับสาขาในเขตเวลาอื่น
 */

export const OFFICE_TZ = 'Asia/Bangkok'

/**
 * ชิ้นส่วนของเวลาไทยตอนนี้
 *
 * ★ คืนเป็นตัวเลขแยกชิ้น ไม่ใช่ Date ★★ Date พก "เขตเวลาของเครื่อง" มาด้วยเสมอ
 *   การคืน Date ที่ถูกเลื่อนแล้วจะทำให้คนเรียกเผลอใช้ .toISOString() ต่อ
 *   แล้วได้เวลาที่ผิดไปอีกเจ็ดชั่วโมงโดยไม่รู้ตัว
 */
function parts(at: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })

  const got: Record<string, string> = {}
  for (const p of fmt.formatToParts(at)) got[p.type] = p.value

  const WEEKDAY: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }

  return {
    year: Number(got.year),
    month: Number(got.month),
    day: Number(got.day),
    /* ★ 24 ชั่วโมงบางเครื่องคืน "24" สำหรับเที่ยงคืน — แปลงเป็น 0 */
    hour: Number(got.hour) % 24,
    minute: Number(got.minute),
    weekday: WEEKDAY[got.weekday ?? 'Sun'] ?? 0,
  }
}

/** วันนี้ตามเวลาไทย เป็น YYYY-MM-DD */
export function bangkokToday(at?: Date): string {
  const p = parts(at)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** วันแรกของเดือนนี้ตามเวลาไทย เป็น YYYY-MM-01 */
export function bangkokMonthStart(at?: Date): string {
  const p = parts(at)
  return `${p.year}-${String(p.month).padStart(2, '0')}-01`
}

/**
 * Date ที่ตัวอ่านแบบ local (getHours · getDay) ให้ค่าตามเวลาไทย
 *
 * ★★★ มีไว้ให้ฟังก์ชันที่รับ Date แล้วเรียก getHours() เอง — เช่น isOpenNow
 *
 *     ★ ไม่ใช่ "เวลาจริง" อีกต่อไป ★★ ห้ามเอาไปแปลงเป็น ISO หรือเก็บลงฐานข้อมูล
 *        ★ ชื่อฟังก์ชันจึงบอกว่ามันเป็น "หน้าปัดนาฬิกา" ไม่ใช่ "เวลา"
 */
export function bangkokWallClock(at?: Date): Date {
  const p = parts(at)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0)
}
