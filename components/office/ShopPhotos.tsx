'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useConfirm } from '@/components/ConfirmProvider'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { PhotoLightbox } from '@/components/ui/PhotoLightbox'
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
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const room = MAX_PHOTOS - photos.length

  async function upload(files: FileList) {
    /* ★ คัดลอกรายชื่อไฟล์ก่อนรอกล่องยืนยัน — ช่อง input ถูกล้างค่าไปแล้ว */
    const picked = [...files]
    if (!(await confirm({ kind: 'create', subject: ot('food.photos.title') }))) return
    setBusy(true)
    setError(null)
    try {
      /* ★ slice ตามที่เหลือจริง — เลือกมา 10 ใบตอนมีอยู่แล้ว 7 ใบ ต้องขึ้นแค่ 3 */
      for (const file of picked.slice(0, Math.max(0, room))) {
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
    if (!(await confirm({ kind: 'delete' }))) return
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
        <PhotoLightbox
          photos={photos.map((ph) => ph.url)}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  )
}
