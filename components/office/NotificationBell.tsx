'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { formatBaht } from '@/lib/office/wallet'
import { toBaht } from '@/lib/office/money'
import { Untranslated, useOt, type OfficeKey, type Ot } from '@/lib/i18n/office'

/**
 * กระดิ่งแจ้งเตือน (FR-X04)
 *
 * ★★ อัปเดตสองทาง: ดึงตอนเปิด + ฟัง realtime
 *
 *    ดึงอย่างเดียว = ต้องกดรีเฟรชถึงจะเห็นของใหม่
 *    ฟัง realtime อย่างเดียว = ของที่มาตอนปิดแท็บไว้จะไม่เคยโผล่
 *    ★ ต้องมีทั้งคู่ — ดึงตอนเข้าเว็บให้ได้ภาพปัจจุบัน แล้วฟังต่อจากนั้น
 *
 * ★ RLS กรอง realtime ให้เองแล้ว (policy "notifications: read own")
 *   เราจึงไม่ต้องเช็คว่า payload เป็นของเราไหม — Supabase ไม่ส่งของคนอื่นมาเลย
 */

type Item = {
  id: string
  type: string
  titleKey: string
  params: Record<string, unknown>
  link: string | null
  readAt: string | null
  createdAt: string
}

type Payload = { items: Item[]; unread: number }

type Bucket = 'today' | 'yesterday' | 'earlier'

export function NotificationBell({ userId }: { userId: string }) {
  const ot = useOt()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<Payload>('/api/office/notifications')
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* ★ กระดิ่งพังไม่ควรทำให้ทั้งหน้าพัง — เงียบไว้ แล้วลองใหม่รอบหน้า */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* ── realtime ────────────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`notify:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          /*
           * ★ กรองที่ server ด้วย ไม่พึ่ง RLS อย่างเดียว
           *   RLS กันไม่ให้ "เห็น" ของคนอื่นอยู่แล้ว แต่ filter ตัวนี้ทำให้
           *   Supabase ไม่ต้องส่ง event ของทุกคนในบริษัทมาให้ทุกเครื่อง
           *   แล้วค่อยทิ้ง — ประหยัดทั้ง bandwidth และงานของ client
           */
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, load])

  /* ── ปิดเมื่อคลิกนอกกล่อง ────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function markAll() {
    /*
     * ★ อัปเดตหน้าจอก่อนรอ server (optimistic)
     *   การกด "อ่านทั้งหมด" แล้วตัวเลขค้างอยู่ครึ่งวินาทีทำให้คนกดซ้ำ
     *   ถ้า request ล้ม รอบ load() ถัดไปจะแก้ให้ตรงเอง
     */
    setUnread(0)
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })))
    try {
      await apiFetch('/api/office/notifications', { method: 'POST', body: {} })
    } catch {
      void load()
    }
  }

  /**
   * กดอ่านทีละใบ
   *
   * ★★★ ของเดิมกดแล้วไปหน้าปลายทาง แต่ใบนั้นยังนับเป็น "ยังไม่อ่าน" อยู่
   *     ★ คนจึงต้องกด "อ่านทั้งหมด" เพื่อล้างตัวเลข ซึ่งกลืนใบที่เขายังไม่ได้ดู
   *       ไปด้วยทั้งหมด ★★ แล้วตัวเลขบนกระดิ่งก็เลิกมีความหมาย
   */
  const markOne = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, readAt: i.readAt ?? new Date().toISOString() } : i)),
    )
    setUnread((n) => Math.max(0, n - 1))
    void apiFetch('/api/office/notifications', { method: 'POST', body: { ids: [id] } }).catch(
      () => {},
    )
  }, [])

  const shown = onlyUnread ? items.filter((i) => !i.readAt) : items

  /*
   * ★★★ จัดกองตามวัน ไม่ใช่กองเดียวยาว 30 บรรทัด
   *
   *     ★ "1 วันที่แล้ว" ซ้ำกันแปดบรรทัดติดไม่ได้บอกอะไร — มันบอกว่า
   *       ทั้งแปดใบเกิดในช่วงเดียวกัน ซึ่งหัวข้อบรรทัดเดียวพูดได้ดีกว่า
   *       ★★ และทำให้ตากวาดหาของใหม่ได้โดยไม่ต้องอ่านเวลาทีละใบ
   */
  const groups = useMemo(() => groupByDay(shown), [shown])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label={ot('top.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ '--hc': '255 176 32' } as React.CSSProperties}
        className="hdr-btn relative grid size-11 place-items-center rounded-full text-ink transition-colors hover:bg-surface sm:size-10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('size-5', unread > 0 && 'bell-swing')}
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
        </svg>

        {unread > 0 ? (
          <span
            className={cn(
              'hdr-badge absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full px-1',
              'bg-accent text-[10px] font-bold leading-[18px] text-accent-ink',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/*
            * ★★★ บนมือถือเป็นแผ่นเลื่อนขึ้นจากขอบล่าง ไม่ใช่เมนูหล่นลงมา
            *
            *     ★ เมนูที่หล่นลงจากกระดิ่งซึ่งอยู่มุมบนขวา ต้องใช้ความสูง
            *       เกือบทั้งจอ แล้วก้นกล่องจะเลยขอบล่างออกไป
            *       ★★ ซึ่งเป็นสิ่งที่เกิดขึ้นจริง — รายการล่าง ๆ ถูกตัดหายไป
            *          โดยไม่มีอะไรบอกว่ามันยังมีอยู่
            *     ★ แผ่นจากขอบล่างยังอยู่ใกล้นิ้วโป้งด้วย ต่างจากมุมบนขวา
            */}
          <button
            type="button"
            aria-label={ot('common.close')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] sm:hidden"
          />

          <div
            className={cn(
              'notify-panel fixed inset-x-2 bottom-2 z-50 flex max-h-[82vh] flex-col',
              'sm:absolute sm:inset-x-auto sm:bottom-auto sm:end-0 sm:mt-2 sm:max-h-[min(34rem,80vh)] sm:w-[24rem]',
              'pop-wow overflow-hidden rounded-[26px]',
            )}
            style={{ '--pc': '255 176 32', '--pc2': '255 0 51' } as CSSProperties}
          >
            {/* ── หัวกล่อง: แถบไล่สีทอง-แดง + กระดิ่ง + จำนวนที่ยังไม่อ่าน ── */}
            <div className="pop-hero relative shrink-0 overflow-hidden px-4 pb-3.5 pt-4">
              <span aria-hidden="true" className="pop-blob pop-blob-a" />
              <span aria-hidden="true" className="pop-blob pop-blob-b" />
              <div className="relative flex items-center gap-3">
                <span aria-hidden="true" className="pop-icon grid size-12 shrink-0 place-items-center rounded-2xl">
                  <svg viewBox="0 0 24 24" className={cn('size-6', unread > 0 && 'bell-swing')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black leading-tight text-[var(--ck-shine)]">{ot('notify.title')}</p>
                  <p className="text-xs font-medium text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
                    <Untranslated>{unread > 0 ? ot('notify.popUnread', { n: unread }) : ot('notify.popAllClear')}</Untranslated>
                  </p>
                </div>
                {unread > 0 ? (
                  /* ★ ปุ่มจริง ไม่ใช่ลิงก์ — มันเปลี่ยนสถานะของข้อมูล ไม่ได้พาไปหน้าอื่น */
                  <button type="button" onClick={markAll} className="pop-pill shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-transform hover:scale-105">
                    ✓ {ot('notify.markAll')}
                  </button>
                ) : null}
              </div>

              {/* ★★ ตัวกรอง "ยังไม่อ่าน" — ขึ้นเฉพาะเมื่อมีของให้กรองจริง */}
              {unread > 0 ? (
                <div className="pop-seg relative mt-3 grid grid-cols-2 rounded-full p-1">
                  <Tab on={!onlyUnread} onClick={() => setOnlyUnread(false)}>
                    <Untranslated>{ot('notify.filterAll')}</Untranslated>
                    <Count>{items.length}</Count>
                  </Tab>
                  <Tab on={onlyUnread} onClick={() => setOnlyUnread(true)}>
                    <Untranslated>{ot('notify.filterUnread')}</Untranslated>
                    <Count>{unread}</Count>
                  </Tab>
                </div>
              ) : null}
            </div>

            {/* ★ ขอบล่างจางลง — รายการที่ถูกตัดกลางคันตรง ๆ อ่านเป็น "แสดงไม่หมด"
                ★★ ส่วนขอบที่จางบอกว่า "เลื่อนลงต่อได้" ซึ่งเป็นคนละความหมาย */}
            <div className="notify-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
              {loading && items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-ink-faint">
                  {ot('common.loading')}
                </p>
              ) : shown.length === 0 ? (
                <Empty text={onlyUnread ? ot('notify.emptyUnread') : ot('notify.empty')} />
              ) : (
                groups.map(([bucket, rows]) => (
                  <section key={bucket}>
                    {/*
                      * ★ หัวข้อวันเกาะอยู่บนสุดตอนเลื่อน — พอเลื่อนลงไปลึก ๆ
                      *   ยังรู้ว่ากำลังอ่านของวันไหนอยู่
                      */}
                    <h3 className="notify-day sticky top-0 z-10 flex items-center gap-2 px-3 pb-1.5 pt-3 text-[11px] font-black uppercase tracking-wide text-ink-soft">
                      <Untranslated>{ot(`notify.${bucket}` as OfficeKey)}</Untranslated>
                      <span className="rounded-full bg-surface px-1.5 text-[10px] font-bold tabular-nums text-ink-faint">{rows.length}</span>
                      <span aria-hidden="true" className="h-px flex-1 bg-line" />
                    </h3>
                    <div className="flex flex-col gap-1.5 px-2">
                    {rows.map((item) => (
                      <Row
                        key={item.id}
                        item={item}
                        onGo={() => {
                          markOne(item.id)
                          setOpen(false)
                        }}
                      />
                    ))}
                    </div>
                  </section>
                ))
              )}
            </div>

            {/* ── ท้าย: ตั้งค่าว่าจะรับเรื่องไหน ── */}
            <div className="shrink-0 border-t border-line p-2.5">
              <Link
                href="/office/profile#prof-notify"
                onClick={() => setOpen(false)}
                className="pop-cta flex min-h-11 items-center justify-center gap-2 rounded-2xl text-sm font-bold"
              >
                ⚙️ <Untranslated>{ot('notify.settings')}</Untranslated>
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Tab({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-all',
        on ? 'bg-[var(--ck-shine)] text-[var(--ck-shade)] shadow' : 'text-[color-mix(in_srgb,var(--ck-shine)_88%,transparent)] hover:bg-[color-mix(in_srgb,var(--ck-shine)_15%,transparent)]',
      )}
    >
      {children}
    </button>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] tabular-nums opacity-60">{children}</span>
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <span aria-hidden="true" className="pop-empty mx-auto block text-5xl">
        🎉
      </span>
      <p className="mt-3 text-sm font-medium text-ink-soft">
        <Untranslated>{text}</Untranslated>
      </p>
    </div>
  )
}

/*
 * ชนิดของแจ้งเตือน → ไอคอนและสี
 *
 * ★★ สีเดียวกับโมดูลต้นทางบนหน้าพอร์ทัล ★ แจ้งเตือนเรื่องเงินเป็นสีเขียว
 *    เหมือนการ์ด "กระเป๋าเงิน" — คนจึงเดาได้ว่ากดแล้วไปไหนก่อนกด
 *
 * ★ ไม่รู้จักคีย์ไหนก็ตกมาที่ other ★★ แจ้งเตือนเก่าจากฟีเจอร์ที่ถอดไปแล้ว
 *   ต้องไม่ทำให้ทั้งกล่องพัง — กฎเดียวกับที่ใช้กับข้อความด้านล่าง
 */
const KINDS = {
  /* ★ เงินที่ "ต้องจ่าย" เป็นสีแดงเหมือนการ์ดสรุปบนหน้าแรก ไม่ใช่เขียว
       ★★ ถูกทวงเงินกับได้เงินคืน ไม่ควรหน้าตาเหมือนกัน */
  moneyOut: { tint: '255 59 48', icon: 'M12 19V5M5 12l7-7 7 7' },
  moneyIn: { tint: '52 199 123', icon: 'M12 5v14M5 12l7 7 7-7' },
  money: { tint: '52 199 123', icon: 'M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.8 7 7s2.6 2.8 5 3.3 5 1.3 5 3.7-2.2 3-5 3-5-.9-5-2.8' },
  chat: { tint: '48 209 176', icon: 'M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z' },
  market: { tint: '10 132 255', icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2' },
  fun: { tint: '175 82 222', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3' },
  warn: { tint: '255 149 0', icon: 'M12 3 2.5 20h19zM12 9v4M12 16.5v.5' },
  other: { tint: '142 142 147', icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9' },
} as const

const KIND_OF: Record<string, (typeof KINDS)[keyof typeof KINDS]> = {
  'notify.type.debtCreated': KINDS.moneyOut,
  'notify.type.debtReminder': KINDS.moneyOut,
  'notify.type.debtRejected': KINDS.warn,
  'notify.type.debtPaidPending': KINDS.moneyIn,
  'notify.type.debtNetted': KINDS.money,
  'notify.type.setUpQr': KINDS.money,
  'notify.type.chatMessage': KINDS.chat,
  'notify.type.chatMention': KINDS.chat,
  'notify.type.marketMessage': KINDS.chat,
  'notify.type.marketQueueTurn': KINDS.market,
  'notify.type.marketReserved': KINDS.market,
  'notify.type.marketAlert': KINDS.market,
  'notify.type.drawInvite': KINDS.fun,
  'notify.type.contentHidden': KINDS.warn,
}

/**
 * ข้อมูลที่ params มีอยู่แล้ว แต่ข้อความไม่ได้พูดถึง
 *
 * ★★★ ห้าชนิดเก็บของมีค่าไว้ใน params แล้วทิ้งไปเฉย ๆ
 *
 *     notify.type.debtReminder     เก็บ amount แต่ข้อความคือ "ถูกทวงเงิน"
 *     notify.type.debtPaidPending  เก็บ amount แต่ข้อความไม่บอกยอด
 *     notify.type.debtCreated      เก็บชื่อบิล แต่ข้อความไม่บอกว่าบิลอะไร
 *     notify.type.marketReserved   เก็บชื่อของ แต่ข้อความไม่บอกว่าชิ้นไหน
 *     notify.type.marketQueueTurn  เหมือนกัน
 *
 *     ★ "ถูกทวงเงิน" สามบรรทัดติดกันจึงแยกไม่ออกว่าเรื่องเดียวกันหรือคนละเรื่อง
 *       ★★ ยอดเงินตอบคำถามนั้นได้ทันทีโดยไม่ต้องกดเข้าไปดูทีละใบ
 *
 * ★★ ทำเป็นบรรทัดสองแทนการแก้ข้อความใน 16 ไฟล์
 *    ★ แจ้งเตือนเก่าที่ params ว่างยังอ่านได้เหมือนเดิม ไม่กลายเป็น "{amount}"
 *      โผล่กลางจอ ★★ ซึ่งเป็นสิ่งที่จะเกิดถ้าไปเติมตัวแปรลงในข้อความแทน
 */
function detailOf(item: Item, locale: string): string | null {
  const p = item.params
  const amount = typeof p.amount === 'number' ? p.amount : null
  const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null

  switch (item.titleKey) {
    case 'notify.type.debtReminder':
    case 'notify.type.debtPaidPending':
      /* ★ amount เก็บเป็นสตางค์ในฐานข้อมูล — แปลงก่อนเสมอ */
      return amount === null ? null : `฿${formatBaht(locale, toBaht(amount))}`
    case 'notify.type.debtCreated':
    case 'notify.type.marketReserved':
    case 'notify.type.marketQueueTurn':
      return title
    default:
      return null
  }
}

function Row({ item, onGo }: { item: Item; onGo: () => void }) {
  const ot = useOt()
  const locale = useLocale()
  /*
   * ★ title_key ที่เก็บในฐานข้อมูลอาจเป็นคีย์ที่โค้ดรุ่นนี้ไม่รู้จัก
   *   (แจ้งเตือนเก่าจากฟีเจอร์ที่ถูกถอดออก) — ต้องไม่ทำให้ทั้งกล่องพัง
   *   ถ้าแปลไม่ได้ ให้แสดงคีย์ดิบไปก่อน ดีกว่าหน้าขาว
   */
  /*
   * ★★★ เดิมเช็ก `item.titleKey in OFFICE_TH` ก่อนแปล
   *
   *     ★ ทำแบบนั้นต่อไม่ได้แล้ว — ตารางข้อความอยู่ฝั่ง server และการ import
   *       มันเข้ามาที่นี่จะลากข้อความทั้ง 16 ภาษาเข้าบันเดิลของ browser
   *     ★★ ไม่จำเป็นด้วย: makeOt() คืนชื่อกุญแจเองเมื่อแปลไม่เจอ
   *        ซึ่งเป็นผลเดียวกันเป๊ะกับที่โค้ดเดิมเขียนไว้สองทาง
   */
  const text = ot(item.titleKey as OfficeKey, item.params as Record<string, string | number>)
  const detail = detailOf(item, locale)

  const kind = KIND_OF[item.titleKey] ?? KINDS.other

  const unread = !item.readAt
  const body = (
    <div
      className={cn('notify-row notify-card group/n flex items-center gap-3 rounded-[18px] px-3 py-3', unread ? 'is-unread' : 'is-read')}
      style={{ '--tint': kind.tint } as CSSProperties}
    >
      {/*
        * ★★★ ไอคอนบอกชนิดของเรื่อง (สีประจำโมดูลต้นทาง) — กวาดตาแล้วแยกกองได้ทันที
        *     ★ ยังไม่อ่าน = แผ่นไล่สีทึบ + แสงเรือง · อ่านแล้ว = แผ่นจาง
        */}
      <span aria-hidden="true" className="notify-icon relative grid size-11 shrink-0 place-items-center rounded-2xl">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={kind.icon} />
        </svg>
        {unread ? <span className="notify-ping absolute -end-1 -top-1 size-3 rounded-full" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn('min-w-0 flex-1 text-[13.5px] leading-snug', unread ? 'font-bold text-ink' : 'text-ink-soft')}>{text}</p>
          {unread ? (
            <span className="notify-new shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black">
              <Untranslated>{ot('notify.newBadge')}</Untranslated>
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* ★ ยอดเงิน/ชื่อบิล — แคปซูลสีประจำเรื่อง · dir="auto" เพราะเป็นข้อความที่ผู้ใช้พิมพ์ */}
          {detail ? (
            <span dir="auto" className="notify-detail max-w-full truncate rounded-full px-2.5 py-0.5 text-[12px] font-black tabular-nums">
              {detail}
            </span>
          ) : null}
          <time
            dateTime={item.createdAt}
            /* ★ เวลาเต็มอยู่ใน title — "3 วันที่แล้ว" ตอบไม่ได้ว่าวันไหน */
            title={new Date(item.createdAt).toLocaleString(locale)}
            className="inline-flex items-center gap-1 text-[11px] text-ink-faint"
          >
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {formatWhen(ot, item.createdAt)}
          </time>
        </div>
      </div>

      {/* ★ ลูกศรขึ้นเฉพาะแถวที่กดไปต่อได้ — บอกว่า "แตะแล้วพาไปที่เรื่องนั้น" */}
      {item.link ? (
        <svg viewBox="0 0 24 24" className="notify-go size-4 shrink-0 text-ink-faint rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      ) : null}
    </div>
  )

  if (!item.link) return body
  return (
    <Link href={item.link} onClick={onGo} className="notify-link block rounded-[18px]">
      {body}
    </Link>
  )
}

/**
 * แบ่งกองตามวัน
 *
 * ★ เทียบที่ "วันบนปฏิทิน" ไม่ใช่ "ผ่านมากี่ชั่วโมง"
 *   ★★ ของที่เกิดตอน 23:50 เมื่อคืน ต้องอยู่กอง "เมื่อวาน" ตอนเช้านี้
 *      ไม่ใช่กอง "วันนี้" เพราะเพิ่งผ่านมา 8 ชั่วโมง
 */
function groupByDay(items: Item[]): [Bucket, Item[]][] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = start.getTime()
  const yesterday = today - 86_400_000

  const buckets: Record<Bucket, Item[]> = { today: [], yesterday: [], earlier: [] }
  for (const item of items) {
    const at = Date.parse(item.createdAt)
    if (at >= today) buckets.today.push(item)
    else if (at >= yesterday) buckets.yesterday.push(item)
    else buckets.earlier.push(item)
  }

  return (['today', 'yesterday', 'earlier'] as const)
    .filter((b) => buckets[b].length > 0)
    .map((b) => [b, buckets[b]])
}

/**
 * เวลาแบบ "เมื่อสักครู่ / 5 นาทีที่แล้ว"
 *
 * ★ คำนวณฝั่ง client เท่านั้น ห้ามให้ server render ค่านี้
 *   server กับ browser อยู่คนละเขตเวลาและคนละวินาที → hydration mismatch
 *   (บทเรียนเดียวกับที่ระบบเดิมเจอกับนาฬิกาของเพลง)
 */
function formatWhen(ot: Ot, iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return ot('time.justNow')
  if (min < 60) return ot('time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return ot('time.hoursAgo', { n: hr })
  return ot('time.daysAgo', { n: Math.floor(hr / 24) })
}
