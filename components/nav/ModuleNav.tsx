'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { activeHref } from '@/lib/office/nav'
import type { NavModule } from '@/lib/office/nav-data'

/** โมดูลที่หน้านี้อยู่ — เทียบจากลิงก์ลูกทุกตัว (เช่น /office/food/picks/123 → food) */
export function activeModule(pathname: string, modules: NavModule[]): string | null {
  const hrefs = modules.flatMap((m) => [m.href, ...m.links.map((l) => l.href), `/office/${m.id}`])
  const hit = activeHref(pathname, hrefs)
  if (!hit) return null
  return modules.find((m) => m.href === hit || m.links.some((l) => l.href === hit) || `/office/${m.id}` === hit)?.id ?? null
}

/**
 * แถบเมนูโมดูลบนแถบบน (จอกว้าง ≥ 1024px)
 *
 * ★★★ เดิมแถบบนของออฟฟิศมีแค่โลโก้กับปุ่มขวามือ — ไม่มีทางไปโมดูลอื่นเลย
 *     นอกจากกลับหน้าแรก ★ ตอนนี้ทุกระบบอยู่บนแถบเดียว และชี้แล้วเห็นทุกหน้าย่อย
 *
 * ★ โมดูลที่อยู่ตอนนี้มีพื้นสีประจำโมดูล + เส้นเรืองแสงใต้ — รู้ทันทีว่าอยู่ตรงไหน
 * ★ เมนูย่อยเปิดได้ทั้งชี้ (เมาส์) กด (แตะ/คลิก) และแป้นพิมพ์ (Enter/Space · Esc ปิด)
 */
export function ModuleNav({ modules, label }: { modules: NavModule[]; label: string }) {
  const pathname = usePathname()
  const current = activeModule(pathname, modules)
  /* ★ จำว่าเปิดเมนูของโมดูลไหน "ที่หน้าไหน" — เปลี่ยนหน้าแล้วเมนูปิดเองโดยไม่ต้องใช้ effect */
  const [open, setOpen] = useState<{ id: string; path: string } | null>(null)
  const openId = open && open.path === pathname ? open.id : null
  const timer = useRef<number | null>(null)
  const navRef = useRef<HTMLElement | null>(null)

  const show = (id: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    setOpen({ id, path: pathname })
  }
  const hideSoon = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(null), 140)
  }

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [openId])

  return (
    <nav ref={navRef} aria-label={label} className="hidden min-w-0 items-center gap-0.5 lg:flex">
      {modules.map((m) => {
        const active = current === m.id
        const isOpen = openId === m.id
        const single = m.links.length <= 1
        return (
          <div
            key={m.id}
            className="relative"
            onPointerEnter={(e) => e.pointerType === 'mouse' && !single && show(m.id)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && hideSoon()}
            style={{ '--tint': m.tint } as CSSProperties}
          >
            {single ? (
              <Link href={m.href} aria-current={active ? 'page' : undefined} className={cn('nav-tab', active && 'nav-tab-on')}>
                <NavIcon d={m.icon} />
                <span className="whitespace-nowrap">{m.label}</span>
              </Link>
            ) : (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-current={active ? 'page' : undefined}
                onClick={() => (isOpen ? setOpen(null) : show(m.id))}
                className={cn('nav-tab', active && 'nav-tab-on', isOpen && 'nav-tab-open')}
              >
                <NavIcon d={m.icon} />
                <span className="whitespace-nowrap">{m.label}</span>
                <svg viewBox="0 0 24 24" className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}

            {/* ── เมนูย่อย (mega dropdown) ── */}
            {isOpen && !single ? (
              <div className="nav-mega absolute start-1/2 top-[calc(100%+10px)] z-50 w-[min(560px,80vw)] -translate-x-1/2 rounded-[24px] p-3 rtl:translate-x-1/2">
                <div className="flex items-center gap-3 rounded-2xl px-3 pb-3 pt-2">
                  <span aria-hidden="true" className="nav-mega-icon grid size-11 shrink-0 place-items-center rounded-2xl">
                    <NavIcon d={m.icon} className="size-5.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-black text-ink">{m.label}</span>
                    {m.tag ? <span className="block truncate text-xs text-ink-soft">{m.tag}</span> : null}
                  </span>
                </div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {m.links.map((l) => {
                    const here = activeHref(pathname, m.links.map((x) => x.href)) === l.href
                    return (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          aria-current={here ? 'page' : undefined}
                          onClick={() => setOpen(null)}
                          className={cn('nav-link flex items-start gap-3 rounded-2xl p-3', here && 'nav-link-on')}
                        >
                          <span aria-hidden="true" className="nav-link-icon grid size-9 shrink-0 place-items-center rounded-xl">
                            <NavIcon d={l.icon} className="size-4.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-bold text-ink">{l.label}</span>
                            {l.desc ? <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-ink-soft">{l.desc}</span> : null}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}

export function NavIcon({ d, className = 'size-4.5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
