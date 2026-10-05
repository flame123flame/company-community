'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import type { QuizListItem } from '@/lib/office/quiz'
import { FunGuide } from './FunGuide'
import { QuizBuilder } from './QuizBuilder'

/**
 * ควิซออฟฟิศ — หน้ารวม: สร้างควิซ · เข้าร่วมด้วยรหัส · ห้องที่กำลังเล่นอยู่
 *
 * ★ เข้าร่วมด้วยรหัส 5 ตัว (ผู้จัดขึ้นจอใหญ่ในห้องประชุม) หรือแตะห้องในรายการ
 */
export function QuizHub() {
  const ot = useOt()
  const router = useRouter()
  const [building, setBuilding] = useState(false)
  const [rooms, setRooms] = useState<QuizListItem[] | null>(null)
  const [code, setCode] = useState('')
  const [joinErr, setJoinErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ items: QuizListItem[] }>('/api/office/games/quiz')
      setRooms(r.items)
    } catch {
      setRooms([])
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    const iv = window.setInterval(() => document.visibilityState === 'visible' && void load(), 8000)
    return () => {
      window.clearTimeout(id)
      window.clearInterval(iv)
    }
  }, [load])

  async function joinByCode() {
    const c = code.trim().toUpperCase()
    if (c.length < 5) return setJoinErr(ot('game.quiz.errCode'))
    try {
      const r = await apiFetch<{ items: QuizListItem[] }>(`/api/office/games/quiz?code=${encodeURIComponent(c)}`)
      const hit = r.items[0]
      if (!hit) return setJoinErr(ot('game.quiz.errCodeNotFound'))
      router.push(`/office/fun/quiz/${hit.id}`)
    } catch (e) {
      setJoinErr(officeErrorText(e, ot))
    }
  }

  return (
    <div className="py-2">
      <FunGuide id="quiz" art="quiz" />

      {building ? (
        <QuizBuilder onCancel={() => setBuilding(false)} />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          {/* ── สร้างควิซ ── */}
          <button type="button" onClick={() => setBuilding(true)} className="quiz-hero-card group relative overflow-hidden rounded-[28px] p-6 text-start sm:p-7">
            <span aria-hidden="true" className="pop-blob pop-blob-a" />
            <span aria-hidden="true" className="pop-blob pop-blob-b" />
            <span aria-hidden="true" className="relative grid size-16 place-items-center rounded-[22px] bg-[var(--ck-shine)] text-3xl shadow-lg">🎤</span>
            <span className="relative mt-4 block text-2xl font-black text-[var(--ck-shine)]">
              <Untranslated>{ot('game.quiz.hostTitle')}</Untranslated>
            </span>
            <span className="relative mt-1.5 block max-w-md text-sm leading-relaxed text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
              <Untranslated>{ot('game.quiz.hostDetail')}</Untranslated>
            </span>
            <span className="relative mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ck-shine)] px-5 text-sm font-black text-accent transition-transform group-hover:translate-x-1">
              <Untranslated>{ot('game.quiz.hostCta')}</Untranslated> →
            </span>
          </button>

          {/* ── เข้าร่วมด้วยรหัส ── */}
          <div className="quiz-join rounded-[28px] p-6 sm:p-7">
            <span aria-hidden="true" className="quiz-badge grid size-14 place-items-center rounded-[20px] text-2xl">🙋</span>
            <h2 className="mt-4 text-xl font-black text-ink">
              <Untranslated>{ot('game.quiz.joinTitle')}</Untranslated>
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              <Untranslated>{ot('game.quiz.joinDetail')}</Untranslated>
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void joinByCode()
              }}
            >
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))
                  setJoinErr(null)
                }}
                placeholder="ABCDE"
                aria-label={ot('game.quiz.codeLabel')}
                autoCapitalize="characters"
                className="h-13 min-w-0 flex-1 rounded-2xl border border-line bg-elevated text-center font-mono text-xl font-black uppercase tracking-[0.35em] text-ink outline-none focus:border-accent"
              />
              <button type="submit" className="cfm-ok min-h-13 shrink-0 rounded-2xl px-5 text-sm font-bold" style={{ '--pc': '10 132 255', '--pc2': '175 82 222' } as CSSProperties}>
                <Untranslated>{ot('game.quiz.join')}</Untranslated>
              </button>
            </form>
            {joinErr ? (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                <Untranslated>{joinErr}</Untranslated>
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* ── ห้องที่กำลังเล่นอยู่ ── */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-black text-ink">
          <span aria-hidden="true" className="music-live" />
          <Untranslated>{ot('game.quiz.liveRooms')}</Untranslated>
        </h2>
        {rooms === null ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink-soft">
            <Untranslated>{ot('game.quiz.noRooms')}</Untranslated>
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r, i) => (
              <li key={r.id}>
                <Link href={`/office/fun/quiz/${r.id}`} className="quiz-room-card group flex min-h-24 items-center gap-3 rounded-3xl p-4" style={{ '--i': i } as CSSProperties}>
                  <span aria-hidden="true" className="quiz-badge grid size-12 shrink-0 place-items-center rounded-2xl text-xl">🧠</span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-base font-black text-ink">{r.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-soft">
                      <Untranslated>{ot('game.quiz.roomMeta', { host: r.hostName, n: r.players })}</Untranslated>
                    </span>
                    <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold', r.status === 'LOBBY' ? 'bg-[color-mix(in_srgb,var(--color-link)_14%,transparent)] text-link' : 'bg-accent/12 text-accent')}>
                      <Untranslated>{ot(r.status === 'LOBBY' ? 'game.quiz.stLobby' : 'game.quiz.stLive')}</Untranslated>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs font-bold tracking-[0.2em] text-ink-faint">{r.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
