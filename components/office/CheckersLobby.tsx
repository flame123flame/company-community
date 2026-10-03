'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { SectionTitle } from './CheckersIntro'
import type { OnlineGame } from './CheckersOnline'

type Person = { id: string; name: string; avatarUrl: string | null }
type Challenge = { id: string; fromId: string; fromName: string | null; expiresAt: string }
type BoardRow = { id: string; name: string; wins: number; losses: number; draws: number; me: boolean }

/**
 * หน้าท้าเพื่อน
 *
 * ★★★ รื้อใหม่ทั้งหน้าเพราะของเดิมเป็น "คอลัมน์แคบลอยกลางจอกว้าง"
 *
 *     ★ max-w-md บนจอ 1900px แปลว่าที่ว่างสองข้างรวมกันกว้างกว่าเนื้อหาสามเท่า
 *       ★★ และรายชื่อพนักงานถูกวางเป็นรายการแนวตั้งยาวเป็นพรืด ซึ่งบนจอกว้าง
 *          คือการใช้พื้นที่แย่ที่สุดที่เป็นไปได้ — สูงจนต้องเลื่อน ทั้งที่
 *          มีที่ว่างแนวนอนเหลือเฟือ
 *
 * ★★ โครงใหม่: สองคอลัมน์บนจอกว้าง · ซ้อนกันบนมือถือ
 *    ★ ซ้ายคือ "เรื่องที่รอคุณอยู่" (เกมค้าง · คำท้า) — ของที่ต้องตอบ
 *    ★ ขวาคือ "เริ่มเรื่องใหม่" (เลือกคนท้า) + กระดานอันดับ
 *      ★★ เรียงตามความเร่งด่วน ไม่ใช่ตามลำดับที่เขียนโค้ด
 */
export function CheckersLobby({ onEnter }: { onEnter: (gameId: string) => void }) {
  const ot = useOt()
  const [games, setGames] = useState<OnlineGame[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [frequent, setFrequent] = useState<{ id: string; name: string; games: number }[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ games: OnlineGame[]; challenges: Challenge[] }>(
        '/api/office/games/checkers',
      )
      setGames(r.games)
      setChallenges(r.challenges)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
    /* ★ ดึงซ้ำเป็นระยะ ไม่เปิด channel ค้าง — คำท้าเข้ามานาน ๆ ครั้ง */
    timerRef.current = window.setInterval(() => void load(), 20_000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [load])

  useEffect(() => {
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((r) => setPeople(r.items))
      .catch(() => undefined)
    void apiFetch<{ opponents: { id: string; name: string; games: number }[] }>(
      '/api/office/games/checkers?opponents=1',
    )
      .then((r) => setFrequent(r.opponents ?? []))
      .catch(() => setFrequent([]))
  }, [])

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      return await apiFetch<{ gameId?: string; challengeId?: string }>(
        '/api/office/games/checkers',
        { method: 'POST', body },
      )
    } catch (e) {
      setError(officeErrorText(e, ot))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function challenge(p: { id: string; name: string }) {
    const res = await act({ action: 'challenge', to: p.id })
    if (res) setNote(ot('game.checkers.sent', { name: p.name }))
    void load()
  }

  const q = query.trim().toLowerCase()
  const shown = people.filter((p) => p.name.toLowerCase().includes(q))
  const frequentIds = new Set(frequent.map((f) => f.id))

  return (
    <div className="grid gap-6 py-2 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ══ ซ้าย · เรื่องที่รอคุณอยู่ ══════════════════════════════ */}
      <div className="flex flex-col gap-6">
        {challenges.length > 0 ? (
          <section>
            <SectionTitle count={challenges.length}>
              <Untranslated>{ot('game.checkers.invites')}</Untranslated>
            </SectionTitle>
            <ul className="grid gap-2 sm:grid-cols-2">
              {challenges.map((c) => (
                <li
                  key={c.id}
                  /* ★ คำท้าใช้สีเน้น — มันคือของที่หมดอายุได้ ต่างจากเกมค้างที่รอได้ */
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4"
                >
                  <Avatar name={c.fromName ?? ''} url={null} size={40} />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-ink">
                    <Untranslated>{ot('game.checkers.challengedYou', { name: c.fromName ?? '' })}</Untranslated>
                  </span>
                  <Button
                    variant="primary"
                    className="min-h-11 shrink-0"
                    loading={busy}
                    onClick={async () => {
                      const res = await act({ action: 'accept', challengeId: c.id })
                      if (res?.gameId) onEnter(res.gameId)
                    }}
                  >
                    <Untranslated>{ot('game.checkers.accept')}</Untranslated>
                  </Button>
                  <button
                    type="button"
                    onClick={async () => {
                      await act({ action: 'decline', challengeId: c.id })
                      void load()
                    }}
                    aria-label={ot('game.checkers.decline')}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <SectionTitle count={games.length}>
            <Untranslated>{ot('game.checkers.ongoing')}</Untranslated>
          </SectionTitle>

          {games.length === 0 ? (
            /* ★ ที่ว่างที่ตั้งใจ ดีกว่าที่ว่างที่เกิดจากไม่มีอะไรจะวาง */
            <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">
              <Untranslated>{ot('game.checkers.noGames')}</Untranslated>
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {games.map((g) => {
                const other = g.mySide === 'BOTTOM' ? g.top : g.bottom
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => onEnter(g.id)}
                      className={cn(
                        'flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-start transition-colors',
                        g.myTurn
                          ? 'border-line-strong bg-elevated hover:bg-surface'
                          : 'border-line bg-elevated/40 hover:bg-surface',
                      )}
                    >
                      <Avatar name={other.name} url={null} size={40} />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-sm font-medium text-ink">
                          {other.name}
                        </span>
                        <span className="text-xs text-ink-faint">
                          <Untranslated>
                            {g.myTurn ? ot('game.checkers.yourMove') : ot('game.checkers.theirMove')}
                          </Untranslated>
                        </span>
                      </span>
                      {/* ★ จุดแดงบอกว่าถึงตาเรา — อ่านได้จากหางตา ไม่ต้องอ่านคำ */}
                      {g.myTurn ? (
                        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-accent" />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <CheckersBoardTable />
      </div>

      {/* ══ ขวา · เริ่มเรื่องใหม่ ══════════════════════════════════ */}
      <section className="lg:sticky lg:top-4 lg:self-start">
        <SectionTitle>
          <Untranslated>{ot('game.checkers.challengeFriend')}</Untranslated>
        </SectionTitle>

        <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
          {/*
            * ★★ คนที่เล่นด้วยบ่อยอยู่บนสุดและเป็นวงใหญ่กว่า
            *    ★ คนส่วนใหญ่ท้าคนเดิมซ้ำ ๆ การให้พิมพ์ชื่อก่อนทุกครั้ง
            *      คือการให้ทำงานที่ระบบรู้คำตอบอยู่แล้ว
            */}
          {frequent.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">
                <Untranslated>{ot('game.checkers.frequent')}</Untranslated>
              </p>
              <div className="scrollbar-none -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
                {frequent.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void challenge(f)}
                    className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-xl py-1 transition-colors hover:bg-surface disabled:opacity-60"
                  >
                    <Avatar name={f.name} url={null} size={48} />
                    <span dir="auto" className="w-full truncate text-center text-[11px] text-ink-soft">
                      {f.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ot('game.checkers.searchPeople')}
              className="h-11 w-full rounded-full border border-line bg-page ps-10 pe-4 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
            />
          </div>

          {/*
            * ★★★ ตารางรูป ไม่ใช่รายการแนวตั้ง
            *     ★ ออฟฟิศ 40 คน = รายการยาว 40 แถว ซึ่งต้องเลื่อนผ่านทั้งหมด
            *       เพื่อหาคนเดียว ★★ ตารางสี่คอลัมน์เห็น 20 คนในพื้นที่เท่ากัน
            *     ★ จำกัดความสูงแล้วให้เลื่อนในกล่อง ไม่ใช่ดันหน้าให้ยาวขึ้น
            */}
          <ul className="scrollbar-none mt-3 grid max-h-[22rem] grid-cols-4 gap-1 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void challenge(p)}
                  className="flex w-full flex-col items-center gap-1 rounded-xl py-2 transition-colors hover:bg-surface disabled:opacity-60"
                >
                  <span className="relative">
                    <Avatar name={p.name} url={p.avatarUrl} size={44} />
                    {/* ★ คนที่เคยเล่นด้วยมีจุดเล็ก ๆ กำกับ — หาซ้ำได้เร็วขึ้นในตาราง */}
                    {frequentIds.has(p.id) ? (
                      <span
                        aria-hidden="true"
                        className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-elevated bg-accent"
                      />
                    ) : null}
                  </span>
                  <span dir="auto" className="w-full truncate px-1 text-center text-[11px] text-ink-soft">
                    {p.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">
              <Untranslated>{ot('common.empty')}</Untranslated>
            </p>
          ) : null}

          {note ? <p className="mt-2 text-xs text-link">{note}</p> : null}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * รูปคน
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * ★★ มีรูปใช้รูป ไม่มีรูปใช้ตัวอักษรแรกบนพื้นที่สุ่มจากชื่อ
 *    ★ ของเดิมเป็นวงเทาเหมือนกันหมดทุกคน — ซึ่งทำให้ตารางรูปอ่านไม่ออกเลย
 *      ★★ สีที่มาจากชื่อทำให้คนเดิมมีสีเดิมเสมอ ตาจึงจำตำแหน่งได้
 */
function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    )
  }

  /* ★ สุ่มจากชื่อแบบคงที่ — ชื่อเดิมได้สีเดิมทุกครั้ง ไม่ใช่สุ่มใหม่ทุก render */
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  const hue = hash % 360

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(140deg, hsl(${hue} 55% 52%), hsl(${(hue + 40) % 360} 55% 42%))`,
      }}
    >
      {name.slice(0, 1)}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * กระดานอันดับรายเดือน
 * ═══════════════════════════════════════════════════════════════════ */

export function CheckersBoardTable() {
  const ot = useOt()
  const [rows, setRows] = useState<BoardRow[]>([])

  useEffect(() => {
    void apiFetch<{ board: BoardRow[] }>('/api/office/games/checkers?board=month')
      /* ★ ?? [] — กระดานอันดับเป็นของประดับ ไม่ควรมีสิทธิ์ทำให้หน้าทั้งหน้าพัง */
      .then((r) => setRows(r.board ?? []))
      .catch(() => setRows([]))
  }, [])

  if (rows.length === 0) return null

  return (
    <section>
      <SectionTitle>
        <Untranslated>{ot('game.checkers.monthBoard')}</Untranslated>
      </SectionTitle>
      <ol className="overflow-hidden rounded-2xl border border-line bg-elevated/50 backdrop-blur-md">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={cn(
              'flex min-h-12 items-center gap-3 px-4',
              i > 0 && 'border-t border-line',
              r.me && 'bg-accent/10',
            )}
          >
            {/* ★ สามอันดับแรกมีเหรียญ — ที่เหลือเป็นตัวเลขเฉย ๆ
                   ★★ ให้เหรียญทุกคนเท่ากับไม่ให้ใครเลย */}
            <span className="w-6 shrink-0 text-center text-sm tabular-nums text-ink-faint">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
            </span>
            <Avatar name={r.name} url={null} size={28} />
            <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-ink">
              {r.name}
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <span className="font-semibold text-ink">{r.wins}</span>
              <span className="text-ink-faint"> · {r.losses} · {r.draws}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-1 px-4 text-[11px] text-ink-faint">
        <Untranslated>{ot('game.checkers.boardLegend')}</Untranslated>
      </p>
    </section>
  )
}
