'use client'

/*
 * ★ client component เพราะตรามาร์คใช้ useId (gradient ไม่ซ้ำกัน) และจำว่าเล่นอินโทรไปแล้ว
 *   ★ ไม่มีสโลแกนใต้ชื่ออีกแล้ว — เจ้าของสั่งเอาข้อความกรรมสิทธิ์ใต้โลโก้ออกทั้งระบบ (4 ต.ค. 2026)
 */
import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * ตรามาร์คของ AWA Plaza
 *
 * ★★★ "A" ที่ไม่มีขีดกลาง แต่มีจุดอยู่ใต้ยอดแทน ยืนอยู่บนเส้นพื้น
 *
 *     ★ อ่านได้สองชั้นพร้อมกัน:
 *       1. ตัว A ของ AWA — เห็นปุ๊บรู้ว่าเป็นของบริษัทไหน
 *       2. ★★ หลังคาศาลา + จุดนัดพบ + ลานพื้น = "พลาซ่า" ที่คนมารวมกัน
 *          ซึ่งคือสิ่งที่เว็บนี้เป็น: ที่เดียวที่ทุกระบบของออฟฟิศมาอยู่รวมกัน
 *
 *     ★ เลิกใช้สามเหลี่ยม play ของชื่อเดิม (AWA ROOM)
 *       ★★ ห้องฟังเพลงเป็นแค่หนึ่งในหกโมดูลแล้ว ตรามาร์คที่พูดเรื่องวิดีโอ
 *          บอกผิดว่าเว็บนี้คืออะไร — และยังเฉียดโลโก้ YouTube อยู่ดี
 *
 *     ★ พื้นแผ่นไล่สีแดงแบรนด์ → ม่วง (ชุดเดียวกับพาดหัว text-aurora)
 *       สีมาจาก token ทั้งหมด เปลี่ยนตามธีมได้เอง
 */
export function Logo({
  className,
  compact = false,
  wordmarkFrom,
  size = 'md',
}: {
  className?: string
  compact?: boolean
  /** โชว์ตัวหนังสือเฉพาะจอที่กว้างอย่างน้อยเท่านี้ (px) — แถบที่ปุ่มเยอะใช้ */
  wordmarkFrom?: '400'
  /** lg = หน้าเข้าสู่ระบบ ที่โลโก้เป็นพระเอกของคอลัมน์ */
  size?: 'md' | 'lg'
}) {
  const lg = size === 'lg'
  return (
    <span className={cn('logo-root inline-flex items-center', lg ? 'gap-3' : 'gap-2', className)}>
      <LogoGlyph className={cn('shrink-0', lg ? 'size-[44px]' : 'size-[28px]')} />

      {/**
        * ★★★ เขียนคลาสทั้งชุดแยกสองทาง ไม่ใช่ต่อ 'hidden' ทับของเดิม
        *     cn() ในโปรเจกต์นี้คือ join เฉย ๆ ไม่มีตรรกะตัดคลาสที่ชนกัน
        *     ★ 'flex' กับ 'hidden' บน element เดียวกัน ผู้ชนะตัดสินด้วยลำดับใน CSS
        *       ที่ Tailwind สร้าง ไม่ใช่ลำดับที่เราเขียน (เคยพลาดมาแล้ว)
        */}
      <span
        className={
          compact
            ? 'hidden min-w-0 items-center sm:flex'
            : wordmarkFrom === '400'
              ? 'hidden min-w-0 items-center min-[400px]:flex'
              : 'flex min-w-0 items-center'
        }
      >
        {/* ★ AWA หนักทึบ · Plaza ไล่สีและมีแสงวิ่งผ่าน ชุดเดียวกับตรามาร์ค */}
        <span
          className={cn(
            'whitespace-nowrap font-black leading-none',
            lg ? 'text-[30px] tracking-[-1px]' : 'text-[20px] tracking-[-0.6px]',
          )}
        >
          AWA<span className="logo-plaza font-bold"> Plaza</span>
        </span>
      </span>
    </span>
  )
}

/** เฉพาะตรามาร์ค ไม่มีตัวอักษร — ใช้ในที่แคบ */
export function LogoMark({ className }: { className?: string }) {
  return <LogoGlyph className={cn('size-9', className)} />
}

/*
 * ★★ อินโทร (วาดตัว A · จุดเด้ง · ลากพื้น) เล่นครั้งเดียวต่อการเปิดเว็บ
 *    ★ แถบบนถูกสร้างใหม่ทุกครั้งที่เปลี่ยนหน้า — ถ้าเล่นทุกครั้ง โลโก้จะ
 *      กะพริบวาดใหม่ทุกคลิก ซึ่งน่ารำคาญกว่าน่าดู
 *    ★ ค่าเริ่มต้นตรงกันทั้ง server และรอบ hydrate (true) จึงไม่มี hydration mismatch
 */
let introPlayed = false

/**
 * ตรามาร์คแบบมีชีวิต — SVG ล้วน + CSS animation (ดูกฎ .logo-* ใน globals.css)
 *
 *   ★ แผ่นพื้นไล่สีที่ค่อย ๆ เปลี่ยนโทน แดง → ม่วง → ฟ้า แล้วกลับ
 *   ★ แสงสะท้อนกวาดผ่านแผ่นทุกไม่กี่วินาที
 *   ★ จุดนัดพบส่งคลื่นวงกลมออกเป็นระยะ — "มีคนมารวมกันอยู่ตรงนี้"
 *   ★ ชี้แล้วแผ่นเอียงเด้ง
 *   ★★ ผู้ใช้ที่ตั้ง "ลดการเคลื่อนไหว" เห็นโลโก้นิ่งสมบูรณ์ ไม่ใช่ครึ่ง ๆ กลาง ๆ
 *
 * ★ id ของ gradient/clip ต้องไม่ซ้ำ — หน้าเดียวมีโลโก้ได้หลายตัว
 */
function LogoGlyph({ className }: { className?: string }) {
  const id = useId()
  const [intro] = useState(() => !introPlayed)
  useEffect(() => {
    introPlayed = true
  }, [])
  const g = `lg-g-${id}`
  const s = `lg-s-${id}`
  const c = `lg-c-${id}`
  const sh = `lg-sh-${id}`
  return (
    <svg viewBox="0 0 32 32" className={cn('logo-mark', intro && 'logo-intro', className)} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="logo-stop-a" />
          <stop offset="1" className="logo-stop-b" />
        </linearGradient>
        <radialGradient id={s} cx="0.25" cy="0.12" r="0.8">
          <stop offset="0" stopColor="var(--ck-shine)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--ck-shine)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sh} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--ck-shine)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--ck-shine)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--ck-shine)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={c}>
          <rect width="32" height="32" rx="9.5" />
        </clipPath>
      </defs>

      <g className="logo-tile">
        <rect width="32" height="32" rx="9.5" fill={`url(#${g})`} />
        <rect width="32" height="32" rx="9.5" fill={`url(#${s})`} />

        <g clipPath={`url(#${c})`}>
          {/* คลื่นจากจุดนัดพบ — สองวงสลับจังหวะ */}
          <circle className="logo-ripple" cx="16" cy="17.6" r="2.35" fill="none" stroke="var(--ck-shine)" strokeWidth="1" />
          <circle className="logo-ripple logo-ripple-2" cx="16" cy="17.6" r="2.35" fill="none" stroke="var(--ck-shine)" strokeWidth="1" />
          {/* แสงสะท้อนกวาดผ่าน */}
          <rect className="logo-sheen" x="-14" y="-8" width="12" height="48" fill={`url(#${sh})`} transform="rotate(20 16 16)" />
        </g>

        {/* หลังคา / ตัว A */}
        <path
          className="logo-a"
          pathLength={1}
          d="M8 22.4 L16 8.2 L24 22.4"
          fill="none"
          stroke="var(--ck-shine)"
          strokeWidth="3.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* จุดนัดพบ — แทนขีดกลางของ A */}
        <circle className="logo-dot" cx="16" cy="17.6" r="2.35" fill="var(--ck-shine)" />
        {/* ลานพื้น */}
        <path
          className="logo-ground"
          pathLength={1}
          d="M7.2 25.6 H24.8"
          stroke="var(--ck-shine)"
          strokeOpacity="0.55"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
