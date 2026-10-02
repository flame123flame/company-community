'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { DISTANCE_OPTIONS, PRICE_OPTIONS, distanceLabel } from '@/lib/office/food'
import type { DistanceBand, PriceRange } from '@/types/database'

type Similar = { id: string; name: string; signatureDish: string; similarity: number }

/** ฟอร์มเพิ่มร้าน (FR-A01 + FR-A02) */
export function AddRestaurantForm({ onDone }: { onDone: () => void }) {
  const ot = useOt()
  const [name, setName] = useState('')
  const [dish, setDish] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [price, setPrice] = useState<PriceRange | null>(null)
  const [distance, setDistance] = useState<DistanceBand | null>(null)
  const [mapUrl, setMapUrl] = useState('')
  const [note, setNote] = useState('')
  const [similar, setSimilar] = useState<Similar[]>([])
  const [busy, setBusy] = useState(false)
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
        setSimilar(data.items)
      } catch {
        /* ★ คำเตือนเป็นของเสริม — ยิงไม่ผ่านก็ยังเพิ่มร้านได้ตามปกติ */
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [name])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/food/restaurants', {
        method: 'POST',
        body: {
          name,
          signatureDish: dish,
          cuisine: cuisine.trim() || null,
          priceRange: price,
          distance,
          mapUrl: mapUrl.trim() || null,
          note: note.trim() || null,
        },
      })
      onDone()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
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

      <Field label={ot('food.form.dish')} required>
        <Input radius="round" value={dish} onChange={(e) => setDish(e.target.value)} maxLength={120} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ot('food.form.cuisine')} hint={ot('link.optional')}>
          <Input radius="round"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            maxLength={40}
            placeholder={ot('food.kindPlaceholder')}
          />
        </Field>

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

      <Button type="submit" variant="primary" size="lg" loading={busy} block>
        {ot('food.form.submit')}
      </Button>
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
