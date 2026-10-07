'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Toast, useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { cuisineStyle } from '@/lib/office/cuisine'
import { ShopPhotos } from './ShopPhotos'
import { PhotoLightbox } from '@/components/ui/PhotoLightbox'
import { Stars, StarInput } from './Stars'
import { distanceLabel, type KaraokePricing } from '@/lib/office/food'
import { KaraokePrices } from './KaraokeFields'
import { RestaurantReviews } from './RestaurantReviews'
import { directionsUrl, distanceParts, searchUrl } from '@/lib/office/geo'

type Restaurant = {
  id: string
  name: string
  signatureDish: string | null
  imagePath: string | null
  cuisine: string | null
  priceRange: string | null
  distance: 'WALK' | 'DRIVE' | 'DELIVERY' | null
  mapUrl: string | null
  note: string | null
  addedByName: string | null
  voteCount: number
  maybeClosed: boolean
  voted: boolean
  canManage: boolean
  /*
   * ★ พิกัดร้าน — ใช้ตัดสินป้าย "รีวิวที่ร้าน" และระยะทางจากออฟฟิศ
   *   ★★ optional เพราะร้านเก่าทั้งหมดยังไม่มีพิกัด และต้องแสดงผลได้ปกติ
   *      (ข้อกำหนด: ร้านที่ยังไม่มีพิกัดให้ซ่อนส่วนนี้ ห้ามแสดง error)
   */
  lat?: number | null
  lng?: number | null
  travelMeters?: number | null
  /* ── 0056 ── รูปของร้าน */
  photos?: { id: string; url: string }[]
  /* ── 0049 ── ดาวเฉลี่ยและจำนวนรีวิว */
  rating?: number | null
  ratingCount?: number
  /* ── 0057 ── เมนูเด็ดหลายรายการ */
  dishes?: { name: string; price: number | null; photo?: string | null; photoUrl?: string | null }[]
  /** ── 0061 ── ราคาคาราโอเกะ */
  karaoke?: KaraokePricing | null
  travelMinutes?: number | null
  travelMode?: 'walking' | 'driving' | null
}

/**
 * หน้ารายละเอียดร้านเด็ด
 *
 * ★★★ มีขึ้นเพราะเฟส 5 ต้องการที่อยู่ให้สองอย่าง
 *
 *     ★ ปุ่ม "สร้างบิลร้านนี้" และ "คนในออฟฟิศกินร้านนี้ X ครั้งในเดือนนี้"
 *       ★★ สองอย่างนี้ยัดลงการ์ดในหน้ารวมไม่ได้ — การ์ดมีปุ่มอยู่สี่ปุ่มแล้ว
 *          และตัวเลขสถิติจะกลายเป็นตัวหนังสือเล็ก ๆ ที่ไม่มีใครอ่าน
 *     ★ และหน้าสรุปค่าข้าว (เฟส 4) ลิงก์มาที่ร้านรายตัวอยู่แล้ว
 *       ★★ เดิมลิงก์ไปหน้ารวมที่กรองไว้ ซึ่งเป็นของชั่วคราว
 *
 * ★★ สถิติ "กินกี่ครั้ง" นับจากบิลจริง ไม่ใช่จากปุ่ม "เคยไปมาแล้ว"
 *    ★ ปุ่มนั้นคนกดน้อยมาก ส่วนบิลถูกสร้างทุกครั้งที่มีการจ่ายเงินจริง
 */
export function FoodDetail({ id }: { id: string }) {
  const ot = useOt()
  const { toast, showToast } = useToast()
  const [data, setData] = useState<{
    restaurant: Restaurant
    visitsThisMonth: number
    myVisitsThisMonth: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  /* ★ รูปเมนูที่เปิดดูเต็มจออยู่ (ลำดับในรายการรูปเมนู) */
  const [dishView, setDishView] = useState<number | null>(null)
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* ★ ดาวที่กดจากแถวบนหัว — ส่งต่อให้กล่องเขียนรีวิวกางพร้อมคะแนนนั้น */
  const [seedRating, setSeedRating] = useState<number | null>(null)
  /*
   * ★ พิกัดออฟฟิศ — ต้องมีถึงจะสร้างลิงก์เส้นทางได้
   *   ★★ ดึงแยกจากข้อมูลร้าน และล้มแล้วเป็น null เงียบ ๆ
   *      ปุ่มจะถอยไปเป็น "เปิดแผนที่" แบบเดิมเอง ไม่ใช่หน้าพัง
   */
  const [office, setOffice] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    let alive = true
    void apiFetch<{ office: { lat: number; lng: number } | null }>(
      '/api/office/food/office-location',
    )
      .then((res) => {
        if (alive) setOffice(res.office)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async () => {
    try {
      setData(
        await apiFetch<{
          restaurant: Restaurant
          visitsThisMonth: number
          myVisitsThisMonth: number
        }>(`/api/office/food/restaurants/${id}`),
      )
      setGone(false)
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'ROOM_NOT_FOUND') setGone(true)
      else setError(officeErrorText(e, ot))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function vote() {
    setBusy(true)
    try {
      await apiFetch(`/api/office/food/restaurants/${id}`, {
        method: 'POST',
        body: { action: 'vote' },
      })
      await load()
      showToast(ot('food.votedThanks'))
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
  }

  if (gone || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-soft">
          <Untranslated>{ot('food.gone')}</Untranslated>
        </p>
        <Link
          href="/office/food/picks"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm text-ink hover:bg-surface-hover"
        >
          <Untranslated>{ot('food.backToPicks')}</Untranslated>
        </Link>
      </div>
    )
  }

  const r = data.restaurant
  /* ★ ไอคอน/สีประจำประเภท และระยะทาง — ชุดเดียวกับหน้ารายการร้าน */
  const style = cuisineStyle(r.name, r.cuisine)
  const dist = distanceParts(r.travelMeters)
  /* ★ รูปเมนูทั้งหมดของร้าน — lightbox เลื่อนไปรูปเมนูถัดไปได้ */
  const dishPhotos = (r.dishes ?? []).filter((d) => d.photoUrl).map((d) => d.photoUrl!)

  return (
    /*
     * ★★ กว้างเต็มคอลัมน์ของหน้า ไม่ใช่ max-w-2xl ลอยซ้าย
     *    ★ ชุดเดียวกับหน้ายอดค้างและหน้าสร้างบิลที่เพิ่งรื้อไป
     */
    <div className="w-full pb-10">
      <Link
        href="/office/food/picks"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
        <Untranslated>{ot('food.backToPicks')}</Untranslated>
      </Link>

      <div className="mt-3 rounded-3xl border border-line bg-elevated/50 p-5 backdrop-blur-md">
        {r.maybeClosed ? (
          <p className="mb-3 rounded-xl bg-warn/15 px-3 py-2 text-xs text-warn">
            {ot('food.picks.maybeClosed')}
          </p>
        ) : null}

        {/*
          * ── แกลเลอรีรูปร้าน ───────────────────────────────────
          * ★★ อยู่บนสุดของการ์ด ★ คนเปิดหน้ารายละเอียดของร้านอาหาร
          *    มาดูรูปก่อนอ่านอะไรทั้งนั้น
          */}
        <ShopPhotos
          shopId={r.id}
          photos={r.photos ?? []}
          canEdit={r.canManage}
          onChanged={() => void load()}
        />

        <h2 dir="auto" className="mt-4 flex items-start gap-2.5 text-[26px] font-bold leading-tight text-ink">
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl"
            style={{
              background: `linear-gradient(145deg, rgb(${style.tint} / 0.22), rgb(${style.tint} / 0.08))`,
              color: `rgb(${style.tint})`,
            }}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={style.icon} />
            </svg>
          </span>
          <span className="min-w-0">{r.name}</span>
        </h2>

        {/* ── ราคาคาราโอเกะ (0061) — มาก่อนเมนู เพราะเป็นสิ่งที่คนเปิดร้านแบบนี้มาดู ── */}
        {r.karaoke ? <KaraokePrices k={r.karaoke} /> : null}
        {/*
          * ── เมนูเด็ด ──────────────────────────────────────────
          * ★★ หน้ารายละเอียดโชว์ครบทุกรายการ ต่างจากการ์ดที่โชว์สามรายการแรก
          *    ★ คนกดเข้ามาเพราะอยากเห็นรายละเอียด — การตัดทิ้งที่นี่ด้วย
          *      แปลว่าไม่มีที่ไหนในระบบที่ดูเมนูครบได้เลย
          */}
        {(r.dishes?.length ?? 0) > 0 ? (
          <ul className="mt-2 flex flex-col divide-y divide-line rounded-xl border border-line bg-surface/40">
            {r.dishes!.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-3 px-3 py-2">
                {/* ★ รูปเมนู (0060) — แตะแล้วดูเต็มจอ เลื่อนดูรูปเมนูอื่นต่อได้ */}
                {d.photoUrl ? (
                  <button
                    type="button"
                    onClick={() => setDishView(dishPhotos.indexOf(d.photoUrl!))}
                    aria-label={d.name}
                    className="size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-line"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Storage ที่ไม่ได้ตั้ง remotePatterns */}
                    <img src={d.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                ) : null}
                <span dir="auto" className="min-w-0 flex-1 text-[13.5px] text-ink">
                  {d.name}
                </span>
                {d.price != null ? (
                  <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink-soft">
                    ฿{d.price.toLocaleString()}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : r.signatureDish && !r.karaoke ? (
          <p dir="auto" className="mt-0.5 text-sm text-ink-soft">
            {r.signatureDish}
          </p>
        ) : null}

        {/*
          * ── ให้ดาว ────────────────────────────────────────────
          *
          * ★★★ กดได้ตรงนี้เลย ไม่ต้องเลื่อนลงไปหาปุ่ม "เขียนรีวิว"
          *     ★ "ให้ดาว" คือสิ่งที่คนอยากทำมากที่สุดเมื่อเปิดหน้าร้านมา
          *       ★★ ของเดิมต้องเลื่อนผ่านสถิติและปุ่มแผนที่ก่อนถึงจะเจอ
          *     ★ กดดาวที่ 4 แล้วกล่องเขียนรีวิวกางพร้อมคะแนน 4 ดาวให้เลย
          *       ★★ ไม่ใช่กางกล่องเปล่าแล้วต้องกดดาวซ้ำอีกรอบ
          */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/*
            * ★★ ค่าเฉลี่ยกับช่องให้คะแนนเป็นคนละอย่าง จึงเป็นคนละคอมโพเนนต์
            *    ★ Stars เป็นรูป (role="img") ★★ StarInput เป็นปุ่มห้าปุ่ม
            *       ปนกันแล้วโปรแกรมอ่านหน้าจอจะอ่านค่าเฉลี่ยเป็น "ปุ่ม 5 ปุ่ม"
            */}
          {r.ratingCount && r.ratingCount > 0 ? (
            <span className="flex items-center gap-2">
              <Stars value={r.rating ?? 0} size={20} />
              <span className="text-[17px] font-bold tabular-nums text-ink">
                {r.rating?.toFixed(1)}
              </span>
              <span className="text-[12.5px] text-ink-faint">
                {ot('food.review.heading', { n: r.ratingCount })}
              </span>
            </span>
          ) : null}

          <span className="flex flex-wrap items-center gap-x-2">
            <StarInput
              value={seedRating ?? 0}
              onChange={setSeedRating}
              label={(n) => ot('food.review.starsN', { n })}
            />
            <span className="text-[12.5px] text-ink-soft">
              <Untranslated>{ot('food.detail.rateHint')}</Untranslated>
            </span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {r.cuisine ? <Tag>{r.cuisine}</Tag> : null}
          {r.priceRange ? <Tag>{r.priceRange}</Tag> : null}
          {/* ★★ ระยะทางจริงมาก่อนป้ายหยาบ ๆ ("เดินได้" / "ต้องขับ")
                 ★ ตัวเลขตอบคำถามได้ตรงกว่า และป้ายหยาบยังอยู่ให้ร้านที่
                   ยังไม่ได้ปักหมุด */}
          {dist ? (
            <Tag>
              <span className="tabular-nums">
                {ot(dist.unit === 'km' ? 'food.geo.km' : 'food.geo.metres', { n: dist.n })}
              </span>
            </Tag>
          ) : r.distance ? (
            <Tag>{distanceLabel(ot, r.distance)}</Tag>
          ) : null}
        </div>

        {r.note ? (
          <p dir="auto" className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
            {r.note}
          </p>
        ) : null}

        {/*
          * ── สถิติของออฟฟิศ ─────────────────────────────────────
          * ★★ บอกทั้งของทั้งออฟฟิศและของฉัน
          *    ★ "คนอื่นกิน 8 ครั้ง ฉันกิน 0" เป็นข้อมูลที่ทำให้คนอยากลอง
          *      ★★ ส่วน "ฉันกิน 5 จาก 8" บอกว่าร้านนี้เป็นร้านประจำของฉันเอง
          */}
        <div className="mt-4 rounded-2xl border border-line bg-surface/50 p-3.5">
          <p className="text-sm font-medium text-ink">
            <Untranslated>
              {data.visitsThisMonth > 0
                ? ot('food.visitsMonth', { n: data.visitsThisMonth })
                : ot('food.visitsNone')}
            </Untranslated>
          </p>
          {data.myVisitsThisMonth > 0 ? (
            <p className="mt-0.5 text-xs text-ink-faint">
              <Untranslated>{ot('food.myVisits', { n: data.myVisitsThisMonth })}</Untranslated>
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {/* ── ปุ่ม ─────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* ★ ปุ่มหลักคือ "สร้างบิลร้านนี้" — เป็นสิ่งที่คนมาหน้านี้ทำต่อจริง */}
          <Link
            href={`/office/wallet/create?shop=${r.id}`}
            className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            <Untranslated>{ot('food.billHere')}</Untranslated>
          </Link>

          <Button
            variant={r.voted ? 'secondary' : 'ghost'}
            className="min-h-11"
            loading={busy}
            onClick={vote}
          >
            <span className={cn(r.voted && 'text-link')}>
              👍 {r.voteCount}
            </span>
          </Button>

          {/*
            * ★★★ ปุ่ม "ไปร้าน" ใช้ Google Maps URL ล้วน ไม่ใช่ API
            *
            *     ข้อกำหนดห้าม Directions API ★ แต่ลิงก์รูปแบบ /maps/dir/?api=1
            *     เป็นแค่ URL ไม่ต้องมีกุญแจและไม่มีค่าใช้จ่าย
            *     ★★ บนมือถือระบบปฏิบัติการเปิดแอป Google Maps ให้เอง
            *        จึงไม่ต้องเดาจาก user agent ว่าควรส่งลิงก์แบบไหน
            *
            * ★ ร้านไม่มีพิกัด → ค้นด้วยชื่อแทน ไม่ใช่ซ่อนปุ่ม
            *   ★★ คนที่อยากไปร้านยังได้สิ่งที่ต้องการ แค่แม่นน้อยลง
            */}
          {r.lat != null && r.lng != null && office ? (
            <a
              href={directionsUrl(office.lat, office.lng, r.lat, r.lng, r.travelMode ?? 'walking')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm text-ink hover:bg-surface-hover"
            >
              {ot('food.geo.goThere')}
              {r.travelMinutes != null ? (
                <span className="ms-1.5 text-ink-faint">
                  {ot(r.travelMode === 'driving' ? 'food.geo.driveMin' : 'food.geo.walkMin', {
                    n: r.travelMinutes,
                  })}
                </span>
              ) : null}
            </a>
          ) : (
            <a
              href={r.mapUrl || searchUrl(r.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm text-ink hover:bg-surface-hover"
            >
              {ot('food.picks.openMap')}
            </a>
          )}
        </div>

        {r.addedByName ? (
          <p dir="auto" className="mt-3 text-xs text-ink-faint">
            <Untranslated>{ot('food.addedBy', { name: r.addedByName })}</Untranslated>
          </p>
        ) : null}
      </div>

      {/*
        * ★ รีวิวอยู่นอกการ์ดข้อมูลร้าน ไม่ใช่ข้างใน
        *   ★★ มันเป็นลิสต์ที่ยาวได้ไม่จำกัด การยัดไว้ในการ์ดทำให้การ์ด
        *      ที่ควรเป็น "สรุปร้านหนึ่งหน้าจอ" กลายเป็นหน้าเลื่อนยาว
        */}
      <RestaurantReviews
        shopId={id}
        shopName={r.name}
        shopLat={r.lat ?? null}
        shopLng={r.lng ?? null}
        seedRating={seedRating}
        onSeedUsed={() => setSeedRating(null)}
      />

      {dishView !== null && dishPhotos[dishView] ? (
        <PhotoLightbox photos={dishPhotos} index={dishView} onIndex={setDishView} onClose={() => setDishView(null)} />
      ) : null}

      <Toast toast={toast} />
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2.5 py-1 text-ink-soft">{children}</span>
}
