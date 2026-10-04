import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { formatBaht } from '@/lib/office/wallet'
import { markThai } from '@/lib/i18n/untranslated'
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
  /*
   * ★★★ เงินออกกับเงินเข้าต้องคนละสี ไม่ใช่สีเขียวของ "กระเป๋าเงิน" ทั้งคู่
   *
   *     ★ เดิมการ์ด "ฉันค้างจ่าย" กับ "มีคนค้างฉัน" ใช้สีเขียวอันเดียวกัน
   *       ไอคอนทรงใกล้กัน และตัวเลขสีเดียวกัน
   *       ★★ ผลคือต้องอ่านป้ายข้างบนทุกครั้งถึงจะรู้ว่าอันไหนเงินที่ต้องจ่าย
   *          ซึ่งเป็นคำถามแรกที่คนเปิดหน้านี้มาถาม
   *     ★ แดง = ออกจากกระเป๋า · เขียว = เข้ากระเป๋า เป็นรหัสสีที่คนรู้อยู่แล้ว
   *       จากสมุดบัญชีและแอปธนาคารทุกตัว — ไม่ต้องสอนใหม่
   */
  out: '255 59 48',
  in: '52 199 123',
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
  /** ป้ายทิศทางของเงิน — มีเฉพาะการ์ดกระเป๋าเงิน */
  flow?: 'out' | 'in'
  /** ข้อความบนบรรทัดล่างสุด บอกว่ากดแล้วได้ทำอะไร */
  cta: string
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
      tint: TINTS.out,
      /* ★ ลูกศรชี้ออกจากกระเป๋า — รูปทรงบอกทิศทางซ้ำกับสี เผื่อคนตาบอดสี */
      icon: 'M12 19V5M5 12l7-7 7 7',
      flow: 'out',
      cta: ot('home.ctaPay'),
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
      tint: TINTS.in,
      icon: 'M12 5v14M5 12l7 7 7-7',
      flow: 'in',
      cta: ot('home.ctaCollect'),
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
      cta: ot('home.ctaOpen'),
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
      cta: ot('home.ctaOpen'),
      icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
    })
  }

  if (data.topRestaurant) {
    cards.push({
      href: '/office/food/picks',
      label: ot('home.topRestaurant'),
      value: data.topRestaurant,
      tint: TINTS.food,
      cta: ot('home.ctaOpen'),
      icon: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z',
    })
  }

  if (cards.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      <div className={cn('hero-stagger grid gap-3', gridFor(cards.length))}>
        {cards.map((c) => (
          <Link
            key={c.href + c.label}
            href={c.href}
            style={{ '--tint': c.tint } as CSSProperties}
            className={cn(
              'tint-card lift group relative isolate flex flex-col overflow-hidden rounded-3xl',
              'border bg-elevated/50 p-5 backdrop-blur-md',
              /*
               * ★★ การ์ดเงินมีขอบเป็นสีของตัวเอง ไม่ใช่สีเส้นกลางเหมือนใบอื่น
               *    ★ ทำให้ "ต้องจ่าย" มองเห็นได้จากหางตาโดยไม่ต้องอ่าน
               *      ★★ ใบที่ไม่ใช่เรื่องเงินยังเป็นขอบกลาง — ถ้าทุกใบเด่น
               *         ก็แปลว่าไม่มีใบไหนเด่น
               */
              c.flow ? 'border-[rgb(var(--tint)/0.45)]' : 'border-line',
            )}
          >
            <span className="tint-glow" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background: c.flow
                  ? 'radial-gradient(130% 90% at 88% -10%, rgb(var(--tint) / 0.14), transparent 62%)'
                  : 'radial-gradient(120% 80% at 88% -10%, rgb(var(--tint) / 0.08), transparent 58%)',
              }}
            />

            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                {/*
                  * ★★★ ป้ายทิศทางมาก่อนชื่อรายการ
                  *
                  *     ★ "เงินออก" ตอบคำถามที่คนถามจริง ๆ ส่วน "ฉันค้างจ่าย"
                  *       เป็นชื่อของตัวเลข ไม่ใช่คำตอบ
                  *       ★★ และป้ายมีพื้นสีเต็ม จึงอ่านได้ก่อนตัวหนังสือรอบ ๆ
                  */}
                {c.flow ? (
                  <span
                    className={cn(
                      'mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                      'text-[10px] font-bold uppercase tracking-wide',
                      'bg-[rgb(var(--tint)/0.16)] text-[rgb(var(--tint))]',
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={c.icon} />
                    </svg>
                    {/* ★ กุญแจใหม่ยังมีแต่ไทย — ป้าย lang="th" บอกความจริงนั้น
                        และหายเองวันที่แปลเสร็จ (ดู lib/i18n/untranslated.tsx) */}
                    {markThai(locale, c.flow === 'out' ? ot('home.flowOut') : ot('home.flowIn'))}
                  </span>
                ) : null}

                <span className="block text-xs text-ink-soft">{c.label}</span>
                {/* ★ ชื่อร้านเป็นของผู้ใช้ — ภาษาอะไรก็ได้ ไม่เกี่ยวกับภาษาของหน้า */}
                <span
                  dir="auto"
                  className={cn(
                    'mt-1 block truncate text-[28px] font-bold leading-tight tracking-tight tabular-nums',
                    /*
                     * ★★ ตัวเลขเงินใช้สีของทิศทาง ไม่ใช่สีเตือน
                     *    ★ ของเดิมทาสีส้มเมื่อมีรายการค้างเกิน 7 วัน ซึ่งทำให้
                     *      ตัวเลขสองใบที่ "ทิศตรงข้ามกัน" กลายเป็นสีเดียวกัน
                     *      ★★ ความเร่งด่วนย้ายไปอยู่บรรทัดล่างแทน ซึ่งเป็น
                     *         ที่ของมันอยู่แล้ว
                     */
                    c.flow ? 'text-[rgb(var(--tint))]' : 'text-ink',
                  )}
                >
                  {c.value}
                </span>
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

            {c.sub ? (
              <span
                className={cn(
                  'mt-2 inline-flex w-fit items-center gap-1 text-[11px]',
                  /* ★ พื้นและระยะขอบในมีเฉพาะป้ายเตือน — คำอธิบายเฉย ๆ
                       ที่มี px-2 จะดูเยื้องเข้ามาจากบรรทัดอื่นโดยไม่มีเหตุผล */
                  c.tone === 'warn'
                    ? 'rounded-full bg-warn/15 px-2 py-0.5 text-warn'
                    : 'text-ink-faint',
                )}
              >
                {c.tone === 'warn' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 3 2.5 20h19zm0 6v5m0 2.2v.6" />
                  </svg>
                ) : null}
                {c.sub}
              </span>
            ) : null}

            {/*
              * ★ บรรทัดล่างสุดบอกว่ากดแล้วได้ทำอะไร ไม่ใช่แค่ "ไปที่ไหน"
              *   ★★ mt-auto ดันไปชิดล่าง ทุกใบจึงมีเส้นฐานเดียวกันแม้บางใบ
              *      ไม่มีป้ายความเร่งด่วน
              */}
            <span className="mt-auto flex items-center gap-1 pt-4 text-[12px] font-medium text-[rgb(var(--tint))]">
              {markThai(locale, c.cta)}
              <svg
                viewBox="0 0 24 24"
                className="size-3.5 transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/**
 * คอลัมน์ตามจำนวนการ์ด
 *
 * ★★★ ตรึง lg:grid-cols-3 ไว้ตายตัวไม่ได้ เพราะจำนวนการ์ดไม่คงที่
 *
 *     ★ การ์ดโผล่เฉพาะเมื่อมีอะไรให้ทำ จึงมีได้ตั้งแต่ 1 ถึง 5 ใบ
 *       ★★ 4 ใบในตาราง 3 คอลัมน์ = แถวล่างมีใบเดียวลอยอยู่กับที่ว่างสองช่อง
 *          ซึ่งอ่านเป็น "ยังโหลดไม่เสร็จ" ไม่ใช่ "มีสี่อย่าง"
 *     ★ 5 ใบยอมให้แถวล่างเหลือสอง — สองใบคู่กันยังอ่านเป็นแถว ส่วนใบเดียว
 *       อ่านเป็นของตกค้าง
 */
function gridFor(count: number): string {
  if (count === 1) return 'max-w-sm'
  if (count === 2) return 'sm:grid-cols-2'
  if (count === 4) return 'sm:grid-cols-2 lg:grid-cols-4'
  return 'sm:grid-cols-2 lg:grid-cols-3'
}
