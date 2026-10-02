'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  DISTANCE_OPTIONS,
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
import { SpinWheel, type WheelSlot } from './SpinWheel'

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

  const pool = useMemo(
    () => filterRestaurants(data.items, filters, { forWheel: true }),
    [data.items, filters],
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

  return (
    <div className="py-2">
      <p className="mt-1 text-sm text-ink-soft">
        {ot('food.random.inWheel', { n: pool.length })}
      </p>

      {/* ── ตัวกรองก่อนสุ่ม (FR-A07) ─────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip
          active={filters.onlyPicks}
          onClick={() => setFilters((f) => ({ ...f, onlyPicks: !f.onlyPicks }))}
          title={ot('food.random.onlyPicksHint')}
        >
          ★ {ot('food.random.onlyPicks')}
        </Chip>
        {recent.ids.size > 0 ? (
          <Chip
            active={avoidRecent}
            onClick={() => setAvoidRecent((v) => !v)}
            title={ot('food.random.avoidHint', { days: recent.days })}
          >
            {ot('food.random.avoidRecent')}
          </Chip>
        ) : null}
        <span className="mx-1 w-px self-stretch bg-line" />
        {data.cuisines.map((c) => (
          <Chip
            key={c}
            active={filters.cuisine === c}
            onClick={() => setFilters((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))}
          >
            {c}
          </Chip>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" />
        {PRICE_OPTIONS.map((p) => (
          <Chip
            key={p}
            active={filters.price === p}
            onClick={() => setFilters((f) => ({ ...f, price: f.price === p ? null : p }))}
          >
            {p}
          </Chip>
        ))}
        {DISTANCE_OPTIONS.map((d) => (
          <Chip
            key={d}
            active={filters.distance === d}
            onClick={() => setFilters((f) => ({ ...f, distance: f.distance === d ? null : d }))}
          >
            {distanceLabel(ot, d)}
          </Chip>
        ))}
      </div>

      {/* ── วงล้อ ────────────────────────────────────────────────── */}
      <div className="mt-6">
        {loading ? (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : wheelItems.length < 2 ? (
          <div className="rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-6 text-center">
            <p className="text-sm text-ink-soft">{ot('food.random.needMore')}</p>
            <Link
              href="/office/food/picks"
              className="mt-3 inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
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
              /* ★ id ของช่อง = id ร้านตรง ๆ แล้ว ไม่มี suffix ให้ตัดอีก */
              setWinner(pool.find((r) => r.id === item.id) ?? null)
              setVisitLogged(false)
              /*
               * ★★ จับฉลากใบใหม่ไว้ "หลัง" รอบนี้จบ ไม่ใช่ตอนเริ่มรอบถัดไป
               *
               *    ★ วงล้ออ่าน forcedWinnerId ณ วินาทีที่กดหมุน
               *      ★★ ถ้าไปสุ่มใหม่ตอนกดหมุน ค่าที่วงล้ออ่านได้จะเป็นของ
               *         รอบก่อน เพราะ state ของ React ยังไม่ทันอัปเดต
               *    ★ สุ่มไว้ล่วงหน้าแบบนี้ ผู้ชนะพร้อมอยู่แล้วเสมอตอนกด
               */
              setSpinToken((t) => t + 1)
            }}
          />
        )}
      </div>

      {/* ── ผลการสุ่ม ────────────────────────────────────────────── */}
      {winner ? (
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
          <h2 className="text-lg font-bold text-ink">{winner.name}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{winner.signatureDish}</p>

          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-faint">
            {winner.cuisine ? <Tag>{winner.cuisine}</Tag> : null}
            {winner.priceRange ? <Tag>{winner.priceRange}</Tag> : null}
            {winner.distance ? <Tag>{distanceLabel(ot, winner.distance)}</Tag> : null}
          </div>

          {winner.note ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{winner.note}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={visitLogged}
              onClick={() => void logVisit(winner.id)}
            >
              {visitLogged ? ot('food.random.logged') : ot('food.random.goThere')}
            </Button>

            {/*
              * ★★★ "กินร้านนี้แล้ว · สร้างบิล" — เชื่อมสุ่มอาหารเข้ากับกระเป๋าเงิน
              *
              *     ★ ลำดับจริงของคนคือ สุ่ม → ไปกิน → จ่ายเงิน → หารกัน
              *       ★★ แต่เดิมสามขั้นหลังไม่มีทางเดินต่อจากหน้านี้เลย
              *          คนต้องจำชื่อร้านแล้วไปพิมพ์ใหม่ในหน้าสร้างบิล
              *     ★ ส่งร้านไปทาง query — หน้าสร้างบิลรับ ?shop= อยู่แล้ว (เฟส 2.9)
              */}
            <Link
              href={`/office/wallet/create?shop=${winner.id}`}
              className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
            >
              <Untranslated>{ot('food.billFromShop')}</Untranslated>
            </Link>

            <Link
              href={`/office/food/picks/${winner.id}`}
              className="inline-flex h-11 items-center rounded-full px-3 text-sm text-link hover:underline"
            >
              <Untranslated>{ot('food.detail')}</Untranslated>
            </Link>

            {winner.mapUrl ? (
              <a
                href={winner.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
              >
                {ot('food.picks.openMap')}
              </a>
            ) : null}

            {/* ★ ตัดร้านนี้ออกชั่วคราวแล้วหมุนใหม่ — เอกสารระบุไว้ในหัวข้อ 8.2.1
                ("ตัดร้านที่ไม่เอาออกชั่วคราว") */}
            <Button
              variant="ghost"
              onClick={() => {
                toggleExcluded(winner.id)
                setWinner(null)
                /* ★ ตัดร้านออกแล้วต้องจับฉลากใหม่ — ใบเดิมอาจเป็นร้านที่เพิ่งตัดทิ้ง */
                setSpinToken((t) => t + 1)
              }}
            >
              {ot('food.random.exclude')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ★ แสดงร้านที่ถูกตัดออก พร้อมทางเอากลับ — ไม่งั้นคนจะงงว่าร้านหายไปไหน */}
      {filters.excluded.size > 0 ? (
        <div className="mx-auto mt-4 max-w-md">
          <p className="text-xs text-ink-faint">{ot('food.random.excludedLabel')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[...filters.excluded].map((id) => {
              const r = data.items.find((x) => x.id === id)
              if (!r) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleExcluded(id)}
                  className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink-soft hover:bg-surface-hover hover:text-ink"
                >
                  <span dir="auto">{r.name}</span> ✕
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5">{children}</span>
}

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
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
