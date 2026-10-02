import type { Metadata } from 'next'
import { OfficeI18nProvider } from '@/lib/i18n/office'
import { getOt } from '@/lib/i18n/office-server'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { RegisterForm } from '@/components/RegisterForm'
import { getRegisteredUser } from '@/lib/supabase/server'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('reg.title') }
}

/**
 * หน้าสมัครใช้งาน
 *
 * ★ คนที่เข้าสู่ระบบอยู่แล้วไม่ต้องเห็นหน้านี้ — เด้งไปหน้ารวมเลย
 *   ★★ ไม่ใช่ปล่อยให้สมัครซ้ำแล้วไปล้มตอน API ตอบว่าชื่อซ้ำ
 *      ซึ่งอ่านเป็นข้อผิดพลาดของผู้ใช้ ทั้งที่เป็นเส้นทางที่ไม่ควรเดินมาถึง
 */
export default async function RegisterPage() {
  const me = await getRegisteredUser()
  if (me) redirect('/')

  /*
   * ★★★ หน้านี้อยู่นอก /office แต่ฟอร์มสมัครใช้ข้อความของโมดูลออฟฟิศ
   *
   *     ★ provider จึงต้องมาครอบที่หน้านี้เอง ไม่ใช่รอรับจาก layout
   *       ★★ ทางที่ง่ายกว่าคือยกไปใส่ root layout ให้ทุกหน้าได้เลย
   *          แต่นั่นแปลว่า / · /lobby · /room/* ทุกหน้าในเว็บต้องแบก
   *          ข้อความออฟฟิศ 779 กุญแจที่ไม่มีหน้าไหนในนั้นใช้สักตัว
   *     ★ provider เรนเดอร์จากหน้าได้ ไม่จำเป็นต้องเป็น layout —
   *       ค่าที่ต้องจ่ายอยู่แค่หน้าที่ใช้จริง
   */
  const { dict } = await getOt()

  return (
    <>
      <div className="office-canvas" aria-hidden="true" />
      <AppHeader center={<span />} />
      <OfficeI18nProvider dict={dict}>
        <RegisterForm />
      </OfficeI18nProvider>
    </>
  )
}
