'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { MusicPlayer } from './MusicPlayer'
import { canControlPlayback, canManageRoom, canSkip } from '@/lib/room/permissions'
import { RoomActions } from './RoomActions'
import { SidePanel, type Tab } from './SidePanel'
import { ListenersPanel, type Listener } from './ListenersPanel'
import { ShareDialog } from './ShareDialog'
import { TransferOwnerDialog } from './TransferOwnerDialog'
import { ProfileDialog } from '@/components/ProfileDialog'
import { SummaryDialog } from './SummaryDialog'
import { ReactionLayer } from './ReactionLayer'
import { DedicateDialog } from './DedicateDialog'
import { ChatStyleDialog } from './ChatStyleDialog'
import { sanitizeAppearance } from '@/lib/lobby/appearance'
import { SearchResults } from '@/components/youtube/SearchResults'
import { Recommendations } from '@/components/youtube/Recommendations'
import { MusicGuide } from '@/components/music/MusicGuide'
import { ConnectionBanner } from './ConnectionBanner'
import { AppHeader, Avatar } from '@/components/AppHeader'
import { Toast, useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ConfirmProvider'
import { useRoomChannel } from '@/hooks/useRoomChannel'
import { rememberSearchThumbnail } from '@/hooks/useSearchSuggestions'
import { useServerClock } from '@/hooks/useServerClock'
import { useJoinNotices } from '@/hooks/useJoinNotices'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useRoomChat, type ChatMessage } from '@/hooks/useRoomChat'
import { useRoomExtras } from '@/hooks/useRoomExtras'
import { useRoomReactions } from '@/hooks/useRoomReactions'
import { parseSearchInput } from '@/lib/youtube/video-id'
import { useVolume } from '@/hooks/useVolume'
import { ApiClientError, apiFetch, apiUpload, errorText } from '@/lib/api/client'
import { canAddToQueue } from '@/lib/room/permissions'
import { initialState, resolveLeaderId, roomReducer } from '@/lib/room/reducer'
import { targetPosition } from '@/lib/playback/position'
import { cn } from '@/lib/cn'
import type { ChatMessageRow, RoomStickerRow } from '@/types/database'
import { shrinkImage } from '@/lib/image/shrink'
import type { Mention } from '@/lib/chat/message'
import type { PlaybackDto, QueueItemDto, RoomBootstrap, StickerDto } from '@/types/room'
import type { SearchResponse, VideoResult } from '@/types/youtube'
import { useT } from '@/lib/i18n/client'

/** คนที่ไม่ใช่ leader รอเท่านี้ก่อนจะรายงานเพลงจบเอง */
const WATCHDOG_DELAY_MS = 2_500

export type SearchState = {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  items: VideoResult[]
  nextPageToken: string | null
  error: string | null
  loadingMore: boolean
}

/**
 * หน้าห้อง — ใช้เลย์เอาต์ watch page ของ YouTube
 *
 * ★ โครงของ YouTube ตอนดูวิดีโอพร้อม playlist:
 *
 *     ┌─────────────────────────────┬──────────────┐
 *     │  player 16:9                │  แผง playlist │
 *     │  ชื่อวิดีโอ 20px            │  (คิวเพลง)    │
 *     │  แถวช่อง + ปุ่มแคปซูล        │  รายการย่อย   │
 *     └─────────────────────────────┴──────────────┘
 *        คอลัมน์หลัก ยืดได้           402px คงที่
 *
 *   เลย์เอาต์นี้เข้ากับแอปเราพอดีอย่างน่าประหลาด เพราะ "คิวเพลงของห้อง"
 *   ทำหน้าที่เหมือน playlist ของ YouTube เป๊ะ ๆ
 */
export function RoomClient({
  bootstrap,
  youtubeConfigured,
}: {
  bootstrap: RoomBootstrap
  youtubeConfigured: boolean
}) {
  const t = useT()
  const confirm = useConfirm()
  const [state, dispatch] = useReducer(roomReducer, bootstrap, initialState)
  const { serverNow, remeasure } = useServerClock(bootstrap.serverTime)
  const { toast, showToast } = useToast()

  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [controlPending, setControlPending] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [transferringTo, setTransferringTo] = useState<string | null>(null)
  /** คนที่กำลังจะยกตำแหน่งให้ — null = ยังไม่ได้เปิดกล่องยืนยัน */
  const [transferTarget, setTransferTarget] = useState<{
    userId: string
    displayName: string
    avatarUrl: string | null
  } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  /**
   * ★ ชุดสติกเกอร์เก็บแยกจาก reducer
   *   มันไม่เกี่ยวกับการซิงก์เพลงเลยสักนิด การยัดเข้า roomReducer จะทำให้
   *   ทุก action ที่แตะคิว/playback ต้องแบกฟิลด์นี้ไปด้วยโดยไม่มีเหตุผล
   */
  const [stickers, setStickers] = useState<StickerDto[]>(bootstrap.stickers)
  const [uploadingSticker, setUploadingSticker] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  /**
   * ★★ เปิดมาที่แชทเป็นค่าเริ่มต้น ไม่ใช่คิวเพลง
   *
   *    คิวเพลงตอบคำถาม "เพลงอะไรต่อ" ซึ่งถามไม่บ่อยและหาคำตอบได้จาก
   *    ชื่อเพลงถัดไปที่แสดงอยู่ใต้ player อยู่แล้ว
   *
   *    ★ แชทคือสิ่งที่คนอยู่กับมันตลอดทั้งปาร์ตี้ และเป็นอย่างเดียวในหน้านี้
   *      ที่ "พลาดแล้วพลาดเลย" — เพลงย้อนดูในประวัติได้ แชทที่ไม่ได้อ่าน
   *      ตอนนั้นคือบทสนทนาที่หลุดไปแล้ว
   */
  const [panelTab, setPanelTab] = useState<Tab>('chat')
  const chatOpen = panelTab === 'chat'
  const [recommended, setRecommended] = useState<VideoResult[]>([])
  const [recommendLoading, setRecommendLoading] = useState(true)
  const [recommendMore, setRecommendMore] = useState(false)
  const [recommendNext, setRecommendNext] = useState(0)
  const [recommendHasMore, setRecommendHasMore] = useState(false)
  const [recommendTotal, setRecommendTotal] = useState(0)
  /** ชื่อเพลงที่ใช้เป็นต้นทางของคำแนะนำ — null = ยังไม่มีเพลงไหนเล่นเลย */
  const [recommendBasedOn, setRecommendBasedOn] = useState<string | null>(null)
  /** กี่เพลงที่ "เกี่ยวข้องจริง" ไม่ใช่แค่เพลงทั่วไปที่ต่อท้ายมา */
  const [recommendRelated, setRecommendRelated] = useState(0)
  /**
   * ★ seed ของการสุ่ม — สุ่มครั้งเดียวต่อการเปิดหน้า
   *   ต้องคงที่ตลอดอายุหน้า ไม่งั้น "โหลดเพิ่ม" จะได้ลำดับใหม่ทั้งชุด
   *   แล้วเพลงที่เห็นอยู่แล้วจะโผล่ซ้ำ
   *
   *   สุ่มใน effect ไม่ใช่ตอน render — ค่าที่ server กับ client สร้างต้องตรงกัน
   */
  const seedRef = useRef(0)
  /** แผงขวา — ใช้เลื่อนจอไปหาเวลากดปุ่มแชทลอยบนมือถือ */
  const panelRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchState>({
    status: 'idle', items: [], nextPageToken: null, error: null, loadingMore: false,
  })

  const code = state.room.code

  /**
   * ★ บอกผู้ใช้เมื่อได้รับตำแหน่งเจ้าของห้อง
   *
   *   การโอนเกิดขึ้นเองเมื่อเจ้าของเดิมหายไปนาน ปุ่มหยุด/ข้ามจะโผล่มาเฉย ๆ
   *   ถ้าไม่บอกอะไรเลย ผู้ใช้จะงงว่าทำไมจู่ ๆ ทำอะไรได้มากขึ้น
   */
  const wasOwner = useRef(state.me.role === 'OWNER')
  useEffect(() => {
    const isOwner = state.me.role === 'OWNER'
    if (isOwner && !wasOwner.current) {
      showToast(t('toast.becameOwner'), 'success')
    }
    wasOwner.current = isOwner
  }, [state.me.role, showToast, t])

  /**
   * ★ ดึงเพลงแนะนำใหม่เมื่อ "เพลงที่เล่นอยู่" เปลี่ยน — ไม่ใช่ทุกครั้งที่คิวขยับ
   *
   *   ★★ ของเดิมดึงครั้งเดียวตอนเปิดห้อง ด้วยเหตุผลว่ารายการจะสลับใต้นิ้ว
   *      ผู้ใช้ตอนเขากำลังจะกด ★ เหตุผลนั้นยังจริงอยู่ แต่มันผูกกับสมมติฐาน
   *        เดิมว่า "รายการไม่เกี่ยวกับเพลงที่เล่นอยู่" — พอรายการเกี่ยวข้อง
   *        กับเพลงแล้ว การไม่อัปเดตตอนเปลี่ยนเพลงคือโชว์ของที่ผิดค้างไว้
   *
   *   ★ จุดกลางคือผูกกับ "เพลงที่เล่นอยู่" อย่างเดียว ไม่ผูกกับทั้งคิว:
   *     คนเพิ่มเพลงเข้าคิวท้าย ๆ รายการไม่กระพริบ · เปลี่ยนเพลงเมื่อไหร่
   *     ถึงค่อยคิดใหม่ ซึ่งเป็นจังหวะที่ผู้ใช้กำลังมองไปที่ player อยู่แล้ว
   */
  type RecommendResponse = {
    items: VideoResult[]
    nextOffset: number
    hasMore: boolean
    total: number
    basedOn: { videoId: string; title: string } | null
    relatedCount: number
  }

  const loadRecommended = useCallback(
    async (offset: number) => {
      const data = await apiFetch<RecommendResponse>(
        `/api/youtube/recommend?room=${code}&seed=${seedRef.current}&offset=${offset}`,
      )
      setRecommended((prev) => (offset === 0 ? data.items : [...prev, ...data.items]))
      setRecommendNext(data.nextOffset)
      setRecommendHasMore(data.hasMore)
      setRecommendTotal(data.total)
      setRecommendBasedOn(data.basedOn?.title ?? null)
      setRecommendRelated(data.relatedCount)
    },
    [code],
  )

  const nowPlayingVideoId = state.nowPlaying?.videoId ?? null

  useEffect(() => {
    let cancelled = false
    /*
     * ★ สุ่ม seed ใหม่ทุกครั้งที่เปลี่ยนเพลง
     *   ★★ ไม่ใช่แค่ความหลากหลาย — เพลงที่ "เกี่ยวข้องพอ ๆ กัน" มีเยอะกว่า
     *      24 ช่องที่แสดงได้ ★ seed คงที่จะโชว์ 24 ตัวเดิมตลอดไป
     *        แล้วเพลงที่เกี่ยวข้องเท่ากันอีกหลายสิบเพลงไม่มีวันได้ขึ้น
     */
    seedRef.current = Math.floor(Math.random() * 2_147_483_647)
    setRecommendLoading(true)

    void loadRecommended(0)
      .catch(() => {
        // แนะนำไม่ได้ไม่ใช่เรื่องใหญ่ — ผู้ใช้ยังค้นหาเองได้ตามปกติ
      })
      .finally(() => {
        if (!cancelled) setRecommendLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadRecommended, nowPlayingVideoId])

  const handleLoadMoreRecommended = useCallback(() => {
    setRecommendMore(true)
    void loadRecommended(recommendNext)
      .catch(() => showToast(t('toast.loadMoreFailed'), 'error'))
      .finally(() => setRecommendMore(false))
  }, [loadRecommended, recommendNext, showToast, t])

  /* ── แชท ─────────────────────────────────────────────────────────────── */
  const chat = useRoomChat(state.me.userId)

  /**
   * ★ ใส่ข้อความชุดแรกจาก bootstrap
   *   รันครั้งเดียวตอนเปิดห้อง — หลังจากนั้น realtime กับ resync ดูแลต่อ
   */
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    applyChatRef.current(bootstrap.messages)
  }, [bootstrap.messages])

  /**
   * แปลงแชทจาก bootstrap → รูปแบบที่ useRoomChat ใช้
   * ★ รีแอคชันมาติดกับข้อความ แต่ฝั่ง UI ใช้เป็นแผนที่แยก — แยกตรงนี้ที่เดียว
   */
  const applyChatRef = useRef<(m: RoomBootstrap['messages']) => void>(() => {})

  const applyChat = useCallback(
    (messages: RoomBootstrap['messages']) => {
      chat.seed(messages.map(({ reactions: _drop, ...m }) => m))
      chat.seedReactions(
        Object.fromEntries(
          messages.filter((m) => Object.keys(m.reactions).length > 0).map((m) => [m.id, m.reactions]),
        ),
      )
    },
    [chat],
  )
  useEffect(() => {
    applyChatRef.current = applyChat
  }, [applyChat])

  /* ── resync ──────────────────────────────────────────────────────────── */
  const handleResync = useCallback(async () => {
    try {
      const data = await apiFetch<RoomBootstrap>(`/api/rooms/${code}`)
      dispatch({ type: 'BOOTSTRAP', payload: data })
      applyChat(data.messages)
      setStickers(data.stickers)
      // วัดนาฬิกาใหม่ทุกครั้งที่ resync — ถ้าเพิ่งกลับมาจากออฟไลน์
      // เครื่องอาจถูกพักไว้นานจนนาฬิกาเพี้ยนไป
      await remeasure()
    } catch {
      // resync ล้มเหลว — ปล่อยให้ realtime/รอบถัดไปลองใหม่
    }
  }, [applyChat, code, remeasure])


  /**
   * ★ แถวจาก realtime ไม่มีชื่อ/รูปติดมา — ต้องหาเอง
   *   ตารางแชทเก็บแค่ user_id ส่วนชื่อกับรูปอยู่ใน profiles ซึ่ง realtime
   *   ไม่ join ให้ เราจึงประกอบจากรายชื่อคนในห้องที่ถืออยู่แล้ว
   *   (bootstrap กับ presence เติมให้ครบตลอด)
   */
  const identityOf = useCallback(
    (userId: string) => {
      if (userId === state.me.userId) {
        return { displayName: state.me.displayName, avatarUrl: state.me.avatarUrl }
      }
      const member = state.members.find((m) => m.userId === userId)
      if (member) return { displayName: member.displayName, avatarUrl: member.avatarUrl }
      const seen = state.presence.find((p) => p.userId === userId)
      return { displayName: seen?.displayName ?? t('role.guest'), avatarUrl: seen?.avatarUrl ?? null }
    },
    [state.me, state.members, state.presence, t],
  )

  const handleIncomingChat = useCallback(
    (row: ChatMessageRow) => {
      const who = identityOf(row.user_id)
      const message: ChatMessage = {
        id: row.id,
        userId: row.user_id,
        displayName: who.displayName,
        avatarUrl: who.avatarUrl,
        text: row.text,
        ...(row.image_url ? { imageUrl: row.image_url } : {}),
        ...(row.image_width ? { imageWidth: row.image_width } : {}),
        ...(row.image_height ? { imageHeight: row.image_height } : {}),
        ...(row.mentions?.length ? { mentions: row.mentions } : {}),
        ...(row.reply_to ? { replyTo: row.reply_to } : {}),
        ...(row.deleted_at ? { deleted: true } : {}),
        ...(row.is_sticker ? { isSticker: true } : {}),
        at: Date.parse(row.created_at),
      }

      const calling = chat.receive(message, {
        own: message.userId === state.me.userId,
        open: chatOpen,
      })
      /**
       * ★ เด้งบอกเฉพาะตอนที่ "ถูกเรียกชื่อ" และ "ไม่ได้เปิดแชทอยู่"
       *
       *   เด้งทุกข้อความ = กล่องเด้งบังจอตลอดเวลาในห้องที่คุยกันรัว ๆ
       *   ไม่เด้งเลย = คนที่กำลังดูคิวเพลงอยู่จะพลาดข้อความที่พูดกับตัวเอง
       *   ซึ่งเป็นข้อความชนิดเดียวที่รอไม่ได้
       */
      if (calling) {
        showToast(t('toast.mentioned', { name: message.displayName }), 'warn')
      }
    },
    [chat, identityOf, state.me.userId, chatOpen, showToast, t],
  )

  /**
   * ★★ บอกทุกคนเมื่อมีเพลงเข้าคิว
   *
   *    การเพิ่มเพลงเป็นการกระทำที่คนอื่น "ต้องรู้" แต่ไม่ได้ "ต้องดู" —
   *    คนที่กำลังพิมพ์แชทอยู่ไม่ได้มองคิวทางขวา เพลงจึงโผล่มาเงียบ ๆ
   *    แล้วพอถึงคิวมันก็งงว่าเพลงนี้มาจากไหน
   *
   *    ★ ไม่เด้งของตัวเอง — คนกดเองได้ "เพิ่มเข้าคิวแล้ว" จาก handleAddById
   *      ไปแล้วหนึ่งครั้ง การเด้งซ้ำสองอันติดกันดูเหมือนแอปทำงานผิด
   */
  const handleQueueAdded = useCallback(
    (item: QueueItemDto) => {
      if (!item.addedBy || item.addedBy.userId === state.me.userId) return
      showToast(t('toast.queued', { name: item.addedBy.displayName, title: item.title }), 'success')
    },
    [showToast, state.me.userId, t],
  )

  /** สติกเกอร์ที่คนอื่นเพิ่ม/ลบ — มาทาง realtime */
  const handleStickerChange = useCallback(
    ({ added, removedId }: { added?: RoomStickerRow; removedId?: string }) => {
      if (removedId) {
        setStickers((prev) => prev.filter((s) => s.id !== removedId))
        return
      }
      if (!added) return
      setStickers((prev) =>
        // ★ กันซ้ำ — คนที่อัปเองใส่เข้ารายการไปแล้วก่อน realtime จะมาถึง
        prev.some((s) => s.id === added.id)
          ? prev
          : [
              {
                id: added.id,
                url: added.url,
                width: added.width,
                height: added.height,
                createdBy: added.created_by,
              },
              ...prev,
            ],
      )
    },
    [],
  )

  const reactions = useRoomReactions()

  const { sendChatRead, sendReaction, sendTyping } = useRoomChannel({
    roomId: state.room.id,
    roomCode: code,
    state,
    dispatch,
    onResync: handleResync,
    onQueueAdded: handleQueueAdded,
    onChat: handleIncomingChat,
    onChatReact: chat.react,
    onChatRead: chat.noteRead,
    onSticker: handleStickerChange,
    onReaction: reactions.spawn,
    onTyping: chat.noteTyping,
  })

  const handleReact = useCallback(
    (emoji: string) => {
      if (!reactions.allowSend()) return
      // ★ ขึ้นบนจอตัวเองทันที ไม่รอ broadcast วิ่งกลับมา
      reactions.spawn(emoji)
      sendReaction(emoji)
    },
    [reactions, sendReaction],
  )

  const handleTyping = useCallback(() => {
    if (!chat.allowTyping()) return
    sendTyping({ userId: state.me.userId, displayName: state.me.displayName })
  }, [chat, sendTyping, state.me.userId, state.me.displayName])

  const handleSendChat = useCallback(
    (
      text: string,
      extra?: {
        image?: { url: string; width: number | null; height: number | null }
        mentions?: Mention[]
        replyTo?: ChatMessage['replyTo']
        isSticker?: boolean
      },
    ) => {
      const image = extra?.image
      if (!text.trim() && !image) return
      if (!chat.allowSend()) return

      /**
       * ★★ ขึ้นฟองชั่วคราวก่อน แล้วค่อยสลับเป็นแถวจริง
       *
       *    ตอนแชทวิ่งผ่าน broadcast ข้อความขึ้นทันทีเพราะไม่ต้องรออะไร
       *    พอย้ายมาเขียนฐานข้อมูล มีเวลาไปกลับ ~200ms คั่นอยู่ — ถ้ารอให้
       *    server ตอบก่อนค่อยขึ้น ผู้ใช้จะรู้สึกได้ทันทีว่าแชท "หนืด"
       *
       *    ★ id ชั่วคราวเป็นของ client เท่านั้น ไม่เคยถูกส่งไปไหน
       *      พอคำตอบกลับมาเราเอาแถวจริง (ที่มี id จากฐานข้อมูล) มาแทน
       *      และถ้า realtime ของแถวนั้นมาถึงก่อน ตัวกันซ้ำด้วย id จะจับได้เอง
       */
      const tempId = `temp:${crypto.randomUUID()}`
      const optimistic: ChatMessage = {
        id: tempId,
        userId: state.me.userId,
        displayName: state.me.displayName,
        avatarUrl: state.me.avatarUrl,
        pending: true,
        text: text.slice(0, 300),
        ...(image
          ? {
              imageUrl: image.url,
              // ★ ขนาดอาจไม่มี (สติกเกอร์ที่วัดไม่ได้) — ตัดฟิลด์ทิ้งไปเลย
              //   ดีกว่าใส่ null ซึ่งทำให้ <img> ได้ width="null"
              ...(image.width ? { imageWidth: image.width } : {}),
              ...(image.height ? { imageHeight: image.height } : {}),
            }
          : {}),
        ...(extra?.mentions?.length ? { mentions: extra.mentions } : {}),
        ...(extra?.replyTo ? { replyTo: extra.replyTo } : {}),
        ...(extra?.isSticker ? { isSticker: true } : {}),
        at: Date.now(),
      }
      chat.receive(optimistic, { own: true, open: true })

      void apiFetch<{ message: ChatMessage }>(`/api/rooms/${code}/chat`, {
        method: 'POST',
        body: {
          text: text.slice(0, 300),
          image: image ?? null,
          mentions: extra?.mentions ?? [],
          replyTo: extra?.replyTo ?? null,
          isSticker: extra?.isSticker ?? false,
        },
      })
        .then(({ message }) => chat.settle(tempId, message))
        .catch((error) => {
          // ★ เอาฟองออก ไม่ปล่อยค้างเป็น "ส่งแล้ว" ทั้งที่ไม่ถึงใคร
          chat.settle(tempId, null)
          showToast(
            errorText(error, t, 'toast.sendFailed'),
            'error',
          )
        })
    },
    [chat, code, state.me.userId, state.me.displayName, state.me.avatarUrl, showToast, t],
  )

  /**
   * ★ ส่งเฉพาะตอนที่ "อ่านถึงไกลกว่าเดิม" จริง ๆ
   *
   *   ChatTab เรียกทุกครั้งที่ข้อความใหม่มาถึงขณะเลื่อนอยู่ล่างสุด ซึ่งในห้อง
   *   ที่คุยกันรัว ๆ คือทุกไม่กี่วินาที — การยิง broadcast ทุกครั้งเปลืองเปล่า
   *   เพราะค่าที่ส่งซ้ำไม่ได้เปลี่ยนอะไรฝั่งผู้รับเลย (noteRead เดินหน้าอย่างเดียว)
   */
  const lastReadSent = useRef(0)
  const handleChatRead = useCallback(
    (readAt: number) => {
      if (readAt <= lastReadSent.current) return
      lastReadSent.current = readAt
      sendChatRead({
        userId: state.me.userId,
        displayName: state.me.displayName,
        readAt,
      })
    },
    [sendChatRead, state.me.userId, state.me.displayName],
  )

  const handleDeleteChat = useCallback(
    async (id: string) => {
      // ★ ฟองที่ยังส่งไม่เสร็จ ลบทิ้งในเครื่องพอ — มันยังไม่มีตัวตนใน DB (ไม่ต้องถาม)
      if (id.startsWith('temp:')) {
        chat.settle(id, null)
        return
      }
      if (!(await confirm({ kind: 'delete' }))) return
      chat.remove(id)
      void apiFetch(`/api/rooms/${code}/chat/${id}`, { method: 'DELETE' }).catch((error) => {
        showToast(errorText(error, t, 'toast.deleteFailed'), 'error')
        void handleResync()
      })
    },
    [chat, code, confirm, handleResync, showToast, t],
  )

  const handleReactChat = useCallback(
    (messageId: string, emoji: string, on: boolean) => {
      if (messageId.startsWith('temp:')) return
      // ★ ขึ้นให้เห็นก่อน realtime ตามมายืนยัน — กดแล้วต้องติดทันที
      chat.react({ messageId, emoji, userId: state.me.userId, on })
      void apiFetch(`/api/rooms/${code}/chat/${messageId}/react`, {
        method: 'POST',
        body: { emoji, on },
      }).catch(() => {
        // กลับสถานะเดิมถ้าเซิร์ฟเวอร์ไม่รับ
        chat.react({ messageId, emoji, userId: state.me.userId, on: !on })
      })
    },
    [chat, code, state.me.userId],
  )

  /**
   * ★★ มอบ/ถอนสิทธิ์ลัดคิว — ไม่ถาม confirm ต่างจากการยกตำแหน่ง
   *
   *    การยกตำแหน่งเจ้าของห้องย้อนกลับเองไม่ได้ จึงต้องถามก่อน
   *    ส่วนสิทธิ์ลัดคิวกดถอนคืนได้ทันทีด้วยปุ่มเดียวกัน — การถามยืนยัน
   *    ทุกครั้งสำหรับสิ่งที่กดกลับได้ใน 1 วินาที มีแต่จะทำให้คนเลิกใช้
   *
   * ★ ไม่ต้อง dispatch เอง — set_member_skip เขียน room_members ซึ่งมี
   *   realtime subscription อยู่แล้ว ทุกเครื่องรวมทั้งเจ้าตัวจะได้ MEMBER_ROLE
   *   ตามมาเอง (และเจ้าตัวจะเห็นปุ่มลัดคิวโผล่ทันทีโดยไม่ต้องรีเฟรช)
   */
  const [savingSkipFor, setSavingSkipFor] = useState<string | null>(null)

  const handleSetSkip = useCallback(
    async (userId: string, displayName: string, allow: boolean) => {
      setSavingSkipFor(userId)
      try {
        await apiFetch(`/api/rooms/${code}/permissions`, {
          method: 'PATCH',
          body: { userId, canSkip: allow },
        })
        showToast(
          allow ? t('toast.grantedQueueJump', { name: displayName }) : t('toast.revokedQueueJump', { name: displayName }),
          'success',
        )
      } catch (error) {
        showToast(
          errorText(error, t, 'toast.permissionFailed'),
          'error',
        )
      } finally {
        setSavingSkipFor(null)
      }
    },
    [code, showToast, t],
  )

  /* ── เปลี่ยนเพลง ─────────────────────────────────────────────────────── */
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const requestAdvance = useCallback(
    async (expectedQueueItemId: string, path: 'next' | 'skip') => {
      try {
        const { playback } = await apiFetch<{ playback: PlaybackDto }>(
          `/api/rooms/${code}/${path}`,
          { method: 'POST', body: { expectedQueueItemId } },
        )
        dispatch({ type: 'PLAYBACK', playback })
      } catch (error) {
        // STALE_PLAYBACK = มีคนเปลี่ยนไปก่อนแล้ว · PREMATURE_END = ยังไม่ถึงเวลา
        // ทั้งคู่ไม่ใช่ความผิดพลาด ต้องเงียบ ไม่งั้นทุกการเปลี่ยนเพลงจะเด้ง error แดง
        if (
          error instanceof ApiClientError &&
          (error.code === 'STALE_PLAYBACK' || error.code === 'PREMATURE_END')
        ) return
        if (path === 'skip') showToast(t('toast.skipFailed'), 'error')
      }
    },
    [code, showToast, t],
  )

  /**
   * Leader + watchdog — ลด request จาก N คนเหลือ 1
   * (ความถูกต้องมาจาก CAS ใน advance_queue ตรงนี้แค่ลด traffic)
   */
  const handleEnded = useCallback(
    (queueItemId: string) => {
      const leaderId = resolveLeaderId(state)
      if (leaderId === null || leaderId === state.me.userId) {
        void requestAdvance(queueItemId, 'next')
        return
      }
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      watchdogRef.current = setTimeout(() => {
        if (state.playback.queueItemId === queueItemId) {
          void requestAdvance(queueItemId, 'next')
        }
      }, WATCHDOG_DELAY_MS)
    },
    [state, requestAdvance],
  )

  const handleUnplayable = useCallback(
    (queueItemId: string) => {
      showToast(t('toast.unplayable'), 'warn')
      void requestAdvance(queueItemId, 'next')
    },
    [requestAdvance, showToast, t],
  )

  /* ── ค้นหา ───────────────────────────────────────────────────────────── */
  const abortRef = useRef<AbortController | null>(null)

  const runSearch = useCallback(
    async (text: string, pageToken: string) => {
      const trimmed = text.trim()
      if (trimmed.length < 2) {
        setSearch((s) => ({ ...s, status: 'error', error: t('toast.typeTwo') }))
        return
      }
      if (!youtubeConfigured) {
        setSearch((s) => ({ ...s, status: 'error', error: t('toast.noApiKey') }))
        return
      }

      // ยกเลิก request เก่า — กันผลลัพธ์ที่มาช้าทับผลลัพธ์ใหม่
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const firstPage = pageToken === ''
      setSearch((s) => ({
        ...s,
        status: firstPage ? 'loading' : s.status,
        loadingMore: !firstPage,
        error: null,
      }))

      try {
        const params = new URLSearchParams({ q: trimmed })
        if (pageToken) params.set('pageToken', pageToken)
        const data = await apiFetch<SearchResponse>(`/api/youtube/search?${params}`, {
          signal: controller.signal,
        })
        setSearch((s) => ({
          status: 'loaded',
          items: firstPage ? data.items : [...s.items, ...data.items],
          nextPageToken: data.nextPageToken,
          error: null,
          loadingMore: false,
        }))

        // ★ เติมรูปให้ประวัติการค้นหา
        //   ตอนกด Enter เรายังไม่รู้ว่าผลลัพธ์หน้าตาเป็นยังไง บันทึกได้แค่ข้อความ
        //   พอผลกลับมาถึงค่อยเอารูปของผลลัพธ์แรกไปแปะ — ครั้งหน้าที่เปิด
        //   ช่องค้นหา ประวัติจะมีรูปให้จำได้ทันทีว่าเคยค้นอะไรไว้
        if (firstPage && data.items[0]?.thumbnailUrl) {
          rememberSearchThumbnail(trimmed, data.items[0].thumbnailUrl)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setSearch((s) => ({
          ...s,
          status: 'error',
          loadingMore: false,
          error: errorText(error, t, 'toast.searchFailed'),
        }))
      }
    },
    [youtubeConfigured, t],
  )

  const clearSearch = useCallback(() => {
    abortRef.current?.abort()
    setQuery('')
    setSearch({ status: 'idle', items: [], nextPageToken: null, error: null, loadingMore: false })
  }, [])

  /* ── คิว ─────────────────────────────────────────────────────────────── */
  /**
   * ★ รับแค่ videoId พอ — ทุกที่ที่เพิ่มเพลงมีข้อมูลไม่เท่ากัน
   *   ผลค้นหามีครบ · เพลงแนะนำมีครบ · แต่ลิงก์ที่คนแปะในแชทมีแค่ id
   *   ซึ่งไม่เป็นไรเลยเพราะ server ไปดึงชื่อ/ความยาวเองอยู่แล้ว
   *   (และต้องดึงเองด้วย ไม่งั้น client โกหกความยาวเพลงได้)
   */
  const handleAddById = useCallback(
    async (
      videoId: string,
      dedicate?: { dedicatedTo: string | null; dedication: string },
    ) => {
      setPendingVideoId(videoId)
      try {
        await apiFetch(`/api/rooms/${code}/queue`, {
          method: 'POST',
          body: {
            videoId,
            dedicatedTo: dedicate?.dedicatedTo ?? null,
            dedication: dedicate?.dedication || null,
          },
        })
        // คิวอยู่ทางขวาให้เห็นอยู่แล้ว ข้อความสั้น ๆ พอ
        showToast(dedicate?.dedicatedTo ? t('toast.dedicated') : t('toast.added'), 'success')
      } catch (error) {
        showToast(errorText(error, t, 'toast.addFailed'), 'error')
      } finally {
        setPendingVideoId(null)
      }
    },
    [code, showToast, t],
  )

  const handleAdd = useCallback(
    (video: VideoResult) => handleAddById(video.videoId),
    [handleAddById],
  )

  const handleRemove = useCallback(
    async (id: string) => {
      setRemovingId(id)
      try {
        await apiFetch(`/api/rooms/${code}/queue/${id}`, { method: 'DELETE' })
      } catch (error) {
        showToast(errorText(error, t, 'toast.deleteFailed'), 'error')
      } finally {
        setRemovingId(null)
      }
    },
    [code, showToast, t],
  )

  /* ── ลากสลับลำดับคิว ─────────────────────────────────────────────────── */
  /**
   * ★★ ขยับฝั่ง client ก่อน แล้วค่อยเอาคำตอบของ server มาวางทับ
   *
   *    การลากเป็นการกระทำที่นิ้วยังแตะจออยู่ ผู้ใช้คาดหวังให้ของอยู่ที่ที่วาง
   *    ทันทีที่ปล่อย ไม่ใช่หลังจากเดินทางไปกลับเซิร์ฟเวอร์ 200ms
   *
   *    ★ แต่ "ทันที" ไม่ได้แปลว่า "เชื่อ client" — ลำดับจริงมาจาก RPC เสมอ
   *      QUEUE_SET ที่ตามมาวางทับทั้งชุดด้วย position จริงจากฐานข้อมูล
   *      และถ้าคำขอล้มเหลวก็ resync คืนของจริง ไม่ปล่อยให้ค้างในภาพที่แต่งเอง
   */
  const handleReorder = useCallback(
    async (id: string, afterId: string | null) => {
      dispatch({ type: 'QUEUE_MOVE', id, afterId })
      try {
        const { queue } = await apiFetch<{ queue: QueueItemDto[] }>(
          `/api/rooms/${code}/queue/${id}`,
          { method: 'PATCH', body: { afterId } },
        )
        dispatch({ type: 'QUEUE_SET', queue })
      } catch (error) {
        showToast(errorText(error, t, 'toast.reorderFailed'), 'error')
        void handleResync()
      }
    },
    [code, handleResync, showToast, t],
  )

  /* ── กดเพลงในคิวเพื่อเล่นทันที ────────────────────────────────────────── */
  const handlePlayItem = useCallback(
    async (queueItemId: string) => {
      setStartingId(queueItemId)
      try {
        const { playback } = await apiFetch<{ playback: PlaybackDto }>(
          `/api/rooms/${code}/queue/${queueItemId}/play`,
          { method: 'POST', body: {} },
        )
        dispatch({ type: 'PLAYBACK', playback })
      } catch (error) {
        const message =
          errorText(error, t, 'toast.changeSongFailed')
        showToast(message, 'error')
      } finally {
        setStartingId(null)
      }
    },
    [code, showToast, t],
  )

  /* ── ยกตำแหน่งเจ้าของห้อง ─────────────────────────────────────────────── */
  const handleTransferOwner = useCallback(
    async (userId: string, displayName: string) => {
      /*
       * ★★ การยืนยันย้ายไปอยู่ใน TransferOwnerDialog แล้ว
       *
       *    เดิมใช้ window.confirm ซึ่งได้กล่องสีเทาของเบราว์เซอร์ที่มีแต่ตัวอักษร
       *    ★ และมันพูดคำว่า "ยกให้" ซ้ำอีกรอบ — คนที่ไม่เข้าใจตั้งแต่ปุ่ม
       *      ก็ยังไม่เข้าใจตอนอ่านกล่อง
       *
       *    ฟังก์ชันนี้จึงเหลือหน้าที่เดียว: ยิงคำสั่งจริง
       */

      setTransferringTo(userId)
      try {
        await apiFetch(`/api/rooms/${code}/owner`, {
          method: 'POST',
          body: { userId },
        })
        showToast(t('toast.transferred', { name: displayName }), 'success')
      } catch (error) {
        showToast(errorText(error, t, 'toast.transferFailed'), 'error')
      } finally {
        setTransferringTo(null)
      }
    },
    [code, showToast, t],
  )

  const handleUploadImage = useCallback(
    async (file: File): Promise<{ url: string; width: number; height: number } | null> => {
      /**
       * ★ วัดขนาดรูปก่อนอัป ไม่ใช่รอให้ <img> ในแชทโหลดแล้วค่อยรู้
       *
       *   ขนาดที่รู้ล่วงหน้าทำให้ตั้ง width/height ของ <img> ได้ตั้งแต่แรก
       *   เบราว์เซอร์จึงจองพื้นที่ตามสัดส่วนไว้ แชทไม่กระตุกตอนรูปโหลดเสร็จ
       *
       *   createImageBitmap เร็วกว่าการสร้าง <img> แล้วรอ onload มาก
       *   และไม่ต้องแตะ DOM เลย
       */
      let size = { width: 0, height: 0 }
      try {
        const bitmap = await createImageBitmap(file)
        size = { width: bitmap.width, height: bitmap.height }
        bitmap.close()
      } catch {
        // วัดไม่ได้ (ไฟล์แปลก/เบราว์เซอร์เก่า) — ยังอัปได้ แค่ไม่มีการจองพื้นที่
      }

      try {
        // ★ apiUpload คือทางเดียวของการส่งไฟล์ในแอปนี้ (เหตุผลอยู่ในตัวฟังก์ชัน)
        const { url } = await apiUpload<{ url: string }>(
          `/api/rooms/${code}/chat/image`,
          file,
          { signal: AbortSignal.timeout(30_000) },
        )
        return { url, ...size }
      } catch (error) {
        showToast(
          errorText(error, t, 'toast.uploadFailed'),
          'error',
        )
        return null
      }
    },
    [code, showToast, t],
  )

  /* ── สติกเกอร์ของห้อง ────────────────────────────────────────────────── */

  const handleUploadSticker = useCallback(
    (file: File) => {
      void (async () => {
        // ★ เพิ่มสติกเกอร์เข้าคลังของห้อง = สร้างของใหม่ที่ทุกคนเห็น → ถามก่อน
        if (!(await confirm({ kind: 'create' }))) return
        setUploadingSticker(true)
        try {
          // ★ keepAlpha = true — สติกเกอร์ต้องคงพื้นหลังโปร่งใส
          //   (รูปโปรไฟล์แปลงเป็น JPEG ได้เพราะเป็นวงกลมทึบอยู่แล้ว)
          const small = await shrinkImage(file, 320, true)

          /**
           * ★ วัดขนาดแล้วส่งไปด้วย ไม่ปล่อยให้เป็น null
           *
           *   บั๊กที่เจอจริง: ไม่ได้ส่งขนาดไป แถวในฐานข้อมูลจึงมี width/height
           *   เป็น null แล้วตอนกดส่งสติกเกอร์ ฝั่ง client เติม 0 ให้แทน
           *   ซึ่งตกด่าน positive() ของ API → ส่งไม่ได้เลยสักครั้ง (400)
           */
          let size = { width: 0, height: 0 }
          try {
            const bitmap = await createImageBitmap(small)
            size = { width: bitmap.width, height: bitmap.height }
            bitmap.close()
          } catch {
            // วัดไม่ได้ก็ยังอัปได้ — API ยอมรับ null (ดู schema ของ /chat)
          }

          const { sticker } = await apiUpload<{ sticker: StickerDto }>(
            `/api/rooms/${code}/stickers`,
            small,
            { signal: AbortSignal.timeout(30_000), fields: size },
          )
          // ★ ใส่บนสุดทันที ไม่รอ realtime — คนที่เพิ่งอัปต้องเห็นของตัวเองก่อนใคร
          setStickers((prev) =>
            prev.some((s) => s.id === sticker.id) ? prev : [sticker, ...prev],
          )
        } catch (error) {
          showToast(
            errorText(error, t, 'toast.stickerFailed'),
            'error',
          )
        } finally {
          setUploadingSticker(false)
        }
      })()
    },
    [code, confirm, showToast, t],
  )

  const handleRemoveSticker = useCallback(
    async (id: string) => {
      if (!(await confirm({ kind: 'delete' }))) return
      setStickers((prev) => prev.filter((s) => s.id !== id))
      void apiFetch(`/api/rooms/${code}/stickers/${id}`, { method: 'DELETE' }).catch((error) => {
        showToast(errorText(error, t, 'toast.deleteFailed'), 'error')
        void handleResync()
      })
    },
    [code, confirm, handleResync, showToast, t],
  )

  /* ── เปลี่ยนชื่อห้อง ──────────────────────────────────────────────────── */
  const handleRename = useCallback(
    async (name: string) => {
      try {
        await apiFetch(`/api/rooms/${code}`, { method: 'PATCH', body: { name } })
        showToast(t('toast.renamed'), 'success')
      } catch (error) {
        showToast(errorText(error, t, 'toast.renameFailed'), 'error')
      }
    },
    [code, showToast, t],
  )

  /* ── ควบคุมการเล่น ───────────────────────────────────────────────────── */
  const handlePlayPause = useCallback(async () => {
    setControlPending(true)
    try {
      const { playback } = await apiFetch<{ playback: PlaybackDto }>(
        `/api/rooms/${code}/playback`,
        { method: 'POST', body: { action: state.playback.isPlaying ? 'PAUSE' : 'PLAY' } },
      )
      dispatch({ type: 'PLAYBACK', playback })
    } catch (error) {
      showToast(errorText(error, t, 'toast.commandFailed'), 'error')
    } finally {
      setControlPending(false)
    }
  }, [code, state.playback.isPlaying, showToast, t])

  const handleSeek = useCallback(
    async (seconds: number) => {
      if (!state.playback.queueItemId) return
      try {
        const { playback } = await apiFetch<{ playback: PlaybackDto }>(
          `/api/rooms/${code}/playback`,
          { method: 'POST', body: { action: 'SEEK', position: Math.max(0, Math.round(seconds)) } },
        )
        dispatch({ type: 'PLAYBACK', playback })
      } catch (error) {
        showToast(errorText(error, t, 'toast.seekFailed'), 'error')
      }
    },
    [code, state.playback.queueItemId, showToast, t],
  )

  const handleSkip = useCallback(() => {
    if (!state.playback.queueItemId) return
    setControlPending(true)
    void requestAdvance(state.playback.queueItemId, 'skip').finally(() => setControlPending(false))
  }, [state.playback.queueItemId, requestAdvance])

  const handleClear = useCallback(async () => {
    // ★ ล้างทั้งคิวย้อนไม่ได้ — กล่องเตือนชนิดอันตราย
    if (!(await confirm({ kind: 'danger', subject: t('room.clearQueue') }))) return
    setControlPending(true)
    try {
      const { removed } = await apiFetch<{ removed: number }>(`/api/rooms/${code}/queue`, {
        method: 'DELETE',
      })
      showToast(t('toast.queueCleared', { n: removed }), 'success')
    } catch (error) {
      showToast(errorText(error, t, 'toast.clearFailed'), 'error')
    } finally {
      setControlPending(false)
    }
  }, [code, confirm, showToast, t])

  /**
   * ★★ วางลิงก์ YouTube ที่ไหนก็ได้บนหน้าห้อง → เข้าคิวเลย
   *
   *   เส้นทางปกติคือ: กดช่องค้นหา → วาง → กด Enter → รอผล → กดเพิ่ม
   *   ทั้งที่ผู้ใช้รู้อยู่แล้วว่าอยากได้เพลงไหน (เขาก็อปลิงก์มาเอง)
   *
   *   ★ ต้องไม่แย่งการวางในช่องกรอก — คนวางลิงก์ลงแชทเพื่อคุยกันก็มี
   *     เช็คเป้าหมายแบบเดียวกับ useKeyboardShortcuts
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const el = event.target as HTMLElement | null
      const tag = el?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return

      const text = event.clipboardData?.getData('text')?.trim()
      if (!text) return

      const parsed = parseSearchInput(text)
      if (parsed?.kind !== 'url') return

      event.preventDefault()
      void handleAdd({
        videoId: parsed.videoId,
        title: '',
        channelTitle: '',
        thumbnailUrl: '',
        duration: 0,
      })
      showToast(t('toast.addingFromLink'))
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleAdd, showToast, t])

  /* ── ทางลัดคีย์บอร์ด ─────────────────────────────────────────────────── */
  const { level, setLevel, toggleMute } = useVolume()

  useKeyboardShortcuts({
    onPlayPause: () => void handlePlayPause(),
    onSkip: handleSkip,
    onSeekBy: (delta) => {
      // คำนวณจากตำแหน่งปัจจุบันตามนาฬิกา server เหมือนที่แถบความคืบหน้าใช้
      const now = targetPosition(state.playback, serverNow())
      const max = state.nowPlaying?.duration ?? 0
      void handleSeek(Math.min(max, Math.max(0, now + delta)))
    },
    onVolumeBy: (delta) => setLevel(level + delta),
    onToggleMute: toggleMute,
    onFocusSearch: () => {
      const el = document.querySelector<HTMLInputElement>(`[aria-label="${t('header.searchYouTube')}"]`)
      // บนมือถือช่องค้นหาถูกซ่อนไว้ — ต้องกดปุ่มแว่นขยายให้ก่อน
      if (el && el.offsetParent !== null) el.focus()
      else document.querySelector<HTMLButtonElement>(`[aria-label="${t('header.openSearch')}"]`)?.click()
    },
  })

  /* ── ข้อมูลประกอบ ────────────────────────────────────────────────────── */
  const queuedVideoIds = useMemo(() => {
    const ids = new Set(state.queue.map((i) => i.videoId))
    if (state.nowPlaying) ids.add(state.nowPlaying.videoId)
    return ids
  }, [state.queue, state.nowPlaying])

  const allowedToAdd = canAddToQueue(state.me.role, state.room)
  const addDisabledReason = !youtubeConfigured
    ? t('toast.noApiKey')
    : state.room.isLocked
      ? t('toast.roomLocked')
      : !allowedToAdd
        ? t('toast.noPermission')
        : null

  /**
   * ★ รวมสองแหล่งเข้าเป็นรายชื่อเดียว
   *
   *   presence      — ใครเปิดหน้าห้องอยู่ "ตอนนี้" มีชื่อมาด้วย แต่ไม่มีบทบาท
   *   state.members — ใครเคยเข้าห้อง มีบทบาทครบ แต่เป็นภาพ ณ ตอน bootstrap
   *
   *   คนที่เพิ่งเข้ามาจะโผล่ใน presence ก่อนที่ members จะตามมาถึง
   *   จึงต้องยอมให้ role เป็น null ไว้ก่อน (ไม่โชว์ป้าย) แทนที่จะเดามั่ว
   *   ยกเว้นเจ้าของห้องที่รู้ได้ทันทีจาก room.ownerId
   */
  const listenerList = useMemo<Listener[]>(() => {
    const roleOf = (userId: string) =>
      userId === state.room.ownerId
        ? ('OWNER' as const)
        : (state.members.find((m) => m.userId === userId)?.role ?? null)

    /**
     * ★ คนที่ยังไม่มีในตาราง members ถือว่า "ยังไม่มีสิทธิ์" ไว้ก่อน
     *   ค่าเริ่มต้นของสิทธิ์ควรเป็นค่าที่ผิดพลาดแล้วไม่เสียหาย — ถ้าเดาเป็น
     *   true แล้วผิด เจ้าของห้องจะเห็นสวิตช์เปิดอยู่ทั้งที่ยังไม่ได้ให้ใคร
     */
    const skipOf = (userId: string) =>
      userId === state.room.ownerId ||
      (state.members.find((m) => m.userId === userId)?.canSkip ?? false)

    const nickOf = (userId: string) =>
      state.members.find((m) => m.userId === userId)?.nickname ?? null

    const online = state.presence.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      nickname: nickOf(p.userId),
      role: roleOf(p.userId),
      canSkip: skipOf(p.userId),
      online: true,
      isMe: p.userId === state.me.userId,
    }))

    /**
     * ★ ตัวเราเองออนไลน์เสมอ ไม่ต้องรอ presence ยืนยัน
     *
     *   presence เดินทางไป Realtime แล้วเด้งกลับมา ใช้เวลาเป็นร้อยมิลลิวินาที
     *   (บน production นานกว่า local ชัดเจน) ระหว่างนั้น state.presence ว่าง
     *   เราจึงถูกจัดเป็น "เคยเข้าห้อง" ทั้งที่กำลังนั่งมองจออยู่
     *
     *   เจอตอนทดสอบบน production — local เร็วเกินจนไม่ทันเห็น
     */
    if (!online.some((l) => l.isMe)) {
      online.unshift({
        userId: state.me.userId,
        displayName: state.me.displayName,
        avatarUrl: state.me.avatarUrl,
        nickname: state.me.nickname,
        role: roleOf(state.me.userId),
        canSkip: state.me.canSkip,
        online: true,
        isMe: true,
      })
    }

    const onlineIds = new Set(online.map((l) => l.userId))
    const offline = state.members
      .filter((m) => !onlineIds.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        nickname: m.nickname,
        role: m.role,
        canSkip: m.canSkip,
        online: false,
        isMe: m.userId === state.me.userId,
      }))

    // เจ้าของห้องขึ้นก่อนเสมอ ที่เหลือเรียงตามชื่อให้ลำดับคงที่ทุกเครื่อง
    const byRank = (a: Listener, b: Listener) =>
      Number(b.role === 'OWNER') - Number(a.role === 'OWNER') ||
      a.displayName.localeCompare(b.displayName, 'th')

    return [...online.sort(byRank), ...offline.sort(byRank)]
  }, [
    state.presence, state.members, state.room.ownerId,
    state.me.userId, state.me.displayName, state.me.canSkip,
    state.me.avatarUrl, state.me.nickname,
  ])

  const listeners = state.presence.length > 0 ? state.presence.length : state.members.length
  const joinNotices = useJoinNotices(state.presence, state.me.userId)

  /* ── กิจกรรมในห้อง ─────────────────────────────────────────────── */
  const extras = useRoomExtras({
    roomId: state.room.id,
    roomCode: code,
    queueItemId: state.playback.queueItemId,
    listeners,
    enabled: true,
  })
  const [dedicateVideo, setDedicateVideo] = useState<VideoResult | null>(null)
  const [styleOpen, setStyleOpen] = useState(false)
  const [dark, setDark] = useState(true)

  /* ★ เฝ้า data-theme บน <html> — ปุ่มสลับธีมแก้ attribute ตรง ๆ ไม่มี event ให้ฟัง
       (วิธีเดียวกับที่ลอบบี้ใช้เพื่อวาด canvas ใหม่ตอนสลับธีม) */
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme !== 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  /** หน้าตาตัวละครของเรา — คนที่ยังไม่เคยแต่งได้ชุดประจำตัวที่สุ่มจาก id */
  const look = useMemo(
    () => sanitizeAppearance(state.me.appearance, state.me.userId),
    [state.me.appearance, state.me.userId],
  )

  /**
   * ★ ธีมไม่ต้องเก็บ state ฝั่งนี้เลย
   *   มันอยู่ใน state.room ซึ่งถูกอัปเดตโดย realtime ของตาราง rooms อยู่แล้ว
   *   การกดเลือกจึงแค่ยิง API แล้วรอให้ event เด้งกลับมา — เหมือนกับที่
   *   ทุกคนในห้องได้รับ ★ ทำให้คนกดเห็นตรงกับคนอื่นเสมอ ไม่มีทางเหลื่อม
   */
  const [wallpaperUploading, setWallpaperUploading] = useState(false)

  /**
   * อัปรูปแล้วตั้งเป็นพื้นหลังแชทของทั้งห้อง
   *
   * ★ ใช้ทางอัปรูปเส้นเดียวกับรูปในแชท (/chat/image)
   *   ★★ ไม่ทำ endpoint แยก เพราะข้อจำกัดที่ต้องบังคับเหมือนกันเป๊ะ:
   *      ชนิดไฟล์ · ขนาดไม่เกิน 3MB · ต้องเป็นสมาชิกห้อง · rate limit
   *      การมีสองทางที่ต้องดูแลกฎชุดเดียวกันคือที่ที่กฎจะเริ่มไม่ตรงกัน
   */
  const uploadWallpaper = useCallback(
    async (file: File) => {
      if (!(await confirm({ kind: 'edit', subject: t('chat.theme') }))) return
      setWallpaperUploading(true)
      try {
        const uploaded = await handleUploadImage(file)
        if (!uploaded) return
        await applyChatStyle({
          theme: state.room.chatTheme ?? 'green',
          wallpaper: state.room.chatWallpaper ?? 'none',
          wallpaperUrl: uploaded.url,
        })
      } finally {
        setWallpaperUploading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, handleUploadImage, state.room.chatTheme, state.room.chatWallpaper, t],
  )

  const applyChatStyle = useCallback(
    async (next: { theme: string; wallpaper: string; wallpaperUrl: string | null }) => {
      try {
        await apiFetch(`/api/rooms/${code}/chat/style`, { method: 'POST', body: next })
      } catch (error) {
        showToast(errorText(error, t, 'toast.themeFailed'), 'error')
      }
    },
    [code, showToast, t],
  )
  const [extrasBusy, setExtrasBusy] = useState(false)

  const handleVoteSkip = useCallback(async () => {
    try {
      const result = await extras.toggleVote()
      if (result.skipped) showToast(t('toast.voteSkipped'), 'success')
      else if (result.voted) showToast(t('toast.voted', { votes: result.votes, needed: result.needed }), 'success')
    } catch (error) {
      showToast(errorText(error, t, 'toast.voteFailed'), 'error')
    }
  }, [extras, showToast, t])

  const handleQuiz = useCallback(
    async (action: 'start' | 'next' | 'stop') => {
      setExtrasBusy(true)
      try {
        await extras.quizAction(action)
      } catch (error) {
        showToast(errorText(error, t, 'toast.quizFailed'), 'error')
      } finally {
        setExtrasBusy(false)
      }
    },
    [extras, showToast, t],
  )

  /**
   * ★ กำลังดูผลการค้นหา → ย่อ player ลงมุมขวาล่าง (แบบ YouTube)
   *   ตัวคอมโพเนนต์ยังอยู่ที่เดิมใน tree เปลี่ยนแค่ CSS
   *   iframe จึงไม่ถูกสร้างใหม่ เพลงเล่นต่อไม่สะดุด
   */
  const searching = search.status !== 'idle'
  const playerMode = searching ? 'mini' : 'full'

  return (
    <>
      <AppHeader
        searchValue={query}
        onSearchChange={setQuery}
        onSearch={(q) => void runSearch(q, '')}
        searchPlaceholder={t('header.searchPlaceholder')}
        exitLabel={t('room.exit')}
        right={
          <>
            {/**
             * ★★ ป้ายแชทบนหัวจอ — ไม่ใช่แค่บนแท็บ
             *
             *   ตัวเลขบนแท็บใช้ได้บนคอมที่เห็นแผงขวาตลอด แต่บนมือถือแผงอยู่
             *   ล่างสุดของหน้า คนที่กำลังดู player จะไม่มีวันเห็นว่ามีข้อความใหม่
             *
             *   ปุ่มนี้อยู่ในแถบบนที่ติดจออยู่แล้ว กดแล้วเลื่อนไปเปิดแท็บแชทให้เลย
             */}
            {chat.unread > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setPanelTab('chat')
                  chat.clearUnread()
                  document
                    .querySelector('[role="tablist"]')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                aria-label={t('room.unreadJump', { n: chat.unread })}
                className="relative grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                  <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
                </svg>
                <span className="absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-[11px] font-medium leading-[18px] text-accent-ink">
                  {chat.unread > 99 ? '99+' : chat.unread}
                </span>
              </button>
            ) : null}

            {/* ★ ตัวเลขเดิมกดได้แล้ว — กางออกมาเป็นรายชื่อว่าใครอยู่ในห้องบ้าง */}
            <ListenersPanel
              listeners={listenerList}
              canTransfer={canManageRoom(state.me.role)}
              transferringTo={transferringTo}
              onTransfer={(userId, name) => {
                const who = listenerList.find((l) => l.userId === userId)
                setTransferTarget({ userId, displayName: name, avatarUrl: who?.avatarUrl ?? null })
              }}
              onSetSkip={(userId, name, allow) => void handleSetSkip(userId, name, allow)}
              savingSkipFor={savingSkipFor}
            />
            {/**
              * ★ อวาตาร์บนแถบบนกดได้ = ทางเข้าโปรไฟล์
              *   เป็นที่ที่คนไปหาโปรไฟล์ตัวเองอยู่แล้วในทุกเว็บ ไม่ต้องสอน
              */}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label={t('header.profile')}
              title={state.me.displayName}
              className="shrink-0 rounded-full ring-2 ring-transparent transition-all hover:ring-line-strong"
            >
              <Avatar
                userId={state.me.userId}
                name={state.me.displayName}
                avatarUrl={state.me.avatarUrl}
                size={32}
              />
            </button>
          </>
        }
      />

      <ConnectionBanner status={state.connection} />

      {/*
        ★ กริดแบบ watch page: คอลัมน์หลักยืดได้ + sidebar 402px
          จอแคบกว่า 1000px ยุบเป็นคอลัมน์เดียว (เหมือน YouTube เป๊ะ)
      */}
      {/**
        * ★ แผงขวากว้างขึ้นเมื่ออยู่แท็บแชท
        *
        *   402px เป็นความกว้างของ playlist ใน YouTube ซึ่งพอดีกับรายการเพลง
        *   แต่แคบเกินไปสำหรับแชท — ฟองข้อความกว้างได้ไม่ถึง 300px
        *   และรูปที่ส่งกันก็ดูไม่ออกว่าเป็นอะไร
        *
        *   ขยายเฉพาะตอนใช้แชทจริง ๆ แล้วหดกลับเมื่อสลับไปดูคิว
        *   — ได้พื้นที่ตอนต้องการโดยไม่เบียด player ตลอดเวลา
        */}
      <main
        className={cn(
          /*
           * ★★ ใช้ความกว้างเต็มจอ แต่เว้นขอบเท่ากันทั้งสองข้าง
           *
           *    เดิมล็อกไว้ที่ 1754px แล้วจัดกึ่งกลาง บนจอกว้างจึงเหลือช่องว่าง
           *    ข้างละเกือบ 80px โดยไม่ได้ทำหน้าที่อะไร — เอาเพดานนั้นออก
           *
           *    ★ แต่ "เต็มจอ" ไม่ได้แปลว่า "ชนขอบ" — เคยลองปล่อยให้แผงขวา
           *      ชิดขอบจอแล้วพบว่าเส้นใต้แท็บกับปุ่มส่งข้อความไปจ่อขอบพอดี
           *      จนดูเหมือนหน้าเว็บถูกครอบตัด ★ เว้น 24px เท่ากันสองข้าง
           *        ได้พื้นที่เกือบเท่ากันโดยที่ยังอ่านเป็นแผงที่จบในตัว
           */
          'grid w-full gap-6 px-0 py-0 lg:px-6 lg:py-6',
          /*
           * ★★★ ความกว้างแผงคงที่ ไม่ผูกกับแท็บที่เลือก
           *
           *     เดิมแชทได้ 520px ส่วนคิว/ประวัติได้ 402px แล้วใส่ transition
           *     ให้ขยับนุ่ม ๆ — ตั้งใจว่าแต่ละแท็บจะได้พื้นที่ที่เหมาะกับตัวเอง
           *
           *     ★ แต่ผลจริงคือทั้งหน้าขยับทุกครั้งที่กดสลับแท็บ วิดีโอเปลี่ยนขนาด
           *       ตามไปด้วย ซึ่งแปลว่าการ "ดูว่ามีเพลงอะไรในคิว" ไปรบกวนสิ่งที่
           *       กำลังดูอยู่ ทั้งที่มันควรเป็นการกระทำที่ไม่กระทบอะไรเลย
           *
           *     ★★ บทเรียน: แท็บคือการสลับ "เนื้อหา" ไม่ใช่สลับ "เลย์เอาต์"
           *        พื้นที่ที่เหมาะกับแท็บหนึ่งมากกว่าอีกแท็บ ไม่คุ้มกับการที่
           *        ทุกอย่างบนจอกระโดดทุกครั้งที่คนกดดูคิวเพลง
           *
           *     เลือก 520px เพราะแชทเป็นแท็บเริ่มต้นและถูกใช้มากที่สุด
           *     คิวเพลงได้ที่เหลือเฟือ ซึ่งไม่เสียอะไร
           */
          'lg:grid-cols-[minmax(0,1fr)_min(520px,38vw)]',
        )}
      >
        <div className="relative min-w-0">
          {/* ★ ชั้นอีโมจิทับ player — pointer-events-none จึงไม่บังปุ่มอะไร */}
          <ReactionLayer items={reactions.items} />

          {/**
            * ── ใครเพิ่งเข้าห้อง ────────────────────────────────
            *
            * ★ ลอยอยู่เหนือ player ไม่ได้ทับ และ pointer-events-none
            *   มันเป็นข่าวที่อ่านผ่านตา ไม่ใช่ของที่ต้องกด — การกินพื้นที่คลิก
            *   เพื่อข้อความที่หายไปในสี่วินาทีไม่คุ้มเลย
            */}
          {joinNotices.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex flex-col items-center gap-1.5">
              {joinNotices.map((n) => (
                <span
                  key={n.key}
                  className={cn(
                    'join-notice flex items-center gap-2 rounded-full py-1 ps-1 pe-3',
                    'bg-elevated/85 shadow-lg ring-1 ring-line backdrop-blur-md',
                  )}
                >
                  <Avatar userId={n.userId} name={n.displayName} avatarUrl={n.avatarUrl} size={22} />
                  <span className="text-[12px] text-ink-soft">
                    <span className="font-medium text-ink">{n.displayName}</span> {t('room.someoneJoined')}
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          {/**
            * ★★ แสงรอบจอ (ambient) — ปกเพลงเบลอแรงฟุ้งออกนอกกรอบวิดีโอ
            *    ★ เปลี่ยนสีตามเพลงที่เล่นทุกครั้ง ทั้งหน้าจึงรู้สึกว่า "เพลงนี้กำลังเล่น"
            *    ★ เฉพาะตอน player เต็มจอ — ตอนย่อไปมุมจอ แสงลอยค้างกลางหน้าจะดูเป็นบั๊ก
            */}
          {playerMode === 'full' && state.nowPlaying?.thumbnailUrl ? (
            <div
              aria-hidden="true"
              className="room-ambient"
              style={{ backgroundImage: `url(${state.nowPlaying.thumbnailUrl})` }}
            />
          ) : null}

          <MusicPlayer
            playback={state.playback}
            nowPlaying={state.nowPlaying}
            serverNow={serverNow}
            mode={playerMode}
            onEnded={handleEnded}
            onUnplayable={handleUnplayable}
            onExpand={clearSearch}
            canControl={canControlPlayback(state.me)}
            canSkip={canSkip(state.me)}
            onPlayPause={handlePlayPause}
            onSkip={handleSkip}
            onDesync={() => void handleResync()}
            onSeek={(sec) => void handleSeek(sec)}
          />

          <div className={cn('px-4 lg:px-0', searching && 'hidden')}>
            {/* ★ ป้ายสถานะ + ชื่อห้อง เหนือชื่อเพลง — รู้ทันทีว่าอยู่ห้องไหน และเพลงเล่นอยู่ไหม */}
            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              {state.nowPlaying && state.playback.isPlaying ? (
                <span className="room-live-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
                  <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="eq-bar w-[2px] rounded-full bg-current"
                        style={{
                          height: [6, 11, 8][i],
                          animationDuration: `${[0.7, 0.95, 0.8][i]}s`,
                          animationDelay: `${[0, 0.2, 0.35][i]}s`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">{t('join.playing')}</span>
                </span>
              ) : null}
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft">
                <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="currentColor" aria-hidden="true">
                  <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z" />
                </svg>
                <span dir="auto" className="truncate">{state.room.name}</span>
              </span>
            </div>
            <h1 className="relative mt-2 text-xl font-black leading-snug tracking-tight lg:text-2xl">
              {state.nowPlaying?.title ?? t('room.nothingPlaying')}
            </h1>

            {/**
              * ★★ แบนเนอร์ขอเพลงอยู่ตรงนี้ ไม่ใช่ในแชท
              *
              *    ถ้าเด้งเป็นข้อความในแชท มันจะเลื่อนหายไปในไม่กี่วินาที
              *    แล้วคนที่เข้ามากลางเพลงจะไม่มีทางรู้เลยว่าเพลงนี้ขอให้ใคร
              *    ★ ติดไว้ใต้ชื่อเพลง = อยู่ตราบเท่าที่เพลงยังเล่นอยู่
              *      ซึ่งเป็นอายุที่ถูกต้องของข้อมูลชิ้นนี้พอดี
              */}
            {state.nowPlaying?.dedicatedTo ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-accent/12 px-3 py-2 text-sm">
                <span aria-hidden="true">💌</span>
                <span className="text-ink-soft">
                  {state.nowPlaying.addedBy?.displayName ?? t('room.someone')} {t('room.dedicatedBy')}
                </span>
                <span className="font-medium">{state.nowPlaying.dedicatedTo.displayName}</span>
                {state.nowPlaying.dedication ? (
                  <span className="w-full text-ink-soft">“{state.nowPlaying.dedication}”</span>
                ) : null}
              </p>
            ) : null}

            {/**
             * ★ "ต่อไป" — รู้ล่วงหน้าว่าอะไรกำลังจะมา
             *   ข้อมูลอยู่ในแผงคิวอยู่แล้ว แต่บนมือถือแผงอยู่ล่างสุด
             *   คนที่ดู player อยู่จึงไม่มีทางเห็นโดยไม่เลื่อน
             */}
            {state.queue[0] ? (
              <p className="room-next mt-2 flex min-w-0 max-w-full items-center gap-2 rounded-xl px-3 py-1.5 text-xs text-ink-soft">
                <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-accent" fill="currentColor" aria-hidden="true">
                  <path d="M6 5.5v13l9-6.5zM16 5h2.5v14H16z" />
                </svg>
                <span className="shrink-0 font-semibold text-ink-faint">{t('room.upNext')}</span>
                <span dir="auto" className="truncate">{state.queue[0].title}</span>
              </p>
            ) : null}

            <RoomActions
              room={state.room}
              me={state.me}
              playback={state.playback}
              nowPlaying={state.nowPlaying}
              listeners={listeners}
              skipVotes={extras.votes}
              skipNeeded={extras.needed}
              myVote={extras.myVote}
              onVoteSkip={() => void handleVoteSkip()}
              hasQueue={state.queue.length > 0}
              pending={controlPending}
              onPlayPause={handlePlayPause}
              onSkip={handleSkip}
              onClear={handleClear}
              onShare={() => setShareOpen(true)}
              onSummary={() => setSummaryOpen(true)}
              onReact={handleReact}
            />

            {/* ★ คำอธิบายแบบเดียวกับทุกหน้า — คนเข้าห้องครั้งแรกไม่ต้องมีใครสอน · ยุบได้ */}
            <div className="mt-5">
              <MusicGuide id="room" art="vinyl" />
            </div>
          </div>

          {/* ★ ผลการค้นหาเต็มความกว้าง — player ย่อไปมุมขวาล่างแล้ว */}
          <div className="px-4 lg:px-0">
            <SearchResults
              search={search}
              query={query}
              queuedVideoIds={queuedVideoIds}
              pendingVideoId={pendingVideoId}
              addDisabledReason={addDisabledReason}
              onAdd={handleAdd}
              onDedicate={setDedicateVideo}
              onLoadMore={() => void runSearch(query, search.nextPageToken ?? '')}
              onClear={clearSearch}
              onRetry={() => void runSearch(query, '')}
            />

            {/* ★ เพลงแนะนำโผล่เฉพาะตอนไม่ได้ค้นหา — พื้นที่นี้เป็นของผลค้นหาตอนค้น */}
            {!searching ? (
              <Recommendations
                items={recommended}
                loading={recommendLoading}
                loadingMore={recommendMore}
                hasMore={recommendHasMore}
                total={recommendTotal}
                basedOn={recommendBasedOn}
                relatedCount={recommendRelated}
                onLoadMore={handleLoadMoreRecommended}
                queuedVideoIds={queuedVideoIds}
                pendingVideoId={pendingVideoId}
                addDisabledReason={addDisabledReason}
                onAdd={handleAdd}
              />
            ) : null}
          </div>
        </div>

        <SidePanel
          chatTheme={state.room.chatTheme}
          chatWallpaper={state.room.chatWallpaper}
          chatWallpaperUrl={state.room.chatWallpaperUrl}
          dark={dark}
          appearance={look}
          onOpenStyle={() => setStyleOpen(true)}
          quiz={extras.quiz}
          quizBusy={extrasBusy}
          serverSkew={serverNow() - Date.now()}
          onQuiz={(action) => void handleQuiz(action)}
          panelRef={panelRef}
          room={state.room}
          me={state.me}
          queue={state.queue}
          history={state.history}
          nowPlaying={state.nowPlaying}
          removingId={removingId}
          onRemove={handleRemove}
          canPlay={canSkip(state.me)}
          onReorder={handleReorder}
          canReorder={canAddToQueue(state.me.role, state.room)}
          startingId={startingId}
          onPlay={handlePlayItem}
          onAddAgain={(item) =>
            void handleAdd({
              videoId: item.videoId,
              title: item.title,
              channelTitle: item.channelTitle ?? '',
              thumbnailUrl: item.thumbnailUrl ?? '',
              duration: item.duration,
            })
          }
          addingVideoId={pendingVideoId}
          queuedVideoIds={queuedVideoIds}
          messages={chat.messages}
          unread={chat.unread}
          mentionUnread={chat.mentionUnread}
          chatReactions={chat.reactions}
          chatReads={chat.reads}
          onChatRead={handleChatRead}
          members={listenerList}
          onOpenChat={chat.clearUnread}
          onSendChat={handleSendChat}
          onDeleteChat={handleDeleteChat}
          onReactChat={handleReactChat}
          onAddVideo={handleAddById}
          stickers={stickers}
          onUploadSticker={handleUploadSticker}
          onRemoveSticker={handleRemoveSticker}
          uploadingSticker={uploadingSticker}
          onTyping={handleTyping}
          typing={chat.typing.filter((t) => t.userId !== state.me.userId)}
          onUploadImage={handleUploadImage}
          activeTab={panelTab}
          onTabChange={setPanelTab}
        />
      </main>

      {/**
        * ★★ ปุ่มแชทลอยบนมือถือ
        *
        *    บนจอแคบ แผงขวาไม่ได้อยู่ "ข้าง ๆ" แต่ไหลลงไปอยู่ใต้ player
        *    ซึ่งแปลว่าต้องเลื่อนลงไปหาเองทุกครั้ง — สำหรับสิ่งที่ผู้ใช้
        *    เปิดบ่อยที่สุดในหน้านี้ การซ่อนไว้ใต้การเลื่อนคือราคาที่แพงเกินไป
        *
        *    ★ ซ่อนเมื่อ player ย่อลงมุมล่าง (ตอนดูผลค้นหา) — กล่องนั้นกว้าง
        *      เกือบเต็มจอบนมือถือ ปุ่มจะไปทับกันพอดี
        */}
      {playerMode === 'full' ? (
        <button
          type="button"
          onClick={() => {
            setPanelTab('chat')
            chat.clearUnread()
            panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          aria-label={
            chat.unread > 0 ? t('room.gotoChatUnread', { n: chat.unread }) : t('room.gotoChat')
          }
          className={cn(
            'fixed bottom-4 end-4 z-40 grid size-14 place-items-center rounded-full lg:hidden',
            'bg-accent text-accent-ink shadow-2xl transition-transform active:scale-95',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm6 5H7v-2h6v2zm4-6H7V6h10v2z" />
          </svg>
          {chat.unread > 0 ? (
            <span
              className={cn(
                'absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full px-1',
                'text-[11px] font-medium ring-2 ring-page',
                // ★ ถูกเรียกชื่อ = เหลือง · ข้อความทั่วไป = ขาว
                chat.mentionUnread > 0
                  ? 'bg-warn text-[#1a1400]'
                  : 'bg-page text-ink',
              )}
            >
              {chat.mentionUnread > 0
                ? `@${chat.mentionUnread}`
                : chat.unread > 99
                  ? '99+'
                  : chat.unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {profileOpen ? (
        <ProfileDialog
          initial={{
            displayName: state.me.displayName,
            nickname: state.me.nickname,
            avatarUrl: state.me.avatarUrl,
          }}
          userId={state.me.userId}
          onSaved={() => {
            setProfileOpen(false)
            // ★ resync เพื่อให้ชื่อ/รูปใหม่ไหลกลับมาทาง bootstrap
            //   ไม่แก้ state เองเพราะ members[] ของคนอื่นก็ต้องอัปเดตด้วย
            void handleResync()
          }}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}

      {/**
        * ★ กล่องยืนยันยกตำแหน่ง — ปิดตัวเองหลังยิงคำสั่งสำเร็จเท่านั้น
        *   ถ้าปิดทันทีที่กด คนจะไม่รู้ว่ามันกำลังทำงานอยู่ แล้วกดซ้ำ
        */}
      {transferTarget ? (
        <TransferOwnerDialog
          target={transferTarget}
          pending={transferringTo === transferTarget.userId}
          onConfirm={() => {
            void handleTransferOwner(transferTarget.userId, transferTarget.displayName).then(() =>
              setTransferTarget(null),
            )
          }}
          onClose={() => setTransferTarget(null)}
        />
      ) : null}

      {shareOpen ? (
        <ShareDialog
          roomCode={code}
          roomName={state.room.name}
          onClose={() => setShareOpen(false)}
          onRename={handleRename}
          onToast={showToast}
        />
      ) : null}

      {styleOpen ? (
        <ChatStyleDialog
          theme={state.room.chatTheme}
          wallpaper={state.room.chatWallpaper}
          wallpaperUrl={state.room.chatWallpaperUrl}
          dark={dark}
          uploading={wallpaperUploading}
          onPick={async (next) => {
            if (!(await confirm({ kind: 'edit', subject: t('chat.theme') }))) return
            void applyChatStyle(next)
          }}
          onUpload={(file) => void uploadWallpaper(file)}
          onClose={() => setStyleOpen(false)}
        />
      ) : null}

      {dedicateVideo ? (
        <DedicateDialog
          title={dedicateVideo.title}
          members={listenerList}
          meId={state.me.userId}
          busy={pendingVideoId === dedicateVideo.videoId}
          onClose={() => setDedicateVideo(null)}
          onSubmit={(to, message) => {
            const video = dedicateVideo
            setDedicateVideo(null)
            void handleAddById(video.videoId, { dedicatedTo: to, dedication: message })
          }}
        />
      ) : null}

      {summaryOpen ? (
        <SummaryDialog
          roomCode={code}
          roomName={state.room.name}
          onClose={() => setSummaryOpen(false)}
        />
      ) : null}

      <Toast toast={toast} />
    </>
  )
}
