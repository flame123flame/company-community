'use client'

import { useYouTubePlayer } from '@/hooks/useYouTubePlayer'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { playerErrorMessage, type PlayerStateValue, type YouTubePlayer } from '@/types/youtube'
import { useT } from '@/lib/i18n/client'
import type { DictKey } from '@/lib/i18n/dict'
import { Untranslated } from '@/lib/i18n/office'

/**
 * กรอบวิดีโอ 16:9
 *
 * ★ ไม่มีการซ่อน ย่อ หรือวางอะไรทับตัว player
 *   วิดีโอและโฆษณาทั้งหมดเสิร์ฟโดย youtube.com ผ่าน iframe ตามข้อกำหนด
 *   overlay ด้านล่างแสดงเฉพาะตอน player ยังไม่พร้อมหรือมีปัญหาเท่านั้น
 */
export function YouTubeEmbed({
  videoId,
  paused,
  onReady,
  onStateChange,
  onError,
}: {
  videoId: string | null
  /** ห้องสั่งหยุดอยู่ — แสดงให้ "ทุกคน" เห็น ไม่ใช่เฉพาะคนที่กด */
  paused?: boolean
  onReady?: (player: YouTubePlayer) => void
  onStateChange?: (state: PlayerStateValue, player: YouTubePlayer) => void
  onError?: (code: number) => void
}) {
  const t = useT()
  const { containerRef, status, errorMessage, retry } = useYouTubePlayer({
    videoId,
    ...(onReady ? { onReady } : {}),
    ...(onStateChange ? { onStateChange } : {}),
    ...(onError ? { onError } : {}),
  })

  return (
    <div className="relative aspect-video w-full bg-black">
      {/* YouTube แทนที่ div นี้ด้วย <iframe> ของตัวเอง */}
      <div ref={containerRef} className="size-full" />

      {status === 'loading' ? (
        <div className="absolute inset-0 grid place-items-center bg-black">
          <Spinner className="size-8 text-ink-soft" />
        </div>
      ) : null}

      {status === 'stalled' ? (
        <div className="absolute inset-0 grid place-items-center bg-black/90 px-6 text-center">
          <div>
            <p className="text-sm">{t('player.noResponse')}</p>
            <p className="mt-1 text-xs text-ink-soft">
              {t('player.noResponseHint')}
            </p>
            <Button size="sm" className="mt-3" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center bg-black/95 px-6 text-center">
          <div>
            <p className="text-sm text-danger">{t('player.cantOpen')}</p>
            {/* ★ errorMessage เป็นกุญแจแปล — ดู lib/youtube/player-loader.ts */}
            <p className="mt-1 text-xs text-ink-soft">{errorMessage ? t(errorMessage as DictKey) : null}</p>
          </div>
        </div>
      ) : null}

      {/*
        ★★ ป้าย "หยุดชั่วคราว" สำคัญกว่าที่คิด
​
          คนที่ไม่มีสิทธิ์ควบคุมจะไม่เห็นปุ่มเล่น/หยุดเลย พอห้องถูกสั่งหยุด
          หน้าจอเขาคือวิดีโอที่ค้างเฉย ๆ ซึ่งแยกไม่ออกจาก "เว็บพัง"
​
          ป้ายนี้เปลี่ยนความรู้สึกจาก "มันค้าง" เป็น "มีคนกดหยุด" ซึ่งต่างกันมาก
      */}
      {status === 'ready' && videoId && paused ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55">
          <div className="flex items-center gap-2 rounded-full bg-black/75 px-4 py-2">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
            <span className="text-sm font-medium">{t('room.pauseShort')}</span>
          </div>
        </div>
      ) : null}

      {status === 'ready' && !videoId ? (
        /* ★★ ห้องว่าง = เวทีรอเพลงแรก ไม่ใช่จอดำ — แผ่นเสียงหมุนรอ และบอกว่าต้องทำอะไรต่อ */
        <div className="mus-empty absolute inset-0 grid place-items-center overflow-hidden px-6 text-center">
          <div className="relative">
            <div aria-hidden="true" className="mus-vinyl mus-vinyl-idle relative mx-auto size-[clamp(72px,18vw,150px)]">
              <span className="mus-vinyl-label" />
            </div>
            <p className="mt-[clamp(10px,2.4vw,20px)] text-[clamp(15px,2.4vw,22px)] font-black text-ink">{t('player.queueEmpty')}</p>
            <p className="mx-auto mt-1 hidden max-w-[440px] text-[13px] leading-relaxed text-ink-soft sm:block">
              <Untranslated>{t('player.queueEmptyHint')}</Untranslated>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { playerErrorMessage }
