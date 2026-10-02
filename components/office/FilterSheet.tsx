'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'

/**
 * กล่องตัวกรอง — แผ่นล่างจอบนมือถือ · กล่องลอยใต้ปุ่มบนเดสก์ท็อป
 *
 * ★★ หนึ่งคอมโพเนนต์ สองรูปร่าง ไม่ใช่สองคอมโพเนนต์
 *
 *    หน้าร้านเด็ดกับหน้าสุ่มอาหารต้องใช้รูปแบบเดียวกันตามข้อกำหนด
 *    ★ ถ้าเขียนแยกกัน สองหน้าจะค่อย ๆ ต่างกันทีละนิดทุกครั้งที่แก้ข้างใดข้างหนึ่ง
 *
 * ★★ ต้องวางไว้ใน element ที่เป็น `relative` เพราะบนจอกว้างมันกางตัวเอง
 *    ใต้ปุ่มด้วย absolute — ตัวห่อจึงเป็นตัวกำหนดว่า "ใต้ปุ่มไหน"
 */
export function FilterSheet({
  open,
  onClose,
  title,
  children,
  onClear,
  count,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  onClear?: () => void
  count: number
}) {
  const ot = useOt()
  const panelRef = useRef<HTMLDivElement>(null)

  /* ★ Escape ปิด และคลิกนอกกล่องปิด — สองทางออกที่คนคาดหวังจากกล่องลอย */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    /* ★ capture phase — เหตุผลเดียวกับ dropdown ค้นหาใน AppHeader:
         handler ของ React อยู่บน document เหมือนกัน stopPropagation จึงกันไม่ได้ */
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* ★ ฉากหลังมีเฉพาะบนมือถือ — บนเดสก์ท็อปกล่องลอยไม่ควรบังทั้งหน้า */}
      <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm sm:hidden" aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          /* มือถือ: แผ่นติดขอบล่าง เต็มความกว้าง */
          'fixed inset-x-0 bottom-0 z-70 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-line',
          'bg-elevated p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl',
          /* เดสก์ท็อป: กล่องลอยใต้ปุ่ม */
          'sm:absolute sm:inset-x-auto sm:bottom-auto sm:start-0 sm:top-full sm:mt-2 sm:w-[22rem]',
          'sm:max-h-none sm:rounded-2xl sm:border sm:pb-5 sm:shadow-xl',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">
            <Untranslated>{title}</Untranslated>
          </h2>
          <div className="flex items-center gap-1">
            {count > 0 && onClear ? (
              <button
                type="button"
                onClick={onClear}
                className="grid h-11 place-items-center rounded-full px-3 text-[13px] text-ink-soft transition-colors hover:text-ink"
              >
                <Untranslated>{ot('food.filter.clear')}</Untranslated>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={ot('common.close')}
              className="grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-5">{children}</div>
      </div>
    </>
  )
}

/** หัวข้อย่อยในกล่องตัวกรอง */
export function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
        <Untranslated>{label}</Untranslated>
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

/**
 * ปุ่มเลือกแบบแตะ — สูง 44px ตามข้อกำหนดจุดแตะ
 *
 * ★ ของเดิมในหน้าร้านเด็ดสูง 32px ซึ่งกดพลาดบ่อยบนมือถือ
 *   ★★ ขนาดนี้ใช้กับ "ตัวเลือกที่อยู่ในกล่องตัวกรอง" ซึ่งคนตั้งใจกด
 *      ไม่ใช่ป้ายประดับที่อยู่บนการ์ด — ป้ายพวกนั้นยังเล็กได้ตามเดิม
 */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-11 shrink-0 rounded-full px-4 text-sm transition-colors',
        active
          ? 'bg-ink font-medium text-page'
          : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** สวิตช์เปิด/ปิดในกล่องตั้งค่า */
export function FilterToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-start transition-colors hover:bg-surface/60"
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">
          <Untranslated>{label}</Untranslated>
        </span>
        {hint ? (
          <span className="block text-xs text-ink-faint">
            <Untranslated>{hint}</Untranslated>
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-hover',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-page shadow transition-all',
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </span>
    </button>
  )
}
