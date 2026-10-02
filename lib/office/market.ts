import type {
  ListingCategory,
  ListingCondition,
  ListingKind,
  ListingStatus,
} from '@/types/database'
import type { OfficeKey, Ot } from '@/lib/i18n/office-format'

/** ชนิดข้อมูลและชุดตัวเลือกของตลาดนัด (FR-D01–D06) */

/* ★ ส่งต่อชนิดจาก database.ts — ที่อื่นจะได้ import จากที่เดียว ไม่ใช่สองที่ */
export type { ListingCategory, ListingCondition, ListingKind, ListingStatus }

export type Listing = {
  id: string
  title: string
  price: number
  kind: ListingKind
  category: ListingCategory
  condition: ListingCondition | null
  description: string | null
  meet: { building: string | null; floor: string | null; desk: string | null }
  status: ListingStatus
  hidden: boolean
  images: string[]
  sellerId: string
  sellerName: string | null
  sellerAvatar: string | null
  sellerDepartment: string | null
  sellerHasQr: boolean
  queueCount: number
  /** ★ คิวของฉัน — 0 = ไม่ได้อยู่ในคิว · 1 = คิวแรก */
  myQueuePosition: number
  canManage: boolean
  createdAt: string
}

export const KINDS: ListingKind[] = ['SELL', 'FREE', 'TRADE', 'WANTED']
export const CATEGORIES: ListingCategory[] = [
  'ELECTRONICS', 'FURNITURE', 'CLOTHES', 'BOOKS', 'SPORTS', 'FOOD', 'PLANT', 'OTHER',
]
export const CONDITIONS: ListingCondition[] = ['NEW', 'GOOD', 'FLAWED']
export const STATUSES: ListingStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD']

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
export const kindLabel = (ot: Ot, k: ListingKind): string =>
  ot(`market.kind.${k}` as OfficeKey)
export const categoryLabel = (ot: Ot, c: ListingCategory): string =>
  ot(`market.category.${c}` as OfficeKey)
export const conditionLabel = (ot: Ot, c: ListingCondition): string =>
  ot(`market.condition.${c}` as OfficeKey)
export const statusLabel = (ot: Ot, s: ListingStatus): string =>
  ot(`market.status.${s}` as OfficeKey)

/** ราคาที่แสดง — แจกฟรีกับหาซื้อไม่แสดงตัวเลข (FR-D02) */
export function priceLabel(
  ot: Ot,
  locale: string,
  listing: Pick<Listing, 'kind' | 'price'>,
): string {
  if (listing.kind === 'FREE') return ot('market.kind.FREE')
  if (listing.kind === 'WANTED') return ot('market.kind.WANTED')
  if (listing.kind === 'TRADE') return ot('market.kind.TRADE')
  /*
   * ★★ ฿ ไม่เปลี่ยนตามภาษา — มันคือสกุลเงินของเงินก้อนนั้น ไม่ใช่คำแปล
   *    ★ สินค้าชิ้นนี้ตั้งราคาเป็นบาท คนเยอรมันที่เปิดดูก็ต้องจ่ายเป็นบาท
   *      ★★ การแปลงเป็น € จะเป็นการบอกตัวเลขที่ไม่มีใครรับจริง
   *
   * ★ แต่ "วิธีเขียนตัวเลข" เปลี่ยน — 1,234.50 · 1.234,50 · ١٢٣٤٫٥٠
   *   ★★ ตัวคั่นหลักพันที่ผิดภาษาทำให้คนอ่านราคาผิดหลัก ซึ่งแพงกว่า
   *      ความสวยงามมาก
   */
  return `฿${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(listing.price)}`
}

/** จุดนัดรับแบบอ่านง่าย (FR-D06) */
export function meetLabel(meet: Listing['meet']): string | null {
  const parts = [meet.building, meet.floor, meet.desk].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * ช่วงราคา
 *
 * ★★★ ช่วงตายตัว ไม่ใช่แถบเลื่อนสองหัว
 *
 *     ★ ตลาดนัดออฟฟิศมีของตั้งแต่ 0 ถึงหมื่นต้น ๆ ★★ แถบเลื่อนบนช่วงกว้าง
 *        ขนาดนั้นเลื่อนทีละ 50 บาทไม่ได้เลยบนมือถือ — นิ้วหนึ่งนิ้วกินสองพัน
 *     ★ และคนไม่ได้คิดเป็นตัวเลขเป๊ะ เขาคิดเป็น "ของถูก ๆ" กับ "ของแพงหน่อย"
 *       ★★ ปุ่มสี่ปุ่มจึงตรงกับวิธีคิดมากกว่า และกดได้ด้วยนิ้วเดียวครั้งเดียว
 *
 * ★ ขอบบนเป็น null = ไม่มีเพดาน — ไม่ใช่เลขใหญ่ ๆ สักตัว
 *   ★★ เลขเพดานที่ "ใหญ่พอ" วันนี้ จะเล็กไปวันที่มีคนลงขายโน้ตบุ๊ก
 */
export const PRICE_BANDS = [
  { id: 'free', min: 0, max: 0 },
  { id: 'lt300', min: 1, max: 300 },
  { id: 'lt1000', min: 301, max: 1000 },
  { id: 'lt3000', min: 1001, max: 3000 },
  { id: 'gte3000', min: 3001, max: null },
] as const

export type PriceBand = (typeof PRICE_BANDS)[number]['id']

/**
 * ลำดับการเรียง
 *
 * ★ 'smart' คือค่าเริ่มต้นเดิมของระบบ (ของแจกก่อน · ขายแล้วท้ายสุด · ใหม่ก่อน)
 *   ★★ ตั้งชื่อให้มันแทนที่จะปล่อยเป็น null — ★ คนที่เลือกเรียงตามราคาแล้ว
 *      อยากกลับไปแบบเดิม ต้องมีปุ่มให้กดกลับ ไม่ใช่ต้องรีเฟรชหน้า
 */
export type MarketSort = 'smart' | 'priceAsc' | 'priceDesc' | 'newest'
export const SORTS: MarketSort[] = ['smart', 'priceAsc', 'priceDesc', 'newest']

/**
 * ของใคร
 *
 * ★★ 'reserved' คือสิ่งที่ผู้ใช้ขอ — "ฟิลเตอร์ให้มีที่เราเลือกจองไว้ด้วย"
 *    ★ คิวจองคือคำสัญญาที่ต้องตามต่อ ★★ แต่เดิมหาไม่เจอเลยนอกจากเลื่อนหา
 *      ประกาศที่มีป้าย "คุณอยู่คิวที่ N" ทีละใบในตารางสามสิบใบ
 */
export type MarketOwner = 'all' | 'reserved' | 'selling' | 'history'
export const OWNERS: MarketOwner[] = ['all', 'reserved', 'selling', 'history']

export type MarketFilters = {
  query: string
  kind: ListingKind | null
  category: ListingCategory | null
  status: ListingStatus | null
  band: PriceBand | null
  sort: MarketSort
  owner: MarketOwner
}

export const emptyMarketFilters = (): MarketFilters => ({
  query: '',
  kind: null,
  category: null,
  status: null,
  band: null,
  sort: 'smart',
  owner: 'all',
})

/** ตัวกรองที่ไม่ใช่ค่าเริ่มต้น มีกี่อัน — ใช้โชว์ตัวเลขบนปุ่ม "ล้างตัวกรอง" */
export function activeFilterCount(f: MarketFilters): number {
  return (
    (f.query.trim() ? 1 : 0) +
    (f.kind ? 1 : 0) +
    (f.category ? 1 : 0) +
    (f.status ? 1 : 0) +
    (f.band ? 1 : 0) +
    (f.owner !== 'all' ? 1 : 0)
  )
}

/**
 * กรอง + เรียงประกาศ (FR-D03)
 *
 * ★★ "ประกาศแจกฟรีแสดงก่อน" ตามที่ FR-D03 ระบุ
 *
 *    ★ เรียงฝั่ง client เพราะเป็นกฎการแสดงผล ไม่ใช่กฎของข้อมูล —
 *      วันที่อยากเปลี่ยนเป็น "ของถูกก่อน" จะแก้ที่นี่ที่เดียวโดยไม่ต้อง
 *      แตะ index หรือ query ของฐานข้อมูลเลย
 */
export function filterListings(
  items: Listing[],
  filters: MarketFilters,
  selfId?: string,
): Listing[] {
  const q = filters.query.trim().toLowerCase()
  const band = PRICE_BANDS.find((b) => b.id === filters.band)

  const shown = items.filter((l) => {
    if (filters.kind && l.kind !== filters.kind) return false
    if (filters.category && l.category !== filters.category) return false
    if (filters.status && l.status !== filters.status) return false
    if (filters.owner === 'reserved' && l.myQueuePosition <= 0) return false
    if (filters.owner === 'selling' && l.sellerId !== selfId) return false
    /*
     * ★★★ ของที่ขายแล้วไม่โผล่ในหน้าหลัก — อยู่ในแท็บ "ประวัติ" เท่านั้น
     *
     *     ★ ผู้ใช้สั่งตรง ๆ ว่า "ตัวไหนขายแล้วไม่ต้องเอามาโชว์หน้าหลัก"
     *       ★★ ซึ่งถูก — ตลาดนัดมีไว้หาของที่ยังซื้อได้ ของที่ขายไปแล้ว
     *          เป็นข้อมูลของอดีต ไม่ใช่ของที่กำลังเสนอขาย
     *     ★ เดิมแค่ดันไปท้ายรายการ ★★ ซึ่งแปลว่าพอของขายไปเรื่อย ๆ
     *       คนต้องเลื่อนผ่านซากของที่ซื้อไม่ได้แล้วทุกครั้งที่เปิดหน้า
     *     ★ ยังเข้าถึงได้ครบ ไม่ได้ลบ — แค่ย้ายไปที่ที่มันเป็นเรื่องของมัน
     *       ★★ เจ้าของประกาศยังต้องกด "กลับมาว่าง" ได้จากแท็บนั้น
     */
    if (filters.owner === 'history') {
      if (l.status !== 'SOLD') return false
    } else if (l.status === 'SOLD' && filters.status !== 'SOLD') {
      return false
    }
    if (band) {
      /*
       * ★★ "ตามหา" ไม่มีราคา จึงไม่เข้าช่วงไหนเลย
       *    ★ มันคือประกาศที่ถามหาของ ไม่ใช่ของที่ตั้งราคาไว้
       *      ★★ ถ้าปล่อยให้ตกช่วง "ฟรี" เพราะ price = 0 คนกรองหาของฟรี
       *         จะได้ประกาศตามหาปนมาเต็มไปหมด ซึ่งตรงข้ามกับที่ต้องการ
       */
      if (l.kind === 'WANTED') return false
      if (l.price < band.min) return false
      if (band.max !== null && l.price > band.max) return false
    }
    if (q) {
      const hay = `${l.title} ${l.description ?? ''} ${l.sellerName ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return [...shown].sort((a, b) => {
    /*
     * ★ ไม่ต้องดัน "ขายแล้ว" ไปท้ายอีกแล้ว — มันถูกกรองออกตั้งแต่ข้างบน
     *   ★★ เหลือเฉพาะในแท็บประวัติ ซึ่งทั้งแท็บเป็นของที่ขายแล้วทั้งหมด
     */
    if (filters.sort === 'priceAsc') return a.price - b.price || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (filters.sort === 'priceDesc') return b.price - a.price || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (filters.sort === 'newest') return Date.parse(b.createdAt) - Date.parse(a.createdAt)

    /* smart — ของแจกก่อน แล้วค่อยใหม่ก่อน (ค่าเริ่มต้นเดิมของระบบ) */
    const freeDiff = Number(b.kind === 'FREE') - Number(a.kind === 'FREE')
    if (freeDiff !== 0) return freeDiff
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
}
