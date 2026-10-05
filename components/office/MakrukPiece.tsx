'use client'

import { useId } from 'react'
import { cn } from '@/lib/cn'
import type { Kind, Side } from '@/lib/games/makruk'

/**
 * ตัวหมากรุกไทยแบบภาพวาด — SVG ล้วน ไม่ใช้รูปภาพ
 *
 * ★ ทรงตามหมากไม้กลึงของจริง: ขุน = ยอดฉัตรซ้อนชั้น · เม็ด = ทรงกลึงเล็กยอดมน · โคน = ทรงระฆังมียอด
 *   ม้า = หัวม้าด้านข้างมีแผงคอ · เรือ = เรือหางยาวมีหลังคาเรือนไทย · เบี้ย = เปลือกหอยเบี้ย
 * ★ ทุกตัวยืนบนฐานกลึงเดียวกัน · แสงตกจากซ้ายบน (gradient + เส้นแสง) · เงาตกพื้นด้านล่าง
 * ★ สีมาจากตัวแปร --pk-* ที่ .mk-ivory / .mk-ebony ตั้งไว้ (ใน globals.css) — เปลี่ยนตามธีมได้
 */
export function MakrukPiece({
  kind,
  side,
  promoted = false,
  className,
}: {
  kind: Kind
  side: Side
  promoted?: boolean
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const body = `pk-b-${uid}`
  const top = `pk-t-${uid}`
  const shape = promoted ? 'M' : kind

  return (
    <svg viewBox="12 6 76 90" className={cn('mk-pc block size-full', side === 'W' ? 'mk-ivory' : 'mk-ebony', promoted && 'mk-promoted', className)} aria-hidden="true">
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor="var(--pk-mid)" />
          <stop offset="0.28" stopColor="var(--pk-hi)" />
          <stop offset="0.62" stopColor="var(--pk-mid)" />
          <stop offset="1" stopColor="var(--pk-lo)" />
        </linearGradient>
        <linearGradient id={top} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pk-hi)" />
          <stop offset="1" stopColor="var(--pk-mid)" />
        </linearGradient>
      </defs>

      {/* เงาตกพื้น */}
      <ellipse cx="50" cy="93" rx="30" ry="5" fill="var(--pk-shadow)" opacity="0.45" />

      {/* ฐานกลึง */}
      <path d="M20 84 Q20 76 50 76 Q80 76 80 84 L80 87 Q80 93 50 93 Q20 93 20 87 Z" fill={`url(#${body})`} stroke="var(--pk-line)" strokeWidth="1.2" />
      <ellipse cx="50" cy="80" rx="28" ry="5" fill={`url(#${top})`} stroke="var(--pk-line)" strokeWidth="1" />
      <path d="M22 86 Q50 91 78 86" fill="none" stroke="var(--pk-trim)" strokeWidth="1.6" strokeLinecap="round" />

      {shape === 'K' ? <King body={body} /> : null}
      {shape === 'M' ? <Met body={body} /> : null}
      {shape === 'S' ? <Khon body={body} /> : null}
      {shape === 'N' ? <Horse body={body} /> : null}
      {shape === 'R' ? <Boat body={body} top={top} /> : null}
      {shape === 'P' ? <Cowrie body={body} /> : null}

    </svg>
  )
}

const line = { stroke: 'var(--pk-line)', strokeWidth: 1.4, strokeLinejoin: 'round' as const }
const trim = { fill: 'none', stroke: 'var(--pk-trim)', strokeWidth: 1.8, strokeLinecap: 'round' as const }

/** ขุน — ยอดฉัตรซ้อนสี่ชั้นแบบยอดเจดีย์ */
function King({ body }: { body: string }) {
  return (
    <g>
      <path d="M30 78 C32 68 37 61 40 57 L60 57 C63 61 68 68 70 78 Z" fill={`url(#${body})`} {...line} />
      <path d="M37 57 L63 57 L59 48 L41 48 Z" fill={`url(#${body})`} {...line} />
      <path d="M41 48 L59 48 L56 40 L44 40 Z" fill={`url(#${body})`} {...line} />
      <path d="M44 40 L56 40 L53 31 L47 31 Z" fill={`url(#${body})`} {...line} />
      <path d="M47 31 L50 13 L53 31 Z" fill={`url(#${body})`} {...line} />
      <circle cx="50" cy="12" r="2.6" fill="var(--pk-trim)" />
      <path d="M38 57 L62 57 M41.5 48 L58.5 48 M44.5 40 L55.5 40" {...trim} />
      <path d="M35 70 Q50 74 65 70" {...trim} />
    </g>
  )
}

/** เม็ด — ทรงกลึงเตี้ย ยอดมนมีปุ่ม */
function Met({ body }: { body: string }) {
  return (
    <g>
      <path d="M34 78 C34 67 41 59 50 57 C59 59 66 67 66 78 Z" fill={`url(#${body})`} {...line} />
      <path d="M43 57 C43 50 46 46 50 46 C54 46 57 50 57 57 Z" fill={`url(#${body})`} {...line} />
      <circle cx="50" cy="42" r="3.4" fill={`url(#${body})`} {...line} />
      <path d="M38 70 Q50 73 62 70" {...trim} />
      <path d="M44 57 L56 57" {...trim} />
    </g>
  )
}

/** โคน — ทรงระฆังสูง คอกลึง ยอดกลม */
function Khon({ body }: { body: string }) {
  return (
    <g>
      <path d="M30 78 C30 62 37 49 50 45 C63 49 70 62 70 78 Z" fill={`url(#${body})`} {...line} />
      <ellipse cx="50" cy="45" rx="9" ry="2.6" fill={`url(#${body})`} {...line} />
      <path d="M42 45 C42 36 45 31 50 31 C55 31 58 36 58 45 Z" fill={`url(#${body})`} {...line} />
      <circle cx="50" cy="26" r="4" fill={`url(#${body})`} {...line} />
      <path d="M34 68 Q50 72 66 68 M36 60 Q50 63 64 60" {...trim} />
    </g>
  )
}

/** ม้า — หัวม้าหันซ้าย คอโค้ง แผงคอเป็นริ้ว หูตั้ง ตา จมูก บังเหียน */
function Horse({ body }: { body: string }) {
  return (
    <g>
      <path
        d="M34 78 C33 68 34 60 38 53 C35 50 29 48 25 45 C20 42 18 37 21 33 C23 30 27 29 31 28 C34 24 37 20 41 18 L43 11 L47 16 L50 10 L53 16 C61 18 68 25 70 35 C72 46 70 57 68 65 C67 70 67 75 68 78 Z"
        fill={`url(#${body})`}
        {...line}
      />
      {/* แผงคอ */}
      <path d="M53 16 C59 20 63 26 64 32 M56 22 C61 27 64 34 65 41 M60 31 C64 37 66 45 66 52 M62 42 C65 49 66 57 65 64" fill="none" stroke="var(--pk-line)" strokeWidth="1.3" strokeLinecap="round" opacity="0.75" />
      {/* ตา + คิ้ว */}
      <ellipse cx="41" cy="27" rx="2.4" ry="1.8" fill="var(--pk-eye)" />
      <circle cx="40.4" cy="26.4" r="0.7" fill="var(--pk-gloss)" />
      <path d="M37.5 24.5 Q41 22.5 44.5 24.5" fill="none" stroke="var(--pk-line)" strokeWidth="1.1" strokeLinecap="round" />
      {/* จมูก + ปาก */}
      <ellipse cx="24.5" cy="38" rx="1.6" ry="1.2" fill="var(--pk-eye)" />
      <path d="M21 42 Q25 44.5 30 43" fill="none" stroke="var(--pk-line)" strokeWidth="1.2" strokeLinecap="round" />
      {/* บังเหียน */}
      <path d="M29 30 L39 40 M33 28.5 L44 28.5 M39 40 Q43 46 38 53" {...trim} />
      {/* หูด้านใน */}
      <path d="M44.5 13.5 L45.5 17 M50 12.5 L50.8 16.5" fill="none" stroke="var(--pk-line)" strokeWidth="1" strokeLinecap="round" />
      <path d="M38 70 Q52 73 66 70" {...trim} />
    </g>
  )
}

/** เรือ — เรือหางยาว หัวท้ายงอน หลังคาเรือนไทยมีช่อฟ้า คลื่นใต้ท้องเรือ */
function Boat({ body, top }: { body: string; top: string }) {
  return (
    <g>
      {/* คลื่น */}
      <path d="M22 76 Q28 72 34 76 Q40 80 46 76 Q52 72 58 76 Q64 80 70 76 Q74 73 78 76" fill="none" stroke="var(--pk-trim)" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      {/* หัวเรืองอน (ซ้าย) + ท้ายเรืองอน (ขวา) */}
      <path d="M17 60 C12 52 13 42 19 36 C22 34 24 36 23 39 C20 44 20 52 24 59 Z" fill={`url(#${body})`} {...line} />
      <path d="M83 60 C88 53 88 45 84 40 C82 38 80 40 81 42 C83 47 82 53 77 59 Z" fill={`url(#${body})`} {...line} />
      {/* ตัวเรือ */}
      <path d="M15 58 C24 61 36 63 50 63 C64 63 76 61 85 58 C83 68 71 74 50 74 C29 74 17 68 15 58 Z" fill={`url(#${body})`} {...line} />
      <path d="M19 63 Q50 69 81 63" {...trim} />
      <path d="M24 66.5 L28 66.5 M34 68 L38 68 M44 68.6 L48 68.6 M52 68.6 L56 68.6 M62 68 L66 68 M72 66.5 L76 66.5" stroke="var(--pk-trim)" strokeWidth="1.4" strokeLinecap="round" />
      {/* เรือนบนเรือ */}
      <path d="M39 60 L39 49 L61 49 L61 60 Z" fill={`url(#${top})`} {...line} />
      <path d="M44 60 L44 52 L48 52 L48 60 M52 60 L52 52 L56 52 L56 60" fill="none" stroke="var(--pk-line)" strokeWidth="1.1" />
      {/* หลังคาจั่วซ้อน + ช่อฟ้า */}
      <path d="M34 49 L50 33 L66 49 Z" fill={`url(#${body})`} {...line} />
      <path d="M40 43 L50 34 L60 43" fill="none" stroke="var(--pk-trim)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M50 33 L50 26 M50 26 Q53 24 54 27" fill="none" stroke="var(--pk-line)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M34 49 Q31 47 31 44 M66 49 Q69 47 69 44" fill="none" stroke="var(--pk-line)" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  )
}

/** เบี้ย — เปลือกหอยเบี้ยหงายบนฐาน ร่องกลางมีฟัน */
function Cowrie({ body }: { body: string }) {
  return (
    <g>
      <path d="M27 76 C25 62 35 52 50 52 C65 52 75 62 73 76 Z" fill={`url(#${body})`} {...line} />
      <path d="M50 54 C46 60 45.5 68 47.5 76" fill="none" stroke="var(--pk-line)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M46.5 60 L44 60.5 M45.8 64 L43.2 64.4 M45.7 68 L43 68.2 M46.2 72 L43.6 72 M48.5 60 L51 60.5 M48 64 L50.8 64.4 M48 68 L50.8 68.2 M48.6 72 L51.4 72" stroke="var(--pk-line)" strokeWidth="1" strokeLinecap="round" />
      <path d="M33 64 Q38 58 44 57 M56 57 Q63 59 67 66" {...trim} />
    </g>
  )
}
