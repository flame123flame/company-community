'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatBaht } from '@/lib/office/wallet'
import { useOt, Untranslated } from '@/lib/i18n/office'
import type { Ot } from '@/lib/i18n/office'

export type SpendItem = {
  date: string
  title: string
  category: string
  shop: string | null
  shopId: string | null
  amount: number
  mine: boolean
  /* ── 0045 · ใช้เฉพาะตอนส่งออก CSV ไม่ได้โชว์บนกราฟ ── */
  deliveryFee?: number
  discount?: number
}

/**
 * กราฟแท่งค่าใช้จ่าย — รายวันในโหมดเดือน · รายเดือนในโหมดปี
 *
 * ★★★ ของเดิมวาดเฉพาะวันที่มีรายการ ไม่มีแกน
 *
 *     ★ ผู้ใช้เห็น "แท่งเดียวที่มุมซ้าย" ★★ เพราะเดือนนั้นมีรายการวันเดียว
 *        แล้วกราฟก็วาดแท่งเดียว ชิดซ้าย ไม่มีอะไรบอกว่าวันไหน
 *        ★ ซึ่งไม่ใช่กราฟ — มันคือแถบสีที่ไม่สื่ออะไรเลย
 *     ★ กราฟค่าใช้จ่ายมีความหมายก็ต่อเมื่อเห็น "วันที่ไม่ได้ใช้" ด้วย
 *       ★★ ช่องว่างระหว่างแท่งคือข้อมูล ไม่ใช่ที่ว่างที่ต้องบีบทิ้ง
 *
 * ★★★ ทุกวันของเดือนอยู่บนแกน ไม่ว่าจะมีรายการหรือไม่
 *     ★ 31 แท่งบนจอ 375px = แท่งละ ~10px ซึ่งพอดีกับนิ้วไม่ได้
 *       ★★ จึงไม่ได้ให้แตะทีละแท่ง แต่ให้แตะแล้วเลือกจาก "แถบที่กว้างเต็มคอลัมน์"
 *          ★ เป้ากดจึงสูงเต็มกราฟ (128px) ไม่ใช่สูงเท่าแท่ง
 *
 * ★★ ไม่ใช้ไลบรารีกราฟ — ข้อมูลชุดเดียว แกนเดียว
 *    ★ ไลบรารีที่เล็กที่สุดยังใหญ่กว่าโค้ดทั้งไฟล์นี้หลายเท่า และลากเอา
 *      ระบบธีมของตัวเองเข้ามาซึ่งจะชนกับ token ของโปรเจกต์
 */
export function SpendChart({
  items,
  mode,
  anchor,
  locale,
}: {
  items: SpendItem[]
  mode: 'month' | 'year'
  anchor: Date
  locale: string
}) {
  const ot = useOt()
  const [picked, setPicked] = useState<string | null>(null)

  /*
   * ★★ สร้าง "ทุกช่อง" ของช่วงก่อน แล้วค่อยเทยอดลงไป
   *    ★ การวนจากรายการที่มี จะได้เฉพาะช่องที่มีข้อมูล ซึ่งคือบั๊กเดิม
   */
  const buckets = useMemo(() => {
    const y = anchor.getFullYear()
    const m = anchor.getMonth()

    const keys: { key: string; label: string }[] = []
    if (mode === 'month') {
      const days = new Date(y, m + 1, 0).getDate()
      for (let d = 1; d <= days; d++) {
        keys.push({
          key: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          label: String(d),
        })
      }
    } else {
      for (let k = 0; k < 12; k++) {
        keys.push({
          key: `${y}-${String(k + 1).padStart(2, '0')}`,
          /* ★ ชื่อเดือนย่อตามภาษาที่คนอ่านเลือก ไม่ตรึง th-TH */
          label: new Date(y, k, 1).toLocaleDateString(locale, { month: 'short' }),
        })
      }
    }

    const sum = new Map<string, number>()
    for (const it of items) {
      const k = mode === 'month' ? it.date : it.date.slice(0, 7)
      sum.set(k, (sum.get(k) ?? 0) + Number(it.amount))
    }

    return keys.map((k) => ({ ...k, amount: sum.get(k.key) ?? 0 }))
  }, [items, mode, anchor, locale])

  const max = Math.max(...buckets.map((b) => b.amount), 1)

  /*
   * ★ เส้นแกน Y สามเส้น: 0 · ครึ่ง · สูงสุด
   *   ★★ มากกว่านี้บนจอมือถือจะกลายเป็นลายทาง อ่านยากกว่าไม่มีเส้นเลย
   */
  const ticks = [max, max / 2, 0]

  const detail = picked ? items.filter((i) => (mode === 'month' ? i.date : i.date.slice(0, 7)) === picked) : []
  const detailTotal = detail.reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          <Untranslated>{ot(mode === 'month' ? 'wallet.summary.byDay' : 'wallet.summary.byMonth')}</Untranslated>
        </p>
        <p className="text-[11px] text-ink-faint">
          <Untranslated>{ot('wallet.summary.tapBar')}</Untranslated>
        </p>
      </div>

      {/*
        * ★★ แกน Y อยู่นอกพื้นที่กราฟ ไม่ทับแท่ง
        *    ★ ตัวเลขที่ลอยทับกราฟอ่านยากเมื่อแท่งสูงถึงมัน
        */}
      <div className="mt-3 flex gap-2">
        <div className="flex h-32 w-10 shrink-0 flex-col justify-between text-end text-[10px] tabular-nums text-ink-faint">
          {ticks.map((t, i) => (
            <span key={i}>{Math.round(t).toLocaleString(locale)}</span>
          ))}
        </div>

        {/*
          * ★★★ ไม่มี overflow-x — กราฟต้องพอดีจอเสมอ
          *     ★ ผู้ใช้ระบุชัดว่า "บนมือถือกราฟต้องพอดีจอ ไม่ต้องเลื่อนแนวนอน"
          *       ★★ 31 แท่งใน 300px = แท่งละ ~9px ซึ่งยังเห็นรูปทรงรวมได้
          *          และนั่นคือสิ่งที่กราฟเดือนมีไว้ตอบ: "เดือนนี้ใช้หนักช่วงไหน"
          */}
        <div className="relative min-w-0 flex-1">
          {/* เส้นแนวนอนอ้างอิง */}
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            {ticks.map((_, i) => (
              <span key={i} className="h-px w-full bg-line" />
            ))}
          </div>

          <div className="relative flex h-32 items-end gap-px">
            {buckets.map((b) => {
              const on = picked === b.key
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setPicked(on ? null : b.key)}
                  aria-pressed={on}
                  aria-label={`${b.label} · ฿${formatBaht(locale, b.amount)}`}
                  /*
                   * ★ ปุ่มสูงเต็มกราฟ แต่แท่งสีสูงตามยอด
                   *   ★★ เป้ากดสูง 128px กดโดนง่ายกว่าแท่งที่สูง 4px มาก
                   *      ★ แตะวันที่ไม่มีรายการได้ด้วย — มันตอบว่า "วันนั้นไม่ได้ใช้"
                   */
                  className="group relative flex h-full min-w-0 flex-1 items-end"
                >
                  <span
                    className={cn(
                      'w-full rounded-t-[2px] transition-colors',
                      b.amount > 0
                        ? on
                          ? 'bg-accent'
                          : 'bg-accent/60 group-hover:bg-accent'
                        : 'bg-line',
                    )}
                    style={{ height: b.amount > 0 ? `${Math.max(3, (b.amount / max) * 100)}%` : '2px' }}
                  />
                </button>
              )
            })}
          </div>

          {/*
            * ★★ แกน X ไม่ได้เขียนทุกวัน — เขียนทุก 5 วัน
            *    ★ ตัวเลข 31 ตัวใน 300px ทับกันจนอ่านไม่ออกสักตัว
            *      ★★ จุดอ้างอิงห่าง ๆ อ่านได้ และพอให้รู้ว่าแท่งไหนคือวันไหน
            */}
          <div className="mt-1 flex gap-px text-[9px] tabular-nums text-ink-faint">
            {buckets.map((b, i) => (
              <span key={b.key} className="min-w-0 flex-1 text-center">
                {mode === 'year' || i === 0 || (i + 1) % 5 === 0 ? b.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── รายการของช่องที่แตะ ────────────────────────────────── */}
      {picked ? (
        <div className="mt-3 rounded-xl border border-line bg-surface/60 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium text-ink">
              <Untranslated>
                {ot(mode === 'month' ? 'wallet.summary.dayDetail' : 'wallet.summary.monthDetail', {
                  d: picked,
                })}
              </Untranslated>
            </p>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-[11px] text-link hover:underline"
            >
              <Untranslated>{ot('wallet.summary.closeDetail')}</Untranslated>
            </button>
          </div>

          {detail.length === 0 ? (
            <p className="mt-1 text-xs text-ink-faint">฿{formatBaht(locale, 0)}</p>
          ) : (
            <>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-accent">
                ฿{formatBaht(locale, detailTotal)}
              </p>
              <ul className="mt-2 divide-y divide-line">
                {detail.map((i, k) => (
                  <li key={k} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-[13px] text-ink">
                        {i.title || shopOrDash(ot, i.shop)}
                      </span>
                      {i.shop ? (
                        <span dir="auto" className="block truncate text-[11px] text-ink-faint">
                          {i.shop}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-ink">
                      ฿{formatBaht(locale, Number(i.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function shopOrDash(ot: Ot, shop: string | null): string {
  return shop ?? ot('wallet.summary.noShop')
}
