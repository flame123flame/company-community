'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { TypingCounter, compare, toChars, type TextLang } from '@/lib/games/typing'

type Player = {
  id: string
  name: string
  progress: number
  wpm: number
  accuracy: number
  finished: boolean
  me: boolean
}

type Room = {
  id: string
  code: string
  lang: TextLang
  text: string
  status: 'WAITING' | 'COUNTDOWN' | 'RACING' | 'FINISHED'
  startedAt: string | null
  /** ★ ใช้นับว่ารอมากี่วินาทีแล้ว สำหรับการเริ่มอัตโนมัติ */
  createdAt?: string
  isOwner: boolean
}

/** ส่งความคืบหน้าทุกกี่มิลลิวินาที */
const PUSH_MS = 700

/** เวลาแข่งสูงสุด — ไม่ต่ำกว่า 90 วิ · ข้อความยาวได้เวลามากขึ้น
 *  ★ คนที่หลุดไปแล้วไม่กลับมาต้องไม่ทำให้ห้องค้างตลอดกาล */
const raceLimitMs = (chars: number) => Math.max(90_000, chars * 1200)

type Final = { elapsed: number; wpm: number; accuracy: number }
type Saved = {
  typed: string
  counter: ReturnType<TypingCounter['snapshot']>
  final: Final | null
}

/** ★ ห้องที่กำลังแข่ง — หน้าเมนูใช้พากลับเข้าห้องหลังรีโหลด/เน็ตหลุด */
export const RACE_ROOM_KEY = 'typing:raceRoom'

const roundStoreKey = (roomId: string, round: string) => `typing-race:${roomId}:${round}`

function readRound(roomId: string, round: string): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(roundStoreKey(roomId, round))
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

function writeRound(roomId: string, round: string, saved: Saved) {
  try {
    window.sessionStorage.setItem(roundStoreKey(roomId, round), JSON.stringify(saved))
  } catch {
    /* storage ปิด — เล่นได้ แค่รีโหลดแล้วต้องพิมพ์ใหม่ */
  }
}

/**
 * ห้องแข่งพิมพ์ดีด
 *
 * ★★★ นาฬิกาเดียวกันทั้งห้อง: ทุกเครื่องคิดจาก room.startedAt
 *     ★ ไม่ใช่ "เวลาที่เครื่องฉันเห็นคำว่าเริ่ม" ★★ ซึ่งต่างกันตามความเร็วเน็ต
 *       แล้วคนเน็ตช้าจะได้ WPM ต่ำกว่าความจริงโดยไม่ใช่ความผิดของเขา
 */
export function TypingRace({
  roomId,
  onExit,
  lang = 'th',
  length = 'medium',
}: {
  roomId: string
  onExit: () => void
  /** ★ ใช้ตอนขอข้อความใหม่สำหรับรอบถัดไป */
  lang?: TextLang
  length?: 'short' | 'medium'
}) {
  const ot = useOt()
  const confirm = useConfirm()
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const counterRef = useRef(new TypingCounter())
  const prevLenRef = useRef(0)
  const composingRef = useRef(false)
  const pushedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const autoFiredRef = useRef(false)
  /* ★ ผลตอนพิมพ์จบ — ตรึงไว้ ไม่คำนวณใหม่จากนาฬิกาที่ยังเดินอยู่
       ★★ เดิมหน้าผลคิด WPM จากเวลาที่เดินต่อหลังจบ — วัดได้ 175 → 133 ภายใน 4 วิ */
  const [final, setFinal] = useState<Final | null>(null)
  /* ★ ต่างของนาฬิกาเครื่องกับ server — นาฬิกามือถือเพี้ยนได้เป็นวินาที */
  const [skew, setSkew] = useState(0)
  /* ★ รอบที่หน้าจอนี้กำลังแสดง (createdAt + ข้อความ) — เปลี่ยน = เริ่มรอบใหม่ */
  const roundRef = useRef<string | null>(null)
  /* ★ onExit มาจากหน้าแม่เป็นฟังก์ชันใหม่ทุก render — เก็บใน ref ไม่ให้ load ถูกสร้างใหม่วนไป */
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

  /** ล้าง (หรือกู้คืน) สถานะในเครื่องเมื่อเจอรอบใหม่ */
  const enterRound = useCallback(
    (round: string) => {
      roundRef.current = round
      const saved = readRound(roomId, round)
      counterRef.current = saved ? TypingCounter.restore(saved.counter) : new TypingCounter()
      prevLenRef.current = saved ? toChars(saved.typed).length : 0
      finishedRef.current = !!saved?.final
      autoFiredRef.current = false
      setTyped(saved?.typed ?? '')
      setFinal(saved?.final ?? null)
    },
    [roomId],
  )

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ room: Room; players: Player[]; serverNow?: string }>(
        `/api/office/games/typing?room=${encodeURIComponent(roomId)}`,
      )
      if (res.serverNow) setSkew(Date.parse(res.serverNow) - Date.now())
      /*
       * ★★★ รอบใหม่ (มีคนกด "แข่งอีกรอบ") → ทุกเครื่องล้างสถานะเอง
       *     ★ เดิมล้างเฉพาะเครื่องคนที่กด — อีกคนยังค้างหน้าผลรอบก่อน
       *       ช่องพิมพ์ถูกปิด แล้วเล่นรอบสองไม่ได้เลย (เจอตอนทดสอบสองเครื่อง)
       */
      const round = `${res.room.createdAt ?? ''}|${res.room.text.length}|${res.room.text.slice(0, 24)}`
      if (round !== roundRef.current) enterRound(round)
      setRoom(res.room)
      setPlayers(res.players)
      setError(null)
    } catch (e) {
      /* ★ ห้องหายไปแล้ว / ไม่ได้อยู่ในห้องนี้ → กลับเมนู ไม่ค้างหน้าโหลด */
      if (e instanceof ApiClientError && (e.status === 404 || e.status === 403)) {
        onExitRef.current()
        return
      }
      setError(officeErrorText(e, ot))
    }
  }, [roomId, enterRound])

  useEffect(() => {
    void load()
  }, [load])

  /* ★ ฟังทั้งห้องและผู้เล่น — แถบความคืบหน้าของคนอื่นมาจากตารางผู้เล่น */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`typing:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_players', filter: `room_id=eq.${roomId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'typing_rooms', filter: `id=eq.${roomId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, load])

  /*
   * ★★★ ถามซ้ำเป็นจังหวะ — Realtime เป็นทางเร็ว ไม่ใช่ทางเดียว
   *     ★ ทดสอบสองเครื่อง: อีกคนกด "แข่งอีกรอบ" แล้วหน้าจอเราไม่รู้ตัวเลย
   *       (ค้างหน้าผลรอบก่อน) เพราะไม่มี event มาถึง ★★ แบบเดียวกับห้องสุ่มกลุ่ม
   *     ★ หยุดถามเมื่อแท็บถูกซ่อน — ไม่ยิงทิ้งไว้ข้ามคืน
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const id = window.setInterval(tick, 2500)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  /* นาฬิกาเดิน */
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 120)
    return () => window.clearInterval(id)
  }, [])

  /*
   * ★★★ เริ่มอัตโนมัติเมื่อรอครบ 30 วินาที (ข้อกำหนด 3.1)
   *
   *     ★ ของเดิมให้เฉพาะเจ้าของห้องกดได้ ★★ ถ้าเจ้าของห้องปิดแอปไป
   *       ห้องค้างตลอดไปและทุกคนในนั้นติดอยู่โดยไม่มีทางออกนอกจากออกจากห้อง
   *     ★★ ทุกเครื่องในห้องยิงคำสั่งนี้ ไม่ใช่เฉพาะเครื่องเดียว
   *        ★ เพราะ "เครื่องที่ควรยิง" อาจเป็นเครื่องที่หายไปแล้วพอดี
   *          ★★ server ตรวจเวลาเองและปฏิเสธคำสั่งที่มาเร็วเกิน
   *             การยิงซ้ำจึงไม่ทำให้อะไรพัง
   */
  useEffect(() => {
    if (!room || room.status !== 'WAITING' || players.length < 2) return
    if (autoFiredRef.current) return
    const waited = Date.now() - Date.parse(room.createdAt ?? new Date().toISOString())
    if (waited < 30_000) return
    autoFiredRef.current = true
    void apiFetch('/api/office/games/typing', {
      method: 'POST',
      body: { action: 'start', roomId, force: true },
    })
      .then(load)
      .catch(() => {
        /* ★ ล้มแล้วปล่อยให้ลองใหม่รอบหน้า — server อาจเพิ่งถูกคนอื่นสั่งไปแล้ว */
        autoFiredRef.current = false
      })
  }, [room, players.length, roomId, load, now])

  /* ★ ทุกการเทียบเวลาใช้ "เวลาของ server" — ทุกเครื่องเริ่ม/หมดเวลาพร้อมกัน */
  const serverNow = now + skew
  const startAt = room?.startedAt ? Date.parse(room.startedAt) : null
  const limitMs = raceLimitMs(toChars(room?.text ?? '').length)
  const timeUp = startAt !== null && serverNow >= startAt + limitMs
  /** ยังนับถอยหลังอยู่ไหม — บวก 1 เพราะ 0.4 วินาทีที่เหลือก็ยังไม่ถึงเวลา */
  const countdown = startAt !== null && serverNow < startAt ? Math.ceil((startAt - serverNow) / 1000) : 0
  const racing = startAt !== null && serverNow >= startAt && room?.status !== 'FINISHED' && !timeUp
  const elapsed = startAt !== null && serverNow >= startAt ? Math.min(serverNow - startAt, limitMs) : 0

  /* ★ ถึงเวลาแล้วโฟกัสช่องพิมพ์ให้เลย — ไม่ต้องให้กดอีกทีเพื่อเรียกคีย์บอร์ด */
  useEffect(() => {
    if (racing) inputRef.current?.focus()
  }, [racing])

  const progress = useMemo(() => compare(room?.text ?? '', typed), [room?.text, typed])

  const typedChars = useMemo(() => toChars(typed), [typed])
  const stats = counterRef.current.stats(elapsed)

  async function push(final: boolean) {
    if (!room) return
    const s = counterRef.current.stats(elapsed)
    try {
      if (final) {
        finishedRef.current = true
        const frozen: Final = { elapsed, wpm: s.wpm, accuracy: s.accuracy }
        setFinal(frozen)
        if (roundRef.current) writeRound(roomId, roundRef.current, { typed, counter: counterRef.current.snapshot(), final: frozen })
        await apiFetch('/api/office/games/typing', {
          method: 'POST',
          body: {
            action: 'finish',
            roomId,
            correctChars: s.correct,
            wpm: s.wpm,
            accuracy: s.accuracy,
            elapsedMs: elapsed,
          },
        })
      } else {
        await apiFetch('/api/office/games/typing', {
          method: 'POST',
          /* ★ ความคืบหน้า = ตำแหน่งที่พิมพ์ถึง (ผิดก็เดิน) — WPM สุทธิยังนับเฉพาะตัวที่ถูก */
          body: { action: 'progress', roomId, chars: compare(room.text, typed).cursor, wpm: s.wpm, accuracy: s.accuracy },
        })
      }
    } catch {
      /* ★ ส่งความคืบหน้าไม่สำเร็จไม่ควรหยุดการพิมพ์ — รอบถัดไปส่งใหม่เอง */
    }
  }

  function onChange(raw: string) {
    if (!racing || finishedRef.current) return
    /* ★ พิมพ์เกินความยาวข้อความไม่ได้ — ครบแล้วจบทันที */
    const value = toChars(raw).slice(0, toChars(room?.text ?? '').length).join('')
    setTyped(value)
    if (composingRef.current) return

    const delta = Math.max(1, toChars(value).length - prevLenRef.current)
    prevLenRef.current = toChars(value).length
    const p = counterRef.current.update(room?.text ?? '', value, delta)
    /* ★ เก็บทุกตัว — รีโหลดกลางแข่งแล้วพิมพ์ต่อจากเดิมได้ */
    if (roundRef.current) writeRound(roomId, roundRef.current, { typed: value, counter: counterRef.current.snapshot(), final: null })

    if (p.done) {
      void push(true)
      return
    }
    /*
     * ★★ ส่งความคืบหน้าเป็นช่วง ไม่ใช่ทุกตัวอักษร
     *    ★ คนพิมพ์เร็ว 100 WPM กดราว 8 ครั้งต่อวินาที — ส่งทุกครั้ง
     *      คือ 8 คำขอต่อวินาทีต่อคน คูณ 6 คนในห้อง
     *      ★★ แถบความคืบหน้าที่อัปเดตทุก 0.7 วินาทีดูลื่นพอ ๆ กัน
     */
    if (Date.now() - pushedAtRef.current > PUSH_MS) {
      pushedAtRef.current = Date.now()
      void push(false)
    }
  }

  if (!room) {
    return <p className="py-16 text-center text-sm text-ink-faint">{error ?? ot('common.loading')}</p>
  }

  const chars = toChars(room.text)
  const total = chars.length || 1
  const done = final !== null || room.status === 'FINISHED' || timeUp
  /* ★ ผลที่โชว์บนหน้าจบ: ตรึงตอนพิมพ์จบ · หมดเวลาก่อนจบ = ค่า ณ เส้นตาย */
  const shown = final ?? { elapsed, wpm: stats.wpm, accuracy: stats.accuracy }
  const ranked = [...players].sort((a, b) => b.progress - a.progress || b.wpm - a.wpm)

  return (
    <div className="mx-auto max-w-2xl py-2">
      {/* ── รหัสห้อง ────────────────────────────────────────────── */}
      {room.status === 'WAITING' ? (
        <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4 text-center">
          <p className="text-xs text-ink-faint">
            <Untranslated>{ot('game.typing.roomCode')}</Untranslated>
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-ink">{room.code}</p>
          <p className="mt-2 text-xs text-ink-soft">
            <Untranslated>{ot('game.typing.waitingPlayers', { n: players.length })}</Untranslated>
          </p>

          {room.isOwner ? (
            <Button
              variant="primary"
              className="mt-3 min-h-11"
              onClick={() => void apiFetch('/api/office/games/typing', { method: 'POST', body: { action: 'start', roomId } }).then(load)}
            >
              <Untranslated>{ot('game.typing.startRace')}</Untranslated>
            </Button>
          ) : (
            <p className="mt-3 text-xs text-ink-faint">
              <Untranslated>{ot('game.typing.waitOwner')}</Untranslated>
            </p>
          )}
        </div>
      ) : null}

      {/* ── นับถอยหลัง ──────────────────────────────────────────── */}
      {countdown > 0 ? (
        <p className="py-10 text-center text-6xl font-bold tabular-nums text-accent">{countdown}</p>
      ) : null}

      {/* ── แถบความคืบหน้าของทุกคน ─────────────────────────────── */}
      <ul className="mt-4 flex flex-col gap-2">
        {ranked.map((p) => (
          <li key={p.id}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span dir="auto" className={cn('min-w-0 truncate', p.me ? 'font-semibold text-ink' : 'text-ink-soft')}>
                {p.name}
              </span>
              <span className="shrink-0 tabular-nums text-ink-faint">
                {p.wpm} · {p.accuracy}%
              </span>
            </div>
            {/*
              * ★ แถบของฉันใช้ค่าในเครื่อง ไม่รอ server
              *   ★★ รอ server จะเห็นแถบตัวเองกระตุกทุก 0.7 วินาที
              *      ทั้งที่เรารู้ค่าจริงอยู่แล้วทุกตัวอักษร
              */}
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className={cn('h-full rounded-full transition-all', p.finished ? 'bg-link' : 'bg-accent')}
                style={{
                  /* ★ จบแล้ว = เต็มแถบ — server เก็บความคืบหน้าล่าสุดที่ส่งทัน (เคยค้าง 97%) */
                  width: `${p.finished ? 100 : Math.min(100, ((p.me ? progress.cursor : p.progress) / total) * 100)}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* ── ข้อความที่ต้องพิมพ์ ─────────────────────────────────── */}
      {startAt !== null ? (
        <div
          onClick={() => inputRef.current?.focus()}
 className="mt-4 cursor-text rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5 text-[19px] leading-[2] tracking-wide"
        >
          <p dir="auto" className="break-words">
            {chars.map((ch, i) => {
              /* ★ ตัดสินทีละตำแหน่ง — ผิดแล้วเคอร์เซอร์เดินต่อ ตัวที่ผิดค้างไฮไลต์แดงไว้ให้เห็น */
              const state =
                i < progress.cursor
                  ? typedChars[i] === ch
                    ? 'ok'
                    : 'bad'
                  : i === progress.cursor
                    ? 'cursor'
                    : 'rest'
              return (
                <span
                  key={i}
                  ref={state === 'cursor' ? scrollIntoViewRef : undefined}
                  className={cn(
                    state === 'ok' && 'text-ink',
                    state === 'bad' && 'rounded bg-danger/30 text-danger',
                    state === 'cursor' && 'rounded bg-accent/25 text-ink',
                    state === 'rest' && 'text-ink-faint',
                  )}
                >
                  {ch === ' ' && state === 'bad' ? '␣' : ch}
                </span>
              )
            })}
          </p>
        </div>
      ) : null}

      {/* ★ ข้อจำกัดชุดเดียวกับโหมดฝึกคนเดียว — ปิด autocorrect และห้าม paste */}
      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          onChange((e.target as HTMLInputElement).value)
        }}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={!racing || done}
        aria-label={ot('game.typing.inputLabel')}
        className="h-11 w-full rounded-xl border border-line bg-page px-4 text-base text-ink opacity-0 focus:outline-none"
      />

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── จบ ──────────────────────────────────────────────────── */}
      {done ? (
        <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5 text-center">
          <p className="text-2xl font-bold text-ink">{shown.wpm} WPM</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {ot('game.typing.accuracy')} {shown.accuracy}% · {(shown.elapsed / 1000).toFixed(1)}s
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {/*
              * ★★ แข่งอีกรอบใช้ "ห้องเดิม ข้อความใหม่" ตามข้อกำหนด
              *    ★ คนที่อยู่ในห้องไม่ต้องส่งรหัสหากันใหม่
              */}
            <Button
              variant="primary"
              className="min-h-11"
              onClick={async () => {
                await apiFetch('/api/office/games/typing', {
                  method: 'POST',
                  body: { action: 'rematch', roomId, lang, length },
                }).catch(() => undefined)
                /* ★ load() เห็นรอบใหม่แล้วล้างสถานะเอง — ทางเดียวกับเครื่องของคนอื่นในห้อง */
                await load()
              }}
            >
              <Untranslated>{ot('game.typing.raceAgain')}</Untranslated>
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={async () => {
                await apiFetch('/api/office/games/typing', { method: 'POST', body: { action: 'leave', roomId } }).catch(() => undefined)
                onExit()
              }}
            >
              <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={async () => {
              /* ★ ออกกลางห้อง (รอ/กำลังแข่ง) ต้องยืนยัน — จบรอบแล้วกลับเมนูไม่ต้องถาม */
              if (!(await confirm({ kind: 'leave', subject: room?.code }))) return
              await apiFetch('/api/office/games/typing', { method: 'POST', body: { action: 'leave', roomId } }).catch(() => undefined)
              onExit()
            }}
            className="min-h-11 rounded-full px-4 text-sm text-ink-soft hover:text-ink"
          >
            <Untranslated>{ot('game.typing.leaveRoom')}</Untranslated>
          </button>
        </div>
      )}
    </div>
  )
}

/* ★ block:'nearest' — 'center' กระชากจอทุกตัวอักษรจนตาตามไม่ทัน */
function scrollIntoViewRef(el: HTMLSpanElement | null) {
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/* ═══════════════════════════════════════════════════════════════════
 * กระดานอันดับรายสัปดาห์
 * ═══════════════════════════════════════════════════════════════════ */

export function TypingBoard({ lang }: { lang: TextLang }) {
  const ot = useOt()
  const [rows, setRows] = useState<{ id: string; name: string; wpm: number; accuracy: number; me: boolean }[]>([])

  useEffect(() => {
    void apiFetch<{ board: typeof rows }>(`/api/office/games/typing?board=${lang}`)
      .then((r) => setRows(r.board))
      .catch(() => setRows([]))
  }, [lang])

  if (rows.length === 0) return null

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-ink">
        <Untranslated>{ot('game.typing.weeklyBoard')}</Untranslated>
      </h2>
      <ol className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3',
              r.me && 'bg-accent/10',
            )}
          >
            <span className="w-6 shrink-0 text-center text-sm tabular-nums text-ink-faint">{i + 1}</span>
            <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-ink">
              {r.name}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{r.wpm}</span>
            <span className="w-14 shrink-0 text-end text-xs tabular-nums text-ink-faint">{r.accuracy}%</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
