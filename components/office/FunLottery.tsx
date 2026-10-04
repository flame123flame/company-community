'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { randomIndex } from '@/lib/office/draw'
import { isMuted, playCelebrate, setMuted, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'
import { SlotReels } from './SlotReels'
import { FunGuide } from './FunGuide'

type Pick = { id: string; number: string; drawDate: string | null; createdAt: string }
type BoardRow = { number: string; picks: number }

const DIGIT_OPTIONS = [2, 3, 6] as const

/**
 * สุ่มเลขเด็ด (FR-C10 / FR-C11)
 *
 * ★★ แอนิเมชันเป็นสล็อตแมชชีน ไม่ใช่วงล้อ ตามที่หัวข้อ 4.1 กำหนด
 *    ทุกหลักหมุนพร้อมกัน แล้วหยุดทีละหลักจากซ้ายไปขวา
 *    ★ หลักสุดท้ายหมุนนานที่สุดและมีจังหวะหลอกบ่อยกว่าปกติ
 */
export function FunLottery() {
  const ot = useOt()
  const confirm = useConfirm()
  const [digits, setDigits] = useState<number>(2)
  const [target, setTarget] = useState<string[]>(['0', '0'])
  const [flash, setFlash] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [picks, setPicks] = useState<Pick[]>([])
  const [nextDraw, setNextDraw] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [muted, setMutedState] = useState(false)
  /** FR-C12 — เลขยอดฮิตงวดนี้ */
  const [board, setBoard] = useState<BoardRow[]>([])

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ nextDraw: string | null; items: Pick[] }>(
        '/api/office/fun/lottery',
      )
      setPicks(d.items)
      setNextDraw(d.nextDraw)
      /* ★ โหลดกระดานพร้อมกัน — มันเปลี่ยนทุกครั้งที่มีคนบันทึกเลข */
      const b = await apiFetch<{ items: BoardRow[] }>('/api/office/fun/leaderboard')
      setBoard(b.items)
    } catch {
      /* ของเสริม — โหลดไม่ได้ก็ยังสุ่มเล่นได้ */
    }
  }, [])

  useEffect(() => {
    void load()
    setMutedState(isMuted())
  }, [load])

  useEffect(() => {
    setTarget(Array.from({ length: digits }, () => '0'))
    setResult(null)
    setSaved(false)
  }, [digits])


  function spin() {
    if (spinning) return

    /* ★ สุ่มผลจริงก่อนเริ่มแอนิเมชัน — หลักการเดียวกับวงล้อ (FR-X05)
       ★★ SlotReels คำนวณระยะหมุนย้อนจากผลนี้ ไม่ใช่หมุนไปเรื่อยแล้วดูว่าหยุดตรงไหน */
    setTarget(Array.from({ length: digits }, () => String(randomIndex(10))))
    setResult(null)
    setSaved(false)
    setSpinning(true)
  }

  /*
   * ── ย่อเครื่องให้พอดีจอ ──────────────────────────────────────────
   * ★ ความกว้างจริงของเครื่อง = วงล้อ × จำนวนหลัก + ช่องไฟ + ขอบกระจก
   *   (ค่าเดียวกับคลาสใน SlotReels: ล้อ 72/84px · ช่องไฟ 8/10px · ขอบ 16px×2 + เส้น 2px)
   */
  const fitRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const el = fitRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const wide = window.matchMedia('(min-width: 640px)').matches
      const reel = wide ? 84 : 72
      const gap = wide ? 10 : 8
      const natural = digits * reel + (digits - 1) * gap + 32 + 2
      setZoom(Math.min(1, el.clientWidth / natural))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [digits])

  /** เรียกจาก SlotReels เมื่อวงล้อทุกหลักหยุดหมดแล้ว */
  function finish() {
    setSpinning(false)
    setResult(target.join(''))
    setFlash(true)
    playCelebrate()
    vibrate([30, 40, 60])
    window.setTimeout(() => setFlash(false), 520)
  }

  async function save() {
    if (!result) return
    if (!(await confirm({ kind: 'create', subject: result }))) return
    try {
      await apiFetch('/api/office/fun/lottery', { method: 'POST', body: { number: result } })
      setSaved(true)
      await load()
    } catch {
      /* เงียบ — ปุ่มยังกดใหม่ได้ */
    }
  }

  async function remove(id: string, number: string) {
    if (!(await confirm({ kind: 'delete', subject: number }))) return
    try {
      await apiFetch('/api/office/fun/lottery', { method: 'DELETE', body: { id } })
      await load()
    } catch {
      /* เงียบ */
    }
  }

  const daysLeft = nextDraw
    ? Math.ceil((Date.parse(`${nextDraw}T00:00:00`) - Date.now()) / 86_400_000)
    : null

  return (
    <div className="py-2">
    <FunGuide id="lottery" art="lottery" />
    <div className="mt-6 max-w-2xl">

      {/* ── สล็อตแมชชีน ─────────────────────────────────────────── */}
      {/*
        * ★★ ตัวเครื่องมีสามชั้นที่ทำงานคนละหน้าที่
        *    1. กรอบเรืองแสงตอนหมุน — บอกว่า "กำลังทำงาน"
        *    2. เครื่องสั่นเบา ๆ — ให้รู้สึกว่ามีมอเตอร์อยู่ข้างใน
        *    3. แสงกวาดหน้ากระจก — ทำให้พื้นผิวดูเป็นกระจกจริง ไม่ใช่สี่เหลี่ยมแบน
        */}
      <div
        className={cn(
          'slot-machine relative mt-5 rounded-3xl border p-6 backdrop-blur-md transition-shadow duration-500',
          spinning
            ? 'slot-shake slot-sweep border-accent/55 bg-elevated/70 shadow-[0_0_70px_-16px] shadow-accent/60'
            : 'border-line bg-elevated/60',
        )}
      >
        {/* ★ ไล่สีในกรอบ ทำให้พื้นไม่แบน */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-accent/[0.06] to-transparent"
        />

        {/*
          * ★★★ ป้ายไฟหัวตู้ — ที่อยู่ของ "งวดถัดไป"
          *
          *     ★ เดิมนับถอยหลังเป็นข้อความสีเทาบรรทัดเดียวลอยเหนือตู้
          *       ★★ ซึ่งเป็นข้อมูลที่สำคัญที่สุดในหน้า (จดเลขไปทำไมถ้าไม่รู้ว่าออกวันไหน)
          *          แต่ถูกวางเหมือนคำอธิบายประกอบ
          *     ★ ย้ายมาอยู่บนตู้ในกรอบไฟวิ่ง — ตู้สล็อตจริงทุกตู้มีป้ายตรงนี้
          *       และตาจะไปตกที่มันก่อนเสมอเพราะมันคือจุดสูงสุดของเครื่อง
          */}
        <div className="lotto-marquee relative mx-auto -mt-1 mb-5 w-fit rounded-full px-5 py-1.5">
          <span className="lotto-lights" aria-hidden="true" />
          <span className="relative text-[12px] font-semibold tracking-wide text-ink">
            {daysLeft === null
              ? ot('fun.lottery.noDraw')
              : daysLeft <= 0
                ? ot('fun.lottery.today')
                : ot('fun.lottery.countdown', { days: daysLeft })}
          </span>
        </div>

        {/*
          * ★★ กรอบกระจกครอบวงล้อ พร้อมเส้นจ่ายเงินพาดกลาง
          *    ★ วงล้อที่ลอยอยู่บนพื้นเปล่าอ่านเป็น "ตัวเลขสามกล่อง"
          *      ★★ กรอบกับเส้นกลางคือสิ่งที่ทำให้สมองอ่านว่า "เครื่องสล็อต"
          *         ซึ่งพาความคาดหวังเรื่องการลุ้นมาด้วยทั้งชุดโดยไม่ต้องอธิบาย
          */}
        {/*
          * ★★ ย่อ "ทั้งเครื่อง" ตามสัดส่วนเมื่อจอแคบกว่าเครื่อง — ไม่ใช่บีบแค่ความกว้าง
          *    ★ เคยหดเฉพาะความกว้างวงล้อ: 6 หลักบนมือถือได้ล้อผอมสูง 41×104px ดูอัด
          *      ★★ zoom ย่อกว้าง สูง และตัวเลขเท่ากัน — หน้าตาเดิมแค่เล็กลง
          *         และระยะหมุนใน SlotReels (คิดเป็น px คงที่) ยังถูกต้องทุกอย่าง
          */}
        <div ref={fitRef} className="w-full">
        <div
          className="lotto-glass relative mx-auto w-fit rounded-2xl px-4 py-4"
          style={zoom < 1 ? { zoom } : undefined}
        >
          <span
            aria-hidden="true"
            className={cn('lotto-payline', spinning && 'is-live')}
          />
          <div className="relative">
            <SlotReels target={target} spinning={spinning} onDone={finish} />
          </div>
        </div>
        </div>

        {flash ? <span aria-hidden="true" className="slot-flash rounded-3xl" /> : null}

        {/*
          * ★★ แผงควบคุมเป็นระบบเดียว — ทุกชิ้นสูงเท่ากันในแถวเดียวกัน
          *    ★ เดิม: ชิปเตี้ย 32px · ปุ่มสุ่ม 52px · emoji ลำโพงลอย · ปุ่มบันทึกตกไปอีกแถว
          *      ★★ ตาไม่รู้ว่าจะอ่านอะไรก่อน — ดูเป็นของสี่ชิ้นที่วางมาด้วยกันโดยบังเอิญ
          *    ★ แถวบน = ตั้งค่า (จำนวนหลัก + เสียง) · แถวล่าง = การกระทำ (สุ่ม · บันทึก)
          */}
        <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4">
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label={ot('fun.lottery.title')} className="grid flex-1 grid-cols-3 gap-1 rounded-full bg-surface p-1">
              {DIGIT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={digits === n}
                  disabled={spinning}
                  onClick={() => setDigits(n)}
                  className={cn(
                    'h-10 rounded-full text-sm transition-all disabled:opacity-40',
                    digits === n
                      ? 'bg-page font-semibold text-ink shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--color-ink)_30%,transparent)]'
                      : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {ot('fun.lottery.digitsN', { n })}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !muted
                setMuted(next)
                setMutedState(next)
              }}
              aria-label={muted ? ot('wheel.soundOn') : ot('wheel.soundOff')}
              aria-pressed={!muted}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-ink-soft transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4z" />
                {muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
              </svg>
            </button>
          </div>

          {/*
            * ★★ ปุ่มสุ่มยังเป็นปุ่มนูนของตู้ — การกระทำเดียวที่คนเข้ามาหน้านี้เพื่อทำ
            *    ★ กว้างเต็มแผง และเมื่อมีผลแล้วแบ่งครึ่งกับ "บันทึกเลขนี้" ที่สูงเท่ากัน
            */}
          <div className={cn('grid gap-3', result && !spinning ? 'grid-cols-2' : 'grid-cols-1')}>
            <button
              type="button"
              disabled={spinning}
              onClick={spin}
              className={cn('lotto-button w-full gap-2', spinning && 'is-spinning')}
            >
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
                </svg>
                {ot('fun.lottery.spin')}
              </span>
            </button>

            {result && !spinning ? (
              <button
                type="button"
                disabled={saved}
                onClick={save}
                className={cn(
                  'inline-flex h-[52px] items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors',
                  saved
                    ? 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-accent'
                    : 'border border-line-strong bg-page text-ink hover:bg-surface',
                )}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={saved ? 'm5 12 4 4L19 7' : 'M6 4h12v16l-6-4-6 4z'} />
                </svg>
                {saved ? ot('fun.lottery.saved') : ot('fun.lottery.save')}
              </button>
            ) : null}
          </div>
        </div>

        {result && !spinning ? <Confetti /> : null}
      </div>

      {/* ★★ ข้อความกำกับตามกฎข้อ 2 หัวข้อ 7 — ต้องอยู่บนหน้าจอเสมอ
             ไม่ใช่ซ่อนใน tooltip หรือหน้าเงื่อนไขการใช้งาน */}
      <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-center text-xs text-ink-soft">
        {ot('fun.lottery.disclaimer')}
      </p>

      {/* ── กระดานเลขยอดฮิต (FR-C12) ────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
        <p className="text-sm font-medium text-ink">{ot('fun.lottery.board')}</p>
        {board.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.lottery.boardEmpty')}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1">
            {board.map((b, i) => (
              <li key={b.number} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-xs text-ink-faint">{i + 1}.</span>
                <span className="font-mono text-base tabular-nums text-ink">{b.number}</span>
                {/* ★ แถบยาวตามสัดส่วนของอันดับหนึ่ง — เห็นความต่างได้ทันที
                    โดยไม่ต้องอ่านตัวเลข */}
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(b.picks / (board[0]?.picks || 1)) * 100}%` }}
                  />
                </span>
                <span className="text-xs text-ink-soft">
                  {ot('fun.lottery.picks', { n: b.picks })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── เลขของฉัน ───────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
        <p className="text-sm font-medium text-ink">{ot('fun.lottery.mine')}</p>
        {picks.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.lottery.empty')}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {picks.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void remove(p.id, p.number)}
                  title={ot('fun.lottery.tapDelete')}
                  className="h-10 sm:h-8 rounded-full bg-surface px-3 font-mono text-sm tabular-nums text-ink hover:bg-danger/15 hover:text-danger"
                >
                  {p.number} ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    </div>
  )
}
