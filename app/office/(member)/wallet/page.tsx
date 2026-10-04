import { redirect } from 'next/navigation'

/*
 * ★ /office/wallet ไม่มีหน้าของตัวเอง — พาไปแท็บแรก "ยอดค้างของฉัน"
 *   ★★ เดิมเป็น 404 ทั้งที่เมนูหัวหมวดและลิงก์ที่คนแชร์กันชี้มาที่นี่
 */
export default function WalletIndexPage() {
  redirect('/office/wallet/owed')
}
