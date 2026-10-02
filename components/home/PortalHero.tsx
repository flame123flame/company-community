import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { HomeStats } from '@/lib/home/stats'
import { getT } from '@/lib/i18n/server'
import { Phantoms } from './Phantom'

/**
 * หัวหน้าแรก — พอร์ทัลของทั้งบริษัท
 *
 * ★★★ ห้องฟังเพลงไม่ใช่ตัวเว็บอีกต่อไป มันเป็นหนึ่งในฟีเจอร์
 *
 *     หัวหน้าเดิมพูดว่า "ฟังเพลงด้วยกันแบบวินาทีต่อวินาที" ซึ่งเป็นคำสัญญา
 *     ของฟีเจอร์เดียว ★ คนที่เข้ามาเพื่อหารบิลหรือลงประกาศขายของจะอ่านแล้ว
 *     คิดว่ามาผิดเว็บ แล้วปิดไปก่อนจะเลื่อนลงเห็นการ์ดอื่น
 *
 *     ★★ หัวหน้าใหม่พูดถึงสิ่งที่เว็บนี้เป็นจริง ๆ: ที่รวมของออฟฟิศ
 *        ส่วนคำสัญญาของห้องเพลงย้ายไปอยู่ที่หน้า /music ซึ่งเป็นที่ของมัน
 *
 * ★ ใช้เอฟเฟกต์ชุดเดิมทุกตัว (aurora · curtain · hero-in) ไม่ได้เขียนใหม่
 *   ★★ แต่เอาแผ่นเสียงกับโน้ตดนตรีออก — สองอย่างนั้นบอกว่า "ที่นี่เรื่องเพลง"
 *      ซึ่งเป็นข้อความที่เพิ่งตั้งใจเลิกพูดบนหน้านี้
 */
const SPARKS = [
  { left: 8, top: 22, size: 3, delay: 0, dur: 5 },
  { left: 17, top: 68, size: 2, delay: 1.4, dur: 6.5 },
  { left: 29, top: 14, size: 2, delay: 2.8, dur: 5.5 },
  { left: 41, top: 78, size: 3, delay: 0.7, dur: 7 },
  { left: 58, top: 20, size: 2, delay: 3.4, dur: 6 },
  { left: 69, top: 62, size: 3, delay: 1.9, dur: 5.2 },
  { left: 80, top: 30, size: 2, delay: 4.2, dur: 6.8 },
  { left: 91, top: 72, size: 3, delay: 2.3, dur: 5.8 },
]

export async function PortalHero({ stats }: { stats: HomeStats }) {
  const { t } = await getT()

  return (
    <section className="relative isolate overflow-hidden px-4 pb-8 pt-14 sm:pb-12 sm:pt-24">
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      {/* ★ ร่างที่เดินผ่าน — อยู่หลังทุกอย่างและปิด pointer-events
          จึงไม่บังการอ่านหรือขวางการกดปุ่มแม้แต่เฟรมเดียว */}
      <Phantoms />

      {/*
        * ★ ดาวกะพริบ — ตำแหน่ง/จังหวะคิดไว้ล่วงหน้าเป็นค่าคงที่
        *   ★★ ห้ามสุ่มตอน render เด็ดขาด ค่าที่ server กับ client สุ่มได้
        *      ไม่มีทางตรงกัน แล้ว React จะทิ้งต้นไม้ทั้งหน้าไปวาดใหม่
        *      (บทเรียนเดียวกับ EQ_BARS ของหน้าห้องเพลง)
        */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {SPARKS.map((sp, i) => (
          <span
            key={i}
            className="spark"
            style={
              {
                left: `${sp.left}%`,
                top: `${sp.top}%`,
                width: sp.size,
                height: sp.size,
                '--d': `${sp.delay}s`,
                '--dur': `${sp.dur}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-[720px] text-center">
        {/*
         * ★ ป้ายยังบอกจำนวนห้องเพลงที่เปิดอยู่ เพราะเป็นตัวเลข "ตอนนี้"
         *   ตัวเดียวที่หน้านี้รู้ได้โดยไม่ต้องรู้ว่าใครกำลังดูอยู่
         *   ★★ ตัวเลขของกิจกรรมออฟฟิศเป็นของส่วนตัวรายคน (ยอดค้าง · ข้อความ)
         *      จึงอยู่บนการ์ดสรุปในหน้า /office ไม่ใช่บนป้ายสาธารณะใบนี้
         */}
        <p
          className={cn(
            'hero-in mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line',
            'bg-page/60 px-3.5 py-1.5 text-xs text-ink-soft backdrop-blur-md',
          )}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-live" />
          </span>
          {/* ★ ใช้ข้อความชุดของพอร์ทัล ไม่ใช่ชุดของหน้าห้องเพลง
              ★★ ของเดิมเขียนว่า "เข้าไปเปิดเพลงได้เลย" ซึ่งเป็นคำชวนของฟีเจอร์เดียว
                 บนหน้าที่เพิ่งเลิกเป็นของฟีเจอร์นั้น */}
          {stats.listeners > 0
            ? t('hub.badge.live', { listeners: stats.listeners, rooms: stats.rooms })
            : stats.rooms > 0
              ? t('hub.badge.rooms', { rooms: stats.rooms })
              : t('hub.badge.idle')}
        </p>

        <h1 className="text-[38px] font-bold leading-[1.1] tracking-tight sm:text-[60px]">
          <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
            <span style={{ '--d': '120ms' } as CSSProperties}>
              {t('hub.hero1')}
              <span className="text-aurora">{t('hub.hero2')}</span>
            </span>
          </span>
          <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
            <span style={{ '--d': '270ms' } as CSSProperties}>{t('hub.hero3')}</span>
          </span>
        </h1>

        <p
          className="hero-in mx-auto mt-5 max-w-[540px] text-[15px] leading-relaxed text-ink-soft sm:text-base"
          style={{ '--d': '470ms' } as CSSProperties}
        >
          {t('hub.heroDetail')}
        </p>

        <div
          className="hero-in mt-8 flex flex-wrap items-center justify-center gap-3"
          style={{ '--d': '620ms' } as CSSProperties}
        >
          <Link
            href="#systems"
            className={cn(
              'pulse-ring group inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7',
              'font-medium text-accent-ink transition-all',
              'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
              'active:scale-[0.98]',
            )}
          >
            {t('hub.heroCta')}
            <svg
              viewBox="0 0 24 24"
              className="size-4 transition-transform group-hover:translate-y-0.5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 16l-6-6 1.4-1.4L12 13.2l4.6-4.6L18 10z" />
            </svg>
          </Link>

          {/* ★ ทางลัดเข้าห้องเพลงอยู่บนหัวหน้าด้วย — เป็นฟีเจอร์ที่คนใช้บ่อยที่สุด
              ★ แต่เป็นปุ่มรอง ไม่ใช่ปุ่มหลัก เพราะหน้านี้ไม่ใช่ของมันคนเดียวแล้ว */}
          <Link
            href="/music"
            className={cn(
              'inline-flex h-12 items-center gap-2 rounded-full border border-line bg-page/50 px-6',
              'text-sm font-medium text-ink backdrop-blur-md transition-colors',
              'hover:border-line-strong hover:bg-surface',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
            </svg>
            {t('hub.music')}
          </Link>
        </div>
      </div>
    </section>
  )
}
