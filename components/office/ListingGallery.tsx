'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { ListingImage } from './ListingImage'

/**
 * แกลเลอรีรูปของประกาศ
 *
 * ★★★ รูปแรกไม่ได้บอกทุกอย่าง — ของมือสองขายด้วยรูปที่เหลือ
 *
 *     ★ ระบบให้ลงได้ถึง 5 รูปมาตั้งแต่แรก (ดู createSchema ใน market/route.ts)
 *       ★★ แต่ทั้งหน้าตลาดแสดงแค่ images[0] ★ รูปที่เหลือถูกเก็บ ถูกนับโควตา
 *          และไม่มีใครได้เห็นเลยสักใบ
 *     ★ รูปที่สองมักเป็นรูปที่ตอบคำถามจริง: รอยขีดข่วน · ของที่แถมมาด้วย ·
 *       ★★ ซึ่งเป็นสิ่งที่ทำให้คนตัดสินใจทัก หรือตัดสินใจไม่ทัก
 *
 * ★★ โหมด compact (ในการ์ด) ไม่มีปุ่มลูกศร มีแต่จุดบอกจำนวน
 *    ★ การ์ดในตารางมีไว้ให้ "กวาดตา" ไม่ใช่ให้สำรวจ — ปุ่มบนทุกการ์ด
 *      จะกลายเป็นเป้ากดพลาดตอนเลื่อนหน้าด้วยนิ้ว
 *      ★★ และการกดลูกศรในการ์ดจะแย่งกับการกดเข้าไปดูรายละเอียด
 *         ซึ่งเป็นสิ่งที่คนตั้งใจทำจริง ๆ ตอนแตะการ์ด
 */
export function ListingGallery({
  images,
  alt,
  compact = false,
}: {
  images: string[]
  alt: string
  compact?: boolean
}) {
  const ot = useOt()
  const [i, setI] = useState(0)
  const total = images.length

  /*
   * ★★★ ดีดกลับรูปแรกเมื่อชุดรูปเปลี่ยน — ทำตอน render ไม่ใช่ใน useEffect
   *
   *     ★ หน้ารายละเอียดใช้คอมโพเนนต์เดิมซ้ำตอนเปลี่ยนประกาศ ★ ถ้าไม่รีเซ็ต
   *       ประกาศใหม่ที่มี 2 รูปจะเปิดมาที่ "รูปที่ 4" ซึ่งไม่มีอยู่
   *     ★★ ทำใน useEffect จะวาดรูปผิดใบให้เห็นหนึ่งเฟรมก่อนแล้วค่อยดีดกลับ
   *        ★ การปรับ state ตอน render คือท่าที่ React แนะนำเองสำหรับกรณีนี้
   *          — มันวาดใหม่ทันทีโดยไม่ทันขึ้นจอ
   */
  const [seenImages, setSeenImages] = useState(images)
  if (seenImages !== images) {
    setSeenImages(images)
    setI(0)
  }

  if (total === 0) {
    return (
      <div className="flex aspect-4/3 w-full items-center justify-center bg-surface text-ink-faint">
        <svg
          viewBox="0 0 24 24"
          className="size-8 opacity-60"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      </div>
    )
  }

  const go = (d: number) => setI((v) => (v + d + total) % total)

  return (
    <div className="relative">
      <ListingImage src={images[Math.min(i, total - 1)]!} alt={alt} />

      {total > 1 ? (
        <>
          {!compact ? (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={ot('market.prevPhoto')}
                className="gal-arrow start-2"
              >
                <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m14 6-6 6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={ot('market.nextPhoto')}
                className="gal-arrow end-2"
              >
                <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m10 6 6 6-6 6" />
                </svg>
              </button>
            </>
          ) : null}

          {/*
            * ★★ จุดบอกจำนวนอยู่ล่างกลาง ไม่ใช่มุม
            *    ★ มุมล่างซ้ายมีราคาทับอยู่แล้วในการ์ด และมุมขวามีป้ายสถานะ
            *      ★★ กลางล่างเป็นที่เดียวที่ว่างจริงในทั้งสองโหมด
            */}
          <span className="gal-dots" aria-hidden="true">
            {images.slice(0, 5).map((_, k) => (
              <i key={k} className={cn('gal-dot', k === i && 'gal-dot-on')} />
            ))}
          </span>

          {/* ★ ตัวเลขสำหรับคนที่ใช้โปรแกรมอ่านหน้าจอ — จุดบอกอะไรไม่ได้เลย */}
          {/* ★ sr-only ยังนับเป็น "มองเห็นได้" ในสายตาด่าน i18n
                ★★ มันถูกย่อเหลือ 1×1 ไม่ใช่ display:none — โปรแกรมอ่านหน้าจอ
                   จึงอ่านได้ และด่านก็เห็นเหมือนกัน ซึ่งถูกทั้งคู่ */}
          <span className="sr-only" aria-live="polite">
            <Untranslated>{ot('market.photoOf', { n: i + 1, total })}</Untranslated>
          </span>
        </>
      ) : null}
    </div>
  )
}

/**
 * แถวรูปย่อใต้รูปใหญ่ — เฉพาะหน้ารายละเอียด
 *
 * ★ แยกเป็นคอมโพเนนต์ของตัวเองเพราะมันต้องคุมดัชนีร่วมกับรูปใหญ่
 *   ★★ ซึ่งแปลว่าหน้ารายละเอียดต้องถือ state เอง ไม่ใช่ปล่อยให้แกลเลอรีถือ
 */
export function GalleryWithThumbs({ images, alt }: { images: string[]; alt: string }) {
  const ot = useOt()
  const [i, setI] = useState(0)
  const total = images.length

  /* ★ เหตุผลเดียวกับใน ListingGallery ข้างบน */
  const [seenImages, setSeenImages] = useState(images)
  if (seenImages !== images) {
    setSeenImages(images)
    setI(0)
  }

  if (total === 0) return <ListingGallery images={images} alt={alt} />

  const go = (d: number) => setI((v) => (v + d + total) % total)

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-line">
        <ListingImage src={images[Math.min(i, total - 1)]!} alt={alt} />
        {total > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={ot('market.prevPhoto')} className="gal-arrow start-2">
              <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <button type="button" onClick={() => go(1)} aria-label={ot('market.nextPhoto')} className="gal-arrow end-2">
              <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
            <span className="absolute bottom-2.5 end-2.5 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              <Untranslated>{ot('market.photoOf', { n: i + 1, total })}</Untranslated>
            </span>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        /* ★ เลื่อนแนวนอนได้ ไม่ตัดบรรทัด — 5 รูปบนจอ 360px ไม่มีทางพอ
             ★★ การตัดบรรทัดจะดันเนื้อหาข้างล่างลงไปโดยไม่ได้อะไรกลับมา */
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, k) => (
            <button
              key={src}
              type="button"
              onClick={() => setI(k)}
              aria-label={ot('market.photoOf', { n: k + 1, total })}
              aria-current={k === i}
              className={cn('gal-thumb', k === i && 'gal-thumb-on')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
