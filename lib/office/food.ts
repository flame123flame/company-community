import type { DistanceBand, PriceRange } from '@/types/database'
import type { OfficeKey, Ot } from '@/lib/i18n/office-format'

/**
 * ชนิดข้อมูลและกติกาที่หน้าร้านเด็ดกับหน้าสุ่มใช้ร่วมกัน
 *
 * ★ วางไว้ที่เดียวเพราะสองหน้านี้อ่านร้านชุดเดียวกัน (ดูหัวข้อ 2 ของเอกสาร)
 *   ถ้าแยกนิยามกัน วันที่เพิ่มฟิลด์ใหม่จะมีหน้าหนึ่งที่ลืมแก้
 */

export type Restaurant = {
  id: string
  name: string
  signatureDish: string
  imagePath: string | null
  cuisine: string | null
  priceRange: PriceRange | null
  distance: DistanceBand | null
  mapUrl: string | null
  note: string | null
  addedBy: string | null
  addedByName: string | null
  voteCount: number
  maybeClosed: boolean
  voted: boolean
  canManage: boolean
  /** ISO — ใช้เรียง "เพิ่มล่าสุด" ซึ่งเป็นการเรียงเริ่มต้นของหน้าร้านเด็ด */
  createdAt: string
  /** ดาวเฉลี่ย — null = ยังไม่มีใครรีวิว (ไม่ใช่ 0 ซึ่งแปลว่า "แย่") */
  rating: number | null
  ratingCount: number
  /** รูปปกการ์ด = รูปล่าสุดจากรีวิว */
  coverUrl: string | null
  /* ── พิกัดและระยะทาง (0050) — null ได้เสมอ ร้านเก่ายังไม่มีพิกัด ── */
  lat: number | null
  lng: number | null
  /** ระยะตามถนนจากออฟฟิศ (เมตร) — null = ไม่มีพิกัดร้านหรือยังไม่ตั้งพิกัดออฟฟิศ */
  travelMeters: number | null
  travelMinutes: number | null
  travelMode: 'walking' | 'driving' | null
  /** {"mon":["09:00","18:00"], "sun":null, …} — null = ไม่ได้กรอก */
  openHours: Record<string, [string, string] | null> | null
}

export type RestaurantList = {
  items: Restaurant[]
  cuisines: string[]
}

export const PRICE_OPTIONS: PriceRange[] = ['฿', '฿฿', '฿฿฿']
export const DISTANCE_OPTIONS: DistanceBand[] = ['WALK', 'DRIVE', 'DELIVERY']

/*
 * ★★★ ป้ายพวกนี้รับ `ot` เป็นพารามิเตอร์ ไม่เรียก ot() เอง
 *
 *     ★ มันถูกเรียกทั้งจาก client component (ที่ ot มาจาก useOt()) และจาก
 *       โค้ดฝั่ง server (ที่ ot มาจาก getOt()) ★★ ไฟล์นี้จึงไม่มีทางรู้ว่า
 *       ภาษาของคนอ่านคืออะไร และไม่ควรรู้
 *     ★ ทางที่ผิดคือเก็บภาษาไว้ในตัวแปรระดับโมดูล — ★★ server เรนเดอร์
 *       หลายคำขอพร้อมกัน คนละภาษา บนตัวแปรก้อนเดียวกัน แล้วภาษาจะสลับ
 *       กันเองแบบสุ่มโดยไม่มีอะไรฟ้อง
 */
export const distanceLabel = (ot: Ot, d: DistanceBand): string =>
  ot(`food.distance.${d}` as OfficeKey)

/**
 * เกณฑ์ "ร้านเด็ด" (FR-A07)
 *
 * ★★ 3 เสียงเท่ากับที่เอกสารระบุในหัวข้อ 8.2.1
 *
 *    ★ ตั้งเป็นค่าคงที่ ไม่ใช่ app_settings โดยตั้งใจ — มันไม่ใช่นโยบาย
 *      ที่ Admin ต้องปรับ แต่เป็นนิยามของคำว่า "เด็ด" ซึ่งถ้าเปลี่ยนไปมา
 *      คนจะงงว่าทำไมร้านเดิมหลุดจากโหมดนี้โดยไม่มีใครถอนโหวต
 */
export const PICK_THRESHOLD = 3

/**
 * ถ่วงน้ำหนักร้านที่เพิ่งไป (FR-A08)
 *
 * ★★★ เปลี่ยนวิธีแล้ว: สุ่มผู้ชนะก่อน แล้วค่อยหมุนวงล้อไปหยุดที่ช่องนั้น
 *
 *     ของเดิมถ่วงน้ำหนักด้วยการ "ใส่ร้านซ้ำหลายช่อง" และเขียนเหตุผลไว้ว่า
 *     ถ้าน้ำหนักไม่สะท้อนในจำนวนช่อง ภาพที่เห็นจะโกหกผู้ใช้
 *     ★ ข้อกำหนดใหม่สั่งตรงข้าม: "1 ร้าน = 1 ช่อง ขนาดเท่ากันทุกช่อง
 *       ห้ามใส่ชื่อร้านซ้ำหลายช่อง" และ "สุ่มผลลัพธ์แบบ weighted random ก่อน
 *       แล้วหมุนวงล้อไปหยุดที่ช่องของร้านนั้น"
 *
 *     ★★ เหตุผลของข้อกำหนดใหม่หนักกว่า: วงล้อที่มีชื่อซ้ำอ่านไม่ออกว่า
 *        มีกี่ร้านให้เลือก และร้านที่โผล่สามช่องดูเหมือนระบบเสียมากกว่า
 *        ดูเหมือนการถ่วงน้ำหนัก
 */
export const RECENT_WEIGHT = 3

/** วงล้อแสดงได้กี่ช่อง — ตามข้อกำหนด */
export const MAX_SLOTS = 12

/**
 * สุ่มผู้ชนะแบบถ่วงน้ำหนัก
 *
 * ★ ร้านที่ "ไม่เพิ่งไป" มีน้ำหนักมากกว่าร้านที่เพิ่งไป RECENT_WEIGHT เท่า
 *   ★★ ลดโอกาส ไม่ใช่ตัดออก — ร้านโปรดที่ไปทุกวันต้องไม่หายจากวงล้อถาวร
 *
 * ★★ rnd เป็นพารามิเตอร์เพื่อให้เทสต์ป้อนลำดับที่รู้ผลล่วงหน้าได้
 *    ★ ฟังก์ชันที่เรียก Math.random() ข้างในทดสอบได้แค่ "ไม่พัง"
 *      ซึ่งไม่ใช่สิ่งที่เราอยากรู้เกี่ยวกับการสุ่มถ่วงน้ำหนัก
 */
export function pickWeighted(
  items: Restaurant[],
  recentIds: Set<string>,
  rnd: () => number = Math.random,
): Restaurant | null {
  if (items.length === 0) return null

  const weights = items.map((r) => (recentIds.has(r.id) ? 1 : RECENT_WEIGHT))
  const total = weights.reduce((a, b) => a + b, 0)

  let t = rnd() * total
  for (let i = 0; i < items.length; i++) {
    t -= weights[i] as number
    /* ★ ใช้ < 0 ไม่ใช่ <= 0 — rnd() คืน 0 ได้ ซึ่งต้องตกที่ตัวแรกเสมอ */
    if (t < 0) return items[i] as Restaurant
  }
  /* ★ ตกมาถึงนี่ได้จากความคลาดเคลื่อนทศนิยมเท่านั้น — คืนตัวสุดท้าย */
  return items[items.length - 1] as Restaurant
}

/**
 * เลือกร้านมาแสดงบนวงล้อไม่เกิน MAX_SLOTS ช่อง
 *
 * ★★★ ผู้ชนะต้องอยู่ในชุดที่แสดงเสมอ — ข้อกำหนดระบุตรง ๆ
 *
 *     ★ ถ้าผู้ชนะไม่อยู่บนวงล้อ แอนิเมชันจะไม่มีช่องให้ไปหยุด
 *       ★★ ซึ่งแปลว่าต้องหยุดที่ช่องอื่นแล้วประกาศผลคนละอย่างกับที่ตาเห็น
 *          — เป็นการโกหกที่ผู้ใช้จับได้ทันที
 *
 * ★ เลือกตัวที่เหลือตามลำดับที่ส่งมา ไม่สุ่มซ้ำ — ลำดับนั้นมาจากตัวกรอง
 *   และการเรียงที่ผู้ใช้เลือกไว้แล้ว
 */
export function slotsForWheel(
  items: Restaurant[],
  winner: Restaurant,
  max: number = MAX_SLOTS,
): Restaurant[] {
  if (items.length <= max) return items

  const rest = items.filter((r) => r.id !== winner.id).slice(0, max - 1)
  /* ★ ผู้ชนะอยู่ตำแหน่งเดิมในลำดับ ไม่ใช่ถูกดันไปหัวแถว
       ★★ ดันไปหัวแถวทุกครั้ง = ผู้ชนะอยู่ช่องแรกเสมอ ซึ่งคนจับได้ในสามรอบ */
  const out = [...rest]
  const at = Math.min(items.indexOf(winner), out.length)
  out.splice(at, 0, winner)
  return out
}

export type Filters = {
  query: string
  cuisine: string | null
  price: PriceRange | null
  distance: DistanceBand | null
  onlyPicks: boolean
  /** id ของร้านที่ผู้ใช้กดตัดออกชั่วคราวในหน้าสุ่ม */
  excluded: Set<string>
}

export const emptyFilters = (): Filters => ({
  query: '',
  cuisine: null,
  price: null,
  distance: null,
  onlyPicks: false,
  excluded: new Set(),
})

/**
 * กรองร้านตามเงื่อนไข — ใช้ทั้งหน้ารายการและวงล้อ
 *
 * ★★ วงล้อไม่เอาร้านที่ "อาจปิดแล้ว" เสมอ ไม่ว่าตัวกรองจะตั้งยังไง
 *
 *    ★ การสุ่มได้ร้านที่ปิดไปแล้วคือความผิดพลาดที่ทำให้คนเลิกใช้ฟีเจอร์นี้
 *      ทันที — ต่างจากหน้ารายการที่ยังควรแสดงไว้ให้คนยืนยันว่ายังเปิดอยู่
 */
export function filterRestaurants(
  items: Restaurant[],
  filters: Filters,
  options: { forWheel?: boolean } = {},
): Restaurant[] {
  const q = filters.query.trim().toLowerCase()

  return items.filter((r) => {
    if (options.forWheel && r.maybeClosed) return false
    if (options.forWheel && filters.excluded.has(r.id)) return false
    if (filters.onlyPicks && r.voteCount < PICK_THRESHOLD) return false
    if (filters.cuisine && r.cuisine !== filters.cuisine) return false
    if (filters.price && r.priceRange !== filters.price) return false
    /*
     * ★★★ ฟิลเตอร์การเดินทางคิดจากระยะจริงก่อน แล้วค่อยถอยไปใช้แท็ก
     *
     *     ข้อกำหนด: "ให้คำนวณจากระยะจริงแทนแท็กที่กรอกเอง
     *     (ถ้าร้านยังไม่มีพิกัด ใช้แท็กเดิมไปก่อน)"
     *     ★ แท็กที่คนกรอกเองไม่มีใครมาแก้เมื่อย้ายออฟฟิศ ส่วนระยะจริง
     *       ถูกคิดใหม่ทั้งตารางทันทีที่พิกัดออฟฟิศเปลี่ยน
     *     ★★ DELIVERY ไม่ใช่ระยะทาง มันคือ "วิธีได้อาหาร" จึงยังใช้แท็กเสมอ
     */
    if (filters.distance) {
      if (filters.distance === 'DELIVERY') {
        if (r.distance !== 'DELIVERY') return false
      } else if (r.travelMode) {
        const want = filters.distance === 'WALK' ? 'walking' : 'driving'
        if (r.travelMode !== want) return false
      } else if (r.distance !== filters.distance) {
        return false
      }
    }
    if (q && !r.name.toLowerCase().includes(q) && !r.signatureDish.toLowerCase().includes(q)) {
      return false
    }
    return true
  })
}
