import type { ReactNode } from 'react'

/**
 * สถานะ "ยังไม่มีข้อมูล"
 *
 * ★★★ สถานะว่างคือหน้าจอที่คนเห็นเป็นอันดับแรกตอนเพิ่งเริ่มใช้ระบบ
 *
 *     ★ เดิมทุกหน้าเขียนเป็น <p> สีเทาบรรทัดเดียวลอยอยู่กลางที่ว่าง
 *       ★★ ซึ่งอ่านได้สองอย่างพร้อมกัน: "ยังไม่มีข้อมูล" กับ "หน้านี้พัง"
 *          — แยกไม่ออกเลยว่าอันไหน
 *     ★ กล่องที่มีขอบ มีไอคอน และบอกว่าทำอะไรต่อได้ ตอบชัดว่าระบบปกติดี
 *       แค่ยังไม่มีใครใส่ข้อมูล
 *
 * ★★ ไอคอนเป็น path ของ SVG ส่งเข้ามา ไม่ใช่รูป — แต่ละหน้าใส่ของตัวเองได้
 *    โดยไม่ต้องเพิ่มไฟล์และไม่ต้องมีไลบรารีไอคอน
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description?: string
  /** path d ของ SVG 24×24 */
  icon?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state rounded-3xl px-6 py-12 text-center">
      <span className="empty-state-orb mx-auto grid size-14 place-items-center rounded-2xl">
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={icon ?? 'M5 7h14M5 12h14M5 17h8'} />
        </svg>
      </span>

      <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>

      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}
