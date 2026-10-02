'use client'

/*
 * ★ ต้องเป็น client component เพราะสโลแกนใต้โลโก้ต้องเปลี่ยนตามภาษา
 *   โลโก้ถูกใช้ทั้งจากฝั่ง server (SetupRequired) และ client (แถบบน)
 *   ★ การติด 'use client' ไว้ที่นี่ทำให้ทั้งสองทางใช้ได้เหมือนกัน —
 *     I18nProvider อยู่ใน root layout จึงครอบถึงทุกที่ที่โลโก้ไปโผล่อยู่แล้ว
 */
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'

/**
 * ตรามาร์คของ AWA ROOM — กรอบสี่เหลี่ยมมนที่มีสามเหลี่ยม play อยู่ข้างใน
 *
 * ★★ ทำไมเปลี่ยนจากแคปซูลแดงทึบมาเป็นกรอบ
 *
 *    ของเดิมเป็นสี่เหลี่ยมมนสีแดงทึบ + สามเหลี่ยมขาว ซึ่งพูดตามตรงคือ
 *    โลโก้ YouTube ที่เปลี่ยนสัดส่วนเล็กน้อย — คนเห็นแล้วอ่านว่า "YouTube"
 *    ไม่ใช่ "แบรนด์นี้"
 *
 *    มีปัญหาสองชั้นพร้อมกัน:
 *      1. ข้อกำหนดของ YouTube API ห้ามทำให้เข้าใจผิดว่าเว็บนี้คือ YouTube
 *         หรือได้รับการรับรองจาก YouTube — ท้ายหน้าแรกเราเขียนว่า
 *         "ไม่เกี่ยวข้องกับ YouTube" แต่โลโก้กลับบอกตรงกันข้าม
 *      2. ★ แบรนด์ที่เป็นของเราเอง ไม่ควรหน้าตาเหมือนของคนอื่น
 *
 *    ★ ตัวใหม่เล่นกับชื่อโดยตรง: "Frame" = กรอบ
 *      กรอบเส้นขอบ (ไม่ทึบ) + สามเหลี่ยม play ข้างใน = "กรอบที่มีอะไรเล่นอยู่"
 *      ซึ่งคือสิ่งที่แอปนี้เป็นพอดี และไม่ไปทับกับใคร
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoGlyph className="size-[26px] shrink-0" />

      {/**
        * ★★★ เขียนคลาสทั้งชุดแยกสองทาง ไม่ใช่ต่อ 'hidden' ทับของเดิม
        *
        *     cn() ในโปรเจกต์นี้คือ join เฉย ๆ ไม่มีตรรกะตัดคลาสที่ชนกัน
        *     ★ 'flex' กับ 'hidden' จึงอยู่บน element เดียวกันทั้งคู่ แล้วผู้ชนะ
        *       ตัดสินด้วยลำดับใน CSS ที่ Tailwind สร้าง ไม่ใช่ลำดับที่เราเขียน
        *
        *     ★★ เคยพลาดมาแล้วจริง: ใส่ 'hidden sm:inline-flex' ให้ <Logo/>
        *        เพื่อซ่อนบนมือถือ แต่มันไม่ยอมหาย — วัดได้ว่าลิงก์ยังกว้าง
        *        205px ทั้งที่ควรเหลือ 62px ★ แก้โดยไม่ให้มีสองคลาสชนกันเลย
        */}
      <span
        className={
          compact
            ? 'hidden min-w-0 flex-col justify-center leading-none sm:flex'
            : 'flex min-w-0 flex-col justify-center leading-none'
        }
      >
        <span className="text-[20px] font-medium leading-none tracking-[-0.5px]">
          AWA<span className="text-ink-soft"> ROOM</span>
        </span>

        {/**
         * ★★ ข้อความกรรมสิทธิ์ซ่อนบนจอแคบ ไม่ใช่ย่อขนาดลง
         *
         *    แถบบนสูง 56px และต้องใส่ โลโก้ + ช่องค้นหา + ปุ่มขวาให้ครบ
         *    ที่ 390px การเพิ่มข้อความ 30 ตัวอักษรเข้าไปจะเบียดจนช่องค้นหา
         *    ไม่เหลือที่ — ซึ่งเป็นปัญหาเดิมที่เพิ่งแก้ไปตอนทำ responsive
         *
         *    ★ การ "ย่อให้เล็กลง" แก้ไม่ได้เพราะตัวอักษรที่เล็กกว่า 10px
         *      อ่านไม่ออกอยู่ดี — เท่ากับกินที่โดยไม่มีใครได้อะไร
         *      ซ่อนไปเลยแล้วให้ท้ายหน้าแรกรับหน้าที่ประกาศแทนตรงกว่า
         *
         *    โผล่ที่ ≥1024px ซึ่งเป็นจุดที่วัดแล้วช่องค้นหายังได้ความกว้างเต็ม
         */}
        <span className="mt-0.75 hidden whitespace-nowrap text-[10px] font-normal leading-none tracking-normal text-ink-faint lg:block">
          {t('header.tagline')}
        </span>
      </span>
    </span>
  )
}

/** เฉพาะตรามาร์ค ไม่มีตัวอักษร — ใช้ในที่แคบ */
export function LogoMark({ className }: { className?: string }) {
  return <LogoGlyph className={cn('size-9', className)} />
}

/**
 * ★ วาดด้วย SVG ล้วน ไม่ผสม div + svg เหมือนของเดิม
 *   ทำให้ย่อขยายได้ทุกขนาดโดยสัดส่วนไม่เพี้ยน และเอาไปทำ favicon ต่อได้เลย
 */
function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {/* กรอบ — เส้นขอบหนา ไม่ทึบ คือจุดที่แยกจากโลโก้ YouTube ชัดที่สุด */}
      <rect
        x="2.6"
        y="2.6"
        width="26.8"
        height="26.8"
        rx="8.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="3.2"
      />
      {/* สามเหลี่ยม play — ปลายมนให้เข้ากับมุมมนของกรอบ */}
      <path
        d="M13 10.8 L22 16 L13 21.2 Z"
        fill="var(--color-accent)"
        strokeLinejoin="round"
        stroke="var(--color-accent)"
        strokeWidth="1.6"
      />
    </svg>
  )
}
