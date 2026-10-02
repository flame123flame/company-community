'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useOt, type OfficeKey, type Ot } from '@/lib/i18n/office'

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

export function NotificationBell({ userId }: { userId: string }) {
  const ot = useOt()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
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

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label={ot('top.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
        </svg>

        {unread > 0 ? (
          <span
            className={cn(
              'absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full px-1',
              'bg-accent text-[10px] font-bold leading-[18px] text-accent-ink',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            'absolute end-0 z-50 mt-2 w-[min(88vw,22rem)]',
            'overflow-hidden rounded-[var(--radius-card)] border border-line bg-elevated shadow-xl',
          )}
        >
          <div className="notify-head flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{ot('notify.title')}</span>
              {unread > 0 ? (
                <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-[17px] text-accent-ink">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </span>

            {unread > 0 ? (
              /* ★ ทำเป็นปุ่มจริง ไม่ใช่ลิงก์ข้อความ — มันเปลี่ยนสถานะของข้อมูล
                 ไม่ได้พาไปหน้าอื่น ★★ ลิงก์สีฟ้าเล็ก ๆ อ่านเป็น "ไปที่อื่น" */
              <button
                type="button"
                onClick={markAll}
                className={cn(
                  'shrink-0 rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-ink-soft',
                  'transition-colors hover:bg-accent hover:text-accent-ink',
                )}
              >
                {ot('notify.markAll')}
              </button>
            ) : null}
          </div>

          {/* ★ ขอบล่างจางลง — รายการที่ถูกตัดกลางคันตรง ๆ อ่านเป็น "แสดงไม่หมด"
              ★★ ส่วนขอบที่จางบอกว่า "เลื่อนลงต่อได้" ซึ่งเป็นคนละความหมาย */}
          <div className="notify-scroll max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">{ot('notify.empty')}</p>
            ) : (
              items.map((item) => <Row key={item.id} item={item} onGo={() => setOpen(false)} />)
            )}
          </div>
        </div>
      ) : null}
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
  money: { tint: '52 199 123', icon: 'M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.8 7 7s2.6 2.8 5 3.3 5 1.3 5 3.7-2.2 3-5 3-5-.9-5-2.8' },
  chat: { tint: '48 209 176', icon: 'M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z' },
  market: { tint: '10 132 255', icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2' },
  fun: { tint: '175 82 222', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3' },
  warn: { tint: '255 149 0', icon: 'M12 3 2.5 20h19zM12 9v4M12 16.5v.5' },
  other: { tint: '142 142 147', icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9' },
} as const

const KIND_OF: Record<string, (typeof KINDS)[keyof typeof KINDS]> = {
  'notify.type.debtCreated': KINDS.money,
  'notify.type.debtReminder': KINDS.money,
  'notify.type.debtPaidPending': KINDS.money,
  'notify.type.debtNetted': KINDS.money,
  'notify.type.chatMessage': KINDS.chat,
  'notify.type.chatMention': KINDS.chat,
  'notify.type.marketMessage': KINDS.chat,
  'notify.type.marketQueueTurn': KINDS.market,
  'notify.type.marketReserved': KINDS.market,
  'notify.type.marketAlert': KINDS.market,
  'notify.type.drawInvite': KINDS.fun,
  'notify.type.contentHidden': KINDS.warn,
}

function Row({ item, onGo }: { item: Item; onGo: () => void }) {
  const ot = useOt()
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

  const kind = KIND_OF[item.titleKey] ?? KINDS.other

  const body = (
    <div
      className={cn(
        'notify-row flex items-start gap-3 px-4 py-3',
        item.readAt ? 'is-read' : 'is-unread',
      )}
      style={{ '--tint': kind.tint } as CSSProperties}
    >
      {/*
        * ★★★ ไอคอนบอกชนิดของเรื่อง ไม่ใช่แค่จุดแดงบอกว่าอ่านหรือยัง
        *
        *     ★ รายการเดิมเป็นข้อความสิบกว่าบรรทัดหน้าตาเหมือนกันหมด
        *       ★★ ต้องอ่านทุกบรรทัดถึงจะรู้ว่าอันไหนเรื่องเงิน อันไหนเรื่องแชท
        *     ★ ไอคอนที่มีสีประจำเรื่องทำให้กวาดตาแล้วแยกกองได้ทันที
        *       ซึ่งคือสิ่งที่คนทำจริงเวลามีแจ้งเตือนค้าง 18 อัน
        */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
          'text-[rgb(var(--tint))] ring-1 ring-[rgb(var(--tint)/0.28)]',
        )}
        style={{
          background:
            'linear-gradient(145deg, rgb(var(--tint) / 0.22), rgb(var(--tint) / 0.08))',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={kind.icon} />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm leading-snug', item.readAt ? 'text-ink-soft' : 'font-medium text-ink')}>
          {text}
        </p>
        <time dateTime={item.createdAt} className="mt-0.5 block text-[11px] text-ink-faint">
          {formatWhen(ot, item.createdAt)}
        </time>
      </div>

      {/* ★ จุดยังไม่อ่านอยู่ขวา ไม่ใช่ซ้าย — ซ้ายเป็นที่ของไอคอนชนิดแล้ว
          ★★ ยังคงมีทั้งจุดและพื้นหลังที่ต่างกัน เพราะสีอย่างเดียวไม่พอ
             สำหรับคนตาบอดสี */}
      {!item.readAt ? (
        <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
      ) : null}
    </div>
  )

  if (!item.link) return body
  return (
    <Link href={item.link} onClick={onGo} className="block">
      {body}
    </Link>
  )
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
