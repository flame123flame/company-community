import { redirect } from 'next/navigation'
import { getOfficeViewer } from '@/lib/office/session'

/**
 * ด่านของหน้า Admin (FR-X09)
 *
 * ★★ ด่านจริงอยู่ที่ API ทุกเส้น (requireAdmin) ไม่ใช่ที่นี่
 *
 *    layout นี้แค่ "ไม่เอาหน้าที่ใช้ไม่ได้ไปโชว์" — คนที่แก้ JS ในเครื่อง
 *    ตัวเองให้ข้ามด่านนี้ไปได้ ก็จะเจอ 403 จาก API ทุกปุ่มที่กดอยู่ดี
 *
 *    ★ เขียนไว้ให้ชัดเพราะเคยมีคนเข้าใจผิดว่าด่านฝั่งหน้าเว็บคือความปลอดภัย
 *      (บทเรียนเดียวกับที่ lib/supabase/server.ts บันทึกไว้เรื่อง ProfileGate)
 */
export default async function AdminLayout({ children }: LayoutProps<'/office/admin'>) {
  const viewer = await getOfficeViewer()

  if (!viewer) redirect('/')
  /* ★ ไม่บังคับรหัสพนักงานแล้ว (0043) — ด่านของหน้า admin คือ isAdmin
     ★★ ซึ่งตรวจอยู่แล้วบรรทัดถัดไป และเป็นด่านที่ถูกต้องสำหรับหน้านี้ */
  if (!viewer.isAdmin) redirect('/')

  return <>{children}</>
}
