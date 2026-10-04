'use client'

import { useRef, useState } from 'react'
import { apiUpload } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { shrinkImage } from '@/lib/image/shrink'
import { Spinner } from '@/components/ui/Spinner'

export type DishPhoto = { path: string; url: string }

/**
 * ช่องรูปของเมนูหนึ่งรายการ (0060)
 *
 * ★★ อัปทันทีที่เลือก — ไม่รอกดบันทึก
 *    ★ ร้านใหม่ยังไม่มี id ตอนเลือกรูป จึงอัปแบบไม่ผูกร้าน แล้วฟอร์มส่ง path
 *      มากับรายการเมนูตอนบันทึก ★★ กดบันทึกจึงไม่ต้องรออัปรูปทีละใบ
 *
 * ★ แตะรูปที่มีอยู่ = เปลี่ยนรูป · ปุ่ม × มุมบน = เอารูปออก
 *   ช่องกว้าง 44px เท่าปุ่มลบท้ายแถว — นิ้วแตะได้ไม่พลาด
 */
export function DishPhotoSlot({
  photo,
  onChange,
  onError,
  onBusyChange,
  dishName,
}: {
  photo: DishPhoto | null
  onChange: (photo: DishPhoto | null) => void
  onError: (message: string) => void
  /** ฟอร์มใช้ล็อกปุ่มบันทึกระหว่างอัป */
  onBusyChange?: (busy: boolean) => void
  dishName: string
}) {
  const ot = useOt()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    onBusyChange?.(true)
    try {
      /* ★ ย่อก่อนส่ง ด้านยาวไม่เกิน 1600px — รูปจากกล้องมือถือ 4–8MB ส่งช้าและเกินเพดาน 5MB */
      const small = await shrinkImage(file, 1600)
      onChange(await apiUpload<DishPhoto>('/api/office/food/dish-photo', small))
    } catch (e) {
      onError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
      onBusyChange?.(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const label = dishName.trim()
    ? ot('food.form.dishPhotoFor', { name: dishName.trim() })
    : ot('food.form.dishPhoto')

  return (
    <div className="relative size-11 shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={photo ? ot('food.form.dishPhotoChange') : label}
        title={photo ? ot('food.form.dishPhotoChange') : label}
        className={cn(
          'grid size-11 place-items-center overflow-hidden rounded-xl transition-colors',
          photo
            ? 'ring-1 ring-line'
            : 'border border-dashed border-line-strong text-ink-soft hover:border-ink-soft hover:bg-surface hover:text-ink',
        )}
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Storage ที่ไม่ได้ตั้ง remotePatterns
          <img src={photo.url} alt="" className="size-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8a2 2 0 0 1 2-2h1.5l1.2-1.6A1 1 0 0 1 9.5 4h5a1 1 0 0 1 .8.4L16.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
          </svg>
        )}
      </button>

      {photo && !busy ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={ot('food.form.dishPhotoRemove')}
          /* ★ วงกลมเห็นแค่ 20px แต่พื้นที่แตะขยายออกไปรอบ ๆ ด้วย ::after */
          className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-page shadow after:absolute after:-inset-2.5 after:content-['']"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  )
}
