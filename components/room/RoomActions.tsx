'use client'

import { Avatar } from '@/components/AppHeader'
import { Button } from '@/components/ui/Button'
import { VolumeControl } from './VolumeControl'
import { ReactionBar } from './ReactionLayer'
import { cn } from '@/lib/cn'
import { canControlPlayback, canManageRoom, canSkip, roleLabelKey } from '@/lib/room/permissions'
import { formatDuration } from '@/lib/youtube/duration'
import type { MeDto, PlaybackDto, QueueItemDto, RoomDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'

/**
 * แถวใต้ชื่อวิดีโอ — เลียนแบบ "แถวช่อง + ปุ่มแคปซูล" ของ YouTube
 *
 *   [avatar] ชื่อช่อง          [ปุ่ม] [ปุ่ม] [ปุ่ม]
 *            ผู้ติดตาม
 *
 * ของเราแทนที่ด้วย: ใครเพิ่มเพลงนี้ + ปุ่มควบคุมห้อง + รหัสห้องสำหรับแชร์
 *
 * ★ ปุ่มที่ไม่มีสิทธิ์ถูกซ่อน ไม่ใช่แสดงแล้ว disable
 *   YouTube ก็ทำแบบนี้ — ไม่โชว์ปุ่มลบให้คนที่ไม่ใช่เจ้าของวิดีโอ
 */
export function RoomActions({
  room,
  me,
  playback,
  nowPlaying,
  listeners,
  skipVotes,
  skipNeeded,
  myVote,
  onVoteSkip,
  hasQueue,
  pending,
  onPlayPause,
  onSkip,
  onClear,
  onShare,
  onSummary,
  onReact,
}: {
  room: RoomDto
  me: MeDto
  playback: PlaybackDto
  nowPlaying: QueueItemDto | null
  listeners: number
  /** โหวตข้ามเพลงปัจจุบันแล้วกี่เสียง */
  skipVotes: number
  skipNeeded: number
  myVote: boolean
  onVoteSkip: () => void
  hasQueue: boolean
  pending: boolean
  onPlayPause: () => void
  onSkip: () => void
  onClear: () => void
  /** เปิดกล่องแชร์ (QR + ลิงก์ + เปลี่ยนชื่อห้อง) */
  onShare: () => void
  /** เปิดสรุปท้ายปาร์ตี้ */
  onSummary: () => void
  /** ส่งอีโมจิให้ทุกคนเห็น */
  onReact: (emoji: string) => void
}) {
  const t = useT()
  const mayControl = canControlPlayback(me)
  const maySkip = canSkip(me)
  const mayManage = canManageRoom(me.role)
  const nothingPlaying = playback.queueItemId === null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-line pb-4">
      {/* ── ซ้าย: ใครเพิ่มเพลงนี้ ────────────────────────────── */}
      {/**
        * ★★ ต้องมี basis ไม่ใช่ flex-1 เปล่า ๆ
        *
        *    บั๊กที่วัดเจอ: ที่ความกว้าง 1280px บล็อกนี้ยุบเหลือ 7px
        *    ชื่อหายไปทั้งบรรทัดและอวาตาร์ 40px ถูกตัดจนเหลือเส้นบาง ๆ
        *      1440px → กว้าง 133px (แคบแต่ยังอ่านได้)
        *      1280px → กว้าง 7px   ★ พัง
        *      1100px → กว้าง 610px (ตกบรรทัดใหม่ ถูกต้อง)
        *
        *    เพราะ flex-1 คือ `flex: 1 1 0%` — ฐานเป็นศูนย์ มันจึงยอมยุบจนหมด
        *    ก่อนที่ flex-wrap จะได้ตัดสินใจว่าควรตกบรรทัด
        *
        *    ★ basis 220px บอกว่า "ถ้าให้ฉันไม่ถึงเท่านี้ ให้ฉันลงบรรทัดใหม่"
        *      ซึ่งเป็นสิ่งที่ flex-wrap ควรทำตั้งแต่แรก
        */}
      <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
        {nowPlaying?.addedBy ? (
          <>
            <Avatar
              userId={nowPlaying.addedBy.userId}
              name={nowPlaying.addedBy.displayName}
              size={40}
            />
            <div className="min-w-0">
              <p dir="auto" className="truncate text-sm font-medium">
                {nowPlaying.channelTitle ?? t('room.unknownChannel')}
              </p>
              <p className="truncate text-xs text-ink-soft">
                {t('room.addedBy', { name: nowPlaying.addedBy.displayName })} · {formatDuration(nowPlaying.duration)}
              </p>
            </div>
          </>
        ) : (
          <>
            <Avatar
              userId={me.userId}
              name={me.displayName}
              avatarUrl={me.avatarUrl}
              size={40}
            />
            <div className="min-w-0">
              <p dir="auto" className="truncate text-sm font-medium">{me.displayName}</p>
              <p className="truncate text-xs text-ink-soft">
                {t(roleLabelKey(me.role))} · {t('common.listeners', { n: listeners })}
              </p>
            </div>
          </>
        )}
      </div>

      {/**
       * ── ขวา: ปุ่มแคปซูล ───────────────────────────────────
       *
       * ★★ มือถือ: เลื่อนแนวนอนในแถวของตัวเอง ไม่ใช่ดันทั้งหน้าให้ล้น
       *
       *    ที่ 320px ปุ่มห้าตัว (เสียง · เล่น · ข้าม · รหัสห้อง · ล้างคิว)
       *    กว้างรวมเกินหน้าจอแน่นอน เดิมใช้ shrink-0 บนกล่องนี้
       *    → ปุ่มไม่ยอมหด → ดันหน้าเว็บทั้งหน้าให้เลื่อนซ้ายขวาได้
       *
       *    ★ ทางเลือกที่ไม่เอา: ตัดปุ่มทิ้งบนมือถือ หรือย่อเหลือแต่ไอคอน
       *      — ตัดทิ้งแปลว่าฟีเจอร์หายไปเฉย ๆ ส่วนไอคอนล้วนทำให้เดาไม่ออก
       *        ว่าปุ่มไหนคืออะไร (ยิ่งปุ่ม "ล้างคิว" ที่กดผิดแล้วกู้ไม่ได้)
       *
       *    แถวเลื่อนแนวนอนเก็บทุกปุ่มไว้ครบและอ่านออกเหมือนเดิม
       *    โดยที่หน้าเว็บยังเลื่อนขึ้นลงอย่างเดียวเหมือนที่ควรเป็น
       */}
      <div
        className={cn(
          'flex items-center gap-2',
          'w-full overflow-x-auto pb-1 sm:w-auto sm:overflow-visible sm:pb-0',
          // ซ่อนแถบ scroll — บนมือถือไม่มีใครใช้ และมันกินที่
          'scrollbar-none [&::-webkit-scrollbar]:hidden',
        )}
      >
        {/**
         * ★ เสียงมาก่อนปุ่มอื่น และไม่มีเงื่อนไขสิทธิ์
         *
         *   ปุ่มที่เหลือในแถวนี้เปลี่ยนสิ่งที่ "ทุกคน" ได้ยิน จึงต้องมีสิทธิ์
         *   แต่เสียงเปลี่ยนแค่ความดังที่หูของคนคนเดียว — สมาชิกธรรมดาและ GUEST
         *   ต้องปรับได้เสมอ ไม่งั้นคนที่ไม่มีสิทธิ์คุมห้องจะไม่มีทางหรี่เสียงเลย
         */}
        {/* ★ อีโมจิมาก่อนสุด — เป็นของที่ทุกคนกดได้และกดบ่อยที่สุด */}
        <ReactionBar onReact={onReact} className="me-1" />

        <VolumeControl className="me-1" />

        {mayControl ? (
          <Button
            onClick={onPlayPause}
            disabled={pending || nothingPlaying}
            aria-label={playback.isPlaying ? t('room.pauseAll') : t('room.playAll')}
          >
            {playback.isPlaying ? (
              <>
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
                {t('room.pause')}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
                {t('room.play')}
              </>
            )}
          </Button>
        ) : null}

        {/**
          * ★★ มีสิทธิ์ = ปุ่มข้าม · ไม่มีสิทธิ์ = ปุ่มโหวต
          *
          *    เดิมคนที่ไม่มีสิทธิ์ไม่เห็นอะไรเลยตรงนี้ ซึ่งถูกตามกฎ
          *    "ไม่มีสิทธิ์ = ซ่อนปุ่ม" แต่มันทำให้เพลงที่ไม่มีใครอยากฟัง
          *    ค้างทั้งห้องเมื่อเจ้าของห้องไม่อยู่
          *
          *    ★ การโหวตไม่ใช่ปุ่มเดียวกันที่ปลดล็อกให้ — มันคือปุ่มคนละปุ่ม
          *      ที่ทำคนละเรื่อง (ขอเสียง ≠ สั่ง) จึงไม่ขัดกับกฎนั้น
          */}
        {maySkip ? (
          <Button onClick={onSkip} disabled={pending || nothingPlaying} aria-label={t('room.skipThis')}>
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M6 5.5v13l9-6.5z" />
              <path d="M16 5h2.5v14H16z" />
            </svg>
            {t('room.skip')}
          </Button>
        ) : (
          <Button
            onClick={onVoteSkip}
            disabled={pending || nothingPlaying}
            aria-label={myVote ? t('room.unvoteSkip') : t('room.voteSkip')}
            title={t('room.voteSkipHint')}
            className={myVote ? 'ring-1 ring-accent' : undefined}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M6 5.5v13l9-6.5z" />
              <path d="M16 5h2.5v14H16z" />
            </svg>
            {t('room.voteSkipShort')}
            {skipVotes > 0 ? (
              <span className="tabular-nums text-xs opacity-80">
                {skipVotes}/{skipNeeded}
              </span>
            ) : null}
          </Button>
        )}

        {/* ★ ปุ่มแชร์รหัสห้อง — ทรงเดียวกับปุ่ม "แชร์" ของ YouTube */}
        {/**
         * ★ กดแล้วเปิดกล่องแชร์ ไม่ใช่คัดลอกอย่างเดียวเหมือนเดิม
         *   การคัดลอกรหัสมีประโยชน์เฉพาะตอนพิมพ์ส่งในแชท แต่กรณีที่เกิดบ่อยกว่า
         *   คือคนนั่งอยู่ด้วยกันแล้วอยากให้เพื่อนเข้าห้อง — QR เร็วกว่ามาก
         *   (กล่องยังมีปุ่มคัดลอกรหัส/ลิงก์อยู่ครบ ไม่ได้เสียอะไรไป)
         */}
        <Button onClick={onShare} aria-label={t('room.shareRoom', { code: room.code })}>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M15 5.63L20.66 12 15 18.37V15h-1c-3.96 0-7.14 1-9.75 3.09 1.84-4.07 5.11-6.4 9.89-7.1l.86-.13V5.63M14 3v6C6.22 10.13 3.11 15.33 2 20.55c2.78-3.86 6.44-5.55 12-5.55v6l8-9-8-9z" />
          </svg>
          <span className="font-mono tracking-wider">{room.code}</span>
        </Button>

        {/**
         * ★ เจ้าของห้องเห็นปุ่มนี้เสมอ — ปิดการกดเมื่อไม่มีอะไรให้ล้าง
         *
         *   เดิมซ่อนทั้งปุ่มเมื่อ `hasQueue` เป็น false ซึ่งทำให้เจ้าของห้อง
         *   งงว่า "ทำไมไม่มีปุ่มล้างคิว" ทั้งที่แผงขวาขึ้นว่ามี 1 เพลง
         *
         *   สาเหตุคือ state.queue นับเฉพาะเพลงที่ "รออยู่" ไม่รวมเพลงที่กำลังเล่น
         *   ถ้าเหลือเพลงเดียวและเพลงนั้นกำลังเล่นอยู่ ก็ไม่มีอะไรให้ล้างจริง ๆ
         *
         *   ★ กฎ "ไม่มีสิทธิ์ = ซ่อนปุ่ม" ยังอยู่ (ดูหัวไฟล์) — แต่ตรงนี้ไม่ใช่
         *     เรื่องสิทธิ์ เป็นเรื่องสถานะว่าง ซึ่งควรอธิบาย ไม่ใช่ซ่อน
         */}
        <Button onClick={onSummary} aria-label={t('room.summaryLabel')} title={t('room.summaryHint')}>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
          </svg>
          {t('room.summary')}
        </Button>

        {mayManage ? (
          <Button
            variant="danger"
            onClick={onClear}
            disabled={pending || !hasQueue}
            aria-label={t('room.clearQueueLabel')}
            title={
              hasQueue
                ? t('room.clearQueueHint')
                : t('room.clearQueueEmpty')
            }
          >
            {t('room.clearQueue')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
