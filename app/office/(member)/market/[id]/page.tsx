import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { MarketDetail } from '@/components/office/MarketDetail'
import { getOfficeViewer } from '@/lib/office/session'

/*
 * ★★ ชื่อแท็บเป็นคำกลาง ไม่ใช่ชื่อประกาศ
 *    ★ จะใส่ชื่อประกาศต้องยิง query เพิ่มใน generateMetadata ★★ ซึ่งเป็น
 *      query ที่สองของหน้าเดียวกัน เพื่อข้อความบนแท็บที่คนเห็นตอนสลับแท็บ
 *    ★ ไม่คุ้ม — คอมโพเนนต์ข้างในโหลดชื่อจริงมาแสดงเป็นพาดหัวอยู่แล้ว
 */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.market') }
}

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  const { id } = await params
  return <MarketDetail id={id} />
}
