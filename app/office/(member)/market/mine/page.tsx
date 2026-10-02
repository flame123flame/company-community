import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { MarketList } from '@/components/office/MarketList'
import { getOfficeViewer } from '@/lib/office/session'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.market.mine') }
}

export default async function MarketMinePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  return <MarketList mineOnly selfId={viewer.id} />
}
