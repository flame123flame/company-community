import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'
import type { DictKey, Translate } from '@/lib/i18n/dict'

/**
 * เนื้อหาบอกความสามารถของระบบบนหน้าแรก
 *
 * ★★★ ทุกบรรทัดต้องเป็นสิ่งที่ระบบทำได้จริงวันนี้
 *
 *     หน้าแนะนำฟีเจอร์เขียนง่ายมากถ้ายอมใส่คำโฆษณา ("ทำงานร่วมกันอย่างไร้รอยต่อ")
 *     ★ แต่คำพวกนั้นไม่ได้บอกอะไรกับคนอ่าน และพอเข้าไปใช้จริงแล้วไม่เจอ
 *       สิ่งที่เขียนไว้ ความเชื่อถือของทั้งหน้าก็หายไปพร้อมกัน
 *
 *     ★★ ทุกข้อในไฟล์นี้จึงชี้ไปที่ฟีเจอร์ที่มีอยู่จริง:
 *        "หารให้ครบบาท" = อัลกอริทึมกระจายเศษใน create_expense_bill
 *        "ลดโอกาสร้านที่เพิ่งไปกิน" = weightByRecency ใน lib/office/food.ts
 *        "ทุกคนเห็นผลเดียวกัน" = ผลถูกตัดสินใน spin_draw_room ฝั่งฐานข้อมูล
 *
 * ★ แปลครบ 16 ภาษาเหมือนส่วนอื่นของหน้าแรก — หน้านี้เป็นหน้าสาธารณะ
 */

type DemoKind = 'food' | 'wallet' | 'fun' | 'market'

type Feature = {
  href: string
  titleKey: DictKey
  detailKey: DictKey
  bulletKeys: DictKey[]
  icon: string
  demo: DemoKind
  /* ★ สีประจำโมดูล — ชุดเดียวกับการ์ดพอร์ทัลและกล่องแจ้งเตือน */
  tint: string
}

const FEATURES: Feature[] = [
  {
    href: '/office/food/random',
    demo: 'food',
    tint: '255 149 0',
    titleKey: 'hub.food',
    detailKey: 'hub.foodDetail',
    bulletKeys: ['feat.food.b1', 'feat.food.b2', 'feat.food.b3'],
    icon: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
  },
  {
    href: '/office/wallet/owed',
    demo: 'wallet',
    tint: '52 199 123',
    titleKey: 'hub.wallet',
    detailKey: 'hub.walletDetail',
    bulletKeys: ['feat.wallet.b1', 'feat.wallet.b2', 'feat.wallet.b3'],
    icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
  },
  {
    href: '/office/fun/name',
    demo: 'fun',
    tint: '175 82 222',
    titleKey: 'hub.fun',
    detailKey: 'hub.funDetail',
    bulletKeys: ['feat.fun.b1', 'feat.fun.b2', 'feat.fun.b3'],
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3',
  },
  {
    href: '/office/market',
    demo: 'market',
    tint: '10 132 255',
    titleKey: 'hub.market',
    detailKey: 'hub.marketDetail',
    bulletKeys: ['feat.market.b1', 'feat.market.b2', 'feat.market.b3'],
    icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
  },
]

const WHY: { key: DictKey; icon: string }[] = [
  { key: 'why.1', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
  { key: 'why.2', icon: 'M4 6h16v10H4zM2 20h20M9 16l-.5 2M15 16l.5 2' },
  { key: 'why.3', icon: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4 15h2' },
  { key: 'why.4', icon: 'M17 9V7a5 5 0 0 0-10 0v2M5 9h14v12H5z' },
]

/** คำที่วิ่งในแถบคั่น — หยิบจากคีย์ที่แปลครบ 16 ภาษาอยู่แล้ว ไม่เพิ่มคำใหม่ */
const TICKER: DictKey[] = ['hub.food', 'hub.wallet', 'hub.fun', 'hub.market', 'hub.music']

export async function HubFeatures() {
  const { t } = await getT()

  return (
    <>
      {/* ═══ ฟีเจอร์รายโมดูล ═══════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1120px] px-4 pt-20">
        <div className="reveal text-center">
          <h2 className="text-[26px] font-bold tracking-tight sm:text-[34px]">{t('feat.title')}</h2>
          <span className="title-underline mx-auto mt-4" aria-hidden="true" />
          <p className="mx-auto mt-4 max-w-[520px] text-sm leading-relaxed text-ink-soft">
            {t('feat.detail')}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {FEATURES.map((feature, index) => (
            <FeatureRow key={feature.href} feature={feature} index={index} t={t} />
          ))}
        </div>
      </section>

      {/* ═══ แถบคำวิ่ง ═══════════════════════════════════════════════ */}
      {/*
        * ★ จางที่ขอบทั้งสองข้างด้วย mask — ไม่งั้นคำจะ "โผล่/หาย" กลางอากาศ
        *   ซึ่งอ่านเป็นข้อบกพร่องมากกว่าการเคลื่อนไหวที่ตั้งใจ
        */}
      <section
        aria-hidden="true"
        className="relative mt-20 overflow-hidden border-y border-line/60 py-4"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        }}
      >
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center gap-8 pe-8">
              {TICKER.map((key) => (
                <span
                  key={`${copy}-${key}`}
                  className="flex shrink-0 items-center gap-8 text-sm text-ink-faint"
                >
                  {t(key)}
                  <span className="size-1 rounded-full bg-accent/50" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ═══ ทำไมเริ่มใช้ได้เลย ═══════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1120px] px-4 pt-20">
        <div className="reveal text-center">
          <h2 className="text-[22px] font-bold tracking-tight sm:text-[28px]">{t('why.title')}</h2>
          <span className="title-underline mx-auto mt-4" aria-hidden="true" />
        </div>

        <ul className="reveal-stagger mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((item) => (
            <li
              key={item.key}
              className="rounded-3xl border border-line bg-elevated/40 p-5 backdrop-blur-md"
            >
              <span
                aria-hidden="true"
                className="float-slow grid size-10 place-items-center rounded-xl bg-surface text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <path d={item.icon} />
                </svg>
              </span>
              <p className="mt-3.5 text-sm leading-relaxed text-ink">{t(item.key)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ═══ เริ่มใน 3 ขั้น ═══════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[880px] px-4 pt-20">
        <div className="reveal text-center">
          <h2 className="text-[22px] font-bold tracking-tight sm:text-[28px]">{t('steps.title')}</h2>
          <span className="title-underline mx-auto mt-4" aria-hidden="true" />
        </div>

        <ol className="reveal-stagger mt-7 grid gap-3 sm:grid-cols-3">
          {(['steps.1', 'steps.2', 'steps.3'] as DictKey[]).map((key, index) => (
            <li
              key={key}
              className="relative rounded-3xl border border-line bg-elevated/40 p-5 backdrop-blur-md"
            >
              {/*
               * ★ เลขลำดับเป็นตัวใหญ่จาง ๆ ไม่ใช่วงกลมสีเน้น
               *   ★★ วงกลมสีเน้นสามอันเรียงกันแย่งความสนใจกับปุ่มหลักของหน้า
               *      ซึ่งเป็นสิ่งเดียวที่เราอยากให้คนกดจริง ๆ
               */}
              <span
                aria-hidden="true"
                className="absolute end-4 top-3 text-[44px] font-bold leading-none text-ink/[0.07]"
              >
                {index + 1}
              </span>
              <p className="relative text-sm leading-relaxed text-ink">{t(key)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ═══ ปิดท้าย ═══════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-[1120px] px-4 pt-16">
        <div className="conic-ring reveal-scale relative overflow-hidden rounded-3xl border border-line bg-elevated/60 px-6 py-14 text-center backdrop-blur-md sm:py-16">
          <div className="aurora-field" aria-hidden="true">
            <div className="aurora-blob aurora-blob-1" />
            <div className="aurora-blob aurora-blob-3" />
          </div>

          <div className="relative">
            <h2 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[36px]">
              {t('hubcta.title')}
            </h2>
            <Link
              /* ★ เคยชี้ไป /office ซึ่งเป็นพอร์ทัลที่ยุบไปแล้ว
                   ★★ ตอนนี้เลื่อนขึ้นไปที่การ์ดเมนูบนหน้าเดียวกันแทน */
              href="#systems"
              className={cn(
                'pulse-ring mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-8',
                'font-medium text-accent-ink transition-all',
                'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
                'active:scale-[0.98]',
              )}
            >
              {t('hubcta.button')}
              <svg
                viewBox="0 0 24 24"
                className="size-4 rtl:-scale-x-100"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

/**
 * แถวฟีเจอร์หนึ่งโมดูล
 *
 * ★ สลับซ้าย-ขวาไปมา เพื่อให้สายตาไม่ไถผ่านสี่แถวที่หน้าตาเหมือนกันเป๊ะ
 *   ★★ บนจอแคบไม่สลับ เพราะทุกอย่างเรียงลงล่างอยู่แล้ว การสลับจะกลายเป็น
 *      แค่ลำดับที่อ่านแล้วงงว่าทำไมไอคอนบางอันอยู่คนละฝั่ง
 */
function FeatureRow({ feature, index, t }: { feature: Feature; index: number; t: Translate }) {
  const flipped = index % 2 === 1

  return (
    <Link
      href={feature.href}
      style={{ '--tint': feature.tint } as CSSProperties}
      className={cn(
        'tint-card lift sheen group relative isolate flex flex-col gap-5 overflow-hidden rounded-3xl',
        'border border-line bg-elevated/40 p-6 backdrop-blur-md sm:p-8',
        'lg:flex-row lg:items-center lg:gap-10',
        flipped && 'lg:flex-row-reverse',
      )}
    >
      <span className="tint-glow" aria-hidden="true" />

      {/*
        * ★★ สีประจำโมดูลติดแถวไว้ตลอด ไม่ใช่โผล่ตอนชี้
        *    ★ สี่แถวที่เป็นสีดำเหมือนกันหมดคือสี่แถวที่ตาไถผ่านโดยไม่หยุด
        *      ★★ การสลับซ้าย-ขวาอย่างเดียวช่วยได้ระดับหนึ่ง แต่สีคือสิ่งที่
        *         บอกว่า "นี่คนละเรื่องกับแถวบน" ได้เร็วกว่าตำแหน่ง
        */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: flipped
            ? 'radial-gradient(90% 120% at 8% 50%, rgb(var(--tint) / 0.09), transparent 62%)'
            : 'radial-gradient(90% 120% at 92% 50%, rgb(var(--tint) / 0.09), transparent 62%)',
        }}
      />
      <div className="lg:w-[38%]">
        <span
          aria-hidden="true"
          className={cn(
            'float-slow grid size-14 place-items-center rounded-2xl',
            'text-[rgb(var(--tint))] ring-1 ring-[rgb(var(--tint)/0.3)]',
            'shadow-[0_12px_30px_-16px] shadow-[rgb(var(--tint)/0.9)]',
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
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-7"
          >
            <path d={feature.icon} />
          </svg>
        </span>

        <h3 className="mt-5 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">
          {t(feature.titleKey)}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t(feature.detailKey)}</p>
      </div>

      <ul className="flex flex-col gap-2.5 lg:w-[34%]">
        {feature.bulletKeys.map((key) => (
          /* ★ ติ๊กถูกอยู่ในวงกลมสีประจำโมดูล ★★ ติ๊กเปล่า ๆ สีแดงเหมือนกันทั้งสี่แถว
               ทำให้รายการทั้ง 12 ข้อดูเป็นกองเดียวกัน ไม่ได้แยกว่าเป็นของโมดูลไหน */
          <li key={key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
              style={{ background: 'rgb(var(--tint) / 0.18)' }}
            >
              <svg viewBox="0 0 24 24" className="size-3 text-[rgb(var(--tint))]" fill="currentColor">
                <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
              </svg>
            </span>
            <span className="text-sm leading-relaxed text-ink">{t(key)}</span>
          </li>
        ))}
      </ul>

      {/* ★ เดโมอยู่ท้ายสุดในโค้ด แต่แสดงกลาง/ขวาบนจอกว้าง
          ★★ เป็น aria-hidden ทั้งก้อน — มันเล่าเรื่องเดียวกับหัวข้อข้างบน
             โปรแกรมอ่านหน้าจอไม่ควรต้องฟังซ้ำเป็นชิ้นส่วนที่ไม่มีความหมาย */}
      <div className="lg:flex-1">
        <FeatureDemo kind={feature.demo} t={t} />
      </div>
    </Link>
  )
}

/**
 * เดโมเคลื่อนไหวของแต่ละโมดูล
 *
 * ★★ แสดง "วิธีทำงาน" ไม่ใช่ภาพประดับ
 *    คนกวาดตาผ่านหนึ่งวินาทีแล้วเข้าใจว่าวงล้อหมุนยังไง บิลถูกหารยังไง
 *    ★ เร็วกว่าการอ่านสามบรรทัดข้างบนมาก และทำให้สามบรรทัดนั้นน่าเชื่อขึ้น
 */
function FeatureDemo({ kind, t }: { kind: DemoKind; t: Translate }) {
  if (kind === 'food') {
    return (
      <div className="demo-box tinted h-36 px-4" aria-hidden="true">
        {/* เข็มชี้ตรงกลาง เหมือนวงล้อจริงในหน้าสุ่มอาหาร */}
        <div className="absolute inset-x-0 top-0 z-10 mx-auto h-0 w-0 border-x-6 border-t-8 border-x-transparent border-t-accent" />
        <div className="absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-accent/25" />
        {/* ★ pt-12 ดันแถวแรกให้อยู่กลางกล่องพอดี (48 + 16 = 64 = ครึ่งของ 128) */}
        <div className="demo-roll flex flex-col pt-12">
          {/* ★★ ชื่อร้านมาจากดิกชันนารี ไม่ฝังไทยไว้ตรงนี้
              ★ เดโมนี้อยู่บนหน้าแรกซึ่งเป็นหน้าที่คนทั่วโลกเปิดเจอก่อนอย่างอื่น
                ★★ ชื่ออาหารไทยกลางหน้าภาษาเยอรมันอ่านเป็น "หน้าแปลไม่เสร็จ"
                   ไม่ใช่ "ร้านในวงล้อ" — ซึ่งเป็นความประทับใจแรกที่เสียเปล่า
              ★ วนซ้ำอันแรกต่อท้ายให้วงล้อไหลต่อเนื่องไม่กระตุกตอนวนรอบ */}
          {(() => {
            const names = t('home.demo.food').split('·').map((x) => x.trim()).filter(Boolean)
            return [...names, names[0] ?? '']
          })().map((name, i) => (
            <span
              key={i}
              dir="auto"
              className="flex h-8 shrink-0 items-center justify-center text-sm font-medium text-ink"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (kind === 'wallet') {
    return (
      <div className="demo-box tinted grid h-36 place-items-center px-4" aria-hidden="true">
        <div className="w-full max-w-[220px]">
          <p className="text-center text-lg font-bold tabular-nums text-ink">฿1,200.00</p>
          <div className="demo-split mt-2.5 flex justify-center gap-1.5">
            {[400, 400, 400].map((amount, i) => (
              <span
                key={i}
                className="rounded-full bg-surface px-2.5 py-1 text-xs tabular-nums text-ink-soft"
              >
                ฿{amount}.00
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'fun') {
    return (
      <div className="demo-box tinted grid h-36 place-items-center px-4" aria-hidden="true">
        <div className="flex w-full max-w-[200px] gap-2">
          {[0, 1].map((team) => (
            <div key={team} className="flex flex-1 flex-col gap-1.5">
              {[0, 1].map((slot) => (
                <span
                  key={slot}
                  className={cn(
                    'h-6 rounded-full',
                    team === 0 ? 'bg-accent/70' : 'bg-link/60',
                    /* ★ ชิปคู่ล่างของสองทีมสลับที่กัน = ภาพของการจับทีมใหม่ */
                    slot === 1 && (team === 0 ? 'demo-swap-a' : 'demo-swap-b'),
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="demo-box tinted grid h-36 place-items-center px-4" aria-hidden="true">
      <div className="flex w-full max-w-[220px] items-center gap-3 rounded-xl bg-surface/70 p-2.5">
        <span className="size-10 shrink-0 rounded-lg bg-line" />
        <span className="min-w-0 flex-1">
          <span className="block h-2.5 w-3/4 rounded-full bg-line" />
          <span className="mt-1.5 block h-2 w-1/2 rounded-full bg-line/60" />
        </span>
        <span className="demo-pulse rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">
          +1
        </span>
      </div>
      <span className="sr-only">{t('hub.market')}</span>
    </div>
  )
}
