'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListingGallery } from './ListingGallery'
import { ChatAvatar } from './ChatAvatar'
import { ShareLink } from './ShareLink'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
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

/** หน้าประกาศทั้งหมด / ของฉัน (FR-D03–D07, D10) */
export function MarketList({ mineOnly = false, selfId }: { mineOnly?: boolean; selfId: string }) {
  const ot = useOt()
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

  async function act(id: string, body: Record<string, unknown>, msg?: string) {
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

  async function remove(id: string) {
    if (!window.confirm(ot('confirm.deleteListing'))) return
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

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">{ot('market.count', { n: shown.length })}</p>
        </div>
        <Link
          href="/office/market/post"
          className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          {ot('market.post')}
        </Link>
      </div>

      {/* ── ตัวกรอง ─────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3">
        <Input radius="round"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder={ot('market.searchPlaceholder')}
          className="max-w-sm"
        />
        {/*
          * ★★★ แถวแรกคือ "ของใคร" กับ "เรียงยังไง" — สองอย่างที่เปลี่ยนบ่อยที่สุด
          *
          *     ★ หมวดกับชนิดเป็นการค้นหา ซึ่งทำครั้งเดียวแล้วอยู่ยาว
          *       ★★ ส่วนการเรียงกับ "ที่ฉันจองไว้" เป็นการสลับมุมมอง
          *          ซึ่งคนกดไปกดมาหลายรอบในคราวเดียว
          *     ★ ของที่กดบ่อยกว่าควรอยู่บนและไม่ต้องเลื่อนหา
          */}
        <div className="flex flex-wrap items-center gap-1.5">
          {OWNERS.map((o) => (
            <Chip
              key={o}
              active={filters.owner === o}
              onClick={() => setFilters((f) => ({ ...f, owner: o }))}
            >
              <Untranslated>{ot(`market.owner.${o}` as OfficeKey)}</Untranslated>
            </Chip>
          ))}

          <span className="mx-1 w-px self-stretch bg-line" />

          {/*
            * ★★ ใช้ <select> ไม่ใช่ชิปสี่อัน
            *    ★ การเรียงเลือกได้ทีละอย่างเสมอ ★★ ชิปที่เลือกได้ทีละอัน
            *       หน้าตาเหมือนชิปที่เลือกได้หลายอันเป๊ะ — คนจะพยายามกดสองอัน
            *    ★ และ select กินที่บรรทัดเดียวบนมือถือ ส่วนชิปสี่อันกินสองบรรทัด
            */}
          <label className="flex items-center gap-1.5 text-xs text-ink-faint">
            <span className="hidden sm:inline">
              <Untranslated>{ot('market.sort')}</Untranslated>
            </span>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as MarketSort }))}
              aria-label={ot('market.sort')}
              className="h-8 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
            >
              {SORTS.map((o) => (
                <option key={o} value={o}>
                  {ot(`market.sort.${o}` as OfficeKey)}
                </option>
              ))}
            </select>
          </label>

          {active > 0 ? (
            <button
              type="button"
              onClick={() => setFilters(emptyMarketFilters())}
              className="ms-auto h-8 rounded-full px-3 text-[13px] text-link transition-colors hover:bg-surface"
            >
              <Untranslated>{ot('market.clearFilters', { n: active })}</Untranslated>
            </button>
          ) : null}
        </div>

        {/* ── ช่วงราคา ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs text-ink-faint">
            <Untranslated>{ot('market.price')}</Untranslated>
          </span>
          {PRICE_BANDS.map((b) => (
            <Chip
              key={b.id}
              active={filters.band === b.id}
              onClick={() => setFilters((f) => ({ ...f, band: f.band === b.id ? null : b.id }))}
            >
              <Untranslated>{ot(`market.price.${b.id}` as OfficeKey)}</Untranslated>
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Chip active={!filters.kind} onClick={() => setFilters((f) => ({ ...f, kind: null }))}>
            {ot('market.allKinds')}
          </Chip>
          {KINDS.map((k) => (
            <Chip
              key={k}
              active={filters.kind === k}
              onClick={() => setFilters((f) => ({ ...f, kind: f.kind === k ? null : k }))}
            >
              {kindLabel(ot, k)}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" />
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={filters.category === c}
              onClick={() => setFilters((f) => ({ ...f, category: f.category === c ? null : c }))}
            >
              {categoryLabel(ot, c)}
            </Chip>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="col-span-full py-10 text-center text-sm text-ink-faint">
            {ot('common.loading')}
          </p>
        ) : shown.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2'}
              title={ot('market.empty')}
              description={ot('market.emptyHint')}
            />
          </div>
        ) : (
          shown.map((l) => (
            <Card
              key={l.id}
              listing={l}
              busy={busy === l.id}
              note={note[l.id]}
              onAct={(body, msg) => void act(l.id, body, msg)}
              onRemove={() => void remove(l.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function Card({
  listing: l,
  busy,
  note,
  onAct,
  onRemove,
}: {
  listing: Listing
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
        'market-card group flex flex-col overflow-hidden rounded-2xl border border-line bg-elevated/50 backdrop-blur-md',
        l.status === 'SOLD' && 'is-sold',
        /* ★ ประกาศที่ถูกซ่อนมีขอบแดง — เจ้าของเห็นแต่คนอื่นไม่เห็น (FR-X08) */
        l.hidden && 'border-danger',
      )}
    >
      {/*
        * ★★★ ส่วนหัวรูปมีเสมอ แม้ประกาศจะไม่มีรูป
        *
        *     ★ เดิมประกาศที่ไม่มีรูปจะไม่มีบล็อกนี้เลย ★★ พอวางเรียงในตาราง
        *       การ์ดจะสูงไม่เท่ากันและหัวการ์ดอยู่คนละระดับทั้งแถว
        *     ★ ช่องว่างที่มีลวดลายยังดูตั้งใจกว่าการ์ดที่หัวหายไป
        *
        * ★★ ราคาย้ายมาทับบนรูป ไม่ใช่บรรทัดใต้ชื่อ
        *    ★ ราคาคือสิ่งที่ตาหาเป็นอันดับแรกในหน้าตลาด การวางทับบนรูป
        *      ทำให้กวาดตาทั้งตารางแล้วเทียบราคาได้โดยไม่ต้องอ่านอย่างอื่นเลย
        */}
      {/*
        * ★★★ รูปทั้งบล็อกเป็นลิงก์เข้าหน้ารายละเอียด
        *
        *     ★ ผู้ใช้ทักมาตรง ๆ ว่า "อัปรูปได้ ก็ต้องเข้าไปดูรายละเอียดได้"
        *       ★★ ซึ่งถูก — ระบบให้ลงรูปได้ 5 ใบ แต่ทั้งหน้าตลาดโชว์ใบเดียว
        *          และไม่มีทางไปดูที่เหลือเลยสักทาง
        *     ★ รูปเป็นเป้ากดที่ใหญ่ที่สุดในการ์ด และเป็นที่ที่นิ้วไปอยู่แล้ว
        */}
      <Link href={`/office/market/${l.id}`} className="market-media relative block overflow-hidden">
        <ListingGallery images={l.images} alt={l.title} compact />

        <span className="market-scrim" aria-hidden="true" />

        <span className="market-status absolute end-2.5 top-2.5">{statusLabel(ot, l.status)}</span>

        <span className="absolute bottom-2.5 start-3 text-[19px] font-bold tabular-nums text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]">
          {priceLabel(ot, locale, l)}
        </span>

        {/* ★ จำนวนรูปบอกตั้งแต่ในการ์ด — คนจะได้รู้ว่ากดเข้าไปแล้วมีอะไรให้ดูต่อ */}
        {l.images.length > 1 ? (
          <span className="absolute start-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
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
          <p className="mb-2 rounded-xl bg-danger/15 px-2 py-1 text-xs text-danger">
            {ot('market.hidden')}
          </p>
        ) : null}

        {/*
          * ★★★ dir="auto" บนทุกช่องที่ผู้ใช้พิมพ์เอง
          *
          *     ★ ชื่อประกาศกับคำบรรยายมาจากคนขาย ไม่ใช่ดิกชันนารีของเรา
          *       ★★ คนขายที่พิมพ์ภาษาอาหรับจะได้ทิศผิดทั้งบรรทัดถ้าไม่มี dir
          *     ★ และเป็นเครื่องหมายให้ด่าน i18n รู้ว่า "ของผู้ใช้ ไม่ใช่ของเรา" —
          *       ★★ ไม่งั้นด่านจะฟ้องว่า "ข้อความไทยหลุด" ทุกครั้งที่มีคนไทย
          *          ลงประกาศ ทั้งที่ไม่มีอะไรผิด (จับได้ตอนเจอประกาศ "ยางรถ"
          *          โผล่ในหน้าภาษาเยอรมัน)
          */}
        <h2 className="text-[15px] font-semibold leading-snug">
          <Link
            href={`/office/market/${l.id}`}
            dir="auto"
            className="text-ink transition-colors hover:text-link"
          >
            {l.title}
          </Link>
        </h2>

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-faint">
          <Tag>{kindLabel(ot, l.kind)}</Tag>
          <Tag>{categoryLabel(ot, l.category)}</Tag>
          {l.condition ? <Tag>{conditionLabel(ot, l.condition)}</Tag> : null}
        </div>

        {l.description ? (
          <p dir="auto" className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">{l.description}</p>
        ) : null}

        {meet ? (
          <p className="mt-2 text-xs text-ink-faint">
            {ot('market.meet')}: <span dir="auto">{meet}</span>
          </p>
        ) : null}

        {/*
          * ★★★ คนขายเป็นแถวของตัวเอง มีรูป ไม่ใช่บรรทัดจาง ๆ ต่อท้าย
          *
          *     ★ ของมือสองซื้อขายกันด้วยความไว้ใจ — คำถามแรกของคนซื้อคือ
          *       "ใครขาย" ไม่ใช่ "หมวดอะไร"
          *       ★★ เดิมชื่อคนขายเป็น text-ink-faint ขนาด 12px ต่อท้ายบรรทัด
          *          ที่มีจำนวนคนสนใจปนอยู่ด้วย ★ ซึ่งอ่านเป็นข้อมูลประกอบ
          *          ไม่ใช่ตัวตนของคน
          *     ★ รูปโปรไฟล์ทำให้จำได้ว่า "คนนี้คือคนที่นั่งโต๊ะข้าง ๆ" ซึ่ง
          *       เป็นเหตุผลทั้งหมดที่ตลาดนัดในออฟฟิศใช้งานได้
          */}
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <ChatAvatar name={l.sellerName ?? '—'} url={l.sellerAvatar} size={28} />
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
            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
              {ot('market.queue', { n: l.queueCount })}
            </span>
          ) : null}
        </div>

        {l.myQueuePosition > 0 ? (
          <p className="mt-2 rounded-xl bg-link/10 px-2.5 py-1 text-xs font-medium text-link">
            {ot('market.myQueue', { n: l.myQueuePosition })}
          </p>
        ) : null}

        {/* ★ mt-auto ดันแถวปุ่มไปชิดท้ายการ์ด ★★ ประกาศที่มีคำอธิบายยาว
            กับสั้นจึงมีปุ่มอยู่ระดับเดียวกัน ไม่ลอยอยู่กลางการ์ดคนละที่ */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          {l.canManage ? (
            <>
              {l.status !== 'SOLD' ? (
                <Button size="sm" loading={busy} onClick={() => onAct({ action: 'status', status: 'SOLD' })}>
                  {ot('market.markSold')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() => onAct({ action: 'status', status: 'AVAILABLE' })}
                >
                  {ot('market.markAvailable')}
                </Button>
              )}
              <Button size="sm" variant="danger" loading={busy} onClick={onRemove}>
                {ot('common.delete')}
              </Button>
            </>
          ) : (
            <>
              {l.status !== 'SOLD' ? (
                <Button
                  size="sm"
                  variant={l.myQueuePosition > 0 ? 'secondary' : 'primary'}
                  loading={busy}
                  onClick={() => onAct({ action: 'reserve' })}
                >
                  {l.myQueuePosition > 0 ? ot('market.cancelReserve') : ot('market.reserve')}
                </Button>
              ) : null}

              {/* ★ FR-D07: ถ้าผู้ขายยังไม่มี QR ต้องบอกตั้งแต่ตรงนี้ */}
              {!l.sellerHasQr && l.kind === 'SELL' ? (
                <span className="self-center text-xs text-ink-faint">
                  {ot('market.sellerNoQr')}
                </span>
              ) : null}

              {/* ★ FR-D08: ทักผู้ขายได้โดยไม่ต้องรู้ว่าเป็นใคร */}
              <Link
                href={`/office/market/chat?listing=${l.id}`}
                className="inline-flex h-8 items-center rounded-full bg-surface px-3 text-sm text-ink transition-colors hover:bg-elevated"
              >
                {ot('market.chat.open')}
              </Link>

              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() => onAct({ action: 'report' }, ot('report.done'))}
              >
                {ot('market.report')}
              </Button>
            </>
          )}

          {/* ★ ปุ่มแชร์แบบย่อ (ไอคอนอย่างเดียว) — แถวปุ่มในการ์ดแคบอยู่แล้ว
                ★★ ใส่คำว่า "แชร์" เข้าไปด้วยจะดันปุ่มอื่นตกบรรทัดบนจอแคบ */}
          <span className="ms-auto">
            <ShareLink path={`/office/market/${l.id}`} title={l.title} compact />
          </span>
        </div>

        {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
      </div>
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
