'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { playCelebrate, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'
import { FunGuide } from './FunGuide'

type CupTeam = { id: string; name: string; color: string; members: { id?: string; label: string }[] }
type Match = {
  id: string
  round: number
  slot: number
  team_a: string | null
  team_b: string | null
  winner: string | null
  score_a: number | null
  score_b: number | null
}
type Bracket = {
  id: string
  name: string
  status: 'OPEN' | 'DONE'
  canManage: boolean
  teams: CupTeam[]
  matches: Match[]
}
type ListItem = { id: string; name: string; status: 'OPEN' | 'DONE'; created_at: string }
type Stat = { userId: string; name: string; skill: number; matches: number }

/** สายการแข่งขัน + สถิติ (FR-C08 / FR-C09) */
export function FunCup() {
  const ot = useOt()
  const confirm = useConfirm()
  const [list, setList] = useState<ListItem[]>([])
  const [stats, setStats] = useState<Stat[]>([])
  const [open, setOpen] = useState<Bracket | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: ListItem[]; stats: Stat[] }>('/api/office/fun/tournaments')
      setList(d.items)
      setStats(d.stats)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  const loadBracket = useCallback(async (id: string) => {
    try {
      setOpen(await apiFetch<Bracket>(`/api/office/fun/tournaments/${id}`))
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  async function record(matchId: string, winner: string) {
    if (!open) return
    // ★ บันทึกผู้ชนะ = แก้ผลการแข่ง → ยืนยันก่อน (subject = ทีมที่ชนะ)
    if (!(await confirm({ kind: 'edit', subject: `🏆 ${open.teams.find((t) => t.id === winner)?.name ?? open.name}` }))) return
    setBusy(matchId)
    try {
      await apiFetch(`/api/office/fun/tournaments/${open.id}`, {
        method: 'POST',
        body: { matchId, winner },
      })
      await loadBracket(open.id)
      await loadList()
      playCelebrate()
      vibrate(30)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ kind: 'delete', subject: open?.name, message: ot('confirm.deleteCup') }))) return
    try {
      await apiFetch(`/api/office/fun/tournaments/${id}`, { method: 'DELETE' })
      setOpen(null)
      await loadList()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  const teamMap = useMemo(
    () => new Map((open?.teams ?? []).map((t) => [t.id, t])),
    [open?.teams],
  )

  const rounds = useMemo(() => {
    const by = new Map<number, Match[]>()
    for (const m of open?.matches ?? []) {
      if (!by.has(m.round)) by.set(m.round, [])
      by.get(m.round)!.push(m)
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0])
  }, [open?.matches])

  const champion =
    open?.status === 'DONE'
      ? teamMap.get(open.matches.find((m) => m.round === rounds.length - 1)?.winner ?? '')
      : null

  /* ── รายการทัวร์นาเมนต์ ────────────────────────────────────── */
  if (!open) {
    const live = list.filter((t) => t.status === 'OPEN')
    const past = list.filter((t) => t.status === 'DONE')
    const podium = stats.slice(0, 3)
    const rest = stats.slice(3)
    const totalMatches = stats.reduce((a, x) => a + x.matches, 0)

    return (
      <div className="py-2">
        <FunGuide id="cup" art="cup" />
        <div className="mt-6" />
        {error ? (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {/*
          * ══ แถบสรุป ══════════════════════════════════════════════
          * ★★ สามตัวเลขที่ตอบว่า "ที่นี่มีอะไรเกิดขึ้นบ้าง" ก่อนเลื่อนดูรายละเอียด
          *    ★ หน้าเดิมเปิดมาเจอรายการเปล่า ๆ ซึ่งไม่บอกว่าของพวกนี้มีคนใช้จริงไหม
          */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label={ot('fun.cup.statTours')} value={String(list.length)} />
          <Metric label={ot('fun.cup.statMatches')} value={String(Math.round(totalMatches / 2))} />
          <Metric
            label={ot('fun.cup.statTop')}
            value={podium[0]?.name ?? '—'}
            text
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* ══ ซ้าย · ทัวร์นาเมนต์ ══════════════════════════════ */}
          <div className="flex flex-col gap-6">
            {list.length === 0 ? (
              <EmptyState
                icon={'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3'}
                title={ot('fun.cup.empty')}
              />
            ) : null}

            {live.length > 0 ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-ink">{ot('fun.cup.live')}</h2>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {live.map((t) => (
                    <TourCard key={t.id} t={t} onOpen={() => void loadBracket(t.id)} />
                  ))}
                </ul>
              </section>
            ) : null}

            {past.length > 0 ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-ink">{ot('fun.cup.history')}</h2>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {past.map((t) => (
                    <TourCard key={t.id} t={t} onOpen={() => void loadBracket(t.id)} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {/* ══ ขวา · สถิติผู้เล่น ══════════════════════════════ */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <h2 className="mb-2 text-sm font-semibold text-ink">{ot('fun.stats.title')}</h2>

            {stats.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">
                {ot('fun.stats.empty')}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line bg-elevated/50 backdrop-blur-md">
                {/*
                  * ★★★ สามอันดับแรกเป็นแท่นโพเดียม ไม่ใช่แถวที่ 1-2-3 ของตาราง
                  *     ★ ตารางเรียงเท่ากันหมดทำให้ "ที่หนึ่ง" ไม่ต่างจาก "ที่แปด"
                  *       เลยนอกจากตำแหน่ง ★★ ซึ่งลบความหมายของการแข่งทิ้งไป
                  *     ★ แท่นกลางสูงกว่าสองข้าง — อ่านได้ทันทีโดยไม่ต้องดูตัวเลข
                  */}
                {podium.length > 0 ? (
                  <div className="flex items-end justify-center gap-3 bg-gradient-to-b from-accent/10 to-transparent px-4 pt-6 pb-4">
                    {[podium[1], podium[0], podium[2]].map((s, i) =>
                      s ? (
                        <div key={s.userId} className="flex min-w-0 flex-1 flex-col items-center">
                          <span className="mb-1 text-lg">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</span>
                          <span
                            dir="auto"
                            className="w-full truncate text-center text-xs font-medium text-ink"
                          >
                            {s.name}
                          </span>
                          <span className="text-[11px] tabular-nums text-ink-faint">
                            {Math.round(s.skill * 100)}%
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              'mt-1.5 w-full rounded-t-lg',
                              i === 1 ? 'h-10 bg-accent' : 'h-6 bg-accent/40',
                            )}
                          />
                        </div>
                      ) : (
                        <span key={i} className="flex-1" />
                      ),
                    )}
                  </div>
                ) : null}

                {rest.length > 0 ? (
                  <ol className="border-t border-line">
                    {rest.map((s, i) => (
                      <li
                        key={s.userId}
                        className={cn(
                          'grid min-h-11 grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_2.5rem] items-center gap-2 px-4',
                          i > 0 && 'border-t border-line',
                        )}
                      >
                        <span className="text-xs tabular-nums text-ink-faint">{i + 4}</span>
                        <span dir="auto" className="truncate text-sm text-ink">
                          {s.name}
                        </span>
                        {/* ★ แถบกับเปอร์เซ็นต์อยู่คอลัมน์เดียวกัน — ของเดิมแยกสามคอลัมน์
                               จนเลขชนขอบและคำว่า matches ตกบรรทัด */}
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                            <span
                              className="block h-full rounded-full bg-accent transition-all"
                              style={{ width: `${Math.round(s.skill * 100)}%` }}
                            />
                          </span>
                        </span>
                        <span className="text-end text-xs tabular-nums text-ink-soft">
                          {Math.round(s.skill * 100)}%
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="relative py-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => setOpen(null)}>
          ‹ {ot('fun.cup.back')}
        </Button>
        <h2 className="text-xl font-bold text-ink">{open.name}</h2>
        {open.canManage ? (
          <Button size="sm" variant="danger" className="ms-auto" onClick={() => void remove(open.id)}>
            {ot('common.delete')}
          </Button>
        ) : null}
      </div>

      {champion ? (
        <div className="mt-4 rounded-2xl border-2 p-4 text-center" style={{ borderColor: champion.color }}>
          <p className="text-xs text-ink-soft">👑 {ot('fun.cup.champion')}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{champion.name}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {champion.members.map((m) => m.label).join(' · ')}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/*
        ★ ผังเรียงเป็นคอลัมน์ต่อรอบ เลื่อนแนวนอนได้บนจอแคบ
          ★ ไม่พยายามวาดเส้นเชื่อมระหว่างคู่ — เส้นที่วาดด้วย CSS จะเพี้ยน
            ทันทีที่ความสูงของการ์ดไม่เท่ากัน ซึ่งเกิดตลอดเพราะชื่อทีมยาวไม่เท่ากัน
      */}
      <div className="mt-5 flex gap-4 overflow-x-auto pb-4">
        {rounds.map(([round, matches]) => (
          <div key={round} className="flex min-w-56 flex-col gap-3">
            <p className="text-xs font-medium text-ink-soft">
              {round === rounds.length - 1
                ? ot('fun.cup.final')
                : round === rounds.length - 2
                  ? ot('fun.cup.semi')
                  : ot('fun.cup.round', { n: round + 1 })}
            </p>

            {matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                teams={teamMap}
                canManage={open.canManage}
                busy={busy === m.id}
                onPick={(w) => void record(m.id, w)}
              />
            ))}
          </div>
        ))}
      </div>

      {champion ? <Confetti /> : null}
    </div>
  )
}

function MatchCard({
  match,
  teams,
  canManage,
  busy,
  onPick,
}: {
  match: Match
  teams: Map<string, CupTeam>
  canManage: boolean
  busy: boolean
  onPick: (winner: string) => void
}) {
  const ot = useOt()
  const a = match.team_a ? teams.get(match.team_a) : null
  const b = match.team_b ? teams.get(match.team_b) : null
  const ready = Boolean(a && b) && !match.winner

  return (
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-2">
      {[a, b].map((t, i) => {
        const isWinner = t && match.winner === t.id
        return (
          <button
            key={i}
            type="button"
            disabled={!canManage || !ready || busy}
            onClick={() => t && onPick(t.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-sm',
              'transition-colors disabled:cursor-default',
              isWinner ? 'bg-surface font-medium text-ink' : 'text-ink-soft',
              ready && canManage && 'hover:bg-surface',
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: t?.color ?? 'transparent' }}
            />
            <span className="min-w-0 flex-1 truncate">
              {t?.name ?? (
                <span className="text-ink-faint">{ot('fun.cup.waiting')}</span>
              )}
            </span>
            {isWinner ? <span className="text-xs text-accent">✓</span> : null}
          </button>
        )
      })}

      {/* ★ บอกให้ชัดว่าคู่นี้เป็นไบ ไม่ใช่การแข่งที่ยังไม่เล่น */}
      {match.winner && !(a && b) ? (
        <p className="px-2 pt-1 text-[11px] text-ink-faint">{ot('fun.cup.bye')}</p>
      ) : null}
      {ready && canManage ? (
        <p className="px-2 pt-1 text-[11px] text-ink-faint">{ot('fun.cup.pickWinner')}</p>
      ) : null}
    </div>
  )
}


/** ตัวเลขสรุปหนึ่งช่อง */
function Metric({ label, value, text }: { label: string; value: string; text?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        dir="auto"
        className={cn(
          'mt-0.5 font-bold text-ink',
          /* ★ ชื่อคนยาวกว่าตัวเลขมาก — ใช้ขนาดเล็กลงและตัดท้ายแทนที่จะล้นกล่อง */
          text ? 'truncate text-lg' : 'text-2xl tabular-nums',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** การ์ดทัวร์นาเมนต์หนึ่งใบ */
function TourCard({ t, onOpen }: { t: ListItem; onOpen: () => void }) {
  const ot = useOt()
  const done = t.status === 'DONE'
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group flex min-h-20 w-full items-center gap-3 rounded-2xl border p-4 text-start transition-all',
          done
            ? 'border-line bg-elevated/40 hover:bg-surface'
            : 'border-accent/40 bg-accent/10 hover:border-accent hover:bg-accent/15',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl text-lg transition-transform group-hover:scale-110',
            done ? 'bg-surface' : 'bg-accent text-accent-ink',
          )}
        >
          🏆
        </span>
        <span className="min-w-0 flex-1">
          {/* ★ สองบรรทัดแทนการตัดท้าย — ชื่อทัวร์นาเมนต์ภาษาไทยยาวกว่าช่อง
                 ที่การ์ดในตารางสองคอลัมน์มีให้ ★★ "ศึกชิงเจ้าโต๊ะปิ…" ไม่บอก
                 อะไรเลยว่าเป็นทัวร์ของอะไร */}
          <span dir="auto" className="line-clamp-2 font-medium leading-snug text-ink">
            {t.name}
          </span>
          <span className="text-xs text-ink-faint">
            {new Date(t.created_at).toLocaleDateString()}
          </span>
        </span>
        {/* ★ สถานะเป็นจุดสี ไม่ใช่ป้ายคำ — การ์ดสีต่างกันบอกไปแล้วครึ่งหนึ่ง */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px]',
            done ? 'bg-surface text-ink-faint' : 'bg-accent text-accent-ink',
          )}
        >
          {done ? ot('fun.cup.done') : ot('fun.cup.open')}
        </span>
      </button>
    </li>
  )
}
