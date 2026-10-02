/**
 * พิกัดและระยะทาง — ไม่พึ่งบริการภายนอกเลย
 *
 * ★★★ ข้อกำหนดห้ามใช้ Google API ที่ต้องมีกุญแจหรือมีค่าใช้จ่าย
 *     (Distance Matrix · Directions · Places · Maps JavaScript)
 *     ★ สิ่งที่ยังใช้ได้คือ "ลิงก์" ของ Google Maps ซึ่งเป็นแค่ URL
 *       ★★ ทุกอย่างในไฟล์นี้จึงเป็นเลขคณิตล้วน ไม่มีคำขอออกนอกเครื่อง
 */

/** รัศมีโลกเฉลี่ย (เมตร) */
const EARTH_RADIUS_M = 6_371_000

/**
 * ระยะเส้นตรงระหว่างสองพิกัด (เมตร) — สูตร Haversine
 *
 * ★ ใช้ atan2 ไม่ใช่ asin
 *   ★★ asin เสียความแม่นยำเมื่อสองจุดอยู่เกือบตรงข้ามโลก ซึ่งไม่เกิดกับ
 *      ร้านรอบออฟฟิศก็จริง แต่ atan2 ไม่ได้แพงกว่าและไม่มีกรณีที่มันแย่กว่า
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * ตัวคูณชดเชยถนนที่ไม่ตรง — ตามข้อกำหนด
 *
 * ★ เส้นตรงระหว่างสองจุดไม่ใช่ระยะที่คนเดินจริง เพราะต้องอ้อมตึกและข้ามถนน
 *   ★★ 1.3 เป็นค่าที่ข้อกำหนดระบุ ไม่ใช่ค่าที่เลือกเอง
 */
export const ROAD_FACTOR = 1.3

/** เดินได้ถ้าไม่เกินกี่เมตร — ตามข้อกำหนด */
export const WALK_LIMIT_M = 800
/** เดินได้กี่เมตรต่อนาที */
const WALK_M_PER_MIN = 80
/** ขับได้กี่เมตรต่อนาที */
const DRIVE_M_PER_MIN = 400

export type TravelMode = 'walking' | 'driving'

export type Travel = {
  /** ระยะตามถนน (เมตร) — เส้นตรง × ROAD_FACTOR */
  meters: number
  mode: TravelMode
  /** นาที ปัดขึ้น ขั้นต่ำ 1 */
  minutes: number
}

/**
 * แปลงพิกัดคู่หนึ่งเป็น "เดิน X นาที" หรือ "ขับ X นาที"
 *
 * ★★ ปัดขึ้นเสมอและขั้นต่ำ 1 นาที ตามข้อกำหนด
 *    ★ "0 นาที" ไม่ใช่คำตอบที่มีความหมายกับคนที่กำลังจะออกจากตึก
 */
export function travelFrom(
  officeLat: number,
  officeLng: number,
  shopLat: number,
  shopLng: number,
): Travel {
  const straight = haversineMeters(officeLat, officeLng, shopLat, shopLng)
  const meters = Math.round(straight * ROAD_FACTOR)
  const mode: TravelMode = meters <= WALK_LIMIT_M ? 'walking' : 'driving'
  const perMin = mode === 'walking' ? WALK_M_PER_MIN : DRIVE_M_PER_MIN
  return { meters, mode, minutes: Math.max(1, Math.ceil(meters / perMin)) }
}

/**
 * ลิงก์เส้นทาง Google Maps — เป็น URL ล้วน ไม่ใช่ API
 *
 * ★ บนมือถือ ลิงก์รูปแบบนี้เปิดแอป Google Maps ให้เอง
 *   ★★ จึงไม่ต้องตรวจว่าเป็นมือถือหรือเดสก์ท็อปแล้วแยกลิงก์
 *      ระบบปฏิบัติการตัดสินใจเองได้ดีกว่าที่เราเดาจาก user agent
 */
export function directionsUrl(
  officeLat: number,
  officeLng: number,
  shopLat: number,
  shopLng: number,
  mode: TravelMode,
): string {
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${officeLat},${officeLng}` +
    `&destination=${shopLat},${shopLng}` +
    `&travelmode=${mode}`
  )
}

/** ร้านไม่มีพิกัด — ค้นด้วยชื่อแทน (ตามข้อกำหนดของการ์ดผลลัพธ์วงล้อ) */
export function searchUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
}

/**
 * ดึง lat/lng จากลิงก์ Google Maps ที่ผู้ใช้วางมา
 *
 * ★★ รองรับรูปแบบที่พบจริงเวลาคนกด "แชร์" หรือก๊อปจากแถบที่อยู่:
 *      …/@13.7563,100.5018,17z        ← ตำแหน่งกล้อง
 *      …?q=13.7563,100.5018
 *      …/place/ชื่อ/@13.7563,100.5018
 *      …!3d13.7563!4d100.5018         ← พิกัดหมุดจริงในลิงก์แบบยาว
 *
 * ★★★ ลำดับสำคัญ: !3d/!4d มาก่อน @
 *
 *     ในลิงก์ที่มีทั้งคู่ @ คือ "กล้องมองอยู่ตรงไหน" ส่วน !3d/!4d คือ
 *     "หมุดปักอยู่ตรงไหน" ★ สองค่านี้ต่างกันได้หลายร้อยเมตรเมื่อคนเลื่อน
 *     แผนที่ก่อนก๊อปลิงก์ — ซึ่งเกินเกณฑ์ 200 ม. ของป้าย "รีวิวที่ร้าน" ไปแล้ว
 *
 * ★ ลิงก์ย่อ (maps.app.goo.gl) ดึงไม่ได้ เพราะพิกัดอยู่หลัง redirect
 *   ★★ จะตามต้องยิงคำขอออกนอก ซึ่งแปลว่า server ยิงไปยัง URL ที่ผู้ใช้
 *      พิมพ์มาเอง — นั่นคือ SSRF ★ ไม่คุ้มกับความสะดวกที่ได้
 *      คืน null แล้วให้ UI บอกว่า "ลากหมุดแทน" ตามข้อกำหนด
 */
export function parseLatLngFromMapUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null

  const take = (lat: string | undefined, lng: string | undefined) => {
    if (lat === undefined || lng === undefined) return null
    const a = Number(lat)
    const b = Number(lng)
    /* ★ ตรวจช่วงด้วย ไม่ใช่แค่ "เป็นตัวเลขไหม" — ลิงก์ที่มีเลขอื่นอยู่ใกล้ ๆ
         ทำให้ regex จับได้ค่าที่ไม่ใช่พิกัดเลย เช่น ระดับการซูม */
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
    return { lat: a, lng: b }
  }

  const bang = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (bang) {
    const hit = take(bang[1], bang[2])
    if (hit) return hit
  }

  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) {
    const hit = take(at[1], at[2])
    if (hit) return hit
  }

  const q = url.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (q) {
    const hit = take(q[1], q[2])
    if (hit) return hit
  }

  return null
}
