'use client'

import Image from 'next/image'
import { formatDuration } from '@/lib/youtube/duration'
import { cn } from '@/lib/cn'
import type { QueueItemDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * แถวคิว — กดเพื่อเล่นเพลงนั้นทันที แบบ playlist ของ YouTube
 *
 * ★ ทั้งแถวเป็นปุ่ม ไม่ใช่แค่ไอคอนเล็ก ๆ
 *   YouTube ให้กดที่ไหนก็ได้ของแถว พื้นที่กดจึงใหญ่และไม่ต้องเล็งบนมือถือ
 *   ปุ่มลบซ้อนอยู่ข้างในจึงต้องกัน event ไม่ให้ทะลุไปสั่งเล่นเพลง
 *
 * ★ คนที่ไม่มีสิทธิ์กระโดดเพลงจะได้แถวที่กดไม่ได้ (ไม่ใช่กดแล้วขึ้น error)
 *   เคอร์เซอร์เป็นลูกศรปกติ ไม่มี hover — บอกด้วยการมองเห็นว่ากดไม่ได้
 */
export function QueueItem({
  item,
  index,
  canRemove,
  removing,
  onRemove,
  playing = false,
  canPlay = false,
  starting = false,
  onPlay,
  sortable = false,
  dragging = false,
  onSortStart,
  onSortNudge,
  style,
  rowRef,
}: {
  item: QueueItemDto
  index: number
  canRemove: boolean
  removing: boolean
  onRemove: (id: string) => void
  playing?: boolean
  /** มีสิทธิ์กระโดดไปเล่นเพลงนี้ไหม */
  canPlay?: boolean
  /** กำลังสั่งเล่นเพลงนี้อยู่ */
  starting?: boolean
  onPlay?: (id: string) => void
  /** ลากสลับลำดับได้ไหม */
  sortable?: boolean
  /** แถวนี้คือแถวที่กำลังถูกลากอยู่ */
  dragging?: boolean
  onSortStart?: (id: string, event: React.PointerEvent) => void
  onSortNudge?: (id: string, direction: -1 | 1) => void
  style?: React.CSSProperties
  rowRef?: (id: string, el: HTMLElement | null) => void
}) {
  const t = useT()
  const confirm = useConfirm()
  const clickable = canPlay && !playing

  return (
    <li
      ref={(el) => rowRef?.(item.id, el)}
      style={style}
      className={cn(
        'group relative flex items-center gap-2 px-2 py-1.5 transition-colors',
        playing ? 'bg-surface' : clickable ? 'cursor-pointer hover:bg-surface/60' : '',
        // ★ ยกแถวที่ลากให้ลอยขึ้นมาจากพื้น — เงา + สีพื้นทึบ
        //   ถ้าไม่ทำ แถวจะเลื่อนผ่านแถวอื่นแบบโปร่งจนอ่านทับกันไปหมด
        dragging ? 'rounded-lg bg-elevated shadow-2xl ring-1 ring-line-strong' : '',
      )}
      {...(clickable
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': t('room.playSong', { title: item.title }),
            onClick: () => onPlay?.(item.id),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPlay?.(item.id)
              }
            },
          }
        : {})}
    >
      <span className="w-6 shrink-0 text-center text-xs text-ink-faint">
        {playing ? (
          <PlayGlyph className="mx-auto size-3.5 text-ink" />
        ) : starting ? (
          <span className="mx-auto block size-3 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
        ) : (
          <>
            {/* ตัวเลขสลับเป็นสามเหลี่ยม play ตอนชี้เมาส์ — YouTube ทำแบบนี้ */}
            <span className={clickable ? 'group-hover:hidden' : ''}>{index + 1}</span>
            {clickable ? (
              <PlayGlyph className="mx-auto hidden size-3.5 text-ink group-hover:block" />
            ) : null}
          </>
        )}
      </span>

      <div className="relative h-[56px] w-[100px] shrink-0 overflow-hidden rounded bg-surface">
        {item.thumbnailUrl ? (
          <Image src={item.thumbnailUrl} alt="" fill sizes="100px" className="object-cover" unoptimized />
        ) : null}
        <span className="absolute bottom-0.5 end-0.5 rounded bg-black/80 px-1 font-mono text-[10px] leading-4 text-white">
          {formatDuration(item.duration)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p dir="auto" className="line-clamp-2 text-[13px] font-medium leading-[18px]">{item.title}</p>
        <p dir="auto" className="line-clamp-1 mt-0.5 text-[11px] text-ink-soft">
          {item.channelTitle ?? '—'}
          {item.addedBy ? ` · ${item.addedBy.displayName}` : ''}
          {/* ★ ป้ายสั้น ๆ พอ — รายละเอียดเต็มไปโผล่ใต้ชื่อเพลงตอนถึงคิวมันเล่น */}
          {item.dedicatedTo ? ` · 💌 ${item.dedicatedTo.displayName}` : ''}
        </p>
      </div>

      {/**
        * ★★ ปุ่มจับลากอยู่ขวา ไม่ใช่ซ้าย
        *
        *    ซ้ายของแถวคือช่องตัวเลขลำดับ ซึ่งสลับเป็นสามเหลี่ยม play ตอนชี้เมาส์
        *    การเอาที่จับไปแทรกตรงนั้นทำให้สามสิ่งแย่งพื้นที่เดียวกันและผู้ใช้
        *    ต้องเล็งว่าตอนนี้ไอคอนไหนอยู่ตรงนั้น
        *
        *    ★ ขวาว่างอยู่แล้วและเป็นที่ที่ Spotify/Apple Music วางเหมือนกัน
        *
        * ★ touch-action: none จำเป็น ไม่ใช่ของแถม
        *   ถ้าไม่ปิด เบราว์เซอร์บนมือถือจะตีความการลากลงว่า "เลื่อนหน้าจอ"
        *   แล้วยึด pointer ไปเลย — ลากเรียงคิวไม่ได้เลยสักครั้งบนมือถือ
        */}
      {sortable ? (
        <button
          type="button"
          onPointerDown={(e) => onSortStart?.(item.id, e)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              onSortNudge?.(item.id, -1)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              onSortNudge?.(item.id, 1)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('room.reorder', { title: item.title })}
          title={t('room.dragToReorder')}
          style={{ touchAction: 'none' }}
          className={cn(
            'grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-full',
            'text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink',
            'active:cursor-grabbing',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            '[@media(hover:none)]:opacity-100',
            dragging ? 'opacity-100' : '',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M9 4h2v2H9V4zm4 0h2v2h-2V4zM9 9h2v2H9V9zm4 0h2v2h-2V9zm-4 5h2v2H9v-2zm4 0h2v2h-2v-2zm-4 5h2v2H9v-2zm4 0h2v2h-2v-2z" />
          </svg>
        </button>
      ) : null}

      {canRemove ? (
        <button
          type="button"
          // ★ กัน click ทะลุไปสั่งเล่นเพลง — ปุ่มลบอยู่ในแถวที่ตัวมันเองก็กดได้
          onClick={async (e) => {
            e.stopPropagation()
            if (!(await confirm({ kind: 'delete', subject: item.title }))) return
            onRemove(item.id)
          }}
          disabled={removing}
          aria-label={t('room.removeFromQueue', { title: item.title })}
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-ink-soft',
            'opacity-0 transition-all hover:bg-surface-hover hover:text-ink',
            'group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40',
            // บนจอสัมผัสไม่มี hover — ต้องแสดงตลอด
            '[@media(hover:none)]:opacity-100',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
          </svg>
        </button>
      ) : null}
    </li>
  )
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}
