import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { DrawRoom } from '@/components/office/DrawRoom'
import { getOfficeViewer } from '@/lib/office/session'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('title.drawRoom') }
}

export default async function DrawRoomPage({ params }: PageProps<'/office/fun/room/[id]'>) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  const { id } = await params
  return <DrawRoom roomId={id} />
}
