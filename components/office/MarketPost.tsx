'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Spinner } from '@/components/ui/Spinner'
import { useLocale } from '@/lib/i18n/client'
import { FunGuide } from './FunGuide'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
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
  const confirm = useConfirm()
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
  const [dragging, setDragging] = useState(false)
  const locale = useLocale()

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
    if (!(await confirm({ kind: 'create', subject: title.trim() }))) return

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

  /* ── รายการตรวจ: เห็นว่าขาดอะไรอีกก่อนกดส่ง ── */
  const checks = [
    { key: 'market.check.photo', ok: images.length > 0 },
    { key: 'market.check.title2', ok: title.trim() !== '' },
    ...(needsPrice ? [{ key: 'market.check.price', ok: Number(price) > 0 }] : []),
    { key: 'market.check.agree', ok: agreed },
  ]
  const doneCount = checks.filter((c) => c.ok).length
  const previewPrice =
    kind === 'SELL'
      ? Number(price) > 0
        ? `฿${Number(price).toLocaleString(locale)}`
        : '฿—'
      : kindLabel(ot, kind)
  const meetText = [building, floor, desk].map((x) => x.trim()).filter(Boolean).join(' · ')

  return (
    <div className="py-2">
      <FunGuide id="marketPost" art="post" />

      <form onSubmit={submit} className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/*
            * ★★★ แบ่งฟอร์มเป็นสามขั้นที่มีหัวข้อ ไม่ใช่กองเดียว 8 ช่อง
            *     ★ หัวข้อมีเลขกำกับทำให้เห็นว่างานทั้งหมดมีแค่สามก้อน และแต่ละก้อนสั้น
            */}
          <Section n={1} title={ot('market.form.step1')} hint={ot('market.form.step1Hint')}>
            {/* ── รูป (บังคับ) ── */}
            <div>
              <p className="text-sm font-medium text-ink">
                {ot('market.form.images')}
                <span className="ms-0.5 text-accent">*</span>
                <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('market.form.imagesHint')})</span>
              </p>

              <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {images.map((url, i) => (
                  <div key={url} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={ot('market.post.photoAlt', { n: i + 1 })}
                      className="size-full rounded-2xl border border-line object-cover"
                    />
                    {i === 0 ? (
                      <span className="absolute bottom-1.5 start-1.5 rounded-full bg-[color-mix(in_srgb,var(--ck-shade)_55%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ck-shine)]">
                        <Untranslated>{ot('market.form.cover')}</Untranslated>
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setImages((p) => p.filter((x) => x !== url))}
                      className="absolute -end-1.5 -top-1.5 grid size-7 place-items-center rounded-full bg-ink text-xs text-page shadow after:absolute after:-inset-2 after:content-['']"
                      aria-label={ot('market.post.removePhoto')}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {images.length < 5 ? (
                  /* ★ ช่องเปล่าต้องบอกว่ากดแล้วได้อะไร — ลากรูปมาวางก็ได้ */
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (!dragging) setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragging(false)
                      if (e.dataTransfer.files.length) void upload(e.dataTransfer.files)
                    }}
                    disabled={busy}
                    className={cn(
                      'mkt-drop flex flex-col items-center justify-center gap-1 rounded-2xl text-ink-soft disabled:opacity-40',
                      images.length === 0 ? 'col-span-3 min-h-40 py-6 sm:col-span-5' : 'aspect-square',
                      dragging && 'mkt-drop-on',
                    )}
                  >
                    <span aria-hidden="true" className={cn(images.length === 0 ? 'text-4xl' : 'text-2xl')}>📷</span>
                    <span className="text-xs font-semibold text-ink">{ot('market.form.dropzone')}</span>
                    {images.length === 0 ? (
                      <span className="text-[11px]">
                        <Untranslated>{ot('market.form.dropHint')}</Untranslated>
                      </span>
                    ) : null}
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
            <div>
              <p className="text-sm font-medium text-ink">{ot('market.form.kind')}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className="mkt-kind-opt flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl p-2.5 text-center"
                  >
                    <span aria-hidden="true" className="text-2xl">{KIND_EMOJI[k]}</span>
                    <span className="text-sm font-semibold text-ink">{kindLabel(ot, k)}</span>
                    <span className="text-[11px] leading-tight text-ink-faint">
                      <Untranslated>{ot(`market.kindHint.${k}` as 'market.kindHint.SELL')}</Untranslated>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {needsPrice ? (
              <Field label={ot('market.form.price')} required>
                {/* ★ สัญลักษณ์บาทอยู่ในช่องกรอก — หน่วยอยู่ตรงที่ตากำลังมอง */}
                <span className="relative inline-flex max-w-52 items-center">
                  <span className="pointer-events-none absolute start-4 text-base font-bold text-ink-faint">฿</span>
                  <Input
                    radius="round"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    className="ps-9 text-lg font-bold tabular-nums"
                    required
                  />
                </span>
              </Field>
            ) : null}

            <div>
              <p className="text-sm font-medium text-ink">{ot('market.form.category')}</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className="mkt-cat flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2"
                  >
                    <span aria-hidden="true" className="mkt-cat-emoji text-xl leading-none">{CATEGORY_EMOJI[c]}</span>
                    <span className="text-[11px] font-medium text-ink">{categoryLabel(ot, c)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-ink">
                {ot('market.form.condition')}
                <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('link.optional')})</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => (
                  <Chip key={c} active={condition === c} onClick={() => setCondition(condition === c ? null : c)}>
                    {conditionLabel(ot, c)}
                  </Chip>
                ))}
              </div>
            </div>
          </Section>

          <Section n={3} title={ot('market.form.step3')} hint={ot('market.form.step3Hint')}>
            <Field label={ot('market.form.description')} hint={ot('link.optional')}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder={ot('market.form.descPlaceholder')}
                className={cn(
                  'field-input w-full rounded-2xl bg-input px-4 py-3',
                  'border border-line text-[16px] placeholder:text-ink-faint sm:text-sm',
                  'transition-colors focus:border-accent/70 focus:outline-none',
                )}
              />
            </Field>

            {/* ── จุดนัดรับ (FR-D06) ── */}
            <div>
              <p className="text-sm font-medium text-ink">
                📍 {ot('market.meet')}
                <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('link.optional')})</span>
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input radius="round" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder={ot('market.form.building')} maxLength={40} />
                <Input radius="round" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={ot('market.form.floor')} maxLength={20} />
                <Input radius="round" value={desk} onChange={(e) => setDesk(e.target.value)} placeholder={ot('market.form.desk')} maxLength={40} />
              </div>
            </div>
          </Section>
        </div>

        {/* ═══ ขวา: ตัวอย่างประกาศ + รายการตรวจ + ปุ่มส่ง ═══ */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+16px)]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Untranslated>{ot('market.form.previewTitle')}</Untranslated>
            </p>
            <div className="mkt-preview overflow-hidden rounded-3xl">
              <div className="mkt-preview-media relative aspect-[4/3]">
                {images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={images[0]} alt="" className="size-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-6xl opacity-90">
                    {CATEGORY_EMOJI[category]}
                  </span>
                )}
                <span className="market-scrim" aria-hidden="true" />
                <span className={cn('mkt-kind absolute start-3 top-3', `mkt-kind-${kind}`)}>
                  <span aria-hidden="true" className="me-1">{KIND_EMOJI[kind]}</span>
                  {kindLabel(ot, kind)}
                </span>
                <span className="mkt-price absolute bottom-3 start-3 tabular-nums">{previewPrice}</span>
              </div>
              <div className="p-4">
                <p dir="auto" className={cn('text-base font-bold leading-snug', title.trim() ? 'text-ink' : 'text-ink-faint')}>
                  {title.trim() || <Untranslated>{ot('market.form.previewNoTitle')}</Untranslated>}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-ink-soft">
                  <span className="rounded-full bg-surface px-2.5 py-1">
                    {CATEGORY_EMOJI[category]} {categoryLabel(ot, category)}
                  </span>
                  {condition ? <span className="rounded-full bg-surface px-2.5 py-1">{conditionLabel(ot, condition)}</span> : null}
                  {meetText ? (
                    <span dir="auto" className="rounded-full bg-surface px-2.5 py-1">📍 {meetText}</span>
                  ) : null}
                </div>
                {description.trim() ? (
                  <p dir="auto" className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">{description}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* ── รายการตรวจ ── */}
          <div className="mkt-panel rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">
                <Untranslated>{ot('market.check.title')}</Untranslated>
              </p>
              <span className="text-xs font-bold tabular-nums text-ink-soft">
                {doneCount}/{checks.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
              <div className="mkt-progress h-full rounded-full" style={{ width: `${(doneCount / checks.length) * 100}%` }} />
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors',
                      c.ok ? 'mkt-check-done' : 'bg-surface text-ink-faint',
                    )}
                  >
                    {c.ok ? '✓' : ''}
                  </span>
                  <span className={c.ok ? 'text-ink' : 'text-ink-soft'}>
                    <Untranslated>{ot(c.key as 'market.check.photo')}</Untranslated>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ★★ FR-D10: ข้อความเตือนสินค้าต้องห้ามต้องขึ้นตอนลงประกาศ และต้องติ๊กยืนยันก่อนส่ง */}
          <div className="flex gap-3 rounded-2xl border border-warn/45 bg-warn/10 p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warn/20 text-warn">
              <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 8v5M12 16.5v.5" />
                <path d="M12 3 2.5 20h19z" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0">
              <p className="text-xs leading-relaxed text-ink-soft">{ot('market.form.banned')}</p>
              <label className="mt-2.5 flex min-h-11 cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="text-xs font-semibold text-ink">{ot('market.form.confirm')}</span>
              </label>
            </span>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="team-go flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-base font-bold"
          >
            {busy ? <Spinner className="size-5" /> : <span aria-hidden="true">🚀</span>}
            {ot('market.form.submit')}
          </button>
        </aside>
      </form>
    </div>
  )
}

const KIND_EMOJI: Record<ListingKind, string> = { SELL: '🏷️', FREE: '🎁', TRADE: '🔄', WANTED: '🔍' }
const CATEGORY_EMOJI: Record<ListingCategory, string> = {
  ELECTRONICS: '💻',
  FURNITURE: '🪑',
  CLOTHES: '👕',
  BOOKS: '📚',
  SPORTS: '⚽',
  FOOD: '🍱',
  PLANT: '🪴',
  OTHER: '📦',
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
    <section className="mkt-panel mb-4 rounded-3xl p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="room-step-num grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black">
          {n}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          <span className="block text-xs text-ink-faint">{hint}</span>
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-5">{children}</div>
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
        'h-10 sm:h-8 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
