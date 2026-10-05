'use client'

import Link from 'next/link'
import Image from 'next/image'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { apiFetch } from '@/lib/api/client'
import { useConfirm } from '@/components/ConfirmProvider'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  DISTANCE_OPTIONS,
  PRICE_OPTIONS,
  distanceLabel,
  emptyFilters,
  karaokeFrom,
  filterRestaurants,
  type Filters,
  type Restaurant,
  type RestaurantList,
} from '@/lib/office/food'
import { distanceParts, isOpenNow } from '@/lib/office/geo'
import { cuisineStyle } from '@/lib/office/cuisine'
import { Section } from '@/components/ui/Section'
import { ShopPhotos } from './ShopPhotos'
import { Stars } from './Stars'
import { AddRestaurantForm, type EditingShop } from './AddRestaurantForm'
import { FilterSheet, FilterGroup, FilterChip } from './FilterSheet'
import { FunGuide } from './FunGuide'

export type PicksSort = 'new' | 'votes' | 'rating' | 'near'

/** หน้าร้านเด็ด (FR-A03–A06) */
export function FoodPicks() {
  const ot = useOt()
  const confirm = useConfirm()
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
  /* ★ ร้านที่กำลังแก้ไข — ฟอร์มเดียวกับตอนเพิ่ม ต่างแค่ค่าเริ่มต้นกับ method */
  const [editing, setEditing] = useState<EditingShop | null>(null)
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

  async function reportClosed(id: string, name: string) {
    if (!(await confirm({ kind: 'danger', subject: name, message: ot('food.picks.reportClosed') }))) return
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

  async function remove(id: string, name: string) {
    if (!(await confirm({ kind: 'delete', subject: name, message: ot('confirm.deleteRestaurant') }))) return
    try {
      await apiFetch(`/api/office/food/restaurants/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  async function markOpen(r: Restaurant) {
    if (!(await confirm({ kind: 'edit', subject: r.name }))) return
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

  /*
   * ★★★ ต้องอยู่เหนือ early return ของฟอร์ม
   *
   *     ★ React นับจำนวน hook ต่อการ render ★★ วางไว้ใต้ `if (adding) return`
   *       แล้วพอเปิดฟอร์ม hook ตัวนี้จะไม่ถูกเรียก — "Rendered fewer hooks
   *       than expected" แล้วทั้งหน้าตกไปที่ error boundary
   *     ★ บทเรียนเดียวกับ useState ใน OfficePageChrome
   */
  useEffect(() => {
    setPage(0)
  }, [filters.query, filters.cuisine, filters.price, filters.distance, sort])

  if (adding || editing) {
    return (
      /* ★★ กว้างเต็มคอลัมน์ ★ ฟอร์มที่บีบอยู่ 512px ในหน้ากว้าง 1000px
           ทำให้แผนที่เล็กเท่าช่องพิมพ์ชื่อ ซึ่งปักหมุดแม่นไม่ได้ */
      <div className="w-full pb-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">
            <Untranslated>{editing ? ot('food.picks.edit') : ot('food.picks.add')}</Untranslated>
          </h2>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setAdding(false)
              setEditing(null)
            }}
          >
            {ot('common.cancel')}
          </Button>
        </div>
        <div className="mt-4">
          <AddRestaurantForm
            editing={editing ?? undefined}
            onDone={() => {
              setAdding(false)
              setEditing(null)
              void load()
            }}
          />
        </div>
      </div>
    )
  }

  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = shown.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  /* ── ตัวเลขสรุป + ยอดฮิต 3 อันดับ ── */
  const stats = [
    { key: 'food.stat.total', n: data.items.length, c: 'var(--ck-gold)' },
    { key: 'food.stat.myHearts', n: data.items.filter((r) => r.voted).length, c: 'var(--color-accent)' },
    { key: 'food.stat.reviewed', n: data.items.filter((r) => r.ratingCount > 0).length, c: 'var(--ck-gold-deep)' },
    { key: 'food.stat.cuisines', n: data.cuisines.length, c: 'var(--color-link)' },
  ]
  const top = [...data.items]
    .filter((r) => r.voteCount > 0 && !r.maybeClosed)
    .sort((a, b) => b.voteCount - a.voteCount || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 3)
  const SORTS: { id: PicksSort; key: 'food.picks.sortNew' }[] = [
    { id: 'new', key: 'food.picks.sortNew' },
    { id: 'votes', key: 'food.picks.sortVotes' as 'food.picks.sortNew' },
    { id: 'rating', key: 'food.picks.sortRating' as 'food.picks.sortNew' },
    ...(data.items.some((x) => x.travelMeters != null)
      ? [{ id: 'near' as const, key: 'food.picks.sortNear' as 'food.picks.sortNew' }]
      : []),
  ]
  /* ★ การเรียงย้ายมาอยู่บนแถบเครื่องมือแล้ว — ปุ่ม "ตัวกรอง (n)" นับแค่ราคากับระยะ */
  const sheetCount = (filters.price ? 1 : 0) + (filters.distance ? 1 : 0)

  return (
    <div className="w-full pb-10">
      <FunGuide id="foodPicks" art="picks" />

      {/* ═══ ตัวเลขสรุป ═══ */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((x) => (
          <div key={x.key} className="mkt-stat rounded-2xl p-3.5" style={{ '--sc': x.c } as CSSProperties}>
            <p className="text-2xl font-black tabular-nums text-ink">{loading ? '–' : x.n}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <Untranslated>{ot(x.key as 'food.stat.total')}</Untranslated>
            </p>
          </div>
        ))}
      </div>

      {/* ═══ ยอดฮิตของออฟฟิศ — 3 อันดับจากหัวใจ ═══ */}
      {top.length > 0 ? (
        <section className="food-podium mt-6 rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-black text-ink">
              🏆 <Untranslated>{ot('food.top.title')}</Untranslated>
            </h2>
            <p className="text-xs text-ink-soft">
              <Untranslated>{ot('food.top.hint')}</Untranslated>
            </p>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {top.map((r, i) => {
              const style = cuisineStyle(r.name, r.cuisine)
              return (
                <li key={r.id}>
                  <Link
                    href={`/office/food/picks/${r.id}`}
                    className={cn('food-top group relative flex h-full flex-col overflow-hidden rounded-3xl', i === 0 && 'food-top-1')}
                    style={{ '--ct': style.tint } as CSSProperties}
                  >
                    <div className="relative aspect-[16/9] overflow-hidden">
                      {r.coverUrl ? (
                        <Image src={r.coverUrl} alt="" fill sizes="(max-width:640px) 100vw, 360px" className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                      ) : (
                        <span aria-hidden="true" className="food-top-fallback absolute inset-0 grid place-items-center">
                          <svg viewBox="0 0 24 24" className="size-12 text-[var(--ck-shine)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d={style.icon} />
                          </svg>
                        </span>
                      )}
                      <span className="market-scrim" aria-hidden="true" />
                      <span aria-hidden="true" className="food-medal absolute start-3 top-3 grid size-11 place-items-center rounded-full text-2xl">
                        {['🥇', '🥈', '🥉'][i]}
                      </span>
                      <span className="mkt-price absolute bottom-3 start-3 text-sm">
                        ♥ <Untranslated>{ot('food.top.hearts', { n: r.voteCount })}</Untranslated>
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p dir="auto" className="truncate text-base font-bold text-ink">{r.name}</p>
                      {r.signatureDish ? (
                        <p dir="auto" className="mt-0.5 truncate text-xs text-ink-soft">{r.signatureDish}</p>
                      ) : null}
                      {r.ratingCount > 0 ? (
                        <p className="mt-1.5 text-xs text-ink-soft">
                          <span className="text-[var(--ck-gold-deep)]">★</span>{' '}
                          <span className="font-bold text-ink">{r.rating?.toFixed(1)}</span> ({r.ratingCount})
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

      {/* ═══ แถบเครื่องมือ: ค้นหา · เพิ่มร้าน · ประเภท · เรียง · ตัวกรอง ═══ */}
      <section className="mkt-panel mt-6 rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_16rem]">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder={ot('food.picks.searchPlaceholder')}
              aria-label={ot('food.picks.searchPlaceholder')}
              className="h-12 w-full rounded-full border border-line bg-input ps-11 pe-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-line-strong sm:text-sm"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              className={cn(
                'inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                sheetCount > 0 ? 'border-ink bg-ink text-page' : 'border-line bg-elevated text-ink hover:bg-surface',
              )}
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 5h18M6 12h12M10 19h4" />
              </svg>
              {sheetCount > 0 ? ot('food.filter.withCount', { n: sheetCount }) : ot('food.filter.title')}
            </button>

            <FilterSheet
              open={filterOpen}
              onClose={() => setFilterOpen(false)}
              title={ot('food.filter.title')}
              count={sheetCount}
              onClear={() => setFilters((f) => ({ ...f, price: null, distance: null }))}
            >
              <FilterGroup label={ot('food.filter.price')}>
                {PRICE_OPTIONS.map((p) => (
                  <FilterChip key={p} active={filters.price === p} onClick={() => setFilters((f) => ({ ...f, price: f.price === p ? null : p }))}>
                    {p}
                  </FilterChip>
                ))}
              </FilterGroup>
              <FilterGroup label={ot('food.filter.distance')}>
                {DISTANCE_OPTIONS.map((d) => (
                  <FilterChip key={d} active={filters.distance === d} onClick={() => setFilters((f) => ({ ...f, distance: f.distance === d ? null : d }))}>
                    {distanceLabel(ot, d)}
                  </FilterChip>
                ))}
              </FilterGroup>
            </FilterSheet>
          </div>

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="team-go inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-bold"
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <Untranslated>{ot('food.picks.add')}</Untranslated>
          </button>
        </div>

        {/* ── เรียงลำดับ: เห็นตลอด ไม่ต้องเปิดแผ่นตัวกรอง ── */}
        <div role="radiogroup" aria-label={ot('food.filter.sort')} className="mt-4 flex w-full flex-wrap rounded-full bg-surface p-1 sm:w-fit">
          {SORTS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={sort === o.id}
              onClick={() => setSort(o.id)}
              className={cn(
                'h-10 flex-1 rounded-full px-3.5 text-[13px] transition-all sm:h-8 sm:flex-none',
                sort === o.id ? 'bg-elevated font-semibold text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
              )}
            >
              {ot(o.key)}
            </button>
          ))}
        </div>

        {/*
          * ★★ ประเภทอาหารเป็นการ์ดเล็กมีไอคอนประจำประเภท — ชุดเดียวกับการ์ดร้าน
          *    คนเห็นไอคอนบนชิป แล้วเจอไอคอนเดียวกันบนการ์ดที่กรองออกมา
          */}
        <div className="mkt-rail -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            aria-pressed={!filters.cuisine}
            onClick={() => setFilters((f) => ({ ...f, cuisine: null }))}
            className="mkt-cat flex min-w-[5rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-2.5"
          >
            <span aria-hidden="true" className="mkt-cat-emoji text-xl leading-none">🍽️</span>
            <span className="whitespace-nowrap text-xs font-medium text-ink">{ot('food.picks.allCuisines')}</span>
          </button>
          {data.cuisines.map((c) => {
            const style = cuisineStyle(c, c)
            return (
              <button
                key={c}
                type="button"
                aria-pressed={filters.cuisine === c}
                onClick={() => setFilters((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))}
                className="mkt-cat flex min-w-[5rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-2.5"
              >
                <svg viewBox="0 0 24 24" className="mkt-cat-emoji size-5" style={{ color: `rgb(${style.tint})` }} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={style.icon} />
                </svg>
                <span dir="auto" className="whitespace-nowrap text-xs font-medium text-ink">{c}</span>
              </button>
            )
          })}
        </div>
      </section>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ══ 2 · รายการร้าน ═══════════════════════════════════════ */}
      <Section
        className="mt-6"
        title={<Untranslated>{ot('food.picks.listTitle')}</Untranslated>}
        badge={
          shown.length > 0 ? (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal tabular-nums text-ink-soft">
              {ot('food.picks.count', { n: shown.length })}
            </span>
          ) : undefined
        }
      >
        {/* ★★ ไม่ใส่ items-start — การ์ดในแถวเดียวกันต้องสูงเท่ากัน
               ★ ของเดิมแถวดูขาด ๆ เพราะร้านที่มีป้าย "เปิดอยู่" หรือเมนูสี่รายการ
                 สูงกว่าใบข้าง ๆ แล้วเส้นฐานไม่ตรงกันสักแถว */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-3xl border border-line">
                <div className="mkt-skel aspect-video" />
                <div className="space-y-2 p-4">
                  <div className="mkt-skel h-4 w-2/3 rounded-full" />
                  <div className="mkt-skel h-3 w-1/2 rounded-full" />
                </div>
              </div>
            ))
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
                onReport={() => void reportClosed(r.id, r.name)}
                onRemove={() => void remove(r.id, r.name)}
                onMarkOpen={() => void markOpen(r)}
                onPhotos={() => void load()}
                onEdit={() => setEditing(r)}
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
  onEdit,
}: {
  r: Restaurant
  note?: string
  onVote: () => void
  onReport: () => void
  onRemove: () => void
  onMarkOpen: () => void
  onPhotos: () => void
  onEdit: () => void
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
        'food-card mkt-card-in group/card relative flex h-full flex-col rounded-3xl border border-line bg-elevated p-4',
        /* ★ ร้านที่อาจปิดจางลงแต่ยังอ่านได้ — ไม่ซ่อน เพราะคนที่รู้ว่ายังเปิด
             ต้องเห็นมันเพื่อกดยืนยัน (FR-A05) */
        r.maybeClosed && 'opacity-60',
      )}
    >
      {/*
        * ★★★ ทั้งใบกดเข้าหน้ารายละเอียดได้ ไม่ใช่เฉพาะตรงชื่อ
        *
        *     ★ ของเดิมชื่อร้านเป็นลิงก์ แต่ไม่มีอะไรบนจอบอกว่ามันกดได้ —
        *       ไม่มีขีดเส้นใต้ ไม่มีสีลิงก์ ไม่มีลูกศร
        *       ★★ ผู้ใช้ถามตรง ๆ ว่า "กดเข้าไปดูรายละเอียดร้านยังไง"
        *          ซึ่งเป็นคำตอบที่ชัดที่สุดว่าทางเข้ามันมองไม่เห็น
        *
        * ★★ ทำเป็นลิงก์คลุมทั้งใบ แล้วยกปุ่มจริง (หัวใจ · เมนู ⋯ · รูป)
        *    ขึ้นมาอยู่เหนือมันด้วย z-index
        *    ★ ไม่ใช่ห่อ <Link> รอบทั้งการ์ด เพราะปุ่มซ้อนในลิงก์เป็น HTML
        *      ที่ไม่ถูกต้อง และกดปุ่มแล้วจะเด้งไปหน้าอื่นด้วย
        */}
      <Link
        href={`/office/food/picks/${r.id}`}
        aria-label={r.name}
        className="absolute inset-0 z-0 rounded-3xl focus-visible:ring-2 focus-visible:ring-accent"
      />
      {/*
        * ── รูปปก ──────────────────────────────────────────────────
        * ★ มาจากรูปล่าสุดในรีวิว ไม่ใช่ช่องอัปโหลดแยก
        *   ★★ ช่องอัปโหลดแยกแปลว่ามีคนต้องรับหน้าที่หารูปมาใส่ ซึ่งไม่มีใครทำ
        *      ส่วนรูปจากรีวิวเกิดขึ้นเองทุกครั้งที่มีคนไปกินแล้วถ่ายรูป
        */}
      <div className="pointer-events-none relative -mx-4 -mt-4 mb-3 overflow-hidden rounded-t-3xl">
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

        {/*
          * ★★ ไล่สีเข้มที่ก้นรูป — ป้ายสีขาวบนรูปอาหารสว่าง ๆ อ่านไม่ออก
          *    ★ เป็นชั้นไล่สี ไม่ใช่กล่องทึบ เพราะกล่องทึบบังรูปที่คนอยากดู
          */}
        {r.coverUrl ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
            style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)' }}
          />
        ) : null}

        {/* ★ ดาวอยู่บนรูป ไม่ใช่ใต้ชื่อ — ตากวาดเจอก่อนอ่านชื่อร้านด้วยซ้ำ */}
        {r.ratingCount > 0 ? (
          <span className="absolute bottom-2 start-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm">
            <Stars value={r.rating ?? 0} size={12} />
            <span className="text-[11px] font-semibold tabular-nums text-white">
              {r.rating?.toFixed(1)}
            </span>
            <span className="text-[10.5px] text-white/70">({r.ratingCount})</span>
          </span>
        ) : null}

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
        {/* ★ ไม่เป็นลิงก์ซ้อนอีกแล้ว — ลิงก์คลุมทั้งใบรับหน้าที่นั้นไป
               ★★ ลิงก์ซ้อนลิงก์ทำให้โปรแกรมอ่านหน้าจอประกาศทางเข้าเดียวสองครั้ง */}
        <h2
          dir="auto"
          className="flex min-h-11 min-w-0 items-center font-medium text-ink transition-colors group-hover/card:text-link"
        >
          {r.name}
        </h2>

        <div className="relative z-10 flex shrink-0 items-start gap-1">
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
                  <>
                    {/*
                      * ★★ "แก้ไข" คือทางเดียวที่ปักหมุดร้านเก่าได้
                      *    ★ ร้านที่สร้างก่อนมีแผนที่ หรือปักผิด ไม่มีระยะทาง
                      *      ตลอดกาลจนกว่าจะมีที่ให้แก้
                      */}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onEdit()
                      }}
                      className="flex min-h-11 w-full items-center border-t border-line px-3 text-start text-[13px] text-ink hover:bg-surface"
                    >
                      <Untranslated>{ot('food.picks.edit')}</Untranslated>
                    </button>
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
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/*
        * ★★ รายการเมนูพร้อมราคา ไม่ใช่บรรทัดเดียว
        *    ★ ของเดิมมีช่องเดียว คนจึงพิมพ์รวมกัน ("ข้าวมันไก่ + ต้มเลือดหมู")
        *      ★★ ซึ่งค้นหาแยกไม่ได้และใส่ราคาไม่ได้
        *    ★ การ์ดโชว์สามรายการแรก ที่เหลือบอกเป็นจำนวน —
        *      ★★ ร้านที่มีสิบเมนูจะทำให้การ์ดสูงกว่าใบอื่นสามเท่า แล้วแถวเพี้ยน
        */}
      {/* ── 0061 ── ร้านคาราโอเกะ: ราคาเริ่มต้นแทนเมนู ── */}
      {r.karaoke && karaokeFrom(r.karaoke) != null ? (
        <p className="relative z-10 mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-link)_12%,transparent)] px-3 py-1 text-xs font-semibold text-ink">
          🎤 <Untranslated>{ot('food.karaoke.from', { price: `฿${karaokeFrom(r.karaoke)!.toLocaleString()}` })}</Untranslated>
        </p>
      ) : null}
      {(r.dishes?.length ?? 0) > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {r.dishes!.slice(0, 3).map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2 text-[13px]">
              {/* ★ ภาพย่อรูปเมนู (0060) — เห็นหน้าตาอาหารก่อนกดเข้าร้าน */}
              {d.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Storage ที่ไม่ได้ตั้ง remotePatterns
                <img src={d.photoUrl} alt="" loading="lazy" className="size-7 shrink-0 rounded-md object-cover ring-1 ring-line" />
              ) : null}
              <span dir="auto" className="min-w-0 flex-1 truncate text-ink-soft">
                {d.name}
              </span>
              {d.price != null ? (
                <span className="shrink-0 tabular-nums text-ink-faint">
                  ฿{d.price.toLocaleString()}
                </span>
              ) : null}
            </li>
          ))}
          {r.dishes!.length > 3 ? (
            <li className="text-[11.5px] text-ink-faint">
              {ot('food.picks.moreDishes', { n: r.dishes!.length - 3 })}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm text-ink-soft">{r.signatureDish}</p>
      )}

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

      {/* ★ ดาวย้ายไปอยู่บนรูปแล้ว — ตรงนี้เหลือเฉพาะกรณียังไม่มีใครรีวิว
             ★★ ป้ายบนรูปจะไม่ขึ้นเลยเมื่อยังไม่มีคะแนน จึงต้องมีที่บอกตรงนี้ */}
      {r.ratingCount === 0 ? (
        <p className="mt-1.5 text-[12px] text-ink-faint">{ot('food.picks.noReviews')}</p>
      ) : null}

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

      {/*
        * ★ mt-auto ดันแถวปุ่มไปชิดล่าง การ์ดทุกใบจึงมีเส้นฐานเดียวกัน
        * ★★ แถบล่างเป็น "ท่าเรือ" ปุ่มสามตัว: หัวใจ (กดบ่อยสุด) · แผนที่ · ดูร้าน
        *    ★ เจ้าของสั่งให้อลังการขึ้น (5 ต.ค. 2026) — หัวใจไล่สีเด้งตอนกด · ปุ่มดูร้านไล่สีชี้ทางชัด
        */}
      <div className="relative z-10 mt-auto pt-3">
      <div className="food-dock @container flex items-center gap-2 rounded-[20px] p-1.5">
        <button
          type="button"
          onClick={onVote}
          aria-pressed={r.voted}
          aria-label={ot('food.picks.heartLabel', { n: r.voteCount })}
          className={cn('food-heart inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-black tabular-nums', r.voted && 'food-heart-on')}
        >
          {/* ★ key เปลี่ยนตามสถานะ = แอนิเมชันเด้งเล่นใหม่ทุกครั้งที่กด */}
          <svg key={String(r.voted)} viewBox="0 0 24 24" className="food-heart-icon size-[18px]" aria-hidden="true">
            <path
              d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z"
              fill={r.voted ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          {r.voteCount}
        </button>

        {r.mapUrl ? (
          <a
            href={r.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={ot('food.picks.openMap')}
            title={ot('food.picks.openMap')}
            className="food-map inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {/* ★ จัดตามความกว้างการ์ด ไม่ใช่ความกว้างจอ — การ์ดแคบเหลือแค่ไอคอนหมุด */}
            <span className="hidden @[360px]:inline">{ot('food.picks.openMap')}</span>
          </a>
        ) : null}

        {/* ★ ปุ่มดูร้านชิดขวา — ทั้งการ์ดกดได้อยู่แล้ว แต่ปุ่มที่เห็นชัดบอกว่า "กดเข้าไปได้" */}
        <Link
          href={`/office/food/picks/${r.id}`}
          className="food-go group/go ms-auto inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full ps-4 pe-1.5 text-sm font-bold"
        >
          <Untranslated>{ot('food.picks.viewShop')}</Untranslated>
          <span aria-hidden="true" className="food-go-arrow grid size-8 place-items-center rounded-full">
            <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="currentColor">
              <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
            </svg>
          </span>
        </Link>
        {/* ★ "ร้านปิด" กับ "ลบ" อยู่ในเมนู ⋯ ด้านบน แถวนี้เหลือแต่ของที่กดบ่อย */}
      </div>
      </div>

      {/*
        * ★★ ช่องเพิ่มรูปโผล่เฉพาะคนที่แก้ร้านนั้นได้
        *    ★ ของเดิมไม่มีทางใส่รูปให้ร้านเลย — หน้าปกมาจากรูปรีวิวใบล่าสุด
        *      ★★ ร้านที่ไม่มีใครรีวิวจึงไม่มีรูปตลอดกาล แม้จะมีคนอยากใส่ให้
        */}
      {r.canManage ? (
        <div className="relative z-10 mt-3 border-t border-line pt-3">
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
