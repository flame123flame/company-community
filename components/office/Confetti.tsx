'use client'

import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/lib/office/draw'

/**
 * พลุฉลองตอนได้ผล (FR-X05 · หัวข้อ 4.1)
 *
 * ★★ วาดบน Canvas ไม่ใช่ DOM element หลายร้อยตัว
 *
 *    120 ชิ้น = 120 <div> ที่ React ต้องจัดการ + 120 layer ที่เบราว์เซอร์
 *    ต้อง composite ทุกเฟรม ★ บนมือถือกลาง ๆ จะหล่นต่ำกว่า 60fps ทันที
 *    ซึ่งผิดข้อกำหนดเรื่องประสิทธิภาพที่เอกสารระบุไว้
 *
 *    Canvas วาดทั้งหมดใน draw call เดียว — เบราว์เซอร์เห็นแค่ layer เดียว
 *
 * ★ ไม่ใช้ไลบรารี confetti สำเร็จรูป เพราะทั้งก้อนใหญ่กว่าโค้ดนี้หลายเท่า
 *   และเราต้องการแค่พฤติกรรมเดียวที่ควบคุมเองได้
 */

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  size: number
  color: string
}

/* ★ ใช้สีจากธีมโดยตรง จะได้กลมกลืนทั้งโหมดสว่างและมืด */
const COLORS = ['#ff0033', '#3ea6ff', '#ffd24d', '#4ade80', '#c084fc']

export function Confetti({ pieces = 110, durationMs = 2600 }: { pieces?: number; durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    /* ★ คนที่ขอลดการเคลื่อนไหวไม่ควรเจอเศษกระดาษ 110 ชิ้นพุ่งใส่
       (ช่วงลุ้นยังอยู่ครบใน RandomWheel — ตัดแค่ของประดับ) */
    if (prefersReducedMotion()) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    /* ★ ยิงขึ้นจากกึ่งกลางด้านล่างของกล่อง แล้วปล่อยให้แรงโน้มถ่วงพาลง
       ดูเป็นธรรมชาติกว่าการโปรยลงจากด้านบนซึ่งเหมือนหิมะมากกว่าพลุ */
    const items: Piece[] = Array.from({ length: pieces }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      const speed = 5 + Math.random() * 7
      return {
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: h * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        size: 5 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      }
    })

    let raf = 0
    const start = performance.now()

    function frame(now: number) {
      const elapsed = now - start
      /* ★ จางหายช่วงท้าย ไม่ใช่หายวับ — การหายวับดูเหมือนหน้าเว็บกระตุก */
      const fade = Math.max(0, 1 - Math.max(0, elapsed - durationMs * 0.6) / (durationMs * 0.4))

      ctx!.clearRect(0, 0, w, h)
      ctx!.globalAlpha = fade

      for (const p of items) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.22 // แรงโน้มถ่วง
        p.vx *= 0.99 // แรงต้านอากาศ
        p.rot += p.vrot

        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rot)
        ctx!.fillStyle = p.color
        /* สี่เหลี่ยมผืนผ้าบาง ๆ — หมุนแล้วดูเหมือนเศษกระดาษพลิกไปมา */
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx!.restore()
      }

      if (elapsed < durationMs) {
        raf = requestAnimationFrame(frame)
      } else {
        ctx!.clearRect(0, 0, w, h)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [pieces, durationMs])

  return (
    <canvas
      ref={ref}
      /* ★ pointer-events-none สำคัญมาก — ไม่งั้นมันบังปุ่ม "สุ่มใหม่" ที่อยู่ข้างล่าง */
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden="true"
    />
  )
}
