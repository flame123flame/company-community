import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { AdminUsers } from '@/components/office/AdminUsers'
import { getOfficeViewer } from '@/lib/office/session'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.admin.users') }
}

export default async function AdminUsersPage() {
  const viewer = await getOfficeViewer()
  /* ★ layout ตรวจไปแล้ว — เช็คซ้ำเพื่อให้ TypeScript รู้ว่า viewer ไม่ใช่ null */
  if (!viewer) redirect('/')

  return <AdminUsers selfId={viewer.id} />
}
