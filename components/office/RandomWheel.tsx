'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import {
  effectiveDuration,
  planDraw,
  positionAt,
  prefersReducedMotion,
  SKIP_AFTER_MS,
  type DrawPlan,
} from '@/lib/office/draw'
import { isMuted, playCelebrate, playDrumroll, playTick, setMuted, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'

/**
 * วงล้อสุ่มกลาง (FR-X05) — ใช้ร่วมกันใน FR-A07, FR-C01, FR-C03, FR-C10
 *
 * ★★★ คอมโพเนนต์เดียวสำหรับทุกการสุ่มในระบบ
 *
 *     เอกสารระบุชัดว่าห้ามพัฒนาแยกในแต่ละโมดูล เหตุผลที่สำคัญกว่า
 *     "ลดเวลาพัฒนา" คือ ★ จังหวะลุ้นต้องเหมือนกันทุกที่ —
 *     ถ้าวงล้ออาหารหมุน 5 วินาทีแต่วงล้อชื่อหมุน 2 วินาที คนจะรู้สึกว่า
 *     อันหลังเป็นของเล่นที่ทำไม่เสร็จ ทั้งที่มันแค่ตั้งค่าคนละแบบ
 *
 * ★★ ผลลัพธ์ถูกสุ่มก่อนเริ่มหมุนเสมอ (planDraw) แอนิเมชันแค่พาไปถึงที่นั่น
 *    ผู้เรียกส่ง onResult มารับผลได้ — และจะได้ผลเดียวกับที่ตาเห็นเสมอ
 */

export type WheelItem = {
  id: string
  label: string
  /** รูปประกอบ (ร้านอาหาร / รูปโปรไฟล์) — ไม่มีก็ได้ */
  imageUrl?: string | null
}

type Props = {
  items: WheelItem[]
  onResult?: (item: WheelItem) => void
  /** ข้อความบนปุ่มหมุน */
  spinLabel?: string
  /**
   * ★ บังคับผลลัพธ์จากภายนอก — ใช้ในห้องสุ่มกลุ่ม (FR-A09)
   *   เจ้าของห้องสุ่มผลแล้วส่งผ่าน Realtime ให้ทุกเครื่องหมุนไปหยุดที่เดียวกัน
   */
  forcedWinnerId?: string | null
  /**
   * ★ สั่งหมุนจากภายนอก — ใช้ในห้องสุ่มกลุ่ม (FR-A09)
   *   ค่าเปลี่ยนเป็นค่าใหม่ที่ไม่ใช่ null = เริ่มหมุน (ใช้ id ของรอบสุ่ม)
   *   ★ เป็น token ไม่ใช่ boolean เพราะ boolean ที่กลับมา true อีกครั้ง
   *     แยกไม่ออกว่าเป็นรอบใหม่หรือ re-render เดิม
   */
  autoSpinToken?: string | null
  /** ซ่อนปุ่มหมุน — ในห้องกลุ่มมีแค่เจ้าของห้องที่กดได้ */
  hideSpinButton?: boolean
}

type Phase = 'idle' | 'spinning' | 'done'

export function RandomWheel({
  items,
  onResult,
  spinLabel,
  forcedWinnerId,
  autoSpinToken,
  hideSpinButton = false,
}: Props) {
  const ot = useOt()
  const [phase, setPhase] = useState<Phase>('idle')
  const [offset, setOffset] = useState(0)
  const [winner, setWinner] = useState<WheelItem | null>(null)
  const [canSkip, setCanSkip] = useState(false)
  const [muted, setMutedState] = useState(false)
  /* ★ ผลโผล่ช้ากว่าการหยุด — "และคนนั้นก็คือ…" ค้างไว้ก่อน (หัวข้อ 4.1) */
  const [winnerVisible, setWinnerVisible] = useState(false)

  const frameRef = useRef<number | null>(null)
  const planRef = useRef<DrawPlan | null>(null)
  const startRef = useRef(0)
  const lastSlotRef = useRef(-1)
  const drumRef = useRef(false)

  useEffect(() => setMutedState(isMuted()), [])

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  /** จบการหมุน — รวมไว้ที่เดียวเพราะทั้งการหมุนจบเองและการกดข้ามมาลงที่นี่ */
  const finish = useCallback(
    (plan: DrawPlan) => {
      stop()
      setOffset(plan.winner)
      const won = items[plan.winner]!
      setWinner(won)
      setPhase('done')
      playCelebrate()
      vibrate([30, 40, 60])
      onResult?.(won)
    },
    [items, onResult, stop],
  )

  const spin = useCallback(() => {
    if (phase === 'spinning' || items.length === 0) return

    const plan = planDraw(items.length)

    /*
     * ★ ถ้ามีผลบังคับมาจากภายนอก ให้เขียนทับ winner แต่คงจังหวะอื่นไว้
     *   ระยะเวลาและจังหวะหลอกยังสุ่มของใครของมันได้ เพราะห้องสุ่มกลุ่ม
     *   ส่ง "เวลาเริ่ม + ผล" มา ไม่ได้ส่งทุกเฟรมมาให้
     */
    if (forcedWinnerId) {
      const idx = items.findIndex((i) => i.id === forcedWinnerId)
      if (idx >= 0) plan.winner = idx
    }

    planRef.current = plan
    startRef.current = performance.now()
    lastSlotRef.current = -1
    drumRef.current = false

    setWinner(null)
    setWinnerVisible(false)
    setPhase('spinning')
    setCanSkip(false)

    const duration = effectiveDuration(plan)
    const reduced = prefersReducedMotion()

    window.setTimeout(() => setCanSkip(true), SKIP_AFTER_MS)

    function frame(now: number) {
      const elapsed = now - startRef.current
      const p = { ...plan, duration }
      const pos = positionAt(p, items.length, elapsed, reduced ? 1 : 4)
      const slot = Math.floor(pos) % items.length

      setOffset(pos % items.length)

      /* ★ ติ๊กเมื่อ "ข้ามช่อง" ไม่ใช่ทุกเฟรม — ยิ่งช้ายิ่งห่างเองโดยอัตโนมัติ
         ซึ่งคือพฤติกรรมที่เอกสารระบุพอดี โดยไม่ต้องคำนวณจังหวะเพิ่ม */
      if (slot !== lastSlotRef.current) {
        lastSlotRef.current = slot
        playTick()
      }

      /* กลองรัวช่วงท้าย — เล่นครั้งเดียว */
      if (!drumRef.current && elapsed > duration - 800) {
        drumRef.current = true
        playDrumroll(700)
      }

      if (elapsed >= duration) {
        finish(plan)
        return
      }
      frameRef.current = requestAnimationFrame(frame)
    }

    frameRef.current = requestAnimationFrame(frame)
  }, [items, phase, forcedWinnerId, finish])

  /* ★ หมุนตามคำสั่งจากภายนอก — หมุน token เดิมซ้ำไม่ได้ */
  const spunTokenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoSpinToken || spunTokenRef.current === autoSpinToken) return
    spunTokenRef.current = autoSpinToken
    spin()
  }, [autoSpinToken, spin])

  useEffect(() => {
    if (phase !== 'done') return
    const id = window.setTimeout(() => setWinnerVisible(true), prefersReducedMotion() ? 200 : 900)
    return () => window.clearTimeout(id)
  }, [phase])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-faint">{ot('common.empty')}</p>
  }

  const current = items[Math.floor(offset) % items.length]!

  return (
    <div className="relative flex flex-col items-center gap-5">
      {/* ── หน้าต่างวงล้อ ─────────────────────────────────────────── */}
      {/*
        * ★★ ใหญ่ · เป็นกระจก · มีแสงเรืองตอนหมุน
        *
        *    นี่คือสิ่งเดียวที่คนมองตอนใช้ฟีเจอร์นี้ ★ กล่องเล็กสูง 112px
        *    ที่มีตัวหนังสือขนาดปกติทำให้ "จังหวะลุ้น" ที่ออกแบบไว้ทั้งหมด
        *    (หลอก · หน่วง · เฉลยช้า) เสียของ เพราะตาไม่ได้จดจ่อกับมัน
        *
        *    ★ ขอบเรืองแสงเฉพาะตอนหมุน ไม่ใช่ตลอดเวลา — แสงที่ติดค้าง
        *      กลายเป็นของประดับ ส่วนแสงที่มาตอนหมุนคือสัญญาณว่า "เริ่มแล้ว"
        */}
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden transition-shadow duration-500',
          'rounded-3xl border bg-elevated/60 backdrop-blur-md',
          phase === 'spinning'
            ? 'border-accent/60 shadow-[0_0_60px_-12px] shadow-accent/50'
            : 'border-line',
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {/* ★ ไล่สีจาง ๆ ในกล่อง ให้พื้นไม่แบน */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent"
        />

        {/* เข็มชี้ */}
        <div
          className="absolute inset-x-0 top-0 z-10 mx-auto h-0 w-0 border-x-8 border-t-12 border-x-transparent border-t-accent"
          aria-hidden="true"
        />

        <div className="relative grid h-36 place-items-center px-6 sm:h-44">
          <span
            className={cn(
              'w-full truncate text-center font-bold tracking-tight transition-all duration-300',
              phase === 'done' && winnerVisible
                ? 'text-[28px] text-ink sm:text-[34px]'
                : 'text-xl text-ink sm:text-2xl',
              phase === 'spinning' && 'blur-[0.4px]',
            )}
          >
            {phase === 'done' && winnerVisible ? winner?.label : current.label}
          </span>
        </div>

        {phase === 'done' && !winnerVisible ? (
          <p className="absolute inset-x-0 bottom-3 text-center text-xs text-ink-faint">
            {ot('wheel.winnerIs')}
          </p>
        ) : null}
      </div>

      {/* ── ปุ่ม ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {hideSpinButton ? null : (
          <button
            type="button"
            onClick={spin}
            disabled={phase === 'spinning'}
            className={cn(
              'h-12 rounded-full px-8 font-medium',
              'bg-accent text-accent-ink transition-all',
              'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
              'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            {phase === 'done' ? ot('wheel.again') : (spinLabel ?? ot('wheel.spin'))}
          </button>
        )}

        {/* ★ ปุ่มข้ามโผล่หลังเริ่ม 1 วินาที — สำหรับคนที่รีบ (หัวข้อ 4.1) */}
        {phase === 'spinning' && canSkip ? (
          <button
            type="button"
            onClick={() => planRef.current && finish(planRef.current)}
            className="h-10 rounded-full bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-hover"
          >
            {ot('wheel.skip')}
          </button>
        ) : null}

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? ot('wheel.soundOn') : ot('wheel.soundOff')}
          title={muted ? ot('wheel.soundOn') : ot('wheel.soundOff')}
          className="grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
          </svg>
        </button>
      </div>

      {phase === 'done' && winnerVisible ? <Confetti /> : null}
    </div>
  )
}
