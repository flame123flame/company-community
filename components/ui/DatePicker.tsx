'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { Untranslated, useOt } from '@/lib/i18n/office'

/**
 * ตัวเลือกวันที่ของทั้งระบบ
 *
 * ★★★ มาแทน <input type="date"> ซึ่งหน้าตาต่างกันทุกเบราว์เซอร์
 *
 *     ★ Safari บนมือถือเปิดล้อหมุนสามชั้น · Chrome บนเดสก์ท็อปเปิดปฏิทิน
 *       เล็ก ๆ ที่สีไม่ตามธีมของเว็บ · Firefox เป็นอีกแบบ
 *       ★★ แปลว่า "หน้าตาของการเลือกวันที่" เป็นสิ่งเดียวในหน้าที่เราคุมไม่ได้
 *     ★ และไม่มีทางใส่ "วันนี้ / เมื่อวาน" เข้าไปในนั้นได้ ทั้งที่สองปุ่มนั้น
 *       ครอบคลุมเกือบทุกครั้งที่คนกรอกบิล
 *
 * ★★★ ปฏิทินวาดเอง แต่ "ชื่อเดือนและชื่อวัน" ไม่ได้เขียนเอง
 *
 *     ★ ใช้ Intl.DateTimeFormat ตามภาษาของผู้ใช้ ★★ จึงได้ครบ 16 ภาษา
 *       โดยไม่ต้องเติมกุญแจแปลสักตัว และไม่มีวันหลุดเป็นภาษาอังกฤษ
 *     ★ วันแรกของสัปดาห์ก็ต่างกันตามภูมิภาค — ดึงจาก Intl เช่นกัน
 *       ★★ ปฏิทินที่ขึ้นต้นด้วยวันจันทร์ให้คนไทยดู คือปฏิทินที่อ่านผิดทุกครั้ง
 *
 * ★ ค่าเป็นสตริง YYYY-MM-DD ตลอด ไม่ใช่ Date
 *   ★★ Date พก "เวลาและเขตเวลา" มาด้วย ซึ่งทำให้วันเลื่อนไปมาเมื่อส่งข้ามเครือข่าย
 *      ★ บิลวันที่ 3 ต.ค. ตอนเที่ยงคืนครึ่ง กลายเป็นวันที่ 2 ได้ทันทีที่แปลงเป็น UTC
 */

/** วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาเครื่องผู้ใช้ */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** เมื่อวาน */
export function yesterdayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) }
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * วันแรกของสัปดาห์ตามภูมิภาค (0 = อาทิตย์)
 *
 * ★ Intl.Locale.weekInfo ยังไม่มีในทุกเบราว์เซอร์ — ถอยไปวันอาทิตย์
 *   ★★ ซึ่งถูกสำหรับไทยอยู่แล้ว จึงไม่ใช่การเดาแบบสุ่ม
 */
function firstWeekday(locale: string): number {
  try {
    const info = (new Intl.Locale(locale) as unknown as { weekInfo?: { firstDay?: number } })
      .weekInfo
    /* ★ Intl นับ 1=จันทร์ … 7=อาทิตย์ ส่วน Date นับ 0=อาทิตย์ */
    if (info?.firstDay) return info.firstDay % 7
  } catch {
    /* ★ ภาษาที่ Intl ไม่รู้จักไม่ควรทำให้ปฏิทินพัง */
  }
  return 0
}

export function DatePicker({
  value,
  onChange,
  /** วันล่าสุดที่เลือกได้ — ปกติคือวันนี้ */
  max,
  min,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (iso: string) => void
  max?: string
  min?: string
  className?: string
  'aria-label'?: string
}) {
  const ot = useOt()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  /*
   * ★★★ เปิดขึ้นบนเมื่อข้างล่างไม่พอ
   *
   *     ★ ปฏิทินสูง ~340px ★★ ช่องวันที่อยู่เกือบท้ายฟอร์มเสมอ จึงเปิดลงล่าง
   *       แล้วถูกขอบจอตัดเกือบทุกครั้ง — วัดได้จริงในเบราว์เซอร์ว่า
   *       ก้นปฏิทินอยู่นอกจอ
   *     ★ วัดตอนกดเปิด ไม่ใช่ตอน render — ตำแหน่งขึ้นกับว่าเลื่อนหน้าไปแค่ไหน
   */
  const [up, setUp] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const parsed = parseIso(value) ?? parseIso(todayIso())!
  /* เดือนที่ปฏิทินกำลังเปิดอยู่ — แยกจากวันที่เลือก เพราะพลิกดูเดือนอื่นได้ */
  const [view, setView] = useState({ y: parsed.y, m: parsed.m })

  /* ★ เปิดปฏิทินแล้วต้องเห็นเดือนของวันที่เลือกอยู่ ไม่ใช่เดือนที่เปิดค้างไว้รอบก่อน */
  useEffect(() => {
    if (open) setView({ y: parsed.y, m: parsed.m })
  }, [open, parsed.y, parsed.m])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(view.y, view.m, 1),
      ),
    [locale, view.y, view.m],
  )

  const start = firstWeekday(locale)

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    /* 2024-01-07 เป็นวันอาทิตย์ — ใช้เป็นจุดตั้งต้นที่รู้แน่ว่าวันอะไร */
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2024, 0, 7 + ((start + i) % 7))),
    )
  }, [locale, start])

  const cells = useMemo(() => {
    const firstDow = new Date(view.y, view.m, 1).getDay()
    const lead = (firstDow - start + 7) % 7
    const days = new Date(view.y, view.m + 1, 0).getDate()
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ]
  }, [view.y, view.m, start])

  const today = todayIso()
  const label = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(parsed.y, parsed.m, parsed.d)),
    [locale, parsed.y, parsed.m, parsed.d],
  )

  function pick(iso: string) {
    onChange(iso)
    setOpen(false)
  }

  /* ★ เดือนก่อน/ถัดไปถูกปิดเมื่อทั้งเดือนอยู่นอกช่วงที่อนุญาต
       ★★ ปุ่มที่กดแล้วไปเจอเดือนที่ทุกวันกดไม่ได้ ไม่ควรกดได้ตั้งแต่แรก */
  const prevBlocked = min ? toIso(view.y, view.m, 1) <= min : false
  const nextBlocked = max
    ? toIso(view.y, view.m + 1, 1) > max && toIso(view.y, view.m, 1) > max.slice(0, 7) + '-01'
    : false

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={(e) => {
          if (!open) {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            /* ★ 360 = ความสูงของปฏิทินบวกระยะหายใจ */
            setUp(window.innerHeight - r.bottom < 360 && r.top > 360)
          }
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        aria-label={ariaLabel ?? ot('date.pick')}
        className={cn(
          'flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-start text-sm transition-colors',
          open ? 'border-accent bg-surface' : 'border-line bg-surface hover:border-line-strong',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
        <svg
          viewBox="0 0 24 24"
          className={cn('size-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          className={cn(
            'datepicker-pop absolute z-50 w-[18.5rem] rounded-2xl border border-line',
            'bg-elevated p-3 shadow-2xl',
            up ? 'bottom-full mb-2' : 'mt-2',
          )}
        >
          {/* ── หัวปฏิทิน ─────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <NavBtn
              label={ot('date.prevMonth')}
              dir="prev"
              disabled={prevBlocked}
              onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 }))}
            />
            <span dir="auto" className="text-[13.5px] font-semibold text-ink">
              {monthLabel}
            </span>
            <NavBtn
              label={ot('date.nextMonth')}
              dir="next"
              disabled={nextBlocked}
              onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 }))}
            />
          </div>

          {/* ── ชื่อวัน ────────────────────────────────────── */}
          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {weekdays.map((w, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="grid h-7 place-items-center text-[10.5px] font-medium text-ink-faint"
              >
                {w}
              </span>
            ))}
          </div>

          {/* ── วัน ───────────────────────────────────────── */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <span key={`x${i}`} />
              const iso = toIso(view.y, view.m, d)
              const selected = iso === value
              const isToday = iso === today
              const blocked = (max && iso > max) || (min && iso < min)
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={Boolean(blocked)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={selected}
                  onClick={() => pick(iso)}
                  className={cn(
                    'relative grid h-9 place-items-center rounded-lg text-[13px] tabular-nums transition-colors',
                    blocked
                      ? 'cursor-not-allowed text-ink-faint/35'
                      : selected
                        ? 'bg-accent font-bold text-accent-ink'
                        : 'text-ink hover:bg-surface',
                  )}
                >
                  {d}
                  {/* ★ จุดใต้เลขบอก "วันนี้" — ยังเห็นได้แม้วันนี้ไม่ใช่วันที่เลือก */}
                  {isToday && !selected ? (
                    <span className="absolute bottom-1 size-1 rounded-full bg-accent" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {/*
            * ── ทางลัด ─────────────────────────────────────
            * ★★ สองปุ่มนี้ครอบคลุมเกือบทุกครั้งที่คนกรอกบิล
            *    ★ บิลค่าข้าวถูกบันทึกวันเดียวกันหรือวันรุ่งขึ้นแทบทั้งหมด
            *      ★★ การต้องหาวันในตารางเพื่อเลือก "วันนี้" คือการทำให้
            *         กรณีที่พบบ่อยที่สุด เป็นกรณีที่ต้องทำงานมากที่สุด
            */}
          <div className="mt-2 flex gap-1.5 border-t border-line pt-2">
            <Quick onClick={() => pick(todayIso())} active={value === todayIso()}>
              <Untranslated>{ot('date.today')}</Untranslated>
            </Quick>
            <Quick
              onClick={() => pick(yesterdayIso())}
              active={value === yesterdayIso()}
              disabled={Boolean(min && yesterdayIso() < min)}
            >
              <Untranslated>{ot('date.yesterday')}</Untranslated>
            </Quick>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NavBtn({
  label,
  dir,
  disabled,
  onClick,
}: {
  label: string
  dir: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
        disabled ? 'cursor-not-allowed text-ink-faint/35' : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      {/* ★ ลูกศรกลับด้านเองในภาษาที่อ่านขวาไปซ้าย */}
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
}

function Quick({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'min-h-9 flex-1 rounded-lg px-2 text-[12px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-ink-faint/40'
          : active
            ? 'bg-accent/15 text-accent'
            : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
