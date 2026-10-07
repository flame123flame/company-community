'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRealtimeAuth } from '@/lib/supabase/realtime'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { playCelebrate, vibrate } from '@/lib/office/sound'
import { CHOICE_STYLE, type QuizPlayer, type QuizState } from '@/lib/office/quiz'
import { ChatAvatar } from './ChatAvatar'
import { Confetti } from './Confetti'

/**
 * ห้องควิซ — ห้องรอ · กำลังถาม · เฉลย · ผลสรุป
 *
 * ★★ สถานะมาจาก API ที่เดียว (ไม่มีเฉลยปนตอนถาม) — Realtime แค่ "สะกิด" ให้ดึงใหม่
 *    และดึงซ้ำทุก 2.5 วินาทีกันสัญญาณหลุด (แบบเดียวกับห้องสุ่ม)
 * ★ ตัวนับถอยหลังใช้นาฬิกาฐานข้อมูล: offset = serverNow − เวลาเครื่อง ณ ตอนได้คำตอบ
 * ★ หมดเวลาแล้ว เครื่องไหนก็เรียก "เฉลย" ได้ (ฐานข้อมูลตรวจเวลาเอง) — ผู้จัดปิดแท็บห้องก็ไม่ค้าง
 */
export function QuizRoom({ roomId }: { roomId: string }) {
  /* ★ Realtime พร้อมเมื่อ socket รู้จักผู้ใช้แล้วเท่านั้น */
  const realtimeReady = useRealtimeAuth()
  const ot = useOt()
  const router = useRouter()
  const confirm = useConfirm()
  const [s, setS] = useState<QuizState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(0)
  const offset = useRef(0)
  const revealAsked = useRef<string>('')

  const load = useCallback(async () => {
    try {
      const t0 = Date.now()
      const st = await apiFetch<QuizState>(`/api/office/games/quiz/${roomId}`)
      offset.current = Date.parse(st.serverNow) - (t0 + Date.now()) / 2
      setS(st)
      setError(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [roomId, ot])

  /* ดึงครั้งแรก + ดึงซ้ำกันพลาด */
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0)
    const iv = window.setInterval(() => document.visibilityState === 'visible' && void load(), 2500)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(iv)
    }
  }, [load])

  /* Realtime: ทางเร็ว */
  useEffect(() => {
    /* ★ รอ socket รู้จักผู้ใช้ก่อน — เปิดก่อน RLS จะกรองทุกแถวทิ้งเงียบ ๆ */
    if (!realtimeReady) return
    const supabase = getSupabaseBrowserClient()
    const ch = supabase
      .channel(`office-quiz:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_quiz_rooms', filter: `id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_quiz_players', filter: `room_id=eq.${roomId}` }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roomId, load, realtimeReady])

  /* นาฬิกาตัวนับถอยหลัง — อัปเดตใน interval (ห้ามอ่าน Date.now ตอน render) */
  useEffect(() => {
    if (s?.room.status !== 'QUESTION') return
    const tick = () => setNowMs(Date.now() + offset.current)
    const id = window.setInterval(tick, 200)
    const first = window.setTimeout(tick, 0)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(first)
    }
  }, [s?.room.status, s?.room.qIndex])

  const status = s?.room.status
  const seconds = s?.question?.seconds ?? 0
  const startedMs = s?.room.startedAt ? Date.parse(s.room.startedAt) : 0
  const left = status === 'QUESTION' && nowMs ? Math.max(0, seconds - (nowMs - startedMs) / 1000) : seconds
  const everyone = !!s && s.players.length > 0 && s.room.answered >= s.players.length

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      try {
        await apiFetch(`/api/office/games/quiz/${roomId}`, { method: 'POST', body })
        await load()
      } catch (e) {
        setError(officeErrorText(e, ot))
      } finally {
        setBusy(false)
      }
    },
    [roomId, load, ot],
  )

  /* หมดเวลา หรือทุกคนตอบครบ (ผู้จัด) → เฉลย · ขอครั้งเดียวต่อข้อ */
  useEffect(() => {
    if (!s || status !== 'QUESTION') return
    const key = `${s.room.qIndex}`
    if (revealAsked.current === key) return
    const timeUp = nowMs > 0 && left <= 0
    if (timeUp || (s.room.isHost && everyone)) {
      revealAsked.current = key
      /*
       * ★★ ไม่คืน cleanup ที่ยกเลิกตัวตั้งเวลา — นาฬิกาเดินทุก 200ms ทำให้ effect นี้รันซ้ำ
       *    ถ้ายกเลิกทุกรอบ การขอเฉลยจะไม่เกิดขึ้นเลย (บั๊กที่เจอตอนเล่นจริง: ตอบครบ 1/1 แต่ไม่เฉลย)
       *    เรียกซ้ำได้ปลอดภัย — ฐานข้อมูลเปลี่ยนสถานะเฉพาะจาก QUESTION ครั้งเดียว
       */
      /* ★ ผู้เล่นรอเผื่อ 1.5 วิ — นาฬิกาเครื่องเร็วกว่าฐานข้อมูลนิดเดียวก็โดนปฏิเสธ (403) */
      window.setTimeout(() => void act({ action: 'reveal' }), timeUp ? (s.room.isHost ? 300 : 1500) : 900)
    }
  }, [s, status, left, nowMs, everyone, act])

  /* ฉลองเมื่อตอบถูก / จบเกม */
  const cheered = useRef('')
  useEffect(() => {
    if (!s) return
    const key = `${status}:${s.room.qIndex}`
    if (cheered.current === key) return
    if ((status === 'REVEAL' && (s.me.points ?? 0) > 0) || status === 'DONE') {
      cheered.current = key
      playCelebrate()
      vibrate([30, 40, 60])
    }
  }, [s, status])

  if (!s) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        {error ? (
          <div className="text-center">
            <p className="text-sm text-danger">
              <Untranslated>{error}</Untranslated>
            </p>
            <Link href="/office/fun/quiz" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-sm">
              <Untranslated>{ot('game.quiz.backHub')}</Untranslated>
            </Link>
          </div>
        ) : (
          <span className="ck-live text-accent" aria-label="loading" />
        )}
      </div>
    )
  }

  const { room, question, reveal, players, me } = s
  const isHost = room.isHost

  return (
    <div className="py-2">
      {/* ── หัวห้อง ── */}
      <header className="quiz-head relative overflow-hidden rounded-[28px] px-5 py-4 sm:px-7">
        <span aria-hidden="true" className="pop-blob pop-blob-a" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--ck-shine)] text-2xl">🧠</span>
          <div className="min-w-0 flex-1">
            <h1 dir="auto" className="truncate text-xl font-black text-[var(--ck-shine)]">{room.title}</h1>
            <p className="text-xs text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
              <Untranslated>{ot('game.quiz.hostedBy', { name: room.hostName })}</Untranslated>
              {room.qIndex >= 0 && status !== 'DONE' ? (
                <>
                  {' · '}
                  <Untranslated>{ot('game.quiz.progress', { n: room.qIndex + 1, total: room.qCount })}</Untranslated>
                </>
              ) : null}
            </p>
          </div>
          <span className="pop-pill rounded-full px-3 py-1.5 font-mono text-sm font-black tracking-[0.25em]">{room.code}</span>
        </div>
        {room.qIndex >= 0 ? (
          <div aria-hidden="true" className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ck-shade)_25%,transparent)]">
            <div className="h-full rounded-full bg-[var(--ck-shine)] transition-[width] duration-500" style={{ width: `${((room.qIndex + (status === 'QUESTION' ? 0 : 1)) / room.qCount) * 100}%` }} />
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-danger/10 px-4 py-2 text-sm text-danger">
          <Untranslated>{error}</Untranslated>
        </p>
      ) : null}

      {status === 'LOBBY' ? (
        <Lobby s={s} busy={busy} act={act} onLeave={async () => {
          if (!(await confirm({ kind: 'leave', subject: room.title }))) return
          await act({ action: 'leave' })
          router.push('/office/fun/quiz')
        }} />
      ) : null}

      {(status === 'QUESTION' || status === 'REVEAL') && question ? (
        <div className="mt-5">
          {/* คำถาม + ตัวนับ */}
          <div className="quiz-question relative flex items-center gap-4 rounded-[28px] p-5 sm:p-7">
            <CountRing left={status === 'QUESTION' ? left : 0} total={seconds} done={status === 'REVEAL'} />
            <p dir="auto" className="min-w-0 flex-1 text-[clamp(1.15rem,3.6vw,1.9rem)] font-black leading-snug text-ink">{question.body}</p>
          </div>

          {/* ตัวเลือก */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {question.choices.map((c, k) => {
              const st = CHOICE_STYLE[k]!
              const picked = me.choice === k
              const isCorrect = reveal?.correct === k
              const canTap = !isHost && me.joined && status === 'QUESTION' && me.choice === null && left > 0
              const total = reveal ? Math.max(1, reveal.counts.reduce((a, b) => a + b, 0)) : 1
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!canTap || busy}
                  onClick={() => void act({ action: 'answer', choice: k })}
                  className={cn(
                    'quiz-choice relative flex min-h-20 items-center gap-3 overflow-hidden rounded-3xl p-4 text-start sm:min-h-24',
                    `quiz-tone-${st.tone}`,
                    canTap && 'quiz-choice-live',
                    picked && 'quiz-choice-picked',
                    reveal && (isCorrect ? 'quiz-choice-correct' : 'quiz-choice-wrong'),
                    me.choice !== null && !picked && !reveal && 'opacity-45',
                  )}
                  style={{ '--i': k } as CSSProperties}
                >
                  {reveal ? (
                    <span aria-hidden="true" className="quiz-bar absolute inset-y-0 start-0" style={{ width: `${(reveal.counts[k]! / total) * 100}%` }} />
                  ) : null}
                  <span aria-hidden="true" className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--ck-shine)_25%,transparent)] text-xl font-black">
                    {reveal && isCorrect ? '✓' : st.shape}
                  </span>
                  <span dir="auto" className="relative min-w-0 flex-1 text-base font-bold leading-snug sm:text-lg">{c}</span>
                  {reveal ? (
                    <span className="relative shrink-0 rounded-full bg-[color-mix(in_srgb,var(--ck-shade)_25%,transparent)] px-2.5 py-1 text-sm font-black tabular-nums">
                      {reveal.counts[k]}
                    </span>
                  ) : picked ? (
                    <span className="relative shrink-0 text-xs font-bold">
                      <Untranslated>{ot('game.quiz.yourPick')}</Untranslated>
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* สถานะใต้ตัวเลือก */}
          <div className="mt-4 text-center">
            {status === 'QUESTION' ? (
              isHost ? (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink">
                    <Untranslated>{ot('game.quiz.answeredCount', { n: room.answered, total: players.length })}</Untranslated>
                  </span>
                  <button type="button" disabled={busy} onClick={() => void act({ action: 'reveal' })} className="cfm-ok min-h-12 rounded-2xl px-6 font-bold" style={{ '--pc': '255 176 32', '--pc2': '255 59 48' } as CSSProperties}>
                    💡 <Untranslated>{ot('game.quiz.revealNow')}</Untranslated>
                  </button>
                </div>
              ) : !me.joined ? (
                <p className="text-sm text-ink-soft">
                  <Untranslated>{ot('game.quiz.spectating')}</Untranslated>
                </p>
              ) : me.choice !== null ? (
                <p className="quiz-waiting inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink">
                  <span aria-hidden="true" className="ck-live text-accent" />
                  <Untranslated>{ot('game.quiz.locked')}</Untranslated>
                </p>
              ) : (
                <p className="text-sm font-semibold text-ink-soft">
                  <Untranslated>{ot('game.quiz.tapAnswer')}</Untranslated>
                </p>
              )
            ) : (
              <RevealPanel s={s} busy={busy} onNext={() => void act({ action: 'next' })} />
            )}
          </div>
        </div>
      ) : null}

      {status === 'DONE' ? (
        <Podium
          players={players}
          isHost={isHost}
          onDelete={async () => {
            if (!(await confirm({ kind: 'delete', subject: room.title }))) return
            await act({ action: 'delete' })
            router.push('/office/fun/quiz')
          }}
        />
      ) : null}
    </div>
  )
}

/* ── ห้องรอ ─────────────────────────────────────────────────────── */
function Lobby({
  s,
  busy,
  act,
  onLeave,
}: {
  s: QuizState
  busy: boolean
  act: (b: Record<string, unknown>) => Promise<void>
  onLeave: () => void
}) {
  const ot = useOt()
  const { room, players, me } = s
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <div className="quiz-lobby-code flex flex-col items-center justify-center rounded-[28px] p-6 text-center">
        <p className="text-sm font-semibold text-ink-soft">
          <Untranslated>{ot('game.quiz.codeHint')}</Untranslated>
        </p>
        <div className="mt-3 flex gap-1.5">
          {room.code.split('').map((ch, i) => (
            <span key={i} className="quiz-code-tile grid h-16 w-12 place-items-center rounded-2xl font-mono text-3xl font-black sm:h-20 sm:w-14 sm:text-4xl" style={{ '--i': i } as CSSProperties}>
              {ch}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          <Untranslated>{ot('game.quiz.codeWhere')}</Untranslated>
        </p>

        <div className="mt-6 w-full">
          {room.isHost ? (
            <button
              type="button"
              disabled={busy || players.length === 0}
              onClick={() => void act({ action: 'next' })}
              className="cfm-ok min-h-14 w-full rounded-2xl text-lg font-black disabled:opacity-50"
              style={{ '--pc': '52 199 123', '--pc2': '48 209 176' } as CSSProperties}
            >
              ▶ <Untranslated>{players.length === 0 ? ot('game.quiz.waitPlayers') : ot('game.quiz.start', { n: players.length })}</Untranslated>
            </button>
          ) : me.joined ? (
            <div className="flex flex-col items-center gap-2">
              <p className="quiz-waiting inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-bold text-ink">
                <span aria-hidden="true" className="ck-live text-accent" />
                <Untranslated>{ot('game.quiz.waitHost')}</Untranslated>
              </p>
              <button type="button" onClick={onLeave} className="min-h-11 rounded-full px-4 text-xs text-ink-faint hover:text-ink">
                <Untranslated>{ot('game.quiz.leave')}</Untranslated>
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act({ action: 'join' })}
              className="cfm-ok min-h-14 w-full rounded-2xl text-lg font-black"
              style={{ '--pc': '10 132 255', '--pc2': '175 82 222' } as CSSProperties}
            >
              🙋 <Untranslated>{ot('game.quiz.joinNow')}</Untranslated>
            </button>
          )}
        </div>
      </div>

      <div className="quiz-lobby-players rounded-[28px] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-black text-ink">
          <Untranslated>{ot('game.quiz.playersIn', { n: players.length })}</Untranslated>
        </h2>
        {players.length === 0 ? (
          <p className="mt-6 text-center text-sm text-ink-faint">
            <Untranslated>{ot('game.quiz.noPlayers')}</Untranslated>
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {players.map((p, i) => (
              <li key={p.id} className={cn('quiz-player-chip flex items-center gap-2 rounded-full py-1 ps-1 pe-3.5', p.isMe && 'quiz-player-me')} style={{ '--i': i } as CSSProperties}>
                <ChatAvatar name={p.name} url={p.avatarUrl} size={30} />
                <span dir="auto" className="max-w-32 truncate text-sm font-semibold text-ink">{p.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── วงนับถอยหลัง ─────────────────────────────────────────────── */
function CountRing({ left, total, done }: { left: number; total: number; done: boolean }) {
  const p = total > 0 ? left / total : 0
  const urgent = !done && left <= 5
  return (
    <span
      className={cn('quiz-ring relative grid size-16 shrink-0 place-items-center rounded-full sm:size-20', urgent && 'quiz-ring-urgent')}
      style={{ '--p': `${p * 360}deg` } as CSSProperties}
      role="timer"
      aria-label={`${Math.ceil(left)}`}
    >
      <span className="grid size-[calc(100%-10px)] place-items-center rounded-full bg-elevated text-xl font-black tabular-nums text-ink sm:text-2xl">
        {done ? '💡' : Math.ceil(left)}
      </span>
    </span>
  )
}

/* ── หลังเฉลย ─────────────────────────────────────────────────── */
function RevealPanel({ s, busy, onNext }: { s: QuizState; busy: boolean; onNext: () => void }) {
  const ot = useOt()
  const { room, players, me } = s
  const last = room.qIndex + 1 >= room.qCount
  const top = players.slice(0, 5)
  return (
    <div className="mx-auto max-w-xl">
      {!room.isHost && me.joined ? (
        <div className={cn('quiz-result mb-4 rounded-3xl px-5 py-4', (me.points ?? 0) > 0 ? 'quiz-result-ok' : 'quiz-result-no')}>
          {(me.points ?? 0) > 0 ? <Confetti pieces={70} durationMs={1800} /> : null}
          <p className="text-2xl font-black">
            <Untranslated>
              {(me.points ?? 0) > 0 ? ot('game.quiz.rightPts', { n: me.points ?? 0 }) : me.choice === null ? ot('game.quiz.noAnswer') : ot('game.quiz.wrong')}
            </Untranslated>
          </p>
        </div>
      ) : null}

      <ol className="flex flex-col gap-1.5 text-start">
        {top.map((p, i) => (
          <ScoreRow key={p.id} p={p} rank={i + 1} i={i} />
        ))}
      </ol>

      {room.isHost ? (
        <button type="button" disabled={busy} onClick={onNext} className="cfm-ok mt-5 min-h-13 w-full rounded-2xl text-base font-black" style={{ '--pc': '255 0 51', '--pc2': '175 82 222' } as CSSProperties}>
          <Untranslated>{last ? `🏆 ${ot('game.quiz.showFinal')}` : `${ot('game.quiz.nextQ')} →`}</Untranslated>
        </button>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          <Untranslated>{ot('game.quiz.waitNext')}</Untranslated>
        </p>
      )}
    </div>
  )
}

function ScoreRow({ p, rank, i }: { p: QuizPlayer; rank: number; i: number }) {
  const ot = useOt()
  return (
    <li className={cn('quiz-score-row flex items-center gap-3 rounded-2xl px-3 py-2', p.isMe && 'quiz-player-me')} style={{ '--i': i } as CSSProperties}>
      <span className="w-6 shrink-0 text-center text-sm font-black text-ink-soft">{rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span>
      <ChatAvatar name={p.name} url={p.avatarUrl} size={32} />
      <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{p.name}</span>
      {p.gained ? (
        <span className="quiz-gain shrink-0 rounded-full px-2 py-0.5 text-xs font-black tabular-nums">+{p.gained}</span>
      ) : null}
      <span className="shrink-0 text-base font-black tabular-nums text-ink">
        <Untranslated>{ot('game.quiz.pts', { n: p.score })}</Untranslated>
      </span>
    </li>
  )
}

/* ── ผลสรุป: โพเดียม 3 อันดับ + ที่เหลือ ───────────────────────── */
function Podium({ players, isHost, onDelete }: { players: QuizPlayer[]; isHost: boolean; onDelete: () => void }) {
  const ot = useOt()
  const [first, second, third] = players
  const rest = players.slice(3)
  const myRank = players.findIndex((p) => p.isMe) + 1
  return (
    <div className="mt-6">
      <Confetti pieces={160} durationMs={4200} />
      <h2 className="text-center text-[clamp(1.6rem,5vw,2.4rem)] font-black text-ink">
        🏆 <Untranslated>{ot('game.quiz.finalTitle')}</Untranslated>
      </h2>
      {myRank > 0 ? (
        <p className="mt-1 text-center text-sm font-semibold text-ink-soft">
          <Untranslated>{ot('game.quiz.myRank', { n: myRank, total: players.length })}</Untranslated>
        </p>
      ) : null}

      <div className="mx-auto mt-8 grid max-w-xl grid-cols-3 items-end gap-2 sm:gap-4">
        {([second, first, third] as (QuizPlayer | undefined)[]).map((p, col) => {
          const place = [2, 1, 3][col]!
          return (
            <div key={place} className="flex flex-col items-center">
              {p ? (
                <>
                  <span className={cn('quiz-podium-ava relative', place === 1 && 'quiz-podium-first')}>
                    {place === 1 ? <span aria-hidden="true" className="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl">👑</span> : null}
                    <ChatAvatar name={p.name} url={p.avatarUrl} size={place === 1 ? 72 : 56} />
                  </span>
                  <span dir="auto" className="mt-2 max-w-full truncate text-sm font-black text-ink">{p.name}</span>
                  <span className="text-xs font-bold tabular-nums text-ink-soft">
                    <Untranslated>{ot('game.quiz.pts', { n: p.score })}</Untranslated>
                  </span>
                </>
              ) : (
                <span className="h-20" />
              )}
              <div className={cn('quiz-podium mt-3 grid w-full place-items-center rounded-t-3xl text-3xl font-black', `quiz-podium-${place}`)} style={{ '--i': col } as CSSProperties}>
                {place}
              </div>
            </div>
          )
        })}
      </div>

      {rest.length ? (
        <ol className="mx-auto mt-6 flex max-w-xl flex-col gap-1.5" start={4}>
          {rest.map((p, i) => (
            <ScoreRow key={p.id} p={{ ...p, gained: null }} rank={i + 4} i={i} />
          ))}
        </ol>
      ) : null}

      <div className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
        <Link href="/office/fun/quiz" className="cfm-ok inline-flex min-h-13 flex-1 items-center justify-center rounded-2xl text-base font-black" style={{ '--pc': '255 0 51', '--pc2': '175 82 222' } as CSSProperties}>
          <Untranslated>{ot('game.quiz.playAgain')}</Untranslated>
        </Link>
        {isHost ? (
          <button type="button" onClick={onDelete} className="min-h-13 rounded-2xl px-5 text-sm font-semibold text-ink-soft hover:bg-danger/10 hover:text-danger">
            <Untranslated>{ot('game.quiz.closeRoom')}</Untranslated>
          </button>
        ) : null}
      </div>
    </div>
  )
}
