import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { formatBaht } from '@/lib/office/wallet'
import type { Ot } from '@/lib/i18n/office-format'

/**
 * การ์ดสรุปของฉัน บนหน้าแรก
 *
 * ★★★ ย้ายมาจากพอร์ทัล /office ซึ่งถูกยุบทิ้งเพราะซ้ำกับหน้าแรก
 *
 *     ★ การ์ดเมนู 5 ใบของสองหน้านั้นเหมือนกันเป๊ะ จนคนที่ล็อกอินแล้ว
 *       เจอเมนูเดียวกันสองรอบโดยไม่มีอะไรบอกว่าควรอยู่หน้าไหน
 *     ★★ แต่ "ตัวเลขของคุณเอง" มีแค่ที่ /office — ถ้ายุบทิ้งเฉย ๆ
 *        จะเป็นการลบของที่มีประโยชน์ที่สุดในสองหน้านั้นไปพร้อมกับของที่ซ้ำ
 *     ★ จึงยกมาไว้ที่หน้าแรกแทน แล้วค่อยลบพอร์ทัลเก่า
 *
 * ★★ เป็น server component และรับ `ot` มาเป็นพารามิเตอร์
 *    ★ หน้าแรกอยู่นอก /office จึงไม่มี OfficeI18nProvider ครอบ
 *      ★★ การส่ง ot เข้ามาแทนการเรียก useOt() ทำให้ไม่ต้องลากดิกชันนารี
 *         ออฟฟิศ 779 กุญแจเข้าบันเดิลของหน้าแรกเพื่อการ์ดไม่กี่ใบ
 */
export type HomeSummaryData = {
  iOwe: number
  owedToMe: number
  toConfirm: number
  stale: number
  newListings: number
  topRestaurant: string | null
  unread: number
  unreadChat: number
}

/*
 * สีประจำแต่ละโมดูล — ชุดเดียวกับการ์ดบนหน้าแรก
 *
 * ★★ ต้องตรงกันทุกที่ ★ คนเห็น "กระเป๋าเงิน" สีเขียวบนการ์ดสรุป แล้วกดเข้าไป
 *    เจอสีเขียวอันเดิม จะรู้ว่ามาถูกที่โดยไม่ต้องอ่านซ้ำ
 *    ★★ สีคือป้ายชื่อที่จำได้เร็วกว่าตัวหนังสือ จึงห้ามสลับกันเด็ดขาด
 */
const TINTS = {
  wallet: '52 199 123',
  food: '255 149 0',
  market: '10 132 255',
  chat: '48 209 176',
} as const

type Card = {
  href: string
  label: string
  value: string
  sub?: string
  tone?: 'warn'
  tint: string
  icon: string
}

export function OfficeSummary({
  ot,
  locale,
  data,
}: {
  ot: Ot
  locale: string
  data: HomeSummaryData
}) {
  const cards: Card[] = []

  /*
   * ★★★ การ์ดโผล่เฉพาะเมื่อมีอะไรให้ทำจริง ไม่ใช่โชว์ศูนย์
   *
   *     ★ "ฉันค้างจ่าย ฿0" ไม่ได้บอกอะไรเลย แต่กินที่เท่ากับการ์ดที่บอกอะไร
   *       ★★ แถบสรุปที่เต็มไปด้วยศูนย์ทำให้คนเลิกอ่านมันทั้งแถบ
   *          แล้ววันที่มีตัวเลขจริงก็จะถูกมองข้ามไปด้วย
   */
  if (data.iOwe > 0) {
    cards.push({
      href: '/office/wallet/owed',
      label: ot('home.iOwe'),
      value: `฿${formatBaht(locale, data.iOwe)}`,
      tint: TINTS.wallet,
      icon: 'M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.8 7 7s2.6 2.8 5 3.3 5 1.3 5 3.7-2.2 3-5 3-5-.9-5-2.8',
      /* ★ ค้างเกิน 7 วันขึ้นเป็นสีเตือน — ตัวเลขเดียวกันแต่เร่งด่วนไม่เท่ากัน */
      sub: data.stale > 0 ? ot('home.stale', { n: data.stale }) : undefined,
      tone: data.stale > 0 ? 'warn' : undefined,
    })
  }

  if (data.owedToMe > 0) {
    cards.push({
      href: '/office/wallet/summary',
      label: ot('home.owedToMe'),
      value: `฿${formatBaht(locale, data.owedToMe)}`,
      tint: TINTS.wallet,
      icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
      sub: data.toConfirm > 0 ? ot('home.toConfirm', { n: data.toConfirm }) : undefined,
      tone: data.toConfirm > 0 ? 'warn' : undefined,
    })
  }

  if (data.unreadChat > 0) {
    cards.push({
      href: '/office/chat',
      label: ot('chat.title'),
      value: ot('chat.unreadHere', { n: data.unreadChat }),
      tone: 'warn',
      tint: TINTS.chat,
      icon: 'M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z',
    })
  }

  if (data.newListings > 0) {
    cards.push({
      href: '/office/market',
      label: ot('home.newListings'),
      value: String(data.newListings),
      sub: ot('home.lastWeek'),
      tint: TINTS.market,
      icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
    })
  }

  if (data.topRestaurant) {
    cards.push({
      href: '/office/food/picks',
      label: ot('home.topRestaurant'),
      value: data.topRestaurant,
      tint: TINTS.food,
      icon: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z',
    })
  }

  if (cards.length === 0) return null

  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-8">
      <div className="hero-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href + c.label}
            href={c.href}
            style={{ '--tint': c.tint } as CSSProperties}
            className={cn(
              'tint-card lift group relative isolate overflow-hidden rounded-3xl',
              'border border-line bg-elevated/50 p-5 backdrop-blur-md',
            )}
          >
            <span className="tint-glow" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  'radial-gradient(120% 80% at 88% -10%, rgb(var(--tint) / 0.08), transparent 58%)',
              }}
            />

            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-xs text-ink-soft">{c.label}</span>
                {/* ★ ชื่อร้านเป็นของผู้ใช้ — ภาษาอะไรก็ได้ ไม่เกี่ยวกับภาษาของหน้า */}
                <span
                  dir="auto"
                  className={cn(
                    'mt-1.5 block truncate text-2xl font-bold tracking-tight tabular-nums',
                    c.tone === 'warn' ? 'text-warn' : 'text-ink',
                  )}
                >
                  {c.value}
                </span>
                {c.sub ? (
                  <span className="mt-1 block text-[11px] text-ink-faint">{c.sub}</span>
                ) : null}
              </span>

              <span
                aria-hidden="true"
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-xl',
                  'text-[rgb(var(--tint))] ring-1 ring-[rgb(var(--tint)/0.28)]',
                  'transition-transform duration-500 group-hover:scale-110',
                )}
                style={{
                  background:
                    'linear-gradient(145deg, rgb(var(--tint) / 0.22), rgb(var(--tint) / 0.08))',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={c.icon} />
                </svg>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
