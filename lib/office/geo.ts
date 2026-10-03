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

/* ═══════════════════════════════════════════════════════════════════
 * เวลาเปิด-ปิด
 * ═══════════════════════════════════════════════════════════════════ */

/** คีย์วันใน open_hours — เรียงตามลำดับของ Date.getDay() (0 = อาทิตย์) */
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayKey = (typeof DAY_KEYS)[number]

/** {"mon":["09:00","18:00"], "sun":null, …} — null = ปิดทั้งวัน */
export type OpenHours = Partial<Record<DayKey, [string, string] | null>>

/** "09:30" → 570 นาทีจากเที่ยงคืน · รูปแบบผิด → null */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * ตอนนี้ร้านเปิดอยู่ไหม
 *
 * ★ คืน null เมื่อ "ตอบไม่ได้" ไม่ใช่ false
 *   ★★ ร้านที่ไม่ได้กรอกเวลา กับร้านที่กรอกแล้วว่าปิด เป็นคนละเรื่อง
 *      ข้อกำหนดบอกว่า "ถ้าไม่มีข้อมูลก็ไม่ต้องแสดง" ซึ่งทำได้ก็ต่อเมื่อ
 *      แยกสองกรณีนี้ออกจากกันได้
 *
 * ★★★ รองรับช่วงที่ข้ามเที่ยงคืน เช่น ["18:00","02:00"]
 *
 *     ร้านข้าวต้มรอบดึกเปิดแบบนี้เป็นปกติ ★ ถ้าเทียบตรง ๆ ว่า
 *     `now >= open && now < close` ร้านพวกนี้จะถูกบอกว่า "ปิดแล้ว"
 *     ตลอด 24 ชั่วโมง เพราะ 02:00 < 18:00 เสมอ
 *     ★★ และตอนตีหนึ่งต้องดูช่วงของ "เมื่อวาน" ไม่ใช่ของวันนี้
 */
export function isOpenNow(hours: OpenHours | null | undefined, at: Date): boolean | null {
  if (!hours || Object.keys(hours).length === 0) return null

  const nowMin = at.getHours() * 60 + at.getMinutes()

  /* ★ ตรวจทั้งช่วงของวันนี้ และช่วงของเมื่อวานที่ลากข้ามเที่ยงคืนมาถึงตอนนี้ */
  for (const back of [0, 1]) {
    const dayIndex = (at.getDay() - back + 7) % 7
    const key = DAY_KEYS[dayIndex]
    if (!key) continue

    const span = hours[key]
    if (span === undefined) continue
    if (span === null) continue

    const open = toMinutes(span[0])
    const close = toMinutes(span[1])
    if (open === null || close === null) continue

    const crossesMidnight = close <= open

    if (back === 0) {
      if (crossesMidnight ? nowMin >= open : nowMin >= open && nowMin < close) return true
    } else if (crossesMidnight && nowMin < close) {
      /* ★ เมื่อวานเปิดถึงตีสอง และตอนนี้ยังไม่ถึงตีสอง = ยังเปิดอยู่ */
      return true
    }
  }

  /*
   * ★ มาถึงตรงนี้แปลว่าไม่มีช่วงไหนครอบเวลานี้
   *   ★★ แต่ต้องแน่ใจว่า "มีข้อมูลของวันนี้จริง" ก่อนจะตอบว่าปิด
   *      ร้านที่กรอกแค่วันจันทร์ ไม่ได้แปลว่าวันอาทิตย์ปิด — แปลว่าไม่รู้
   */
  const todayKey = DAY_KEYS[at.getDay()]
  if (!todayKey || hours[todayKey] === undefined) return null
  return false
}

/* ═══════════════════════════════════════════════════════════════════
 * ป้ายการเดินทาง 3 ขั้น (Phase 1)
 * ═══════════════════════════════════════════════════════════════════ */

/** ไกลกว่านี้ถือว่าเดลิเวอรี (เมตร) — ตามข้อกำหนด */
export const DELIVERY_LIMIT_M = 15_000

export type DistanceTag = 'WALK' | 'DRIVE' | 'DELIVERY'

/**
 * ป้ายการเดินทางจากระยะตามถนน
 *
 * ★★ สามขั้น ไม่ใช่สองขั้นแบบ travel_mode ที่เก็บในฐานข้อมูล
 *    ★ travel_mode ตอบคำถาม "ลิงก์เส้นทางควรเป็น walking หรือ driving"
 *      ซึ่ง Google Maps รับแค่สองค่านี้
 *    ★★ ส่วนป้ายนี้ตอบคำถามของคน: "ไปยังไงดี" — ซึ่งมีคำตอบที่สามคือ
 *       "ไกลเกินกว่าจะไปเอง สั่งมากินดีกว่า"
 *    ★ สองอย่างนี้จึงไม่ใช่ของเดียวกัน และไม่ควรยุบรวม
 */
export function distanceTag(meters: number | null | undefined): DistanceTag | null {
  if (meters == null) return null
  if (meters <= WALK_LIMIT_M) return 'WALK'
  if (meters <= DELIVERY_LIMIT_M) return 'DRIVE'
  return 'DELIVERY'
}

/* ═══════════════════════════════════════════════════════════════════
 * โดเมนที่ยอมให้ตามลิงก์ไปได้
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * ★★★ allowlist ไม่ใช่ blocklist
 *
 *     endpoint นี้ให้ server ยิงคำขอไปยัง URL ที่ผู้ใช้พิมพ์มาเอง
 *     ซึ่งคือรูปแบบของ SSRF ★ การ "ห้ามบางโดเมน" ปิดไม่ได้ เพราะคนโจมตี
 *     เลือกโดเมนได้อิสระ ★★ ต้องกลับด้าน: อนุญาตเฉพาะที่รู้จักเท่านั้น
 *
 * ★★ ตรวจทุก hop ของ redirect ไม่ใช่แค่ URL แรก
 *    ★ ลิงก์ของ Google ที่ redirect ไปโดเมนอื่นได้ คือทางอ้อมเข้าเครือข่ายใน
 */
const MAP_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
  'g.co',
])

/** โฮสต์นี้อยู่ใน allowlist ไหม (รวมโดเมนประเทศ เช่น google.co.th) */
export function isAllowedMapHost(host: string): boolean {
  const h = host.toLowerCase()
  if (MAP_HOSTS.has(h)) return true
  /* ★ google.co.th · google.de — ยอมเฉพาะรูปแบบ (www.|maps.)google.<tld> */
  return /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)
}

/**
 * ระยะทางในรูปแบบที่พร้อมเอาไปเข้าคำแปล
 *
 * ★★★ ของเดิมบอกแต่ "เดิน ~6 นาที" ไม่เคยบอกเป็นระยะทางเลยสักที่
 *
 *     ★ นาทีตอบว่า "ไปนานไหม" แต่ไม่ตอบว่า "ไกลแค่ไหน"
 *       ★★ ซึ่งเป็นคำถามที่คนถามเวลาตัดสินใจว่าจะเดินหรือเรียกรถ
 *     ★ และนาทีของเราเป็นค่าประมาณจากความเร็วคงที่ — ระยะทางวัดได้จริงกว่า
 *
 * ★★★ คืนตัวเลขกับหน่วย ไม่ใช่สตริงสำเร็จรูป
 *
 *     ★ "350 ม." ที่ประกอบในนี้จะหลุดเป็นภาษาไทยในทุกภาษา
 *       ★★ และ scripts/i18n-test.ts จะจับได้ทันที ซึ่งถูกต้องแล้ว
 *     ★ ตัวเรียกเอาไปใส่ ot('food.geo.metres'|'food.geo.km', { n }) เอง
 *
 * ★★ ต่ำกว่า 1 กม. ปัดเป็นหลักสิบเมตร ★ ความแม่นระดับเมตรเดียวเป็น
 *    ความแม่นปลอม เพราะเราคูณ ROAD_FACTOR จากระยะเส้นตรงอยู่แล้ว
 */
export function distanceParts(
  meters: number | null | undefined,
): { unit: 'm' | 'km'; n: number } | null {
  if (meters == null || !Number.isFinite(meters)) return null
  if (meters < 1000) return { unit: 'm', n: Math.round(meters / 10) * 10 }
  return { unit: 'km', n: Math.round(meters / 100) / 10 }
}
