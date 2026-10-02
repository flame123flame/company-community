import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { DrawRoomList } from '@/components/office/DrawRoomList'
import { getOfficeViewer } from '@/lib/office/session'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('room.title') }
}

export default async function DrawRoomListPage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  return <DrawRoomList />
}
