'use client'

import { cn } from '@/lib/cn'

/**
 * สวิตช์เปิด/ปิด
 *
 * ★★★ มาแทน <input type="checkbox"> ที่กระจายอยู่ทั่วโมดูล
 *
 *     ★ ช่องติ๊กของเบราว์เซอร์สูง 16px ★★ ซึ่งต่ำกว่าเกณฑ์จุดแตะ 44px
 *       ของโปรเจกต์นี้เกือบสามเท่า — ที่ผ่านมาแก้ด้วยการห่อ <label>
 *       ที่สูงพอ แล้ววัดที่ label แทน (ดู smallTargets ใน wallet-test)
 *       ★ ซึ่งแปลว่า "จุดที่ตาเล็ง" กับ "จุดที่กดโดน" เป็นคนละขนาดกัน
 *     ★★ สวิตช์ตัวนี้ทั้งก้อนคือปุ่ม — เล็งตรงไหนก็กดโดนตรงนั้น
 *
 * ★★★ สถานะไม่ได้บอกด้วยสีอย่างเดียว
 *
 *     ★ ปุ่มกลมเลื่อนไปอีกข้างด้วย ★★ คนตาบอดสีจึงยังอ่านออก
 *       และ aria-checked ทำให้โปรแกรมอ่านหน้าจออ่านว่า "เปิด/ปิด"
 *       ไม่ใช่ "ปุ่ม" เฉย ๆ
 *
 * ★ เป็น role="switch" ไม่ใช่ checkbox — สวิตช์มีผลทันทีที่กด
 *   ส่วนช่องติ๊กรอการกดยืนยันอีกที ซึ่งเป็นคนละความหมายสำหรับโปรแกรมอ่านหน้าจอ
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  icon,
  disabled,
  /**
   * แถวเรียบ ไม่มีกรอบการ์ด
   *
   * ★★ ใช้กับ "รายการสวิตช์หลายอัน" ที่ค่าเริ่มต้นเป็นเปิดเกือบหมด
   *    ★ การ์ดสีเน้นมีไว้บอกว่า "อันนี้เปิดอยู่" ซึ่งมีความหมายเมื่อมันเป็น
   *      ตัวเลือกเดี่ยว ๆ ★★ แต่พอสิบสองแถวติดสีเหมือนกันหมด สีก็เลิกบอกอะไร
   *      เหลือแค่หน้าจอที่แดงทั้งหน้า
   */
  plain,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** ข้อความข้างสวิตช์ — ถ้าไม่ใส่จะได้สวิตช์เปล่า ๆ (ต้องมี aria-label เอง) */
  label?: React.ReactNode
  hint?: React.ReactNode
  /** path ของ SVG 24×24 */
  icon?: string
  disabled?: boolean
  plain?: boolean
  className?: string
}) {
  const knob = (
    <span
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-line-strong',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute size-5 rounded-full bg-white shadow-sm transition-all duration-200',
          /* ★ ใช้ start/end ไม่ใช่ left/right — ภาษาอาหรับสลับด้าน */
          checked ? 'start-[1.375rem]' : 'start-0.5',
        )}
      />
    </span>
  )

  if (!label) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('grid min-h-11 place-items-center', className)}
      >
        {knob}
      </button>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-2xl p-3 text-start transition-all duration-200',
        plain
          ? 'hover:bg-surface'
          : checked
            ? 'border border-accent/45 bg-accent/8'
            : 'border border-line bg-elevated/50 hover:border-line-strong hover:bg-surface',
        disabled && 'cursor-not-allowed',
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
            checked ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11.5px] text-ink-faint">{hint}</span> : null}
      </span>

      {knob}
    </button>
  )
}
