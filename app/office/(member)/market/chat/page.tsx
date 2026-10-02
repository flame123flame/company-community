import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { MarketChat } from '@/components/office/MarketChat'
import { getOfficeViewer } from '@/lib/office/session'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('market.chat.title') }
}

export default async function MarketChatPage({
  searchParams,
}: PageProps<'/office/market/chat'>) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  /* ★ searchParams เป็น Promise ใน Next 16 */
  const { listing } = await searchParams
  return <MarketChat initialListing={typeof listing === 'string' ? listing : undefined} />
}
