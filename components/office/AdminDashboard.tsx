'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { formatBaht } from '@/lib/office/wallet'

type Stats = {
  days: number
  people: {
    linked: number
    suspended: number
    admins: number
    codesTotal: number
    codesFree: number
    active: number
  }
  food: { restaurants: number; closed: number; votes: number; visits: number; top: { name: string; votes: number }[] }
  wallet: {
    bills: number
    billTotal: number
    debtsOpen: number
    debtsOpenSum: number
    debtsDone: number
    stale: number
  }
  fun: { nameSets: number; lottery: number; tournaments: number; matchesDone: number }
  market: {
    listings: number
    available: number
    sold: number
    hidden: number
    threads: number
    messages: number
    alerts: number
  }
  shared: {
    notifications: number
    unread: number
    reportsTotal: number
    reportedItems: number
    hiddenItems: number
  }
  daily: { day: string; n: number }[]
}

const RANGES = [7, 30, 90] as const

/** แดชบอร์ดการใช้งาน (FR-X10) */
export function AdminDashboard() {
  const ot = useOt()
  const locale = useLocale()
  const [days, setDays] = useState<number>(30)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: number) => {
    setError(null)
    try {
      const res = await apiFetch<{ stats: Stats }>(`/api/office/admin/stats?days=${d}`)
      setStats(res.stats)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="ms-auto flex gap-1.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'h-10 sm:h-8 rounded-full px-3 text-sm transition-colors',
                days === d ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft hover:bg-elevated',
              )}
            >
              {ot('dash.days', { n: d })}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!stats ? (
        <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          {/* ── ตัวเลขที่ต้องเห็นก่อน ─────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Big label={ot('dash.activeUsers')} value={stats.people.active} sub={ot('dash.ofLinked', { n: stats.people.linked })} />
            <Big label={ot('dash.debtsOpen')} value={formatBaht(locale, stats.wallet.debtsOpenSum)} sub={ot('dash.debtItems', { n: stats.wallet.debtsOpen })} tone={stats.wallet.stale > 0 ? 'warn' : undefined} />
            <Big label={ot('dash.listingsLive')} value={stats.market.available} sub={ot('dash.newInRange', { n: stats.market.listings })} />
            <Big label={ot('dash.reports')} value={stats.shared.reportedItems} sub={ot('dash.hiddenItems', { n: stats.shared.hiddenItems })} tone={stats.shared.hiddenItems > 0 ? 'warn' : undefined} />
          </div>

          {/* ── กราฟรายวัน ────────────────────────────────────── */}
          <Panel title={ot('dash.activity')}>
            <DailyChart data={stats.daily} days={stats.days} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={ot('dash.people')}>
              <Rows
                rows={[
                  [ot('dash.linked'), stats.people.linked],
                  [ot('dash.codesFree'), `${stats.people.codesFree} / ${stats.people.codesTotal}`],
                  [ot('dash.admins'), stats.people.admins],
                  [ot('dash.suspended'), stats.people.suspended],
                ]}
              />
            </Panel>

            <Panel title={ot('nav.food')}>
              <Rows
                rows={[
                  [ot('dash.restaurants'), stats.food.restaurants],
                  [ot('dash.maybeClosed'), stats.food.closed],
                  [ot('dash.votes'), stats.food.votes],
                  [ot('dash.visits'), stats.food.visits],
                ]}
              />
              {stats.food.top.length > 0 ? (
                <ol className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
                  {stats.food.top.map((t, i) => (
                    <li key={t.name} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-xs text-ink-faint">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate text-ink" dir="auto">{t.name}</span>
                      <span className="text-xs tabular-nums text-ink-soft">
                        {ot('dash.voteCount', { n: t.votes })}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Panel>

            <Panel title={ot('nav.wallet')}>
              <Rows
                rows={[
                  [ot('dash.bills'), stats.wallet.bills],
                  [ot('dash.billTotal'), formatBaht(locale, stats.wallet.billTotal)],
                  [ot('dash.debtsDone'), stats.wallet.debtsDone],
                  [ot('dash.stale'), stats.wallet.stale],
                ]}
              />
            </Panel>

            <Panel title={ot('nav.fun')}>
              <Rows
                rows={[
                  [ot('dash.nameSets'), stats.fun.nameSets],
                  [ot('dash.lottery'), stats.fun.lottery],
                  [ot('dash.tournaments'), stats.fun.tournaments],
                  [ot('dash.matches'), stats.fun.matchesDone],
                ]}
              />
            </Panel>

            <Panel title={ot('nav.market')}>
              <Rows
                rows={[
                  [ot('dash.sold'), stats.market.sold],
                  [ot('dash.threads'), stats.market.threads],
                  [ot('dash.messages'), stats.market.messages],
                  [ot('dash.alerts'), stats.market.alerts],
                ]}
              />
            </Panel>

            <Panel title={ot('dash.shared')}>
              <Rows
                rows={[
                  [ot('dash.notifications'), stats.shared.notifications],
                  [ot('dash.unread'), stats.shared.unread],
                  [ot('dash.reportsInRange'), stats.shared.reportsTotal],
                ]}
              />
            </Panel>
          </div>

          <p className="text-xs text-ink-faint">{ot('dash.privacy')}</p>
        </div>
      )}
    </div>
  )
}

function Big({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'warn'
}) {
  return (
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'warn' ? 'text-warn' : 'text-ink')}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-ink-faint">{sub}</p> : null}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Rows({ rows }: { rows: [string, string | number][] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <dt className="min-w-0 flex-1 truncate text-ink-soft">{k}</dt>
          <dd className="tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * กราฟแท่งรายวัน
 *
 * ★ เติมวันที่ไม่มีข้อมูลเป็น 0 เอง — SQL คืนเฉพาะวันที่มีอีเวนต์
 *   ★★ ถ้าวาดตามที่ได้มาตรง ๆ วันที่เงียบจะหายไปจากกราฟ แล้วสัปดาห์ที่ใช้งาน
 *      วันเดียวจะดูเหมือนใช้ทุกวัน ซึ่งอ่านผิดความหมายทั้งหมด
 */
function DailyChart({ data, days }: { data: { day: string; n: number }[]; days: number }) {
  const ot = useOt()
  const map = new Map(data.map((d) => [d.day, d.n]))
  const today = new Date()
  const series: { day: string; n: number }[] = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    series.push({ day: key, n: map.get(key) ?? 0 })
  }

  const max = Math.max(1, ...series.map((s) => s.n))

  return (
    <div>
      <div className="flex h-24 items-end gap-px">
        {series.map((s) => (
          <div
            key={s.day}
            title={`${s.day} · ${s.n}`}
            className={cn(
              'min-w-0 flex-1 rounded-t-sm',
              /* ★ วันเงียบใช้สีเส้น ไม่ใช่สีเน้น — ไม่งั้นเส้นฐานจะดูเหมือน
                 มีกิจกรรมทุกวันเท่า ๆ กัน ซึ่งตรงข้ามกับความจริง */
              s.n === 0 ? 'bg-line' : 'bg-accent/70',
            )}
            /* ★ ขั้นต่ำ 3% เพื่อให้วันที่มี 1 อีเวนต์ยังสูงกว่าวันเงียบชัดเจน */
            style={{ height: s.n === 0 ? 2 : `${Math.max(3, (s.n / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
        <span>{series[0]?.day}</span>
        <span>{ot('dash.peak', { n: max })}</span>
        <span>{series.at(-1)?.day}</span>
      </div>
    </div>
  )
}
