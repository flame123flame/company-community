'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import {
  CATEGORIES,
  CONDITIONS,
  KINDS,
  categoryLabel,
  conditionLabel,
  kindLabel,
} from '@/lib/office/market'
import type { ListingCategory, ListingCondition, ListingKind } from '@/types/database'

/** ฟอร์มลงประกาศ (FR-D01 / D02 / D06 / D10) */
export function MarketPost() {
  const ot = useOt()
  const router = useRouter()
  const [images, setImages] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [kind, setKind] = useState<ListingKind>('SELL')
  const [category, setCategory] = useState<ListingCategory>('OTHER')
  const [condition, setCondition] = useState<ListingCondition | null>(null)
  const [description, setDescription] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [desk, setDesk] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /** ★ แจกฟรีกับหาซื้อไม่มีราคา — ซ่อนช่องไปเลยดีกว่าปล่อยให้กรอกแล้วถูกทิ้ง */
  const needsPrice = kind === 'SELL'

  async function upload(files: FileList) {
    const room = 5 - images.length
    if (room <= 0) return

    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const d = await apiUpload<{ url: string }>('/api/office/market/upload', file)
        setImages((p) => [...p, d.url])
      }
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/market', {
        method: 'POST',
        body: {
          title,
          price: needsPrice ? Number(price) || 0 : 0,
          kind,
          category,
          condition,
          description: description.trim() || null,
          building: building.trim() || null,
          floor: floor.trim() || null,
          desk: desk.trim() || null,
          images,
        },
      })
      router.push('/office/market')
      router.refresh()
    } catch (e) {
      setError(officeErrorText(e, ot))
      setBusy(false)
    }
  }

  const canSubmit =
    images.length > 0 && title.trim() !== '' && agreed && (!needsPrice || Number(price) > 0)

  return (
    <form onSubmit={submit} className="max-w-2xl py-2">

      {/*
        * ★★★ แบ่งฟอร์มเป็นสามขั้นที่มีหัวข้อ ไม่ใช่กองเดียว 8 ช่อง
        *
        *     ★ ฟอร์มยาว ๆ ที่เป็นแถวป้าย-ช่องกรอกเรียงกันรวดเดียว อ่านแล้ว
        *       ไม่รู้ว่าเหลืออีกเท่าไหร่ ★★ คนกรอกครึ่งทางแล้วเลิกกลางคัน
        *     ★ หัวข้อที่มีเลขกำกับทำให้เห็นว่างานทั้งหมดมีแค่สามก้อน
        *       และแต่ละก้อนสั้น ซึ่งเปลี่ยนความรู้สึกทั้งที่ช่องกรอกเท่าเดิม
        */}
      <Section n={1} title={ot('market.form.step1')} hint={ot('market.form.step1Hint')}>
        {/* ── รูป (บังคับ) ──────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-ink">
            {ot('market.form.images')}
            <span className="ms-0.5 text-accent">*</span>
            <span className="ms-1.5 text-xs font-normal text-ink-faint">
              ({ot('market.form.imagesHint')})
            </span>
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={ot('market.post.photoAlt', { n: i + 1 })}
                  className="size-28 rounded-2xl border border-line object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((x) => x !== url))}
                  className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-danger text-xs text-white"
                  aria-label={ot('market.post.removePhoto')}
                >
                  ✕
                </button>
              </div>
            ))}

            {images.length < 5 ? (
              /* ★ ช่องเปล่าต้องบอกว่ากดแล้วได้อะไร ★★ เครื่องหมาย + เดี่ยว ๆ
                   ในกรอบเล็ก ๆ อ่านเป็นปุ่มอะไรก็ได้ ไม่ใช่ "ใส่รูปตรงนี้" */
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="dropzone flex size-28 flex-col items-center justify-center gap-1 rounded-2xl disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2.5" />
                  <path d="M12 9.5v5M9.5 12h5" />
                </svg>
                <span className="text-[11px] font-medium">{ot('market.form.dropzone')}</span>
                <span className="text-[10px] opacity-70">{ot('market.form.dropzoneHint')}</span>
              </button>
            ) : null}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files)
            }}
          />
        </div>

        <Field label={ot('market.form.title')} required>
          <Input radius="round" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </Field>

      </Section>

      <Section n={2} title={ot('market.form.step2')} hint={ot('market.form.step2Hint')}>
        <Field label={ot('market.form.kind')}>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {kindLabel(ot, k)}
              </Chip>
            ))}
          </div>
        </Field>

        {needsPrice ? (
          <Field label={ot('market.form.price')} required>
            {/* ★ สัญลักษณ์บาทอยู่ในช่องกรอก ไม่ใช่ในป้ายกำกับ
                ★★ คนกรอกมองที่เคอร์เซอร์ ไม่ได้มองป้ายด้านบน — หน่วยจึงต้อง
                   อยู่ตรงที่ตากำลังอยู่ ตอนที่กำลังตัดสินใจว่าจะพิมพ์อะไร */}
            <span className="relative inline-flex max-w-44 items-center">
              <span className="pointer-events-none absolute start-4 text-sm text-ink-faint">฿</span>
              <Input
                radius="round"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                className="ps-8 tabular-nums"
                required
              />
            </span>
          </Field>
        ) : null}

        <Field label={ot('market.form.category')}>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {categoryLabel(ot, c)}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={ot('market.form.condition')} hint={ot('link.optional')}>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => (
              <Chip
                key={c}
                active={condition === c}
                onClick={() => setCondition(condition === c ? null : c)}
              >
                {conditionLabel(ot, c)}
              </Chip>
            ))}
          </div>
        </Field>

      </Section>

      <Section n={3} title={ot('market.form.step3')} hint={ot('market.form.step3Hint')}>
        <Field label={ot('market.form.description')} hint={ot('link.optional')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            /* ★ ช่องกรอกอื่นในฟอร์มนี้เป็นทรงมนหมด ★★ ช่องเดียวที่เป็นเหลี่ยม
                 อ่านเป็นของที่หลุดมาจากหน้าอื่น ไม่ใช่ความตั้งใจ */
            className={cn(
              'field-input w-full rounded-2xl bg-input px-4 py-3',
              'border border-line text-[16px] placeholder:text-ink-faint sm:text-sm',
              'transition-colors focus:border-accent/70 focus:outline-none',
            )}
          />
        </Field>

        {/* ── จุดนัดรับ (FR-D06) ────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-ink">
            {ot('market.meet')}
            <span className="ms-1.5 text-xs font-normal text-ink-faint">
              ({ot('link.optional')})
            </span>
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Input radius="round"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder={ot('market.form.building')}
              maxLength={40}
            />
            <Input radius="round"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder={ot('market.form.floor')}
              maxLength={20}
            />
            <Input radius="round"
              value={desk}
              onChange={(e) => setDesk(e.target.value)}
              placeholder={ot('market.form.desk')}
              maxLength={40}
            />
          </div>
        </div>

      </Section>

      {/* ★★ FR-D10: ข้อความเตือนสินค้าต้องห้ามต้องขึ้นตอนลงประกาศ
             ไม่ใช่ซ่อนในหน้าเงื่อนไข — และต้องติ๊กยืนยันก่อนส่ง */}
      <div className="mt-4 flex gap-3 rounded-2xl border border-warn/45 bg-warn/10 p-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warn/20 text-warn">
          <svg
            viewBox="0 0 24 24"
            className="size-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 8v5M12 16.5v.5" />
            <path d="M12 3 2.5 20h19z" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </span>

        <span className="min-w-0">
          <p className="text-xs leading-relaxed text-ink-soft">{ot('market.form.banned')}</p>
          <label className="mt-2.5 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-accent)]"
            />
            <span className="text-xs font-medium text-ink">{ot('market.form.confirm')}</span>
          </label>
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canSubmit} block>
          {ot('market.form.submit')}
        </Button>
      </div>
    </form>
  )
}

/**
 * หนึ่งขั้นของฟอร์ม
 *
 * ★ เลขอยู่ในวงกลมด้านซ้ายของหัวข้อ ★★ ไม่ใช่ prefix ในข้อความ เพราะวงกลม
 *   ทำให้กวาดตาลงมาแล้วนับขั้นได้ทันทีโดยไม่ต้องอ่าน
 */
function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-ink">
          {n}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          <span className="block text-xs text-ink-faint">{hint}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
