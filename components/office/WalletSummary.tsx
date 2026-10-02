'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import Link from 'next/link'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { SpendChart, type SpendItem } from './SpendChart'
import { ChatAvatar } from './ChatAvatar'
import { Input } from '@/components/ui/Input'
import { categoryLabel, formatBaht } from '@/lib/office/wallet'
import type { ExpenseCategory } from '@/types/database'

/*
 * ★★★ API คืน "รายการย่อย" ไม่ใช่ยอดรวมสำเร็จรูป 4 ชุด
 *
 *     ★ เหตุผลเต็มอยู่ที่ app/api/office/wallet/summary/route.ts
 *       สรุปสั้น ๆ: ยอดรวมกับรายละเอียดเคยคำนวณจากคนละเงื่อนไข แล้วเพี้ยนกัน
 *     ★★ รวมยอดที่นี่ที่เดียวจากอาร์เรย์เดียว — ทุกส่วนจึงบวกกลับได้เท่ายอดรวม
 *        "โดยโครงสร้าง" ไม่ใช่โดยความระมัดระวัง
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

/** หน้าสรุปค่าข้าว (FR-B09 / FR-B10) */
export function WalletSummary() {
  const ot = useOt()
  const locale = useLocale()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    const y = anchor.getFullYear()
    const m = anchor.getMonth()
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return mode === 'month'
      ? { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
      : { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) }
  }, [anchor, mode])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(
        await apiFetch<Summary>(
          `/api/office/wallet/summary?from=${range.from}&to=${range.to}`,
        ),
      )
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    void load()
  }, [load])

  /*
   * ★★ จัดกลุ่มจากอาร์เรย์เดียวกับที่กราฟใช้
   *    ★ ตัวเลขในตารางกับความสูงของแท่งจึงมาจากที่เดียวกันเสมอ
   */
  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of data?.items ?? []) m.set(i.category, (m.get(i.category) ?? 0) + Number(i.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const byShop = useMemo(() => {
    /* ★ เก็บทั้งยอดและจำนวนครั้ง — ข้อกำหนดเฟส 4 ขอ "5 อันดับพร้อมจำนวนครั้ง" */
    const m = new Map<string, { amount: number; times: number; id: string | null }>()
    for (const i of data?.items ?? []) {
      /* ★ บิลที่ไม่ได้ระบุร้านยังต้องนับ ไม่งั้นผลรวมของตารางจะน้อยกว่ายอดรวม */
      const key = i.shop ?? ot('wallet.summary.noShop')
      const cur = m.get(key) ?? { amount: 0, times: 0, id: i.shopId }
      m.set(key, { amount: cur.amount + Number(i.amount), times: cur.times + 1, id: cur.id ?? i.shopId })
    }
    return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5)
  }, [data, ot])

  /*
   * ★★ ค่าเฉลี่ย "ต่อวันที่มีรายการ" ไม่ใช่ต่อวันในเดือน
   *    ★ ข้อกำหนดระบุชัด และมันถูกกว่า — คนไม่ได้กินข้าวนอกทุกวัน
   *      ★★ หารด้วย 30 จะได้ตัวเลขที่ต่ำจนไม่มีความหมาย
   */
  const activeDays = useMemo(
    () => new Set((data?.items ?? []).map((i) => i.date)).size,
    [data],
  )

  /* ★ เทียบช่วงก่อน — ไม่มีข้อมูลให้ซ่อนทั้งบรรทัดตามข้อกำหนด */
  const delta = useMemo(() => {
    if (!data?.prevTotal || data.prevTotal <= 0) return null
    const pct = Math.round(((data.total - data.prevTotal) / data.prevTotal) * 100)
    if (pct === 0) return null
    return { pct: Math.abs(pct), up: pct > 0 }
  }, [data])

  function shift(delta: number) {
    setAnchor((d) =>
      mode === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + delta, 1)
        : new Date(d.getFullYear() + delta, 0, 1),
    )
  }

  /**
   * ส่งออก CSV (FR-B10)
   *
   * ★ สร้างไฟล์ในเบราว์เซอร์ ไม่ยิงไป server
   *   ข้อมูลอยู่ในมือแล้วทั้งหมด — การส่งกลับไปให้ server ประกอบไฟล์
   *   แล้วส่งกลับมาคือการเดินทางที่ไม่ได้อะไรเพิ่ม
   *
   * ★★ ใส่ BOM (﻿) หน้าไฟล์
   *    Excel บน Windows อ่าน UTF-8 ไม่ออกถ้าไม่มี BOM — ชื่อร้านภาษาไทย
   *    จะกลายเป็นตัวยึกยือทั้งไฟล์ ซึ่งเป็นปัญหาที่คนเจอบ่อยที่สุดกับ CSV ไทย
   */
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
      /* ★ CSV ลงรายละเอียดทีละรายการ ไม่ใช่ยอดรวมรายวัน — ไฟล์ที่เอาไปทำต่อได้
           ★★ ยอดรวมรายวันคำนวณกลับเองได้ แต่รายการที่ถูกยุบไปแล้วกู้ไม่ได้ */
      ...(data.items ?? []).map((i) => [
        i.date,
        i.title,
        categoryLabel(ot, i.category as ExpenseCategory),
        i.shop ?? '',
        Number(i.amount).toFixed(2),
        /* ★ ค่าส่ง/ส่วนลดเป็นคอลัมน์ของตัวเอง ตามข้อกำหนดเฟส 4
             ★★ คนเอาไฟล์ไปทำต่อใน Excel ต้องเห็นที่มาของยอด ไม่ใช่แค่ผลลัพธ์ */
        Number(i.deliveryFee ?? 0).toFixed(2),
        Number(i.discount ?? 0).toFixed(2),
      ]),
    ]

    /* ★ ใส่เครื่องหมายคำพูดรอบค่าที่มีคอมมา ไม่งั้นคอลัมน์เลื่อน */
    const csv = rows
      .map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(','))
      .join('\n')

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ot('summary.csv.filename')}-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const label =
    mode === 'month'
      /* ★★★ ตรึงไว้ที่ 'th-TH' ทำให้ทุกภาษาเห็น "ตุลาคม 2569"
         ★ ไม่ใช่แค่ไม่แปล — พ.ศ. ยังทำให้คนนอกไทยอ่านปีผิดไป 543 ปี
           ★★ ด่าน i18n จับได้ทั้ง 15 ภาษาในรอบเดียว */
      ? anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
      : anchor.toLocaleDateString(locale, { year: 'numeric' })

  return (
    <div className="max-w-3xl py-2">
      <p className="mt-1 text-xs text-ink-faint">{ot('wallet.summary.explain')}</p>

      {/* ── เลือกช่วง ────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          <Chip active={mode === 'month'} onClick={() => setMode('month')}>
            {ot('wallet.summary.month')}
          </Chip>
          <Chip active={mode === 'year'} onClick={() => setMode('year')}>
            {ot('wallet.summary.year')}
          </Chip>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label={ot('summary.prev')}>
            ‹
          </Button>
          <span className="min-w-32 text-center text-sm font-medium text-ink">{label}</span>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label={ot('summary.next')}>
            ›
          </Button>
        </div>

        <Button size="sm" className="ms-auto" onClick={exportCsv} disabled={!data || data.total === 0}>
          {ot('wallet.summary.export')}
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
      ) : !data || data.total === 0 ? (
        /*
         * ★★ เดือนที่ไม่มีรายการต้องบอกตรง ๆ ว่าเดือนไหน และมีทางไปต่อ
         *    ★ ข้อความกลาง ๆ ว่า "ยังไม่มีข้อมูล" ทำให้คนไม่รู้ว่าเลื่อนเดือน
         *      ผิดหรือระบบพัง ★★ และหน้าตันที่ไม่มีปุ่มคือหน้าที่คนปิดทิ้ง
         */
        <div className="mt-6">
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
      ) : (
        <>
          {/* ── ยอดรวม ───────────────────────────────────────────── */}
          {/*
            * ★★ บนมือถือเลื่อนแนวนอน ไม่เรียงลงเป็นสามแถว
            *    ★ ข้อกำหนดเฟส 4 ระบุไว้ และเหตุผลคือการ์ดสามใบเรียงลง
            *      ดันกราฟกับตารางตกไปใต้ fold ทั้งหมด
            *      ★★ ของที่ต้องเลื่อนลงไปหา คือของที่คนส่วนใหญ่ไม่ได้ดู
            *    ★ snap-x ให้หยุดตรงขอบการ์ดพอดี ไม่ค้างครึ่งใบ
            */}
          <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
            <Stat
              label={ot('wallet.summary.total')}
              value={data.total}
              big
              delta={delta}
              sub={
                activeDays > 0
                  ? `${ot('wallet.summary.avgPerDay')} ฿${formatBaht(locale, data.total / activeDays)}`
                  : undefined
              }
            />
            <Stat label={ot('wallet.summary.myShare')} value={data.myShare} />
            {/*
              * ★★★ ชื่อใหม่: "ส่วนของฉันในบิลคนอื่น" ไม่ใช่ "ส่วนที่ค้างคนอื่น"
              *
              *     ★ ค่าตัวนี้รวมหนี้ที่จ่ายจบไปแล้วด้วย ★★ ชื่อเดิมจึงขัดกับ
              *       หน้ายอดค้างที่บอก ฿0.00 — ผู้ใช้เห็นสองหน้าพูดคนละเรื่อง
              *       แล้วสรุปว่าตัวเลขของระบบเชื่อไม่ได้
              *     ★ มันคือเงินที่ฉันใช้ไปจริงในบิลที่คนอื่นออกให้ ซึ่งต้องนับ
              *       ในยอดรวมไม่ว่าจะคืนเงินเขาแล้วหรือยัง
              */}
            <Stat
              label={ot('wallet.summary.myShareOthers')}
              value={data.myShareOthers}
              untranslated
            />
          </div>

          {/* ── งบรายเดือน ───────────────────────────────────────── */}
          <BudgetBar
            budget={data.monthlyBudget}
            used={data.total}
            onSaved={() => void load()}
          />

          {/* ── กราฟ ─────────────────────────────────────────────── */}
          <div className="mt-5">
            <SpendChart items={data.items} mode={mode} anchor={anchor} locale={locale} />
          </div>

          {/* ── แยกตามประเภท / ร้าน ──────────────────────────────── */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Panel title={ot('wallet.summary.byCategory')}>
              {byCategory.map(([k, v]) => (
                <Line key={k} name={categoryLabel(ot, k as ExpenseCategory)} amount={v} />
              ))}
            </Panel>

            <Panel title={ot('wallet.summary.byRestaurant')}>
              {byShop.map(([name, v]) => (
                <Line
                  key={name}
                  name={name}
                  amount={v.amount}
                  times={v.times}
                  /*
                   * ★ แตะชื่อร้านไปหน้าร้านเด็ดที่กรองร้านนั้นไว้แล้ว
                   *   ★★ ยังไม่มีหน้ารายละเอียดร้านรายตัวในระบบ — การกรอง
                   *      ในหน้ารวมให้ผลเดียวกันโดยไม่ต้องสร้างหน้าใหม่
                   */
                  href={v.id ? `/office/food/picks?shop=${v.id}` : undefined}
                />
              ))}
            </Panel>
          </div>

          {/* ── กินข้าวด้วยบ่อยสุด ─────────────────────────────── */}
          <div className="mt-4 rounded-2xl border border-line bg-elevated/30 p-4 backdrop-blur-md">
            <p className="text-sm font-medium text-ink">
              <Untranslated>{ot('wallet.summary.withWhom')}</Untranslated>
            </p>
            {data.topPeople.length === 0 ? (
              <p className="mt-2 text-xs text-ink-faint">
                <Untranslated>{ot('wallet.summary.noPeople')}</Untranslated>
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {data.topPeople.map((p) => (
                  <span key={p.id} className="flex w-16 flex-col items-center gap-1">
                    <ChatAvatar name={p.name} url={p.avatarUrl} size={44} />
                    <span dir="auto" className="w-full truncate text-center text-[11px] text-ink">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-ink-faint">
                      <Untranslated>{ot('wallet.summary.times', { n: p.times })}</Untranslated>
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  big,
  untranslated,
  delta,
  sub,
}: {
  label: string
  value: number
  big?: boolean
  untranslated?: boolean
  delta?: { pct: number; up: boolean } | null
  sub?: string
}) {
  const locale = useLocale()
  const ot = useOt()
  return (
    /* ★ min-w + snap-start — การ์ดต้องกว้างพอให้อ่านยอดได้เต็มตอนเลื่อน */
    <div className="min-w-[62%] shrink-0 snap-start rounded-2xl border border-line bg-elevated/60 p-4 backdrop-blur-md sm:min-w-0">
      <p className="text-xs text-ink-soft">
        {untranslated ? <Untranslated>{label}</Untranslated> : label}
      </p>
      {/*
        * ★★★ ยอดศูนย์ใช้สีปกติ ไม่ใช่สีแดง
        *
        *     ★ ผู้ใช้สั่งว่า "฿0.00 ทุกที่ให้แสดงเป็นสีปกติ ใช้สีแดงเฉพาะเมื่อ
        *       มียอดค้างจริง" ★★ ซึ่งถูก — สีแดงคือสัญญาณว่าต้องทำอะไรสักอย่าง
        *       ★ ฿0.00 สีแดงคือการเตือนเรื่องที่ไม่มีอยู่ ซึ่งทำให้คนเลิกเชื่อ
        *         สีแดงตัวอื่นในหน้าเดียวกันไปด้วย
        */}
      <p
        className={cn(
          'mt-1 font-bold tabular-nums',
          big ? 'text-2xl' : 'text-lg',
          big && value > 0 ? 'text-accent' : 'text-ink',
        )}
      >
        ฿{formatBaht(locale, value)}
      </p>

      {/*
        * ★★ เทียบช่วงก่อน — ซ่อนทั้งบรรทัดเมื่อไม่มีข้อมูลเทียบ
        *    ★ ข้อกำหนดระบุไว้ และ "▲ 0%" ไม่ได้บอกอะไรนอกจากกินที่
        *    ★ ขึ้น = สีเตือน ไม่ใช่สีแดง — ใช้จ่ายเพิ่มไม่ใช่ความผิดพลาด
        */}
      {delta ? (
        <p className={cn('mt-1 text-[11px]', delta.up ? 'text-warn' : 'text-ink-soft')}>
          <Untranslated>
            {ot('wallet.summary.vsPrev', { dir: delta.up ? '▲' : '▼', n: delta.pct })}
          </Untranslated>
        </p>
      ) : null}

      {sub ? (
        <p className="mt-1 text-[11px] text-ink-faint">
          <Untranslated>{sub}</Untranslated>
        </p>
      ) : null}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Line({
  name,
  amount,
  times,
  href,
}: {
  name: string
  amount: number
  times?: number
  href?: string
}) {
  const locale = useLocale()
  const ot = useOt()
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {href ? (
          <Link href={href} dir="auto" className="min-w-0 truncate text-link hover:underline">
            {name}
          </Link>
        ) : (
          <span dir="auto" className="min-w-0 truncate text-ink-soft">
            {name}
          </span>
        )}
        {times ? (
          <span className="shrink-0 text-[11px] text-ink-faint">
            <Untranslated>{ot('wallet.summary.times', { n: times })}</Untranslated>
          </span>
        ) : null}
      </span>
      <span className="shrink-0 tabular-nums text-ink">฿{formatBaht(locale, amount)}</span>
    </div>
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
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}

/**
 * แถบงบรายเดือน
 *
 * ★★★ หน้านี้เป็นหน้าดูอย่างเดียว — งบเป็นข้อยกเว้นเดียวที่กรอกได้
 *
 *     ★ ข้อกำหนดเฟส 4 ระบุชัดว่า "ห้ามเพิ่มสิ่งที่ต้องกรอก ยกเว้นงบรายเดือน
 *       ที่เป็นตัวเลือกเสริม"
 *     ★★ ยังไม่ตั้ง = ลิงก์เล็กบรรทัดเดียว ไม่ใช่ฟอร์มที่กางรออยู่
 *        ★ ฟอร์มที่กางรอบนหน้าดูข้อมูล คือการขอให้คนทำงานทั้งที่เขามาแค่ดู
 *
 * ★★ null (ยังไม่ตั้ง) ต่างจาก 0 (ตั้งไว้ศูนย์บาท)
 *    ★ ศูนย์บาทคือคนที่ตั้งใจบอกว่า "เดือนนี้ไม่ควรใช้เลย" ซึ่งแถบจะเต็มทันที
 */
function BudgetBar({
  budget,
  used,
  onSaved,
}: {
  budget: number | null
  used: number
  onSaved: () => void
}) {
  const ot = useOt()
  const locale = useLocale()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(amount: number | null) {
    setBusy(true)
    try {
      await apiFetch('/api/office/profile', {
        method: 'POST',
        body: { action: 'budget', amount },
      })
      setEditing(false)
      onSaved()
    } catch {
      /* ★ ตั้งงบไม่สำเร็จไม่ควรทำให้หน้าสรุปทั้งหน้าพัง — เงียบแล้วปล่อยผ่าน */
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-elevated/30 p-4">
        <p className="text-sm font-medium text-ink">
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
            className="max-w-40"
          />
          <Button
            size="sm"
            variant="primary"
            className="min-h-11"
            loading={busy}
            onClick={() => void save(Number(value) || 0)}
          >
            {ot('common.save')}
          </Button>
          {budget !== null ? (
            <button
              type="button"
              onClick={() => void save(null)}
              className="min-h-11 px-2 text-xs text-link hover:underline"
            >
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
        className="mt-3 min-h-11 text-xs text-link hover:underline"
      >
        <Untranslated>{ot('wallet.summary.budgetSet')}</Untranslated>
      </button>
    )
  }

  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 100
  const over = used > budget
  /*
   * ★★ สามระดับ: ปกติ · เตือนเมื่อเกิน 80% · แดงเมื่อเกินงบ
   *    ★ ข้อกำหนดระบุเกณฑ์ไว้ตรง ๆ ★★ สีแดงเฉพาะตอน "เกินจริง" เท่านั้น
   *       — เกิน 80% ยังไม่ใช่ความผิดพลาด แค่ควรรู้ตัว
   */
  /*
   * ★★★ ระดับปกติไม่ใช้สีแดงแบรนด์
   *
   *     ★ เดิมใช้ bg-accent ★★ ซึ่งเป็นแดงเหมือนกับระดับ "เกินงบ"
   *        ★ วัดจากจอจริงได้ rgb(230,0,41) ตอนใช้ไป 27% กับ rgb(196,48,43)
   *          ตอนเกินงบ — สองสถานะที่ตรงข้ามกันแต่ตาแยกไม่ออก
   *     ★ ฟ้า → เหลือง → แดง เป็นลำดับที่คนอ่านได้โดยไม่ต้องอ่านตัวเลข
   *       ★★ และไม่ได้แตะสีแบรนด์ — แค่ไม่เอาสีแบรนด์มาใช้ผิดหน้าที่
   *
   * ★★★ ใช้ token ที่มีอยู่แล้วเท่านั้น (link · warn · danger)
   *     ★ เคยเขียน bg-ok ซึ่ง "ไม่มี token ชื่อนั้นในโปรเจกต์"
   *       ★★ Tailwind ไม่สร้าง class ให้เลย ไม่ใช่ error — แค่เงียบ ๆ ไม่มีสี
   *          ★ วัดจากจอจริงได้ rgba(0,0,0,0) คือแถบใส มองไม่เห็นว่าใช้ไปเท่าไหร่
   *     ★ บทเรียนเดียวกับที่ Toast.tsx เขียนเตือนไว้เรื่อง bg-surface-2
   */
  const tone = over ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-link'

  return (
    <div className="mt-4 rounded-2xl border border-line bg-elevated/30 p-4 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          <Untranslated>{ot('wallet.summary.budget')}</Untranslated>
        </p>
        <button
          type="button"
          onClick={() => {
            setValue(String(budget))
            setEditing(true)
          }}
          className="min-h-11 px-1 text-xs text-link hover:underline"
        >
          <Untranslated>{ot('wallet.summary.budgetEdit')}</Untranslated>
        </button>
      </div>

      <p className="mt-0.5 text-sm tabular-nums text-ink-soft">
        <Untranslated>
          {ot('wallet.summary.budgetOf', {
            used: `฿${formatBaht(locale, used)}`,
            total: `฿${formatBaht(locale, budget)}`,
          })}
        </Untranslated>
      </p>

      {/* ★ aria-valuenow ให้โปรแกรมอ่านหน้าจอบอกเปอร์เซ็นต์ได้ — แถบสีอย่างเดียวบอกไม่ได้ */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface"
      >
        <span className={cn('block h-full rounded-full transition-[width]', tone)} style={{ width: `${pct}%` }} />
      </div>

      {over ? (
        <p className="mt-1.5 text-xs text-danger">
          <Untranslated>
            {ot('wallet.summary.budgetOver', { amount: `฿${formatBaht(locale, used - budget)}` })}
          </Untranslated>
        </p>
      ) : null}
    </div>
  )
}
