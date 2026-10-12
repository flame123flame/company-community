'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * ตัวเลขที่วิ่งขึ้นมาหาค่าจริง
 *
 * ★★★ ใช้กับตัวเลขที่เป็น "ผลสรุป" เท่านั้น — ยอดเงิน คะแนน จำนวนรายการ
 *
 *     ★ ตัวเลขที่ต้องอ่านเพื่อทำอะไรต่อทันที (เช่นรหัสห้อง เลขบัญชี
 *       เวลานับถอยหลัง) ห้ามใช้ ★★ คนจะอ่านค่าระหว่างทางไปใช้จริง
 *
 * ★★ วิ่งจากค่าเดิมไปค่าใหม่ ไม่ใช่จากศูนย์เสมอ
 *    ★ ยอดเงินเปลี่ยนจาก 1,200 เป็น 1,250 แล้ววิ่งจาก 0 ใหม่
 *      ★★ อ่านว่า "ยอดถูกล้าง" ไม่ใช่ "ยอดขยับนิดเดียว"
 *
 * ★ requestAnimationFrame ไม่ใช่ setInterval
 *   ★★ จอ 120Hz จะได้ลื่นเต็มที่ · แท็บที่ถูกพักจะหยุดเองโดยไม่กินแรงเครื่อง
 */
export function CountUp({
  value,
  duration = 900,
  format,
  className,
}: {
  value: number
  duration?: number
  /** ★ จัดรูปเองได้ เช่นใส่ลูกน้ำหรือทศนิยม — ไม่งั้นได้เลขดิบ */
  format?: (n: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return

    /*
     * ★★ เคารพ "ลดการเคลื่อนไหว" — กระโดดไปค่าจริงเลย
     *    ★ ตัวเลขที่ไล่ขึ้นคือการเคลื่อนไหวเหมือนกัน แม้จะไม่ได้ขยับตำแหน่ง
     */
    const still =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (still || duration <= 0) {
      fromRef.current = value
      setShown(value)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      /* ★ ออกตัวเร็วแล้วค่อย ๆ หยุด — อ่านง่ายกว่าวิ่งเร็วเท่ากันตลอด */
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(from + (value - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      fromRef.current = value
      setShown(value)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  const n = Math.round(shown)
  return <span className={cn('sys-count', className)}>{format ? format(n) : n}</span>
}
