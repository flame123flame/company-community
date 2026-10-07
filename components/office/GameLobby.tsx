'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { SectionTitle } from './CheckersIntro'
import { PersonAvatar } from './PersonAvatar'

/** เกมที่ท้าเพื่อนได้ — ชื่อตรงกับโฟลเดอร์ใต้ /api/office/games */
export type OnlineGameKey = 'checkers' | 'connect4'

type Person = { id: string; name: string; avatarUrl: string | null }
type Challenge = { id: string; fromId: string; fromName: string | null; expiresAt: string }
type BoardRow = { id: string; name: string; wins: number; losses: number; draws: number; me: boolean }

/**
 * ★★★ รูปเกมค้างที่หน้านี้ต้องรู้ — แค่สามอย่าง
 *
 *     ★ ไม่รู้เรื่องกระดาน ไม่รู้เรื่องฝั่ง ไม่รู้ว่าเกมอะไร
 *       ★★ route ของแต่ละเกมคำนวณ "คู่ต่อสู้คือใคร" มาให้แล้ว เพราะมันรู้
 *          ว่าตัวเองเรียกฝั่งว่า bottom/top หรือ red/gold
 *       ★ ถ้าหน้านี้มาเดาเอง มันจะต้องรู้ชื่อคอลัมน์ของทุกเกม
 *         แล้วการเพิ่มเกมที่สามจะต้องกลับมาแก้ที่นี่ทุกครั้ง
 */
export type LobbyGame = {
  id: string
  myTurn: boolean
  opponent: { id: string; name: string }
}

/**
 * หน้าท้าเพื่อน — ใช้ร่วมกันทุกเกมที่เล่นออนไลน์ได้
 *
 * ★★★ เดิมเป็น CheckersLobby ที่ผูกกับหมากฮอสทุกบรรทัด
 *
 *     ★ ตอนทำเรียง 4 ออนไลน์ ทางเลือกคือก๊อปทั้งไฟล์ 400 บรรทัด
 *       หรือทำให้รับชื่อเกมเป็นพารามิเตอร์
 *       ★★ ก๊อปแล้วทุกการปรับหน้าตาต้องทำสองที่ตลอดไป และวันหนึ่ง
 *          จะมีที่ที่ลืม — ซึ่งผู้ใช้เห็นเป็น "สองหน้าที่ควรเหมือนกันแต่ไม่เหมือน"
 *
 * ★★ โครง: สองคอลัมน์บนจอกว้าง · ซ้อนกันบนมือถือ
 *    ★ ซ้ายคือ "เรื่องที่รอคุณอยู่" (คำท้า · เกมค้าง) — ของที่ต้องตอบ
 *    ★ ขวาคือ "เริ่มเรื่องใหม่" (เลือกคนท้า) + กระดานอันดับ
 *      ★★ เรียงตามความเร่งด่วน ไม่ใช่ตามลำดับที่เขียนโค้ด
 */
export function GameLobby({
  game,
  onEnter,
}: {
  game: OnlineGameKey
  onEnter: (gameId: string) => void
}) {
  const ot = useOt()
  const api = `/api/office/games/${game}`
  const [games, setGames] = useState<LobbyGame[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [frequent, setFrequent] = useState<{ id: string; name: string; games: number }[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  /*
   * ★★ จำ id ของคำท้าที่ "เราเป็นคนส่ง" ในรอบนี้
   *    ★ ใช้ตัดสินว่าควรพาเข้าเกมอัตโนมัติตอนอีกฝ่ายกดรับ
   *      ★★ พาเข้าทุกครั้งที่มีคำท้าของเราถูกรับ จะดึงคนที่กำลังไล่ดู
   *         รายการอื่นออกจากหน้าโดยไม่ได้ขอ — ต้องเป็นใบที่เขาเพิ่งกดส่งเอง
   */
  const sentRef = useRef<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ meId: string; games: LobbyGame[]; challenges: Challenge[] }>(api)
      setGames(r.games)
      setChallenges(r.challenges)
      setMeId(r.meId)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [api])

  useEffect(() => {
    void load()
    /*
     * ★★ ยังดึงซ้ำเป็นระยะ แต่ตอนนี้มันเป็น "ตัวสำรอง" ไม่ใช่ตัวหลัก
     *    ★ ตัวหลักคือ Realtime ข้างล่าง ★★ Realtime หลุดได้ (เน็ตสะดุด ·
     *      เครื่องหลับ · channel ถูกตัด) และไม่มีทางรู้ว่าหลุดไปตอนไหน
     *      ★ รอบดึงทุก 30 วินาทีจึงยังจำเป็น เพื่อให้หน้าจอกลับมาตรงเอง
     *        โดยที่ผู้ใช้ไม่ต้องรีโหลด
     *    ★ ยืดจาก 20 เป็น 30 วินาที — ของหลักเร็วแล้ว ตัวสำรองไม่ต้องถี่
     */
    timerRef.current = window.setInterval(() => void load(), 30_000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [load])

  /*
   * ── คำท้าเข้ามาแล้วเห็นทันที ──────────────────────────────────
   *
   * ★★★ ของเดิมรู้ตัวช้าได้ถึง 20 วินาที เพราะมีแต่รอบดึงข้อมูล
   *
   *     ★ สถานการณ์จริงคือสองคนนั่งคุยกันแล้วคนหนึ่งกดท้า อีกคนจ้องจออยู่
   *       ★★ ยี่สิบวินาทีในจังหวะนั้นอ่านได้อย่างเดียวว่า "มันพัง"
   *
   * ★★ ฟังสองทิศ เพราะสองทิศคือสองเรื่องที่ต่างกัน
   *    ★ to_id = เรา → มีคนท้าเรา (หรือถอน/หมดอายุ) → โหลดรายการใหม่
   *    ★ from_id = เรา → คำท้าที่เราส่งถูกรับแล้ว → พาเข้าเกมได้เลย
   *      ★★ ไม่ฟังทิศนี้ คนที่ท้าจะนั่งมองหน้าว่าง ๆ รอรอบดึงถัดไป
   *         ทั้งที่อีกฝ่ายเข้าเกมไปแล้ว
   *
   * ★ filter ของ postgres_changes รับได้คอลัมน์เดียวต่อหนึ่ง .on()
   *   ★★ จึงต้องแยกเป็นสองตัว ไม่ใช่ or ในตัวเดียว
   */
  useEffect(() => {
    if (!meId) return
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`challenges:${game}:${meId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_challenges', filter: `to_id=eq.${meId}` },
        () => {
          void load()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_challenges', filter: `from_id=eq.${meId}` },
        (payload) => {
          const row = payload.new as { id?: string; game?: string; status?: string; game_id?: string | null }
          if (row.game === game && row.status === 'ACCEPTED' && row.game_id && row.id && sentRef.current.has(row.id)) {
            sentRef.current.delete(row.id)
            onEnter(row.game_id)
            return
          }
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [game, meId, load, onEnter])

  /*
   * ── เกมที่ค้างอยู่ก็ต้องสด ────────────────────────────────────
   *
   * ★★ "ถึงตาใคร" ในรายการต้องเปลี่ยนเองตอนอีกฝ่ายเดิน
   *    ★ ไม่งั้นคนที่อยู่หน้าลอบบี้จะเห็นว่ายังไม่ถึงตาตัวเองอยู่นาทีกว่า
   *      ทั้งที่อีกฝ่ายเดินไปแล้ว ★★ ซึ่งเป็นเหตุผลเดียวที่คนเปิดหน้านี้ค้างไว้
   *
   * ★ ไม่ใส่ filter — Realtime กรองต่อแถวได้คอลัมน์เดียว และเกมของเรา
   *   อยู่ได้ทั้งสองฝั่ง ★★ RLS จึงเป็นตัวกรองจริง: policy ปล่อยเฉพาะเกม
   *   ที่เราเป็นผู้เล่น แถวของคนอื่นไม่ถูกส่งมาแต่แรก
   */
  useEffect(() => {
    if (!meId) return
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`lobby:${game}:${meId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: `${game}_games` },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [game, meId, load])

  useEffect(() => {
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((r) => setPeople(r.items))
      .catch(() => undefined)
    void apiFetch<{ opponents: { id: string; name: string; games: number }[] }>(`${api}?opponents=1`)
      .then((r) => setFrequent(r.opponents ?? []))
      .catch(() => setFrequent([]))
  }, [api])

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      return await apiFetch<{ gameId?: string; challengeId?: string }>(api, { method: 'POST', body })
    } catch (e) {
      setError(officeErrorText(e, ot))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function challenge(p: { id: string; name: string }) {
    const res = await act({ action: 'challenge', to: p.id })
    if (res) {
      /* ★ จำใบที่เพิ่งส่ง — พอฝั่งนั้นกดรับ Realtime จะพาเราเข้าเกมเอง */
      if (res.challengeId) sentRef.current.add(res.challengeId)
      setNote(ot('game.online.sent', { name: p.name }))
    }
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
              <Untranslated>{ot('game.online.invites')}</Untranslated>
            </SectionTitle>
            <ul className="grid gap-2 sm:grid-cols-2">
              {challenges.map((c) => (
                <li
                  key={c.id}
                  /* ★ คำท้าใช้สีเน้น — มันคือของที่หมดอายุได้ ต่างจากเกมค้างที่รอได้ */
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4"
                >
                  <PersonAvatar name={c.fromName ?? ''} url={null} size={40} />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-ink">
                    <Untranslated>{ot('game.online.challengedYou', { name: c.fromName ?? '' })}</Untranslated>
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
                    <Untranslated>{ot('game.online.accept')}</Untranslated>
                  </Button>
                  <button
                    type="button"
                    onClick={async () => {
                      await act({ action: 'decline', challengeId: c.id })
                      void load()
                    }}
                    aria-label={ot('game.online.decline')}
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
            <Untranslated>{ot('game.online.ongoing')}</Untranslated>
          </SectionTitle>

          {games.length === 0 ? (
            /* ★ ที่ว่างที่ตั้งใจ ดีกว่าที่ว่างที่เกิดจากไม่มีอะไรจะวาง */
            <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">
              <Untranslated>{ot('game.online.noGames')}</Untranslated>
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {games.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onEnter(g.id)}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-start transition-colors',
                      g.myTurn
                        /* ★ ถึงตาเรา = กรอบสีเน้นเต็มใบ ไม่ใช่แค่เส้นเข้มขึ้น */
                        ? 'border-accent/50 bg-accent/10 hover:bg-accent/15'
                        : 'border-line bg-elevated/40 hover:bg-surface',
                    )}
                  >
                    <PersonAvatar name={g.opponent.name} url={null} size={40} />
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-sm font-medium text-ink">
                        {g.opponent.name}
                      </span>
                      {!g.myTurn ? (
                        <span className="text-xs text-ink-faint">
                          <Untranslated>{ot('game.online.theirMove')}</Untranslated>
                        </span>
                      ) : null}
                    </span>
                    {/*
                      * ★★★ ของเดิมเป็นจุดกลม 10px ที่ไม่มีคำกำกับ
                      *
                      *     ★ ผมเขียนไว้ว่า "อ่านได้จากหางตา ไม่ต้องอ่านคำ"
                      *       ★★ แต่จุดเปล่า ๆ ไม่ได้บอกว่ามันหมายถึงอะไร
                      *          คนที่เพิ่งเห็นครั้งแรกต้องเดา — และเดาผิดก็ได้
                      *          ว่ามันคือ "ออนไลน์อยู่" หรือ "ยังไม่ได้อ่าน"
                      *     ★ ป้ายที่มีคำเด่นกว่า และไม่ต้องให้ใครเดา
                      */}
                    {g.myTurn ? (
                      <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink">
                        <Untranslated>{ot('game.online.yourMove')}</Untranslated>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <GameBoardTable game={game} />
      </div>

      {/* ══ ขวา · เริ่มเรื่องใหม่ ══════════════════════════════════ */}
      <section className="lg:sticky lg:top-4 lg:self-start">
        <SectionTitle>
          <Untranslated>{ot('game.online.challengeFriend')}</Untranslated>
        </SectionTitle>

        <div className="rounded-2xl border border-line bg-elevated/50 p-4 backdrop-blur-md">
          {/*
            * ★★ คนที่เล่นด้วยบ่อยอยู่บนสุดและเป็นวงใหญ่กว่า
            *    ★ คนส่วนใหญ่ท้าคนเดิมซ้ำ ๆ การให้พิมพ์ชื่อก่อนทุกครั้ง
            *      คือการให้ทำงานที่ระบบรู้คำตอบอยู่แล้ว
            */}
          {frequent.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">
                <Untranslated>{ot('game.online.frequent')}</Untranslated>
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
                    <PersonAvatar name={f.name} url={null} size={48} />
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
              placeholder={ot('game.online.searchPeople')}
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
                    <PersonAvatar name={p.name} url={p.avatarUrl} size={44} />
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
 * กระดานอันดับรายเดือน
 * ═══════════════════════════════════════════════════════════════════ */

export function GameBoardTable({ game }: { game: OnlineGameKey }) {
  const ot = useOt()
  const [rows, setRows] = useState<BoardRow[]>([])

  useEffect(() => {
    void apiFetch<{ board: BoardRow[] }>(`/api/office/games/${game}?board=month`)
      /* ★ ?? [] — กระดานอันดับเป็นของประดับ ไม่ควรมีสิทธิ์ทำให้หน้าทั้งหน้าพัง */
      .then((r) => setRows(r.board ?? []))
      .catch(() => setRows([]))
  }, [game])

  if (rows.length === 0) return null

  return (
    <section>
      <SectionTitle>
        <Untranslated>{ot('game.online.monthBoard')}</Untranslated>
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
            <PersonAvatar name={r.name} url={null} size={28} />
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
        <Untranslated>{ot('game.online.boardLegend')}</Untranslated>
      </p>
    </section>
  )
}
