import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { AdminDashboard } from '@/components/office/AdminDashboard'
import { requireAdmin } from '@/lib/office/guard'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('title.dashboard') }
}

export default async function AdminDashboardPage() {
  /* ★ ด่านเดียวกับ API — หน้า Admin ต้องกันที่ server ไม่ใช่ซ่อนเมนู */
  await requireAdmin()
  return <AdminDashboard />
}
