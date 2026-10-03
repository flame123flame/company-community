'use client'

import { useState } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import type { OfficeKey } from '@/lib/i18n/office-format'
import { pageMetaOf, siblingsOf, activeHref, columnClass, groupsOf } from '@/lib/office/nav'

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

  /*
   * ★★★ state ต้องอยู่ก่อน early return ข้างล่าง
   *     ★ React ห้ามเรียก hook แบบมีเงื่อนไข — วางหลัง return null เมื่อไหร่
   *       หน้าที่ไม่มี meta จะเรียก hook น้อยกว่าหน้าที่มี แล้วทั้งแอปพัง
   *       ตอนเปลี่ยนหน้า ★★ ไม่ใช่ตอนที่เขียน ซึ่งทำให้หาสาเหตุยาก
   */
  const [pickedGroup, setPickedGroup] = useState<OfficeKey | null>(null)
  const [lastPath, setLastPath] = useState(pathname)

  /*
   * ★ เปลี่ยนหน้า → ลืมกลุ่มที่เลือกค้างไว้ กลับไปใช้กลุ่มของหน้าปัจจุบัน
   *   ★★ ปรับตอน render ไม่ใช่ใน useEffect — ถ้าใช้ effect จะมีหนึ่งเฟรม
   *      ที่แถวล่างยังโชว์กลุ่มเก่าทั้งที่หน้าเปลี่ยนไปแล้ว
   */
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setPickedGroup(null)
  }

  const meta = pageMetaOf(pathname)

  /* ★ หน้าแรกของโมดูลมีหัวของตัวเอง (พอร์ทัล) — ไม่ต้องซ้อนอีกชั้น */
  if (!meta || pathname === '/office') return null

  const siblings = siblingsOf(pathname, isAdmin)
  const active = activeHref(
    pathname,
    siblings.map((s) => s.href),
  )

  const groups = groupsOf(siblings)
  /* ★ กลุ่มของหน้าที่เปิดอยู่ — ใช้เป็นค่าเริ่มต้นเมื่อผู้ใช้ยังไม่ได้เลือกเอง */
  const activeGroup = siblings.find((c) => c.href === active)?.group ?? groups[0] ?? null
  const shownGroup = pickedGroup ?? activeGroup
  const shownSiblings =
    groups.length > 0 ? siblings.filter((c) => c.group === shownGroup) : siblings

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
          columnClass(pathname),
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

        {/*
          * ── กลุ่มย่อยของหมวด ─────────────────────────────────────
          *
          * ★★★ มีเฉพาะหมวดที่ประกาศกลุ่มไว้ (ตอนนี้คือหมวดเกม)
          *     ★ หมวดเกมโตจนแถบแท็บมี 7 อัน — ของท้ายแถวอยู่หลังเส้นที่ตา
          *       ไม่ได้มองและมือต้องเลื่อนไปหา
          *       ★★ แบ่งกลุ่มแล้วแถวที่สองสั้นลงจนเห็นครบในจอเดียว
          *
          * ★★ เลือกกลุ่มแล้ว "ไม่เปลี่ยนหน้า" — แค่เปลี่ยนว่าแถวล่างโชว์อะไร
          *    ★ การกดกลุ่มแล้วเด้งไปหน้าแรกของกลุ่มทันที จะทำให้คนที่แค่
          *      อยากสำรวจว่ามีอะไรบ้าง หลุดจากหน้าที่กำลังทำงานอยู่
          */}
        {groups.length > 0 ? (
          <nav
            aria-label={ot(meta.titleKey)}
            className="hero-in scrollbar-none -mx-4 mt-6 flex gap-1.5 overflow-x-auto px-4"
          >
            {groups.map((g) => {
              const on = g === shownGroup
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPickedGroup(g)}
                  aria-pressed={on}
                  className={cn(
                    'relative h-11 shrink-0 rounded-full px-4 text-sm transition-colors',
                    on
                      ? 'group-chip-on bg-ink font-medium text-page'
                      : 'text-ink-soft hover:bg-surface hover:text-ink',
                  )}
                >
                  {/* ★ ชื่อหมวดยังมีแต่ภาษาไทย — ป้ายนี้บอกความจริงนั้นให้
                      โปรแกรมอ่านหน้าจอ และหายไปเองวันที่แปลเสร็จ */}
                  <Untranslated>{ot(g)}</Untranslated>
                </button>
              )
            })}
          </nav>
        ) : null}

        {shownSiblings.length > 1 ? (
          /*
           * ══ การ์ดหน้าในหมวด ══════════════════════════════════════
           *
           * ★★★ เปลี่ยนจากชิปแบบแท็บมาเป็นการ์ด
           *     ★ ชิปบอกได้แค่ชื่อ — "สายการแข่งขัน" กับ "ห้องสุ่มกลุ่ม"
           *       อ่านแล้วยังไม่รู้ว่าต่างกันตรงไหนจนกว่าจะกดเข้าไปดู
           *       ★★ การ์ดมีที่ให้คำอธิบายหนึ่งบรรทัด ซึ่งตอบคำถามนั้น
           *          ก่อนกด — ใช้ descKey ที่ PAGE_META มีอยู่แล้วทุกหน้า
           *
           * ★★ ยังเลื่อนแนวนอนบนจอแคบ ไม่ตัดบรรทัด
           *    ★ การ์ดที่ตัดบรรทัดทำให้ความสูงของหัวหน้าเปลี่ยนตามจำนวนหน้า
           *      แล้วเนื้อหาข้างล่างกระโดดทุกครั้งที่เปลี่ยนหมวด
           */
          <nav
            aria-label={ot(meta.titleKey)}
            className={cn(
              'hero-in scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2',
              groups.length > 0 ? 'mt-3' : 'mt-6',
            )}
          >
            {shownSiblings.map((child, i) => {
              const on = active === child.href
              const desc = pageMetaOf(child.href)?.descKey
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={on ? 'page' : undefined}
                  style={{ '--i': i } as React.CSSProperties}
                  className={cn(
                    /*
                     * ★ 14rem ไม่ใช่เลขสวย — มันคือความกว้างที่ทำให้สี่การ์ด
                     *   (หมวดกระเป๋าเงินและตลาดนัด) พอดีคอลัมน์ 1000px
                     *   ★★ 15.5rem เกินไปราว 30px ซึ่งทำให้ใบสุดท้ายถูกตัดขอบ
                     *      ดูเหมือนหน้าเรนเดอร์ไม่เสร็จ ทั้งที่มันแค่เลื่อนได้
                     */
                    'tab-chip group relative flex w-56 shrink-0 items-start gap-3 overflow-hidden',
                    'rounded-2xl border p-3.5 transition-all duration-300',
                    on
                      ? /* ★ หน้าที่เปิดอยู่: ขอบและพื้นสีเน้น + เงาเรืองที่หายใจช้า ๆ */
                        'tab-chip-on border-accent/50 bg-accent/12 [--tab-glow:color-mix(in_oklab,var(--color-accent)_55%,transparent)]'
                      : 'border-line bg-page/50 backdrop-blur-md hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-xl transition-colors',
                      on ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft group-hover:bg-elevated',
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="tab-icon size-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={child.icon} />
                    </svg>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-semibold',
                        on ? 'text-ink' : 'text-ink',
                      )}
                    >
                      {ot(child.labelKey)}
                    </span>
                    {desc ? (
                      /* ★ สองบรรทัดพอ — ยาวกว่านี้การ์ดจะสูงจนดันเนื้อหาลงไปอีก */
                      <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-soft">
                        {ot(desc)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
