'use client'

import { Fragment } from 'react'
import Image from 'next/image'
import { formatDuration } from '@/lib/youtube/duration'
import { cn } from '@/lib/cn'
import type { VideoResult } from '@/types/youtube'
import { useT } from '@/lib/i18n/client'

/**
 * เพลงแนะนำใต้ player — สำหรับตอนนึกเพลงไม่ออก
 *
 * ★ ทำไมเป็นกริดการ์ด ไม่ใช่แถวยาวแบบผลการค้นหา
 *
 *   ผลการค้นหาคือ "ฉันรู้ว่าอยากได้อะไร ช่วยหาให้ที" — ผู้ใช้อ่านชื่อเพลง
 *   ทีละแถวเพื่อเทียบว่าใช่ตัวไหน แถวยาวเต็มความกว้างจึงเหมาะ
 *
 *   เพลงแนะนำคือ "ฉันไม่รู้ว่าอยากได้อะไร มีอะไรให้ดูบ้าง" — ผู้ใช้กวาดตา
 *   หารูปที่สะดุดตา กริดที่เห็นหลายตัวพร้อมกันจึงเหมาะกว่ามาก
 *
 *   (เป็นเหตุผลเดียวกับที่หน้าแรกของ YouTube เป็นกริด แต่หน้าผลค้นหาเป็นแถว)
 */
export function Recommendations({
  items,
  loading,
  loadingMore,
  hasMore,
  total,
  basedOn,
  relatedCount,
  onLoadMore,
  queuedVideoIds,
  pendingVideoId,
  addDisabledReason,
  onAdd,
}: {
  items: VideoResult[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  total: number
  /** ชื่อเพลงที่คำแนะนำคิดมาจาก — null = ยังไม่มีเพลงไหนเล่นเลย */
  basedOn: string | null
  /** จำนวนเพลงที่เกี่ยวข้องจริง (ทั้งกอง ไม่ใช่เฉพาะที่โหลดมาแล้ว) */
  relatedCount: number
  onLoadMore: () => void
  queuedVideoIds: Set<string>
  pendingVideoId: string | null
  /** null = เพิ่มได้ · ข้อความ = เหตุผลที่เพิ่มไม่ได้ */
  addDisabledReason: string | null
  onAdd: (video: VideoResult) => void
}) {
  const t = useT()
  if (loading) {
    return (
      <section className="mt-6">
        <Heading total={0} shown={0} basedOn={basedOn} relatedCount={relatedCount} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-video w-full rounded-xl bg-surface" />
              <div className="mt-2 h-4 w-11/12 rounded bg-surface" />
              <div className="mt-1.5 h-3 w-1/2 rounded bg-surface" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (items.length === 0) return null

  return (
    <section className="mt-6">
      <Heading total={total} shown={items.length} basedOn={basedOn} relatedCount={relatedCount} />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
        {items.map((video, i) => {
          const queued = queuedVideoIds.has(video.videoId)
          const pending = pendingVideoId === video.videoId
          const disabled = queued || pending || addDisabledReason !== null

          return (
            <Fragment key={video.videoId}>
              {/**
                * ★★★ เส้นคั่นตรงจุดที่เพลง "เกี่ยวข้อง" หมดพอดี
                *
                *     เพลงที่เกี่ยวกับเพลงหนึ่งมีจำกัด พอหมดแล้วที่เหลือคือ
                *     เพลงทั่วไปในเว็บ ★ ซึ่งต้องเรียกว่าเพลงทั่วไป ไม่ใช่
                *       แอบต่อท้ายเงียบ ๆ แล้วให้หัวข้อข้างบนพูดแทนว่าเกี่ยวข้อง
                *
                *     ★★ นี่คือรากของคำบ่นเดิมเลย — ของเดิมไม่ได้แค่แนะนำมั่ว
                *        แต่ "บอกไม่ตรงกับสิ่งที่ทำ" ด้วย การแก้ให้ฉลาดขึ้น
                *        โดยไม่แก้เรื่องพูดความจริง คือแก้ไปได้ครึ่งเดียว
                */}
              {basedOn && relatedCount > 0 && i === relatedCount ? (
                <li className="col-span-full -mb-2 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-xs text-ink-faint">{t('rec.othersDivider')}</span>
                  <span className="h-px flex-1 bg-line" />
                </li>
              ) : null}
            <li>
              <button
                type="button"
                onClick={() => onAdd(video)}
                disabled={disabled}
                title={queued ? t('rec.alreadyQueued') : (addDisabledReason ?? t('chat.addToQueue'))}
                aria-label={t('search.addLabel', { title: video.title })}
                className="group w-full text-start disabled:cursor-not-allowed"
              >
                <div className="rec-thumb relative aspect-video w-full overflow-hidden rounded-2xl bg-surface">
                  <Image
                    src={video.thumbnailUrl}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    className={cn(
                      'object-cover transition-opacity',
                      disabled && !pending ? 'opacity-40' : 'group-hover:opacity-90',
                    )}
                    // i.ytimg.com เสิร์ฟผ่าน CDN ที่เร็วอยู่แล้ว ไม่ต้องผ่าน
                    // image optimizer ของ Vercel ซึ่งคิดเงินต่อรูป
                    unoptimized
                  />

                  <span className="absolute bottom-1 end-1 rounded bg-black/80 px-1 text-[11px] font-medium tabular-nums text-white">
                    {formatDuration(video.duration)}
                  </span>

                  {/* ★ ป้ายบอกสถานะทับบนรูป — ไม่ต้องเพิ่มแถวข้อความให้กริดสูงขึ้น */}
                  {queued || pending ? (
                    <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-medium text-white">
                      {pending ? t('dedicate.busy') : t('room.alreadyQueued')}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity',
                        !disabled && 'group-hover:opacity-100 group-focus-visible:opacity-100',
                      )}
                    >
                      <span className="rec-add flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold">
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
                        </svg>
                        {t('chat.addToQueue')}
                      </span>
                    </span>
                  )}
                </div>

                <p dir="auto" className="mt-2 line-clamp-2 text-sm font-medium leading-5">{video.title}</p>
                <p dir="auto" className="mt-1 line-clamp-1 text-xs text-ink-soft">{video.channelTitle}</p>
              </button>
            </li>
            </Fragment>
          )
        })}
      </ul>

      {/**
       * ★ ปุ่มโหลดเพิ่ม ไม่ใช่ infinite scroll
       *
       *   หน้านี้มีคิวเพลงอยู่ล่างสุดบนมือถือ ถ้าโหลดเองไปเรื่อย ๆ
       *   ผู้ใช้จะเลื่อนลงไปถึงคิวไม่ได้เลย — เนื้อหางอกหนีตลอด
       *   ปุ่มทำให้ผู้ใช้คุมได้ว่าจะดูเพิ่มหรือเลื่อนผ่านไป
       */}
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className={cn(
              'rounded-full border border-line px-5 py-2 text-sm font-medium',
              'transition-colors hover:border-line-strong hover:bg-surface',
              'disabled:opacity-50',
            )}
          >
            {loadingMore ? t('rec.loading') : t('rec.loadMore')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/**
 * หัวข้อที่บอกว่า "คิดมาจากเพลงไหน"
 *
 * ★★★ ของเดิมเขียนว่า "สุ่มจากเพลงที่เคยผ่านเว็บนี้" ซึ่งซื่อสัตย์แต่ไร้ประโยชน์
 *
 *     ผู้ใช้อ่านแล้วก็ยังไม่รู้อยู่ดีว่าทำไมถึงได้เพลงพวกนี้มา
 *     ★ ตอนนี้บอกชื่อเพลงต้นทางไปเลย — คนเห็นปุ๊บเข้าใจทันทีว่าระบบคิดจากอะไร
 *       และถ้ามันแนะนำผิด เขาก็รู้ทันทีว่าผิดเพราะอะไร
 */
function Heading({
  total,
  shown,
  basedOn,
  relatedCount,
}: {
  total: number
  shown: number
  basedOn: string | null
  relatedCount: number
}) {
  const t = useT()
  return (
    <div className="mb-4 flex items-start gap-3">
      {/* ★ ไอคอนไล่สีหน้าหัวข้อ — ภาษาเดียวกับหัวข้อในหน้าออฟฟิศ */}
      <span aria-hidden="true" className="mus-act-icon grid size-10 shrink-0 place-items-center rounded-2xl" style={{ '--tint': '175 82 222' } as React.CSSProperties}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <path d="M12 2l2.4 6.9H22l-6 4.4 2.3 7L12 16l-6.3 4.3 2.3-7-6-4.4h7.6z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-black">
        {t('rec.title')}
        {total > 0 ? (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
            {t('rec.count', { shown, total })}
          </span>
        ) : null}
      </h2>

      {basedOn ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          {/* โน้ตดนตรี — บอกว่าบรรทัดนี้พูดถึงเพลงที่กำลังเล่น */}
          <svg
            viewBox="0 0 24 24"
            className="size-3.5 shrink-0 text-ink-faint"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
          </svg>
          {/**
            * ★ ชื่อเพลงตัดบรรทัดเดียว — ชื่อคลิป YouTube ยาวได้ถึง 100 ตัวอักษร
            *   ถ้าปล่อยให้ตัดขึ้นบรรทัดใหม่ หัวข้อจะสูงกว่าการ์ดที่มันกำกับอยู่
            */}
          <span className="min-w-0 truncate">
            {relatedCount > 0
              ? t('rec.basedOn', { title: basedOn })
              : t('rec.basedOnNone', { title: basedOn })}
          </span>
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-ink-soft">{t('rec.subtitle')}</p>
      )}
      </div>
    </div>
  )
}
