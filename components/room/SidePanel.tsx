'use client'

import { QuizPanel } from './QuizPanel'
import { useRef } from 'react'
import { QueueItem } from './QueueItem'
import { useDragSort } from '@/hooks/useDragSort'
import { canRemoveQueueItem } from '@/lib/room/permissions'
import { formatDuration } from '@/lib/youtube/duration'
import { ChatTab } from './ChatTab'
import type { ChatMessage, ChatRead, ReactionMap } from '@/hooks/useRoomChat'
import type { Mention } from '@/lib/chat/message'
import { cn } from '@/lib/cn'
import type { MeDto, QueueItemDto, QuizDto, RoomDto, StickerDto } from '@/types/room'
import type { Appearance } from '@/lib/lobby/appearance'
import { useT } from '@/lib/i18n/client'

/**
 * แผงด้านขวา — คิวเพลง · ประวัติ · แชท
 *
 * ★★ ทำไมรวมสามอย่างไว้ในแท็บเดียวกัน ไม่แยกเป็นสามกล่อง
 *
 *    พื้นที่ฝั่งขวากว้าง 402px ตามเลย์เอาต์ watch page ของ YouTube
 *    ถ้าวางซ้อนกันสามกล่อง แต่ละกล่องจะเตี้ยจนใช้ไม่ได้สักอัน
 *    (คิวเห็น 2 เพลง แชทเห็น 3 บรรทัด) — และบนมือถือยิ่งหนักกว่านั้น
 *    เพราะทุกอย่างเรียงต่อกันลงไปจนต้องเลื่อนยาวมาก
 *
 *    ★ ทั้งสามอย่างตอบคำถามคนละข้อและไม่ต้องดูพร้อมกัน:
 *        "เพลงอะไรต่อ" · "เมื่อกี้เพลงอะไร" · "เพื่อนว่าไง"
 *      แท็บจึงเหมาะกว่าการยัดให้เห็นพร้อมกันทั้งหมด
 *
 * ★ ตัวเลขข้างแท็บแชทคือจำนวนข้อความที่ยังไม่ได้อ่าน — ไม่งั้นคนที่เปิด
 *   แท็บคิวค้างไว้จะไม่รู้เลยว่ามีใครพิมพ์อะไรมา
 */

export type Tab = 'queue' | 'history' | 'chat'

export function SidePanel({
  panelRef,
  room,
  me,
  queue,
  history,
  nowPlaying,
  removingId,
  onRemove,
  canPlay,
  startingId,
  onPlay,
  onReorder,
  canReorder,
  onAddAgain,
  addingVideoId,
  queuedVideoIds,
  messages,
  unread,
  mentionUnread,
  chatReactions,
  chatReads,
  onChatRead,
  members,
  onOpenChat,
  onSendChat,
  onUploadImage,
  onTyping,
  onDeleteChat,
  onReactChat,
  onAddVideo,
  stickers,
  onUploadSticker,
  onRemoveSticker,
  uploadingSticker,
  typing,
  activeTab,
  onTabChange,
  chatTheme,
  chatWallpaper,
  chatWallpaperUrl,
  dark,
  appearance,
  onOpenStyle,
  quiz,
  quizBusy,
  serverSkew,
  onQuiz,
}: {
  panelRef?: React.Ref<HTMLDivElement>
  room: RoomDto
  me: MeDto
  queue: QueueItemDto[]
  history: QueueItemDto[]
  nowPlaying: QueueItemDto | null
  removingId: string | null
  onRemove: (id: string) => void
  canPlay: boolean
  startingId: string | null
  onPlay: (id: string) => void
  /** ย้ายเพลงไปต่อหลัง afterId · null = ขึ้นเป็นเพลงแรกของคิว */
  onReorder: (id: string, afterId: string | null) => void
  canReorder: boolean
  onAddAgain: (item: QueueItemDto) => void
  addingVideoId: string | null
  queuedVideoIds: Set<string>
  messages: ChatMessage[]
  unread: number
  /** ในจำนวนที่ยังไม่อ่าน มีกี่ข้อความที่เรียกชื่อเรา */
  mentionUnread: number
  chatReactions: ReactionMap
  chatReads: Record<string, ChatRead>
  onChatRead: (readAt: number) => void
  members: { userId: string; displayName: string }[]
  onOpenChat: () => void
  onSendChat: (
    text: string,
    extra?: {
      image?: { url: string; width: number | null; height: number | null }
      mentions?: Mention[]
      replyTo?: ChatMessage['replyTo']
      isSticker?: boolean
    },
  ) => void
  onUploadImage: (file: File) => Promise<{ url: string; width: number; height: number } | null>
  onDeleteChat: (id: string) => void
  onReactChat: (messageId: string, emoji: string, on: boolean) => void
  onAddVideo: (videoId: string) => void
  stickers: StickerDto[]
  onUploadSticker: (file: File) => void
  onRemoveSticker: (id: string) => void
  uploadingSticker: boolean
  /** เรียกทุกครั้งที่ผู้ใช้พิมพ์ (throttle อยู่ในฝั่งเรียกแล้ว) */
  onTyping: () => void
  /** คนอื่นที่กำลังพิมพ์อยู่ตอนนี้ */
  typing: { userId: string; displayName: string }[]
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  chatTheme: string | null
  chatWallpaper: string | null
  chatWallpaperUrl: string | null
  dark: boolean
  appearance: Appearance
  onOpenStyle: () => void
  quiz: QuizDto | null
  quizBusy: boolean
  /** serverNow − Date.now() — ให้ทุกคนเห็นเวลานับถอยหลังตรงกัน */
  serverSkew: number
  onQuiz: (action: 'start' | 'next' | 'stop') => void
}) {
  const t = useT()
  const tab = activeTab
  const total = queue.length + (nowPlaying ? 1 : 0)

  function switchTo(next: Tab) {
    onTabChange(next)
    if (next === 'chat') onOpenChat()
  }

  return (
    <aside ref={panelRef} className="min-w-0 px-4 pb-24 lg:px-0 lg:pb-0">
      <div className="room-panel overflow-hidden rounded-[24px] border border-line">
        {/* ── แท็บ ────────────────────────────────────────────── */}
        {/**
          * ★★ grid-cols-3 ไม่ใช่ flex-1
          *
          *    flex-1 คือ flex: 1 1 0% ซึ่ง "เท่ากัน" เฉพาะตอนที่เนื้อหาข้างใน
          *    ไม่ล้นเท่านั้น พอแท็บแชทมีป้าย @3 หรือ 99+ โผล่มา ช่องนั้นจะ
          *    ดันตัวเองกว้างกว่าเพื่อน แล้วแถบทั้งแถบเบี้ยวทันที
          *    ★ grid สามช่องเท่ากันคือการประกาศว่า "เท่ากันเสมอ" ไม่ขึ้นกับเนื้อหา
          */}
        <div className="room-tabs grid grid-cols-3 gap-1 border-b border-line bg-elevated p-1.5" role="tablist">
          <TabButton active={tab === 'queue'} onClick={() => switchTo('queue')}>
            {t('room.tabQueue')}
            <Count n={total} />
          </TabButton>
          <TabButton active={tab === 'history'} onClick={() => switchTo('history')}>
            {t('room.tabHistory')}
            {history.length > 0 ? <Count n={history.length} /> : null}
          </TabButton>
          <TabButton active={tab === 'chat'} onClick={() => switchTo('chat')}>
            {t('room.tabChat')}
            {/**
              * ★★ ถูกเรียกชื่อ = ป้ายคนละสี ไม่ใช่แค่ตัวเลขที่ใหญ่ขึ้น
              *
              *    "40 ข้อความใหม่" ในห้องที่คุยกันรัว ๆ ไม่ได้บอกอะไรเลย —
              *    คนจะชินแล้วเลิกมอง แต่ "มี 1 ข้อความที่เรียกคุณ" คือสิ่งเดียว
              *    ที่ทำให้คนตัดสินใจกดเข้าไปอ่านทันที จึงต้องแยกสัญญาณให้ชัด
              */}
            {mentionUnread > 0 ? (
              <span className="ms-1 rounded-full bg-warn px-1.5 text-[11px] font-medium text-[#1a1400]">
                @{mentionUnread > 9 ? '9+' : mentionUnread}
              </span>
            ) : unread > 0 ? (
              <span className="ms-1 rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-ink">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </TabButton>
        </div>

        {/**
          * ★ แผงเกมอยู่เหนือแท็บแชทเท่านั้น
          *   คำตอบเดินทางผ่านแชท คำใบ้กับช่องพิมพ์จึงต้องอยู่บนจอเดียวกัน
          *   ถ้าเอาไปไว้แท็บอื่น คนจะต้องสลับแท็บไปมาระหว่างอ่านใบ้กับพิมพ์ตอบ
          */}
        {tab === 'chat' ? (
          <QuizPanel
            quiz={quiz}
            meId={me.userId}
            serverSkew={serverSkew}
            busy={quizBusy}
            onStart={() => onQuiz('start')}
            onNext={() => onQuiz('next')}
            onStop={() => onQuiz('stop')}
          />
        ) : null}

        {tab === 'queue' ? (
          <QueueTab
            room={room}
            me={me}
            queue={queue}
            nowPlaying={nowPlaying}
            total={total}
            removingId={removingId}
            onRemove={onRemove}
            canPlay={canPlay}
            startingId={startingId}
            onPlay={onPlay}
            onReorder={onReorder}
            canReorder={canReorder}
          />
        ) : tab === 'history' ? (
          <HistoryTab
            history={history}
            onAddAgain={onAddAgain}
            addingVideoId={addingVideoId}
            queuedVideoIds={queuedVideoIds}
          />
        ) : (
          <ChatTab
            chatTheme={chatTheme}
            chatWallpaper={chatWallpaper}
            chatWallpaperUrl={chatWallpaperUrl}
            dark={dark}
            appearance={appearance}
            onOpenStyle={onOpenStyle}
            messages={messages}
            me={me}
            members={members}
            reactions={chatReactions}
            reads={chatReads}
            onRead={onChatRead}
            onSend={onSendChat}
            onUpload={onUploadImage}
            onTyping={onTyping}
            onDelete={onDeleteChat}
            onReact={onReactChat}
            onAddVideo={onAddVideo}
            queuedVideoIds={queuedVideoIds}
            stickers={stickers}
            onUploadSticker={onUploadSticker}
            onRemoveSticker={onRemoveSticker}
            uploadingSticker={uploadingSticker}
            typing={typing}
          />
        )}
      </div>
    </aside>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function TabButton({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        // min-w-0 ให้ช่องยอมหดตามกริดได้ ไม่ใช่ดันตามความยาวข้อความ
        'room-tab flex min-h-11 min-w-0 items-center justify-center gap-0.5 rounded-xl px-2 text-sm transition-colors',
        // ★ แท็บที่เลือกเป็นแคปซูลลอยมีแถบไล่สีใต้ — เห็นชัดทั้งโทนสว่างและมืด
        active ? 'room-tab-on font-bold text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

const Count = ({ n }: { n: number }) => (
  <span className="text-xs font-normal tabular-nums text-ink-soft">({n})</span>
)

const listClass =
  'max-h-[calc(100vh-var(--spacing-header)-200px)] overflow-y-auto lg:max-h-[62vh]'

/* ── คิวเพลง ──────────────────────────────────────────────────── */

function QueueTab({
  room, me, queue, nowPlaying, total, removingId, onRemove, canPlay, startingId, onPlay,
  onReorder, canReorder,
}: {
  panelRef?: React.Ref<HTMLDivElement>
  room: RoomDto
  me: MeDto
  queue: QueueItemDto[]
  nowPlaying: QueueItemDto | null
  total: number
  removingId: string | null
  onRemove: (id: string) => void
  canPlay: boolean
  startingId: string | null
  onPlay: (id: string) => void
  onReorder: (id: string, afterId: string | null) => void
  canReorder: boolean
}) {
  const t = useT()
  /**
   * ★ เพลงที่กำลังเล่นไม่อยู่ในชุดที่ลากได้
   *   มันไม่ใช่ "ลำดับในคิว" แต่เป็นสถานะของห้อง ณ ตอนนี้ — ฝั่ง server
   *   ก็ปฏิเสธการย้ายแถวที่ไม่ใช่ WAITING อยู่แล้ว ทั้งสองฝั่งจึงพูดตรงกัน
   */
  const listRef = useRef<HTMLOListElement>(null)
  const sort = useDragSort({
    ids: queue.map((q) => q.id),
    onDrop: onReorder,
    scroller: listRef,
    disabled: !canReorder || queue.length < 2,
  })

  const sortable = canReorder && queue.length > 1

  return (
    <div className="bg-page">
      <p className="truncate border-b border-line px-4 py-2 text-xs text-ink-soft">
        {total > 0
          ? t('queue.listLabel', {
                  room: room.name,
                  state: nowPlaying ? t('queue.playingFirst') : t('queue.paused'),
                  total,
                  play: canPlay ? t('queue.tapToPlay') : '',
                  sort: sortable ? t('queue.dragToSort') : '',
                })
          : <span dir="auto">{room.name}</span>}
      </p>

      {!nowPlaying && queue.length === 0 ? (
        <Empty
          title={t('room.queueEmpty')}
          detail={t('room.queueEmptyDetail')}
        />
      ) : (
        <ol ref={listRef} className={cn(listClass, 'py-1')}>
          {nowPlaying ? (
            <QueueItem
              key={nowPlaying.id}
              item={nowPlaying}
              index={0}
              playing
              canRemove={false}
              removing={false}
              onRemove={onRemove}
            />
          ) : null}

          {queue.map((item, index) => (
            <QueueItem
              key={item.id}
              item={item}
              index={index + (nowPlaying ? 1 : 0)}
              canRemove={canRemoveQueueItem(me.role, me.userId, item.addedBy?.userId ?? null)}
              removing={removingId === item.id}
              onRemove={onRemove}
              canPlay={canPlay}
              starting={startingId === item.id}
              // ★ กลืน click ที่เบราว์เซอร์ยิงต่อท้ายการลาก
              //   ไม่งั้นลากเพลงเสร็จแล้วเพลงนั้นกระโดดไปเล่นทันที
              onPlay={(id) => {
                if (sort.justDragged()) return
                onPlay(id)
              }}
              sortable={sortable}
              dragging={sort.activeId === item.id}
              onSortStart={sort.begin}
              onSortNudge={sort.nudge}
              style={sort.rowStyle(item.id)}
              rowRef={sort.registerRow}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

/* ── ประวัติ ──────────────────────────────────────────────────── */

function HistoryTab({
  history, onAddAgain, addingVideoId, queuedVideoIds,
}: {
  history: QueueItemDto[]
  onAddAgain: (item: QueueItemDto) => void
  addingVideoId: string | null
  queuedVideoIds: Set<string>
}) {
  const t = useT()
  if (history.length === 0) {
    return (
      <div className="bg-page">
        <Empty title={t('room.historyEmpty')} detail={t('room.historyEmptyDetail')} />
      </div>
    )
  }

  return (
    <div className="bg-page">
      <ol className={cn(listClass, 'divide-y divide-line')}>
        {history.map((item) => {
          const queued = queuedVideoIds.has(item.videoId)
          const adding = addingVideoId === item.videoId

          return (
            <li key={item.id} className="flex items-center gap-2.5 px-3 py-2">
              <div className="relative h-[34px] w-[60px] shrink-0 overflow-hidden rounded bg-surface">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p dir="auto" className="line-clamp-1 text-[13px]">{item.title}</p>
                <p className="line-clamp-1 text-[11px] text-ink-soft">
                  {/* ★ บอกด้วยว่าถูกข้ามหรือฟังจนจบ — คนละความหมายกัน */}
                  {item.status === 'SKIPPED' ? t('room.wasSkipped') : t('room.wasPlayed')}
                  {' · '}
                  {formatDuration(item.duration)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onAddAgain(item)}
                disabled={queued || adding}
                aria-label={t('room.requeue', { title: item.title })}
                title={queued ? t('room.alreadyQueued') : t('room.requeueShort')}
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full',
                  'text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink',
                  'disabled:opacity-35 disabled:hover:bg-transparent',
                )}
              >
                {adding ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                    <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
                  </svg>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <svg viewBox="0 0 24 24" className="mx-auto size-8 text-ink-faint" fill="currentColor" aria-hidden="true">
        <path d="M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm15-8v6.18A3 3 0 1 0 20 15V8h3V6h-5z" />
      </svg>
      <p className="mt-2 text-sm text-ink-soft">{title}</p>
      <p className="mx-auto mt-1 max-w-[250px] whitespace-pre-line text-xs leading-relaxed text-ink-faint">
        {detail}
      </p>
    </div>
  )
}
