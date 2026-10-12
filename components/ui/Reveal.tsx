'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * โผล่ขึ้นมาตอนเลื่อนมาถึง
 *
 * ★★★ เริ่มต้นเป็น "เห็นปกติ" แล้วให้ JS หรี่ลงเองก่อน ไม่ใช่กลับกัน
 *
 *     ★ ถ้าเขียน opacity: 0 ไว้ใน CSS ตั้งแต่แรก แล้ว JS ไม่ทำงาน
 *       (ปิด JS · สคริปต์ล้ม · IntersectionObserver ไม่รองรับ)
 *       ★★ เนื้อหาจะหายไปทั้งก้อนอย่างถาวร โดยไม่มีอะไรบอกใคร
 *     ★ สลับลำดับแบบนี้ กรณีแย่ที่สุดคือ "ไม่มีแอนิเมชัน" ซึ่งรับได้
 *       ★★ กรณีแย่ที่สุดของอีกทางคือ "หน้าว่างเปล่า" ซึ่งรับไม่ได้
 *
 * ★★ เล่นครั้งเดียวแล้วเลิกดู
 *    ★ เลื่อนขึ้นเลื่อนลงแล้วของกะพริบเข้าออกทุกรอบคือของที่น่ารำคาญ
 *      ★★ ไม่ใช่ของที่น่าสนใจ — คนเลื่อนกลับขึ้นไปเพราะอยากอ่านซ้ำ
 *         ไม่ใช่เพราะอยากดูแอนิเมชันอีกรอบ
 */
export function Reveal({
  children,
  className,
  /** ★ หน่วงเป็นมิลลิวินาที — ใช้ไล่ลำดับหลายก้อนที่โผล่พร้อมกัน */
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'section'
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  /* ★ 'idle' = ยังไม่ได้แตะ · 'off' = หรี่ไว้รอ · 'on' = โผล่แล้ว */
  const [state, setState] = useState<'idle' | 'off' | 'on'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    /* ★ ไม่รองรับก็ข้ามไปเลย — ของยังเห็นปกติเพราะเริ่มที่ 'idle' */
    if (typeof IntersectionObserver === 'undefined') return

    /*
     * ★★ อยู่ในจอตั้งแต่แรกแล้วไม่ต้องหรี่
     *    ★ หรี่แล้วค่อยโผล่ทันทีในเฟรมเดียวกัน = กะพริบ
     *      ★★ ซึ่งแย่กว่าไม่ทำอะไรเลย
     */
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight * 0.92) {
      setState('on')
      return
    }

    setState('off')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          setState('on')
          io.disconnect()
        }
      },
      /* ★ โผล่ก่อนถึงขอบจอนิดหนึ่ง — ให้แอนิเมชันจบพอดีตอนตาไปถึง */
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={cn('sys-reveal', state === 'off' && 'sys-reveal-off', className)}
      style={state === 'off' ? undefined : { transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}
