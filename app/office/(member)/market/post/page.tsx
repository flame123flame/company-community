import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { MarketPost } from '@/components/office/MarketPost'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.market.post') }
}

export default function MarketPostPage() {
  return <MarketPost />
}
