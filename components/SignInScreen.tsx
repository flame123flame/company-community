'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { SignInForm } from '@/components/SignInForm'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Logo } from '@/components/Logo'
import { useT } from '@/lib/i18n/client'
import { Untranslated } from '@/lib/i18n/office'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * หน้าเข้าใช้งานเต็มจอ — สิ่งเดียวที่ผู้ใช้ที่ยังไม่สมัครจะได้เห็น
 *
 * ★★ ถูก render โดย Server Component หลังตรวจ getRegisteredUser() แล้ว
 *
 *    แปลว่า HTML ที่ส่งออกไปไม่มีเนื้อหาของแอปอยู่เลยสักบรรทัด —
 *    ต่างจากการซ่อนด้วย CSS หรือ overlay ฝั่ง client ซึ่งข้อมูลยังอยู่ใน DOM
 *    ให้ใครก็ได้เปิด devtools อ่าน
 *
 * ★★★ ปุ่มเปลี่ยนภาษา "และปุ่มเปลี่ยนธีม" ต้องอยู่ที่นี่ด้วย
 *
 *     หน้านี้คือหน้าเดียวที่คนยังไม่สมัครจะได้เห็น และมันไม่มีแถบบน
 *     ★ คนเกาหลีที่เปิดมาแล้วเจอภาษาไทย (เพราะ Accept-Language ของเขา
 *       ไม่ตรงกับที่เรารองรับ) จะติดอยู่ตรงนี้โดยไม่มีปุ่มให้กดเลยแม้แต่ปุ่มเดียว
 *     ★★ ธีมก็เรื่องเดียวกัน — คนที่เครื่องตั้งเป็นโหมดสว่างแล้วเจอหน้าดำสนิท
 *        ไม่มีทางเปลี่ยนได้เลยจนกว่าจะสมัครเสร็จ ซึ่งกลับหัวกลับหาง:
 *        หน้าที่คนเจอก่อนที่สุด กลับเป็นหน้าเดียวที่ปรับไม่ได้
 *
 *     ทั้งสองเรื่องเจอตอนรันจริง ไม่ใช่ตอนอ่านโค้ด
 *
 * ★ refresh() ไม่ใช่ push() หลังเข้าสู่ระบบเสร็จ
 *   ยังอยู่ URL เดิม แค่ให้ server render ใหม่โดยเห็นว่าเรามี session แล้ว
 *   — คนที่กดลิงก์ห้องมาจึงเข้าห้องนั้นต่อได้เลย ไม่ถูกเด้งกลับหน้าแรก
 */

/*
 * ★★★ จุดขายบนหน้าล็อกอินต้องเป็น "ทั้งระบบ" ไม่ใช่ห้องฟังเพลง
 *
 *     ★ เดิมโฆษณาซิงก์เพลง · แชทสติกเกอร์ · คิวร่วม พร้อมพาดหัวว่า
 *       "ฟังเพลงด้วยกันแบบวินาทีต่อวินาที"
 *       ★★ ซึ่งเป็นหน้าตาของเว็บเวอร์ชันก่อนทั้งหน้า — คนเปิดเข้ามาแล้ว
 *          อ่านว่ามาผิดที่ ทั้งที่ของที่เขาจะมาใช้คือหารบิลหรือสุ่มร้านข้าว
 *     ★ ห้องฟังเพลงยังอยู่ แต่อยู่ในฐานะหนึ่งในห้าโมดูล — จึงวางไว้ท้ายสุด
 *
 * ★★ ใช้คีย์ hub.* ชุดเดียวกับการ์ดบนหน้าพอร์ทัล
 *    ★ คีย์พวกนี้แปลครบ 16 ภาษาอยู่แล้วตั้งแต่ตอนทำพอร์ทัล จึงไม่ต้อง
 *      แปลเพิ่มสักคำ และวันที่แก้คำโฆษณาก็แก้ที่เดียวได้ทั้งสองหน้า
 *
 * ★★ tint ตรงกับการ์ดบนหน้าพอร์ทัลเป๊ะ — สีคือป้ายชื่อที่คนจำได้เร็วกว่าคำ
 *    ★ กดจากที่นี่เข้าไปเจอสีเดิม = รู้ว่ามาถูกที่โดยไม่ต้องอ่านซ้ำ
 */
type Feature = { title: DictKey; detail: DictKey; tint: string; icon: ReactNode }

const FEATURES: Feature[] = [
  {
    title: 'hub.food',
    detail: 'hub.foodDetail',
    tint: '255 149 0',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9" />
      </svg>
    ),
  },
  {
    title: 'hub.wallet',
    detail: 'hub.walletDetail',
    tint: '52 199 123',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" />
      </svg>
    ),
  },
  {
    title: 'hub.chat',
    detail: 'hub.chatDetail',
    tint: '48 209 176',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="currentColor">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm7 5H7v-2h7v2zm3-6H7V6h10v2z" />
      </svg>
    ),
  },
  {
    title: 'hub.market',
    detail: 'hub.marketDetail',
    tint: '10 132 255',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  /* ★ ห้องฟังเพลงอยู่ท้ายสุด — ยังอยู่ครบ แต่ไม่ใช่ตัวเว็บอีกแล้ว */
  {
    title: 'hub.music',
    detail: 'hub.musicDetail',
    tint: '255 0 51',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      </svg>
    ),
  },
]

/**
 * ★ ค่าคงที่ ห้ามสุ่มตอน render
 *   ค่าที่ server กับ client สุ่มได้ไม่มีทางตรงกัน แล้ว React จะทิ้ง
 *   ต้นไม้ทั้งหน้าไปวาดใหม่ (บทเรียนเดิมจากกล่องโปรไฟล์)
 */
const NOTES = [
  { glyph: '♪', left: 8, delay: 0, dur: 21, size: 20, dx: 24, rot: 16 },
  { glyph: '♫', left: 22, delay: 5.5, dur: 24, size: 14, dx: -18, rot: -12 },
  { glyph: '♬', left: 37, delay: 11, dur: 19, size: 12, dx: 14, rot: 22 },
  { glyph: '♪', left: 63, delay: 3, dur: 23, size: 16, dx: -20, rot: -18 },
  { glyph: '♫', left: 78, delay: 8.5, dur: 20, size: 22, dx: 18, rot: 14 },
  { glyph: '♬', left: 92, delay: 14, dur: 18, size: 13, dx: -16, rot: 20 },
]

const PERKS: DictKey[] = ['auth.perk1', 'auth.perk2', 'auth.perk3']

export function SignInScreen() {
  const router = useRouter()
  const t = useT()

  /* ★ pt-24 บนมือถือ — โลโก้อยู่กลางจอ ส่วนปุ่มธีม/ภาษาอยู่มุมบน
     ★★ บนจอแคบทั้งสองไปอยู่บรรทัดเดียวกันพอดีจนดูเบียด
        จอกว้างไม่มีปัญหาเพราะเนื้อหาเริ่มที่คอลัมน์ซ้าย */
  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-4 pb-10 pt-24 lg:py-10">
      {/* ── แสงเหนือ ─────────────────────────────────────────────── */}
      {/**
        * ★★ ใช้ชุดเดียวกับหน้าแรกเป๊ะ ไม่ได้ทำขึ้นใหม่
        *
        *    หน้านี้กับหน้าแรกคือ "ด่านแรก" เหมือนกัน ★ คนที่กรอกชื่อเสร็จ
        *      แล้วเด้งเข้าหน้าแรกทันที ต้องรู้สึกว่ายังอยู่ที่เดิม
        *      ไม่ใช่โดนโยนไปอีกเว็บหนึ่ง
        *
        *    ★ โทนสว่างมีค่า --aurora-* ของตัวเองอยู่แล้ว (สีอิ่มกว่า จางกว่า)
        *      จึงไม่ต้องเขียนเงื่อนไขธีมที่นี่เลยสักบรรทัด
        */}
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      {/* ── โน้ตลอย ──────────────────────────────────────────────── */}
      {/**
        * ★ จางมากและช้ามาก — หน้านี้มีงานเดียวคือให้คนกรอกให้เสร็จ
        *   อะไรที่ดึงสายตาออกจากช่องกรอกถือว่าทำร้ายหน้านี้ ไม่ใช่ทำให้สวย
        *
        * ★★ z-0 ไม่ใช่ -z-10
        *    ค่าลบทำให้ชั้นนี้ไปอยู่ "หลังพื้นหลังของ body" ซึ่งทึบอยู่ —
        *    ★ โน้ตถูกทาทับจนมองไม่เห็นเลยสักตัว (บทเรียนเดียวกับฉากหลัง
        *      ของหน้ารอเข้าห้องที่เคยหายไปทั้งชั้นด้วยเหตุผลนี้เป๊ะ)
        */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {NOTES.map((note, i) => (
          <span
            key={i}
            className="note-float absolute bottom-0 text-ink-faint"
            style={
              {
                left: `${note.left}%`,
                fontSize: `${note.size}px`,
                '--d': `${note.delay}s`,
                '--dur': `${note.dur}s`,
                '--dx': `${note.dx}px`,
                '--rot': `${note.rot}deg`,
              } as CSSProperties
            }
          >
            {note.glyph}
          </span>
        ))}
      </div>

      {/*
        * ★★★ ใช้ระยะแบบ "ต้น/ปลาย" ไม่ใช่ "ซ้าย/ขวา"
        *
        *     right-3 หมายถึง "ขวาเสมอ" ★ พอหน้าเป็น RTL ทุกอย่างกลับด้าน
        *       แต่ตัวนี้ไม่กลับตาม — ปุ่มภาษาเลยไปค้างอยู่ฝั่งเดียวกับที่
        *       ตาคนอ่านอาหรับเริ่มอ่านพอดี ซึ่งคือที่ที่มันไม่ควรอยู่
        *
        *     end-3 แปลว่า "ปลายบรรทัด" — ขวาในภาษาปกติ ซ้ายในอาหรับ
        *     ★ เบราว์เซอร์สลับให้เอง ไม่ต้องเขียนเงื่อนไขภาษาไว้ในโค้ดเลย
        *
        * ★★★ z-20 ไม่ใช่ z-10 — ครึ่งล่างของเมนูภาษาเคยกดไม่ได้
        *
        *     กล่องนี้เป็น z-10 เท่ากับกล่องเนื้อหาข้างล่าง ★ แต่เนื้อหาอยู่
        *       หลังในลำดับ DOM จึงชนะการเสมอ แล้วทับขึ้นมาบนเมนู
        *     ★★ z-50 ที่อยู่บนตัวเมนูช่วยไม่ได้เลย เพราะมันแข่งกันแค่
        *        ภายในกล่องนี้ซึ่งถูกตรึงไว้ที่ 10 แล้ว — ลูกไม่มีทางขึ้นไป
        *        สูงกว่าเพดานที่พ่อยืนอยู่
        *     อาการคือกด 6 ภาษาแรกได้ ที่เหลือกดไม่ติด — เจอตอนไล่กดด้วยเครื่อง
        */}
      <div className="absolute end-3 top-3 z-20">
        <div className="signin-tools">
          <ThemeToggle />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <LanguageToggle />
        </div>
      </div>

      {/**
        * ★★★ สองคอลัมน์บนจอกว้าง — ซ้ายบอกว่าเว็บนี้คืออะไร ขวาคือฟอร์ม
        *
        *     ของเดิมมีแต่ฟอร์มอยู่กลางจอ ★ คนที่เพิ่งเปิดมาเจอถูกขอให้กรอก
        *       ก่อนจะได้เห็นอะไรสักอย่าง — โดยไม่มีใครบอกเลยว่ากรอกไปแล้ว
        *       จะได้อะไร และที่นี่คือที่อะไร
        *
        *     ★★ หน้าเข้าใช้งานของเว็บที่คนยังไม่รู้จัก ต้องทำสองหน้าที่พร้อมกัน:
        *        อธิบายตัวเอง และรับข้อมูล — ทำแต่อย่างหลังคือสมมติว่าทุกคน
        *        ถูกเพื่อนบอกมาแล้ว ซึ่งจริงแค่ครึ่งเดียว
        *
        *     ★ บนมือถือเรียงลงมาเป็นแถวเดียว: คำอธิบายอยู่บน ฟอร์มอยู่ล่าง
        *       ลำดับเดียวกับที่คนอ่าน — รู้ก่อนว่าคืออะไร แล้วค่อยกรอก
        */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1060px] items-center gap-12 lg:grid-cols-[1.05fr_400px] lg:gap-16">
        {/* ── ซ้าย: เว็บนี้คืออะไร ──────────────────────────────── */}
        <div className="text-center lg:text-start">
          <div className="hero-in flex justify-center lg:justify-start">
            <Logo size="lg" />
          </div>

          {/* ★ ป้ายเล็กมาก่อนพาดหัว — บอก "ที่นี่คือที่ไหน" ในบรรทัดเดียว
              ★★ จุดเต้นข้าง ๆ บอกว่าระบบเปิดอยู่โดยไม่ต้องเขียนว่าเปิดอยู่ */}
          <div
            className="hero-in mt-5 flex justify-center lg:justify-start"
            style={{ '--d': '60ms' } as CSSProperties}
          >
            <span className="signin-eyebrow">
              <span className="signin-dot" aria-hidden="true" />
              {t('auth.eyebrow')}
            </span>
          </div>

          {/* ★ ใหญ่ขึ้นกว่าเดิมและโตตามจอด้วย clamp
              ★★ พาดหัวคือสิ่งเดียวที่คนอ่านแน่ ๆ ก่อนตัดสินใจว่าจะอ่านต่อไหม */}
          <h1
            className="hero-in mt-4 text-[clamp(34px,6vw,60px)] font-black leading-[1.08] tracking-tight"
            style={{ '--d': '130ms' } as CSSProperties}
          >
            {t('hub.hero1')}
            <span className="text-aurora">{t('hub.hero2')}</span>
            <br />
            {t('hub.hero3')}
          </h1>

          <p
            className="hero-in mx-auto mt-4 max-w-[460px] text-[15px] leading-relaxed text-ink-soft lg:mx-0"
            style={{ '--d': '200ms' } as CSSProperties}
          >
            {t('hub.heroDetail')}
          </p>

          {/* ── ห้าอย่างที่ได้ ─────────────────────────────────── */}
          {/**
            * ★★ เปลี่ยนจากรายการจุดกลม ๆ เป็นการ์ดมีสีประจำโมดูล
            *    ★ ของเดิมเป็นบรรทัดเรียงลงมาห้าบรรทัด อ่านแล้วเหมือนรายการ
            *      ข้อกำหนด ไม่ใช่ของที่อยากลอง
            *    ★★ การ์ดที่มีสีของตัวเองทำให้ตากวาดเจอ "อันที่ใช่" ได้ก่อนอ่าน
            *       และตรงกับสีที่เขาจะเจออีกครั้งหลังเข้าระบบ
            *
            * ★ สองคอลัมน์ตั้งแต่จอ sm — ห้าใบเรียงเดี่ยวยาวเกินไปบนมือถือ
            *   ★★ ใบสุดท้าย (ห้องฟังเพลง) กินเต็มแถวเอง จึงไม่มีช่องโหว่
            */}
          <ul
            className="hero-in mx-auto mt-7 grid max-w-[520px] gap-2.5 text-start sm:grid-cols-2 lg:mx-0"
            style={{ '--d': '280ms' } as CSSProperties}
          >
            {FEATURES.map(({ title, detail, tint, icon }, i) => (
              <li
                key={title}
                className={i === FEATURES.length - 1 ? 'sm:col-span-2' : undefined}
                style={{ '--tint': tint } as CSSProperties}
              >
                <div className="signin-card lift">
                  <span className="signin-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium leading-snug">{t(title)}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-soft">
                      {t(detail)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* ── จุดขายสั้น ๆ ที่ตอบคำถามว่า "ต้องเตรียมอะไรไหม" ──── */}
          {/**
            * ★ คำถามแรกของคนที่ยังไม่เคยใช้คือ "ต้องลงโปรแกรมไหม"
            *   ★★ ตอบตรงนี้เลยด้วยสามคำสั้น ๆ ถูกกว่าปล่อยให้เขาเดาเอง
            */}
          <div
            className="hero-in mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start"
            style={{ '--d': '360ms' } as CSSProperties}
          >
            {PERKS.map((key) => (
              <span key={key} className="signin-perk">
                <svg viewBox="0 0 24 24" className="size-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 13 4 4L19 7" />
                </svg>
                {t(key)}
              </span>
            ))}
          </div>
        </div>

        {/* ── ขวา: ฟอร์ม ───────────────────────────────────────── */}
        {/* ★ วงแสงจาง ๆ หลังการ์ด — บอกว่า "เริ่มตรงนี้" โดยไม่ต้องมีลูกศร */}
        <div className="relative flex justify-center lg:justify-end">
          <span className="signin-ring" aria-hidden="true" />
          {/**
            * ★ ป้ายลอยรอบการ์ด — ตัวอย่างสิ่งที่ทำได้หลังเข้าระบบ
            *   ★★ อยู่นอกขอบการ์ด และขึ้นเฉพาะจอ ≥1400px — แคบกว่านั้นไม่มีที่ว่างข้างการ์ด
            *      แล้วมันจะไปทับช่องกรอก ซึ่งคืองานเดียวของหน้านี้ (เห็นจากภาพจริงที่ 1440)
            */}
          {(
            [
              ['🍜', 'auth.float1', 'start-0 top-20 -translate-x-[85%] rtl:translate-x-[85%]', '0s'],
              ['💸', 'auth.float2', 'end-0 top-36 translate-x-[85%] rtl:-translate-x-[85%]', '1.2s'],
              ['🎵', 'auth.float3', 'start-0 top-[74%] -translate-x-[85%] rtl:translate-x-[85%]', '2.4s'],
            ] as const
          ).map(([emoji, key, pos, dl]) => (
            <span
              key={key}
              aria-hidden="true"
              className={`signin-float absolute z-20 hidden items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-ink min-[1400px]:flex ${pos}`}
              style={{ '--dl': dl } as CSSProperties}
            >
              <span className="text-lg leading-none">{emoji}</span>
              <Untranslated>{t(key)}</Untranslated>
            </span>
          ))}
          <SignInForm variant="page" onDone={() => router.refresh()} />
        </div>
      </div>
    </main>
  )
}
