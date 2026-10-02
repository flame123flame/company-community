import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { FoodRandom } from '@/components/office/FoodRandom'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.food.random') }
}

export default function FoodRandomPage() {
  return <FoodRandom />
}
