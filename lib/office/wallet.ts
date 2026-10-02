import type { DebtStatus, ExpenseCategory } from '@/types/database'
import type { OfficeKey, Ot } from '@/lib/i18n/office-format'

/** ชนิดข้อมูลของหน้ากระเป๋าเงิน (FR-B01–B07) */

export type Debt = {
  id: string
  amount: number
  description: string | null
  status: DebtStatus
  createdAt: string
  paidAt: string | null
  hasSlip: boolean
  lastRemindedAt: string | null
  otherId: string
  otherName: string
  otherHasQr: boolean
  daysOwed: number
}

export type WalletData = {
  summary: { iOwe: number; owedToMe: number; pendingConfirm: number }
  iOwe: Debt[]
  owedToMe: Debt[]
}

export const CATEGORIES: ExpenseCategory[] = ['FOOD', 'COFFEE', 'OTHER']

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
export const categoryLabel = (ot: Ot, c: ExpenseCategory): string =>
  ot(`wallet.category.${c}` as OfficeKey)
export const statusLabel = (ot: Ot, s: DebtStatus): string =>
  ot(`wallet.status.${s}` as OfficeKey)

/**
 * จัดรูปเงินบาท
 *
 * ★★ แสดงทศนิยม 2 ตำแหน่งเสมอ ไม่ตัด .00 ทิ้ง
 *
 *    "50" กับ "50.00" อ่านแล้วรู้สึกต่างกันในหน้าที่เกี่ยวกับเงิน —
 *    ★ ตัวที่มีทศนิยมบอกว่า "นี่คือยอดที่แม่นถึงสตางค์" ซึ่งสำคัญมาก
 *      เมื่อยอดจริงเป็น 33.34 กับ 33.33 ที่ต่างกันแค่สตางค์เดียว
 */
export function formatBaht(locale: string, amount: number): string {
  /*
   * ★★★ ฿ ไม่เปลี่ยนตามภาษา แต่ "วิธีเขียนตัวเลข" เปลี่ยน
   *
   *     ★ เงินก้อนนี้เป็นบาทไม่ว่าใครอ่าน — การแปลงเป็นสกุลอื่นคือการบอก
   *       ตัวเลขที่ไม่มีใครรับจริง ★★ จึงไม่ใช้ style: 'currency'
   *
   *     ★ แต่ 1,234.50 · 1.234,50 · ١٢٣٤٫٥٠ คือเลขเดียวกันที่เขียนต่างกัน
   *       ★★ ตัวคั่นหลักพันที่ผิดภาษาทำให้คนอ่านราคาผิดหลัก ซึ่งในหน้าที่
   *          เกี่ยวกับเงินแพงกว่าความสวยงามมาก
   *
   *     ★ เดิมตรึงไว้ที่ 'th-TH' ทุกที่ — ถูกสำหรับคนไทย และผิดสำหรับ
   *       คนเยอรมันกับคนรัสเซียที่สลับจุดกับคอมมา
   */
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * คำนวณยอดแต่ละคนฝั่ง client เพื่อแสดงตัวอย่างก่อนบันทึก
 *
 * ★★★ ต้องใช้สูตรเดียวกับ create_expense_bill ใน migration 0027 เป๊ะ ๆ
 *
 *     ★ ถ้าสองที่คำนวณต่างกัน ผู้ใช้จะเห็นตัวอย่าง "คนละ 33.33"
 *       แล้วบันทึกเสร็จกลายเป็น 33.34 — ซึ่งทำให้คนไม่เชื่อตัวเลขทั้งหน้า
 *
 *     ★★ ฝั่ง server ยังเป็นความจริงเสมอ ตัวนี้เป็นแค่ภาพตัวอย่าง
 *        แต่ภาพตัวอย่างที่ไม่ตรงกับผลจริงแย่กว่าไม่มีภาพตัวอย่างเลย
 */
export function previewEqualSplit(
  total: number,
  debtorCount: number,
  includeSelf: boolean,
): { shares: number[]; myShare: number } {
  if (debtorCount <= 0) return { shares: [], myShare: 0 }

  const people = debtorCount + (includeSelf ? 1 : 0)

  /* คำนวณเป็นสตางค์ทั้งหมดเพื่อไม่ให้ float คลาดเคลื่อน */
  const totalSatang = Math.round(total * 100)
  const baseSatang = Math.floor(totalSatang / people)
  const remainder = totalSatang - baseSatang * people

  const shares = Array.from(
    { length: debtorCount },
    (_, i) => (baseSatang + (i < remainder ? 1 : 0)) / 100,
  )

  const owed = shares.reduce((sum, s) => sum + s, 0)
  /* ★ ส่วนของฉัน = ที่เหลือ ไม่ใช่ base — เผื่อกรณีเศษตกไม่หมดในลูกหนี้ */
  const myShare = includeSelf ? Math.round((total - owed) * 100) / 100 : 0

  return { shares, myShare }
}
