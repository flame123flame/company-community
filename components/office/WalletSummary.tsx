'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { categoryLabel, formatBaht } from '@/lib/office/wallet'
import { prefersReducedMotion } from '@/lib/office/draw'
import type { ExpenseCategory } from '@/types/database'
import { SpendChart, type SpendItem } from './SpendChart'
import { ChatAvatar } from './ChatAvatar'

/*
 * ═══════════════════════════════════════════════════════════════════════
 * สรุปค่าข้าว — หน้า "ดูแล้วรู้เรื่องในสามวินาที"
 *
 * ★★★ ลำดับบนจอ = ลำดับคำถามที่คนมีในหัว
 *     1. เดือนนี้ใช้ไปเท่าไร · เกินงบไหม           → การ์ดหลัก + วงแหวนงบ
 *     2. มีอะไรน่าสังเกต                             → การ์ดข้อสังเกตที่คำนวณให้
 *     3. ใช้วันไหน · ไปกับอะไร · ที่ไหน · กับใคร     → กราฟ · ปฏิทิน · ประเภท · ร้าน · คน
 *     4. รายการจริงทีละบิล                           → ลิสต์ที่กรองได้จากทุกกราฟด้านบน
 *
 * ★★ สีทั้งหน้ามาจาก token ของธีม — ไม่มีค่าสีตายตัวแม้แต่จุดเดียว
 *    ★ ข้อมูลเป็น "ขนาด" ล้วน (ไม่มีหลายซีรีส์) จึงใช้สีเดียว (accent)
 *      ไล่ความเข้มด้วย color-mix ★★ ไม่ต้องคิดชุดสีหลายสีที่ระบบไม่มีให้
 * ═══════════════════════════════════════════════════════════════════════
 */

type Summary = {
  items: SpendItem[]
  total: number
  myShare: number
  myShareOthers: number
  prevTotal: number | null
  monthlyBudget: number | null
  topPeople: { id: string; name: string; avatarUrl: string | null; times: number }[]
}

type Filter = { kind: 'all' } | { kind: 'category'; value: string } | { kind: 'day'; value: string } | { kind: 'month'; value: string }

const CATEGORY_ICON: Record<string, string> = {
  FOOD: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
  COFFEE: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M11 3v2M14 3v2',
  OTHER: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function WalletSummary() {
  const ot = useOt()
  const locale = useLocale()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })

  const range = useMemo(() => {
    const y = anchor.getFullYear()
    const m = anchor.getMonth()
    return mode === 'month'
      ? { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
      : { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) }
  }, [anchor, mode])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiFetch<Summary>(`/api/office/wallet/summary?from=${range.from}&to=${range.to}`))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo(() => data?.items ?? [], [data])

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) m.set(i.category, (m.get(i.category) ?? 0) + Number(i.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const byShop = useMemo(() => {
    const m = new Map<string, { amount: number; times: number; id: string | null }>()
    for (const i of items) {
      /* ★ บิลที่ไม่ได้ระบุร้านยังต้องนับ ไม่งั้นผลรวมของตารางจะน้อยกว่ายอดรวม */
      const key = i.shop ?? ot('wallet.summary.noShop')
      const cur = m.get(key) ?? { amount: 0, times: 0, id: i.shopId }
      m.set(key, { amount: cur.amount + Number(i.amount), times: cur.times + 1, id: cur.id ?? i.shopId })
    }
    return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5)
  }, [items, ot])

  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) m.set(i.date, (m.get(i.date) ?? 0) + Number(i.amount))
    return m
  }, [items])

  const activeDays = byDay.size

  /* ★ เทียบช่วงก่อน — ไม่มีข้อมูลให้ซ่อนทั้งบรรทัด */
  const delta = useMemo(() => {
    if (!data?.prevTotal || data.prevTotal <= 0) return null
    const pct = Math.round(((data.total - data.prevTotal) / data.prevTotal) * 100)
    if (pct === 0) return null
    return { pct: Math.abs(pct), up: pct > 0 }
  }, [data])

  /* ── ข้อสังเกตอัตโนมัติ ───────────────────────────────────────── */
  const insights = useMemo(() => {
    if (items.length === 0) return []
    const out: { icon: string; label: string; value: string; detail: string }[] = []

    const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topDay) {
      out.push({
        icon: 'M13 2 4 14h7l-1 8 9-12h-7z',
        label: ot('summary.ins.peakDay'),
        value: `฿${formatBaht(locale, topDay[1])}`,
        detail: new Date(`${topDay[0]}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
      })
    }

    const topShop = byShop.find(([, v]) => v.id !== null)
    if (topShop) {
      out.push({
        icon: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z',
        label: ot('summary.ins.favShop'),
        value: topShop[0],
        detail: ot('wallet.summary.times', { n: topShop[1].times }),
      })
    }

    /* ★ วันในสัปดาห์ที่จ่ายมากสุด (รวมทั้งช่วง) — เห็นนิสัยของตัวเอง */
    if (byDay.size >= 3) {
      const wd = new Array(7).fill(0) as number[]
      for (const [d, v] of byDay) { const k = new Date(`${d}T00:00:00`).getDay(); wd[k] = (wd[k] ?? 0) + v }
      const best = wd.indexOf(Math.max(...wd))
      const name = new Date(2024, 0, 7 + best).toLocaleDateString(locale, { weekday: 'long' })
      out.push({
        icon: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 9h16M9 2v4M15 2v4',
        label: ot('summary.ins.spendyWeekday'),
        value: name,
        detail: `฿${formatBaht(locale, wd[best]!)}`,
      })
    }

    const priciest = [...items].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
    if (priciest) {
      out.push({
        icon: 'M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.8 7 7s2.6 2.8 5 3.3 5 1.3 5 3.7-2.2 3-5 3-5-.9-5-2.8',
        label: ot('summary.ins.priciest'),
        value: `฿${formatBaht(locale, Number(priciest.amount))}`,
        detail: priciest.shop ?? priciest.title,
      })
    }

    const topCat = byCategory[0]
    if (topCat && data && data.total > 0) {
      out.push({
        icon: CATEGORY_ICON[topCat[0]] ?? CATEGORY_ICON.OTHER!,
        label: ot('summary.ins.mainCategory'),
        value: categoryLabel(ot, topCat[0] as ExpenseCategory),
        detail: `${Math.round((topCat[1] / data.total) * 100)}%`,
      })
    }
    return out
  }, [items, byDay, byShop, byCategory, data, locale, ot])

  /* ── รายการที่กรองแล้ว (ลิสต์ล่างสุด) ─────────────────────────── */
  const filtered = useMemo(() => {
    const list = items.filter((i) =>
      filter.kind === 'all'
        ? true
        : filter.kind === 'category'
          ? i.category === filter.value
          : filter.kind === 'day'
            ? i.date === filter.value
            : i.date.startsWith(filter.value),
    )
    return [...list].sort((a, b) => (a.date === b.date ? Number(b.amount) - Number(a.amount) : b.date.localeCompare(a.date)))
  }, [items, filter])

  function shift(step: number) {
    setFilter({ kind: 'all' })
    setAnchor((d) =>
      mode === 'month' ? new Date(d.getFullYear(), d.getMonth() + step, 1) : new Date(d.getFullYear() + step, 0, 1),
    )
  }

  const now = new Date()
  const isCurrent =
    mode === 'month'
      ? anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
      : anchor.getFullYear() === now.getFullYear()

  function exportCsv() {
    if (!data) return
    const rows = [
      [ot('summary.csv.period'), ot('summary.csv.range', { from: range.from, to: range.to })],
      [],
      [ot('summary.csv.section'), ot('summary.csv.baht')],
      [ot('summary.csv.total'), data.total.toFixed(2)],
      [ot('summary.csv.myShare'), data.myShare.toFixed(2)],
      [ot('summary.csv.owedOut'), data.myShareOthers.toFixed(2)],
      [],
      [ot('summary.csv.category'), ot('summary.csv.baht')],
      ...byCategory.map(([k, v]) => [categoryLabel(ot, k as ExpenseCategory), v.toFixed(2)]),
      [],
      [ot('summary.csv.restaurant'), ot('summary.csv.baht'), ot('wallet.summary.times', { n: '' })],
      ...byShop.map(([name, v]) => [name, v.amount.toFixed(2), String(v.times)]),
      [],
      [
        ot('summary.csv.date'),
        ot('wallet.create.billTitle'),
        ot('wallet.create.category'),
        ot('wallet.create.shop'),
        ot('summary.csv.baht'),
        ot('wallet.create.delivery'),
        ot('wallet.create.discount'),
      ],
      /* ★ CSV ลงรายละเอียดทีละรายการ ไม่ใช่ยอดรวมรายวัน — ไฟล์ที่เอาไปทำต่อได้ */
      ...(data.items ?? []).map((i) => [
        i.date,
        i.title,
        categoryLabel(ot, i.category as ExpenseCategory),
        i.shop ?? '',
        Number(i.amount).toFixed(2),
        Number(i.deliveryFee ?? 0).toFixed(2),
        Number(i.discount ?? 0).toFixed(2),
      ]),
    ]
    /* ★ ใส่เครื่องหมายคำพูดรอบค่าที่มีคอมมา ไม่งั้นคอลัมน์เลื่อน */
    const csv = rows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ot('summary.csv.filename')}-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ★ ตามภาษาของคนอ่าน — ไม่ตรึง th-TH (คนนอกไทยจะอ่าน พ.ศ. ผิดไป 543 ปี) */
  const label =
    mode === 'month'
      ? anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
      : anchor.toLocaleDateString(locale, { year: 'numeric' })

  const empty = !loading && (!data || data.total === 0)

  return (
    <div className="flex w-full flex-col gap-4 pb-6">
      {/* ── แถบควบคุมช่วงเวลา ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={ot('wallet.summary.title')} className="flex rounded-full bg-surface p-1">
          {(['month', 'year'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m)
                setFilter({ kind: 'all' })
              }}
              className={cn(
                'h-9 rounded-full px-4 text-[13px] font-medium transition-all',
                mode === m ? 'bg-page text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
              )}
            >
              {ot(m === 'month' ? 'wallet.summary.month' : 'wallet.summary.year')}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-full border border-line bg-elevated/60 backdrop-blur-md">
          <NavButton label={ot('summary.prev')} onClick={() => shift(-1)} dir="prev" />
          <span className="min-w-28 text-center text-sm font-semibold text-ink sm:min-w-36">{label}</span>
          <NavButton label={ot('summary.next')} onClick={() => shift(1)} dir="next" />
        </div>

        {!isCurrent ? (
          <button
            type="button"
            onClick={() => {
              setFilter({ kind: 'all' })
              setAnchor(new Date())
            }}
            className="h-11 rounded-full px-3 text-[13px] text-link hover:underline sm:h-9"
          >
            <Untranslated>{ot(mode === 'month' ? 'summary.thisMonth' : 'summary.thisYear')}</Untranslated>
          </button>
        ) : null}

        <button
          type="button"
          onClick={exportCsv}
          disabled={!data || data.total === 0}
          className="ms-auto inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-elevated/60 px-4 text-[13px] text-ink backdrop-blur-md transition-colors hover:bg-surface disabled:opacity-40 sm:h-9"
        >
          <Icon d="M12 4v11M7 10l5 5 5-5M5 20h14" className="size-4" />
          {ot('wallet.summary.export')}
        </button>
      </div>

      {loading ? (
        <SummarySkeleton />
      ) : empty ? (
        <div>
          <EmptyState
            icon={'M4 19V9m5 10V5m5 14v-7m5 7V8'}
            title={ot(mode === 'month' ? 'wallet.summary.noMonth' : 'wallet.summary.noYear')}
            description={ot('wallet.summary.emptyHint')}
          />
          <div className="mt-3 flex justify-center">
            <Link
              href="/office/wallet/create"
              className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              <Untranslated>{ot('wallet.summary.createBill')}</Untranslated>
            </Link>
          </div>
        </div>
      ) : data ? (
        <>
          {/* ── การ์ดหลัก: ยอดรวม + วงแหวนงบ ───────────────────────── */}
          <Hero
            data={data}
            delta={delta}
            activeDays={activeDays}
            count={items.length}
            mode={mode}
            isCurrent={isCurrent}
            anchor={anchor}
            onBudgetSaved={() => void load()}
          />

          {/* ── ข้อสังเกต ─────────────────────────────────────────── */}
          {insights.length > 0 ? (
            <section aria-label={ot('summary.ins.title')}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" className="size-4 text-accent" />
                <Untranslated>{ot('summary.ins.title')}</Untranslated>
              </h2>
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
                {insights.map((ins, i) => (
                  <div
                    key={ins.label}
                    className="summary-rise min-w-[44%] shrink-0 snap-start rounded-2xl border border-line bg-elevated/60 p-3.5 backdrop-blur-md sm:min-w-0"
                    style={{ '--rise-delay': `${80 + i * 60}ms` } as CSSProperties}
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent">
                      <Icon d={ins.icon} className="size-4" />
                    </span>
                    <p className="mt-2.5 text-[11.5px] text-ink-soft">
                      <Untranslated>{ins.label}</Untranslated>
                    </p>
                    <p dir="auto" className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-ink">
                      {ins.value}
                    </p>
                    <p dir="auto" className="truncate text-[11.5px] text-ink-soft">
                      {ins.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── กราฟรายวัน/รายเดือน ───────────────────────────────── */}
          {/* ★ SpendChart มีกรอบและหัวข้อของตัวเอง (แตะแท่งดูรายการ) — ไม่ห่อการ์ดซ้อน */}
          <div className="summary-rise min-w-0">
            <SpendChart items={items} mode={mode} anchor={anchor} locale={locale} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── ปฏิทินความร้อน ─────────────────────────────────── */}
            <Card
              title={ot(mode === 'month' ? 'summary.calendar' : 'summary.monthsGrid')}
              icon="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 9h16M9 2v4M15 2v4"
              untranslated
            >
              {mode === 'month' ? (
                <MonthHeat
                  anchor={anchor}
                  byDay={byDay}
                  selected={filter.kind === 'day' ? filter.value : null}
                  onPick={(d) => setFilter((f) => (f.kind === 'day' && f.value === d ? { kind: 'all' } : { kind: 'day', value: d }))}
                />
              ) : (
                <YearHeat
                  anchor={anchor}
                  items={items}
                  selected={filter.kind === 'month' ? filter.value : null}
                  onPick={(m) => setFilter((f) => (f.kind === 'month' && f.value === m ? { kind: 'all' } : { kind: 'month', value: m }))}
                />
              )}
            </Card>

            {/* ── แยกตามประเภท ───────────────────────────────────── */}
            <Card title={ot('wallet.summary.byCategory')} icon="M12 3a9 9 0 1 0 9 9h-9z M14 2.5A9 9 0 0 1 21.5 10H14z">
              <ul className="flex flex-col gap-1">
                {byCategory.map(([k, v]) => {
                  const pct = data.total > 0 ? (v / data.total) * 100 : 0
                  const on = filter.kind === 'category' && filter.value === k
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setFilter(on ? { kind: 'all' } : { kind: 'category', value: k })}
                        className={cn(
                          'flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-start transition-colors',
                          on ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : 'hover:bg-surface',
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink">
                          <Icon d={CATEGORY_ICON[k] ?? CATEGORY_ICON.OTHER!} className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-ink">{categoryLabel(ot, k as ExpenseCategory)}</span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">฿{formatBaht(locale, v)}</span>
                          </span>
                          <span className="mt-1.5 flex items-center gap-2">
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                              <span className="summary-grow block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="w-9 shrink-0 text-end text-[11.5px] tabular-nums text-ink-soft">{Math.round(pct)}%</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── ร้านที่จ่ายมากสุด ───────────────────────────────── */}
            <Card title={ot('wallet.summary.byRestaurant')} icon="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M10 17h4l1 3H9z">
              <ol className="flex flex-col gap-1">
                {byShop.map(([name, v], i) => {
                  const pct = byShop[0] ? (v.amount / byShop[0][1].amount) * 100 : 0
                  const body = (
                    <>
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums',
                          i === 0 ? 'bg-accent text-accent-ink' : i < 3 ? 'bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-accent' : 'bg-surface text-ink-soft',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span dir="auto" className={cn('truncate text-sm font-medium', v.id ? 'text-ink' : 'text-ink-soft')}>
                            {name}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">฿{formatBaht(locale, v.amount)}</span>
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                            <span className="summary-grow block h-full rounded-full bg-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-surface))]" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="shrink-0 text-[11.5px] text-ink-soft">
                            <Untranslated>{ot('wallet.summary.times', { n: v.times })}</Untranslated>
                          </span>
                        </span>
                      </span>
                    </>
                  )
                  return (
                    <li key={name}>
                      {v.id ? (
                        <Link href={`/office/food/picks/${v.id}`} className="flex min-h-14 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-surface">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex min-h-14 items-center gap-3 px-2">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </Card>

            {/* ── กินด้วยบ่อยสุด + สัดส่วนจ่ายเอง/จ่ายร่วม ──────────── */}
            <Card title={ot('wallet.summary.withWhom')} icon="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6" untranslated>
              {data.topPeople.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-soft">
                  <Untranslated>{ot('wallet.summary.noPeople')}</Untranslated>
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-2 gap-y-3">
                  {data.topPeople.map((p, i) => (
                    <span key={p.id} className="flex w-[4.5rem] flex-col items-center gap-1">
                      <span className={cn('relative rounded-full p-0.5', i === 0 && 'bg-accent')}>
                        <span className="block rounded-full bg-page p-0.5">
                          <ChatAvatar name={p.name} url={p.avatarUrl} size={48} />
                        </span>
                        {i === 0 ? (
                          <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-accent-ink" aria-hidden="true">
                            <Icon d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" className="size-3" fill />
                          </span>
                        ) : null}
                      </span>
                      <span dir="auto" className="w-full truncate text-center text-xs font-medium text-ink">
                        {p.name}
                      </span>
                      <span className="text-[11px] text-ink-soft">
                        <Untranslated>{ot('wallet.summary.times', { n: p.times })}</Untranslated>
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* ★ จ่ายเอง vs ส่วนในบิลคนอื่น — แถบเดียวสองส่วน (ขนาดล้วน ไม่ใช่ซีรีส์) */}
              <div className="mt-4 border-t border-line pt-3">
                <SplitBar mine={data.myShare} others={data.myShareOthers} />
              </div>
            </Card>
          </div>

          {/* ── รายการทั้งหมด ─────────────────────────────────────── */}
          <Transactions items={filtered} filter={filter} onClear={() => setFilter({ kind: 'all' })} />

          <p className="text-center text-[11.5px] leading-relaxed text-ink-soft">{ot('wallet.summary.explain')}</p>
        </>
      ) : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * การ์ดหลัก
 * ═══════════════════════════════════════════════════════════════════ */

function Hero({
  data,
  delta,
  activeDays,
  count,
  mode,
  isCurrent,
  anchor,
  onBudgetSaved,
}: {
  data: Summary
  delta: { pct: number; up: boolean } | null
  activeDays: number
  count: number
  mode: 'month' | 'year'
  isCurrent: boolean
  anchor: Date
  onBudgetSaved: () => void
}) {
  const ot = useOt()
  const locale = useLocale()
  const shown = useCountUp(data.total)

  return (
    <section className="summary-hero relative isolate overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-line))] p-5 sm:p-7">
      {/* ★ แสงสีประจำโมดูล — ผสมจาก accent ของธีม ไม่มีค่าสีตายตัว */}
      <span aria-hidden="true" className="summary-hero-glow pointer-events-none absolute inset-0 -z-10" />

      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-soft">{ot('wallet.summary.total')}</p>
          <p className="mt-1 text-[clamp(2.5rem,9vw,3.75rem)] font-black leading-none tracking-tight text-ink tabular-nums">
            <span className="text-[0.55em] align-top font-bold text-accent">฿</span>
            {formatBaht(locale, shown)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {delta ? (
              <span
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold',
                  delta.up ? 'bg-[color-mix(in_srgb,var(--color-warn)_16%,transparent)] text-warn' : 'bg-surface text-ink',
                )}
              >
                <Untranslated>{ot('wallet.summary.vsPrev', { dir: delta.up ? '▲' : '▼', n: delta.pct })}</Untranslated>
              </span>
            ) : null}
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-6">
            <Mini label={ot('wallet.summary.avgPerDay')} value={activeDays > 0 ? `฿${formatBaht(locale, data.total / activeDays)}` : '—'} untranslated />
            <Mini label={ot('summary.bills')} value={String(count)} untranslated />
            <Mini label={ot('summary.activeDays')} value={String(activeDays)} untranslated />
          </dl>
        </div>

        {mode === 'month' ? (
          <BudgetRing budget={data.monthlyBudget} used={data.total} isCurrent={isCurrent} anchor={anchor} onSaved={onBudgetSaved} />
        ) : null}
      </div>
    </section>
  )
}

function Mini({ label, value, untranslated }: { label: string; value: string; untranslated?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] text-ink-soft">{untranslated ? <Untranslated>{label}</Untranslated> : label}</dt>
      <dd className="mt-0.5 truncate text-base font-bold tabular-nums text-ink sm:text-lg">{value}</dd>
    </div>
  )
}

/** ตัวเลขวิ่งขึ้นตอนเปิดหน้า/เปลี่ยนช่วง — ★ ปิดเองเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  useEffect(() => {
    if (prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setValue(target))
      return () => cancelAnimationFrame(id)
    }
    const start = performance.now()
    const from = 0
    const dur = 900
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setValue(from + (target - from) * eased)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

/* ═══════════════════════════════════════════════════════════════════
 * วงแหวนงบรายเดือน
 * ═══════════════════════════════════════════════════════════════════ */

function BudgetRing({
  budget,
  used,
  isCurrent,
  anchor,
  onSaved,
}: {
  budget: number | null
  used: number
  isCurrent: boolean
  anchor: Date
  onSaved: () => void
}) {
  const ot = useOt()
  const locale = useLocale()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(amount: number | null) {
    /* ★ null = ล้างงบ (ลบ) · ยังไม่เคยตั้ง = เพิ่ม · มีอยู่แล้ว = แก้ไข */
    const kind = amount === null ? 'delete' : budget === null ? 'create' : 'edit'
    const subject = amount === null ? ot('wallet.summary.budget') : `${ot('wallet.summary.budget')} ฿${formatBaht(locale, amount)}`
    if (!(await confirm({ kind, subject }))) return
    setBusy(true)
    try {
      await apiFetch('/api/office/profile', { method: 'POST', body: { action: 'budget', amount } })
      setEditing(false)
      onSaved()
    } catch {
      /* ★ ตั้งงบไม่สำเร็จไม่ควรทำให้หน้าสรุปทั้งหน้าพัง */
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="w-full rounded-2xl border border-line bg-page/70 p-4 backdrop-blur-md md:w-72">
        <p className="text-sm font-semibold text-ink">
          <Untranslated>{ot('wallet.summary.budget')}</Untranslated>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Input
            radius="round"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            autoFocus
            aria-label={ot('wallet.summary.budget')}
            className="min-w-0 flex-1"
          />
          <Button variant="primary" loading={busy} onClick={() => void save(Number(value) || 0)}>
            {ot('common.save')}
          </Button>
        </div>
        <div className="mt-1 flex justify-between">
          <button type="button" onClick={() => setEditing(false)} className="min-h-11 text-xs text-ink-soft hover:text-ink">
            {ot('common.cancel')}
          </button>
          {budget !== null ? (
            <button type="button" onClick={() => void save(null)} className="min-h-11 text-xs text-link hover:underline">
              <Untranslated>{ot('wallet.summary.budgetClear')}</Untranslated>
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (budget === null) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue('')
          setEditing(true)
        }}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-page/50 p-4 text-start backdrop-blur-md transition-colors hover:border-accent md:w-64"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent">
          <Icon d="M12 5v14M5 12h14" className="size-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">
            <Untranslated>{ot('wallet.summary.budgetSet')}</Untranslated>
          </span>
          <span className="block text-xs text-ink-soft">
            <Untranslated>{ot('summary.budgetPitch')}</Untranslated>
          </span>
        </span>
      </button>
    )
  }

  const ratio = budget > 0 ? used / budget : 1
  const over = used > budget
  const left = Math.max(0, budget - used)

  /* ★ ใช้ได้อีกวันละเท่าไร — เฉพาะเดือนปัจจุบัน (เดือนที่จบแล้วไม่มี "วันที่เหลือ") */
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const daysLeft = isCurrent ? lastDay - new Date().getDate() + 1 : 0
  const perDay = daysLeft > 0 ? left / daysLeft : null

  const R = 52
  const C = 2 * Math.PI * R
  const arc = Math.min(1, ratio)

  return (
    <div className="flex items-center gap-4 md:flex-col md:gap-2 md:text-center">
      <button
        type="button"
        onClick={() => {
          setValue(String(budget))
          setEditing(true)
        }}
        aria-label={`${ot('wallet.summary.budget')} · ${ot('wallet.summary.budgetEdit')}`}
        className="relative grid size-32 shrink-0 place-items-center rounded-full transition-transform hover:scale-[1.03] md:size-40"
      >
        <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-[color-mix(in_srgb,var(--color-ink)_10%,transparent)]" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - arc)}
            className={cn('summary-ring transition-[stroke-dashoffset] duration-1000', over ? 'stroke-danger' : ratio > 0.85 ? 'stroke-warn' : 'stroke-accent')}
          />
        </svg>
        <span className="relative">
          <span className={cn('block text-2xl font-black tabular-nums md:text-3xl', over ? 'text-danger' : 'text-ink')}>{Math.round(ratio * 100)}%</span>
          <span className="block text-[11px] text-ink-soft">
            <Untranslated>{ot('summary.ofBudget')}</Untranslated>
          </span>
        </span>
      </button>

      <div className="min-w-0 md:max-w-56">
        <p className="text-sm font-semibold text-ink">
          {over ? (
            <span className="text-danger">
              <Untranslated>{ot('wallet.summary.budgetOver', { amount: `฿${formatBaht(locale, used - budget)}` })}</Untranslated>
            </span>
          ) : (
            <Untranslated>{ot('summary.budgetLeft', { amount: `฿${formatBaht(locale, left)}` })}</Untranslated>
          )}
        </p>
        <p className="text-xs text-ink-soft">
          <Untranslated>{ot('wallet.summary.budgetOf', { used: `฿${formatBaht(locale, used)}`, total: `฿${formatBaht(locale, budget)}` })}</Untranslated>
        </p>
        {perDay !== null && !over ? (
          <p className="mt-1.5 inline-flex rounded-full bg-page/70 px-2.5 py-1 text-xs font-medium text-ink">
            <Untranslated>{ot('summary.perDayLeft', { amount: `฿${formatBaht(locale, perDay)}`, n: daysLeft })}</Untranslated>
          </p>
        ) : null}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * ปฏิทินความร้อน
 * ★ สีเดียว (accent) ไล่ความเข้ม 5 ระดับตามยอด — ตัวเลขอยู่ในช่องเสมอ สีไม่ใช่ทางเดียวที่บอกค่า
 * ═══════════════════════════════════════════════════════════════════ */

const HEAT = [12, 26, 42, 62, 85]

function heatStep(v: number, max: number): number {
  if (v <= 0 || max <= 0) return -1
  return Math.min(HEAT.length - 1, Math.floor((v / max) * HEAT.length - 1e-9))
}

function MonthHeat({
  anchor,
  byDay,
  selected,
  onPick,
}: {
  anchor: Date
  byDay: Map<string, number>
  selected: string | null
  onPick: (d: string) => void
}) {
  const ot = useOt()
  const locale = useLocale()
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const days = new Date(y, m + 1, 0).getDate()
  /* ★ สัปดาห์เริ่มวันจันทร์ — ปฏิทินงานของคนไทยส่วนใหญ่ */
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const max = Math.max(0, ...byDay.values())
  const today = iso(new Date())
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }))

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={ot('summary.calendar')}>
        {weekdays.map((w, i) => (
          <span key={i} className="pb-1 text-center text-[11px] font-medium text-ink-soft" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = iso(new Date(y, m, i + 1))
          const v = byDay.get(d) ?? 0
          const step = heatStep(v, max)
          const on = selected === d
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              aria-selected={on}
              disabled={v <= 0}
              onClick={() => onPick(d)}
              title={v > 0 ? `฿${formatBaht(locale, v)}` : undefined}
              aria-label={`${i + 1} · ${v > 0 ? `฿${formatBaht(locale, v)}` : '—'}`}
              className={cn(
                'relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-lg text-[12px] tabular-nums transition-transform',
                v > 0 ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                on && 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--color-elevated)]',
                d === today && !on && 'ring-1 ring-accent',
                step >= 3 ? 'font-semibold text-accent-ink' : 'text-ink',
              )}
              style={{
                background:
                  step >= 0
                    ? `color-mix(in srgb, var(--color-accent) ${HEAT[step]}%, var(--color-surface))`
                    : 'var(--color-surface)',
              }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <HeatLegend />
    </div>
  )
}

function YearHeat({
  anchor,
  items,
  selected,
  onPick,
}: {
  anchor: Date
  items: SpendItem[]
  selected: string | null
  onPick: (m: string) => void
}) {
  const locale = useLocale()
  const y = anchor.getFullYear()
  const totals = new Array(12).fill(0) as number[]
  for (const i of items) {
    const mm = Number(i.date.slice(5, 7)) - 1
    if (mm >= 0 && mm < 12) totals[mm] = totals[mm]! + Number(i.amount)
  }
  const max = Math.max(0, ...totals)

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {totals.map((v, mIdx) => {
          const key = `${y}-${String(mIdx + 1).padStart(2, '0')}`
          const step = heatStep(v, max)
          const on = selected === key
          return (
            <button
              key={key}
              type="button"
              disabled={v <= 0}
              aria-pressed={on}
              onClick={() => onPick(key)}
              className={cn(
                'flex min-h-16 flex-col items-start justify-between rounded-xl p-2.5 text-start transition-transform',
                v > 0 ? 'hover:scale-[1.03]' : 'cursor-default',
                on && 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--color-elevated)]',
                step >= 3 ? 'text-accent-ink' : 'text-ink',
              )}
              style={{
                background:
                  step >= 0 ? `color-mix(in srgb, var(--color-accent) ${HEAT[step]}%, var(--color-surface))` : 'var(--color-surface)',
              }}
            >
              <span className="text-xs font-semibold">{new Date(y, mIdx, 1).toLocaleDateString(locale, { month: 'short' })}</span>
              <span className="text-[12px] font-bold tabular-nums">{v > 0 ? `฿${formatBaht(locale, v).replace(/\.00$/, '')}` : '—'}</span>
            </button>
          )
        })}
      </div>
      <HeatLegend />
    </div>
  )
}

function HeatLegend() {
  const ot = useOt()
  return (
    <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-ink-soft">
      <Untranslated>{ot('summary.heatLess')}</Untranslated>
      {HEAT.map((h) => (
        <span key={h} className="size-3.5 rounded" style={{ background: `color-mix(in srgb, var(--color-accent) ${h}%, var(--color-surface))` }} aria-hidden="true" />
      ))}
      <Untranslated>{ot('summary.heatMore')}</Untranslated>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * จ่ายเอง vs ส่วนในบิลคนอื่น
 * ═══════════════════════════════════════════════════════════════════ */

function SplitBar({ mine, others }: { mine: number; others: number }) {
  const ot = useOt()
  const locale = useLocale()
  const total = mine + others
  if (total <= 0) return null
  const pct = (mine / total) * 100
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface">
        <span className="summary-grow block h-full bg-accent" style={{ width: `${pct}%` }} />
        {/* ★ ช่องว่าง 2px ระหว่างสองส่วน — แยกด้วยพื้นผิว ไม่ใช่ด้วยสีที่สอง */}
        <span className="block h-full w-0.5 bg-[var(--color-elevated)]" aria-hidden="true" />
        <span className="block h-full flex-1 bg-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-surface))]" />
      </div>
      <div className="mt-2 flex flex-col gap-1.5 text-xs sm:flex-row sm:justify-between sm:gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
          <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="min-w-0 truncate">{ot('wallet.summary.myShare')}</span>
          <b className="shrink-0 tabular-nums text-ink">฿{formatBaht(locale, mine)}</b>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-ink-soft sm:text-end">
          <span className="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-surface))]" aria-hidden="true" />
          <span className="min-w-0 truncate">
            <Untranslated>{ot('wallet.summary.myShareOthers')}</Untranslated>
          </span>
          <b className="shrink-0 tabular-nums text-ink">฿{formatBaht(locale, others)}</b>
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * รายการทั้งหมด — จัดกลุ่มตามวัน · กรองได้จากกราฟด้านบน
 * ═══════════════════════════════════════════════════════════════════ */

/** วาดทีละเท่านี้ — เลื่อนใกล้ท้ายรายการแล้ววาดชุดถัดไปเอง */
const PAGE = 20

function Transactions({ items, filter, onClear }: { items: SpendItem[]; filter: Filter; onClear: () => void }) {
  const ot = useOt()
  const locale = useLocale()
  const [limit, setLimit] = useState(PAGE)
  const [prevKey, setPrevKey] = useState('')
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  /* ★ เปลี่ยนตัวกรอง/ช่วงเวลา = กลับไปเริ่มที่ชุดแรกของรายการ */
  const key = `${JSON.stringify(filter)}:${items.length}`
  if (key !== prevKey) {
    setPrevKey(key)
    setLimit(PAGE)
  }

  /*
   * ★★ lazy load — วาดรายการทีละชุด ไม่วาดทั้งปีทีเดียว
   *    ★ จุดสังเกตท้ายรายการโผล่เข้าจอ (เผื่อล่วงหน้า 400px) → วาดชุดถัดไปเอง
   *      คนเลื่อนลงเรื่อย ๆ จึงไม่เคยเจอรายการขาดตอน
   *    ★ ปุ่ม "ดูเพิ่ม" ยังอยู่เป็นทางสำรอง (เบราว์เซอร์ที่ไม่มี IntersectionObserver)
   */
  const hasMore = items.length > limit
  useEffect(() => {
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE)
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [sentinel, hasMore])

  const shown = items.slice(0, limit)
  const groups: { date: string; rows: SpendItem[]; sum: number }[] = []
  for (const i of shown) {
    const g = groups[groups.length - 1]
    if (g && g.date === i.date) {
      g.rows.push(i)
      g.sum += Number(i.amount)
    } else groups.push({ date: i.date, rows: [i], sum: Number(i.amount) })
  }

  const filterLabel =
    filter.kind === 'category'
      ? categoryLabel(ot, filter.value as ExpenseCategory)
      : filter.kind === 'day'
        ? new Date(`${filter.value}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
        : filter.kind === 'month'
          ? new Date(`${filter.value}-01T00:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
          : null

  return (
    <Card
      title={ot('summary.transactions')}
      icon="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
      untranslated
      action={
        filterLabel ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] ps-3 pe-2 text-xs font-medium text-accent"
          >
            {filterLabel}
            <Icon d="M6 6l12 12M18 6 6 18" className="size-3.5" />
          </button>
        ) : (
          <span className="text-xs text-ink-soft">
            <Untranslated>{ot('summary.tapToFilter')}</Untranslated>
          </span>
        )
      }
    >
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">{ot('wallet.summary.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="mb-1 flex items-baseline justify-between px-1 text-xs">
                <span className="font-semibold text-ink-soft">
                  {new Date(`${g.date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="tabular-nums text-ink-soft">฿{formatBaht(locale, g.sum)}</span>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-page/40">
                {g.rows.map((i, idx) => (
                  <li key={`${i.title}-${idx}`} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink">
                      <Icon d={CATEGORY_ICON[i.category] ?? CATEGORY_ICON.OTHER!} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-sm font-medium text-ink">
                        {i.shop ?? i.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                        {i.shop && i.title && i.title !== i.shop ? (
                          <span dir="auto" className="truncate">
                            {i.title}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-medium',
                            i.mine ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent' : 'bg-surface text-ink-soft',
                          )}
                        >
                          <Untranslated>{ot(i.mine ? 'summary.paidByMe' : 'summary.myPart')}</Untranslated>
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">฿{formatBaht(locale, Number(i.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {hasMore ? (
            <div ref={setSentinel} className="flex justify-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="mx-auto inline-flex h-11 items-center rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover"
            >
              <Untranslated>{ot('summary.showMore', { n: items.length - limit })}</Untranslated>
            </button>
            </div>
          ) : items.length > PAGE ? (
            <p className="text-center text-xs text-ink-soft">
              <Untranslated>{ot('summary.allShown', { n: items.length })}</Untranslated>
            </p>
          ) : null}
        </div>
      )}
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * ชิ้นส่วนเล็ก
 * ═══════════════════════════════════════════════════════════════════ */

function Card({
  title,
  icon,
  children,
  action,
  untranslated,
}: {
  title: string
  icon: string
  children: ReactNode
  action?: ReactNode
  untranslated?: boolean
}) {
  return (
    <section className="summary-rise min-w-0 rounded-3xl border border-line bg-elevated/60 p-4 shadow-[0_18px_50px_-36px_color-mix(in_srgb,var(--color-ink)_40%,transparent)] backdrop-blur-md sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="grid size-7 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-accent">
            <Icon d={icon} className="size-4" />
          </span>
          {untranslated ? <Untranslated>{title}</Untranslated> : title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function NavButton({ label, onClick, dir }: { label: string; onClick: () => void; dir: 'prev' | 'next' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-11 place-items-center rounded-full text-ink transition-colors hover:bg-surface sm:size-9"
    >
      <Icon d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} className="size-4 rtl:-scale-x-100" />
    </button>
  )
}

function Icon({ d, className, fill = false }: { d: string; className?: string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-56 animate-pulse rounded-3xl bg-surface" />
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 flex-1 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-3xl bg-surface" />
    </div>
  )
}
