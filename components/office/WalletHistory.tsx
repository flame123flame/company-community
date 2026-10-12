'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { formatBaht } from '@/lib/office/wallet'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { ChatAvatar } from './ChatAvatar'
import { DebtDetailSheet } from './DebtDetailSheet'

type Item = {
  id: string
  amount: number
  description: string | null
  billTitle: string | null
  status: 'PENDING' | 'PAID_PENDING' | 'SETTLED' | 'CANCELLED'
  direction: 'out' | 'in'
  createdAt: string
  paidAt: string | null
  hasSlip: boolean
  isSettlement: boolean
  otherId: string
  otherName: string
  otherAvatar: string | null
}

type Payload = {
  page: number
  size: number
  total: number
  pages: number
  paidOut: number
  gotIn: number
  items: Item[]
}

type Dir = 'all' | 'out' | 'in'
type Status = 'all' | 'settled' | 'pending' | 'cancelled'
type Span = 'all' | '30' | '90' | '365'

/**
 * ประวัติการโอน — เคยจ่ายให้ใคร ค่าอะไร เมื่อไหร่
 *
 * ★★★ หน้าสรุปเดิมตอบได้แค่ "เดือนนี้ใช้ไปเท่าไรกับอะไร"
 *
 *     ★ มันคิดจากบิล ★★ ซึ่งตอบไม่ได้เลยว่า "เคยโอนให้มงมงไปกี่ครั้ง"
 *        หรือ "ตอนนั้นโอนค่าอะไร" ★ สองคำถามนั้นอยู่คนละตาราง (debts)
 *        และเป็นคำถามที่คนถามจริงตอนจะทวงหรือตอนจำไม่ได้ว่าจ่ายไปหรือยัง
 *
 * ★★ ค้นหาและกรองทำที่ฐานข้อมูล ไม่ใช่ดึงมาทั้งหมดแล้วกรองในเบราว์เซอร์
 *    ★ ปีหน้ามีสองพันใบ การส่งทั้งหมดมาคือการส่งของที่ 99% ไม่ได้ใช้
 *      ★★ และการตัดที่ 200 ใบล่าสุดจะกลายเป็น "ค้นแล้วไม่เจอของปีก่อน"
 *         โดยไม่มีอะไรบอกว่าถูกตัดไป
 */
export function WalletHistory() {
  const ot = useOt()
  const locale = useLocale()

  const [q, setQ] = useState('')
  const [dir, setDir] = useState<Dir>('all')
  const [status, setStatus] = useState<Status>('all')
  const [span, setSpan] = useState<Span>('all')
  const [page, setPage] = useState(0)

  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Item | null>(null)

  /*
   * ★★ หน่วงการค้นหา 300 มิลลิวินาที
   *    ★ ยิงทุกตัวอักษรคือการยิงคำขอแปดครั้งเพื่อคำว่า "มงมง" ★★ เจ็ดครั้งแรก
   *      ถูกทิ้งทันทีที่พิมพ์ตัวถัดไป และคำตอบอาจกลับมาสลับลำดับกัน
   */
  const [typed, setTyped] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(typed)
      setPage(0)
    }, 300)
    return () => window.clearTimeout(id)
  }, [typed])

  /* ★ ขอครั้งล่าสุดเท่านั้นที่ได้เขียนผล — กันคำตอบเก่ามาทับคำตอบใหม่ */
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seqRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ dir, status, page: String(page) })
      if (q) params.set('q', q)
      if (span !== 'all') {
        const d = new Date(Date.now() - Number(span) * 86_400_000)
        params.set('from', d.toISOString().slice(0, 10))
      }
      const r = await apiFetch<Payload>(`/api/office/wallet/history?${params}`)
      if (seqRef.current !== mine) return
      setData(r)
      setError(null)
    } catch (e) {
      if (seqRef.current !== mine) return
      setError(officeErrorText(e, ot))
    } finally {
      if (seqRef.current === mine) setLoading(false)
    }
  }, [q, dir, status, span, page])

  useEffect(() => {
    void load()
  }, [load])

  const items = data?.items ?? []
  const pages = data?.pages ?? 1

  return (
    <section className="mt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-ink">
            <Untranslated>{ot('wallet.history.title')}</Untranslated>
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            <Untranslated>{ot('wallet.history.hint')}</Untranslated>
          </p>
        </div>

        {/* ★ ยอดรวมของ "ชุดที่กรองอยู่" ไม่ใช่ของหน้าที่เปิด — ไม่งั้นมันตอบอะไรไม่ได้ */}
        {data ? (
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className="rounded-full bg-money-out-soft px-2.5 py-1 font-semibold text-money-out tabular-nums">
              <Untranslated>{ot('wallet.history.sumOut')}</Untranslated> ฿{formatBaht(locale, data.paidOut)}
            </span>
            <span className="rounded-full bg-money-in-soft px-2.5 py-1 font-semibold text-money-in tabular-nums">
              <Untranslated>{ot('wallet.history.sumIn')}</Untranslated> ฿{formatBaht(locale, data.gotIn)}
            </span>
          </div>
        ) : null}
      </header>

      {/* ── ค้นหา + ตัวกรอง ─────────────────────────────────────── */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={ot('wallet.history.search')}
            aria-label={ot('wallet.history.search')}
            className="h-11 w-full rounded-full border border-line bg-page ps-10 pe-10 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
          />
          {typed ? (
            <button
              type="button"
              onClick={() => setTyped('')}
              aria-label={ot('common.cancel')}
              className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-faint hover:bg-surface hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </div>

        <Seg
          value={dir}
          onChange={(v) => {
            setDir(v)
            setPage(0)
          }}
          options={[
            ['all', ot('wallet.history.dirAll')],
            ['out', ot('wallet.history.dirOut')],
            ['in', ot('wallet.history.dirIn')],
          ]}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {([['all', ot('wallet.history.stAll')], ['settled', ot('wallet.history.stSettled')], ['pending', ot('wallet.history.stPending')], ['cancelled', ot('wallet.history.stCancelled')]] as [Status, string][]).map(
          ([v, label]) => (
            <Chip key={v} on={status === v} onClick={() => { setStatus(v); setPage(0) }}>
              {label}
            </Chip>
          ),
        )}
        <span aria-hidden="true" className="mx-1 w-px self-stretch bg-line" />
        {([['all', ot('wallet.history.spanAll')], ['30', ot('wallet.history.span30')], ['90', ot('wallet.history.span90')], ['365', ot('wallet.history.span365')]] as [Span, string][]).map(
          ([v, label]) => (
            <Chip key={v} on={span === v} onClick={() => { setSpan(v); setPage(0) }}>
              {label}
            </Chip>
          ),
        )}
      </div>

      {/* ── รายการ ──────────────────────────────────────────────── */}
      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <ul className="mt-3 grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-[4.5rem] animate-pulse rounded-2xl bg-surface" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">
          <Untranslated>{q ? ot('wallet.history.noMatch', { q }) : ot('wallet.history.empty')}</Untranslated>
        </p>
      ) : (
        <ul className={cn('mt-3 grid gap-2 lg:grid-cols-2', loading && 'opacity-60')}>
          {items.map((it) => (
            <li key={it.id}>
              <Row item={it} locale={locale} onOpen={() => setOpen(it)} />
            </li>
          ))}
        </ul>
      )}

      {/* ── แบ่งหน้า ─────────────────────────────────────────────── */}
      {pages > 1 ? (
        <nav className="mt-4 flex flex-wrap items-center justify-center gap-1.5" aria-label={ot('wallet.history.title')}>
          <PageBtn disabled={page === 0} onClick={() => setPage((p) => p - 1)} label={ot('common.prev')} dir="prev" />
          {pageNumbers(page, pages).map((n, i) =>
            n === -1 ? (
              <span key={`gap${i}`} className="px-1 text-ink-faint">
                ⋯
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                aria-current={n === page}
                className={cn(
                  'min-h-9 min-w-9 rounded-lg px-2 text-sm tabular-nums transition-colors',
                  n === page ? 'bg-ink font-bold text-page' : 'text-ink-soft hover:bg-surface hover:text-ink',
                )}
              >
                {n + 1}
              </button>
            ),
          )}
          <PageBtn disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} label={ot('common.next')} dir="next" />
        </nav>
      ) : null}

      {data && data.total > 0 ? (
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          <Untranslated>{ot('wallet.history.count', { n: data.total })}</Untranslated>
        </p>
      ) : null}

      {open ? (
        <DebtDetailSheet
          debt={{
            id: open.id,
            amount: open.amount,
            description: open.billTitle || open.description,
            createdAt: open.createdAt,
            paidAt: open.paidAt,
            hasSlip: open.hasSlip,
            otherName: open.otherName,
            otherAvatar: open.otherAvatar,
            isSettlement: open.isSettlement,
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */

function Row({ item, locale, onOpen }: { item: Item; locale: string; onOpen: () => void }) {
  const ot = useOt()
  const out = item.direction === 'out'
  const date = new Date(item.paidAt ?? item.createdAt)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl border border-line bg-elevated/50 px-3.5 py-3 text-start backdrop-blur-md transition-colors hover:border-line-strong hover:bg-surface"
    >
      <ChatAvatar name={item.otherName} url={item.otherAvatar} size={40} />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {/*
            * ★★ ลูกศรบอกทิศก่อนชื่อ — กวาดตาแล้วรู้ทันทีว่า "จ่ายออก" หรือ "รับเข้า"
            *    ★ สีอย่างเดียวไม่พอสำหรับคนตาบอดสี รูปร่างจึงต้องต่างด้วย
            */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-3.5 shrink-0', out ? 'text-money-out' : 'text-money-in')} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={out ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'} />
          </svg>
          <span dir="auto" className="truncate text-sm font-semibold text-ink">
            {item.otherName}
          </span>
          {item.hasSlip ? (
            <span
              title={ot('wallet.owed.detailSlip')}
              className="shrink-0 rounded-full bg-link/15 px-1.5 py-0.5 text-[10px] font-bold text-link"
            >
              <Untranslated>{ot('wallet.history.slipTag')}</Untranslated>
            </span>
          ) : null}
        </span>

        <span dir="auto" className="mt-0.5 block truncate text-xs text-ink-soft">
          {item.billTitle || item.description || ot('wallet.history.noNote')}
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span className="tabular-nums">{date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <StatusTag status={item.status} />
        </span>
      </span>

      <span className={cn('shrink-0 text-base font-black tabular-nums', out ? 'text-money-out' : 'text-money-in')}>
        {out ? '−' : '+'}฿{formatBaht(locale, item.amount)}
      </span>
    </button>
  )
}

function StatusTag({ status }: { status: Item['status'] }) {
  const ot = useOt()
  const map = {
    SETTLED: ['wallet.history.stSettled', 'text-money-in'],
    PAID_PENDING: ['wallet.history.tagWaiting', 'text-warn'],
    PENDING: ['wallet.history.tagOpen', 'text-ink-faint'],
    CANCELLED: ['wallet.history.stCancelled', 'text-ink-faint'],
  } as const
  const [key, tone] = map[status]
  return (
    <span className={cn('font-medium', tone)}>
      · <Untranslated>{ot(key)}</Untranslated>
    </span>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'min-h-9 rounded-full px-3 text-xs transition-colors',
        on ? 'bg-ink font-semibold text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      <Untranslated>{children}</Untranslated>
    </button>
  )
}

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 rounded-full bg-surface p-1 sm:w-auto">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            'min-h-9 whitespace-nowrap rounded-full px-3 text-xs transition-colors',
            value === v ? 'bg-elevated font-bold text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          <Untranslated>{label}</Untranslated>
        </button>
      ))}
    </div>
  )
}

function PageBtn({ disabled, onClick, label, dir }: { disabled: boolean; onClick: () => void; label: string; dir: 'prev' | 'next' }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
}

/**
 * เลขหน้าที่จะแสดง — ย่อด้วย ⋯ เมื่อหน้าเยอะ
 *
 * ★ แสดงหน้าแรก หน้าสุดท้าย และเพื่อนบ้านของหน้าปัจจุบันเสมอ
 *   ★★ ปุ่มสามสิบปุ่มเรียงกันคือแถบที่กดยากกว่าพิมพ์เลขหน้าเอง
 */
function pageNumbers(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i)
  const out = new Set([0, pages - 1, page, page - 1, page + 1])
  const sorted = [...out].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b)
  const withGaps: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) withGaps.push(-1)
    withGaps.push(sorted[i]!)
  }
  return withGaps
}
