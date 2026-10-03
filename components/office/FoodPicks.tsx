'use client'

import Link from 'next/link'
import Image from 'next/image'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
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
import { distanceParts, isOpenNow } from '@/lib/office/geo'
import { cuisineStyle } from '@/lib/office/cuisine'
import { Section } from '@/components/ui/Section'
import { ShopPhotos } from './ShopPhotos'
import { AddRestaurantForm } from './AddRestaurantForm'
import { FilterSheet, FilterGroup, FilterChip } from './FilterSheet'

export type PicksSort = 'new' | 'votes' | 'rating' | 'near'

/** หน้าร้านเด็ด (FR-A03–A06) */
export function FoodPicks() {
  const ot = useOt()
  const [data, setData] = useState<RestaurantList>({ items: [], cuisines: [] })
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  /*
   * ★ เริ่มต้นที่ "เพิ่มล่าสุด" ไม่ใช่ "คะแนนสูงสุด"
   *   ★★ เรียงตามคะแนนทำให้หน้าแรกเป็นร้านชุดเดิมทุกวัน — ร้านที่เพิ่งถูกเพิ่ม
   *      ต้องสะสมคะแนนก่อนถึงจะมีคนเห็น ซึ่งมันจะไม่มีวันได้คะแนนถ้าไม่มีใครเห็น
   */
  const [sort, setSort] = useState<PicksSort>('new')
  const [filterOpen, setFilterOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /*
   * ★★ แบ่งหน้าฝั่งนี้ จากรายการที่กรอง+เรียงเสร็จแล้ว
   *    ★ ร้านรอบออฟฟิศมีหลักสิบ การขอใหม่ทุกครั้งที่เปลี่ยนหน้าคือการรอเน็ต
   *      โดยไม่ได้อะไร ★★ server รองรับ page/per_page ไว้แล้วสำหรับวันที่
   *      ข้อมูลโตจนทำแบบนี้ไม่ไหว — วันนั้นหน้าจอไม่ต้องเปลี่ยนอะไรเลย
   */
  const [page, setPage] = useState(0)

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
     * ★ เรียงฝั่งนี้ทั้งหมด ไม่ยิงคำขอใหม่เพื่อเปลี่ยนลำดับ — ข้อมูลชุดเดิม
     *   อยู่ในมือแล้ว และร้านรอบออฟฟิศมีหลักสิบ ไม่ใช่หลักหมื่น
     *
     * ★★ ร้านที่อาจปิดอยู่ท้ายเสมอไม่ว่าจะเรียงแบบไหน (FR-A05)
     *    จึงเป็นกุญแจแรกของการเปรียบเทียบทุกแบบ ไม่ใช่เขียนซ้ำในแต่ละสาขา
     */
    return [...list].sort(
      (a, b) =>
        Number(a.maybeClosed) - Number(b.maybeClosed) ||
        (sort === 'new'
          ? /* ★ เทียบเวลาเป็นตัวเลข ไม่ใช่เทียบข้อความ ISO
               ★★ ข้อความ ISO เทียบกันได้ก็จริง แต่เฉพาะเมื่อ timezone
                  เหมือนกันทุกแถว ซึ่งไม่มีอะไรรับประกัน */
            Date.parse(b.createdAt) - Date.parse(a.createdAt)
          : sort === 'rating'
            ? /*
               * ★★ ร้านที่ยังไม่มีรีวิวไปท้ายเสมอ ไม่ใช่ถือว่าได้ 0 ดาว
               *    ★ "ยังไม่มีใครรีวิว" กับ "รีวิวแล้วได้คะแนนแย่"
               *      เป็นคนละเรื่อง การนับเป็น 0 ลงโทษร้านใหม่ด้วยความเงียบ
               */
              (b.rating ?? -1) - (a.rating ?? -1) ||
              b.ratingCount - a.ratingCount ||
              Date.parse(b.createdAt) - Date.parse(a.createdAt)
            : sort === 'near'
              ? /* ★ ร้านที่ไม่มีระยะทางไปท้ายเสมอ — Infinity ทำให้ไม่ต้องเขียนเงื่อนไขแยก */
                (a.travelMeters ?? Infinity) - (b.travelMeters ?? Infinity) ||
                Date.parse(b.createdAt) - Date.parse(a.createdAt)
              : b.voteCount - a.voteCount || Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    )
  }, [data.items, filters, sort])

  /** ตัวกรองที่เลือกอยู่กี่อย่าง — ตัวเลขบนปุ่ม "ตัวกรอง (n)" */
  const filterCount =
    (filters.price ? 1 : 0) + (filters.distance ? 1 : 0) + (sort === 'new' ? 0 : 1)

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
        <div className="mt-5 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5">
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

  /* ★ เปลี่ยนตัวกรองหรือการเรียงแล้วต้องกลับหน้าแรก
       ★★ ไม่งั้นผลลัพธ์ 4 ร้านที่ดูอยู่หน้า 3 จะกลายเป็นหน้าว่าง */
  useEffect(() => {
    setPage(0)
  }, [filters.query, filters.cuisine, filters.price, filters.distance, sort])

  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = shown.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  return (
    <div className="w-full pb-10">
      {/*
        * ══ 1 · ค้นหาและกรอง ═══════════════════════════════════
        *
        * ★★★ ของเดิมเป็นแถวลอย ๆ สามแถวที่ไม่มีหัวข้อ
        *     ★ ช่องค้นหา · ชิปประเภท · ปุ่มตัวกรอง — ทั้งสามอ่านเป็นของ
        *       คนละชุดที่บังเอิญอยู่ติดกัน
        *       ★★ ตอนนี้อยู่ในเซกชันเดียวที่มีชื่อ และหุบได้เมื่อเลือกเสร็จแล้ว
        */}
      <Section
        collapsible
        /* ★ ชื่อเซกชันต้องไม่ซ้ำกับปุ่ม "ตัวกรอง" ที่อยู่ข้างใน
             ★★ ซ้ำแล้วทั้งคนและสคริปต์ทดสอบแยกไม่ออกว่าจะกดอันไหน —
                สคริปต์กดหัวเซกชันแล้วรอแผ่นตัวกรองที่ไม่มีวันเปิด */
        title={<Untranslated>{ot('food.picks.findTitle')}</Untranslated>}
        hint={<Untranslated>{ot('food.picks.count', { n: data.items.length })}</Untranslated>}
        badge={
          filterCount > 0 ? (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent">
              {filterCount}
            </span>
          ) : undefined
        }
        summary={
          [
            filters.query,
            filters.cuisine,
            filters.price,
            filters.distance ? distanceLabel(ot, filters.distance) : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        action={
          <Button variant="primary" className="min-h-11 shrink-0" onClick={() => setAdding(true)}>
            <Untranslated>{ot('food.picks.add')}</Untranslated>
          </Button>
        }
      >
        <Input
          radius="round"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder={ot('food.picks.searchPlaceholder')}
        />

        {/*
          * ★★ ประเภทอาหารเป็นชิปที่มีไอคอนประจำประเภท ไม่ใช่ตัวหนังสือล้วน
          *    ★ ชุดเดียวกับการ์ดร้าน — คนเห็นไอคอนชามเส้นบนชิป แล้วเจอ
          *      ไอคอนเดียวกันบนการ์ดที่กรองออกมา จึงรู้ว่ากรองทำงานจริง
          */}
        <div className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!filters.cuisine} onClick={() => setFilters((f) => ({ ...f, cuisine: null }))}>
            {ot('food.picks.allCuisines')}
          </Chip>
          {data.cuisines.map((c) => {
            const style = cuisineStyle(c, c)
            return (
              <Chip
                key={c}
                active={filters.cuisine === c}
                onClick={() => setFilters((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))}
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3.5"
                    style={{ color: `rgb(${style.tint})` }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={style.icon} />
                  </svg>
                  <span dir="auto">{c}</span>
                </span>
              </Chip>
            )
          })}
        </div>

        {/* ── ราคา · การเดินทาง · การเรียง ───────────────────── */}
        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors',
              filterCount > 0
                ? 'border-ink bg-ink text-page'
                : 'border-line bg-surface text-ink hover:bg-surface-hover',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            {filterCount > 0
              ? ot('food.filter.withCount', { n: filterCount })
              : ot('food.filter.title')}
          </button>

          <FilterSheet
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            title={ot('food.filter.title')}
            count={filterCount}
            onClear={() => {
              setFilters((f) => ({ ...f, price: null, distance: null }))
              setSort('new')
            }}
          >
            <FilterGroup label={ot('food.filter.price')}>
              {PRICE_OPTIONS.map((p) => (
                <FilterChip
                  key={p}
                  active={filters.price === p}
                  onClick={() => setFilters((f) => ({ ...f, price: f.price === p ? null : p }))}
                >
                  {p}
                </FilterChip>
              ))}
            </FilterGroup>

            <FilterGroup label={ot('food.filter.distance')}>
              {DISTANCE_OPTIONS.map((d) => (
                <FilterChip
                  key={d}
                  active={filters.distance === d}
                  onClick={() => setFilters((f) => ({ ...f, distance: f.distance === d ? null : d }))}
                >
                  {distanceLabel(ot, d)}
                </FilterChip>
              ))}
            </FilterGroup>

            <FilterGroup label={ot('food.filter.sort')}>
              <FilterChip active={sort === 'new'} onClick={() => setSort('new')}>
                {ot('food.picks.sortNew')}
              </FilterChip>
              <FilterChip active={sort === 'votes'} onClick={() => setSort('votes')}>
                {ot('food.picks.sortVotes')}
              </FilterChip>
              <FilterChip active={sort === 'rating'} onClick={() => setSort('rating')}>
                {ot('food.picks.sortRating')}
              </FilterChip>
              {/* ★ ตัวเลือกนี้โผล่เฉพาะเมื่อมีร้านที่คิดระยะทางได้จริงอย่างน้อยหนึ่งร้าน
                     ★★ ตัวเลือกที่กดแล้วลำดับไม่ขยับ คือตัวเลือกที่ทำให้คนไม่เชื่อ
                        ตัวกรองทั้งกล่อง */}
              {data.items.some((x) => x.travelMeters != null) ? (
                <FilterChip active={sort === 'near'} onClick={() => setSort('near')}>
                  {ot('food.picks.sortNear')}
                </FilterChip>
              ) : null}
            </FilterGroup>
          </FilterSheet>
        </div>
      </Section>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ══ 2 · รายการร้าน ═══════════════════════════════════════ */}
      <Section
        title={<Untranslated>{ot('food.picks.listTitle')}</Untranslated>}
        badge={
          shown.length > 0 ? (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal tabular-nums text-ink-soft">
              {ot('food.picks.count', { n: shown.length })}
            </span>
          ) : undefined
        }
      >
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <p className="col-span-full py-10 text-center text-sm text-ink-faint">
              {ot('common.loading')}
            </p>
          ) : pageRows.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-ink-faint">
              {data.items.length === 0 ? ot('food.picks.empty') : ot('common.empty')}
            </p>
          ) : (
            pageRows.map((r) => (
              <Card
                key={r.id}
                r={r}
                note={notes[r.id]}
                onVote={() => void vote(r.id)}
                onReport={() => void reportClosed(r.id)}
                onRemove={() => void remove(r.id)}
                onMarkOpen={() => void markOpen(r)}
                onPhotos={() => void load()}
              />
            ))
          )}
        </div>

        {/*
          * ── แบ่งหน้า ───────────────────────────────────────
          * ★★ กดเลขหน้าได้ ไม่ใช่มีแค่ก่อนหน้า/ถัดไป
          *    ★ คนที่อยู่หน้า 1 แล้วอยากดูหน้า 4 ต้องกดสามครั้ง
          *      ★★ และไม่มีทางรู้ว่ามีกี่หน้าจนกว่าจะกดไปจนสุด
          */}
        {pageCount > 1 ? (
          <nav
            aria-label={ot('food.picks.listTitle')}
            className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
          >
            <PageArrow
              dir="prev"
              label={ot('wallet.owed.pagePrev')}
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            />
            {pageNumbers(safePage, pageCount).map((n, i) =>
              n === null ? (
                <span key={`gap${i}`} className="px-1 text-ink-faint">
                  ·
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-current={n === safePage ? 'page' : undefined}
                  className={cn(
                    'grid size-11 place-items-center rounded-full text-[13px] tabular-nums transition-colors',
                    n === safePage
                      ? 'bg-ink font-semibold text-page'
                      : 'text-ink-soft hover:bg-surface hover:text-ink',
                  )}
                >
                  {n + 1}
                </button>
              ),
            )}
            <PageArrow
              dir="next"
              label={ot('wallet.owed.pageNext')}
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            />
          </nav>
        ) : null}
      </Section>
    </div>
  )
}

/** ร้านต่อหน้า */
const PER_PAGE = 9

/**
 * เลขหน้าที่จะวาด
 *
 * ★★ ไม่วาดทุกหน้าเมื่อมีเยอะ — 1 · 2 3 [4] 5 6 · 20
 *    ★ ยี่สิบปุ่มเรียงกันกินทั้งบรรทัดบนมือถือ แล้วปุ่มที่ต้องกดจริง
 *      (ก่อนหน้า/ถัดไป) ถูกดันหลุดจอ
 */
function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const out: (number | null)[] = [0]
  const from = Math.max(1, current - 1)
  const to = Math.min(total - 2, current + 1)
  if (from > 1) out.push(null)
  for (let i = from; i <= to; i++) out.push(i)
  if (to < total - 2) out.push(null)
  out.push(total - 1)
  return out
}

function PageArrow({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'grid size-11 place-items-center rounded-full transition-colors',
        disabled ? 'cursor-not-allowed text-ink-faint/35' : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
}

function Card({
  r,
  note,
  onVote,
  onReport,
  onRemove,
  onMarkOpen,
  onPhotos,
}: {
  r: Restaurant
  note?: string
  onVote: () => void
  onReport: () => void
  onRemove: () => void
  onMarkOpen: () => void
  onPhotos: () => void
}) {
  const ot = useOt()
  const [menuOpen, setMenuOpen] = useState(false)
  /*
   * ★★ คำนวณหลัง mount ไม่ใช่ตอน render รอบแรก
   *    ★ มันขึ้นกับ "เวลาตอนนี้" ซึ่ง server กับเบราว์เซอร์ไม่มีทางตรงกัน
   *      ★★ คำนวณตอน render = hydration mismatch ที่โผล่เฉพาะตอนที่
   *         เวลาคาบเกี่ยวพอดี ซึ่งหายากที่สุดเวลาไล่บั๊ก
   */
  const [openNow, setOpenNow] = useState<boolean | null>(null)
  useEffect(() => {
    setOpenNow(isOpenNow(r.openHours, new Date()))
  }, [r.openHours])

  /* ★ ไอคอนและสีประจำประเภท — โมดูลเดียวกับหน้าสร้างบิล */
  const style = cuisineStyle(r.name, r.cuisine)
  /* ★★ ระยะทางเป็นตัวเลข+หน่วย ไม่ใช่สตริงไทยสำเร็จรูป (ดู lib/office/geo.ts) */
  const dist = distanceParts(r.travelMeters)

  /* ★ คลิกที่อื่นแล้วเมนูต้องปิด — เมนูที่ค้างอยู่หลังเลื่อนหน้าไปแล้วคือขยะบนจอ */
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    /* ★ ใส่ทีหลังหนึ่งรอบ event loop ไม่งั้นคลิกที่เปิดเมนูจะปิดมันทันที */
    const id = window.setTimeout(() => document.addEventListener('click', close), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('click', close)
    }
  }, [menuOpen])

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4',
        /* ★ ร้านที่อาจปิดจางลงแต่ยังอ่านได้ — ไม่ซ่อน เพราะคนที่รู้ว่ายังเปิด
             ต้องเห็นมันเพื่อกดยืนยัน (FR-A05) */
        r.maybeClosed && 'opacity-60',
      )}
    >
      {/*
        * ── รูปปก ──────────────────────────────────────────────────
        * ★ มาจากรูปล่าสุดในรีวิว ไม่ใช่ช่องอัปโหลดแยก
        *   ★★ ช่องอัปโหลดแยกแปลว่ามีคนต้องรับหน้าที่หารูปมาใส่ ซึ่งไม่มีใครทำ
        *      ส่วนรูปจากรีวิวเกิดขึ้นเองทุกครั้งที่มีคนไปกินแล้วถ่ายรูป
        */}
      <div className="relative -mx-4 -mt-4 mb-3 overflow-hidden rounded-t-2xl">
        {r.coverUrl ? (
          <div className="relative aspect-video">
            <Image src={r.coverUrl} alt="" fill sizes="(max-width:640px) 100vw, 360px" className="object-cover" unoptimized />
          </div>
        ) : (
          /*
           * ★ ไม่มีรูป = แผ่นสีประจำประเภทพร้อมไอคอน ไม่ใช่กล่องว่าง
           *   ★★ กล่องว่างทำให้การ์ดสูงไม่เท่ากันในตาราง ซึ่งอ่านยากกว่า
           *      การมีที่ว่างที่ตั้งใจ
           *   ★ ใช้ชุดเดียวกับหน้าสร้างบิลและชิปตัวกรอง — ร้านเดียวกัน
           *     ต้องมีหน้าตาเดียวกันทุกที่ในระบบ
           */
          <div
            className="grid aspect-video place-items-center"
            style={{
              background: `linear-gradient(145deg, rgb(${style.tint} / 0.22), rgb(${style.tint} / 0.06))`,
            }}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-12"
              style={{ color: `rgb(${style.tint})` }}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={style.icon} />
            </svg>
          </div>
        )}

        {/* ★ จำนวนรูปมุมขวาล่าง — บอกว่ากดเข้าไปแล้วมีอะไรให้ดูต่อ */}
        {(r.photos?.length ?? 0) > 1 ? (
          <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 14l4-4 4 4 3-3 5 5" />
            </svg>
            {r.photos!.length}
          </span>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-2">
        {/* ★ ชื่อร้านเป็นลิงก์เข้าหน้ารายละเอียด — เป็นที่ที่คนคาดว่าจะกดได้อยู่แล้ว */}
        <h2 className="min-w-0 font-medium">
          {/*
            * ★★ ชื่อร้านเป็นทางเข้าหลักของหน้ารายละเอียด จึงต้องกดโดนแน่ ๆ
            *    ★ ตัวหนังสือสูง 19px เอง — ใช้ min-h-11 + inline-flex
            *      เพื่อขยาย "พื้นที่แตะ" โดยไม่เปลี่ยนขนาดตัวอักษร
            *      ★★ ต่างจากการเพิ่ม font-size ซึ่งจะทำให้ดีไซน์การ์ดเพี้ยนทั้งหน้า
            */}
          <Link
            href={`/office/food/picks/${r.id}`}
            dir="auto"
            className="inline-flex min-h-11 items-center text-ink transition-colors hover:text-link"
          >
            {r.name}
          </Link>
        </h2>

        <div className="flex shrink-0 items-start gap-1">
          {r.maybeClosed ? (
            <span className="mt-1 rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">
              {ot('food.picks.maybeClosed')}
            </span>
          ) : null}

          {/*
            * ★★ "ร้านปิด/ย้ายแล้ว" กับ "ลบ" ย้ายมาอยู่ในเมนู ⋯ มุมขวาบน
            *
            *    ของเดิมวางเป็นปุ่มเต็มตัวอยู่แถวล่างข้างปุ่มหัวใจ
            *    ★ สองอย่างนี้ทำกันปีละไม่กี่ครั้ง ส่วนหัวใจกดกันทุกวัน
            *      การให้พื้นที่เท่ากันทำให้ของที่กดบ่อยหายไปในแถวปุ่ม
            *    ★★ และ "ลบ" ที่เป็นปุ่มสีแดงเต็มตัวข้างปุ่มที่กดทุกวัน
            *       คือการเชิญให้กดพลาด — เหตุผลเดียวกับ "ยกเลิกหนี้" ในหน้ายอดค้าง
            */}
          <span className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={ot('food.picks.more')}
              aria-expanded={menuOpen}
              className="grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>

            {menuOpen ? (
              <span className="absolute end-0 top-12 z-40 w-52 overflow-hidden rounded-xl border border-line bg-elevated shadow-xl">
                {r.maybeClosed ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onMarkOpen()
                    }}
                    className="flex min-h-11 w-full items-center px-3 text-start text-[13px] text-ink hover:bg-surface"
                  >
                    {ot('food.picks.stillOpen')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onReport()
                    }}
                    className="flex min-h-11 w-full items-center px-3 text-start text-[13px] text-ink hover:bg-surface"
                  >
                    {ot('food.picks.reportClosed')}
                  </button>
                )}

                {r.canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onRemove()
                    }}
                    className="flex min-h-11 w-full items-center border-t border-line px-3 text-start text-[13px] text-danger hover:bg-surface"
                  >
                    {ot('common.delete')}
                  </button>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <p className="mt-0.5 text-sm text-ink-soft">{r.signatureDish}</p>

      {/*
        * ★★ ดาวเฉลี่ยมาคู่กับจำนวนรีวิวเสมอ ไม่เคยแสดงเดี่ยว
        *    ★ ★4.0 จากรีวิวเดียว กับ ★4.0 จาก 40 รีวิว ไม่ใช่ข้อมูลเดียวกัน
        *      การซ่อนจำนวนทำให้ร้านที่มีคนรีวิวคนเดียวดูน่าเชื่อเท่ากัน
        */}
      {/*
        * ★ ป้ายเปิด/ปิด โผล่เฉพาะเมื่อตอบได้จริง
        *   ★★ isOpenNow คืน null เมื่อ "ไม่รู้" ซึ่งต่างจาก "ปิด"
        *      ร้านที่ไม่ได้กรอกเวลาจึงไม่มีป้าย ตามข้อกำหนด
        */}
      {openNow !== null ? (
        <p className="mt-1.5">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              openNow ? 'bg-link/15 text-link' : 'bg-surface text-ink-faint',
            )}
          >
            {ot(openNow ? 'food.hours.open' : 'food.hours.closed')}
          </span>
        </p>
      ) : null}

      <p className="mt-1.5 text-[13px]">
        {r.ratingCount > 0 ? (
          <>
            <span className="text-warn">★</span>{' '}
            <span className="font-medium text-ink">{r.rating?.toFixed(1)}</span>{' '}
            <span className="text-ink-faint">({r.ratingCount})</span>
          </>
        ) : (
          <span className="text-ink-faint">{ot('food.picks.noReviews')}</span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        {r.cuisine ? <Tag>{r.cuisine}</Tag> : null}
        {r.priceRange ? <Tag>{r.priceRange}</Tag> : null}
        {/*
          * ★★ มีระยะจริงแล้วแสดงระยะจริง ไม่ใช่แสดงทั้งคู่
          *    ★ "เดินได้ · 🚶 เดิน ~6 นาที" คือการพูดเรื่องเดียวกันสองครั้ง
          *      ด้วยคำที่ต่างกัน ซึ่งทำให้คนสงสัยว่ามันต่างกันตรงไหน
          */}
        {/*
          * ★★★ บอกทั้งระยะทางและเวลา ไม่ใช่เวลาอย่างเดียว
          *
          *     ★ นาทีตอบว่า "ไปนานไหม" แต่ไม่ตอบว่า "ไกลแค่ไหน" ซึ่งเป็น
          *       คำถามที่คนถามตอนตัดสินใจว่าจะเดินหรือเรียกรถ
          *       ★★ และนาทีของเราเป็นค่าประมาณจากความเร็วคงที่ —
          *          ระยะทางเป็นของที่วัดได้จริงกว่า
          */}
        {dist ? (
          <Tag>
            <span className="tabular-nums">
              {ot(dist.unit === 'km' ? 'food.geo.km' : 'food.geo.metres', { n: dist.n })}
            </span>
          </Tag>
        ) : null}
        {r.travelMinutes != null && r.travelMode ? (
          <Tag>
            {ot(r.travelMode === 'walking' ? 'food.geo.walkMin' : 'food.geo.driveMin', {
              n: r.travelMinutes,
            })}
          </Tag>
        ) : dist ? null : r.distance ? (
          <Tag>{distanceLabel(ot, r.distance)}</Tag>
        ) : null}
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
            'h-11 rounded-full px-4 text-sm font-medium transition-colors',
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
            className="grid h-11 place-items-center rounded-full bg-surface px-4 text-sm text-ink hover:bg-surface-hover"
          >
            {ot('food.picks.openMap')}
          </a>
        ) : null}

        {/* ★ "ร้านปิด" กับ "ลบ" ย้ายไปเมนู ⋯ ด้านบนแล้ว แถวนี้เหลือแต่ของที่กดบ่อย */}
      </div>

      {/*
        * ★★ ช่องเพิ่มรูปโผล่เฉพาะคนที่แก้ร้านนั้นได้
        *    ★ ของเดิมไม่มีทางใส่รูปให้ร้านเลย — หน้าปกมาจากรูปรีวิวใบล่าสุด
        *      ★★ ร้านที่ไม่มีใครรีวิวจึงไม่มีรูปตลอดกาล แม้จะมีคนอยากใส่ให้
        */}
      {r.canManage ? (
        <div className="mt-3 border-t border-line pt-3">
          <ShopPhotos
            shopId={r.id}
            photos={r.photos ?? []}
            canEdit
            compact
            onChanged={onPhotos}
          />
        </div>
      ) : null}

      {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
    </article>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5">{children}</span>
}

/*
 * ★ cuisineEmoji ถูกถอดออก — ไอคอนประจำประเภทย้ายไป lib/office/cuisine.ts
 *   ★★ ของเดิมเป็นอีโมจิที่ขึ้นกับฟอนต์ของเครื่อง หน้าตาจึงต่างกันทุกเครื่อง
 *      ★ และหน้าสร้างบิลกับหน้านี้ใช้คนละชุด ร้านเดียวกันเลยมีสองหน้าตา
 */

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
        /* ★ shrink-0 สำคัญกับแถวที่เลื่อนแนวนอน — ไม่งั้น flex จะบีบชิปให้แคบลง
             จนตัวหนังสือขึ้นบรรทัดใหม่ แทนที่จะปล่อยให้ล้นออกไปให้เลื่อน */
        'h-11 shrink-0 rounded-full px-4 text-sm transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
