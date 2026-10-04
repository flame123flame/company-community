'use client'

import { Input } from '@/components/ui/Input'
import { Untranslated, useOt } from '@/lib/i18n/office'
import type { KaraokePricing } from '@/lib/office/food'

/** แถวในฟอร์ม — เก็บเป็นข้อความระหว่างพิมพ์ แปลงเป็นตัวเลขตอนบันทึก */
export type KaraokeDraft = {
  hostessPerHour: string
  packages: { key: string; name: string; price: string; hostesses: string }[]
  rooms: { key: string; name: string; perHour: string; night: string }[]
  note: string
}

export const emptyKaraoke = (): KaraokeDraft => ({
  hostessPerHour: '',
  packages: [{ key: 'p0', name: '', price: '', hostesses: '2' }],
  rooms: [],
  note: '',
})

const num = (s: string) => (s.trim() === '' ? null : Number(s))

/** แปลงเป็นรูปที่ API รับ — ตัดแถวที่ไม่ได้กรอกชื่อทิ้ง */
export function karaokeFromDraft(d: KaraokeDraft) {
  return {
    hostessPerHour: num(d.hostessPerHour),
    packages: d.packages
      .filter((p) => p.name.trim() && p.price.trim())
      .map((p) => ({ name: p.name.trim(), price: Number(p.price), hostesses: Math.max(0, Math.round(Number(p.hostesses) || 0)) })),
    rooms: d.rooms
      .filter((r) => r.name.trim() && (r.perHour.trim() || r.night.trim()))
      .map((r) => ({ name: r.name.trim(), perHour: num(r.perHour), night: num(r.night) })),
    note: d.note.trim() || null,
  }
}

let seq = 0
const key = (p: string) => `${p}${Date.now().toString(36)}${seq++}`

/**
 * ช่องกรอกราคาคาราโอเกะ (0061) — โผล่เฉพาะเมื่อเลือกประเภท "คาราโอเกะ"
 *
 * ★★ สามเรื่องที่ร้านคาราโอเกะคิดเงินต่างกัน:
 *    1. ค่าเด็กเอ็นต่อชั่วโมง (ไม่มีก็เว้นว่าง = รวมในแพ็กเกจเหล้าอย่างเดียว)
 *    2. แพ็กเกจเหล้า — ราคาเหมา รวมเด็กกี่คน คนที่เกินคิดรายชั่วโมงตามข้อ 1
 *    3. ห้อง (เช่น VIP) — ต่อชั่วโมง และ/หรือ เหมาทั้งคืน
 */
export function KaraokeFields({ value, onChange }: { value: KaraokeDraft; onChange: (v: KaraokeDraft) => void }) {
  const ot = useOt()
  const set = (patch: Partial<KaraokeDraft>) => onChange({ ...value, ...patch })

  return (
    <section className="karaoke-box rounded-3xl p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--color-link)_18%,var(--color-elevated))] text-2xl">
          🎤
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-ink">
            <Untranslated>{ot('food.karaoke.title')}</Untranslated>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
            <Untranslated>{ot('food.karaoke.hint')}</Untranslated>
          </span>
        </span>
      </div>

      {/* ── 1 · ค่าเด็กเอ็นต่อชั่วโมง ── */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-ink">
          <Untranslated>{ot('food.karaoke.hostessPerHour')}</Untranslated>
          <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('link.optional')})</span>
        </p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          <Untranslated>{ot('food.karaoke.hostessHint')}</Untranslated>
        </p>
        <MoneyInput
          className="mt-2 max-w-56"
          value={value.hostessPerHour}
          onChange={(v) => set({ hostessPerHour: v })}
          suffix={ot('food.karaoke.perHourPerPerson')}
          label={ot('food.karaoke.hostessPerHour')}
        />
      </div>

      {/* ── 2 · แพ็กเกจเหล้า ── */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-ink">
          <Untranslated>{ot('food.karaoke.packages')}</Untranslated>
        </p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          <Untranslated>{ot('food.karaoke.packagesHint')}</Untranslated>
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {value.packages.map((p) => (
            <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl bg-surface/70 p-2 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]">
              <Input
                radius="round"
                value={p.name}
                onChange={(e) => set({ packages: value.packages.map((x) => (x.key === p.key ? { ...x, name: e.target.value } : x)) })}
                placeholder={ot('food.karaoke.packageName')}
                aria-label={ot('food.karaoke.packageName')}
                maxLength={80}
                className="col-span-2 sm:col-span-1"
              />
              <MoneyInput
                value={p.price}
                onChange={(v) => set({ packages: value.packages.map((x) => (x.key === p.key ? { ...x, price: v } : x)) })}
                label={ot('food.karaoke.packagePrice')}
              />
              <label className="relative flex items-center">
                <span className="sr-only">{ot('food.karaoke.includedHostesses')}</span>
                <span aria-hidden="true" className="pointer-events-none absolute start-3.5 text-sm">💃</span>
                <Input
                  radius="round"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20}
                  value={p.hostesses}
                  onChange={(e) => set({ packages: value.packages.map((x) => (x.key === p.key ? { ...x, hostesses: e.target.value } : x)) })}
                  className="ps-9 pe-12 tabular-nums"
                />
                <span className="pointer-events-none absolute end-3.5 text-xs text-ink-faint">
                  <Untranslated>{ot('food.karaoke.people')}</Untranslated>
                </span>
              </label>
              <RemoveButton
                label={ot('food.karaoke.remove')}
                onClick={() => set({ packages: value.packages.filter((x) => x.key !== p.key) })}
              />
            </div>
          ))}
        </div>
        <AddButton
          disabled={value.packages.length >= 20}
          onClick={() => set({ packages: [...value.packages, { key: key('p'), name: '', price: '', hostesses: '2' }] })}
        >
          {ot('food.karaoke.addPackage')}
        </AddButton>
      </div>

      {/* ── 3 · ห้อง (VIP ฯลฯ) ── */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-ink">
          <Untranslated>{ot('food.karaoke.rooms')}</Untranslated>
          <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('link.optional')})</span>
        </p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          <Untranslated>{ot('food.karaoke.roomsHint')}</Untranslated>
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {value.rooms.map((r) => (
            <div key={r.key} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface/70 p-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
              <Input
                radius="round"
                value={r.name}
                onChange={(e) => set({ rooms: value.rooms.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)) })}
                placeholder={ot('food.karaoke.roomName')}
                aria-label={ot('food.karaoke.roomName')}
                maxLength={60}
                className="col-span-2 sm:col-span-1"
              />
              <MoneyInput
                value={r.perHour}
                onChange={(v) => set({ rooms: value.rooms.map((x) => (x.key === r.key ? { ...x, perHour: v } : x)) })}
                suffix={ot('food.karaoke.perHour')}
                label={ot('food.karaoke.roomPerHour')}
              />
              <MoneyInput
                value={r.night}
                onChange={(v) => set({ rooms: value.rooms.map((x) => (x.key === r.key ? { ...x, night: v } : x)) })}
                suffix={ot('food.karaoke.perNight')}
                label={ot('food.karaoke.roomNight')}
              />
              <RemoveButton
                label={ot('food.karaoke.remove')}
                onClick={() => set({ rooms: value.rooms.filter((x) => x.key !== r.key) })}
              />
            </div>
          ))}
        </div>
        <AddButton
          disabled={value.rooms.length >= 10}
          onClick={() => set({ rooms: [...value.rooms, { key: key('r'), name: 'VIP', perHour: '', night: '' }] })}
        >
          {ot('food.karaoke.addRoom')}
        </AddButton>
      </div>

      {/* ── หมายเหตุ ── */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-ink">
          <Untranslated>{ot('food.karaoke.note')}</Untranslated>
          <span className="ms-1.5 text-xs font-normal text-ink-faint">({ot('link.optional')})</span>
        </p>
        <textarea
          value={value.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={300}
          rows={2}
          placeholder={ot('food.karaoke.notePlaceholder')}
          aria-label={ot('food.karaoke.note')}
          className="mt-2 w-full rounded-2xl border border-line bg-input px-4 py-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent/70 sm:text-sm"
        />
      </div>
    </section>
  )
}

function MoneyInput({
  value,
  onChange,
  suffix,
  label,
  className,
}: {
  value: string
  onChange: (v: string) => void
  suffix?: string
  label: string
  className?: string
}) {
  return (
    <label className={`relative flex items-center ${className ?? ''}`}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="pointer-events-none absolute start-4 text-sm font-semibold text-ink-faint">
        ฿
      </span>
      <Input
        radius="round"
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`ps-8 tabular-nums ${suffix ? 'pe-16' : ''}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute end-3.5 text-[11px] text-ink-faint">
          <Untranslated>{suffix}</Untranslated>
        </span>
      ) : null}
    </label>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center justify-self-end rounded-full text-ink-faint transition-colors hover:bg-elevated hover:text-danger"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  )
}

function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <Untranslated>{children}</Untranslated>
    </button>
  )
}

/**
 * แสดงราคาคาราโอเกะในหน้ารายละเอียดร้าน (0061)
 *
 * ★ อ่านง่ายเหมือนป้ายราคาหน้าร้าน: แพ็กเกจเหล้า (รวมเด็กกี่คน) · ค่าเด็กเพิ่ม/ชม. · ห้อง
 */
export function KaraokePrices({ k }: { k: KaraokePricing }) {
  const ot = useOt()
  const baht = (n: number) => `฿${n.toLocaleString()}`
  return (
    <section className="karaoke-box mt-4 rounded-3xl p-4 sm:p-5">
      <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <span aria-hidden="true" className="text-xl">🎤</span>
        <Untranslated>{ot('food.karaoke.pricesTitle')}</Untranslated>
      </p>

      {k.packages.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {k.packages.map((p) => (
            <li key={p.name} className="flex items-center gap-3 rounded-2xl bg-elevated px-3.5 py-2.5 ring-1 ring-line">
              <span aria-hidden="true" className="text-xl">🍾</span>
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="block text-xs text-ink-soft">
                  <Untranslated>
                    {p.hostesses > 0 ? ot('food.karaoke.includes', { n: p.hostesses }) : ot('food.karaoke.drinkOnly')}
                  </Untranslated>
                </span>
              </span>
              <span className="shrink-0 text-base font-black tabular-nums text-ink">{baht(p.price)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {k.hostessPerHour != null ? (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--color-link)_10%,transparent)] px-3.5 py-2.5 text-sm text-ink">
          <span aria-hidden="true">💃</span>
          <span className="min-w-0 flex-1">
            <Untranslated>
              {k.packages.some((p) => p.hostesses > 0)
                ? ot('food.karaoke.extraHostess', { price: baht(k.hostessPerHour) })
                : ot('food.karaoke.hostessRate', { price: baht(k.hostessPerHour) })}
            </Untranslated>
          </span>
        </p>
      ) : null}

      {k.rooms.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {k.rooms.map((r) => (
            <div key={r.name} className="rounded-2xl bg-elevated px-3.5 py-2.5 ring-1 ring-line">
              <p dir="auto" className="text-sm font-semibold text-ink">🚪 {r.name}</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                <Untranslated>
                  {[
                    r.perHour != null ? ot('food.karaoke.roomHourPrice', { price: baht(r.perHour) }) : null,
                    r.night != null ? ot('food.karaoke.roomNightPrice', { price: baht(r.night) }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Untranslated>
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {k.note ? <p dir="auto" className="mt-3 text-xs leading-relaxed text-ink-soft">{k.note}</p> : null}
    </section>
  )
}
