'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import type { NavModule } from '@/lib/office/nav-data'
import { NavIcon, activeModule } from './ModuleNav'
import { ThemeToggle } from '@/components/ThemeToggle'

/* ★ สีประจำระบบชุดเดียวกับเมนู (กิน · เงิน · เกม · ตลาด · แชท · เพลง …) */
const DOTS = ['255 0 51', '255 149 0', '52 199 123', '175 82 222', '10 132 255', '48 209 176', '255 176 32', '88 86 214', '255 0 51']

/**
 * ปุ่มรวมทุกระบบ (9 จุด) — อยู่ในแถบบนทุกหน้า ทุกขนาดจอ
 *
 * ★★★ ทางเดียวที่มือถือไปโมดูลอื่นได้โดยไม่ต้องกลับหน้าแรก
 *     ★ จอกว้างมีแถบเมนูโมดูลแล้ว แต่หน้าห้องฟังเพลงไม่มี (ตรงกลางเป็นช่องค้นหา)
 *       ปุ่มนี้จึงต้องอยู่ทุกหน้า ไม่ใช่เฉพาะมือถือ
 *
 * ★ มือถือ = แผ่นเต็มจอใต้แถบบน · จอกว้าง = กล่องลอยมุมขวา
 * ★ ปิดได้ทั้ง Esc · แตะข้างนอก · เปลี่ยนหน้า (จำ path ไว้ ไม่ต้องใช้ effect)
 */
export function AppLauncher({
  modules,
  labels,
}: {
  modules: NavModule[]
  labels: { open: string; title: string; hint: string; close: string; theme: string }
}) {
  const pathname = usePathname()
  const current = activeModule(pathname, modules)
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null)
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenAt(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={labels.open}
        title={labels.open}
        style={{ '--hc': '255 0 51' } as CSSProperties}
        className={cn(
          'hdr-btn hdr-launch grid size-11 place-items-center rounded-full text-ink transition-colors sm:size-10',
          open ? 'bg-ink text-page' : 'hover:bg-surface',
        )}
      >
        {/* ★ ไอคอน 9 จุดหมุนเป็นกากบาทตอนเปิด — บอกว่ากดซ้ำเพื่อปิด */}
        <svg viewBox="0 0 24 24" className={cn('size-5 transition-transform duration-300', open && 'rotate-45')} fill="currentColor" aria-hidden="true">
          {/* ★ จุดแต่ละจุดเป็นสีประจำระบบ — บอกว่าข้างในคือ "ทุกระบบ" ก่อนกดด้วยซ้ำ */}
          {[5, 12, 19].flatMap((y, row) =>
            [5, 12, 19].map((x, col) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" className="hdr-dot" style={{ '--dc': DOTS[row * 3 + col] } as CSSProperties} />
            )),
          )}
        </svg>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={labels.title}
          className={cn(
            'nav-launcher z-[60] overflow-y-auto overscroll-contain',
            /* มือถือ: เต็มจอใต้แถบบน */
            'fixed inset-x-0 bottom-0 top-[var(--spacing-header)] p-4',
            /* จอกว้าง: กล่องลอยมุมขวา */
            'sm:absolute sm:inset-auto sm:end-0 sm:top-[calc(100%+10px)] sm:max-h-[min(80vh,720px)] sm:w-[min(680px,calc(100vw-32px))] sm:rounded-[28px] sm:p-5',
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black text-ink">{labels.title}</p>
              <p className="text-xs text-ink-soft">{labels.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpenAt(null)}
              aria-label={labels.close}
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink sm:hidden"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {modules.map((m, i) => (
              <section
                key={m.id}
                className={cn('nav-mod rounded-[22px] p-3', current === m.id && 'nav-mod-on')}
                style={{ '--tint': m.tint, '--i': i } as CSSProperties}
              >
                <Link href={m.href} onClick={() => setOpenAt(null)} className="flex items-center gap-3 rounded-2xl p-1.5">
                  <span aria-hidden="true" className="nav-mega-icon grid size-11 shrink-0 place-items-center rounded-2xl">
                    <NavIcon d={m.icon} className="size-5.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black text-ink">{m.label}</span>
                    {m.tag ? <span className="block truncate text-[11.5px] text-ink-soft">{m.tag}</span> : null}
                  </span>
                </Link>
                {m.links.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setOpenAt(null)}
                        aria-current={pathname === l.href ? 'page' : undefined}
                        className={cn('nav-chip inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium sm:min-h-9', pathname === l.href && 'nav-chip-on')}
                      >
                        <NavIcon d={l.icon} className="size-3.5" />
                        {l.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          {/* ★ จอแคบกว่า 360px ปุ่มโทนสีไม่อยู่บนแถบบน (ล้นจอ) — อยู่ตรงนี้แทน */}
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface/70 px-4 py-2 min-[360px]:hidden">
            <span className="text-sm font-medium text-ink">{labels.theme}</span>
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </div>
  )
}
