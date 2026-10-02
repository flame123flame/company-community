import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { AdminCodes } from '@/components/office/AdminCodes'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.admin.codes') }
}

export default function AdminCodesPage() {
  return <AdminCodes />
}
