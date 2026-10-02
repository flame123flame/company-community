'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { playCelebrate, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'

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
    if (!window.confirm(ot('confirm.deleteCup'))) return
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
    return (
      <div className="max-w-3xl py-2">

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {list.length === 0 ? (
            <EmptyState icon={'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3'} title={ot('fun.cup.empty')} />
          ) : (
            list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void loadBracket(t.id)}
                className="flex items-center gap-3 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4 text-start transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-ink" dir="auto">{t.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    t.status === 'DONE' ? 'bg-surface text-ink-faint' : 'bg-accent/15 text-accent',
                  )}
                >
                  {t.status === 'DONE' ? ot('fun.cup.done') : ot('fun.cup.open')}
                </span>
              </button>
            ))
          )}
        </div>

        {/* ── ตารางสถิติ (FR-C09) ──────────────────────────────── */}
        <div className="mt-6 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
          <p className="text-sm font-medium text-ink">{ot('fun.stats.title')}</p>
          {stats.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.stats.empty')}</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1.5">
              {stats.map((s, i) => (
                <li key={s.userId} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-xs text-ink-faint">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                  {/* ★ แถบยาวตามอัตราชนะ — เทียบกันได้ด้วยตาโดยไม่ต้องอ่านเลข */}
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${s.skill * 100}%` }}
                    />
                  </span>
                  <span className="w-12 text-end text-xs tabular-nums text-ink-soft">
                    {Math.round(s.skill * 100)}%
                  </span>
                  <span className="w-14 text-end text-xs text-ink-faint">
                    {ot('fun.stats.matches', { n: s.matches })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    )
  }

  /* ── ผังสาย ────────────────────────────────────────────────── */
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
    <div className="rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-2">
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
