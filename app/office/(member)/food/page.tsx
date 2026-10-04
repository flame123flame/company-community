import { redirect } from 'next/navigation'

/*
 * ★ /office/food ไม่มีหน้าของตัวเอง — พาไปแท็บแรก "ร้านเด็ด"
 *   ★★ เดิมเป็น 404 ทั้งที่เมนูหัวหมวดชี้มาที่นี่
 */
export default function FoodIndexPage() {
  redirect('/office/food/picks')
}
