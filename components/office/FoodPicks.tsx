'use client'

import Link from 'next/link'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import {
  DISTANCE_OPTIONS,
  PRICE_OPTIONS,
  distanceLabel,
  emptyFilters,
  filterRestaurants,
  type Filters,
  type Restaurant,
  type RestaurantList,
} from '@/lib/office/food'
import { AddRestaurantForm } from './AddRestaurantForm'

/** หน้าร้านเด็ด (FR-A03–A06) */
export function FoodPicks() {
  const ot = useOt()
  const [data, setData] = useState<RestaurantList>({ items: [], cuisines: [] })
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<'votes' | 'new'>('votes')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<RestaurantList>('/api/office/food/restaurants'))
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    const list = filterRestaurants(data.items, filters)
    /*
     * ★ server เรียงตามคะแนนมาแล้ว ตัวเลือก "เพิ่มล่าสุด" จึงเรียงใหม่ฝั่งนี้
     *   ★ ไม่ยิงคำขอใหม่เพื่อเปลี่ยนลำดับ — ข้อมูลชุดเดิมทั้งหมดอยู่ในมือแล้ว
     *     และร้านรอบออฟฟิศมีหลักสิบ ไม่ใช่หลักหมื่น
     *   ★ ร้านที่อาจปิดอยู่ท้ายเสมอไม่ว่าจะเรียงแบบไหน (FR-A05)
     */
    if (sort === 'new') {
      return [...list].sort((a, b) => Number(a.maybeClosed) - Number(b.maybeClosed))
    }
    return list
  }, [data.items, filters, sort])

  async function vote(id: string) {
    /* ★ สลับหน้าจอทันที แล้วค่อยรอ server — ปุ่มกดแล้วต้องตอบสนองทันที */
    setData((prev) => ({
      ...prev,
      items: prev.items.map((r) =>
        r.id === id
          ? { ...r, voted: !r.voted, voteCount: r.voteCount + (r.voted ? -1 : 1) }
          : r,
      ),
    }))
    try {
      await apiFetch(`/api/office/food/restaurants/${id}`, {
        method: 'POST',
        body: { action: 'vote' },
      })
    } catch {
      void load()
    }
  }

  async function reportClosed(id: string) {
    try {
      const res = await apiFetch<{ reports: number; threshold: number; maybeClosed: boolean }>(
        `/api/office/food/restaurants/${id}`,
        { method: 'POST', body: { action: 'reportClosed' } },
      )
      setError(null)
      alertInline(id, ot('food.picks.reported', { reports: res.reports, threshold: res.threshold }))
      if (res.maybeClosed) void load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  const [notes, setNotes] = useState<Record<string, string>>({})
  function alertInline(id: string, text: string) {
    setNotes((p) => ({ ...p, [id]: text }))
    window.setTimeout(() => setNotes((p) => ({ ...p, [id]: '' })), 4000)
  }

  async function remove(id: string) {
    if (!window.confirm(ot('confirm.deleteRestaurant'))) return
    try {
      await apiFetch(`/api/office/food/restaurants/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  async function markOpen(r: Restaurant) {
    try {
      await apiFetch(`/api/office/food/restaurants/${r.id}`, {
        method: 'PATCH',
        body: {
          name: r.name,
          signatureDish: r.signatureDish,
          cuisine: r.cuisine,
          priceRange: r.priceRange,
          distance: r.distance,
          mapUrl: r.mapUrl,
          note: r.note,
          clearClosed: true,
        },
      })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  if (adding) {
    return (
      <div className="max-w-lg py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{ot('food.picks.add')}</h2>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            {ot('common.cancel')}
          </Button>
        </div>
        <div className="mt-5 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
          <AddRestaurantForm
            onDone={() => {
              setAdding(false)
              void load()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-ink-soft">
            {ot('food.picks.count', { n: data.items.length })}
          </p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          {ot('food.picks.add')}
        </Button>
      </div>

      {/* ── ตัวกรอง (FR-A03) ─────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3">
        <Input radius="round"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder={ot('food.picks.searchPlaceholder')}
          className="max-w-sm"
        />

        <div className="flex flex-wrap gap-1.5">
          <Chip active={!filters.cuisine} onClick={() => setFilters((f) => ({ ...f, cuisine: null }))}>
            {ot('food.picks.allCuisines')}
          </Chip>
          {data.cuisines.map((c) => (
            <Chip
              key={c}
              active={filters.cuisine === c}
              onClick={() => setFilters((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))}
            >
              {c}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRICE_OPTIONS.map((p) => (
            <Chip
              key={p}
              active={filters.price === p}
              onClick={() => setFilters((f) => ({ ...f, price: f.price === p ? null : p }))}
            >
              {p}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" />
          {DISTANCE_OPTIONS.map((d) => (
            <Chip
              key={d}
              active={filters.distance === d}
              onClick={() => setFilters((f) => ({ ...f, distance: f.distance === d ? null : d }))}
            >
              {distanceLabel(ot, d)}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" />
          <Chip active={sort === 'votes'} onClick={() => setSort('votes')}>
            {ot('food.picks.sortVotes')}
          </Chip>
          <Chip active={sort === 'new'} onClick={() => setSort('new')}>
            {ot('food.picks.sortNew')}
          </Chip>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── การ์ดร้าน ────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="col-span-full py-10 text-center text-sm text-ink-faint">
            {ot('common.loading')}
          </p>
        ) : shown.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-ink-faint">
            {data.items.length === 0 ? ot('food.picks.empty') : ot('common.empty')}
          </p>
        ) : (
          shown.map((r) => (
            <Card
              key={r.id}
              r={r}
              note={notes[r.id]}
              onVote={() => void vote(r.id)}
              onReport={() => void reportClosed(r.id)}
              onRemove={() => void remove(r.id)}
              onMarkOpen={() => void markOpen(r)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function Card({
  r,
  note,
  onVote,
  onReport,
  onRemove,
  onMarkOpen,
}: {
  r: Restaurant
  note?: string
  onVote: () => void
  onReport: () => void
  onRemove: () => void
  onMarkOpen: () => void
}) {
  const ot = useOt()
  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4',
        /* ★ ร้านที่อาจปิดจางลงแต่ยังอ่านได้ — ไม่ซ่อน เพราะคนที่รู้ว่ายังเปิด
             ต้องเห็นมันเพื่อกดยืนยัน (FR-A05) */
        r.maybeClosed && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* ★ ชื่อร้านเป็นลิงก์เข้าหน้ารายละเอียด — เป็นที่ที่คนคาดว่าจะกดได้อยู่แล้ว */}
        <h2 className="font-medium">
          <Link
            href={`/office/food/picks/${r.id}`}
            dir="auto"
            className="text-ink transition-colors hover:text-link"
          >
            {r.name}
          </Link>
        </h2>
        {r.maybeClosed ? (
          <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">
            {ot('food.picks.maybeClosed')}
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 text-sm text-ink-soft">{r.signatureDish}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        {r.cuisine ? <Tag>{r.cuisine}</Tag> : null}
        {r.priceRange ? <Tag>{r.priceRange}</Tag> : null}
        {r.distance ? <Tag>{distanceLabel(ot, r.distance)}</Tag> : null}
      </div>

      {r.note ? <p className="mt-2 text-xs leading-relaxed text-ink-soft">{r.note}</p> : null}

      {r.addedByName ? (
        <p className="mt-2 text-xs text-ink-faint">
          {ot('food.picks.recommendedBy', { name: r.addedByName })}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <button
          type="button"
          onClick={onVote}
          aria-pressed={r.voted}
          className={cn(
            'h-8 rounded-full px-3 text-[13px] font-medium transition-colors',
            r.voted
              ? 'bg-accent text-accent-ink hover:bg-accent-hover'
              : 'bg-surface text-ink hover:bg-surface-hover',
          )}
        >
          {r.voted ? '♥' : '♡'} {r.voteCount}
        </button>

        {r.mapUrl ? (
          <a
            href={r.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-8 place-items-center rounded-full bg-surface px-3 text-[13px] text-ink hover:bg-surface-hover"
          >
            {ot('food.picks.openMap')}
          </a>
        ) : null}

        <div className="ms-auto flex gap-1.5">
          {r.maybeClosed ? (
            <Button size="sm" variant="secondary" onClick={onMarkOpen}>
              {ot('food.picks.stillOpen')}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onReport}>
              {ot('food.picks.reportClosed')}
            </Button>
          )}
          {r.canManage ? (
            <Button size="sm" variant="danger" onClick={onRemove}>
              {ot('common.delete')}
            </Button>
          ) : null}
        </div>
      </div>

      {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
    </article>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5">{children}</span>
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
        'h-8 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
