'use client'

import { cn } from '@/lib/cn'
import { departmentLabel } from '@/lib/office/departments'
import { useOt } from '@/lib/i18n/office'
import { ChatAvatar } from './ChatAvatar'

/**
 * ของข้างรายการห้อง — สรุปที่ยังไม่ได้อ่าน · เริ่มแชทด่วน · ตัวเลขรวม
 *
 * ★★★ คอลัมน์ซ้ายเดิมมีแค่รายการห้อง ที่เหลือเป็นพื้นว่างครึ่งจอ
 *
 *     ★ พื้นว่างไม่ได้แปลว่าสะอาด มันแปลว่า "ไม่มีอะไรให้ทำต่อ" ทั้งที่
 *       จริง ๆ มีข้อความค้างอยู่และมีคนให้ทักอีกเป็นสิบ
 *     ★★ ของที่เติมลงไปต้องตอบคำถามที่คนเปิดหน้าแชทถามจริง ๆ:
 *        "มีอะไรค้างไหม" · "จะทักใครดี" ★ ไม่ใช่กราฟสวย ๆ ที่ไม่ได้ใช้
 */

type Room = { id: string; kind: 'DM' | 'GROUP'; unread: number }
type Person = { id: string; name: string; department: string | null }

export function ChatUnreadCard({ rooms }: { rooms: Room[] }) {
  const ot = useOt()
  const total = rooms.reduce((sum, r) => sum + r.unread, 0)
  const from = rooms.filter((r) => r.unread > 0).length

  if (total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated/40 px-4 py-3 backdrop-blur-md">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink-soft">
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m4 12.5 5 5L20 7" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{ot('chat.allRead')}</span>
          <span className="block text-xs text-ink-faint">{ot('chat.allReadHint')}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="chat-unread-card flex items-center gap-3 rounded-2xl px-4 py-3">
      {/*
        * ★ วงแหวนหมุนรอบตัวเลข — เป็นสิ่งเดียวในหน้าที่ขยับตอนไม่มีใครแตะอะไร
        *   ★★ ของที่ขยับดึงตาได้เสมอ จึงต้องใช้กับสิ่งที่อยากให้เห็นจริง ๆ
        *      เท่านั้น ที่นี่คือ "มีข้อความค้าง" ซึ่งคือเหตุผลที่คนเปิดหน้านี้
        */}
      <span className="chat-unread-ring grid size-11 shrink-0 place-items-center rounded-full">
        <span className="text-[15px] font-bold text-white tabular-nums">
          {total > 99 ? '99+' : total}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{ot('chat.unreadTotal')}</span>
        <span className="block text-xs text-ink-faint">{ot('chat.unreadFrom', { n: from })}</span>
      </span>
    </div>
  )
}

export function ChatQuickStart({
  people,
  onPick,
}: {
  people: Person[]
  onPick: (id: string) => void
}) {
  const ot = useOt()
  /* ★ แสดงแค่แปดคนแรก — แถบลัดที่ยาวกว่ารายการห้องไม่ใช่ทางลัดแล้ว */
  const shown = people.slice(0, 8)
  if (shown.length === 0) return null

  return (
    <div className="rounded-2xl border border-line bg-elevated/40 p-4 backdrop-blur-md">
      <p className="text-sm font-medium text-ink">{ot('chat.quickStart')}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{ot('chat.quickStartHint')}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            title={departmentLabel(ot, p.department) ?? p.name}
            className="chat-quick group flex items-center gap-2 rounded-full border border-line bg-surface/70 py-1 pe-3 ps-1"
          >
            <ChatAvatar name={p.name} url={null} size={28} />
            <span className="max-w-30 truncate text-xs text-ink-soft group-hover:text-ink">
              <span dir="auto">{p.name}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * หน้าต้อนรับของบานขวาตอนยังไม่เลือกห้อง
 *
 * ★★ เดิมเป็นผนังห้องเปล่า ๆ กับข้อความบรรทัดเดียวกลางจอ
 *    ★ พื้นที่ครึ่งจอที่ไม่บอกอะไรเลยคือการทิ้งโอกาสอธิบายว่าระบบทำอะไรได้
 *      ให้กับคนที่เพิ่งเปิดใช้ครั้งแรก ★★ ซึ่งเป็นคนที่ต้องการคำอธิบายที่สุด
 *
 * ★ ฟองสองใบบนหัวเป็นภาพแทนบทสนทนา วาดด้วย div ไม่ใช่รูป — เปลี่ยนสีตามธีม
 *   ได้เอง และไม่มีไฟล์ให้โหลดเพิ่ม
 */
export function ChatWelcome() {
  const ot = useOt()
  const feats: { icon: string; title: string; hint: string }[] = [
    {
      icon: 'M13 2 4.5 13H11l-1 9 8.5-11H12z',
      title: ot('chat.featRealtime'),
      hint: ot('chat.featRealtimeHint'),
    },
    {
      icon: 'm4 12.5 5 5L20 7',
      title: ot('chat.featRead'),
      hint: ot('chat.featReadHint'),
    },
    {
      icon: 'M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z',
      title: ot('chat.featTyping'),
      hint: ot('chat.featTypingHint'),
    },
    {
      icon: 'M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.3-7.3',
      title: ot('chat.featFile'),
      hint: ot('chat.featFileHint'),
    },
  ]

  return (
    <div className="chat-wall flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="chat-welcome-art" aria-hidden="true">
        <span className="chat-welcome-bubble chat-welcome-bubble-you" />
        <span className="chat-welcome-bubble chat-welcome-bubble-me" />
        <span className="chat-welcome-bubble chat-welcome-bubble-you2" />
      </div>

      <p className="mt-6 text-center text-[17px] font-semibold text-white drop-shadow-sm">
        {ot('chat.welcomeTitle')}
      </p>
      <p className="mt-1.5 max-w-md text-center text-[13px] text-white/80">
        {ot('chat.welcomeHint')}
      </p>

      <div className="mt-7 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
        {feats.map((f, i) => (
          <div
            key={f.title}
            className="chat-feat flex items-start gap-2.5 rounded-2xl px-3.5 py-3"
            style={{ animationDelay: `${120 + i * 80}ms` }}
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-white">
              <svg
                viewBox="0 0 24 24"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={f.icon} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-white">{f.title}</span>
              <span className="block text-[11.5px] leading-snug text-white/70">{f.hint}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChatStats({ rooms }: { rooms: Room[] }) {
  const ot = useOt()
  const groups = rooms.filter((r) => r.kind === 'GROUP').length
  const dms = rooms.length - groups

  const cells: { label: string; value: number }[] = [
    { label: ot('chat.statAll'), value: rooms.length },
    { label: ot('chat.statGroup'), value: groups },
    { label: ot('chat.statDm'), value: dms },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={cn(
            'rounded-2xl border border-line bg-elevated/40 px-3 py-2.5 text-center backdrop-blur-md',
            'chat-stat',
          )}
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="block text-lg font-bold text-ink tabular-nums">{c.value}</span>
          <span className="block text-[11px] text-ink-faint">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
