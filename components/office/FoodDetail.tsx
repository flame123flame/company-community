'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Toast, useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { distanceLabel } from '@/lib/office/food'
import { RestaurantReviews } from './RestaurantReviews'

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
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="max-w-2xl pb-10">
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

        <h2 dir="auto" className="text-[26px] font-bold leading-tight text-ink">
          {r.name}
        </h2>
        {r.signatureDish ? (
          <p dir="auto" className="mt-0.5 text-sm text-ink-soft">
            {r.signatureDish}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {r.cuisine ? <Tag>{r.cuisine}</Tag> : null}
          {r.priceRange ? <Tag>{r.priceRange}</Tag> : null}
          {r.distance ? <Tag>{distanceLabel(ot, r.distance)}</Tag> : null}
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

          {r.mapUrl ? (
            <a
              href={r.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm text-ink hover:bg-surface-hover"
            >
              {ot('food.picks.openMap')}
            </a>
          ) : null}
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
      <RestaurantReviews shopId={id} shopLat={r.lat ?? null} shopLng={r.lng ?? null} />

      <Toast toast={toast} />
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2.5 py-1 text-ink-soft">{children}</span>
}
