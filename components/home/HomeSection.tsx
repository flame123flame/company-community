import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * หนึ่ง "ส่วน" ของหน้าแรก — หัวข้อมีเลขลำดับ + คำอธิบาย แล้วตามด้วยเนื้อหา
 *
 * ★★★ หน้าแรกเคยเป็นของหลายก้อนเรียงต่อกันโดยไม่มีหัวข้อ
 *     ★ คนเลื่อนผ่านแล้วไม่รู้ว่าตอนนี้อยู่ส่วนไหน และยังเหลืออะไรอีก
 *     ★★ เลขลำดับ + ชื่อส่วน + แถบสลับพื้น ทำให้เห็นเส้นแบ่งชัดโดยไม่ต้องอ่าน
 *
 * ★ `band` = พื้นสีอ่อนเต็มความกว้างจอ ใช้สลับกับส่วนที่ไม่มี เพื่อให้ขอบส่วนชัด
 */
export function HomeSection({
  id,
  n,
  title,
  detail,
  band = false,
  children,
}: {
  id: string
  n: number
  title: string
  detail: string
  band?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('home-section relative scroll-mt-[calc(var(--spacing-header)+16px)] py-14 sm:py-20', band && 'home-band')}
    >
      <header className="mx-auto w-full max-w-[1120px] px-4">
        <div className="flex items-end gap-4">
          <span aria-hidden="true" className="home-num select-none text-[56px] font-black leading-[0.8] sm:text-[80px]">
            {String(n).padStart(2, '0')}
          </span>
          <div className="min-w-0 pb-1">
            <h2 id={`${id}-title`} className="text-[26px] font-black leading-tight tracking-tight text-ink sm:text-[36px]">
              {title}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-[15px]">{detail}</p>
          </div>
        </div>
        <span aria-hidden="true" className="home-rule mt-6 block h-px" />
      </header>

      <div className="mt-8">{children}</div>
    </section>
  )
}
