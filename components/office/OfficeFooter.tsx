'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { OFFICE_NAV, isWidePage } from '@/lib/office/nav'

/**
 * ท้ายหน้าของทุกหน้าในระบบออฟฟิศ
 *
 * ★★★ หน้าที่จริงคือ "ปิดหน้า" ไม่ใช่ "ใส่ลิงก์เพิ่ม"
 *
 *     ★ ทุกหน้าที่เนื้อหาสั้นจบลงกลางจอแล้วเหลือพื้นขาวยาวลงไปจนสุด
 *       ★★ ตาอ่านพื้นว่างที่ไม่มีอะไรปิดท้ายว่า "ยังมีอะไรอยู่ข้างล่างอีกไหม"
 *          แล้วเลื่อนลงไปเจอความว่างเปล่า ซึ่งรู้สึกเหมือนระบบยังทำไม่เสร็จ
 *     ★ เส้นคั่นกับแถวลิงก์บาง ๆ บอกชัดว่า "จบแล้ว" โดยไม่แย่งความสนใจ
 *
 * ★★ ลิงก์ดึงจาก OFFICE_NAV ตัวเดียวกับเมนู — ไม่เขียนรายการซ้ำ
 *    ★ วันที่เพิ่มโมดูลใหม่ ท้ายหน้าจะมีตามเองโดยไม่ต้องจำ
 */
export function OfficeFooter() {
  const ot = useOt()
  const pathname = usePathname()

  /* ★ พอร์ทัลกับหน้าผูกรหัสมีท้ายหน้าของตัวเองอยู่แล้ว */
  if (pathname === '/office') return null

  const links = OFFICE_NAV.filter((s) => s.href !== '/office' && !s.adminOnly)

  return (
    <footer className="office-footer mt-10">
      <div
        className={cn(
          'mx-auto w-full px-4 py-8',
          isWidePage(pathname) ? 'max-w-[1340px]' : 'max-w-[1000px]',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/"
            className="text-[13px] font-semibold text-ink transition-opacity hover:opacity-70"
          >
            AWA ROOM
          </Link>

          {links.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              {ot(s.labelKey)}
            </Link>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          {ot('footer.office', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  )
}
