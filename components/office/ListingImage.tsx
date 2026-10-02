'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * รูปประกอบประกาศ พร้อมภาพแทนเมื่อโหลดไม่ได้
 *
 * ★★★ รูปที่โหลดไม่ได้ต้องไม่ปล่อยให้เบราว์เซอร์จัดการเอง
 *
 *     ★ ค่าเริ่มต้นของเบราว์เซอร์คือไอคอนรูปแตกกับข้อความ alt กองอยู่มุมซ้ายบน
 *       ★★ ซึ่งบอกคนใช้ว่า "เว็บนี้พัง" ทั้งที่ของที่พังคือรูปเดียวในประกาศเดียว
 *     ★ เจอตอนไล่ตรวจทุกหน้า — ไฟล์หายจากที่เก็บ ลิงก์เสีย หรือเจ้าของลบรูปทิ้ง
 *       ล้วนทำให้เกิดสภาพนี้ได้ในของจริง ไม่ใช่แค่ข้อมูลทดสอบ
 *
 * ★★ ภาพแทนใช้สัดส่วนเดียวกับรูปจริง (4/3) — การ์ดจึงไม่ขยับความสูง
 *    ★ ถ้าปล่อยให้ยุบ การ์ดในตารางจะสูงไม่เท่ากันและแถวดูเบี้ยวทั้งแถว
 */
export function ListingImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn(
          'flex aspect-4/3 w-full flex-col items-center justify-center gap-1.5',
          'bg-surface text-ink-faint',
        )}
        role="img"
        aria-label={alt}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 18" />
        </svg>
        <span className="text-[11px]">{alt}</span>
      </div>
    )
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-4/3 w-full bg-surface object-cover"
    />
  )
}
