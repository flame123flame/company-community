'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { OpenHours } from '@/lib/office/geo'
import { OpenHoursField } from './OpenHoursField'
import { apiFetch } from '@/lib/api/client'
import { useConfirm } from '@/components/ConfirmProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { CUISINES, DISTANCE_OPTIONS, KARAOKE, PRICE_OPTIONS, distanceLabel, isCuisine, type Cuisine, type KaraokePricing } from '@/lib/office/food'
import { cuisineStyle } from '@/lib/office/cuisine'
import { KaraokeFields, emptyKaraoke, karaokeFromDraft, type KaraokeDraft } from './KaraokeFields'
import { shrinkImage } from '@/lib/image/shrink'
import { ShopPhotos, type ShopPhoto } from './ShopPhotos'
import { DishPhotoSlot, type DishPhoto } from './DishPhotoSlot'
import type { DistanceBand, PriceRange } from '@/types/database'

type Similar = { id: string; name: string; signatureDish: string; similarity: number }

/** ร้านที่กำลังแก้ไข — ส่งมาเมื่อเป็นโหมดแก้ไข */
export type EditingShop = {
  id: string
  name: string
  signatureDish: string
  cuisine: string | null
  priceRange: string | null
  distance: string | null
  mapUrl: string | null
  note: string | null
  lat?: number | null
  lng?: number | null
  openHours?: OpenHours | null
  photos?: ShopPhoto[]
  dishes?: { name: string; price: number | null; photo?: string | null; photoUrl?: string | null }[]
  karaoke?: KaraokePricing | null
}

/** ★ photo = รูปที่อัปแล้ว (0060) — path ส่งไปกับเมนูตอนบันทึก · url ไว้โชว์ภาพย่อ */
type DishRow = { key: string; name: string; price: string; photo: DishPhoto | null }

/** เพดานเดียวกับที่ add_restaurant_photos บังคับในฐานข้อมูล */
const MAX_PHOTOS = 10

/**
 * ฟอร์มเพิ่ม/แก้ไขร้าน (FR-A01 + FR-A02 + FR-A06)
 *
 * ★★★ ฟอร์มเดียวสองโหมด ไม่ใช่สองไฟล์
 *
 *     ★ ช่องทุกช่องเหมือนกันเป๊ะ ต่างแค่ค่าเริ่มต้นกับ method ที่ยิง
 *       ★★ แยกเป็นสองไฟล์คือการเปิดช่องให้ "ฟอร์มเพิ่ม" กับ "ฟอร์มแก้ไข"
 *          ค่อย ๆ ต่างกันทีละช่อง จนวันหนึ่งแก้ไขแล้วบางค่าหายไปเฉย ๆ
 *
 * ★★★ โหมดแก้ไขเป็นทางเดียวที่ปักหมุดร้านเก่าได้
 *
 *     ★ set_restaurant_latlng มีมาตั้งแต่ 0050 แต่ถูกเรียกที่เดียวคือตอนสร้าง
 *       ★★ ร้านที่สร้างก่อนมีแผนที่ หรือปักผิด จึงไม่มีระยะทางตลอดกาล
 */
/*
 * ★★★ ssr: false จำเป็นจริง ๆ ไม่ใช่กันไว้ก่อน
 *
 *     MapPicker โหลด leaflet ด้วย dynamic import ข้างใน effect อยู่แล้ว
 *     ★ แต่ 'leaflet/dist/leaflet.css' ถูก import ที่ระดับบนสุดของโมดูล
 *       ซึ่ง Next ต้องประมวลผลตอน build ★★ การกันทั้งโมดูลออกจาก SSR
 *       ทำให้ไม่ต้องเดาว่าส่วนไหนปลอดภัย
 */
const MapPicker = dynamic(() => import('./MapPicker').then((m) => m.MapPicker), {
  ssr: false,
})

export function AddRestaurantForm({
  onDone,
  editing,
}: {
  onDone: () => void
  editing?: EditingShop
}) {
  const ot = useOt()
  const confirm = useConfirm()
  const [name, setName] = useState(editing?.name ?? '')
  /*
   * ★★★ เมนูเด็ดเป็นหลายรายการ ไม่ใช่ช่องเดียว
   *
   *     ★ ร้านหนึ่งร้านมีของเด็ดมากกว่าหนึ่งอย่างเป็นเรื่องปกติ ★★ ของเดิม
   *       บังคับให้เลือกมาอย่างเดียว คนจึงพิมพ์รวมกันในช่องเดียว
   *       ("ข้าวมันไก่ + ต้มเลือดหมู") ซึ่งค้นหาแยกไม่ได้และใส่ราคาไม่ได้
   *     ★ ราคาไม่บังคับ — คนที่ไม่รู้ราคาก็ยังเพิ่มร้านได้
   */
  const [dishes, setDishes] = useState<DishRow[]>(() => {
    const from = editing?.dishes ?? []
    if (from.length > 0) {
      return from.map((d, i) => ({
        key: `d${i}`,
        name: d.name,
        price: d.price == null ? '' : String(d.price),
        photo: d.photo && d.photoUrl ? { path: d.photo, url: d.photoUrl } : null,
      }))
    }
    /* ★ ร้านเก่าที่ยังไม่มีรายการเมนู → ใช้ signature_dish เป็นแถวแรก */
    return [{ key: 'd0', name: editing?.signatureDish ?? '', price: '', photo: null }]
  })
  /* ── 0061 ── ประเภทจากรายการตายตัว — ค่าเก่าที่ไม่อยู่ในรายการถือว่า "ไม่ระบุ" */
  const [cuisine, setCuisine] = useState<Cuisine | null>(isCuisine(editing?.cuisine) ? editing.cuisine : null)
  const [karaoke, setKaraoke] = useState<KaraokeDraft>(() => {
    const k = editing?.karaoke
    if (!k) return emptyKaraoke()
    let n = 0
    return {
      hostessPerHour: k.hostessPerHour == null ? '' : String(k.hostessPerHour),
      packages: k.packages.map((p) => ({ key: `p${n++}`, name: p.name, price: String(p.price), hostesses: String(p.hostesses) })),
      rooms: k.rooms.map((r) => ({
        key: `r${n++}`,
        name: r.name,
        perHour: r.perHour == null ? '' : String(r.perHour),
        night: r.night == null ? '' : String(r.night),
      })),
      note: k.note ?? '',
    }
  })
  const isKaraoke = cuisine === KARAOKE
  const [price, setPrice] = useState<PriceRange | null>(
    (editing?.priceRange as PriceRange | null) ?? null,
  )
  const [distance, setDistance] = useState<DistanceBand | null>(
    (editing?.distance as DistanceBand | null) ?? null,
  )
  const [mapUrl, setMapUrl] = useState(editing?.mapUrl ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  /* ★ พิกัดไม่บังคับ — เพิ่มร้านตอนหิวไม่ควรต้องเปิดแผนที่ก่อน */
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    editing?.lat != null && editing?.lng != null ? { lat: editing.lat, lng: editing.lng } : null,
  )
  /* ★ ร้านที่ปักหมุดแล้วกางแผนที่ให้เลย — คนกดแก้ไขเพราะอยากเห็นว่าหมุดอยู่ไหน */
  const [mapOpen, setMapOpen] = useState(editing?.lat != null)
  const [hours, setHours] = useState<OpenHours | null>(editing?.openHours ?? null)

  /*
   * ★★ พิกัดออฟฟิศเป็นจุดเริ่มต้นของแผนที่เมื่อร้านยังไม่มีหมุด
   *    ★ MapPicker รองรับมาตั้งแต่แรก แต่ไม่เคยมีใครส่งค่าให้
   *      ★★ แผนที่จึงเปิดมาที่กลางกรุงเทพทุกครั้ง แล้วคนต้องซูมหาออฟฟิศเอง
   *         ก่อนจะเริ่มหาร้าน
   */
  const [office, setOffice] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    void apiFetch<{ office: { lat: number; lng: number } | null }>(
      '/api/office/food/office-location',
    )
      .then((r) => setOffice(r.office))
      .catch(() => {
        /* ★ ไม่มีพิกัดออฟฟิศไม่ใช่เรื่องที่ต้องบอก — แผนที่ยังใช้ได้ */
      })
  }, [])
  const [similar, setSimilar] = useState<Similar[]>([])

  /*
   * ★★★ ตอน "เพิ่มร้าน" ยังไม่มี id ให้ผูกรูป — พักไฟล์ไว้ก่อน
   *
   *     ★ ShopPhotos ต้องมี shopId ถึงจะอัปโหลดได้ แต่ร้านยังไม่ถูกสร้าง
   *       ★★ ทางเลือกคือสร้างร้านเปล่าก่อนแล้วค่อยให้ใส่รูป ซึ่งจะทิ้งร้าน
   *          ว่างเปล่าไว้ทุกครั้งที่คนกรอกไปครึ่งทางแล้วปิดหน้า
   *     ★ จึงเก็บเป็น File ไว้ในหน่วยความจำ แล้วอัปหลังสร้างร้านสำเร็จ
   *       ★★ ตอน "แก้ไข" มี id อยู่แล้ว จึงใช้ ShopPhotos ตรง ๆ ได้เลย
   */
  const [staged, setStaged] = useState<{ file: File; url: string }[]>([])
  const photoRef = useRef<HTMLInputElement>(null)

  /* ★ คืน object URL ตอนถอดคอมโพเนนต์ — ไม่คืนแปลว่ารูปค้างในหน่วยความจำ
       ไปจนกว่าจะรีเฟรชหน้า */
  useEffect(
    () => () => {
      for (const s of staged) URL.revokeObjectURL(s.url)
    },
    [staged],
  )
  const [busy, setBusy] = useState(false)
  /* ★ รูปเมนูที่กำลังอัปอยู่ — กดบันทึกระหว่างนี้ รูปที่ยังอัปไม่เสร็จจะหายไปเงียบ ๆ */
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  /**
   * ★★ ตรวจชื่อคล้ายแบบหน่วงเวลา (FR-A02)
   *
   *    ยิงทุกตัวอักษรที่พิมพ์ = 20 คำขอสำหรับชื่อร้านหนึ่งชื่อ
   *    ★ หน่วง 500ms แล้วยกเลิกคำขอเก่าทุกครั้ง — เหลือคำขอเดียวต่อการ
   *      "หยุดพิมพ์" หนึ่งครั้ง ซึ่งเป็นจังหวะที่ผู้ใช้อยากเห็นคำเตือนพอดี
   */
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setSimilar([])
      return
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const data = await apiFetch<{ items: Similar[] }>(
          `/api/office/food/similar?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        )
        /* ★ ตอนแก้ไข ต้องไม่เตือนว่า "ซ้ำกับตัวเอง" */
        setSimilar(data.items.filter((x) => x.id !== editing?.id))
      } catch {
        /* ★ คำเตือนเป็นของเสริม — ยิงไม่ผ่านก็ยังเพิ่มร้านได้ตามปกติ */
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [name, editing?.id])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    /* ★ ฟอร์มเดียวใช้ทั้งเพิ่มและแก้ — ชนิดกล่องตามโหมด */
    if (!(await confirm({ kind: editing ? 'edit' : 'create', subject: name.trim() || null }))) return

    setBusy(true)
    setError(null)
    try {
      /* ★ รายการที่มีชื่อจริงเท่านั้น — แถวว่างที่คนกดเพิ่มแล้วไม่กรอก ต้องไม่ถูกบันทึก */
      const cleanDishes = dishes
        .map((d) => ({ name: d.name.trim(), price: d.price.trim(), photo: d.photo?.path ?? null }))
        .filter((d) => d.name.length > 0)
        .map((d) => ({ name: d.name, price: d.price === '' ? null : Number(d.price), photo: d.photo }))

      const karaokePayload = isKaraoke ? karaokeFromDraft(karaoke) : null
      const body = {
        name,
        /* ★★ signatureDish ยังส่งอยู่ — คอลัมน์นั้นเป็น not null และมีโค้ดเก่าอ่าน
             ★ ให้เป็นเมนูรายการแรกเสมอ ซึ่งตรงกับที่ RPC ซิงก์ให้ฝั่งฐานข้อมูล */
        /* ★ ร้านคาราโอเกะไม่บังคับเมนู — ใช้ชื่อแพ็กเกจแรก (หรือคำว่าคาราโอเกะ) แทน
             เพราะคอลัมน์ signature_dish ยังเป็น not null */
        signatureDish:
          cleanDishes[0]?.name ?? (isKaraoke ? (karaokePayload?.packages[0]?.name ?? KARAOKE) : ''),
        dishes: cleanDishes,
        cuisine,
        karaoke: karaokePayload,
        priceRange: price,
        distance,
        mapUrl: mapUrl.trim() || null,
        note: note.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        openHours: hours,
      }

      if (editing) {
        await apiFetch(`/api/office/food/restaurants/${editing.id}`, { method: 'PATCH', body })
      } else {
        const created = await apiFetch<{ id: string }>('/api/office/food/restaurants', {
          method: 'POST',
          body,
        })

        /*
         * ★★ อัปรูปหลังร้านถูกสร้างแล้ว และล้มแล้วไม่ย้อนการสร้างร้าน
         *    ★ ร้านถูกบันทึกไปแล้วจริง ๆ การโยน error ตรงนี้จะทำให้หน้าจอ
         *      บอกว่า "บันทึกไม่สำเร็จ" ทั้งที่ร้านขึ้นในรายการแล้ว
         *      ★★ แล้วคนจะกดบันทึกซ้ำ ได้ร้านซ้ำสองร้าน
         *    ★ รูปที่อัปไม่ขึ้นยังเพิ่มทีหลังจากหน้ารายละเอียดได้
         */
        for (const item of staged) {
          try {
            const small = await shrinkImage(item.file, 1600)
            const form = new FormData()
            form.append('file', small)
            await fetch(`/api/office/food/restaurants/${created.id}/photos`, {
              method: 'POST',
              body: form,
            })
          } catch {
            /* ★ เงียบไว้ — ร้านถูกสร้างแล้ว รูปเพิ่มทีหลังได้ */
          }
        }
      }
      onDone()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  return (
    /*
     * ★★★ สองคอลัมน์บนจอกว้าง: ช่องกรอกซ้าย · แผนที่กับเวลาทำการขวา
     *
     *     ★ ของเดิมเป็นคอลัมน์เดียวกว้าง 512px ในหน้าที่กว้าง 1000px
     *       แล้วแผนที่สูง 256px ไปอยู่ท้ายฟอร์ม ★★ คนที่ปักหมุดจึงมองไม่เห็น
     *       ชื่อร้านที่เพิ่งพิมพ์ ทั้งที่สองอย่างนั้นต้องตรงกัน
     *     ★★ แผนที่เป็นของที่ "ยิ่งใหญ่ยิ่งปักแม่น" — มันควรได้ความกว้างจริง
     *        ไม่ใช่ถูกบีบให้เท่าช่องพิมพ์ชื่อ
     */
    <form
      onSubmit={submit}
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Field label={ot('food.form.name')} required>
          <Input radius="round" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </Field>

        {/* ★ คำเตือนอยู่ติดใต้ช่องชื่อ ไม่ใช่บนสุดของฟอร์ม —
            คนต้องเห็นมันตอนสายตายังอยู่ที่ช่องที่เพิ่งพิมพ์ */}
        {similar.length > 0 ? (
          <div className="-mt-2 rounded-xl border border-warn/40 bg-warn/10 p-3">
            <p className="text-xs font-medium text-ink">{ot('food.form.similarWarning')}</p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {similar.map((s) => (
                <li key={s.id} className="text-xs text-ink-soft">
                  • {s.name} — {s.signatureDish}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/*
          * ── เมนูเด็ด ─────────────────────────────────────────
          * ★★ ราคาอยู่ข้างชื่อในแถวเดียวกัน ไม่ใช่แยกเป็นอีกส่วน
          *    ★ คนกรอกชื่อเมนูเสร็จแล้วนึกราคาออกทันที — แยกส่วนทำให้
          *      ต้องกลับมากรอกอีกรอบ แล้วส่วนใหญ่ก็ไม่กลับมา
          */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">
            {ot('food.form.dish')}
            {isKaraoke ? null : <span className="ms-0.5 text-accent">*</span>}
            <span className="ms-1.5 text-xs font-normal text-ink-faint">
              ({ot('food.form.priceOptional')})
            </span>
          </p>

          <div className="flex flex-col gap-2">
            {dishes.map((row, i) => (
              <div key={row.key} className="flex items-center gap-2">
                <DishPhotoSlot
                  photo={row.photo}
                  dishName={row.name}
                  onChange={(photo) =>
                    setDishes((prev) => prev.map((d) => (d.key === row.key ? { ...d, photo } : d)))
                  }
                  onBusyChange={(on) => setUploading((n) => Math.max(0, n + (on ? 1 : -1)))}
                  onError={setError}
                />
                <Input
                  radius="round"
                  value={row.name}
                  onChange={(e) =>
                    setDishes((prev) =>
                      prev.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)),
                    )
                  }
                  maxLength={120}
                  placeholder={ot('food.form.dishPlaceholder')}
                  required={i === 0 && !isKaraoke}
                  className="min-w-0 flex-1"
                />
                <div className="relative w-24 shrink-0 sm:w-28">
                  <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-sm text-ink-faint">
                    ฿
                  </span>
                  <Input
                    radius="round"
                    value={row.price}
                    onChange={(e) =>
                      setDishes((prev) =>
                        prev.map((d, j) =>
                          /* ★ รับเฉพาะตัวเลขกับจุด — คีย์บอร์ดบางตัวยังส่งอักษรมาได้ */
                          j === i ? { ...d, price: e.target.value.replace(/[^\d.]/g, '') } : d,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={ot('food.form.dishPrice')}
                    className="ps-7 text-end tabular-nums"
                  />
                </div>
                {/*
                  * ★ ปุ่มลบขึ้นเฉพาะเมื่อมีมากกว่าหนึ่งแถว
                  *   ★★ ลบแถวสุดท้ายทิ้งได้แปลว่าฟอร์มไม่มีเมนูเลย ซึ่งบันทึกไม่ผ่าน
                  *      — ปุ่มที่กดแล้วทำให้ฟอร์มใช้ไม่ได้ ไม่ควรกดได้
                  */}
                {dishes.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setDishes((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={ot('common.delete')}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-danger"
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                ) : (
                  /* ★ ที่ว่างแทนปุ่ม — ไม่งั้นแถวแรกกับแถวอื่นกว้างไม่เท่ากัน */
                  <span className="size-11 shrink-0" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          {dishes.length < 20 ? (
            <button
              type="button"
              onClick={() =>
                setDishes((prev) => [...prev, { key: `d${Date.now()}`, name: '', price: '', photo: null }])
              }
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] text-ink transition-colors hover:bg-surface-hover"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {ot('food.form.addDish')}
            </button>
          ) : null}
        </div>

        {/*
          * ── ประเภทร้าน (0061) — แตะเลือกจากรายการตายตัว ไม่ต้องพิมพ์ ──
          * ★ ไม่ห่อด้วย <label> (Field) — ปุ่มหลายปุ่มในป้ายเดียว แตะที่ว่างแล้วไปกดปุ่มแรก
          * ★ แตะซ้ำ = ยกเลิก (ไม่ระบุประเภท)
          */}
        <div>
          <p className="text-sm font-medium text-ink">
            {ot('food.form.cuisine')}
            <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('link.optional')})</span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {CUISINES.map((c) => {
              const style = cuisineStyle(c, c)
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cuisine === c}
                  onClick={() => setCuisine(cuisine === c ? null : c)}
                  className="mkt-cat flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2"
                >
                  {c === KARAOKE ? (
                    <span aria-hidden="true" className="mkt-cat-emoji text-xl leading-none">🎤</span>
                  ) : (
                    <svg viewBox="0 0 24 24" className="mkt-cat-emoji size-5" style={{ color: `rgb(${style.tint})` }} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={style.icon} />
                    </svg>
                  )}
                  <span className="text-[12px] font-medium text-ink">
                    <Untranslated>{c}</Untranslated>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {isKaraoke ? <KaraokeFields value={karaoke} onChange={setKaraoke} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">

          <Field label={ot('food.form.price')} hint={ot('link.optional')}>
            <ChipRow
              options={PRICE_OPTIONS}
              value={price}
              onChange={setPrice}
              render={(p) => p}
            />
          </Field>
        </div>

        <Field label={ot('food.form.distance')} hint={ot('link.optional')}>
          <ChipRow
            options={DISTANCE_OPTIONS}
            value={distance}
            onChange={setDistance}
            render={(v) => distanceLabel(ot, v)}
          />
        </Field>

        <Field label={ot('food.form.mapUrl')} hint={ot('link.optional')}>
          <Input radius="round"
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            placeholder="https://maps.app.goo.gl/…"
            inputMode="url"
          />
        </Field>

        <Field label={ot('food.form.note')} hint={ot('link.optional')}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            className={cn(
              'w-full rounded-[2px] bg-input px-4 py-2',
              'border border-line text-[16px] placeholder:text-ink-faint sm:text-sm',
              'transition-colors focus:border-link focus:outline-none',
            )}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={busy || uploading > 0} block>
          {editing ? ot('common.save') : ot('food.form.submit')}
        </Button>
      </div>

      {/* ══ คอลัมน์ขวา · รูป แผนที่ และเวลาทำการ ═════════════ */}
      <aside className="mt-4 flex flex-col gap-4 lg:mt-0">
        {/*
          * ── รูปร้านและรูปอาหาร ─────────────────────────────────
          *
          * ★★★ อยู่บนสุดของคอลัมน์ขวา ไม่ใช่ท้ายฟอร์ม
          *     ★ คนที่เพิ่งกินเสร็จแล้วมาเพิ่มร้าน มีรูปอยู่ในมือถืออยู่แล้ว
          *       ★★ ถ้าช่องใส่รูปอยู่ท้ายสุด เขาจะกดบันทึกไปก่อนเจอมัน
          *          แล้วรูปนั้นก็จะไม่ถูกใส่เลยตลอดไป
          *
          * ★ โหมดแก้ไขใช้ ShopPhotos ตรง ๆ เพราะมี id แล้ว — อัปแล้วขึ้นทันที
          *   ★★ โหมดเพิ่มยังไม่มี id จึงพักไฟล์ไว้แล้วอัปหลังสร้างร้านเสร็จ
          */}
        <div className="rounded-2xl border border-line bg-elevated/50 p-4 backdrop-blur-md">
          <p className="text-[14px] font-semibold text-ink">
            {ot('food.photos.title')}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">
            {ot('food.photos.hint')}
          </p>

          <div className="mt-3">
            {editing ? (
              <ShopPhotos
                shopId={editing.id}
                photos={editing.photos ?? []}
                canEdit
                compact
                onChanged={onDone}
              />
            ) : (
              <>
                {staged.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {staged.map((item, i) => (
                      <div
                        key={item.url}
                        className="relative overflow-hidden rounded-xl border border-line bg-surface"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="" className="h-20 w-full object-cover" />
                        <button
                          type="button"
                          aria-label={ot('common.delete')}
                          onClick={() => {
                            URL.revokeObjectURL(item.url)
                            setStaged((prev) => prev.filter((_, j) => j !== i))
                          }}
                          className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75"
                        >
                          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <input
                  ref={photoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = [...(e.target.files ?? [])]
                    /* ★ รับได้แค่ที่เหลือจริง — เลือก 10 ใบตอนมีแล้ว 7 ต้องขึ้นแค่ 3 */
                    setStaged((prev) => [
                      ...prev,
                      ...picked.slice(0, MAX_PHOTOS - prev.length).map((file) => ({
                        file,
                        url: URL.createObjectURL(file),
                      })),
                    ])
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={staged.length >= MAX_PHOTOS}
                  className={cn(
                    'mt-2 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] transition-colors',
                    staged.length >= MAX_PHOTOS
                      ? 'cursor-not-allowed bg-surface text-ink-faint'
                      : 'bg-surface text-ink hover:bg-surface-hover',
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 6a1 1 0 0 1 1-1h3l1.5-2h5L16 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                  </svg>
                  {ot('food.photos.add', { n: MAX_PHOTOS - staged.length })}
                </button>
              </>
            )}
          </div>
        </div>

        {/*
          * ── ตำแหน่งร้าน ───────────────────────────────────────
          * ★★ ยุบไว้ default แผนที่โหลด tile จากอินเทอร์เน็ตเมื่อถูกกางเท่านั้น
          *    ★ กางทิ้งไว้ตลอดแปลว่าทุกคนที่เพิ่มร้านต้องจ่ายค่าโหลดแผนที่
          *      ทั้งที่ส่วนใหญ่ไม่ได้ปักหมุด
          *    ★★ แต่ร้านที่ปักหมุดไว้แล้วกางให้เลย (ดูค่าเริ่มต้นของ mapOpen)
          */}
        <div className="rounded-2xl border border-line bg-elevated/50 p-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            aria-expanded={mapOpen}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-start"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">
                {ot('food.geo.section')}
              </span>
              {/* ★ หุบอยู่แล้วยังเห็นว่าปักไว้หรือยัง — ไม่ต้องกางออกมาตรวจ */}
              <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '—'}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              className={cn(
                'size-4 shrink-0 text-ink-faint transition-transform duration-200',
                mapOpen && 'rotate-180',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {mapOpen ? (
            <div className="mt-3">
              <MapPicker
                lat={coords?.lat ?? null}
                lng={coords?.lng ?? null}
                onChange={(lat, lng) => setCoords({ lat, lng })}
                fallbackLat={office?.lat}
                fallbackLng={office?.lng}
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-line bg-elevated/50 p-4 backdrop-blur-md">
          <OpenHoursField value={hours} onChange={setHours} />
        </div>
      </aside>
    </form>
  )
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  render,
}: {
  options: T[]
  value: T | null
  onChange: (v: T | null) => void
  render: (v: T) => string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          /* ★ กดซ้ำ = ยกเลิกการเลือก ไม่ต้องมีปุ่ม "ไม่ระบุ" แยกอีกปุ่ม */
          onClick={() => onChange(value === o ? null : o)}
          aria-pressed={value === o}
          className={cn(
            'h-9 rounded-full px-3.5 text-sm transition-colors',
            value === o
              ? 'bg-ink text-page'
              : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
          )}
        >
          {render(o)}
        </button>
      ))}
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ms-0.5 text-accent">*</span> : null}
        {hint ? <span className="ms-1.5 text-xs font-normal text-ink-faint">({hint})</span> : null}
      </span>
      {children}
    </label>
  )
}
