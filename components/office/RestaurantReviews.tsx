'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { apiFetch } from '@/lib/api/client'
import { useConfirm } from '@/components/ConfirmProvider'
import { Button } from '@/components/ui/Button'
import { Stars, StarInput } from './Stars'
import { cn } from '@/lib/cn'
import { shrinkImage } from '@/lib/image/shrink'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { PhotoLightbox } from '@/components/ui/PhotoLightbox'
/* ★ สูตรเดียวกับที่เฟสระยะทางใช้ จึงอยู่ที่ lib/office/geo.ts ตั้งแต่แรก */
import { haversineMeters } from '@/lib/office/geo'

/** ด้านยาวสุดของรูปรีวิวหลังย่อ — ตามข้อกำหนด */
const MAX_SIDE = 1600
/** แนบได้สูงสุดกี่ใบ — ตามข้อกำหนด */
const MAX_PHOTOS = 10
/** ใกล้ร้านแค่ไหนถึงนับว่า "รีวิวที่ร้าน" (เมตร) — ตามข้อกำหนด */
const AT_SHOP_METERS = 200

export type Review = {
  id: string
  rating: number
  body: string | null
  atShop: boolean
  createdAt: string
  authorId: string
  authorName: string | null
  authorAvatar: string | null
  photos: string[]
  canManage: boolean
}

export function RestaurantReviews({
  shopId,
  shopName,
  shopLat,
  shopLng,
  /**
   * คะแนนที่กดมาจากข้างนอก (แถวดาวบนหัวหน้ารายละเอียด)
   *
   * ★★★ กดดาวแล้วต้องได้เขียนรีวิวต่อทันที ไม่ใช่กดแล้วไม่มีอะไรเกิดขึ้น
   *     ★ แถวดาวที่กดไม่ได้ อ่านเป็นปุ่มที่เสีย
   *       ★★ และ "ให้ดาว" คือสิ่งที่คนอยากทำมากที่สุดเมื่อเปิดหน้านี้มา
   */
  seedRating,
  onSeedUsed,
}: {
  shopId: string
  /** ชื่อร้าน — ขึ้นในกล่องยืนยัน */
  shopName?: string | null
  /** พิกัดร้าน — ไม่มีก็รีวิวได้ แค่ติดป้าย "รีวิวที่ร้าน" ให้ไม่ได้ */
  shopLat?: number | null
  shopLng?: number | null
  seedRating?: number | null
  onSeedUsed?: () => void
}) {
  const ot = useOt()
  const confirm = useConfirm()
  const [items, setItems] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<Review | null>(null)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  /* ★ กดดาวจากข้างนอก → กางกล่องเขียนรีวิวให้เลย พร้อมคะแนนที่กด */
  useEffect(() => {
    if (seedRating && seedRating > 0) setComposing(true)
  }, [seedRating])

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: Review[] }>(
        `/api/office/food/reviews?shop=${encodeURIComponent(shopId)}`,
      )
      setItems(res.items)
      setError(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    if (!(await confirm({ kind: 'delete', subject: shopName, message: ot('food.review.deleteAsk') }))) return
    try {
      await apiFetch(`/api/office/food/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">
          <Untranslated>{ot('food.review.heading', { n: items.length })}</Untranslated>
        </h2>
        {!composing && !editing ? (
          <Button variant="primary" onClick={() => setComposing(true)}>
            <Untranslated>{ot('food.review.write')}</Untranslated>
          </Button>
        ) : null}
      </div>

      {composing || editing ? (
        <ReviewComposer
          shopId={shopId}
          shopName={shopName}
          shopLat={shopLat}
          shopLng={shopLng}
          existing={editing}
          seedRating={editing ? null : seedRating}
          onCancel={() => {
            setComposing(false)
            setEditing(null)
            onSeedUsed?.()
          }}
          onDone={() => {
            setComposing(false)
            setEditing(null)
            onSeedUsed?.()
            void load()
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-ink-faint">
          <Untranslated>{ot('common.loading')}</Untranslated>
        </p>
      ) : items.length === 0 && !composing ? (
        <p className="py-8 text-center text-sm text-ink-faint">
          <Untranslated>{ot('food.review.empty')}</Untranslated>
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
              <div className="flex items-start gap-3">
                {r.authorAvatar ? (
                  <Image
                    src={r.authorAvatar}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 shrink-0 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-xs text-ink-soft"
                  >
                    {(r.authorName ?? '?').slice(0, 1)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span dir="auto" className="text-sm font-medium text-ink">
                      {r.authorName ?? ''}
                    </span>
                    <Stars value={r.rating} />
                    {r.atShop ? (
                      <span className="rounded-full bg-link/15 px-2 py-0.5 text-[11px] text-link">
                        <Untranslated>{ot('food.review.atShop')}</Untranslated>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {r.canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setComposing(false)
                        setEditing(r)
                      }}
                      className="grid h-11 place-items-center rounded-full px-3 text-[13px] text-ink-soft hover:bg-surface hover:text-ink"
                    >
                      <Untranslated>{ot('common.edit')}</Untranslated>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      className="grid h-11 place-items-center rounded-full px-3 text-[13px] text-danger hover:bg-surface"
                    >
                      <Untranslated>{ot('common.delete')}</Untranslated>
                    </button>
                  </div>
                ) : null}
              </div>

              {r.body ? (
                <p dir="auto" className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {r.body}
                </p>
              ) : null}

              {r.photos.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {r.photos.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setLightbox({ photos: r.photos, index: i })}
                      className="relative aspect-square overflow-hidden rounded-xl border border-line"
                    >
                      <Image src={url} alt="" fill sizes="120px" className="object-cover" unoptimized />
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {lightbox ? (
        <PhotoLightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onIndex={(i) => setLightbox((p) => (p ? { ...p, index: i } : p))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * ดาว
 * ═══════════════════════════════════════════════════════════════════ */

/*
 * ★ Stars ของไฟล์นี้ถูกถอดทิ้ง — ย้ายไปใช้ของกลางใน components/office/Stars.tsx
 *   ★★ ของเดิมเป็นตัวอักษร "★" ซึ่งหน้าตาขึ้นกับฟอนต์ของเครื่อง และใช้
 *      สี warn ร่วมกับคำเตือน — วันที่ใครเปลี่ยนสีคำเตือน ดาวจะเปลี่ยนตาม
 *      ไปด้วยโดยไม่มีใครตั้งใจ
 */

/* ═══════════════════════════════════════════════════════════════════
 * กล่องเขียนรีวิว
 * ═══════════════════════════════════════════════════════════════════ */

type Pending = {
  /** ตัวระบุชั่วคราวฝั่งหน้าเว็บ — ใช้เป็น key และใช้ลบก่อนอัปโหลดเสร็จ */
  key: string
  previewUrl: string
  /** path ใน storage — null = ยังอัปโหลดไม่เสร็จ */
  path: string | null
  failed: boolean
}

function ReviewComposer({
  shopId,
  shopName,
  shopLat,
  shopLng,
  existing,
  seedRating,
  onCancel,
  onDone,
}: {
  shopId: string
  shopName?: string | null
  shopLat?: number | null
  shopLng?: number | null
  existing: Review | null
  seedRating?: number | null
  onCancel: () => void
  onDone: () => void
}) {
  const ot = useOt()
  const confirm = useConfirm()
  const [rating, setRating] = useState(existing?.rating ?? seedRating ?? 0)
  const [body, setBody] = useState(existing?.body ?? '')
  const [photos, setPhotos] = useState<Pending[]>(
    (existing?.photos ?? []).map((url) => ({
      key: url,
      previewUrl: url,
      /*
       * ★★ รูปเดิมตอนแก้ไข: ถอด path กลับจาก url สาธารณะ
       *    ★ RPC รับ path ไม่ใช่ url และมันแทนที่รูปทั้งชุดทุกครั้ง
       *      ถ้าส่ง url กลับไป รูปเดิมจะถูกบันทึกเป็น path ที่ผิดทั้งหมด
       */
      path: pathFromPublicUrl(url),
      failed: false,
    })),
  )
  const [atShop, setAtShop] = useState(existing?.atShop ?? false)
  const [locating, setLocating] = useState(false)
  const [locNote, setLocNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return

    const room = MAX_PHOTOS - photos.length
    const files = [...list].slice(0, Math.max(0, room))
    /* ★ เลือกเกินโควตา = แจ้งแล้วรับเท่าที่รับได้ ไม่ใช่ปฏิเสธทั้งชุด */
    if (list.length > room) setError(ot('food.review.tooManyPhotos', { n: MAX_PHOTOS }))
    else setError(null)

    const added: Pending[] = files.map((f) => ({
      key: `${f.name}-${f.size}-${crypto.randomUUID()}`,
      previewUrl: URL.createObjectURL(f),
      path: null,
      failed: false,
    }))
    setPhotos((p) => [...p, ...added])

    /* ★ อัปโหลดทีละใบแล้วอัปเดตสถานะต่อใบ — คนเห็นว่าค้างที่ใบไหน */
    await Promise.all(
      files.map(async (file, i) => {
        /* ★ added สร้างจาก files ตัวต่อตัว ดัชนีจึงตรงกันเสมอ
             แต่ตัวตรวจชนิดไม่รู้ จึงข้ามใบที่หาคีย์ไม่เจอแทนที่จะยืนยันด้วย ! */
        const key = added[i]?.key
        if (!key) return
        try {
          const small = await shrinkImage(file, MAX_SIDE)
          const form = new FormData()
          form.append('file', small)
          const res = await apiFetch<{ path: string }>('/api/office/food/reviews/upload', {
            method: 'POST',
            body: form,
          })
          setPhotos((p) => p.map((x) => (x.key === key ? { ...x, path: res.path } : x)))
        } catch {
          setPhotos((p) => p.map((x) => (x.key === key ? { ...x, failed: true } : x)))
        }
      }),
    )
  }

  function pin() {
    if (!navigator.geolocation) {
      setLocNote(ot('food.review.noGeo'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        if (shopLat == null || shopLng == null) {
          /* ★ ไม่มีพิกัดร้าน = เทียบไม่ได้ ไม่ใช่ error — รีวิวต่อได้ตามปกติ */
          setLocNote(ot('food.review.shopNoCoords'))
          return
        }
        const m = haversineMeters(pos.coords.latitude, pos.coords.longitude, shopLat, shopLng)
        const near = m <= AT_SHOP_METERS
        setAtShop(near)
        setLocNote(near ? ot('food.review.pinnedNear') : ot('food.review.pinnedFar'))
      },
      () => {
        /*
         * ★★ ไม่อนุญาตตำแหน่ง = เขียนรีวิวต่อได้ตามปกติ และข้อความต้องหายเอง
         *    ข้อกำหนดเขียนไว้ตรง ๆ ว่า "ห้ามแสดง error ค้าง"
         */
        setLocating(false)
        setLocNote(ot('food.review.geoDenied'))
      },
      { timeout: 8000, maximumAge: 60_000 },
    )
  }

  async function save() {
    if (rating < 1) {
      setError(ot('food.review.needStars'))
      return
    }
    /* ★ ยังอัปโหลดไม่เสร็จ = รอก่อน ไม่ใช่บันทึกแล้วรูปหาย */
    if (photos.some((p) => !p.path && !p.failed)) {
      setError(ot('food.review.stillUploading'))
      return
    }
    /* ★ รีวิวใหม่ = เพิ่ม · มีรีวิวเดิม = แก้ไข */
    if (!(await confirm({ kind: existing ? 'edit' : 'create', subject: shopName }))) return

    setSaving(true)
    try {
      await apiFetch('/api/office/food/reviews', {
        method: 'POST',
        body: {
          shop: shopId,
          reviewId: existing?.id ?? null,
          rating,
          body: body.trim() || null,
          atShop,
          photos: photos.filter((p) => p.path).map((p) => p.path as string),
        },
      })
      onDone()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      {/* ── ดาว ─────────────────────────────────────────────────── */}
      {/* ★ ของกลางชุดเดียวกับหน้ารายการร้านและหัวหน้ารายละเอียด
             ★★ ของเดิมเป็นตัวอักษร "★" ขนาด text-2xl ซึ่งใหญ่กว่าดาวที่อื่น
                ในหน้าเดียวกัน และหน้าตาต่างกันตามฟอนต์ของเครื่อง */}
      <StarInput
        value={rating}
        onChange={setRating}
        label={(n) => ot('food.review.starsN', { n })}
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        dir="auto"
        rows={3}
        maxLength={2000}
        placeholder={ot('food.review.placeholder')}
        className="mt-3 w-full resize-y rounded-xl border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
      />

      {/* ── รูป ─────────────────────────────────────────────────── */}
      {photos.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {photos.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl border border-line">
              <Image src={p.previewUrl} alt="" fill sizes="100px" className="object-cover" unoptimized />

              {/* ★ สถานะอัปโหลดทับบนรูป — ไม่ใช่แถบรวมที่ไม่บอกว่าใบไหน */}
              {!p.path && !p.failed ? (
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-[11px] text-white">
                  <Untranslated>{ot('food.review.uploading')}</Untranslated>
                </span>
              ) : null}
              {p.failed ? (
                <span className="absolute inset-0 grid place-items-center bg-danger/70 text-[11px] text-white">
                  <Untranslated>{ot('common.error')}</Untranslated>
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}
                aria-label={ot('common.delete')}
                className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photos.length >= MAX_PHOTOS}
          className="h-11 rounded-full bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          <Untranslated>{ot('food.review.addPhotos', { n: photos.length, max: MAX_PHOTOS })}</Untranslated>
        </button>

        <button
          type="button"
          onClick={pin}
          disabled={locating}
          className={cn(
            'h-11 rounded-full px-4 text-sm transition-colors disabled:opacity-60',
            atShop ? 'bg-link/15 text-link' : 'bg-surface text-ink hover:bg-surface-hover',
          )}
        >
          <Untranslated>{locating ? ot('food.review.locating') : ot('food.review.pin')}</Untranslated>
        </button>
      </div>

      {locNote ? <p className="mt-2 text-xs text-ink-faint">{locNote}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          <Untranslated>{existing ? ot('common.save') : ot('food.review.post')}</Untranslated>
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <Untranslated>{ot('common.cancel')}</Untranslated>
        </Button>
      </div>
    </div>
  )
}

/**
 * ถอด path ใน bucket กลับจาก public URL
 *
 * ★ public URL ของ Supabase มีรูป …/storage/v1/object/public/<bucket>/<path>
 *   ★★ ตัดด้วยชื่อ bucket ไม่ใช่นับจำนวน segment — path มี "/" ข้างในได้
 *      (ของเราคือ "<userId>/<uuid>.jpg") การนับ segment จะได้แค่ท่อนแรก
 */
function pathFromPublicUrl(url: string): string | null {
  const marker = '/public/reviews/'
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}
