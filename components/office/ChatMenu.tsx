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
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-full transition-colors',
          open ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
        </svg>
        {/* ★ ป้ายตัวเลขอยู่บนไอคอน ไม่ใช่ข้าง ๆ — แถบบนไม่มีที่ให้กว้างขึ้น */}
        {unread > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-accent-ink">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          /* ★ ตำแหน่งกับความกว้างคุมจาก .chat-pop ใน globals.css
               ★★ เพราะมันต่างกันระหว่างจอแคบกับจอกว้าง ซึ่ง utility เขียนรวม
                  ในบรรทัดเดียวแล้วอ่านไม่ออกว่าอันไหนชนะอันไหน */
          className={cn(
            'chat-pop z-50 overflow-hidden',
            'rounded-2xl border border-line bg-elevated/95 shadow-2xl backdrop-blur-xl',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">{ot('chat.title')}</p>
            <Link
              href="/office/chat"
              onClick={() => setOpen(false)}
              className="text-xs text-link hover:underline"
            >
              {ot('chat.seeAll')}
            </Link>
          </div>

          <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
            {rooms === null ? (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">{ot('common.loading')}</p>
            ) : rooms.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-ink-soft">{ot('chat.empty')}</p>
                <Link
                  href="/office/chat"
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-block text-xs font-medium text-link hover:underline"
                >
                  {ot('chat.newDm')}
                </Link>
              </div>
            ) : (
              rooms.map((r) => (
                <Link
                  key={r.id}
                  href={`/office/chat?room=${r.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface"
                >
                  <span className="who-ava">
                    <ChatAvatar name={r.title} url={r.avatar} group={r.kind === 'GROUP'} size={40} />
                    {/* ★ จุดออนไลน์เฉพาะแชทส่วนตัว — กลุ่มไม่มี "คนเดียว" ให้บอก */}
                    {r.kind === 'DM' && r.peer_id ? (
                      <span
                        className={cn('who-dot', online.has(r.peer_id) && 'who-dot-on')}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        dir="auto"
                        className={cn(
                          'min-w-0 truncate text-[13.5px]',
                          r.unread > 0 ? 'font-semibold text-ink' : 'text-ink',
                        )}
                      >
                        {r.title}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-ink-faint">
                        {shortWhen(ot, r.last_message_at)}
                      </span>
                    </span>
                    <span
                      dir="auto"
                      className={cn(
                        'mt-0.5 block truncate text-[11.5px]',
                        r.unread > 0 ? 'text-ink-soft' : 'text-ink-faint',
                      )}
                    >
                      {r.last_text || ot('chat.noMessage')}
                    </span>
                  </span>

                  {r.unread > 0 && !r.muted ? (
                    <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  ) : null}
                </Link>
              ))
            )}
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
