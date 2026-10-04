'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListingGallery } from './ListingGallery'
import { ChatAvatar } from './ChatAvatar'
import { ShareLink } from './ShareLink'
import { FunGuide } from './FunGuide'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText, type Ot } from '@/lib/i18n/office-format'
import { useConfirm, type ConfirmOptions } from '@/components/ConfirmProvider'
import { Untranslated, useOt, type OfficeKey } from '@/lib/i18n/office'
import {
  CATEGORIES,
  KINDS,
  OWNERS,
  PRICE_BANDS,
  SORTS,
  activeFilterCount,
  categoryLabel,
  conditionLabel,
  emptyMarketFilters,
  filterListings,
  kindLabel,
  meetLabel,
  priceLabel,
  statusLabel,
  type Listing,
  type MarketFilters,
  type MarketSort,
} from '@/lib/office/market'

/**
 * ★ กล่องยืนยันของปุ่มบนประกาศ — ใช้ร่วมกันทั้งการ์ดในรายการและหน้ารายละเอียด
 *   ★★ ทุกปุ่มที่เขียนข้อมูลถาม · คืน null = ปุ่มนี้ไม่ต้องถาม
 */
export function marketActConfirm(
  ot: Ot,
  l: Pick<Listing, 'title' | 'myQueuePosition'>,
  body: Record<string, unknown>,
  extra?: { buyerName?: string },
): ConfirmOptions | null {
  switch (body.action) {
    case 'status':
      return {
        kind: 'edit',
        subject: l.title,
        confirmLabel: body.status === 'SOLD' ? ot('market.markSold') : ot('market.markAvailable'),
      }
    case 'reserve':
      return l.myQueuePosition > 0
        ? { kind: 'danger', subject: l.title, confirmLabel: ot('market.cancelReserve') }
        : { kind: 'create', subject: l.title, confirmLabel: ot('market.reserve') }
    case 'report':
      return { kind: 'danger', subject: l.title, confirmLabel: ot('market.report') }
    case 'bill':
      return {
        kind: 'create',
        subject: extra?.buyerName ? `${l.title} · ${extra.buyerName}` : l.title,
        confirmLabel: ot('market.createDebt'),
      }
    default:
      return null
  }
}

/** หน้าประกาศทั้งหมด / ของฉัน (FR-D03–D07, D10) */
export function MarketList({ mineOnly = false, selfId }: { mineOnly?: boolean; selfId: string }) {
  const ot = useOt()
  const confirm = useConfirm()
  const [items, setItems] = useState<Listing[]>([])
  const [filters, setFilters] = useState<MarketFilters>(emptyMarketFilters)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: Listing[] }>('/api/office/market')
      setItems(d.items)
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
    const base = mineOnly
      ? items.filter((l) => l.sellerId === selfId || l.myQueuePosition > 0)
      : items
    return filterListings(base, filters, selfId)
  }, [items, filters, mineOnly, selfId])

  const active = activeFilterCount(filters)

  async function act(l: Listing, body: Record<string, unknown>, msg?: string) {
    const id = l.id
    const ask = marketActConfirm(ot, l, body)
    if (ask && !(await confirm(ask))) return
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/api/office/market/${id}`, { method: 'POST', body })
      if (msg) {
        setNote((p) => ({ ...p, [id]: msg }))
        window.setTimeout(() => setNote((p) => ({ ...p, [id]: '' })), 4000)
      }
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  async function remove(l: Listing) {
    const id = l.id
    if (!(await confirm({ kind: 'delete', subject: l.title, message: ot('confirm.deleteListing') }))) return
    setBusy(id)
    try {
      await apiFetch(`/api/office/market/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  /* ── ตัวเลขสรุปบนหัวหน้า ── */
  const base = mineOnly ? items.filter((l) => l.sellerId === selfId || l.myQueuePosition > 0) : items
  const stats = mineOnly
    ? [
        { key: 'market.stat.mySelling', n: items.filter((l) => l.sellerId === selfId && l.status !== 'SOLD').length, c: 'var(--color-accent)' },
        { key: 'market.stat.myReserved', n: items.filter((l) => l.myQueuePosition > 0).length, c: 'var(--color-link)' },
        { key: 'market.stat.waiting', n: items.filter((l) => l.sellerId === selfId).reduce((a, l) => a + l.queueCount, 0), c: 'var(--ck-gold-deep)' },
        { key: 'market.stat.sold', n: items.filter((l) => l.sellerId === selfId && l.status === 'SOLD').length, c: 'var(--color-ink-soft)' },
      ]
    : [
        { key: 'market.stat.available', n: base.filter((l) => l.status === 'AVAILABLE').length, c: 'var(--color-accent)' },
        { key: 'market.stat.free', n: base.filter((l) => l.kind === 'FREE' && l.status !== 'SOLD').length, c: 'var(--color-link)' },
        { key: 'market.stat.wanted', n: base.filter((l) => l.kind === 'WANTED' && l.status !== 'SOLD').length, c: 'var(--ck-gold-deep)' },
        { key: 'market.stat.myReserved', n: base.filter((l) => l.myQueuePosition > 0).length, c: 'var(--color-ink-soft)' },
      ]

  return (
    <div className="py-2">
      <FunGuide id={mineOnly ? 'marketMine' : 'market'} art={mineOnly ? 'mine' : 'market'} />

      {/* ═══ ตัวเลขสรุป ═══════════════════════════════════════════ */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="mkt-stat rounded-2xl p-3.5" style={{ '--sc': s.c } as CSSProperties}>
            <p className="text-2xl font-black tabular-nums text-ink">{loading ? '–' : s.n}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <Untranslated>{ot(s.key as OfficeKey)}</Untranslated>
            </p>
          </div>
        ))}
      </div>

      {/* ═══ แถบเครื่องมือ ════════════════════════════════════════ */}
      <section className="mkt-panel mt-4 rounded-3xl p-4 sm:p-5">
        {/* ── ค้นหา + เรียง + ลงประกาศ ── */}
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
              placeholder={ot('market.searchPlaceholder')}
              aria-label={ot('market.searchPlaceholder')}
              className="h-12 w-full rounded-full border border-line bg-input ps-11 pe-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-line-strong sm:text-sm"
            />
          </div>
          {/*
            * ★★ ใช้ <select> ไม่ใช่ชิปสี่อัน — การเรียงเลือกได้ทีละอย่างเสมอ
            *    และกินที่บรรทัดเดียวบนมือถือ
            */}
          <label className="relative flex h-12 items-center rounded-full border border-line bg-elevated ps-4 pe-2 text-xs text-ink-faint">
            <span className="me-1 hidden sm:inline">
              <Untranslated>{ot('market.sort')}</Untranslated>
            </span>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as MarketSort }))}
              aria-label={ot('market.sort')}
              className="h-full bg-transparent pe-1 text-base font-medium text-ink outline-none sm:text-[13px]"
            >
              {SORTS.map((o) => (
                <option key={o} value={o}>
                  {ot(`market.sort.${o}` as OfficeKey)}
                </option>
              ))}
            </select>
          </label>
          <Link
            href="/office/market/post"
            className="team-go inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-bold"
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {ot('market.post')}
          </Link>
        </div>

        {/* ── ของใคร ── */}
        {/*
          * ★★★ "ของใคร" อยู่บนสุดของตัวกรอง — เป็นการสลับมุมมองที่กดบ่อยที่สุด
          *     ส่วนหมวดกับชนิดเป็นการค้นหา ทำครั้งเดียวแล้วอยู่ยาว
          */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div role="group" className="flex flex-wrap rounded-full bg-surface p-1">
            {OWNERS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={filters.owner === o}
                onClick={() => setFilters((f) => ({ ...f, owner: o }))}
                className={cn(
                  'h-10 rounded-full px-3.5 text-[13px] transition-all sm:h-8',
                  filters.owner === o ? 'bg-elevated font-semibold text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                )}
              >
                <Untranslated>{ot(`market.owner.${o}` as OfficeKey)}</Untranslated>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip active={!filters.kind} onClick={() => setFilters((f) => ({ ...f, kind: null }))}>
              {ot('market.allKinds')}
            </Chip>
            {KINDS.map((k) => (
              <Chip key={k} active={filters.kind === k} onClick={() => setFilters((f) => ({ ...f, kind: f.kind === k ? null : k }))}>
                <span aria-hidden="true" className="me-1">{KIND_EMOJI[k]}</span>
                {kindLabel(ot, k)}
              </Chip>
            ))}
          </div>

          {active > 0 ? (
            <button
              type="button"
              onClick={() => setFilters(emptyMarketFilters())}
              className="ms-auto inline-flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-link transition-colors hover:bg-surface sm:h-8"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
              <Untranslated>{ot('market.clearFilters', { n: active })}</Untranslated>
            </button>
          ) : null}
        </div>

        {/* ── หมวดหมู่: แถบเลื่อนแนวนอน มีไอคอน ── */}
        <div className="mkt-rail -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filters.category === c}
              onClick={() => setFilters((f) => ({ ...f, category: f.category === c ? null : c }))}
              className="mkt-cat flex min-w-[5.5rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-2.5"
            >
              <span aria-hidden="true" className="mkt-cat-emoji text-2xl leading-none">{CATEGORY_EMOJI[c]}</span>
              <span className="whitespace-nowrap text-xs font-medium text-ink">{categoryLabel(ot, c)}</span>
            </button>
          ))}
        </div>

        {/* ── ช่วงราคา ── */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs font-medium text-ink-faint">
            <Untranslated>{ot('market.price')}</Untranslated>
          </span>
          {PRICE_BANDS.map((b) => (
            <Chip key={b.id} active={filters.band === b.id} onClick={() => setFilters((f) => ({ ...f, band: f.band === b.id ? null : b.id }))}>
              <Untranslated>{ot(`market.price.${b.id}` as OfficeKey)}</Untranslated>
            </Chip>
          ))}
        </div>
      </section>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <p className="mt-6 text-sm font-semibold text-ink">
        {ot('market.count', { n: shown.length })}
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-line">
              <div className="mkt-skel aspect-[4/3]" />
              <div className="space-y-2 p-4">
                <div className="mkt-skel h-4 w-3/4 rounded-full" />
                <div className="mkt-skel h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))
        ) : shown.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2'}
              title={ot('market.empty')}
              description={ot('market.emptyHint')}
            />
          </div>
        ) : (
          shown.map((l, i) => (
            <Card
              key={l.id}
              index={i}
              listing={l}
              busy={busy === l.id}
              note={note[l.id]}
              onAct={(body, msg) => void act(l, body, msg)}
              onRemove={() => void remove(l)}
            />
          ))
        )}
      </div>
    </div>
  )
}

const KIND_EMOJI: Record<Listing['kind'], string> = { SELL: '🏷️', FREE: '🎁', TRADE: '🔄', WANTED: '🔍' }
const CATEGORY_EMOJI: Record<Listing['category'], string> = {
  ELECTRONICS: '💻',
  FURNITURE: '🪑',
  CLOTHES: '👕',
  BOOKS: '📚',
  SPORTS: '⚽',
  FOOD: '🍱',
  PLANT: '🪴',
  OTHER: '📦',
}

function Card({
  listing: l,
  index,
  busy,
  note,
  onAct,
  onRemove,
}: {
  listing: Listing
  index: number
  busy: boolean
  note?: string
  onAct: (body: Record<string, unknown>, msg?: string) => void
  onRemove: () => void
}) {
  const ot = useOt()
  /* ★ ตัวคั่นหลักพันของราคาต้องเป็นของภาษาที่คนอ่านเลือก ไม่ใช่ th-TH ตายตัว */
  const locale = useLocale()
  const meet = meetLabel(l.meet)

  return (
    <article
      className={cn(
        'market-card mkt-card-in group flex flex-col overflow-hidden rounded-3xl border border-line bg-elevated',
        l.status === 'SOLD' && 'is-sold',
        /* ★ ประกาศที่ถูกซ่อนมีขอบแดง — เจ้าของเห็นแต่คนอื่นไม่เห็น (FR-X08) */
        l.hidden && 'border-danger',
      )}
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
    >
      {/*
        * ★★★ รูปทั้งบล็อกเป็นลิงก์เข้าหน้ารายละเอียด — เป้ากดที่ใหญ่ที่สุดในการ์ด
        * ★★ ราคาทับบนรูป — สิ่งแรกที่ตาหาในหน้าตลาด กวาดตาเทียบได้ทั้งตาราง
        */}
      <Link href={`/office/market/${l.id}`} className="market-media relative block overflow-hidden">
        <ListingGallery images={l.images} alt={l.title} compact />
        <span className="market-scrim" aria-hidden="true" />

        <span className={cn('mkt-kind absolute start-3 top-3', `mkt-kind-${l.kind}`)}>
          <span aria-hidden="true" className="me-1">{KIND_EMOJI[l.kind]}</span>
          {kindLabel(ot, l.kind)}
        </span>
        <span className="market-status absolute end-3 top-3">{statusLabel(ot, l.status)}</span>

        <span className="mkt-price absolute bottom-3 start-3 tabular-nums">{priceLabel(ot, locale, l)}</span>

        {/* ★ จำนวนรูปบอกตั้งแต่ในการ์ด — รู้ว่ากดเข้าไปแล้วมีอะไรให้ดูต่อ */}
        {l.images.length > 1 ? (
          <span className="market-status absolute bottom-3.5 end-3 inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="7" y="3" width="14" height="14" rx="2" />
              <path d="M3 7v12a2 2 0 0 0 2 2h12" />
            </svg>
            {l.images.length}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {l.hidden ? (
          <p className="mb-2 rounded-xl bg-danger/15 px-2 py-1 text-xs text-danger">{ot('market.hidden')}</p>
        ) : null}

        {/* ★★ dir="auto" บนทุกช่องที่ผู้ใช้พิมพ์เอง — ชื่อและคำบรรยายมาจากคนขาย */}
        <h2 className="text-base font-bold leading-snug">
          <Link
            href={`/office/market/${l.id}`}
            dir="auto"
            /* ★ พื้นที่แตะสูงขึ้นโดยไม่ดันเลย์เอาต์ (py + -my หักล้างกัน) */
            className="-my-3 block py-3 text-ink transition-colors hover:text-link"
          >
            {l.title}
          </Link>
        </h2>

        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-ink-soft">
          <Tag>
            <span aria-hidden="true" className="me-1">{CATEGORY_EMOJI[l.category]}</span>
            {categoryLabel(ot, l.category)}
          </Tag>
          {l.condition ? <Tag>{conditionLabel(ot, l.condition)}</Tag> : null}
          {meet ? (
            <Tag>
              <span aria-hidden="true" className="me-1">📍</span>
              <span dir="auto">{meet}</span>
            </Tag>
          ) : null}
        </div>

        {l.description ? (
          <p dir="auto" className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
            {l.description}
          </p>
        ) : null}

        {/*
          * ★★★ คนขายเป็นแถวของตัวเอง มีรูป — ของมือสองซื้อขายกันด้วยความไว้ใจ
          *     คำถามแรกของคนซื้อคือ "ใครขาย" ไม่ใช่ "หมวดอะไร"
          */}
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-surface/70 p-2">
          <ChatAvatar name={l.sellerName ?? '—'} url={l.sellerAvatar} size={32} />
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block truncate text-[13px] font-semibold text-ink">
              {l.sellerName ?? '—'}
            </span>
            {l.sellerDepartment ? (
              <span dir="auto" className="block truncate text-[11px] text-ink-faint">
                {l.sellerDepartment}
              </span>
            ) : null}
          </span>
          {l.queueCount > 0 ? (
            <span className="shrink-0 rounded-full bg-elevated px-2.5 py-1 text-[11px] font-semibold text-ink-soft ring-1 ring-line">
              🔥 {ot('market.queue', { n: l.queueCount })}
            </span>
          ) : null}
        </div>

        {l.myQueuePosition > 0 ? (
          <p className="mt-2 rounded-xl bg-link/10 px-3 py-1.5 text-xs font-semibold text-link">
            {ot('market.myQueue', { n: l.myQueuePosition })}
          </p>
        ) : null}

        {/* ★ FR-D07: ถ้าผู้ขายยังไม่มี QR ต้องบอกตั้งแต่ตรงนี้ */}
        {!l.canManage && !l.sellerHasQr && l.kind === 'SELL' && l.status !== 'SOLD' ? (
          <p className="mt-2 text-[11px] text-ink-faint">{ot('market.sellerNoQr')}</p>
        ) : null}

        {/*
          * ★ mt-auto ดันปุ่มชิดท้ายการ์ด — การ์ดยาวสั้นปุ่มอยู่ระดับเดียวกัน
          * ★★ ปุ่มหลักอยู่แถวของตัวเองเต็มความกว้าง — การ์ดสามคอลัมน์แคบเกินกว่าจะ
          *    วางปุ่มที่มีข้อความสองอันข้างกันโดยไม่ตกบรรทัด
          */}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {l.canManage ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="min-h-11 flex-1"
                loading={busy}
                onClick={() => onAct({ action: 'status', status: l.status !== 'SOLD' ? 'SOLD' : 'AVAILABLE' })}
              >
                {l.status !== 'SOLD' ? ot('market.markSold') : ot('market.markAvailable')}
              </Button>
              <Button size="sm" variant="danger" className="min-h-11" loading={busy} onClick={onRemove}>
                {ot('common.delete')}
              </Button>
              <span className="shrink-0">
                <ShareLink path={`/office/market/${l.id}`} title={l.title} compact />
              </span>
            </div>
          ) : (
            <>
              {l.status !== 'SOLD' ? (
                <Button
                  size="sm"
                  variant={l.myQueuePosition > 0 ? 'secondary' : 'primary'}
                  className="min-h-11 w-full"
                  loading={busy}
                  onClick={() => onAct({ action: 'reserve' })}
                >
                  {l.myQueuePosition > 0 ? ot('market.cancelReserve') : ot('market.reserve')}
                </Button>
              ) : null}

              <div className="flex items-center gap-1">
                {/* ★ FR-D08: ทักผู้ขายได้โดยไม่ต้องรู้ว่าเป็นใคร */}
                <Link
                  href={`/office/market/chat?listing=${l.id}`}
                  className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" />
                  </svg>
                  <span className="truncate">{ot('market.chat.open')}</span>
                </Link>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAct({ action: 'report' }, ot('report.done'))}
                  aria-label={ot('market.report')}
                  title={ot('market.report')}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-danger disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
                  </svg>
                </button>

                <span className="shrink-0">
                  <ShareLink path={`/office/market/${l.id}`} title={l.title} compact />
                </span>
              </div>
            </>
          )}
        </div>

        {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
      </div>
    </article>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1">{children}</span>
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
        'inline-flex h-10 items-center rounded-full px-3.5 text-[13px] transition-colors sm:h-8',
        active ? 'bg-ink font-medium text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
