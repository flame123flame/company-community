'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'

/**
 * ดูรูปเต็มจอ — ตัวกลางของทุกแกลเลอรีในระบบ
 *
 * ★★★ ก่อนหน้านี้มีสองตัวที่ทำงานต่างกัน และนั่นคือเหตุผลที่ต้องมีไฟล์นี้
 *
 *     ★ ShopPhotos ดักปุ่มลูกศรที่ตัว div แล้วบังคับโฟกัสด้วย
 *       ref={(el) => el?.focus()} ★★ ซึ่งยิงทุกครั้งที่ render และลูกศรจะตาย
 *       ทันทีที่โฟกัสหลุดไปที่ปุ่มปิด — คือหลังกดลูกศรด้วยเมาส์หนึ่งครั้ง
 *     ★ RestaurantReviews ดักที่ document (ถูกกว่า) แต่ใช้อักษร ‹ › เป็นลูกศร
 *       ★★ ซึ่งขนาดและน้ำหนักเปลี่ยนไปตามฟอนต์ของแต่ละภาษา
 *     ★ ทั้งคู่ไม่ล็อกการเลื่อนของหน้าข้างหลัง ★★ บนมือถือแปลว่าปัดดูรูป
 *       แล้วหน้าข้างหลังเลื่อนตามไปด้วย ปิดออกมาแล้วอยู่คนละที่กับตอนเปิด
 *     ★ ทั้งคู่ไม่รองรับการปัดนิ้ว ★★ ซึ่งเป็นท่าแรกที่ทุกคนลองทำกับรูปเต็มจอ
 *       บนโทรศัพท์ และเป็นท่าเดียวที่ไม่ต้องเล็งปุ่ม
 *
 * ★★ คืนโฟกัสให้ปุ่มที่กดเปิดตอนปิด
 *    ★ ไม่คืน โฟกัสจะไปเริ่มที่ต้นหน้าใหม่ ★★ คนที่ใช้คีย์บอร์ดจะต้องกด Tab
 *      ไล่ลงมาทั้งหน้าใหม่ทุกครั้งที่ปิดรูป
 */
export function PhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
  label,
}: {
  /** URL รูปเต็ม เรียงตามที่แสดงในแกลเลอรี */
  photos: string[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  /**
   * คำอธิบายกล่องสำหรับโปรแกรมอ่านหน้าจอ
   *
   * ★ ไม่ส่งมา ใช้ "รูปที่ n จาก ทั้งหมด" ซึ่งบอกตำแหน่งจริง
   *   ★★ ดีกว่าคำว่า "รูป" ลอย ๆ ที่ไม่ได้บอกว่ามีอีกกี่ใบ
   */
  label?: string
}) {
  const ot = useOt()
  const total = photos.length
  const boxRef = useRef<HTMLDivElement | null>(null)
  /* ★ จำว่าใครเป็นคนเปิด เพื่อคืนโฟกัสให้ตอนปิด */
  const openerRef = useRef<Element | null>(null)
  const [mounted, setMounted] = useState(false)

  const go = useCallback(
    (d: number) => {
      if (total > 0) onIndex((index + d + total) % total)
    },
    [index, total, onIndex],
  )

  /* ★ createPortal ต้องรอให้ถึงเบราว์เซอร์ก่อน — document ไม่มีตอน render ฝั่ง server */
  useEffect(() => {
    setMounted(true)
  }, [])

  /*
   * ── คีย์บอร์ด ─────────────────────────────────────────────────
   * ★★ ดักที่ document ไม่ใช่ที่ div ★ ลูกศรต้องทำงานไม่ว่าโฟกัสจะอยู่ที่
   *    ปุ่มปิด ปุ่มลูกศร หรือไม่ได้อยู่ที่อะไรเลย
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose])

  /*
   * ── ล็อกการเลื่อนของหน้าข้างหลัง + โฟกัส ───────────────────────
   * ★★ คืนค่า overflow เดิมตอนปิด ไม่ได้ตั้งเป็น '' ทับ
   *    ★ หน้าที่ตั้ง overflow ไว้เองอยู่แล้ว (กล่องโต้ตอบอื่นที่เปิดซ้อนกัน)
   *      จะถูกปลดล็อกโดยไม่ได้ขอถ้าเราเขียนทับด้วยค่าว่าง
   */
  useEffect(() => {
    openerRef.current = document.activeElement
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    boxRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [])

  /*
   * ── ปัดนิ้ว ───────────────────────────────────────────────────
   * ★ นับระยะแนวนอนเทียบกับแนวตั้ง — ปัดเฉียงลงคือการเลื่อนหน้า ไม่ใช่เปลี่ยนรูป
   *   ★★ และต้องเกิน 48px ★ ต่ำกว่านั้นคือมือสั่นตอนแตะ ซึ่งจะทำให้
   *      การแตะดูรูปกลายเป็นการเปลี่ยนรูปโดยไม่ได้ตั้งใจ
   */
  const touchRef = useRef<{ x: number; y: number } | null>(null)

  if (!mounted || total === 0) return null

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? ot('market.photoOf', { n: Math.min(index, total - 1) + 1, total })}
      tabIndex={-1}
      className="fixed inset-0 z-80 grid place-items-center bg-black/90 p-4 outline-none backdrop-blur-sm"
      /* ★ ปิดเมื่อกดพื้นหลัง แต่ไม่ปิดเมื่อกดที่รูป — คนกำลังเพ่งดูอยู่ */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        touchRef.current = t ? { x: t.clientX, y: t.clientY } : null
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current
        const t = e.changedTouches[0]
        touchRef.current = null
        if (!start || !t) return
        const dx = t.clientX - start.x
        const dy = t.clientY - start.y
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
        go(dx < 0 ? 1 : -1)
      }}
    >
      {/*
        * ★★ object-contain + จำกัดความสูงด้วย dvh ไม่ใช่ vh
        *    ★ vh บน Safari มือถือไม่นับแถบล่างที่ซ่อน/โผล่ — รูปจะสูงเกินจอ
        *      แล้วขอบล่างถูกตัดพอดีตรงที่ตัวนับรูปอยู่
        * ★ eslint-disable เพราะเป็น URL จากที่เก็บไฟล์ของเราเอง ขนาดไม่รู้ล่วงหน้า
        *   ★★ next/image ต้องรู้สัดส่วนหรือใช้ fill ซึ่งทั้งสองทางทำให้รูปแนวตั้ง
        *      กับแนวนอนแสดงผลไม่เท่ากันในกล่องเดียว
        */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[Math.min(index, total - 1)]!}
        alt=""
        className="max-h-[86dvh] max-w-full rounded-2xl object-contain"
        draggable={false}
      />

      <button
        type="button"
        onClick={onClose}
        aria-label={ot('common.close')}
        className="lb-btn absolute end-4 top-4"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      {total > 1 ? (
        <>
          <Arrow dir="prev" onClick={() => go(-1)} label={ot('market.prevPhoto')} />
          <Arrow dir="next" onClick={() => go(1)} label={ot('market.nextPhoto')} />
          {/* ★ ตัวนับบอกว่ายังมีอีกกี่ใบ — ไม่มีมันคนไม่รู้ว่าปัดต่อได้อีกไหม */}
          <p
            aria-live="polite"
            className="absolute bottom-5 rounded-full bg-white/15 px-3 py-1 text-xs tabular-nums text-white backdrop-blur"
          >
            {index + 1} / {total}
          </p>
        </>
      ) : null}
    </div>,
    document.body,
  )
}

function Arrow({ dir, onClick, label }: { dir: 'prev' | 'next'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn('lb-btn absolute top-1/2 -translate-y-1/2', dir === 'prev' ? 'start-4' : 'end-4')}
    >
      <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
}
