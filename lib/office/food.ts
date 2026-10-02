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
 * ★★★ "ลดโอกาส" ไม่ใช่ "ตัดออก"
 *
 *     เอกสารเขียนว่า "ลดโอกาสสุ่มได้ร้านที่ผู้ใช้เพิ่งไปภายใน 7 วัน"
 *     ★ การตัดออกเลยจะทำให้ร้านโปรดที่ไปทุกวันหายไปจากวงล้อถาวร
 *       ซึ่งไม่ใช่สิ่งที่คนขอ — เขาแค่อยากได้ความหลากหลายบ้าง
 *
 * ★★ วิธี: ใส่ร้านที่ไม่เพิ่งไปลงถังซ้ำ N ครั้ง แล้วสุ่มจากถัง
 *
 *    ★ ทำแบบนี้แทนการสุ่มถ่วงน้ำหนักจริง ๆ เพราะวงล้อต้องแสดง "ช่อง"
 *      ให้เห็นก่อนหมุน — ถ้าน้ำหนักไม่สะท้อนในจำนวนช่อง ภาพที่เห็น
 *      จะโกหกผู้ใช้ว่าโอกาสเท่ากันทั้งที่ไม่เท่า
 *
 *    ★★ ตรงนี้จึงไม่แตะ RandomWheel เลย — มันยังสุ่มจากรายการที่ได้รับ
 *       แบบเท่า ๆ กันเหมือนเดิม ความถ่วงอยู่ที่ "รายการที่ส่งเข้าไป"
 */
export const RECENT_WEIGHT = 3

export function weightByRecency(items: Restaurant[], recentIds: Set<string>): Restaurant[] {
  if (recentIds.size === 0) return items

  const out: Restaurant[] = []
  for (const r of items) {
    const times = recentIds.has(r.id) ? 1 : RECENT_WEIGHT
    for (let i = 0; i < times; i++) out.push(r)
  }

  /* ★ ถ้าทุกร้านเพิ่งไปหมด ถังจะเท่ากับรายการเดิม — ไม่มีอะไรให้ถ่วง
     คืนรายการเดิมไปดีกว่าปล่อยให้วงล้อมีช่องซ้ำโดยไม่ได้อะไร */
  return out.length === items.length ? items : out
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
