import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { AdminSettings } from '@/components/office/AdminSettings'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.admin.settings') }
}

export default function AdminSettingsPage() {
  return <AdminSettings />
}
