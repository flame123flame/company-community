'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  type ThemePref,
} from '@/lib/theme'
import { useT } from '@/lib/i18n/client'
import type { DictKey } from '@/lib/i18n/dict'

const OPTIONS = [
  { value: 'system', label: 'header.themeSystem', hint: 'header.themeSystemHint' },
  { value: 'dark', label: 'header.themeDark', hint: 'header.themeDarkHint' },
  { value: 'light', label: 'header.themeLight', hint: 'header.themeLightHint' },
] as const satisfies readonly { value: ThemePref; label: DictKey; hint: DictKey }[]

/**
 * ★★ ตัวอย่างหน้าเว็บจิ๋วข้างตัวเลือก — ไม่ใช่แค่ไอคอน
 *
 *    "โทนมืด/โทนสว่าง" เป็นคำที่ต้องแปลงเป็นภาพในหัวก่อนถึงจะเข้าใจ
 *    ★ แต่สิ่งที่คนอยากรู้คือ "กดแล้วหน้าจะหน้าตายังไง" ซึ่งตอบด้วยรูป
 *      ได้ตรงกว่าคำทุกคำ — แถบบน + การ์ดสองใบ ก็พอให้เห็นความต่างแล้ว
 *
 *    ★★★ สีในนี้ต้องฝังตรง ๆ ห้ามใช้ token ของธีม
 *
 *        ถ้าใช้ bg-page ตัวอย่าง "โทนสว่าง" จะกลายเป็นสีดำตอนอยู่ในโหมดมืด
 *        ★ คือแสดงสิ่งที่ตรงข้ามกับที่มันอ้างว่าแสดง ซึ่งแย่กว่าไม่มีตัวอย่างเลย
 *
 *        ★ ค่าที่ใช้คือค่าเดียวกับ --color-page/--color-surface/--color-line
 *          ของธีมนั้น ๆ ใน globals.css เป๊ะ ๆ — ไม่ได้เพิ่มสีใหม่เข้าระบบ
 *          แค่หยิบของที่มีอยู่แล้วมาวาดให้ดู
 */
const SWATCH = {
  dark: { page: '#0f0f0f', bar: '#212121', card: '#272727', line: '#303030' },
  light: { page: '#ffffff', bar: '#f9f9f9', card: '#f2f2f2', line: '#e5e5e5' },
} as const

function ThemePreview({ mode, big = false }: { mode: 'system' | 'dark' | 'light'; big?: boolean }) {
  const size = big ? 'h-14 w-20 rounded-xl' : 'size-10 rounded-lg'
  /* ★ "ตามเครื่อง" วาดสองซีกในกรอบเดียว — สื่อว่าเป็นได้ทั้งสองอย่าง */
  if (mode === 'system') {
    return (
      <span
        aria-hidden="true"
        className={cn('relative grid shrink-0 overflow-hidden border border-line', size)}
      >
        <span className="absolute inset-0 flex">
          <span className="h-full w-1/2" style={{ background: SWATCH.dark.page }} />
          <span className="h-full w-1/2" style={{ background: SWATCH.light.page }} />
        </span>
        <span className="absolute inset-x-0 top-0 flex h-[9px]">
          <span className="h-full w-1/2" style={{ background: SWATCH.dark.bar }} />
          <span className="h-full w-1/2" style={{ background: SWATCH.light.bar }} />
        </span>
        <span className="absolute inset-x-[5px] bottom-[6px] flex h-[11px] gap-[3px]">
          <span className="flex-1 rounded-[2px]" style={{ background: SWATCH.dark.card }} />
          <span className="flex-1 rounded-[2px]" style={{ background: SWATCH.light.card }} />
        </span>
      </span>
    )
  }

  const s = SWATCH[mode]
  return (
    <span
      aria-hidden="true"
      className={cn('relative grid shrink-0 overflow-hidden border', size)}
      style={{ background: s.page, borderColor: s.line }}
    >
      <span className="absolute inset-x-0 top-0 h-[9px]" style={{ background: s.bar }} />
      <span className="absolute inset-x-[5px] bottom-[6px] flex h-[11px] gap-[3px]">
        <span className="flex-1 rounded-[2px]" style={{ background: s.card }} />
        <span className="flex-1 rounded-[2px]" style={{ background: s.card }} />
      </span>
    </span>
  )
}

/**
 * ปุ่มสลับโทนสีในแถบบน
 *
 * ★★ ทำไมเป็นเมนูสามตัวเลือก ไม่ใช่สวิตช์สองสถานะ
 *
 *    สวิตช์ดวงอาทิตย์/พระจันทร์ตอบไม่ได้ว่า "ตอนนี้ตามเครื่องอยู่หรือถูกล็อกไว้"
 *    คนที่ตั้งเครื่องให้สลับอัตโนมัติตอนพระอาทิตย์ตกจะกดสวิตช์ครั้งเดียวแล้ว
 *    เว็บค้างอยู่โหมดนั้นตลอดไปโดยไม่รู้ตัว — แล้วสงสัยว่าทำไมมันไม่ตามระบบอีก
 *
 *    ★ สามตัวเลือกทำให้ "ตามเครื่อง" เป็นสถานะที่กลับไปได้ ไม่ใช่ทางเดียว
 */
export function ThemeToggle() {
  const t = useT()
  const pref = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    // ★ capture phase — เหตุผลเดียวกับเมนูอื่นในแอปนี้: แถวที่ถูกกดอาจถูก
    //   unmount ไปก่อนที่ event จะ bubble มาถึงเรา แล้ว contains() จะตอบ false
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0]!

  /*
   * ★★ เปลี่ยนโทนแบบ "วงกลมแผ่ออกจากจุดที่กด" (View Transitions API)
   *    ★ เบราว์เซอร์ที่ไม่รองรับ หรือคนที่ตั้งลดการเคลื่อนไหว → เปลี่ยนทันทีเหมือนเดิม
   */
  function choose(value: ThemePref, e: React.MouseEvent) {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduce || value === pref) {
      setTheme(value)
      return
    }
    const x = e.clientX || window.innerWidth - 40
    const y = e.clientY || 28
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const vt = doc.startViewTransition(() => setTheme(value))
    void vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        )
      })
      .catch(() => undefined)
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${t('header.theme')}: ${t(current.label)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('header.theme')}
        style={{ '--hc': '255 149 0' } as React.CSSProperties}
        className={cn(
          'hdr-btn grid size-11 shrink-0 place-items-center rounded-full text-ink sm:size-10',
          'transition-colors hover:bg-surface',
          /* ★ ค้างสีไว้ตอนเมนูเปิด — บอกว่าเมนูที่ลอยอยู่มาจากปุ่มนี้ (เหมือนปุ่มภาษา) */
          open && 'bg-surface',
        )}
      >
        {/**
         * ★ ไอคอนบอก "สิ่งที่เห็นอยู่ตอนนี้" ไม่ใช่ "สิ่งที่จะได้ถ้ากด"
         *   สองแบบนี้กลับด้านกัน และแบบหลังทำให้คนอ่านผิดเสมอ —
         *   ใช้ CSS สลับโดยดูจาก data-theme จึงไม่ต้องอ่านค่าใน JS เลย
         *   (และไม่มีทางไม่ตรงกับสีที่แสดงอยู่จริง)
         */}
        <SunIcon className="hidden size-6 [html[data-theme=light]_&]:block" />
        <MoonIcon className="hidden size-6 [html[data-theme=dark]_&]:block" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('header.theme')}
          className={cn(
            /* ★ end-0 ไม่ใช่ right-0 — เหตุผลเดียวกับเมนูภาษา (RTL) */
            'absolute end-0 top-[calc(100%+8px)] z-50 w-[min(calc(100vw-24px),380px)] overflow-hidden',
            /* ★ มือถือ: ลอยเต็มความกว้างจอใต้แถบหัว — ที่ 320px ยึดขอบขวาของปุ่มแล้วล้นออกซ้ายจอ */
            'max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-[calc(var(--spacing-header)+8px)] max-sm:w-auto',
            'pop-wow rounded-[26px]',
          )}
          style={{ '--pc': '255 176 32', '--pc2': '88 86 214' } as React.CSSProperties}
        >
          {/* ── หัว: ดวงอาทิตย์-พระจันทร์ ── */}
          <div className="pop-hero relative overflow-hidden px-4 pb-4 pt-4">
            <span aria-hidden="true" className="pop-blob pop-blob-a" />
            <span aria-hidden="true" className="pop-blob pop-blob-b" />
            <div className="relative flex items-center gap-3">
              <span aria-hidden="true" className="pop-icon theme-orb grid size-12 shrink-0 place-items-center rounded-2xl">
                <SunIcon className="hidden size-6 [html[data-theme=light]_&]:block" />
                <MoonIcon className="hidden size-6 [html[data-theme=dark]_&]:block" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black leading-tight text-[var(--ck-shine)]">{t('header.theme')}</p>
                <p className="text-xs font-medium text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">{t('header.themeHint')}</p>
              </div>
            </div>
          </div>

          {/* ── สามตัวเลือกเป็นการ์ดตัวอย่างหน้าจอ ── */}
          <div className="grid grid-cols-3 gap-2 p-3">
            {OPTIONS.map((option, i) => {
              const active = pref === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  style={{ '--i': i } as React.CSSProperties}
                  onClick={(e) => {
                    choose(option.value, e)
                    setOpen(false)
                  }}
                  className={cn('menu-item theme-card flex flex-col items-center gap-2 rounded-2xl p-2 pb-2.5 text-center', active && 'theme-card-on')}
                >
                  <span className="relative">
                    <ThemePreview mode={option.value} big />
                    {active ? (
                      <span aria-hidden="true" className="theme-check absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full">
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
                          <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                        </svg>
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[12.5px] leading-tight text-ink', active ? 'font-bold' : 'font-medium')}>
                      {t(option.label)}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-faint">{t(option.hint)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM11.25 2h1.5v3h-1.5V2zm0 17h1.5v3h-1.5v-3zM2 11.25h3v1.5H2v-1.5zm17 0h3v1.5h-3v-1.5zM4.22 5.28l1.06-1.06 2.12 2.12-1.06 1.06-2.12-2.12zm12.38 12.38 1.06-1.06 2.12 2.12-1.06 1.06-2.12-2.12zM5.28 19.78l-1.06-1.06 2.12-2.12 1.06 1.06-2.12 2.12zM17.66 7.4 16.6 6.34l2.12-2.12 1.06 1.06L17.66 7.4z" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.3 3a9 9 0 1 0 8.7 11.3 7.5 7.5 0 0 1-8.7-11.3zm-.9 17a7.5 7.5 0 0 1-.8-14.96A9 9 0 0 0 19 15.9 7.48 7.48 0 0 1 11.4 20z" />
    </svg>
  )
}
