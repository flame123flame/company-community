'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { formatBaht } from '@/lib/office/wallet'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { CountUp } from '@/components/ui/CountUp'
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

type Person = { id: string; name: string; avatarUrl: string | null; out: number; in: number; times: number }

type Payload = {
  page: number
  size: number
  total: number
  pages: number
  paidOut: number
  gotIn: number
  people: Person[]
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
      <header className="min-w-0">
        <h2 className="text-lg font-black tracking-tight text-ink">
          <Untranslated>{ot('wallet.history.title')}</Untranslated>
        </h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          <Untranslated>{ot('wallet.history.hint')}</Untranslated>
        </p>
      </header>

      {/*
        * ══ แถบสรุปของชุดที่กรองอยู่ ═══════════════════════════════
        *
        * ★★★ ของเดิมเป็นเม็ดยาเล็กสองเม็ดมุมขวาบน
        *     ★ มันคือตัวเลขที่ตอบคำถามใหญ่ที่สุดของทั้งเซกชัน
        *       ("ปีนี้จ่ายให้คนนี้ไปเท่าไร") แต่ถูกวางเป็นของประดับ
        *       ★★ ตัวเลขสำคัญที่สุดต้องเป็นของที่ใหญ่ที่สุด
        *
        * ★★ มีช่องที่สาม "สุทธิ" ที่ของเดิมไม่มี
        *    ★ สองยอดแยกกันยังต้องลบในหัวเอง ★★ ซึ่งเป็นงานที่ระบบทำแทนได้
        *      และเป็นตัวเลขที่คนอยากรู้จริงเวลาเทียบกับใครสักคน
        */}
      <div className="mt-3 overflow-hidden rounded-[22px] border border-line bg-elevated/60 backdrop-blur-md">
        <div className="grid grid-cols-3 divide-x divide-line rtl:divide-x-reverse">
          <Stat label={ot('wallet.history.sumOut')} value={data?.paidOut ?? 0} tone="out" locale={locale} />
          <Stat label={ot('wallet.history.sumIn')} value={data?.gotIn ?? 0} tone="in" locale={locale} />
          <Stat
            label={ot('wallet.history.net')}
            value={(data?.gotIn ?? 0) - (data?.paidOut ?? 0)}
            tone="net"
            locale={locale}
          />
        </div>

        {/*
          * ★ แถบสัดส่วน — เห็นทันทีว่าฝั่งไหนหนักกว่าโดยไม่ต้องเทียบตัวเลข
          *   ★★ ไม่ขึ้นเลยถ้าทั้งสองฝั่งเป็นศูนย์ ★ แถบว่างเปล่าคือของที่
          *      กินที่โดยไม่บอกอะไร
          */}
        {data && data.paidOut + data.gotIn > 0 ? (
          <div className="mx-3 mb-3 flex h-1.5 overflow-hidden rounded-full bg-surface">
            <span
              className="bg-money-out-solid transition-[width] duration-700"
              style={{ width: `${(data.paidOut / (data.paidOut + data.gotIn)) * 100}%` }}
            />
            <span className="flex-1 bg-money-in-solid" />
          </div>
        ) : null}
      </div>

      {/*
        * ══ เงินของคุณกับแต่ละคน ═══════════════════════════════════
        *
        * ★★★ ตอบคำถาม "ปีนี้จ่ายให้คนนี้ไปเท่าไร" ที่หน้าสรุปเดิมตอบไม่ได้
        *     ★ ของเดิมมีแค่ "กินกับใครบ่อย" ซึ่งนับครั้ง ไม่ใช่นับเงิน
        *       ★★ คนที่เจอกันสิบครั้งครั้งละยี่สิบบาท ไม่ได้สำคัญเท่าคนที่
        *          เจอครั้งเดียวแต่เป็นเงินสองพัน — และนี่คือหน้าเรื่องเงิน
        *
        * ★★ กดแล้วกรองประวัติให้เลย ไม่ใช่แค่โชว์ตัวเลข
        *    ★ ตัวเลขที่กดไม่ได้ทำให้ต้องไปพิมพ์ชื่อในช่องค้นหาเอง
        *      ★★ ซึ่งเป็นงานที่ระบบเพิ่งบอกคำตอบไปแล้วเมื่อสองวินาทีก่อน
        */}
      {(data?.people.length ?? 0) > 1 ? (
        <div className="scrollbar-none -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {data!.people.map((p) => {
            const on = typed === p.name
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setTyped(on ? '' : p.name)}
                aria-pressed={on}
                className={cn(
                  'hist-row flex w-[9.5rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-3 py-3',
                  on ? 'border-accent/50 bg-accent/10' : 'border-line bg-elevated/50',
                )}
              >
                <ChatAvatar name={p.name} url={p.avatarUrl} size={38} />
                <span dir="auto" className="w-full truncate text-center text-[12.5px] font-semibold text-ink">
                  {p.name}
                </span>
                <span className="flex w-full items-baseline justify-center gap-1.5 text-[11px] tabular-nums">
                  {p.out > 0 ? <span className="font-bold text-money-out">−{formatBaht(locale, p.out)}</span> : null}
                  {p.in > 0 ? <span className="font-bold text-money-in">+{formatBaht(locale, p.in)}</span> : null}
                  {p.out === 0 && p.in === 0 ? <span className="text-ink-faint">—</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

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
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-[22px] border border-dashed border-line px-4 py-12 text-center">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface text-ink-faint">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <p className="mt-3 text-sm text-ink-faint">
            <Untranslated>{q ? ot('wallet.history.noMatch', { q }) : ot('wallet.history.empty')}</Untranslated>
          </p>
        </div>
      ) : (
        /*
         * ★★★ จัดกลุ่มตามเดือน พร้อมหัวข้อที่เกาะบนสุดตอนเลื่อน
         *
         *     ★ ประวัติคือของที่คนอ่านด้วยคำถาม "ช่วงนั้นจ่ายอะไรบ้าง"
         *       ★★ กองเรียงกันรวดโดยไม่มีหัวข้อเดือน แปลว่าต้องอ่านวันที่
         *          ของทุกแถวเองเพื่อรู้ว่าข้ามเดือนตรงไหน
         *     ★ หัวข้อบอกยอดรวมของเดือนนั้นด้วย — ตัวเลขที่ลิสต์ไม่เคยบอก
         */
        <div className={cn('mt-3 space-y-5', loading && 'opacity-60')}>
          {groupByMonth(items, locale).map((g) => (
            <section key={g.key}>
              <h3 className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between gap-3 bg-page/85 px-1 py-1.5 backdrop-blur">
                <span className="text-[12px] font-black uppercase tracking-wide text-ink-soft">{g.label}</span>
                {/* ★ นับเฉพาะเดือนนี้ ไม่ใช่ "ทั้งหมด" — คำว่าทั้งหมดอยู่ท้ายลิสต์แล้ว */}
                <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                  <Untranslated>{ot('wallet.history.countShort', { n: g.items.length })}</Untranslated>
                </span>
              </h3>
              <ul className="sys-stagger mt-1.5 grid gap-2 lg:grid-cols-2">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <Row item={it} locale={locale} onOpen={() => setOpen(it)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
            /* ★ ส่งทิศทางกับสถานะไปด้วย — แผ่นจะได้ไม่ต้องเดาและไม่ขัดกับลิสต์ */
            direction: open.direction,
            status: open.status,
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
  const dead = item.status === 'CANCELLED'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'hist-row group relative flex min-h-20 w-full items-center gap-3 overflow-hidden rounded-2xl',
        'border border-line bg-elevated/55 py-3 pe-3.5 ps-4 text-start backdrop-blur-md',
      )}
    >
      {/* ★ แถบสีที่ขอบซ้าย — บอกทิศทางตั้งแต่ก่อนตาไปถึงตัวเลข */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-0 start-0 top-0 w-1',
          dead ? 'bg-line-strong' : out ? 'bg-money-out-solid' : 'bg-money-in-solid',
        )}
      />

      <span className="relative shrink-0">
        <ChatAvatar name={item.otherName} url={item.otherAvatar} size={42} />
        <span
          aria-hidden="true"
          className={cn(
            'absolute -bottom-0.5 -end-0.5 grid size-[18px] place-items-center rounded-full ring-2 ring-elevated',
            dead ? 'bg-line-strong' : out ? 'bg-money-out-solid' : 'bg-money-in-solid',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d={out ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'} />
          </svg>
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span dir="auto" className="truncate text-[14.5px] font-bold text-ink">
            {item.otherName}
          </span>
          {item.hasSlip ? (
            <span
              title={ot('wallet.owed.detailSlip')}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-link/15 px-1.5 py-0.5 text-[10px] font-bold text-link"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M4 7h16v12H4zM8 4h8M8 11h8M8 15h5" />
              </svg>
              <Untranslated>{ot('wallet.history.slipTag')}</Untranslated>
            </span>
          ) : null}
        </span>

        <span dir="auto" className="mt-0.5 block truncate text-[12.5px] text-ink-soft">
          {item.billTitle || item.description || ot('wallet.history.noNote')}
        </span>

        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span className="tabular-nums">
            {date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </span>
          <StatusTag status={item.status} />
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            'text-[17px] font-black leading-none tabular-nums',
            dead ? 'text-ink-faint line-through' : out ? 'text-money-out' : 'text-money-in',
          )}
        >
          {out ? '−' : '+'}฿{formatBaht(locale, item.amount)}
        </span>
        {/* ★ ลูกศรโผล่ตอนชี้ — บอกว่าแถวนี้กดเข้าไปดูต่อได้ */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}

/** ช่องตัวเลขในแถบสรุป */
function Stat({
  label,
  value,
  tone,
  locale,
}: {
  label: string
  value: number
  tone: 'out' | 'in' | 'net'
  locale: string
}) {
  /* ★ สุทธิใช้สีตามเครื่องหมายของตัวเอง — ติดลบคือจ่ายออกมากกว่า */
  const colour =
    tone === 'out' ? 'text-money-out' : tone === 'in' ? 'text-money-in' : value < 0 ? 'text-money-out' : 'text-money-in'
  const sign = tone === 'net' ? (value < 0 ? '−' : '+') : ''

  return (
    <div className="px-3 py-3 text-center sm:px-4 sm:py-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
        <Untranslated>{label}</Untranslated>
      </p>
      <p className={cn('mt-1 text-[clamp(1.05rem,3.4vw,1.5rem)] font-black leading-none tabular-nums', colour)}>
        {sign}
        <span className="text-[0.62em] align-top font-bold">฿</span>
        <CountUp value={Math.abs(value)} format={(n) => formatBaht(locale, n)} />
      </p>
    </div>
  )
}

/**
 * จัดกลุ่มตามเดือน โดยคงลำดับเดิมไว้
 *
 * ★ ข้อมูลเรียงจากใหม่ไปเก่ามาแล้วจาก server ★★ จึงไม่ต้องเรียงซ้ำ
 *   แค่ตัดกลุ่มตอนเดือนเปลี่ยน — เรียงซ้ำคือโอกาสที่ลำดับจะเพี้ยน
 */
function groupByMonth(items: Item[], locale: string) {
  const out: { key: string; label: string; items: Item[] }[] = []
  for (const it of items) {
    const d = new Date(it.paidAt ?? it.createdAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.items.push(it)
      continue
    }
    out.push({
      key,
      label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      items: [it],
    })
  }
  return out
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
