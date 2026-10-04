'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { apiFetch } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { TypingRace, TypingBoard, RACE_ROOM_KEY } from './TypingRace'
import { useMounted } from '@/hooks/useMounted'
import {
  TypingCounter,
  compare,
  pickText,
  toChars,
  type TextLang,
  type TextLength,
} from '@/lib/games/typing'
import { FunGuide } from './FunGuide'

const PREF_KEY = 'frameroom:typing-prefs'

type Prefs = { lang: TextLang; length: TextLength }

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return { lang: 'th', length: 'medium' }
  try {
    const raw = window.localStorage.getItem(PREF_KEY)
    if (!raw) return { lang: 'th', length: 'medium' }
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      lang: p.lang === 'en' ? 'en' : 'th',
      length: p.length === 'short' ? 'short' : 'medium',
    }
  } catch {
    return { lang: 'th', length: 'medium' }
  }
}

/**
 * ฝึกพิมพ์คนเดียว — แตะเดียวเริ่มได้ตามข้อกำหนด
 *
 * ★★★ การนับทั้งหมดอยู่ใน lib/games/typing ไม่ใช่ในไฟล์นี้
 *     ★ ไฟล์นี้รับผิดชอบแค่ "รับคีย์และวาดจอ" ★★ ซึ่งแปลว่าสูตร WPM
 *       และกฎการนับตัวอักษรไทย ถูกทดสอบได้โดยไม่ต้องเปิดเบราว์เซอร์
 */
export function TypingPractice() {
  const ot = useOt()
  /*
   * ★ ค่าเริ่มต้นคือ "ฝึกคนเดียว" ไม่ใช่หน้าเลือกโหมด
   *   ★★ ข้อกำหนดบอกว่าฝึกคนเดียวต้อง "แตะเดียวเริ่มได้เลย"
   *      ★ หน้าเลือกโหมดคั่นกลางทำให้กลายเป็นสองแตะทันที
   *        ส่วนการแข่งเป็นของที่ตั้งใจไปทำ จึงยอมให้อยู่หลังหนึ่งแตะได้
   */
  const [raceRoom, setRaceRoom] = useState<string | null>(null)
  /*
   * ★★ ห้องที่แข่งค้างอยู่ (จำไว้ในเครื่อง) — รีโหลด/เน็ตหลุด/ปิดแอปแล้วกลับมาเข้าห้องเดิม
   *    ★ เดิมห้องอยู่ใน state อย่างเดียว รีโหลดแล้วหลุดออกมาหน้าเมนู และเข้าห้องเดิม
   *      ด้วยรหัสก็ไม่ได้เพราะห้องเริ่มแข่งไปแล้ว — แพ้รอบนั้นไปเลย
   *    ★ อ่านหลัง mount เท่านั้น (server ไม่มี storage — hydrate ต้องตรงกัน)
   */
  const mounted = useMounted()
  const [savedDismissed, setSavedDismissed] = useState(false)
  const savedRoom = mounted && !savedDismissed ? readRaceRoom() : null
  const activeRoom = raceRoom ?? savedRoom
  const [joining, setJoining] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  /* ★ error ของการเข้าห้อง — แยกจากสถานะการพิมพ์ ซึ่งไม่มี error ของตัวเอง */
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>({ lang: 'th', length: 'medium' })
  const [text, setText] = useState('')
  const [typed, setTyped] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [best, setBest] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const counterRef = useRef(new TypingCounter())
  const prevLenRef = useRef(0)
  /* ★ ระหว่างประกอบอักษร (IME) ยังไม่นับ — ดูเหตุผลที่ onCompositionEnd */
  const composingRef = useRef(false)

  /* ★ อ่านค่าที่จำไว้หลัง mount — localStorage ไม่มีบน server */
  useEffect(() => {
    const p = loadPrefs()
    setPrefs(p)
    setText(pickText(p.lang, p.length))
    try {
      const b = window.localStorage.getItem(`${PREF_KEY}:best:${p.lang}`)
      setBest(b ? Number(b) : null)
    } catch {
      setBest(null)
    }
  }, [])

  /* นาฬิกาเดินระหว่างพิมพ์ */
  useEffect(() => {
    if (startedAt === null || finishedAt !== null) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [startedAt, finishedAt])

  const progress = useMemo(() => compare(text, typed), [text, typed])
  /* ★ จบแล้วใช้เวลาที่จบ · ยังพิมพ์อยู่ใช้นาฬิกาที่เดิน · เพิ่งเริ่มใช้เวลาตอนนี้ */
  const elapsed = startedAt === null ? 0 : (finishedAt ?? (now || Date.now())) - startedAt
  const stats = counterRef.current.stats(elapsed)

  const restart = useCallback(
    (p: Prefs = prefs) => {
      counterRef.current = new TypingCounter()
      prevLenRef.current = 0
      setTyped('')
      setStartedAt(null)
      setFinishedAt(null)
      setText(pickText(p.lang, p.length))
      window.setTimeout(() => inputRef.current?.focus(), 0)
    },
    [prefs],
  )

  function savePrefs(next: Prefs) {
    setPrefs(next)
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next))
    } catch {
      /* โหมดส่วนตัวเขียนไม่ได้ — ไม่ใช่เรื่องที่ต้องบอกผู้ใช้ */
    }
    restart(next)
  }

  function onChange(value: string) {
    if (finishedAt !== null) return

    /*
     * ★★★ ระหว่าง IME กำลังประกอบอักษร ยังไม่นับการกด
     *
     *     ★ คีย์บอร์ดไทยบนมือถือและ IME ภาษาอื่นส่ง input event ระหว่าง
     *       ประกอบตัวอักษรที่ยังไม่เสร็จ ★★ ถ้านับทุก event ความแม่นยำ
     *       จะต่ำกว่าความจริงมากสำหรับคนที่ใช้ IME ทั้งที่พิมพ์ไม่ผิดเลย
     *     ★ แต่ "ข้อความ" ยังต้องอัปเดตตาม เพื่อให้เห็นสิ่งที่กำลังพิมพ์
     */
    if (startedAt === null && value.length > 0) setStartedAt(Date.now())

    setTyped(value)

    if (composingRef.current) return

    const delta = Math.max(1, toChars(value).length - prevLenRef.current)
    prevLenRef.current = toChars(value).length
    const p = counterRef.current.update(text, value, delta)

    if (p.done) setFinishedAt(Date.now())
  }

  useEffect(() => {
    if (finishedAt === null) return
    const s = counterRef.current.stats(finishedAt - (startedAt ?? finishedAt))
    const w = s.wpm
    /*
     * ★★ ส่งผลขึ้นกระดานอันดับ — server เป็นคนตัดสินว่าน่าเชื่อถือไหม
     *    ★ ไม่ส่งธง "ผ่าน/ไม่ผ่าน" ไปด้วย เพราะนั่นเท่ากับให้คนโกง
     *      ตัดสินว่าตัวเองโกงไหม
     */
    void apiFetch('/api/office/games/typing', {
      method: 'POST',
      body: {
        action: 'solo',
        lang: prefs.lang,
        correctChars: s.correct,
        wpm: s.wpm,
        accuracy: s.accuracy,
        elapsedMs: finishedAt - (startedAt ?? finishedAt),
      },
    }).catch(() => undefined)
    if (best === null || w > best) {
      setBest(w)
      try {
        window.localStorage.setItem(`${PREF_KEY}:best:${prefs.lang}`, String(w))
      } catch {
        /* เขียนไม่ได้ก็ไม่เป็นไร */
      }
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [finishedAt])

  const chars = toChars(text)
  const done = finishedAt !== null
  const isNewBest = done && best !== null && stats.wpm >= best

  if (activeRoom) {
    return (
      <TypingRace
        roomId={activeRoom}
        onExit={() => {
          writeRaceRoom(null)
          setSavedDismissed(true)
          setRaceRoom(null)
        }}
        lang={prefs.lang}
        length={prefs.length}
      />
    )
  }

  async function joinRace(code: string | null) {
    setJoining(true)
    try {
      const res = await apiFetch<{ roomId: string }>('/api/office/games/typing', {
        method: 'POST',
        body: { action: 'join', code, lang: prefs.lang, length: prefs.length },
      })
      writeRaceRoom(res.roomId)
      setSavedDismissed(false)
      setRaceRoom(res.roomId)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setJoining(false)
    }
  }

  const total = chars.length || 1
  const pct = Math.min(100, (progress.correct / total) * 100)

  return (
    <div className="py-2">
    <FunGuide id="typing" art="typing" />
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
      {/* ── ตัวเลือก ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {(['th', 'en'] as TextLang[]).map((l) => (
          <Chip key={l} active={prefs.lang === l} onClick={() => savePrefs({ ...prefs, lang: l })}>
            {ot(l === 'th' ? 'game.typing.thai' : 'game.typing.english')}
          </Chip>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" />
        {(['short', 'medium'] as TextLength[]).map((n) => (
          <Chip key={n} active={prefs.length === n} onClick={() => savePrefs({ ...prefs, length: n })}>
            {ot(n === 'short' ? 'game.typing.short' : 'game.typing.medium')}
          </Chip>
        ))}
      </div>

      {/*
        * ── ตัวเลขสด ─────────────────────────────────────────────
        * ★★★ วงแหวนความคืบหน้าอยู่คู่กับ WPM ไม่ใช่แถบยาวข้างบน
        *     ★ ตอนพิมพ์ ตาจับอยู่ที่ข้อความ — ของที่อยู่ไกลออกไปไม่มีใครเห็น
        *       ★★ วางไว้ติดตัวเลขที่คนชำเลืองดูอยู่แล้ว จึงได้ถูกเห็นจริง
        */}
      <div className="mt-4 flex items-center gap-5 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
        <ProgressRing pct={pct} />
        <div className="flex flex-1 flex-wrap gap-x-7 gap-y-2">
          <Stat label={ot('game.typing.wpm')} value={String(stats.wpm)} big />
          <Stat label={ot('game.typing.accuracy')} value={`${stats.accuracy}%`} />
          <Stat label={ot('game.typing.time')} value={`${(elapsed / 1000).toFixed(1)}s`} />
          {best !== null ? <Stat label={ot('game.typing.best')} value={String(best)} muted /> : null}
        </div>
      </div>

      {/* ── ข้อความที่ต้องพิมพ์ ─────────────────────────────────── */}
      {/*
        * ★★ คลิกที่ข้อความแล้วโฟกัสกลับไปที่ช่องพิมพ์
        *    ★ ช่องพิมพ์ถูกซ่อนไว้ (คนพิมพ์มองที่ข้อความ ไม่ได้มองช่อง)
        *      ★★ ถ้าคลิกแล้วไม่มีอะไรเกิดขึ้น คนจะคิดว่าเกมค้าง
        */}
      <div
        onClick={() => inputRef.current?.focus()}
 className="mt-4 cursor-text rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5 text-[19px] leading-[2] tracking-wide"
      >
        <p dir="auto" className="break-words">
          {chars.map((ch, i) => {
            const state =
              i < progress.correct
                ? 'ok'
                : i === progress.correct && progress.wrong
                  ? 'bad'
                  : i === progress.correct
                    ? 'cursor'
                    : 'rest'
            return (
              <span
                key={i}
                ref={state === 'cursor' || state === 'bad' ? scrollIntoViewRef : undefined}
                className={cn(
                  'inline-block',
                  state === 'ok' && 'type-ok text-ink',
                  /* ★ ตัวที่ผิดไฮไลต์พื้นแดง ไม่ใช่แค่เปลี่ยนสีตัวอักษร
                       ★★ ตัวอักษรไทยบางตัวบางมาก สีอย่างเดียวมองไม่ทัน */
                  state === 'bad' && 'type-bad rounded bg-danger/30 text-danger',
                  /* ★ เคอร์เซอร์เป็นเส้นซ้ายของตัวถัดไป ไม่ใช่กล่องคลุมทั้งตัว
                       ★★ กล่องคลุมทำให้ตัวอักษรอ่านยากตรงจุดที่ต้องอ่านที่สุด */
                  state === 'cursor' && 'type-caret text-ink',
                  state === 'rest' && 'text-ink-faint',
                )}
              >
                {ch === ' ' && state === 'bad' ? '␣' : ch}
              </span>
            )
          })}
          {/* ★ พิมพ์เกินความยาวข้อความ — แสดงส่วนเกินเป็นสีแดงต่อท้าย */}
          {toChars(typed).length > chars.length ? (
            <span className="rounded bg-danger/30 text-danger">
              {toChars(typed).slice(chars.length).join('')}
            </span>
          ) : null}
        </p>
      </div>

      {/*
        * ── ช่องพิมพ์ ───────────────────────────────────────────────
        * ★★★ ปิด autocorrect/autocapitalize/autocomplete/spellcheck และห้าม paste
        *     ★ ทั้งหมดอยู่ในข้อกำหนดข้อ 3.3 ★★ autocorrect บนมือถือจะแก้คำ
        *       ให้เองระหว่างพิมพ์ ซึ่งทำให้ "สิ่งที่พิมพ์" ไม่ใช่สิ่งที่คนกดจริง
        *       แล้วทั้ง WPM และความแม่นยำกลายเป็นตัวเลขของ IME ไม่ใช่ของคน
        */}
      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          /* ★ ประกอบเสร็จแล้วค่อยนับทีเดียว — ค่าใน event คือผลสุดท้ายจริง */
          onChange((e.target as HTMLInputElement).value)
        }}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={done}
        aria-label={ot('game.typing.inputLabel')}
        /*
         * ★★ ช่องจริงอยู่บนจอ (ไม่ซ่อนด้วย display:none) แต่สูงแค่ 1px และโปร่งใส
         *    ★ ซ่อนสนิทแล้วคีย์บอร์ดมือถือจะไม่เด้งขึ้นมา
         *      ★★ และ screen reader จะหาช่องไม่เจอ
         */
        className="h-11 w-full rounded-xl border border-line bg-page px-4 text-base text-ink opacity-0 focus:outline-none"
      />

      {/* ── ปุ่ม ─────────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" className="min-h-11" onClick={() => restart()}>
          <Untranslated>{done ? ot('game.typing.again') : ot('game.typing.newText')}</Untranslated>
        </Button>
        {!startedAt ? (
          <Button variant="ghost" className="min-h-11" onClick={() => inputRef.current?.focus()}>
            <Untranslated>{ot('game.typing.start')}</Untranslated>
          </Button>
        ) : null}
      </div>

      {/* ── แข่งกับเพื่อน ───────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" className="min-h-11" loading={joining} onClick={() => void joinRace(null)}>
          <Untranslated>{ot('game.typing.quickRace')}</Untranslated>
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={() => setShowJoin((v) => !v)}>
          <Untranslated>{ot('game.typing.joinByCode')}</Untranslated>
        </Button>
      </div>

      {showJoin ? (
        <div className="mt-2 flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder={ot('game.typing.roomCode')}
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-page px-4 font-mono text-sm uppercase tracking-widest text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
          />
          <Button
            variant="primary"
            className="min-h-11"
            loading={joining}
            disabled={codeInput.trim().length < 4}
            onClick={() => void joinRace(codeInput.trim())}
          >
            <Untranslated>{ot('game.typing.join')}</Untranslated>
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}


      {done ? (
        <div className="result-pop mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5 text-center">
          {isNewBest ? (
            <p className="text-sm font-medium text-accent">
              <Untranslated>{ot('game.typing.newRecord')}</Untranslated>
            </p>
          ) : null}
          <p className="mt-1 text-2xl font-bold text-ink">{stats.wpm} WPM</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {ot('game.typing.accuracy')} {stats.accuracy}% · {(elapsed / 1000).toFixed(1)}s
          </p>
        </div>
      ) : null}
      </div>

      {/* ══ ขวา · สถิติและอันดับ ══════════════════════════════════ */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <MyTypingStats lang={prefs.lang} refreshKey={finishedAt ?? 0} />
        <TypingBoard lang={prefs.lang} />
        {/*
          * ★★ การ์ดอธิบายวิธีคิดคะแนน — อยู่ท้ายสุดและมีเสมอ
          *    ★ คอลัมน์ขวาว่างเปล่าเมื่อยังไม่มีสถิติและยังไม่มีใครขึ้นกระดาน
          *      ★★ ที่ว่างกว้าง 320px ที่ไม่มีอะไรเลย ทำให้หน้าดูเหมือนโหลดไม่เสร็จ
          *    ★ และมันตอบคำถามที่คนถามจริงตอนเห็นเลขครั้งแรก:
          *      "ความแม่นยำนับยังไง ทำไมลบแล้วไม่กลับเป็น 100"
          */}
        <ScoringNote />
      </aside>
    </div>
    </div>
  )
}

/** วิธีคิดคะแนน — ตอบคำถามที่คนถามจริงตอนเห็นตัวเลขครั้งแรก */
function ScoringNote() {
  const ot = useOt()
  return (
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      <p className="text-sm font-semibold text-ink">
        <Untranslated>{ot('game.typing.howTitle')}</Untranslated>
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-ink-soft">
        <li>
          <Untranslated>{ot('game.typing.howWpm')}</Untranslated>
        </li>
        <li>
          <Untranslated>{ot('game.typing.howAcc')}</Untranslated>
        </li>
        <li>
          <Untranslated>{ot('game.typing.howFix')}</Untranslated>
        </li>
      </ul>
    </div>
  )
}

/**
 * วงแหวนความคืบหน้า
 *
 * ★ วาดด้วย SVG วงเดียว ใช้ stroke-dasharray — ไม่ต้องมี element ต่อเปอร์เซ็นต์
 *   ★★ และเปลี่ยนค่าแล้วมันไหลเองด้วย transition ไม่ต้องคำนวณเฟรม
 */
function ProgressRing({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-surface" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="ring-track text-accent"
      />
    </svg>
  )
}

/**
 * ★★★ เลื่อนให้บรรทัดที่กำลังพิมพ์ไม่ถูกคีย์บอร์ดบัง — ข้อกำหนดข้อ 3.3
 *
 *     ★ ใช้ block:'nearest' ไม่ใช่ 'center' ★★ 'center' จะกระชากหน้าจอ
 *       ทุกตัวอักษรที่พิมพ์ ซึ่งทำให้ตาตามไม่ทันและคลื่นไส้
 */
function scrollIntoViewRef(el: HTMLSpanElement | null) {
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function Stat({
  label,
  value,
  muted,
  big,
}: {
  label: string
  value: string
  muted?: boolean
  big?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">
        <Untranslated>{label}</Untranslated>
      </p>
      {/*
        * ★★★ ตัวเลขสดต้อง "ไม่" มีแอนิเมชันเข้าทุกครั้งที่ค่าเปลี่ยน
        *
        *     ★ รอบแรกผมใส่ key={value} + แอนิเมชันที่เริ่มจาก opacity 0
        *       เพื่อให้มันเด้งทุกครั้งที่เลขขยับ
        *       ★★ แต่ "เวลา" ขยับทุก 200ms ส่วนแอนิเมชันยาว 260ms
        *          → มันถูกรีสตาร์ตก่อนจะจบทุกครั้ง แล้วตัวเลขค้างอยู่ที่
        *          opacity ต่ำตลอดกาล ★★★ บนจอจริงคือ "เลขหายไปเฉย ๆ"
        *     ★ tabular-nums พอแล้วสำหรับเลขที่ขยับถี่ — มันกันไม่ให้
        *       ความกว้างกระตุกเวลาเลขเปลี่ยนหลัก ซึ่งเป็นสิ่งเดียวที่รบกวนจริง
        */}
      <p
        className={cn(
          'font-bold tabular-nums transition-colors',
          big ? 'text-3xl' : 'text-xl',
          muted ? 'text-ink-soft' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-11 shrink-0 rounded-full px-4 text-sm transition-colors',
        active ? 'bg-ink font-medium text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}


/* ═══════════════════════════════════════════════════════════════════
 * สถิติของฉัน (ข้อกำหนด 3.5)
 * ═══════════════════════════════════════════════════════════════════ */

function MyTypingStats({ lang, refreshKey }: { lang: TextLang; refreshKey: number }) {
  const ot = useOt()
  const [stats, setStats] = useState<Record<string, { best: number; avg10: number; count: number }> | null>(null)

  useEffect(() => {
    void apiFetch<{ stats: Record<string, { best: number; avg10: number; count: number }> }>(
      '/api/office/games/typing?stats=1',
    )
      .then((r) => setStats(r.stats ?? null))
      .catch(() => setStats(null))
    /* ★ โหลดใหม่ทุกครั้งที่พิมพ์จบ — ไม่งั้นตัวเลขค้างจนกว่าจะรีโหลดหน้า */
  }, [refreshKey])

  const mine = stats?.[lang]
  if (!mine || mine.count === 0) return null

  return (
    <div className="mt-5 flex gap-6 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">
          <Untranslated>{ot('game.typing.myBest')}</Untranslated>
        </p>
        <p className="text-xl font-bold tabular-nums text-ink">{mine.best}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">
          <Untranslated>{ot('game.typing.avg10', { n: mine.count })}</Untranslated>
        </p>
        <p className="text-xl font-bold tabular-nums text-ink-soft">{mine.avg10}</p>
      </div>
    </div>
  )
}

function readRaceRoom(): string | null {
  try {
    return window.localStorage.getItem(RACE_ROOM_KEY)
  } catch {
    return null
  }
}

function writeRaceRoom(id: string | null) {
  try {
    if (id) window.localStorage.setItem(RACE_ROOM_KEY, id)
    else window.localStorage.removeItem(RACE_ROOM_KEY)
  } catch {
    /* storage ปิด — แข่งได้ แค่รีโหลดแล้วไม่ได้กลับเข้าห้องเดิม */
  }
}
