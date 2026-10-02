import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * พอร์ทัลรวมทุกระบบบนหน้าแรก
 *
 * ★★★ ห้องฟังเพลงเป็นการ์ดใบแรกและใบใหญ่ — เป็นฟีเจอร์ที่คนใช้บ่อยที่สุด
 *
 *     แต่เป็นการ์ดใบหนึ่ง ไม่ใช่เจ้าของหน้า
 *     ★ กดแล้วไป /music ซึ่งมีหน้าเดิมครบทุกชิ้น — กล่องเปิดห้อง ·
 *       เข้าด้วยรหัส · รายชื่อห้อง · วิธีใช้ · คำถามที่พบบ่อย
 *
 * ★★★ แต่ละใบมีสีประจำตัว ไม่ใช่สีเน้นสีเดียวกันหมด
 *
 *     การ์ดหกใบที่หน้าตาเหมือนกันเป๊ะทำให้ตาไถผ่านโดยไม่หยุดที่ใบไหนเลย
 *     ★ สีประจำโมดูลทำให้คนจำได้ว่า "กระเป๋าเงินคือใบสีเขียว" ภายในสองสามครั้ง
 *       แล้วครั้งต่อไปเขาเล็งไปที่สีก่อนอ่านชื่อด้วยซ้ำ
 *     ★★ ส่งสีผ่าน CSS variable ไม่ใช่คลาสคงที่ — เพิ่มโมดูลใหม่แค่เติมแถว
 *        ในตารางข้างล่าง ไม่ต้องไปเขียนคลาสใหม่ในไฟล์ CSS
 *
 * ★★ ทุกข้อความแปลครบ 16 ภาษา ไม่ใช่ไทยอย่างเดียวเหมือนในโมดูลออฟฟิศ
 *    เพราะหน้านี้เป็นหน้าสาธารณะที่มีคนเปิดจากภาษาอื่นจริง
 *    (scripts/i18n-test.ts ตรวจข้อความไทยหลุดอยู่ และจะจับได้ทันทีถ้าพลาด)
 */

type Card = {
  href: string
  titleKey: DictKey
  detailKey: DictKey
  icon: string
  /** สีประจำโมดูล เป็น rgb triplet เพื่อส่งเข้า CSS variable ได้ตรง ๆ */
  tint: string
  /** ภาพตัวอย่างเล็ก ๆ ที่บอกว่าข้างในมีอะไร */
  demo: 'eq' | 'wheel' | 'split' | 'dice' | 'queue' | 'grid' | 'bubble'
  /** ★ ใบสุดท้ายกินเต็มแถว — ไม่งั้นมันจะเหลือใบเดียวโดด ๆ ในแถวสุดท้าย */
  full?: boolean
}

const CARDS: Card[] = [
  {
    href: '/music',
    titleKey: 'hub.music',
    detailKey: 'hub.musicDetail',
    icon: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    tint: '255 0 51',
    demo: 'eq',
  },
  {
    href: '/office/food/random',
    titleKey: 'hub.food',
    detailKey: 'hub.foodDetail',
    icon: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
    tint: '255 149 0',
    demo: 'wheel',
  },
  {
    href: '/office/wallet/owed',
    titleKey: 'hub.wallet',
    detailKey: 'hub.walletDetail',
    icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
    tint: '52 199 123',
    demo: 'split',
  },
  {
    href: '/office/fun/name',
    titleKey: 'hub.fun',
    detailKey: 'hub.funDetail',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3',
    tint: '175 82 222',
    demo: 'dice',
  },
  {
    href: '/office/market',
    titleKey: 'hub.market',
    detailKey: 'hub.marketDetail',
    icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
    tint: '10 132 255',
    demo: 'queue',
  },
  {
    href: '/office/chat',
    titleKey: 'hub.chat',
    detailKey: 'hub.chatDetail',
    icon: 'M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z',
    tint: '48 209 176',
    demo: 'bubble',
  },
]

/** แถบอีควอไลเซอร์ในการ์ดห้องเพลง — ค่าคงที่ ห้ามสุ่มตอน render */
const EQ = [40, 72, 96, 55, 88, 34, 66, 100, 48, 80, 60, 92]

/**
 * ภาพตัวอย่างในการ์ด
 *
 * ★★ ทุกอันใช้ rgb(var(--tint)) ที่การ์ดส่งมา จึงเป็นสีประจำโมดูลเองอัตโนมัติ
 *    ★ ไม่มีการฮาร์ดโค้ดสีในนี้แม้แต่จุดเดียว — เพิ่มโมดูลใหม่ก็ได้สีถูกทันที
 *
 * ★★★ เป็น aria-hidden ทั้งหมด — มันเล่าเรื่องเดียวกับคำอธิบายข้างบน
 *      โปรแกรมอ่านหน้าจอไม่ควรต้องฟังซ้ำเป็นชิ้นส่วนที่ไม่มีความหมาย
 */
function CardDemo({ kind }: { kind: Card['demo'] }) {
  if (kind === 'eq') {
    return (
      <span
        aria-hidden="true"
        className="relative flex h-7 items-end gap-[3px]"
        style={{
          maskImage: 'linear-gradient(90deg, #000 55%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, #000 55%, transparent)',
        }}
      >
        {EQ.map((height, index) => (
          <span
            key={index}
            className="eq-bar w-[3px] rounded-full bg-[rgb(var(--tint)/0.6)]"
            style={{
              height: `${height}%`,
              animationDuration: `${0.8 + (index % 5) * 0.12}s`,
              animationDelay: `${(index % 4) * 0.09}s`,
            }}
          />
        ))}
      </span>
    )
  }

  if (kind === 'wheel') {
    /* ★ วงล้อจิ๋วหมุนช้า ๆ พร้อมเข็มที่นิ่ง — ย่อหน้าสุ่มอาหารลงมาทั้งหน้า */
    return (
      <span aria-hidden="true" className="relative mt-4 block size-9">
        <span
          className="mini-wheel absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(rgb(var(--tint)) 0deg 60deg, rgb(var(--tint)/0.45) 60deg 120deg, rgb(var(--tint)/0.8) 120deg 180deg, rgb(var(--tint)/0.35) 180deg 240deg, rgb(var(--tint)/0.65) 240deg 300deg, rgb(var(--tint)/0.25) 300deg 360deg)',
          }}
        />
        <span className="absolute inset-[30%] rounded-full bg-elevated" />
        <span className="absolute -top-1 left-1/2 size-0 -translate-x-1/2 border-x-4 border-t-[7px] border-x-transparent border-t-[rgb(var(--tint))]" />
      </span>
    )
  }

  if (kind === 'split') {
    /* ★ ยอดเดียวแตกเป็นสามก้อน — ภาพของการหารบิล */
    return (
      <span aria-hidden="true" className="demo-split mt-4 flex items-center gap-1.5">
        {['400', '400', '400'].map((amount, i) => (
          <span
            key={i}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
            style={{
              background: 'rgb(var(--tint) / 0.16)',
              color: 'rgb(var(--tint))',
            }}
          >
            ฿{amount}
          </span>
        ))}
      </span>
    )
  }

  if (kind === 'dice') {
    /* ★ ลูกเต๋าพลิกไปมา — ภาพของการสุ่ม */
    return (
      <span aria-hidden="true" className="mt-4 flex items-center gap-2">
        <span
          className="dice-flip grid size-8 place-items-center rounded-lg"
          style={{ background: 'rgb(var(--tint) / 0.16)' }}
        >
          <span className="grid grid-cols-2 gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="size-1 rounded-full bg-[rgb(var(--tint))]" />
            ))}
          </span>
        </span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-5 rounded-full"
              style={{ background: `rgb(var(--tint) / ${0.55 - i * 0.15})` }}
            />
          ))}
        </span>
      </span>
    )
  }

  if (kind === 'queue') {
    /* ★ ประกาศหนึ่งชิ้นกับป้ายคิวที่เด้ง — ภาพของตลาดนัด */
    return (
      <span aria-hidden="true" className="mt-4 flex items-center gap-2">
        <span className="size-8 rounded-lg" style={{ background: 'rgb(var(--tint) / 0.2)' }} />
        <span className="flex flex-col gap-1">
          <span className="h-1.5 w-14 rounded-full bg-line" />
          <span className="h-1.5 w-9 rounded-full bg-line/60" />
        </span>
        <span
          className="demo-pulse rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: 'rgb(var(--tint))', color: 'var(--color-page)' }}
        >
          +1
        </span>
      </span>
    )
  }

  if (kind === 'bubble') {
    /* ★ ฟองข้อความสองฝั่งกับจุดกำลังพิมพ์ — ภาพของแชทในสองวินาที */
    return (
      <span aria-hidden="true" className="demo-split mt-4 flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          <span
            className="h-4 w-12 rounded-full rounded-bl-sm"
            style={{ background: 'rgb(var(--tint) / 0.24)' }}
          />
        </span>
        <span className="flex items-center justify-end gap-1.5">
          <span
            className="h-4 w-16 rounded-full rounded-br-sm"
            style={{ background: 'rgb(var(--tint))' }}
          />
        </span>
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="demo-pulse size-1.5 rounded-full"
              style={{
                background: 'rgb(var(--tint) / 0.6)',
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </span>
      </span>
    )
  }

  /* ★ ตารางจุดที่สว่างไล่กัน — ภาพของหน้ารวมทุกกิจกรรม */
  return (
    <span aria-hidden="true" className="dot-seq mt-4 grid w-fit grid-cols-3 gap-1.5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="size-2 rounded-[3px] bg-[rgb(var(--tint))]" />
      ))}
    </span>
  )
}

export async function SystemHub() {
  const { t } = await getT()

  return (
    <section id="systems" className="mx-auto w-full max-w-[1120px] scroll-mt-20 px-4 pt-4">
      <h2 className="reveal text-center text-sm text-ink-soft">{t('hub.detail')}</h2>

      <div className="reveal-stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{ '--tint': card.tint } as CSSProperties}
            className={cn(
              'tint-card sheen lift group relative isolate flex flex-col overflow-hidden rounded-3xl',
              'border border-line bg-elevated/50 p-6 backdrop-blur-md',
              card.full
                ? 'sm:col-span-2 lg:col-span-3 lg:flex-row lg:items-center lg:gap-6'
                : 'min-h-[218px]',
            )}
          >
            {/* ★ แสงประจำสีของการ์ด โผล่ตอนชี้ — เป็น element ไม่ใช่ ::after
                เพราะ ::after ถูก .sheen ใช้ไปแล้ว */}
            <span className="tint-glow" aria-hidden="true" />

            {/*
              * ★★ สีของโมดูลติดอยู่ที่การ์ดตลอดเวลา ไม่ใช่โผล่ตอนชี้อย่างเดียว
              *
              *    ★ การ์ดที่เป็นสีเทาเหมือนกันหมดจนกว่าจะเอาเมาส์ไปชี้ คือการ์ด
              *      ที่บนมือถือไม่มีสีเลยตลอดกาล — เพราะมือถือไม่มีการชี้
              *    ★★ จาง 7% พอให้แยกใบได้ด้วยหางตา แต่ไม่แย่งความสนใจจากตัวหนังสือ
              */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  'radial-gradient(120% 80% at 88% -10%, rgb(var(--tint) / 0.07), transparent 58%)',
              }}
            />

            <span
              aria-hidden="true"
              className={cn(
                'float-slow relative grid size-14 shrink-0 place-items-center rounded-2xl',
                'text-[rgb(var(--tint))] ring-1 ring-[rgb(var(--tint)/0.3)]',
                'shadow-[0_10px_26px_-14px] shadow-[rgb(var(--tint)/0.9)]',
                'transition-transform duration-500 group-hover:scale-110',
              )}
              style={{
                background:
                  'linear-gradient(145deg, rgb(var(--tint) / 0.24), rgb(var(--tint) / 0.10))',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-7"
              >
                <path d={card.icon} />
              </svg>
            </span>

            <span className={cn('relative block', card.full && 'lg:flex lg:items-baseline lg:gap-3')}>
              <p
                className={cn(
                  'text-[19px] font-semibold tracking-tight',
                  card.full ? 'mt-5 lg:mt-0' : 'mt-5',
                )}
              >
                {t(card.titleKey)}
              </p>
              <p
                className={cn(
                  'text-[13px] leading-relaxed text-ink-soft',
                  card.full ? 'mt-1.5 lg:mt-0' : 'mt-1.5',
                )}
              >
                {t(card.detailKey)}
              </p>
            </span>

            {/* ★ ภาพตัวอย่างที่ขยับ — บอกว่าเข้าไปแล้วเจออะไร โดยไม่ต้องอ่าน
                ★★ mt-auto ดันไปชิดล่าง ทุกใบจึงมีเส้นฐานเดียวกันแม้คำอธิบายยาวไม่เท่ากัน */}
            {card.full ? null : (
              <span className="relative mt-auto block pt-4">
                <CardDemo kind={card.demo} />
              </span>
            )}

            {/* ★ ลูกศรเลื่อนเข้ามาตอนชี้ — บอกว่ากดได้โดยไม่กินที่ตอนอ่านเฉย ๆ */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute end-6 top-6 text-[rgb(var(--tint))] opacity-0 transition-all duration-300',
                'group-hover:translate-x-0.5 group-hover:opacity-100 rtl:group-hover:-translate-x-0.5',
              )}
            >
              <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor">
                <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
