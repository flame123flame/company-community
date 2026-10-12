'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { formatBaht } from '@/lib/office/wallet'
import { Untranslated, useOt } from '@/lib/i18n/office'

type Summary = { iOwe: number; owedToMe: number; pendingConfirm: number }

/**
 * แถบเตือนยอดค้าง — อยู่บนสุดของหน้าสรุป
 *
 * ★★★ มีขึ้นเพราะย้ายหน้าแรกของกระเป๋าเงินจาก "ยอดค้าง" มาเป็น "สรุปของฉัน"
 *
 *     ★ การย้ายนั้นถูก — เปิดมาเจอเรื่องหนี้ทุกครั้งคือเหตุผลที่คนไม่อยากเปิด
 *       ★★ แต่ถ้าย้ายเฉย ๆ คนที่ติดเงินใครอยู่จะไม่เห็นอะไรเลยจนกว่าจะ
 *          กดเข้าไปดูเอง ★ ซึ่งแปลว่าของที่ต้องจัดการจะถูกลืม
 *
 * ★★ ไม่ขึ้นเลยถ้าไม่มีอะไรค้าง
 *    ★ แถบที่ขึ้นทุกครั้งแม้ไม่มีเรื่อง คือแถบที่คนเลิกอ่านภายในสัปดาห์เดียว
 *
 * ★ ล้มแล้วเงียบ — มันเป็นของเสริมบนหน้าที่มีเรื่องของตัวเองอยู่แล้ว
 */
export function OutstandingBanner() {
  const ot = useOt()
  const locale = useLocale()
  const [s, setS] = useState<Summary | null>(null)

  useEffect(() => {
    void apiFetch<{ summary: Summary }>('/api/office/wallet')
      .then((r) => setS(r.summary))
      .catch(() => undefined)
  }, [])

  if (!s) return null
  const anything = s.iOwe > 0 || s.owedToMe > 0 || s.pendingConfirm > 0
  if (!anything) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-elevated/60 px-3.5 py-2.5 backdrop-blur-md">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        {s.iOwe > 0 ? (
          <span className="font-semibold text-money-out tabular-nums">
            <Untranslated>{ot('wallet.owed.iOwe')}</Untranslated> ฿{formatBaht(locale, s.iOwe)}
          </span>
        ) : null}
        {s.owedToMe > 0 ? (
          <span className="font-semibold text-money-in tabular-nums">
            <Untranslated>{ot('wallet.owed.owedToMe')}</Untranslated> ฿{formatBaht(locale, s.owedToMe)}
          </span>
        ) : null}
        {/* ★ "รอคุณยืนยัน" คือของที่ต้องลงมือ ไม่ใช่แค่ตัวเลข — ให้มันเด่นกว่า */}
        {s.pendingConfirm > 0 ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">
            <Untranslated>{ot('home.toConfirm', { n: s.pendingConfirm })}</Untranslated>
          </span>
        ) : null}
      </span>

      <Link
        href="/office/wallet/owed"
        className={cn(
          'ms-auto inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[12px] font-semibold',
          'bg-surface text-ink transition-colors hover:bg-surface-hover',
        )}
      >
        <Untranslated>{ot('wallet.summary.openOwed')}</Untranslated>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </div>
  )
}
