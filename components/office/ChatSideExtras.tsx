'use client'

import { departmentLabel } from '@/lib/office/departments'
import { Untranslated, useOt } from '@/lib/i18n/office'
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

  /* ★ อ่านครบแล้วไม่ต้องแสดงอะไร — การ์ดนี้มีไว้เตือนของค้างเท่านั้น (เจ้าของสั่งเอาการ์ด "อ่านครบแล้ว" ออก) */
  if (total === 0) return null

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
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
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
export function ChatWelcome({ onNewDm, onNewGroup }: { onNewDm: () => void; onNewGroup: () => void }) {
  const ot = useOt()
  /*
   * ★★ ทุกอย่างที่ห้องแชททำได้ บอกตรงนี้ตอนยังไม่ได้เปิดห้อง — พื้นที่ว่างที่สุดของหน้า
   *    ★ เดิมเป็นแค่ประโยคเดียวกลางผนังสีฟ้า ส่วนการ์ดฟีเจอร์ซ่อนอยู่จนกว่าแอนิเมชันจะเล่น
   */
  const feats: { emoji: string; title: string; hint: string }[] = [
    { emoji: '⚡', title: ot('chat.featRealtime'), hint: ot('chat.featRealtimeHint') },
    { emoji: '📎', title: ot('chat.featFile'), hint: ot('chat.featFileHint') },
    { emoji: '↩️', title: ot('chat.featReply'), hint: ot('chat.featReplyHint') },
    { emoji: '✅', title: ot('chat.featRead'), hint: ot('chat.featReadHint') },
    { emoji: '✍️', title: ot('chat.featTyping'), hint: ot('chat.featTypingHint') },
    { emoji: '🔕', title: ot('chat.featMute'), hint: ot('chat.featMuteHint') },
  ]

  return (
    <div className="chat-wall flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
      <div className="chat-welcome-art" aria-hidden="true">
        <span className="chat-welcome-bubble chat-welcome-bubble-you" />
        <span className="chat-welcome-bubble chat-welcome-bubble-me" />
        <span className="chat-welcome-bubble chat-welcome-bubble-you2" />
      </div>

      <p className="mt-6 text-center text-[22px] font-black text-white drop-shadow-sm">{ot('chat.welcomeTitle')}</p>
      <p className="mt-1.5 max-w-md text-center text-[13px] leading-relaxed text-white/85">{ot('chat.welcomeHint')}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onNewDm}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--ck-shine)] px-5 text-sm font-bold text-[var(--ck-shade)] shadow-lg transition-transform hover:-translate-y-0.5"
        >
          💬 {ot('chat.newDm')}
        </button>
        <button
          type="button"
          onClick={onNewGroup}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-5 text-sm font-bold text-white backdrop-blur transition-transform hover:-translate-y-0.5"
        >
          👥 {ot('chat.newGroup')}
        </button>
      </div>

      <div className="mt-8 grid w-full max-w-3xl gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {feats.map((f) => (
          <div key={f.title} className="chat-feat-card flex items-start gap-3 rounded-2xl px-4 py-3.5">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20 text-xl">
              {f.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold text-white">
                <Untranslated>{f.title}</Untranslated>
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-white/75">
                <Untranslated>{f.hint}</Untranslated>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
