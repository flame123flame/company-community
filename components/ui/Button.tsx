import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

/**
 * ปุ่มแบบ YouTube — ทรงแคปซูล (pill) ไม่ใช่สี่เหลี่ยมมุมมน
 *
 * ★ รายละเอียดที่ทำให้ "เป็น YouTube" จริง ๆ:
 *   • rounded-full เสมอ ไม่ว่าปุ่มจะเล็กหรือใหญ่
 *   • ปุ่มรองเป็นสีเทา #272727 ไม่มีเส้นขอบ (ยกระดับด้วยสี ไม่ใช่เส้น)
 *   • hover เปลี่ยนเป็น #3f3f3f ทันที ไม่มี transition ยาว ๆ
 *   • ตัวอักษร 14px น้ำหนัก 500 — เล็กกว่าที่แอปทั่วไปใช้
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'filled'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  /** แดง — ใช้กับการกระทำหลักอย่างสร้างห้อง */
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  /** เทา — ปุ่มมาตรฐานของ YouTube (แชร์ บันทึก ฯลฯ) */
  secondary: 'bg-surface text-ink hover:bg-surface-hover',
  /** โปร่ง — ไอคอนบน header */
  ghost: 'text-ink hover:bg-surface',
  danger: 'bg-surface text-danger hover:bg-danger/15',
  /** ขาวทึบ — ปุ่มเน้นสุดของ YouTube (Subscribe) */
  filled: 'bg-ink text-page hover:bg-ink/90',
}

/*
 * ★★ มือถือสูงขึ้น (จุดแตะขั้นต่ำ ~44px) · จอ ≥640px ขนาดเดิมทุกประการ
 *    ★ นิ้วไม่แม่นเท่าเมาส์ — ปุ่ม 32px บนมือถือคือปุ่มที่กดพลาดไปโดนข้าง ๆ
 *    ★★ ห้ามส่ง h-* ทับผ่าน className — cn() แค่ต่อคลาส ไม่ตัดคลาสชนกัน
 *       ใช้ min-h-* แทนเสมอ (min-height ชนะ height เสมอ ไม่ขึ้นกับลำดับใน CSS)
 */
const SIZES: Record<Size, string> = {
  sm: 'h-10 min-w-10 px-3 text-[13px] gap-1.5 sm:h-8 sm:min-w-0',
  md: 'h-11 px-4 text-sm gap-1.5 sm:h-9',
  lg: 'h-11 px-5 text-sm gap-2 sm:h-10',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  block = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // ระหว่าง loading ต้องกดซ้ำไม่ได้ — กัน double-submit ที่ทำให้เพิ่มเพลงซ้ำ
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium',
        'transition-colors duration-100',
        'disabled:opacity-40 disabled:pointer-events-none',
        'touch-manipulation select-none whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  )
}

/** ปุ่มไอคอนกลม 40px แบบบน header ของ YouTube */
export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full sm:size-10',
        'text-ink transition-colors duration-100 hover:bg-surface',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
