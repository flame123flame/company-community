'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * เซกชันของเนื้อหา — กางหุบได้
 *
 * ★★★ มีขึ้นเพราะทุกหน้าในโมดูลเขียนหัวข้อเองคนละแบบ
 *
 *     บางหน้าเป็น <p className="text-sm font-medium"> · บางหน้าเป็น <h2> ·
 *     บางหน้าไม่มีหัวข้อเลยแล้วใช้ระยะขอบแทน
 *     ★ ผลคือฟอร์มยาว ๆ อ่านเป็นกองเดียว แล้วคนที่เลื่อนมากลางหน้า
 *       ไม่รู้ว่ากำลังกรอกส่วนไหนอยู่
 *
 * ★★★ "กางหุบได้" ไม่ใช่ของประดับ — มันคือการตัดสินใจว่าอะไรต้องเห็นตอนไหน
 *
 *     ★ ฟอร์มที่ยาวเกินสองจอทำให้คนเลื่อนผ่านของที่ยังไม่ได้กรอก
 *       ★★ แต่การซ่อนของไว้โดยไม่บอกว่าข้างในมีอะไร ก็ทำให้คนไม่เปิดมันเลย
 *     ★★ `summary` จึงจำเป็น — ตอนหุบอยู่ต้องเห็นว่าเลือกอะไรไว้แล้ว
 *        ★ ส่วนหัวที่เขียนแค่ "เพิ่มรายละเอียด" ไม่ได้บอกว่าควรเปิดตอนไหน
 *          ซึ่งแปลว่าไม่มีใครเปิด
 */
export function Section({
  title,
  hint,
  badge,
  action,
  /** เปิด/ปิดได้ไหม — ไม่ใส่ = เป็นหัวข้อเฉย ๆ */
  collapsible,
  defaultOpen = true,
  /** ข้อความสรุปตอนหุบ — บอกว่าข้างในมีอะไรอยู่แล้ว */
  summary,
  className,
  children,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  badge?: React.ReactNode
  action?: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  summary?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const shown = !collapsible || open

  const head = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[14.5px] font-semibold text-ink">{title}</span>
          {badge}
        </span>
        {/*
          * ★ ตอนกางอยู่แสดงคำอธิบาย ตอนหุบแสดงสิ่งที่เลือกไว้
          *   ★★ สองอย่างนี้ตอบคนละคำถาม — "ส่วนนี้คืออะไร" กับ "ตอนนี้เป็นยังไง"
          *      ★ และคำถามที่สองคือคำถามเดียวที่สำคัญเมื่อมันถูกพับไว้
          */}
        {shown
          ? hint
            ? <span className="mt-0.5 block text-[11.5px] text-ink-faint">{hint}</span>
            : null
          : summary
            ? <span className="mt-0.5 block truncate text-[11.5px] text-ink-soft">{summary}</span>
            : hint
              ? <span className="mt-0.5 block text-[11.5px] text-ink-faint">{hint}</span>
              : null}
      </span>

      {collapsible ? (
        <svg
          viewBox="0 0 24 24"
          className={cn(
            'size-4 shrink-0 text-ink-faint transition-transform duration-200',
            open && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      ) : null}
    </>
  )

  return (
    <section className={cn('mt-6 first:mt-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 text-start"
          >
            {head}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">{head}</div>
        )}
        {action}
      </div>

      {/* ★ ถอดออกจาก DOM ตอนหุบ ไม่ใช่ซ่อนด้วย CSS
          ★★ ช่องที่ซ่อนอยู่แต่ยังอยู่ใน DOM ยังโฟกัสด้วยปุ่ม Tab ได้
             ซึ่งพาคนไปอยู่ในที่ที่มองไม่เห็นว่าตัวเองอยู่ตรงไหน */}
      {shown ? <div className="mt-2.5">{children}</div> : null}
    </section>
  )
}
