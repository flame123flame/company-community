'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  DISTANCE_OPTIONS,
  KARAOKE,
  PRICE_OPTIONS,
  distanceLabel,
  emptyFilters,
  filterRestaurants,
  pickWeighted,
  slotsForWheel,
  type Filters,
  type Restaurant,
  type RestaurantList,
} from '@/lib/office/food'
import { directionsUrl, searchUrl } from '@/lib/office/geo'
import { FilterSheet, FilterGroup, FilterChip, FilterToggle } from './FilterSheet'
import { SpinWheel, type WheelSlot } from './SpinWheel'
import { Confetti } from './Confetti'
import { FunGuide } from './FunGuide'
import { cuisineStyle } from '@/lib/office/cuisine'

/**
 * หน้าสุ่มอาหาร (FR-A07)
 *
 * ★ หน้านี้มีหน้าที่แค่ "เลือกว่าร้านไหนเข้าวงล้อ" แล้วส่งให้มันหมุน
 *   ★★ ใช้ SpinWheel (วงล้อกลม) ไม่ใช่ RandomWheel (แถบเลื่อน) —
 *      ทั้งสองตัวเรียก planDraw/easeOut ชุดเดียวกัน จังหวะลุ้นจึงเหมือนกัน
 *      ตามที่ FR-X05 ต้องการ ★ ต่างกันแค่รูปร่างที่มองเห็น
 */
export function FoodRandom() {
  const ot = useOt()
  const [data, setData] = useState<RestaurantList>({ items: [], cuisines: [] })
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [winner, setWinner] = useState<Restaurant | null>(null)
  const [visitLogged, setVisitLogged] = useState(false)
  const [loading, setLoading] = useState(true)
  /** FR-A08 — ร้านที่เพิ่งไปภายใน N วัน */
  const [recent, setRecent] = useState<{ days: number; ids: Set<string> }>({
    days: 7,
    ids: new Set(),
  })
  const [avoidRecent, setAvoidRecent] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  /* ★ เปลี่ยนทุกครั้งที่ได้ผลใหม่ — key ของการ์ดผล ให้พลุกับแอนิเมชันเล่นใหม่ */
  const [celebrate, setCelebrate] = useState(0)
  /* ★ พิกัดออฟฟิศ — ล้มแล้วเป็น null เงียบ ๆ ปุ่มถอยไปค้นด้วยชื่อร้านเอง */
  const [office, setOffice] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    let alive = true
    void apiFetch<{ office: { lat: number; lng: number } | null }>('/api/office/food/office-location')
      .then((res) => {
        if (alive) setOffice(res.office)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  /*
   * ตัวกรองที่เลือกอยู่กี่อย่าง — ตัวเลขบนปุ่ม "ตัวกรอง (n)"
   * ★ avoidRecent ไม่ถูกนับ เพราะค่าเริ่มต้นของมันคือ "เปิด"
   *   ★★ นับค่าเริ่มต้นเข้าไปด้วย = ปุ่มขึ้น (1) ตั้งแต่เปิดหน้ามา
   *      ซึ่งทำให้ตัวเลขนั้นไม่มีความหมาย
   */
  const filterCount =
    (filters.cuisine ? 1 : 0) +
    (filters.price ? 1 : 0) +
    (filters.distance ? 1 : 0) +
    (filters.onlyPicks ? 1 : 0)

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<RestaurantList>('/api/office/food/restaurants'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void apiFetch<{ days: number; ids: string[] }>('/api/office/food/recent')
      .then((d) => setRecent({ days: d.days, ids: new Set(d.ids) }))
      .catch(() => undefined)
  }, [load])

  /*
   * ★★ 0061 — ร้านคาราโอเกะไม่เข้าวงล้อมื้อเที่ยง เว้นแต่จะกรองประเภท "คาราโอเกะ" เอง
   *    ★ วงล้อนี้ใช้ตัดสินมื้อเที่ยงเป็นหลัก — สุ่มได้ร้านคาราโอเกะตอนเที่ยงคือผลที่ใช้ไม่ได้
   */
  const forWheel = useCallback(
    (list: Restaurant[]) => (filters.cuisine === KARAOKE ? list : list.filter((r) => r.cuisine !== KARAOKE)),
    [filters.cuisine],
  )

  const pool = useMemo(
    () => forWheel(filterRestaurants(data.items, filters, { forWheel: true })),
    [data.items, filters, forWheel],
  )

  /*
   * ═══════════════════════════════════════════════════════════════
   * สุ่มผู้ชนะก่อน แล้วค่อยเลือกช่องที่จะแสดง
   * ═══════════════════════════════════════════════════════════════
   *
   * ★★★ ข้อกำหนด: "1 ร้าน = 1 ช่อง ขนาดเท่ากันทุกช่อง ห้ามใส่ชื่อร้านซ้ำ"
   *     และ "สุ่มผลลัพธ์แบบ weighted random ก่อน แล้วหมุนวงล้อไปหยุด
   *     ที่ช่องของร้านนั้น"
   *
   * ★ ถ่วงน้ำหนักหลังกรอง ไม่ใช่ก่อน — ตัวกรองตัดสินว่า "ร้านไหนเข้าข่าย"
   *   ส่วนการถ่วงตัดสินว่า "ร้านที่เข้าข่ายแล้วมีโอกาสเท่าไหร่"
   *
   * ★★ ผูกกับ spinToken ไม่ใช่กับ pool เฉย ๆ
   *    ★ ถ้าคำนวณผู้ชนะใหม่ทุกครั้งที่ pool เปลี่ยนตัวตน (ซึ่งเกิดทุก render
   *      ที่ data เปลี่ยน) ผู้ชนะจะเปลี่ยนกลางคันระหว่างวงล้อกำลังหมุน
   *      ★★ แล้ววงล้อจะหยุดที่ช่องหนึ่งแต่ประกาศผลอีกช่องหนึ่ง
   */
  const [spinToken, setSpinToken] = useState(0)

  const plan = useMemo(() => {
    const champion = pickWeighted(pool, avoidRecent ? recent.ids : new Set<string>())
    if (!champion) return { champion: null, slots: [] as Restaurant[] }
    return { champion, slots: slotsForWheel(pool, champion) }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pool, avoidRecent, recent.ids, spinToken])

  /** ★ หนึ่งร้านหนึ่งช่อง — ไม่มี suffix ให้ตัดออกตอนอ่านผลอีกต่อไป */
  const wheelItems: WheelSlot[] = useMemo(
    () => plan.slots.map((r) => ({ id: r.id, label: r.name, imageUrl: r.coverUrl })),
    [plan.slots],
  )

  async function logVisit(id: string) {
    setVisitLogged(true)
    try {
      await apiFetch(`/api/office/food/restaurants/${id}`, {
        method: 'POST',
        body: { action: 'visit' },
      })
    } catch {
      setVisitLogged(false)
    }
  }

  function toggleExcluded(id: string) {
    setFilters((f) => {
      const next = new Set(f.excluded)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...f, excluded: next }
    })
  }

  const summary = [
    filters.cuisine,
    filters.price,
    filters.distance ? distanceLabel(ot, filters.distance) : null,
    filters.onlyPicks ? ot('food.random.onlyPicks') : null,
  ].filter(Boolean)

  /* ★ ร้านที่เข้าข่ายตัวกรองทั้งหมด (รวมที่ตัดออกชั่วคราว) — ใช้วาดรายการให้แตะเข้า/ออก */
  const eligible = useMemo(
    () => forWheel(filterRestaurants(data.items, { ...filters, excluded: new Set<string>() }, { forWheel: true })),
    [data.items, filters, forWheel],
  )

  return (
    <div className="py-2">
      <FunGuide id="foodRandom" art="spin" />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ═══ เวทีวงล้อ ═══ */}
        <section className="food-stage relative overflow-hidden rounded-[32px] p-4 sm:p-6">
          <div className="relative z-10 flex flex-wrap items-center gap-2">
            {/*
              * ★★ ปุ่ม "ตัวกรอง (n)" เปิดแผ่นล่างจอบนมือถือ / กล่องลอยบนเดสก์ท็อป
              *    ★ ไม่กาง chip ทั้งหมดไว้ — วงล้อต้องอยู่ในจอแรกโดยไม่ต้องเลื่อน
              */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                  filterCount > 0 ? 'border-ink bg-ink text-page' : 'border-line bg-elevated text-ink hover:bg-surface',
                )}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 5h18M6 12h12M10 19h4" />
                </svg>
                {filterCount > 0 ? ot('food.filter.withCount', { n: filterCount }) : ot('food.filter.title')}
              </button>

              <FilterSheet
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                title={ot('food.filter.title')}
                count={filterCount}
                onClear={() => {
                  setFilters((f) => ({ ...f, cuisine: null, price: null, distance: null, onlyPicks: false }))
                  setAvoidRecent(true)
                }}
              >
                {data.cuisines.length > 0 ? (
                  <FilterGroup label={ot('food.filter.cuisine')}>
                    {data.cuisines.map((c) => (
                      <FilterChip key={c} active={filters.cuisine === c} onClick={() => setFilters((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))}>
                        {c}
                      </FilterChip>
                    ))}
                  </FilterGroup>
                ) : null}

                <FilterGroup label={ot('food.filter.price')}>
                  {PRICE_OPTIONS.map((pr) => (
                    <FilterChip key={pr} active={filters.price === pr} onClick={() => setFilters((f) => ({ ...f, price: f.price === pr ? null : pr }))}>
                      {pr}
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

                {/*
                  * ── ตั้งค่า ── แยกจากตัวกรอง: ตัวกรองตัดร้านออกจากวงล้อ
                  *    ส่วนตั้งค่าเปลี่ยน "โอกาส" ของร้านที่ยังอยู่
                  */}
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                    <Untranslated>{ot('food.filter.settings')}</Untranslated>
                  </p>
                  <FilterToggle
                    checked={filters.onlyPicks}
                    onChange={(v) => setFilters((f) => ({ ...f, onlyPicks: v }))}
                    label={ot('food.random.onlyPicks')}
                    hint={ot('food.random.onlyPicksHint')}
                  />
                  {recent.ids.size > 0 ? (
                    <FilterToggle
                      checked={avoidRecent}
                      onChange={setAvoidRecent}
                      label={ot('food.random.avoidRecent')}
                      hint={ot('food.random.avoidHint', { days: recent.days })}
                    />
                  ) : null}
                </div>
              </FilterSheet>
            </div>

            {/* ★ สรุปผลของตัวกรอง — จำนวนร้านที่เหลือคือสิ่งที่ตัดสินว่าควรหมุนหรือผ่อนตัวกรอง */}
            {summary.map((x) => (
              <span key={x} className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft">
                {x}
              </span>
            ))}
            <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-bold text-accent">
              <span aria-hidden="true" className="room-live" />
              {ot('food.random.inWheel', { n: pool.length })}
            </span>
          </div>

          {/* ── วงล้อ ── */}
          <div className="relative z-10 mt-4">
            {loading ? (
              <div className="mx-auto aspect-square w-full max-w-[380px] animate-pulse rounded-full bg-surface" />
            ) : wheelItems.length < 2 ? (
              <div className="rounded-3xl border border-dashed border-line-strong bg-elevated/70 p-8 text-center">
                <span aria-hidden="true" className="text-5xl">🍽️</span>
                {/*
                  * ★★ แยกสองกรณีที่หน้าตาเหมือนกันแต่ทางแก้ตรงข้ามกัน
                  *    ร้านในระบบมีน้อยจริง → ไปเพิ่มร้าน · ร้านมีแต่ตัวกรองแคบ → ปลดตัวกรอง
                  */}
                <p className="mt-3 text-sm text-ink-soft">
                  {data.items.length >= 2 ? ot('food.random.noneLeft') : ot('food.random.needMore')}
                </p>
                <Link
                  href="/office/food/picks"
                  className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-page"
                >
                  {ot('food.picks.add')}
                </Link>
              </div>
            ) : (
              <SpinWheel
                slots={wheelItems}
                spinLabel={ot('food.random.spin')}
                forcedWinnerId={plan.champion?.id ?? null}
                onResult={(item) => {
                  /* ★ id ของช่อง = id ร้านตรง ๆ */
                  setWinner(pool.find((r) => r.id === item.id) ?? null)
                  setVisitLogged(false)
                  setCelebrate((n) => n + 1)
                  /*
                   * ★★ จับฉลากใบใหม่ไว้ "หลัง" รอบนี้จบ ไม่ใช่ตอนเริ่มรอบถัดไป
                   *    ★ วงล้ออ่าน forcedWinnerId ณ วินาทีที่กดหมุน — สุ่มไว้ล่วงหน้า
                   *      ผู้ชนะจึงพร้อมอยู่แล้วเสมอตอนกด
                   */
                  setSpinToken((t) => t + 1)
                }}
              />
            )}
          </div>
        </section>

        {/* ═══ ขวา: ผลการสุ่ม + ร้านในวงล้อ ═══ */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+16px)]">
          {winner ? (
            <div key={celebrate} className="food-win ckr-result relative overflow-hidden rounded-[28px]">
              <Confetti pieces={90} durationMs={2400} />
              {/* ★ รูปปกจากรีวิวล่าสุด — ไม่มีก็ใช้ไอคอนประจำประเภทแทน */}
              <div className="relative aspect-video">
                {winner.coverUrl ? (
                  <Image src={winner.coverUrl} alt="" fill sizes="360px" className="object-cover" unoptimized />
                ) : (
                  <span aria-hidden="true" className="food-top-fallback absolute inset-0 grid place-items-center" style={{ '--ct': cuisineStyle(winner.name, winner.cuisine).tint } as CSSProperties}>
                    <svg viewBox="0 0 24 24" className="size-14 text-[var(--ck-shine)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={cuisineStyle(winner.name, winner.cuisine).icon} />
                    </svg>
                  </span>
                )}
                <span className="market-scrim" aria-hidden="true" />
                <span className="absolute start-4 top-4 rounded-full bg-[var(--ck-gold)] px-3 py-1 text-xs font-black text-[var(--ck-gold-deep)] shadow">
                  🎉 <Untranslated>{ot('food.random.resultEyebrow')}</Untranslated>
                </span>
              </div>

              <div className="relative p-5">
                <h2 dir="auto" className="ckr-headline-win text-[28px] font-black leading-tight">{winner.name}</h2>
                {winner.signatureDish ? <p dir="auto" className="mt-0.5 text-sm text-ink-soft">{winner.signatureDish}</p> : null}

                <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-ink-soft">
                  {winner.ratingCount > 0 ? (
                    <Tag>
                      <span className="text-[var(--ck-gold-deep)]">★</span> <b className="text-ink">{winner.rating?.toFixed(1)}</b> ({winner.ratingCount})
                    </Tag>
                  ) : null}
                  {winner.cuisine ? <Tag>{winner.cuisine}</Tag> : null}
                  {winner.priceRange ? <Tag>{winner.priceRange}</Tag> : null}
                  {winner.travelMinutes != null && winner.travelMode ? (
                    <Tag>
                      {ot(winner.travelMode === 'walking' ? 'food.geo.walkMin' : 'food.geo.driveMin', { n: winner.travelMinutes })}
                    </Tag>
                  ) : winner.distance ? (
                    <Tag>{distanceLabel(ot, winner.distance)}</Tag>
                  ) : null}
                </div>

                {winner.note ? <p dir="auto" className="mt-2 text-xs leading-relaxed text-ink-soft">{winner.note}</p> : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="primary" className="min-h-11" disabled={visitLogged} onClick={() => void logVisit(winner.id)}>
                    {visitLogged ? `✓ ${ot('food.random.logged')}` : ot('food.random.goThere')}
                  </Button>
                  {/*
                    * ★ ปุ่ม "ไปเลย" — ใช้ลิงก์เส้นทางถ้ารู้พิกัดทั้งสองฝั่ง
                    *   ร้านไม่มีพิกัด → ค้นด้วยชื่อร้าน ไม่ใช่ซ่อนปุ่ม
                    */}
                  <a
                    href={
                      winner.lat != null && winner.lng != null && office
                        ? directionsUrl(office.lat, office.lng, winner.lat, winner.lng, winner.travelMode ?? 'walking')
                        : winner.mapUrl || searchUrl(winner.name)
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-hover"
                  >
                    📍 {ot('food.random.goNow')}
                  </a>
                  {/* ★★ "กินร้านนี้แล้ว · สร้างบิล" — สุ่ม → ไปกิน → จ่าย → หาร ต่อกันได้ในทางเดียว */}
                  <Link
                    href={`/office/wallet/create?shop=${winner.id}`}
                    className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-hover"
                  >
                    🧾 <Untranslated>{ot('food.billFromShop')}</Untranslated>
                  </Link>
                  <Link
                    href={`/office/food/picks/${winner.id}`}
                    className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-link hover:bg-surface"
                  >
                    <Untranslated>{ot('food.detail')}</Untranslated>
                  </Link>
                </div>

                {/* ★ ตัดร้านนี้ออกชั่วคราวแล้วหมุนใหม่ (หัวข้อ 8.2.1) */}
                <button
                  type="button"
                  onClick={() => {
                    toggleExcluded(winner.id)
                    setWinner(null)
                    /* ★ ตัดร้านออกแล้วต้องจับฉลากใหม่ — ใบเดิมอาจเป็นร้านที่เพิ่งตัดทิ้ง */
                    setSpinToken((t) => t + 1)
                  }}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full text-sm text-ink-soft transition-colors hover:bg-surface hover:text-danger"
                >
                  🙅 {ot('food.random.exclude')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mkt-panel rounded-[28px] p-6 text-center">
              <span aria-hidden="true" className="food-wait inline-block text-5xl">🤔</span>
              <p className="mt-3 text-base font-bold text-ink">
                <Untranslated>{ot('food.random.waitTitle')}</Untranslated>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                <Untranslated>{ot('food.random.waitHint')}</Untranslated>
              </p>
            </div>
          )}

          {/* ── ร้านในวงล้อ: แตะเพื่อตัดออก/เอากลับ ── */}
          {eligible.length > 0 ? (
            <div className="mkt-panel rounded-[28px] p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-ink">
                  <Untranslated>{ot('food.random.poolTitle')}</Untranslated>
                </p>
                <span className="text-xs font-semibold tabular-nums text-ink-soft">
                  {pool.length}/{eligible.length}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
                <Untranslated>{ot('food.random.poolHint')}</Untranslated>
              </p>
              <div className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto overscroll-contain pe-1">
                {eligible.map((r) => {
                  const out = filters.excluded.has(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={!out}
                      onClick={() => {
                        toggleExcluded(r.id)
                        setSpinToken((t) => t + 1)
                      }}
                      className={cn(
                        'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors sm:min-h-8',
                        out
                          ? 'bg-surface/60 text-ink-faint line-through decoration-2'
                          : 'bg-surface text-ink hover:bg-surface-hover',
                      )}
                    >
                      <span aria-hidden="true">{out ? '✕' : '✓'}</span>
                      <span dir="auto" className="max-w-40 truncate">{r.name}</span>
                      {recent.ids.has(r.id) && avoidRecent && !out ? (
                        <span className="rounded-full bg-warn/15 px-1.5 text-[10px] text-warn">
                          <Untranslated>{ot('food.random.recentTag')}</Untranslated>
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1">{children}</span>
}

