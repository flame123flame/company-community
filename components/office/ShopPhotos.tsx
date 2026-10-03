'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { shrinkImage } from '@/lib/image/shrink'

/** เพดานเดียวกับที่ add_restaurant_photos บังคับในฐานข้อมูล */
const MAX_PHOTOS = 10

export type ShopPhoto = { id: string; url: string }

/**
 * แกลเลอรีรูปของร้าน
 *
 * ★★★ รูปของร้าน ไม่ใช่รูปที่แนบมากับรีวิวของใครคนหนึ่ง
 *
 *     ★ หน้าปกเดิมดึงมาจาก "รูปรีวิวใบล่าสุด" ★★ จึงเปลี่ยนเองทุกครั้งที่
 *       มีคนรีวิวใหม่ และหายไปเลยถ้าคนนั้นลบรีวิว
 *       ★ ร้านที่ไม่มีใครรีวิวก็ไม่มีรูปตลอดกาล แม้จะมีคนอยากใส่ให้
 *
 * ★★ อัปโหลดทีละใบ ไม่ใช่ส่งก้อนเดียว
 *    ★ เห็นความคืบหน้าต่อใบ และรูป 10 ใบจากมือถือคือคำขอก้อนเดียว
 *      ที่ใหญ่พอจะ timeout ★★ เหตุผลเดียวกับรูปรีวิวใน RestaurantReviews
 *
 * ★ ย่อรูปก่อนส่งเสมอ — รูปจากมือถือใบละ 4–8 MB ซึ่งเกินเพดาน 5 MB ของ bucket
 */
export function ShopPhotos({
  shopId,
  photos,
  canEdit,
  onChanged,
  /** โหมดย่อ: แสดงอย่างเดียว ไม่มีปุ่มเพิ่ม/ลบ */
  compact,
}: {
  shopId: string
  photos: ShopPhoto[]
  canEdit?: boolean
  onChanged?: () => void
  compact?: boolean
}) {
  const ot = useOt()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const room = MAX_PHOTOS - photos.length

  async function upload(files: FileList) {
    setBusy(true)
    setError(null)
    try {
      /* ★ slice ตามที่เหลือจริง — เลือกมา 10 ใบตอนมีอยู่แล้ว 7 ใบ ต้องขึ้นแค่ 3 */
      for (const file of [...files].slice(0, Math.max(0, room))) {
        const small = await shrinkImage(file, 1600)
        const form = new FormData()
        form.append('file', small)
        const res = await fetch(`/api/office/food/restaurants/${shopId}/photos`, {
          method: 'POST',
          body: form,
        })
        const payload = (await res.json()) as
          | { ok: true }
          | { ok: false; error: { message: string } }
        if (!payload.ok) throw new Error(payload.error.message)
      }
      onChanged?.()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  async function remove(photoId: string) {
    setBusy(true)
    try {
      await fetch(`/api/office/food/restaurants/${shopId}/photos`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoId }),
      })
      onChanged?.()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  if (photos.length === 0 && !canEdit) return null

  return (
    <div>
      {photos.length > 0 ? (
        /*
         * ★★ รูปแรกใหญ่ ที่เหลือเล็ก — ไม่ใช่ตารางสี่เหลี่ยมเท่ากันหมด
         *    ★ รูปแรกคือหน้าปกที่คนเลือกไว้ มันควรได้พื้นที่ต่างจากใบอื่น
         *      ★★ ตารางเท่ากันหมดทำให้ทุกใบสำคัญเท่ากัน ซึ่งไม่จริง
         */
        /*
         * ★★★ รูปแบบตารางขึ้นกับ "มีกี่รูป" ไม่ใช่ตายตัวแบบเดียว
         *
         *     ★ ของเดิมให้รูปแรกกิน 2×2 เสมอ ★★ พอมีสองรูป ช่องที่เหลือ
         *       ในแถวว่างสองช่อง แล้วแกลเลอรีดูเหมือนรูปหายไป
         *       ★ ซึ่งเป็นสถานการณ์ปกติ — ร้านส่วนใหญ่มีรูปไม่กี่ใบ
         *     ★★ รูปแรกใหญ่คุ้มก็ต่อเมื่อมีรูปพอเติมช่องข้าง ๆ ครบ (ตั้งแต่ 5 ใบ)
         */
        <div
          className={cn(
            'grid gap-2',
            compact
              ? 'grid-cols-4'
              : photos.length === 1
                ? 'grid-cols-1'
                : photos.length < 5
                  ? 'grid-cols-2 sm:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-4',
          )}
        >
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className={cn(
                'group relative overflow-hidden rounded-xl border border-line bg-surface',
                !compact && photos.length >= 5 && i === 0 && 'col-span-2 row-span-2',
              )}
            >
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block w-full"
                aria-label={ot('food.photos.open')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  className={cn(
                    'w-full object-cover transition-transform duration-300 group-hover:scale-105',
                    compact
                      ? 'h-20'
                      : photos.length === 1
                        ? 'aspect-[16/9] h-auto'
                        : photos.length < 5
                          ? 'aspect-[4/3] h-auto'
                          : i === 0
                            ? 'h-full min-h-[11rem]'
                            : 'h-[5.25rem] sm:h-[5.5rem]',
                  )}
                />
              </button>

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void remove(photo.id)}
                  disabled={busy}
                  aria-label={ot('common.delete')}
                  /* ★ ขึ้นตลอดบนจอสัมผัส ★★ ปุ่มที่โผล่ตอนชี้อย่างเดียว
                       แปลว่าบนมือถือลบรูปไม่ได้เลย */
                  className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity hover:bg-black/75"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || room <= 0}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] transition-colors',
              room <= 0
                ? 'cursor-not-allowed bg-surface text-ink-faint'
                : 'bg-surface text-ink hover:bg-surface-hover',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6a1 1 0 0 1 1-1h3l1.5-2h5L16 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </svg>
            <Untranslated>
              {busy ? ot('common.loading') : ot('food.photos.add', { n: Math.max(0, room) })}
            </Untranslated>
          </button>
          <span className="text-[11px] text-ink-faint">
            <Untranslated>{ot('food.photos.hint')}</Untranslated>
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {lightbox !== null && photos[lightbox] ? (
        <Lightbox
          photos={photos}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * ดูรูปเต็มจอ
 *
 * ★ เลื่อนซ้าย/ขวาได้ด้วยปุ่มและคีย์บอร์ด ★★ รูปอาหารเป็นของที่คนดูต่อเนื่อง
 *   การต้องปิดแล้วเปิดใหม่ทีละใบคือการทำให้แกลเลอรีไม่เป็นแกลเลอรี
 */
function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: ShopPhoto[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const ot = useOt()
  const go = (d: number) => onIndex((index + d + photos.length) % photos.length)

  return createPortal(
    <div
      className="fixed inset-0 z-70 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={ot('food.photos.open')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
        if (e.key === 'Escape') onClose()
      }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[index]!.url}
        alt=""
        className="max-h-[85dvh] max-w-full rounded-2xl object-contain"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label={ot('common.close')}
        className="absolute end-4 top-4 grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      {photos.length > 1 ? (
        <>
          <Nav dir="prev" onClick={() => go(-1)} label={ot('wallet.owed.pagePrev')} />
          <Nav dir="next" onClick={() => go(1)} label={ot('wallet.owed.pageNext')} />
          <p className="absolute bottom-5 rounded-full bg-white/15 px-3 py-1 text-xs tabular-nums text-white backdrop-blur">
            {index + 1} / {photos.length}
          </p>
        </>
      ) : null}
    </div>,
    document.body,
  )
}

function Nav({ dir, onClick, label }: { dir: 'prev' | 'next'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full',
        'bg-white/15 text-white backdrop-blur hover:bg-white/25',
        dir === 'prev' ? 'start-4' : 'end-4',
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
}
