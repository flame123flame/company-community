'use client'

import { splitEven, splitRounded, applyDiscount, toSatang } from './money'

/**
 * ค่าที่จำไว้จากครั้งก่อน
 *
 * ★★★ เก็บใน localStorage ไม่ใช่ฐานข้อมูล
 *
 *     ★ ข้อกำหนดบอกให้ "จำค่าที่ผู้ใช้ใช้ล่าสุด (วิธีหาร ปัดเศษ ฉันร่วมจ่ายด้วย)"
 *       ★★ สามค่านี้เป็นนิสัยการกรอก ไม่ใช่ข้อมูลของบิล
 *          ★ เก็บลงฐานข้อมูลแปลว่าต้องมีคอลัมน์ · migration · และคำขอเพิ่ม
 *            หนึ่งรอบทุกครั้งที่เปิดหน้า เพื่อค่าสามตัวที่ผิดก็ไม่เสียหาย
 *     ★ ถ้าเปลี่ยนเครื่องแล้วค่ากลับไปเป็นค่าเริ่มต้น ก็แค่ตั้งใหม่ครั้งเดียว
 *
 * ★★ ค่าเริ่มต้นเลือกให้ตรงกับกรณีที่พบบ่อยที่สุด
 *    ★ หารเท่ากัน · ปัดขึ้นเป็นบาทเต็ม · ฉันร่วมจ่ายด้วย
 *      ★★ คนที่กดบันทึกโดยไม่แตะอะไรเลย ต้องได้ผลที่ถูกในกรณีปกติ
 */
export type BillPrefs = {
  splitMode: 'EQUAL' | 'CUSTOM'
  rounded: boolean
  includeSelf: boolean
}

const KEY = 'awa:bill-prefs'

export const defaultPrefs = (): BillPrefs => ({
  splitMode: 'EQUAL',
  rounded: true,
  includeSelf: true,
})

export function loadPrefs(): BillPrefs {
  if (typeof window === 'undefined') return defaultPrefs()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultPrefs()
    const v = JSON.parse(raw) as Partial<BillPrefs>
    return {
      splitMode: v.splitMode === 'CUSTOM' ? 'CUSTOM' : 'EQUAL',
      rounded: v.rounded !== false,
      includeSelf: v.includeSelf !== false,
    }
  } catch {
    /* ★ localStorage พังหรือถูกปิด — ใช้ค่าเริ่มต้น ไม่ใช่ทำให้หน้าล่ม */
    return defaultPrefs()
  }
}

export function savePrefs(p: BillPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ★ โหมดส่วนตัวของ Safari เขียนไม่ได้ — ไม่ใช่เรื่องที่ต้องบอกผู้ใช้ */
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * คำนวณยอดต่อคน
 * ═══════════════════════════════════════════════════════════════════ */

export type SplitInput = {
  /** ยอดอาหาร (ยังไม่รวมค่าส่ง ยังไม่หักส่วนลด) หน่วยบาท */
  amount: number
  deliveryFee: number
  discount: number
  /** จำนวนคนที่หาร "ไม่รวมฉัน" */
  others: number
  includeSelf: boolean
  rounded: boolean
}

export type SplitResult = {
  /** ยอดบิลสุทธิเป็นสตางค์ (อาหาร + ค่าส่ง − ส่วนลด) */
  totalSatang: number
  /** ยอดของฉัน (สตางค์) — 0 ถ้าไม่ร่วมจ่าย */
  mineSatang: number
  /** ยอดของคนอื่นเรียงตามลำดับที่เลือก (สตางค์) */
  othersSatang: number[]
  /** ยอดต่อคนที่เอาไปโชว์ตัวใหญ่ (สตางค์) — ใช้ของคนอื่นคนแรก */
  perHeadSatang: number
}

/**
 * หารบิล
 *
 * ★★★ ลำดับสำคัญ: ค่าส่งบวกก่อน แล้วค่อยหัก ส่วนลดหารตามสัดส่วนทีหลัง
 *
 *     ★ ค่าส่งหารเท่ากันทุกคน เพราะรถคันเดียวส่งมาให้ทั้งโต๊ะ
 *     ★ ส่วนลดหักตามสัดส่วน เพราะคนสั่งแพงกว่าได้ส่วนลดมากกว่า
 *       ★★ ถ้าหักส่วนลดก่อนบวกค่าส่ง ส่วนลดจะไปลดค่าส่งด้วย ซึ่งผิด —
 *          ร้านลดค่าอาหาร ไม่ได้ลดค่าส่ง
 *
 * ★★ ผลรวมของทุกคนเท่ากับยอดบิลสุทธิเป๊ะเสมอ ไม่ว่าจะปัดเศษหรือไม่
 *    ★ เศษตกที่ "ฉัน" ถ้าฉันร่วมจ่าย ★★ ถ้าไม่ร่วมจ่าย เศษตกที่คนแรกในรายการ
 *      ซึ่งเป็นคนที่ผู้ใช้เลือกเป็นคนแรก — ไม่ใช่คนที่ระบบสุ่ม
 */
export function computeSplit(input: SplitInput): SplitResult {
  const food = toSatang(input.amount)
  const delivery = toSatang(input.deliveryFee)
  const discount = toSatang(input.discount)

  /* ★ ยอดบิลสุทธิไม่ติดลบ — ส่วนลดเกินยอดอาหารบวกค่าส่งไม่ได้ */
  const total = Math.max(0, food + delivery - discount)

  const heads = input.others + (input.includeSelf ? 1 : 0)
  if (heads <= 0 || total <= 0) {
    return { totalSatang: total, mineSatang: 0, othersSatang: [], perHeadSatang: 0 }
  }

  /*
   * ★★ คนแรกของอาร์เรย์คือคนที่รับเศษ — ส่ง "ฉัน" ไปก่อนเมื่อฉันร่วมจ่าย
   *    ★ splitEven/splitRounded ออกแบบให้เศษตกที่ดัชนี 0 เสมอ
   */
  const raw = input.rounded ? splitRounded(total, heads) : splitEven(total, heads)

  /* ★ ส่วนลดกระจายตามสัดส่วนหลังหารแล้ว — เพื่อให้ผลรวมยังเท่าเดิม
       ★★ ที่นี่ส่วนลดถูกหักไปตั้งแต่ total แล้ว จึงไม่ต้องหักซ้ำ
          (applyDiscount มีไว้สำหรับโหมดระบุยอดรายคนในอนาคต) */

  if (input.includeSelf) {
    return {
      totalSatang: total,
      mineSatang: raw[0]!,
      othersSatang: raw.slice(1),
      perHeadSatang: raw[1] ?? raw[0]!,
    }
  }

  return {
    totalSatang: total,
    mineSatang: 0,
    othersSatang: raw,
    perHeadSatang: raw[raw.length - 1] ?? raw[0]!,
  }
}

/**
 * โหมดระบุยอดรายคน — คืนยอดคงเหลือเพื่อเอาไปโชว์ "เหลืออีก ฿35"
 *
 * ★ ค่าบวก = ยังกรอกไม่ครบ · ค่าลบ = กรอกเกินยอดบิล
 *   ★★ สองกรณีนี้ต้องแยกข้อความ — "เหลืออีก" กับ "เกินไป" คนละเรื่องกัน
 *      และกรณีเกินคือข้อผิดพลาดที่บันทึกไม่ได้
 */
export function customRemainder(
  amount: number,
  deliveryFee: number,
  discount: number,
  entered: number[],
): number {
  const total = Math.max(0, toSatang(amount) + toSatang(deliveryFee) - toSatang(discount))
  const sum = entered.reduce<number>((s, v) => s + toSatang(v), 0)
  return total - sum
}

export { applyDiscount }
