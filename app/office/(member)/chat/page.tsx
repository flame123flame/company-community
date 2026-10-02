import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { OfficeChat } from '@/components/office/OfficeChat'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('chat.title') }
}

export default function OfficeChatPage() {
  return <OfficeChat />
}
