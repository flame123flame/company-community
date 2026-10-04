'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import {
  categoryLabel,
  conditionLabel,
  kindLabel,
  meetLabel,
  priceLabel,
  statusLabel,
  type Listing,
} from '@/lib/office/market'
import { ChatAvatar } from './ChatAvatar'
import { GalleryWithThumbs } from './ListingGallery'
import { ShareLink } from './ShareLink'
import { marketActConfirm } from './MarketList'

type Queue = { userId: string; name: string; avatarUrl: string | null; position: number; at: string }

/**
 * หน้ารายละเอียดประกาศหนึ่งชิ้น
 *
 * ★★★ มีขึ้นเพราะ "อัปรูปได้ ก็ต้องเข้าไปดูรายละเอียดได้"
 *
 *     ★ เดิมทั้งโมดูลมีแต่หน้ารวมที่เป็นตารางการ์ด ★★ คำบรรยายถูกตัดเหลือ
 *       สองบรรทัด รูปเหลือใบเดียวจากห้าใบ และคิวเหลือแค่ตัวเลข
 *       ★ ซึ่งแปลว่าข้อมูลที่คนขายอุตส่าห์กรอก ไม่มีที่ไหนให้อ่านครบเลย
 *     ★★ และไม่มี URL ที่ชี้ไปที่ประกาศชิ้นเดียวได้ — ส่งลิงก์ให้เพื่อนในแชท
 *        ไม่ได้ ต้องบอกว่า "เลื่อนหาเอานะ อันที่เป็นคีย์บอร์ด"
 *
 * ★★ โหลดเองจาก /api/office/market/[id] ไม่ได้รับ listing มาทาง props
 *    ★ หน้านี้ต้องรีเฟรชตัวเองหลังกดจอง/ยกเลิก ★★ ถ้ารับมาทาง props
 *      จะต้องให้ server component โหลดใหม่ทั้งหน้า ซึ่งช้ากว่าและกระพริบ
 */
/*
 * ★ ไม่รับ selfId — API ตัดสินสิทธิ์มาให้แล้วด้วย canManage / myQueuePosition
 *   ★★ การให้หน้าเว็บเทียบ id เองเป็นการตัดสินสิทธิ์สองที่ด้วยกฎสองชุด
 *      ซึ่งวันหนึ่งจะไม่ตรงกัน แล้วปุ่มจะโผล่ให้คนที่กดไม่ได้
 */
export function MarketDetail({ id }: { id: string }) {
  const ot = useOt()
  const confirm = useConfirm()
  const locale = useLocale()
  const router = useRouter()
  const [listing, setListing] = useState<Listing & { sellerDepartment: string | null } | null>(null)
  const [queue, setQueue] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{
        listing: Listing & { sellerDepartment: string | null }
        queue: Queue[]
      }>(`/api/office/market/${id}`)
      setListing(d.listing)
      setQueue(d.queue)
      setGone(false)
    } catch (e) {
      /*
       * ★★ "ไม่มีประกาศนี้" ไม่ใช่ error ที่ต้องโชว์เป็นแถบแดง
       *    ★ มันเกิดตอนเจ้าของลบประกาศไปแล้ว ซึ่งเป็นเรื่องปกติของตลาดมือสอง
       *      ★★ หน้าจอที่บอกว่า "ของชิ้นนี้ไม่อยู่แล้ว · กลับไปดูอย่างอื่น"
       *         มีประโยชน์กว่าข้อความ error ที่ไม่มีทางไปต่อ
       */
      const code = (e as { code?: string })?.code
      if (code === 'ROOM_NOT_FOUND') setGone(true)
      else setError(officeErrorText(e, ot))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function act(body: Record<string, unknown>, buyerName?: string) {
    const ask = listing ? marketActConfirm(ot, listing, body, { buyerName }) : null
    if (ask && !(await confirm(ask))) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/office/market/${id}`, { method: 'POST', body })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!(await confirm({ kind: 'delete', subject: listing?.title, message: ot('confirm.deleteListing') }))) return
    setBusy(true)
    try {
      await apiFetch(`/api/office/market/${id}`, { method: 'DELETE' })
      router.push('/office/market')
    } catch (e) {
      setError(officeErrorText(e, ot))
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
  }

  if (gone || !listing) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-soft"><Untranslated>{ot('market.gone')}</Untranslated></p>
        <Link
          href="/office/market"
          className="mt-4 inline-flex h-11 sm:h-9 items-center rounded-full bg-surface px-4 text-sm text-ink hover:bg-surface-hover"
        >
          <Untranslated>{ot('market.backToList')}</Untranslated>
        </Link>
      </div>
    )
  }

  const l = listing
  const meet = meetLabel(l.meet)

  return (
    <div className="max-w-5xl py-2">
      <Link
        href="/office/market"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
        <Untranslated>{ot('market.backToList')}</Untranslated>
      </Link>

      {/*
        * ★★ สองคอลัมน์บนจอกว้าง รูปซ้าย ข้อมูลขวา — บนมือถือซ้อนกัน
        *    ★ รูปคือสิ่งที่ตัดสินใจก่อน ข้อมูลคือสิ่งที่ยืนยันทีหลัง
        *      ★★ การวางรูปบนสุดบนมือถือจึงตรงกับลำดับที่คนตัดสินใจจริง
        */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div>
          <GalleryWithThumbs images={l.images} alt={l.title} />
        </div>

        <div className="min-w-0">
          {l.hidden ? (
            <p className="mb-3 rounded-xl bg-danger/15 px-3 py-2 text-xs text-danger">
              {ot('market.hidden')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                l.status === 'SOLD'
                  ? 'bg-surface text-ink-faint'
                  : l.status === 'RESERVED'
                    ? 'bg-warn/20 text-warn'
                    : 'bg-link/15 text-link',
              )}
            >
              {statusLabel(ot, l.status)}
            </span>
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] text-ink-soft">
              {kindLabel(ot, l.kind)}
            </span>
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] text-ink-soft">
              {categoryLabel(ot, l.category)}
            </span>
            {l.condition ? (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] text-ink-soft">
                {conditionLabel(ot, l.condition)}
              </span>
            ) : null}
          </div>

          {/*
            * ★★ h2 ไม่ใช่ h1 — โครงหน้าของโมดูลออฟฟิศวาง h1 "ตลาดนัด" ไว้แล้ว
            *    ★ สอง h1 ในหน้าเดียวทำให้โปรแกรมอ่านหน้าจอบอกไม่ได้ว่า
            *      หน้านี้ "เกี่ยวกับอะไร" — มันได้คำตอบสองคำตอบที่ขัดกัน
            */}
          <h2 dir="auto" className="mt-3 text-[26px] font-bold leading-tight text-ink">
            {l.title}
          </h2>

          <p className="mt-1 text-[28px] font-bold tabular-nums text-accent">
            {priceLabel(ot, locale, l)}
          </p>

          {/*
            * ★★★ การ์ดผู้ขายเป็นบล็อกของตัวเอง ไม่ใช่บรรทัดเล็ก ๆ
            *     ★ คำถามแรกของคนซื้อของมือสองคือ "ใครขาย" ★★ ในออฟฟิศ
            *       คำตอบนั้นสำคัญกว่าสภาพของด้วยซ้ำ เพราะเจอหน้ากันทุกวัน
            */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-3">
            <ChatAvatar name={l.sellerName ?? '—'} url={l.sellerAvatar} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-ink-faint"><Untranslated>{ot('market.seller')}</Untranslated></p>
              <p dir="auto" className="truncate text-[15px] font-semibold text-ink">
                {l.sellerName ?? '—'}
              </p>
              {l.sellerDepartment ? (
                <p dir="auto" className="truncate text-[11.5px] text-ink-soft">
                  {l.sellerDepartment}
                </p>
              ) : null}
            </div>
            {!l.canManage ? (
              <Link
                href={`/office/market/chat?listing=${l.id}`}
                className="shrink-0 inline-flex h-11 sm:h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
              >
                {ot('market.chat.open')}
              </Link>
            ) : null}
          </div>

          {l.description ? (
            /* ★ whitespace-pre-line — คนขายขึ้นบรรทัดใหม่เพื่อแยกหัวข้อ
                 ★★ การยุบเป็นย่อหน้าเดียวทำให้รายการสเปกกลายเป็นพรืด */
            <p dir="auto" className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {l.description}
            </p>
          ) : null}

          <dl className="mt-4 grid gap-2 text-sm">
            {meet ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink-faint">{ot('market.meet')}</dt>
                <dd dir="auto" className="text-ink">{meet}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="shrink-0 text-ink-faint">{ot('market.queue', { n: l.queueCount })}</dt>
            </div>
          </dl>

          {l.myQueuePosition > 0 ? (
            <p className="mt-3 rounded-xl bg-link/10 px-3 py-2 text-sm font-medium text-link">
              {ot('market.myQueue', { n: l.myQueuePosition })}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {/* ── ปุ่ม ─────────────────────────────────────────────── */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {l.canManage ? (
              <>
                {l.status !== 'SOLD' ? (
                  <Button loading={busy} onClick={() => void act({ action: 'status', status: 'SOLD' })}>
                    {ot('market.markSold')}
                  </Button>
                ) : (
                  <Button loading={busy} onClick={() => void act({ action: 'status', status: 'AVAILABLE' })}>
                    {ot('market.markAvailable')}
                  </Button>
                )}
                <Button variant="danger" loading={busy} onClick={() => void remove()}>
                  {ot('common.delete')}
                </Button>
              </>
            ) : (
              <>
                {l.status !== 'SOLD' ? (
                  <Button
                    variant={l.myQueuePosition > 0 ? 'secondary' : 'primary'}
                    loading={busy}
                    onClick={() => void act({ action: 'reserve' })}
                  >
                    {l.myQueuePosition > 0 ? ot('market.cancelReserve') : ot('market.reserve')}
                  </Button>
                ) : null}
                <Button variant="ghost" loading={busy} onClick={() => void act({ action: 'report' })}>
                  {ot('market.report')}
                </Button>
              </>
            )}

            {/* ★ แชร์ได้ทั้งคนขายและคนซื้อ — คนขายก็อยากส่งลิงก์ให้คนที่สนใจ */}
            <ShareLink path={`/office/market/${l.id}`} title={l.title} />
          </div>

          {!l.sellerHasQr && l.kind === 'SELL' && !l.canManage ? (
            <p className="mt-2 text-xs text-ink-faint">{ot('market.sellerNoQr')}</p>
          ) : null}
        </div>
      </div>

      {/*
        * ── คิวคนที่สนใจ ────────────────────────────────────────────
        * ★ เห็นเฉพาะเจ้าของประกาศ (API คืนอาร์เรย์ว่างให้คนอื่น)
        *   ★★ เจ้าของต้องรู้ว่าใครมาก่อนมาหลังเพื่อจะได้ไม่ขายข้ามคิว
        *      ซึ่งเป็นเรื่องที่ทำให้คนในออฟฟิศไม่พอใจกันได้จริง
        */}
      {l.canManage ? (
        <div className="mt-8 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
          <p className="text-sm font-medium text-ink"><Untranslated>{ot('market.queueList')}</Untranslated></p>
          {queue.length === 0 ? (
            <p className="mt-2 text-xs text-ink-faint"><Untranslated>{ot('market.noQueue')}</Untranslated></p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {queue.map((q) => (
                <li key={q.userId} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-ink-faint">
                    {q.position}
                  </span>
                  <ChatAvatar name={q.name} url={q.avatarUrl} size={34} />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-sm text-ink">
                      {q.name}
                    </span>
                  </span>
                  {/* ★ สร้างรายการค้างจ่ายให้คนในคิวได้เลย (FR-D07) —
                        เดิมทำได้เฉพาะจากหน้ารวมซึ่งไม่รู้ว่าใครอยู่คิวไหน */}
                  {l.price > 0 && l.kind === 'SELL' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy}
                      onClick={() => void act({ action: 'bill', buyerId: q.userId }, q.name)}
                    >
                      {ot('market.createDebt')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
