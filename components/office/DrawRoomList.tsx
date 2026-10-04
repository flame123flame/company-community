'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { officeErrorText, splitList } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { FunGuide } from './FunGuide'

type Room = {
  id: string
  title: string
  status: 'OPEN' | 'SPINNING' | 'DONE'
  hostName: string
  winnerLabel: string | null
  optionCount: number
}

type Restaurant = { id: string; name: string }

const MAX_OPTIONS = 100
const MAX_LABEL = 80

/* ★ สีช่องของวงล้อตัวอย่าง — วนจาก token ของธีม ไม่ฮาร์ดโค้ดสี */
const SLICE_COLORS = [
  'var(--color-accent)',
  'color-mix(in srgb, var(--color-accent) 50%, var(--color-elevated))',
  'var(--color-link)',
  'color-mix(in srgb, var(--color-link) 50%, var(--color-elevated))',
]

function wheelGradient(n: number): string {
  const count = Math.max(2, Math.min(n, 40))
  const step = 360 / count
  const stops = Array.from({ length: count }, (_, i) => {
    /* ★ จำนวนช่องคี่ — ช่องสุดท้ายอย่าสีเดียวกับช่องแรก (จะดูเหมือนช่องเดียวกัน) */
    const c = i === count - 1 && count % SLICE_COLORS.length === 1 ? SLICE_COLORS[1] : SLICE_COLORS[i % SLICE_COLORS.length]
    return `${c} ${i * step}deg ${(i + 1) * step}deg`
  })
  return `conic-gradient(${stops.join(', ')})`
}

/**
 * ห้องสุ่มกลุ่ม — หน้ารายการ + เปิดห้อง (FR-A09)
 *
 * ★★★ หน้านี้ต้องอธิบายตัวเองได้ ไม่ต้องมีใครสอน
 *
 *     ★ ส่วนบน: บอกว่า "ห้องสุ่ม" คืออะไร ต่างจากวงล้อธรรมดายังไง (ทุกเครื่อง
 *       เห็นผลเดียวกัน) และใช้ยังไงใน 3 ขั้น
 *     ★ ฟอร์ม: เป็นขั้นตอนมีเลขกำกับ — ชื่อห้อง → ตัวเลือก → เปิดห้อง
 *       ★★ เห็นตัวอย่างวงล้อและรายการจริงก่อนกด ไม่ต้องเดาว่าจะได้อะไร
 *     ★ รายการห้อง: สถานะเป็นคำ + จุดกะพริบ · ห้องที่สุ่มแล้วโชว์ผลบนการ์ดเลย
 */
export function DrawRoomList() {
  const ot = useOt()
  const confirm = useConfirm()
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState<'FOOD' | 'TYPED'>('FOOD')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'DONE'>('ALL')

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: Room[] }>('/api/office/draw/rooms')
      setRooms(d.items)
    } catch (e) {
      setRooms([])
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
    /* ★ ดึงร้านมาไว้ล่วงหน้า — คนส่วนใหญ่เปิดห้องเพื่อสุ่มมื้อเที่ยง */
    void apiFetch<{ items: Restaurant[] }>('/api/office/food/restaurants')
      .then((d) => setRestaurants(d.items))
      .catch(() => setRestaurants([]))
  }, [load])

  /* ── ตัวเลือกที่จะเข้าวงล้อ — คำนวณสดเพื่อโชว์ตัวอย่างก่อนกด ── */
  const typedLines = typed
    .split('\n')
    .map((s) => s.trim().slice(0, MAX_LABEL))
    .filter(Boolean)
  const options =
    source === 'FOOD'
      ? (restaurants ?? []).map((r) => ({ id: r.id, label: r.name }))
      : /* ★ ชื่อที่พิมพ์เองใช้ตัวมันเองเป็น id — ตัดชื่อซ้ำออก ไม่งั้น id ชนกัน */
        [...new Set(typedLines)].map((label) => ({ id: label, label }))
  const ready = options.length >= 2
  const suggestions = splitList(ot('room.suggestions'))

  async function create() {
    setError(null)
    if (!ready) {
      setError(ot('room.needOptions'))
      return
    }
    const roomTitle = title.trim() || ot('room.title')
    if (!(await confirm({ kind: 'create', subject: roomTitle }))) return

    setBusy(true)
    try {
      const d = await apiFetch<{ id: string }>('/api/office/draw/rooms', {
        method: 'POST',
        body: { title: roomTitle, options: options.slice(0, MAX_OPTIONS) },
      })
      router.push(`/office/fun/room/${d.id}`)
    } catch (e) {
      setError(officeErrorText(e, ot))
      setBusy(false)
    }
  }

  const shownRooms = (rooms ?? []).filter((r) =>
    filter === 'ALL' ? true : filter === 'DONE' ? r.status === 'DONE' : r.status !== 'DONE',
  )
  const liveCount = (rooms ?? []).filter((r) => r.status !== 'DONE').length

  return (
    <div className="py-2">
      {/* ═══ ส่วนบน: ห้องสุ่มคืออะไร + ใช้ยังไง (แผงกลางของหมวด) ═══ */}
      <FunGuide id="room" art="room" />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ═══ เปิดห้องใหม่ ═════════════════════════════════════════ */}
        <section className="rounded-[28px] border border-line bg-elevated/70 p-5 backdrop-blur-md sm:p-6">
          <h2 className="text-lg font-bold text-ink">{ot('room.create')}</h2>
          <p className="mt-1 text-xs text-ink-soft">
            <Untranslated>{ot('room.createHint')}</Untranslated>
          </p>

          {/* ── ① ชื่อห้อง ── */}
          <div className="mt-5">
            <StepLabel n={1} htmlFor="room-title">
              {ot('room.nameLabel')}
            </StepLabel>
            <Input
              radius="round"
              id="room-title"
              className="mt-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ot('room.namePlaceholder')}
              maxLength={80}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTitle(s)}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-full px-3 text-xs transition-colors sm:min-h-8',
                    title === s ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                  )}
                >
                  <Untranslated>{s}</Untranslated>
                </button>
              ))}
            </div>
          </div>

          {/* ── ② ตัวเลือกในวงล้อ ── */}
          <div className="mt-6">
            <StepLabel n={2}>{ot('room.source')}</StepLabel>
            <div role="radiogroup" aria-label={ot('room.source')} className="mt-2 grid gap-2 sm:grid-cols-2">
              <SourceCard
                checked={source === 'FOOD'}
                onClick={() => setSource('FOOD')}
                icon="M7 3v8a2 2 0 0 0 2 2v8M11 3v6M5 3v6M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9"
                title={ot('room.sourceFood')}
                detail={
                  restaurants === null
                    ? ot('common.loading')
                    : restaurants.length >= 2
                      ? ot('room.sourceFoodDesc', { n: restaurants.length })
                      : ot('room.noRestaurants')
                }
              />
              <SourceCard
                checked={source === 'TYPED'}
                onClick={() => setSource('TYPED')}
                icon="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"
                title={ot('room.sourceTyped')}
                detail={ot('room.sourceTypedDesc')}
              />
            </div>

            {source === 'TYPED' ? (
              <div className="mt-3">
                <textarea
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  rows={5}
                  aria-label={ot('room.sourceTyped')}
                  placeholder={ot('room.typedPlaceholderLong')}
                  className="w-full rounded-2xl border border-line bg-input px-4 py-3 text-base leading-relaxed text-ink outline-none placeholder:text-ink-faint focus-visible:border-accent sm:text-sm"
                />
                <p className={cn('mt-1 text-xs', ready ? 'text-ink-soft' : 'text-ink-faint')}>
                  <Untranslated>
                    {ready
                      ? ot('room.typedCount', { n: Math.min(options.length, MAX_OPTIONS), max: MAX_OPTIONS })
                      : ot('room.needMore', { n: 2 - options.length })}
                  </Untranslated>
                </p>
              </div>
            ) : null}

            {/* ── ตัวอย่างวงล้อ: เห็นของจริงก่อนเปิดห้อง ── */}
            {ready ? (
              <div className="mt-4 flex items-center gap-4 rounded-2xl bg-surface/70 p-3">
                <span
                  aria-hidden="true"
                  className="relative size-20 shrink-0 rounded-full shadow-[0_0_0_4px_var(--color-elevated)]"
                  style={{ background: wheelGradient(options.length) }}
                >
                  <span className="absolute inset-[34%] rounded-full bg-elevated shadow" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink">
                    <Untranslated>{ot('room.preview', { n: Math.min(options.length, MAX_OPTIONS) })}</Untranslated>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {options.slice(0, 8).map((o) => (
                      <span key={o.id} dir="auto" className="max-w-36 truncate rounded-full bg-elevated px-2 py-0.5 text-[11px] text-ink-soft">
                        {o.label}
                      </span>
                    ))}
                    {options.length > 8 ? (
                      <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                        +{options.length - 8}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* ── ③ เปิดห้อง ── */}
          <div className="mt-6">
            <StepLabel n={3}>{ot('room.step3')}</StepLabel>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={create}
              disabled={busy || !ready}
              className="team-go mt-2 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-base font-bold"
            >
              {busy ? (
                <Spinner className="size-5" />
              ) : (
                <svg viewBox="0 0 24 24" className="team-go-dice size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v9l6.4 6.4M12 12 5.6 18.4M12 12H3" />
                </svg>
              )}
              <Untranslated>{ot('room.createCta')}</Untranslated>
            </button>
            <p className="mt-2 text-center text-xs text-ink-faint">
              <Untranslated>{ot('room.createNote')}</Untranslated>
            </p>
          </div>
        </section>

        {/* ═══ ห้องล่าสุด ══════════════════════════════════════════ */}
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="me-auto text-lg font-bold text-ink">
              <Untranslated>{ot('room.listTitle')}</Untranslated>
            </h2>
            <div role="tablist" className="flex rounded-full bg-surface p-1">
              {(['ALL', 'LIVE', 'DONE'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-xs transition-all sm:h-8',
                    filter === f ? 'bg-elevated font-semibold text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {f === 'ALL' ? (
                    <Untranslated>{ot('room.filterAll')}</Untranslated>
                  ) : f === 'LIVE' ? (
                    <>
                      {ot('room.open')}
                      {liveCount > 0 ? (
                        <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold tabular-nums text-accent-ink">{liveCount}</span>
                      ) : null}
                    </>
                  ) : (
                    ot('room.done')
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {rooms === null ? (
              Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface" />
              ))
            ) : shownRooms.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-line-strong px-6 py-10 text-center">
                <span aria-hidden="true" className="room-mini-wheel mx-auto block size-14" />
                <p className="mt-4 text-sm font-semibold text-ink">{ot('room.empty')}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ot('room.emptyHint')}</p>
              </div>
            ) : (
              shownRooms.map((r) => <RoomCard key={r.id} room={r} />)
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function StepLabel({ n, htmlFor, children }: { n: number; htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
      <span aria-hidden="true" className="room-step-num grid size-6 shrink-0 place-items-center rounded-lg text-xs font-black">
        {n}
      </span>
      {children}
    </label>
  )
}

function SourceCard({
  checked,
  onClick,
  icon,
  title,
  detail,
}: {
  checked: boolean
  onClick: () => void
  icon: string
  title: string
  detail: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className="room-source flex min-h-[4.5rem] items-start gap-3 rounded-2xl p-3.5 text-start"
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl transition-colors',
          checked ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
          <Untranslated>{detail}</Untranslated>
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line-strong',
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-accent-ink" /> : null}
      </span>
    </button>
  )
}

function RoomCard({ room: r }: { room: Room }) {
  const ot = useOt()
  const live = r.status !== 'DONE'
  return (
    <Link href={`/office/fun/room/${r.id}`} className="room-card flex items-center gap-3.5 rounded-2xl p-3.5">
      <span
        aria-hidden="true"
        className={cn(
          'room-mini-wheel block size-12 shrink-0',
          r.status === 'DONE' && 'room-mini-wheel-done',
          r.status === 'SPINNING' && 'room-mini-wheel-spin',
        )}
      />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-[15px] font-semibold text-ink">
          {r.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {ot('room.hostBy', { name: r.hostName })} · {ot('room.optionCount', { n: r.optionCount })}
        </p>
        {r.winnerLabel ? (
          <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ck-gold)_18%,transparent)] px-2.5 py-0.5 text-xs font-semibold text-ink">
            <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-[var(--ck-gold-deep)]" fill="currentColor" aria-hidden="true">
              <path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zM7 20h10v1.5H7z" />
            </svg>
            <span dir="auto" className="truncate">{r.winnerLabel}</span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            r.status === 'DONE'
              ? 'bg-surface text-ink-faint'
              : r.status === 'SPINNING'
                ? 'bg-warn/15 text-warn'
                : 'bg-accent/12 text-accent',
          )}
        >
          {live ? <span aria-hidden="true" className="room-live" /> : null}
          {r.status === 'DONE' ? ot('room.done') : r.status === 'SPINNING' ? ot('room.spinning') : ot('room.open')}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-link">
          {live ? ot('room.enter') : <Untranslated>{ot('room.viewResult')}</Untranslated>}
          <svg viewBox="0 0 24 24" className="size-3.5 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
