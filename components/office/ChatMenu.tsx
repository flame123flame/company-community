'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { ChatAvatar } from './ChatAvatar'
import { useOnlinePeople } from './useOnlinePeople'
import { useOt, type Ot } from '@/lib/i18n/office'

type Room = {
  id: string
  kind: 'DM' | 'GROUP'
  title: string
  avatar: string | null
  members: number
  last_text: string | null
  last_message_at: string
  unread: number
  muted: boolean
  /* ★ snake_case เพราะมาจาก RPC ตรง ๆ เหมือน last_text/last_message_at */
  peer_id?: string | null
}

/**
 * เมนูแชทบนแถบบน
 *
 * ★★★ มีไว้เพื่อให้ "ตอบข้อความ" ไม่ต้องออกจากสิ่งที่กำลังทำอยู่
 *
 *     ★ เดิมต้องเดินไปหน้าแชทก่อนถึงจะรู้ว่ามีใครทักมา ★★ ซึ่งแปลว่า
 *       คนที่กำลังกรอกบิลอยู่จะไม่มีทางรู้เลย จนกว่าจะกรอกเสร็จแล้วเดินไปดู
 *     ★ ป้ายตัวเลขบนไอคอนตอบคำถาม "มีอะไรค้างไหม" โดยไม่ต้องกดอะไรเลย
 *
 * ★★ โหลดรายการตอนกดเปิดเท่านั้น ไม่ได้โหลดตั้งแต่หน้าโหลดเสร็จ
 *    ★ เมนูนี้อยู่บนทุกหน้าของเว็บ ★★ ถ้าดึงรายการห้องทุกครั้งที่เปลี่ยนหน้า
 *      จะเป็นการยิงคำขอที่ไม่มีใครดูผลลัพธ์ในกรณีส่วนใหญ่
 *    ★ ยกเว้นตัวนับที่ต้องรู้ตลอด — ดึงแยกเป็นคำขอเบา ๆ ทุก 30 วินาที
 */
export function ChatMenu({ meId }: { meId: string }) {
  const ot = useOt()
  const [open, setOpen] = useState(false)
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [unread, setUnread] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const online = useOnlinePeople(meId)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ rooms: Room[] }>('/api/office/chat')
      setRooms(d.rooms)
      setUnread(d.rooms.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0))
    } catch {
      setRooms([])
    }
  }, [])

  /* ── ตัวนับ: รู้ตลอดแม้ยังไม่เปิดเมนู ───────────────────────── */
  useEffect(() => {
    void load()
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  /* ── กดนอกกล่องแล้วปิด ──────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void load()
        }}
        aria-label={ot('chat.title')}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{ '--hc': '48 209 176' } as React.CSSProperties}
        className={cn(
          'hdr-btn relative grid size-11 shrink-0 place-items-center rounded-full transition-colors sm:size-9',
          open ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
        </svg>
        {/* ★ ป้ายตัวเลขอยู่บนไอคอน ไม่ใช่ข้าง ๆ — แถบบนไม่มีที่ให้กว้างขึ้น */}
        {unread > 0 ? (
          <span className="hdr-badge absolute -end-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-accent-ink">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          /* ★ ตำแหน่งกับความกว้างคุมจาก .chat-pop ใน globals.css (มือถือ fixed · จอกว้าง absolute) */
          className="chat-pop pop-wow z-50 flex max-h-[min(36rem,calc(100dvh-80px))] flex-col overflow-hidden rounded-[26px]"
          style={{ '--pc': '48 209 176', '--pc2': '10 132 255' } as React.CSSProperties}
        >
          {/* ── หัว: แถบไล่สี + จำนวนที่ยังไม่อ่าน + คนออนไลน์ ── */}
          <div className="pop-hero relative shrink-0 overflow-hidden px-4 pb-4 pt-4">
            <span aria-hidden="true" className="pop-blob pop-blob-a" />
            <span aria-hidden="true" className="pop-blob pop-blob-b" />
            <div className="relative flex items-center gap-3">
              <span aria-hidden="true" className="pop-icon grid size-12 shrink-0 place-items-center rounded-2xl">
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black leading-tight text-[var(--ck-shine)]">{ot('chat.title')}</p>
                <p className="text-xs font-medium text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
                  {unread > 0 ? ot('chat.popUnread', { n: unread }) : ot('chat.popAllRead')}
                </p>
              </div>
              {online.size > 0 ? (
                <span className="pop-pill inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold">
                  <span aria-hidden="true" className="who-dot-on relative size-2 rounded-full" />
                  {ot('chat.popOnline', { n: online.size })}
                </span>
              ) : null}
            </div>
            <div className="relative mt-3 grid grid-cols-2 gap-2">
              <Link href="/office/chat" onClick={() => setOpen(false)} className="pop-action flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold">
                💬 {ot('chat.newDm')}
              </Link>
              <Link href="/office/chat" onClick={() => setOpen(false)} className="pop-action flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold">
                👥 {ot('chat.newGroup')}
              </Link>
            </div>
          </div>

          {/* ── รายการห้อง ── */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {rooms === null ? (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="mkt-skel size-11 shrink-0 rounded-full" />
                  <span className="flex-1 space-y-1.5">
                    <span className="mkt-skel block h-3 w-1/2 rounded-full" />
                    <span className="mkt-skel block h-2.5 w-3/4 rounded-full" />
                  </span>
                </div>
              ))
            ) : rooms.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <span aria-hidden="true" className="text-4xl">💬</span>
                <p className="mt-2 text-sm text-ink-soft">{ot('chat.empty')}</p>
              </div>
            ) : (
              rooms.map((r, i) => {
                const hot = r.unread > 0 && !r.muted
                return (
                  <Link
                    key={r.id}
                    href={`/office/chat?room=${r.id}`}
                    onClick={() => setOpen(false)}
                    style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
                    className={cn('pop-row flex items-center gap-3 rounded-2xl px-2.5 py-2.5', hot && 'pop-row-hot')}
                  >
                    <span className="who-ava">
                      <ChatAvatar name={r.title} url={r.avatar} group={r.kind === 'GROUP'} size={44} />
                      {/* ★ จุดออนไลน์เฉพาะแชทส่วนตัว — กลุ่มไม่มี "คนเดียว" ให้บอก */}
                      {r.kind === 'DM' && r.peer_id ? (
                        <span className={cn('who-dot', online.has(r.peer_id) && 'who-dot-on')} aria-hidden="true" />
                      ) : null}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span dir="auto" className={cn('min-w-0 truncate text-[14px] text-ink', hot ? 'font-bold' : 'font-medium')}>
                          {r.title}
                          {r.kind === 'GROUP' ? <span className="ms-1 text-[11px] font-normal text-ink-faint">{r.members}</span> : null}
                        </span>
                        <span className={cn('shrink-0 text-[10.5px]', hot ? 'font-bold text-[rgb(var(--pc))]' : 'text-ink-faint')}>
                          {shortWhen(ot, r.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span dir="auto" className={cn('min-w-0 flex-1 truncate text-[12px]', hot ? 'font-medium text-ink' : 'text-ink-faint')}>
                          {r.muted ? '🔕 ' : ''}
                          {r.last_text || ot('chat.noMessage')}
                        </span>
                        {hot ? (
                          <span className="pop-count grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10.5px] font-black">
                            {r.unread > 99 ? '99+' : r.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                )
              })
            )}
          </div>

          {/* ── ท้าย: ไปหน้าแชทเต็ม ── */}
          <div className="shrink-0 border-t border-line p-2.5">
            <Link href="/office/chat" onClick={() => setOpen(false)} className="pop-cta flex min-h-11 items-center justify-center gap-2 rounded-2xl text-sm font-bold">
              {ot('chat.popOpenAll')}
              <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * เวลาแบบสั้นข้างชื่อห้อง
 *
 * ★ คำนวณฝั่ง client เท่านั้น ห้ามให้ server render ค่านี้
 *   ★★ server กับ browser อยู่คนละเขตเวลาและคนละวินาที → hydration ไม่ตรง
 *      (บทเรียนเดียวกับกระดิ่งแจ้งเตือน)
 */
function shortWhen(ot: Ot, iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return ot('time.justNow')
  if (min < 60) return ot('time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return ot('time.hoursAgo', { n: hr })
  return ot('time.daysAgo', { n: Math.floor(hr / 24) })
}
