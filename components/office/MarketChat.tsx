'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/client'
import { priceLabel, statusLabel, type ListingKind, type ListingStatus } from '@/lib/office/market'
import { ChatAvatar } from './ChatAvatar'
import { FunGuide } from './FunGuide'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt, type Ot } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'

type Thread = {
  id: string
  listingId: string
  title: string
  withName: string
  withAvatar: string | null
  cover: string | null
  price: number
  kind: ListingKind
  status: ListingStatus
  lastText: string | null
  lastMine: boolean
  iAmSeller: boolean
  unread: number
  lastAt: string
}
type Message = { id: string; text: string; mine: boolean; createdAt: string }

/** ห้องที่กำลังเปิด — อาจยังไม่มี id ถ้าเป็นการทักครั้งแรก */
type Room = {
  threadId: string | null
  listingId: string
  buyerId: string
  title: string
  price?: number
  kind?: ListingKind
  status?: ListingStatus
  cover?: string | null
  withName?: string
  withAvatar?: string | null
  iAmSeller?: boolean
  messages: Message[]
}

/** แชทตลาดนัด (FR-D08) + คำค้นแจ้งเตือน (FR-D09) */
export function MarketChat({ initialListing }: { initialListing?: string }) {
  const ot = useOt()
  const locale = useLocale()
  const [threads, setThreads] = useState<Thread[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const loadThreads = useCallback(async () => {
    try {
      const d = await apiFetch<{ threads: Thread[] }>('/api/office/market/chat')
      setThreads(d.threads)
      return d.threads
    } catch {
      /* เงียบ — กล่องข้อความว่างดีกว่าหน้าพัง */
      return []
    }
  }, [])

  const openThread = useCallback(async (id: string) => {
    try {
      const d = await apiFetch<Omit<Room, 'threadId'>>(`/api/office/market/chat?thread=${id}`)
      setRoom({ ...d, threadId: id })
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  /* ★ มาจากปุ่ม "แชทกับผู้ขาย" — เปิดห้องให้เลย ไม่ต้องกดอีกครั้ง */
  useEffect(() => {
    if (!initialListing) return
    void (async () => {
      try {
        const d = await apiFetch<{
          draft: (Omit<Room, 'messages'> & { threadId: string | null }) | null
        }>(`/api/office/market/chat?listing=${initialListing}`)
        if (!d.draft) return
        if (d.draft.threadId) {
          await openThread(d.draft.threadId)
        } else {
          setRoom({ ...d.draft, messages: [] })
        }
      } catch {
        /* เข้าหน้ากล่องข้อความปกติแทน */
      }
    })()
  }, [initialListing, openThread])

  /* ── realtime: ข้อความใหม่ในห้องที่เปิดอยู่ ─────────────────── */
  useEffect(() => {
    const id = room?.threadId
    if (!id) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`market-chat:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listing_messages',
          filter: `thread_id=eq.${id}`,
        },
        () => {
          void openThread(id)
          void loadThreads()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [room?.threadId, openThread, loadThreads])

  /* ★ เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ — แชทที่ไม่เลื่อนเองต้องลากทุกครั้ง */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [room?.messages.length])

  async function send() {
    if (!room || !text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/market/chat', {
        method: 'POST',
        body: { listingId: room.listingId, buyerId: room.buyerId, text },
      })
      setText('')

      const list = await loadThreads()
      if (room.threadId) {
        await openThread(room.threadId)
      } else {
        /* ★ ข้อความแรกเป็นตัวสร้างห้อง — หา id ที่เพิ่งเกิดจากรายการ */
        const fresh = list.find((t) => t.listingId === room.listingId && !t.iAmSeller)
        if (fresh) await openThread(fresh.id)
      }
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  /* ── ห้องแชท ───────────────────────────────────────────────── */
  if (room) {
    return (
      /*
          * ★★★ ห้องแชทกินพื้นที่เท่าที่หน้ามี ไม่ใช่คอลัมน์แคบกลางจอ
          *
          *     ★ ผู้ใช้ทักมาว่า "ช่องแชทกับผู้ขายเล็กไป เอาใหญ่กว่านี้"
          *       ★★ เดิมเป็น max-w-2xl (672px) ลอยกลางจอ 1280px —
          *          เหลือที่ว่างข้างละ 300px ที่ไม่ได้ทำอะไรเลย
          *     ★ แชทคือที่ที่คนอ่านข้อความยาว ๆ และดูรูปของ ★★ ความกว้าง
          *       ที่มากขึ้นแปลว่าฟองต่อบรรทัดยาวขึ้น ต้องเลื่อนน้อยลง
          * ★★ ขนาดจริงคุมจาก .mkt-room ใน globals.css
          *    ★ มือถือเต็มจอ (fixed) · คอมเป็นการ์ดสูง 100dvh-20rem
          *      ★★ สองพฤติกรรมนี้เขียนรวมใน utility บรรทัดเดียวไม่ได้
          *         เพราะมันเปลี่ยนทั้ง position · border-radius · max-width
          *    ★ พื้นหลังทึบขึ้นบนมือถือ (bg-elevated/95) เพราะมันลอยทับเนื้อหา
          *      ★★ โปร่งเกินไปจะเห็นตัวหนังสือของหน้าข้างหลังทะลุขึ้นมา
          */
        <div className="mkt-room mx-auto flex w-full flex-col overflow-hidden border-line bg-elevated/95 backdrop-blur-md sm:bg-elevated/50">
        {/*
          * ★★★ หัวห้องบอกสามอย่าง: คุยกับใคร · เรื่องของชิ้นไหน · ราคาเท่าไหร่
          *
          *     ★ เดิมมีแค่ชื่อประกาศเป็นตัวหนังสือเปล่า ๆ ★★ คนที่เปิดห้อง
          *       จากกล่องข้อความต้องจำเองว่าคุยกับใครอยู่
          *     ★ และรูปของเป็นลิงก์กลับไปหน้าประกาศ — ระหว่างคุยกันคนมัก
          *       อยากกลับไปดูรูปอีกรอบ ★★ ซึ่งเดิมต้องถอยออกไปหาใหม่ทั้งหน้า
          */}
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
          <button
            type="button"
            onClick={() => setRoom(null)}
            aria-label={ot('market.chat.back')}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>

          <ChatAvatar name={room.withName ?? '—'} url={room.withAvatar ?? null} size={38} />

          <div className="min-w-0 flex-1">
            <p dir="auto" className="truncate text-[14.5px] font-semibold text-ink">
              {room.withName ?? '—'}
            </p>
            <p className="truncate text-[11.5px] text-ink-faint">
              <Untranslated>{room.iAmSeller ? ot('market.youAreSeller') : ot('market.youAreBuyer')}</Untranslated>
            </p>
          </div>

          <Link
            href={`/office/market/${room.listingId}`}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-surface/80 p-1.5 transition-colors hover:bg-surface"
            title={ot('market.detail')}
          >
            {room.cover ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={room.cover} alt="" className="size-9 rounded-lg object-cover" />
            ) : null}
            <span className="hidden min-w-0 max-w-[9rem] sm:block">
              <span dir="auto" className="block truncate text-[12px] font-medium text-ink">
                {room.title}
              </span>
              <span className="block text-[11px] tabular-nums text-ink-soft">
                {priceLabel(ot, locale, { kind: room.kind ?? 'SELL', price: room.price ?? 0 })}
                {room.status && room.status !== 'AVAILABLE'
                  ? ` · ${statusLabel(ot, room.status)}`
                  : ''}
              </span>
            </span>
          </Link>
        </div>

        {/* ★ ใช้ผนังห้องชุดเดียวกับแชทออฟฟิศ — คนเดียวกันใช้ทั้งสองที่
              ★★ ฟองคนละแบบในเว็บเดียวกันอ่านเป็นสองระบบที่ถูกเย็บติดกัน */}
        <div className="chat-wall flex-1 overflow-y-auto px-3 py-4">
          {room.messages.length === 0 ? (
            <div className="grid h-full place-items-center">
              <p className="chat-daypill">{ot('market.chat.empty')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {room.messages.map((m, i) => {
                const prev = room.messages[i - 1]
                const next = room.messages[i + 1]
                const first = !prev || prev.mine !== m.mine
                const last = !next || next.mine !== m.mine
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-end gap-2',
                      m.mine ? 'justify-end' : 'justify-start',
                      first ? 'mt-2' : 'mt-0.5',
                    )}
                  >
                    {!m.mine ? (
                      <span className={cn('shrink-0', !first && 'invisible')}>
                        <ChatAvatar name={room.withName ?? '—'} url={room.withAvatar ?? null} size={30} />
                      </span>
                    ) : null}

                    {m.mine && last ? (
                      <span className="chat-meta shrink-0">{shortTime(m.createdAt)}</span>
                    ) : null}

                    <span
                      dir="auto"
                      className={cn(
                        'bubble max-w-[62%]',
                        m.mine ? 'bubble-me' : 'bubble-you',
                        last && (m.mine ? 'bubble-tail-me' : 'bubble-tail-you'),
                      )}
                    >
                      {m.text}
                    </span>

                    {!m.mine && last ? (
                      <span className="chat-meta shrink-0">{shortTime(m.createdAt)}</span>
                    ) : null}
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {error ? (
          <p role="alert" className="bg-elevated px-4 py-1 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <Input radius="round"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={ot('market.chat.placeholder')}
            maxLength={500}
            aria-label={ot('market.chat.placeholder')}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || busy}
            aria-label={ot('market.chat.send')}
            title={ot('market.chat.send')}
            className={cn('chat-send', text.trim() && !busy && 'chat-send-on')}
          >
            <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
              <path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  /* ── กล่องข้อความ ──────────────────────────────────────────── */
  const unreadTotal = threads.reduce((n, t) => n + t.unread, 0)
  return (
    <div className="py-2">
      <FunGuide id="marketChat" art="chat" />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="mkt-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-center gap-2 px-1 pb-3">
            <h2 className="text-base font-bold text-ink">
              <Untranslated>{ot('market.chat.inboxTitle')}</Untranslated>
            </h2>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-soft">
              {threads.length}
            </span>
            {unreadTotal > 0 ? (
              <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink">
                <span aria-hidden="true" className="ck-live" />
                <Untranslated>{ot('market.chat.unreadN', { n: unreadTotal })}</Untranslated>
              </span>
            ) : null}
          </div>

          {threads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
              <span aria-hidden="true" className="text-5xl">💬</span>
              <p className="mt-3 text-sm font-semibold text-ink">{ot('market.chat.noThreads')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                <Untranslated>{ot('market.chat.noThreadsHint')}</Untranslated>
              </p>
            </div>
          ) : (
            /*
              * ★★★ แถวห้องมีรูปคน + รูปของ + ข้อความล่าสุด
              *     ★ รูปของทางขวาตอบ "เรื่องชิ้นไหน" ได้เร็วกว่าชื่อ
              */
            <div className="flex flex-col gap-1.5">
              {threads.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void openThread(t.id)}
                  style={{ '--i': Math.min(i, 12) } as CSSProperties}
                  className={cn(
                    'mkt-card-in flex items-center gap-3 rounded-2xl p-3 text-start transition-colors',
                    t.unread > 0
                      ? 'bg-accent/8 ring-1 ring-accent/35 hover:bg-accent/12'
                      : 'hover:bg-surface',
                  )}
                >
                  <span className="relative shrink-0">
                    <ChatAvatar name={t.withName} url={t.withAvatar} size={48} />
                    {t.unread > 0 ? (
                      <span className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-elevated">
                        {t.unread > 9 ? '9+' : t.unread}
                      </span>
                    ) : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p dir="auto" className={cn('min-w-0 flex-1 truncate text-[15px] text-ink', t.unread > 0 ? 'font-bold' : 'font-semibold')}>
                        {t.withName}
                      </p>
                      <span className={cn('shrink-0 text-[11px]', t.unread > 0 ? 'font-semibold text-accent' : 'text-ink-faint')}>
                        {shortWhen(ot, t.lastAt)}
                      </span>
                    </div>
                    <p dir="auto" className={cn('mt-0.5 truncate text-[13px]', t.unread > 0 ? 'font-medium text-ink' : 'text-ink-soft')}>
                      {/* ★ "คุณ: " นำหน้าข้อความของเรา — อ่านออกว่าใครพูดประโยคสุดท้าย */}
                      {t.lastText ? `${t.lastMine ? ot('market.youSaid') : ''}${t.lastText}` : t.title}
                    </p>
                    <p dir="auto" className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-faint">
                      🏷️ <span className="truncate">{t.title}</span>
                    </p>
                  </div>

                  {t.cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.cover} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-line" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>

        <SearchAlerts />
      </div>
    </div>
  )
}

/** คำค้นแจ้งเตือน (FR-D09) — อยู่หน้าเดียวกับกล่องข้อความเพราะเป็น "ของที่ตามหา" */
function SearchAlerts() {
  const ot = useOt()
  const confirm = useConfirm()
  const [items, setItems] = useState<{ id: string; keyword: string }[]>([])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: { id: string; keyword: string }[] }>(
        '/api/office/market/alerts',
      )
      setItems(d.items)
    } catch {
      /* เงียบ */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(keyword: string, on: boolean) {
    // ★ เพิ่ม/ลบคำแจ้งเตือน = เพิ่ม/ลบรายการ → ยืนยันก่อน (แชทไม่ถาม)
    if (
      !(await confirm({
        kind: on ? 'create' : 'delete',
        subject: keyword,
        confirmLabel: on ? ot('market.alert.add') : ot('market.alert.remove'),
      }))
    )
      return
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/market/alerts', { method: 'POST', body: { keyword, on } })
      setTyped('')
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mkt-panel rounded-3xl p-4 sm:p-5 lg:sticky lg:top-[calc(var(--spacing-header)+16px)]">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--ck-gold)_22%,var(--color-elevated))] text-xl">
          🔔
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-ink">{ot('market.alert.title')}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{ot('market.alert.hint')}</span>
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Input
          radius="round"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed.trim().length >= 2) {
              e.preventDefault()
              void toggle(typed.trim(), true)
            }
          }}
          placeholder={ot('market.alert.placeholder')}
          maxLength={40}
          aria-label={ot('market.alert.add')}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="primary"
          className="min-h-11"
          loading={busy}
          disabled={typed.trim().length < 2}
          onClick={() => void toggle(typed.trim(), true)}
        >
          {ot('market.alert.add')}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface/70 px-3 py-2.5 text-xs text-ink-faint">{ot('market.alert.empty')}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-surface ps-3 text-[13px] font-medium text-ink">
              🔍 <span dir="auto" className="max-w-40 truncate">{a.keyword}</span>
              <button
                type="button"
                onClick={() => void toggle(a.keyword, false)}
                aria-label={`${ot('market.alert.remove')} ${a.keyword}`}
                title={ot('market.alert.remove')}
                className="grid size-11 place-items-center rounded-full text-ink-faint transition-colors hover:text-danger sm:size-9"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] text-ink-faint">{ot('market.alert.max')}</p>
    </section>
  )
}

/**
 * เวลาแบบสั้นข้างชื่อห้อง
 *
 * ★ คำนวณฝั่ง client เท่านั้น — server กับ browser อยู่คนละเขตเวลา
 *   ★★ บทเรียนเดียวกับกระดิ่งแจ้งเตือนและเมนูแชทบนแถบบน
 */
function shortTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/*
 * ★★★ หน่วยเวลามาจากดิกชันนารี ไม่ได้เขียน "น." / "ชม." ลงไปตรง ๆ
 *
 *     ★ เขียนตรง ๆ จะเป็นภาษาไทยบนหน้าภาษาเกาหลี ★★ ซึ่งเป็นสิ่งที่
 *       ด่าน i18n จับได้พอดี และเป็นสิ่งที่ควรจับจริง ๆ ด้วย
 *     ★ กุญแจ time.* มีอยู่แล้วและแปลครบ 16 ภาษา — ไม่ต้องเพิ่มของใหม่
 */
function shortWhen(ot: Ot, iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return ot('time.justNow')
  if (min < 60) return ot('time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return ot('time.hoursAgo', { n: hr })
  return ot('time.daysAgo', { n: Math.floor(hr / 24) })
}
