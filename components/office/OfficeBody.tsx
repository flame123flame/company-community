'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { columnClass } from '@/lib/office/nav'

/**
 * คอลัมน์ของเนื้อหาในระบบออฟฟิศ
 *
 * ★★★ มีขึ้นเพราะ layout เป็น server component จึงไม่รู้ว่าอยู่หน้าไหน
 *
 *     ★ ก่อนหน้านี้มันเลยตรึง 1000px ไว้ตายตัว ขณะที่หัวหน้ากับท้ายหน้า
 *       (ซึ่งเป็น client component ทั้งคู่) สลับไป 1340px บนหน้ากว้าง
 *       ★★ ชื่อหน้ากับการ์ดใบแรกจึงเยื้องกัน 170px บน /office/fun ·
 *          /office/chat · /office/fun/cup · หน้า admin ที่เป็นตาราง
 *
 * ★★ แยกเป็นไฟล์เล็ก ๆ ไม่ใช่เปลี่ยน layout ทั้งก้อนให้เป็น client
 *    ★ layout เป็นที่อยู่ของด่านตรวจสิทธิ์ ซึ่งต้องทำงานฝั่ง server เท่านั้น
 *      ★★ ย้ายมันมาฝั่ง client คือการเอาด่านจริงไปแขวนไว้ในที่ที่ผู้ใช้แก้ได้
 */
export function OfficeBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div
      className={cn(
        /*
         * ★ min-h ดันท้ายหน้าลงไปอยู่ขอบล่างของจอเสมอ
         *   ★★ ไม่ได้ทำให้เนื้อหาเยอะขึ้น แต่ทำให้ "พื้นที่ว่าง" มีจุดจบ
         *      แทนที่จะหล่นหายไปเฉย ๆ
         */
        'office-body mx-auto flex w-full flex-col px-4 pb-10 [min-height:calc(100vh-19rem)]',
        columnClass(pathname),
      )}
    >
      {children}
    </div>
  )
}
