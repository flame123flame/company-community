'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { pageMetaOf, siblingsOf, activeHref, isWidePage } from '@/lib/office/nav'

/**
 * หัวหน้าของทุกหน้าในระบบออฟฟิศ
 *
 * ★★★ แทนแถบเมนูซ้ายที่ถอดออกไป
 *
 *     แถบเมนูซ้ายตายตัวคือรูปทรงของ "ระบบหลังบ้าน" — มันกินพื้นที่ 240px
 *     ตลอดเวลาเพื่อแสดงลิงก์ 20 อันที่คนใช้จริงวันละหนึ่งอัน
 *     ★ และมันบังคับให้ทุกหน้ากว้างเท่าที่เหลือ ซึ่งทำให้หน้าที่ควรโปร่ง
 *       (วงล้อสุ่ม · ผลลัพธ์) ดูอึดอัดไปด้วย
 *
 *     ★★ แทนที่ด้วย: เข้าหน้าไหนก็เห็นหน้านั้นเต็มจอ พร้อมทางกลับหน้ารวม
 *        และชิปของ "พี่น้องในหมวดเดียวกัน" ซึ่งเป็นลิงก์กลุ่มเดียวที่คน
 *        กดต่อจริงหลังอยู่ในหน้านั้นแล้ว
 *
 * ★ หัวเรื่องมาจากตารางใน lib/office/nav.ts ไม่ใช่ <h1> ของแต่ละคอมโพเนนต์
 *   ทุกหน้าจึงมีหัวขนาดเดียวกัน ระยะเท่ากัน และมีคำอธิบายใต้หัวเหมือนกันหมด
 */
export function OfficePageChrome({ isAdmin }: { isAdmin: boolean }) {
  const ot = useOt()
  const pathname = usePathname()
  const meta = pageMetaOf(pathname)

  /* ★ หน้าแรกของโมดูลมีหัวของตัวเอง (พอร์ทัล) — ไม่ต้องซ้อนอีกชั้น */
  if (!meta || pathname === '/office') return null

  const siblings = siblingsOf(pathname, isAdmin)
  const active = activeHref(
    pathname,
    siblings.map((s) => s.href),
  )

  return (
    <div className="relative left-1/2 isolate w-screen -translate-x-1/2">
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
      </div>

      {/* ★ หัวเรื่องกว้างตามเนื้อหา ไม่งั้นชื่อหน้าจะเยื้องจากขอบซ้ายของเนื้อหา */}
      <div
        className={cn(
          'relative mx-auto w-full px-4 pb-6 pt-6 sm:pb-8 sm:pt-10',
          isWidePage(pathname) ? 'max-w-[1340px]' : 'max-w-[1000px]',
        )}
      >
        <Link
          href="/"
          className={cn(
            /* ★ สูง 44px ตามข้อกำหนด "จุดแตะทุกจุด" — เดิม 32px กดพลาดบ่อยบนมือถือ
                 ★★ เป็นทางออกทางเดียวของทุกหน้าในโมดูล จึงต้องกดโดนแน่ ๆ */
            'hero-in inline-flex h-11 items-center gap-1.5 rounded-full border border-line',
            'bg-page/60 px-3 text-xs text-ink-soft backdrop-blur-md transition-colors',
            'hover:border-line-strong hover:text-ink',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-3.5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
          </svg>
          {ot('page.back')}
        </Link>

        <h1 className="hero-in mt-3 text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[34px]">
          {ot(meta.titleKey)}
        </h1>
        <p className="hero-in mt-1.5 max-w-[620px] text-sm leading-relaxed text-ink-soft">
          {ot(meta.descKey)}
        </p>

        {siblings.length > 1 ? (
          /*
           * ★★ แท็บเลื่อนแนวนอนได้บนจอแคบ ไม่ตัดบรรทัด
           *
           *    ชิปที่ตัดบรรทัดทำให้ความสูงของหัวหน้าเปลี่ยนตามความยาวชื่อ
           *    ★ แล้วเนื้อหาข้างล่างจะกระโดดเวลาเปลี่ยนหน้าในหมวดเดียวกัน
           *
           * ★★★ มีไอคอนทุกอัน — ตากวาดเจอรูปก่อนอ่านตัวอักษรเสมอ
           *     โดยเฉพาะเมนูที่ชื่อยาวใกล้เคียงกัน ("สร้างรายการเงิน" กับ "สรุปค่าข้าว")
           */
          <nav
            aria-label={ot(meta.titleKey)}
            className="hero-in -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {siblings.map((child) => {
              const on = active === child.href
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'group relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full ps-3 pe-4',
                    'text-sm transition-all duration-300',
                    on
                      ? /* ★ แท็บที่เปิดอยู่: พื้นสีเน้น + เงาเรือง — เด่นแบบที่ไม่ต้องหา */
                        'bg-accent font-medium text-accent-ink shadow-[0_10px_28px_-12px] shadow-accent/70'
                      : /* ★ แท็บอื่น: กระจกจาง ๆ ยกขึ้นเล็กน้อยตอนชี้ */
                        'border border-line bg-page/50 text-ink-soft backdrop-blur-md hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full transition-colors',
                      on ? 'bg-accent-ink/15' : 'bg-surface group-hover:bg-elevated',
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d={child.icon} />
                    </svg>
                  </span>

                  {ot(child.labelKey)}
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
