'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
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
  isOwner: boolean
}

/** ส่งความคืบหน้าทุกกี่มิลลิวินาที */
const PUSH_MS = 700

/**
 * ห้องแข่งพิมพ์ดีด
 *
 * ★★★ นาฬิกาเดียวกันทั้งห้อง: ทุกเครื่องคิดจาก room.startedAt
 *     ★ ไม่ใช่ "เวลาที่เครื่องฉันเห็นคำว่าเริ่ม" ★★ ซึ่งต่างกันตามความเร็วเน็ต
 *       แล้วคนเน็ตช้าจะได้ WPM ต่ำกว่าความจริงโดยไม่ใช่ความผิดของเขา
 */
export function TypingRace({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  const ot = useOt()
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

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ room: Room; players: Player[] }>(
        `/api/office/games/typing?room=${encodeURIComponent(roomId)}`,
      )
      setRoom(res.room)
      setPlayers(res.players)
      setError(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [roomId])

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

  /* นาฬิกาเดิน */
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 120)
    return () => window.clearInterval(id)
  }, [])

  const startAt = room?.startedAt ? Date.parse(room.startedAt) : null
  /** ยังนับถอยหลังอยู่ไหม — บวก 1 เพราะ 0.4 วินาทีที่เหลือก็ยังไม่ถึงเวลา */
  const countdown = startAt !== null && now < startAt ? Math.ceil((startAt - now) / 1000) : 0
  const racing = startAt !== null && now >= startAt && room?.status !== 'FINISHED'
  const elapsed = startAt !== null && now >= startAt ? now - startAt : 0

  /* ★ ถึงเวลาแล้วโฟกัสช่องพิมพ์ให้เลย — ไม่ต้องให้กดอีกทีเพื่อเรียกคีย์บอร์ด */
  useEffect(() => {
    if (racing) inputRef.current?.focus()
  }, [racing])

  const progress = useMemo(() => compare(room?.text ?? '', typed), [room?.text, typed])
  const stats = counterRef.current.stats(elapsed)

  async function push(final: boolean) {
    if (!room) return
    const s = counterRef.current.stats(elapsed)
    try {
      if (final) {
        finishedRef.current = true
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
          body: { action: 'progress', roomId, chars: s.correct, wpm: s.wpm, accuracy: s.accuracy },
        })
      }
    } catch {
      /* ★ ส่งความคืบหน้าไม่สำเร็จไม่ควรหยุดการพิมพ์ — รอบถัดไปส่งใหม่เอง */
    }
  }

  function onChange(value: string) {
    if (!racing || finishedRef.current) return
    setTyped(value)
    if (composingRef.current) return

    const delta = Math.max(1, toChars(value).length - prevLenRef.current)
    prevLenRef.current = toChars(value).length
    const p = counterRef.current.update(room?.text ?? '', value, delta)

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
  const done = finishedRef.current || room.status === 'FINISHED'
  const ranked = [...players].sort((a, b) => b.progress - a.progress || b.wpm - a.wpm)

  return (
    <div className="mx-auto max-w-2xl py-2">
      {/* ── รหัสห้อง ────────────────────────────────────────────── */}
      {room.status === 'WAITING' ? (
        <div className="rounded-2xl border border-line bg-elevated/50 p-4 text-center">
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
                  width: `${Math.min(100, ((p.me ? stats.correct : p.progress) / total) * 100)}%`,
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
          className="mt-4 cursor-text rounded-2xl border border-line bg-elevated/50 p-5 text-[19px] leading-[2] tracking-wide"
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
        <div className="mt-4 rounded-2xl border border-line bg-elevated/60 p-5 text-center">
          <p className="text-2xl font-bold text-ink">{stats.wpm} WPM</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {ot('game.typing.accuracy')} {stats.accuracy}% · {(elapsed / 1000).toFixed(1)}s
          </p>
          <Button
            variant="ghost"
            className="mt-4 min-h-11"
            onClick={async () => {
              await apiFetch('/api/office/games/typing', { method: 'POST', body: { action: 'leave', roomId } }).catch(() => undefined)
              onExit()
            }}
          >
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
        </div>
      ) : (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={async () => {
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
