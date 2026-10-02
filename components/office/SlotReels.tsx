'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { easeOut, prefersReducedMotion } from '@/lib/office/draw'
import { playTick } from '@/lib/office/sound'

/**
 * วงล้อตัวเลขแบบสล็อตแมชชีน (FR-C10)
 *
 * ★★★ วงล้อหมุนจริง ไม่ใช่ตัวเลขที่เปลี่ยนค่าไปมา
 *
 *     เดิมเขียนเป็น setState สุ่มเลขใหม่ทุกเฟรม ★ ผลคือตัวเลข "กระพริบ"
 *     ซึ่งตาอ่านเป็นของเสีย ไม่ใช่ของที่กำลังหมุน
 *     ★★ ของจริงคือแถบเลขยาวที่เลื่อนขึ้นด้วย transform เดียว —
 *        เบราว์เซอร์ยกไปให้ compositor ทำ ลื่นทุกเฟรมแม้มี 6 วงล้อพร้อมกัน
 *        ★ และได้ "ความเบลอตามความเร็ว" ฟรี ซึ่งเป็นสัญญาณความเร็วที่ตาเชื่อ
 *
 * ★★ ผลถูกตัดสินก่อนเริ่มหมุนเสมอ (FR-X05) — ที่นี่รับ target มาแล้ว
 *    ระยะทางที่ต้องหมุนคำนวณย้อนจาก target ไม่ใช่หมุนไปเรื่อยแล้วดูว่าหยุดตรงไหน
 */

/**
 * ความสูงของช่องหนึ่งหลัก (px)
 *
 * ★★★ ค่านี้ต้องตรงกับ h-[...] ของวงล้อด้านล่างเป๊ะ ๆ
 *     ★ ระยะเลื่อนทั้งหมดคำนวณจากมัน — ถ้าเปลี่ยนความสูงใน class
 *       แล้วลืมแก้ตรงนี้ วงล้อจะหยุดคร่อมระหว่างสองเลข
 *       ★★ และจะไม่มี error อะไรเตือนเลย เห็นได้จากตาอย่างเดียว
 */
const H = 104

/** ★ แถบมีเลข 0-9 สองรอบ เพื่อให้เลื่อนวนได้โดยไม่เห็นรอยต่อ */
const STRIP = [...Array(20).keys()].map((n) => n % 10)

export function SlotReels({
  target,
  spinning,
  onDone,
}: {
  /** เลขที่ตัดสินไว้แล้ว — ว่างคือยังไม่เคยหมุน */
  target: string[]
  spinning: boolean
  onDone: () => void
}) {
  const count = target.length

  /** ระยะเลื่อนของแต่ละวงล้อ (px) */
  const [offsets, setOffsets] = useState<number[]>(() => target.map((d) => Number(d) * H))
  /** ความเบลอตามความเร็วของแต่ละวงล้อ */
  const [blurs, setBlurs] = useState<number[]>(() => target.map(() => 0))
  /** วงล้อที่เพิ่งล็อกเข้าที่ — ใช้เล่นอนิเมชันกระตุกครั้งเดียว */
  const [locked, setLocked] = useState<number[]>([])

  const rafRef = useRef<number | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  /* ── เริ่มหมุนเมื่อ spinning เปลี่ยนเป็น true ─────────────────── */
  useEffect(() => {
    if (!spinning) return

    const reduced = prefersReducedMotion()
    const from = offsets.slice()

    /*
     * ★ วงล้อซ้ายสุดหยุดก่อน แล้วไล่ไปขวา — ลำดับเดียวกับสล็อตจริง
     *   ★★ ถ้าหยุดพร้อมกันหมด ความลุ้นจะจบในเสี้ยววินาทีเดียว
     *      ส่วนการไล่หยุดทำให้ "หลักสุดท้าย" กลายเป็นจุดที่ทุกคนจ้อง
     */
    const spinsFor = (i: number) => (reduced ? 2 : 6 + i * 2)
    const durFor = (i: number) => (reduced ? 320 + i * 60 : 2000 + i * 520)

    const plan = target.map((d, i) => {
      const land = Number(d) * H
      const cycle = 10 * H
      /* ระยะที่ต้องเลื่อนเพื่อไปจบที่ land พอดี หลังหมุนครบ spins รอบ */
      const delta = spinsFor(i) * cycle + ((land - (from[i]! % cycle)) + cycle) % cycle
      return { from: from[i]!, to: from[i]! + delta, dur: durFor(i) }
    })

    const total = Math.max(...plan.map((p) => p.dur))
    const start = performance.now()
    const stopped = new Set<number>()
    let lastTick = 0

    const frame = (now: number) => {
      const elapsed = now - start
      const nextOffsets: number[] = []
      const nextBlurs: number[] = []

      plan.forEach((p, i) => {
        const t = Math.min(1, elapsed / p.dur)
        const eased = easeOut(t)
        nextOffsets.push(p.from + (p.to - p.from) * eased)

        /*
         * ★ ความเบลอคำนวณจากความเร็ว ณ เฟรมนั้น (อนุพันธ์ของ ease)
         *   ★★ ไม่ใช่ค่าคงที่ตอนหมุน — ของที่เบลอเท่ากันตลอดอ่านเป็นภาพเบลอ
         *      ส่วนของที่เบลอแล้วค่อย ๆ คมขึ้นอ่านเป็น "กำลังชะลอ"
         */
        const speed = 1 - eased
        nextBlurs.push(reduced ? 0 : Math.min(9, speed * speed * 22))

        if (t >= 1 && !stopped.has(i)) {
          stopped.add(i)
          playTick()
          setLocked((l) => (l.includes(i) ? l : [...l, i]))
        }
      })

      setOffsets(nextOffsets)
      setBlurs(nextBlurs)

      /* ★ เสียงติ๊กระหว่างหมุน ถี่ขึ้นตอนต้นและห่างออกตอนท้าย */
      if (now - lastTick > 60 + (elapsed / total) * 120) {
        lastTick = now
        playTick()
      }

      if (elapsed >= total) {
        setOffsets(plan.map((p) => p.to))
        setBlurs(plan.map(() => 0))
        doneRef.current()
        return
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    setLocked([])
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    /* ★ ตั้งใจฟังเฉพาะ spinning — ถ้าใส่ offsets ลงไปด้วย มันจะรีสตาร์ททุกเฟรม */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning])

  /* จำนวนหลักเปลี่ยน → รีเซ็ตให้ตรงกัน */
  useEffect(() => {
    setOffsets(target.map((d) => Number(d) * H))
    setBlurs(target.map(() => 0))
    setLocked([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5">
      {Array.from({ length: count }, (_, i) => {
        const cycle = 10 * H
        const shift = ((offsets[i] ?? 0) % cycle + cycle) % cycle

        return (
          <div
            key={i}
            className={cn(
              /* ★ ใหญ่ขึ้นจาก 72px เป็น 104px — เดิมเล็กจนต้องเอาตัวเลขไปโชว์ซ้ำ
                 ใต้เครื่องอีกชุด ★★ ซึ่งทำให้คนเห็นเลขเดียวกันสองที่พร้อมกัน
                 แล้วไม่รู้ว่าอันไหนคือผลจริง */
              'slot-reel h-[104px] w-[72px] sm:w-[84px]',
              locked.includes(i) && !spinning && 'slot-locked',
            )}
          >
            <div
              className="will-change-transform"
              style={{
                transform: `translate3d(0, ${-shift}px, 0)`,
                filter: blurs[i] ? `blur(${blurs[i]!.toFixed(2)}px)` : undefined,
              }}
            >
              {STRIP.map((n, k) => (
                <span
                  key={k}
                  className="grid h-[104px] place-items-center font-mono text-[52px] font-bold tabular-nums text-ink"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
