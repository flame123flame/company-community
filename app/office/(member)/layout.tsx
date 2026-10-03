import { redirect } from 'next/navigation'
import { getOfficeViewer } from '@/lib/office/session'
import { OfficePageChrome } from '@/components/office/OfficePageChrome'
import { OfficeFooter } from '@/components/office/OfficeFooter'
import { OfficeBody } from '@/components/office/OfficeBody'

/**
 * ด่าน "ต้องผูกรหัสพนักงานก่อน" + หัวหน้าของทุกหน้าในระบบออฟฟิศ (NFR-11)
 *
 * ★★★ ทำไมด่านต้องเป็น route group ไม่ใช่เช็กในแต่ละหน้า
 *
 *     เดิมเช็กที่แต่ละ page เพราะถ้าใส่ใน app/office/layout.tsx แล้ว
 *     หน้า /office/link จะถูกเด้งด้วย → วนไม่จบ (link → office → link → …)
 *
 *     ★★ แล้วมันก็เกิดสิ่งที่คาดได้: 14 จาก 24 หน้าลืมใส่
 *        คนที่ยังไม่ผูกรหัสเปิดหน้าได้ปกติ แล้วไปเจอ error ตอน API ตอบกลับ
 *
 *     ★ (member) เป็น route group — ไม่ปรากฏใน URL เลย
 *       /office · /office/food/random ยังเป็น path เดิมทุกตัวอักษร
 *       ★★ แต่ /office/link อยู่นอกกลุ่ม จึงไม่โดนด่านนี้ = ไม่วน
 */
export default async function OfficeMemberLayout({ children }: LayoutProps<'/office'>) {
  const viewer = await getOfficeViewer()

  if (!viewer) redirect('/')
  /* ★ เลิกบังคับผูกรหัสพนักงานแล้ว (0043) — หน้า /office/link ยังอยู่
     สำหรับคนที่อยากผูกเอง แต่ไม่ใช่ด่านอีกต่อไป */

  return (
    <>
      {/*
       * ★★★ ผืนหลังที่ไหลต่อจากแถบออโรราลงมาทั้งหน้า
       *
       *     ★ เดิมแถบสีจบตรงแถวแท็บพอดี แล้วที่เหลือเป็นพื้นเรียบ ๆ
       *       ★★ หน้าที่เนื้อหาสั้นจึงกลายเป็นพื้นว่างครึ่งจอซึ่งอ่านเป็น
       *          "หน้ายังโหลดไม่เสร็จ" ไม่ใช่ "หน้านี้มีแค่นี้"
       *     ★ แสงจาง ๆ ที่ค่อย ๆ จางลงทำให้พื้นที่ว่างเป็นส่วนหนึ่งของดีไซน์
       */}
      <div className="office-canvas" aria-hidden="true" />

      <OfficePageChrome isAdmin={viewer.isAdmin} />

      {/*
       * ★ กว้างเท่าหัวหน้าเสมอ — เนื้อหากับหัวเรื่องต้องชิดขอบซ้ายตรงกัน
       *   ไม่งั้นทุกหน้าจะดูเหมือนวางเยื้องกันทีละนิด
       *   ★★ ความกว้างมาจาก columnClass() ที่เดียวกับหัวหน้าและท้ายหน้า
       *      ไม่ใช่เลขที่พิมพ์ซ้ำในไฟล์นี้อีกตัว
       */}
      <OfficeBody>{children}</OfficeBody>

      <OfficeFooter />
    </>
  )
}
