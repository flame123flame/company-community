'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'

/**
 * ปุ่มแชร์/คัดลอกลิงก์
 *
 * ★★★ ลองแชร์แบบของระบบก่อน แล้วค่อยถอยมาคัดลอก
 *
 *     ★ บนมือถือ navigator.share เปิดแผงแชร์ของเครื่อง — ส่งเข้า LINE
 *       หรือแชทของเราได้ในจังหวะเดียว ★★ ซึ่งเป็นสิ่งที่คนอยากทำจริง
 *       ตอนเจอของในตลาดนัดแล้วอยากบอกเพื่อน
 *     ★ บนคอมส่วนใหญ่ไม่มี navigator.share ★★ การคัดลอกลงคลิปบอร์ด
 *       จึงเป็นทางที่ใช้ได้เสมอ และเป็นสิ่งที่คนบนคอมคาดหวังอยู่แล้ว
 *
 * ★★★ ประกอบ URL ตอนกด ไม่ใช่ตอน render
 *
 *     ★ location.origin อ่านได้เฉพาะฝั่ง browser ★★ ถ้าอ่านตอน render
 *       ครั้งแรก server จะไม่มีค่านั้น แล้ว hydration จะไม่ตรง
 *     ★ และ origin จริงต่างกันระหว่าง localhost กับตอน deploy —
 *       ★★ การฝังโดเมนไว้ในโค้ดจะทำให้ลิงก์ที่แชร์ออกไปชี้ผิดเครื่อง
 */
export function ShareLink({
  path,
  title,
  compact = false,
}: {
  path: string
  title: string
  compact?: boolean
}) {
  const ot = useOt()
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)

  /* ★ ล้างตัวตั้งเวลาตอนออกจากหน้า — ไม่งั้นมันไปเรียก setState ของที่ตายแล้ว */
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  async function share() {
    const url = `${window.location.origin}${path}`

    /*
     * ★★ เช็ก canShare ด้วย ไม่ใช่แค่ว่ามี navigator.share ไหม
     *    ★ เบราว์เซอร์บางตัวมีเมธอดแต่ปฏิเสธทุกอย่างที่ส่งเข้าไป
     *      ★★ ซึ่งจะโยน error ออกมาแล้วคนกดไม่ได้อะไรเลยสักอย่าง
     */
    const data = { title, url }
    if (typeof navigator.share === 'function' && navigator.canShare?.(data)) {
      try {
        await navigator.share(data)
        return
      } catch {
        /* ★ ผู้ใช้กดยกเลิกแผงแชร์ก็มาทางนี้ — ถอยไปคัดลอกให้เลย ไม่ต้องฟ้อง */
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setDone(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setDone(false), 2500)
    } catch {
      /*
       * ★ คลิปบอร์ดถูกปฏิเสธ (หน้าไม่ใช่ https หรือผู้ใช้ปิดสิทธิ์)
       *   ★★ เอา URL ขึ้นมาให้เลือกเองดีกว่าเงียบไป — prompt เป็นท่าเดียว
       *      ที่ได้ผลแน่นอนทุกเบราว์เซอร์
       */
      window.prompt(ot('market.copyLink'), url)
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      title={ot('market.copyLink')}
      aria-label={ot('market.copyLink')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full transition-colors',
        compact
          ? 'size-11 justify-center text-ink-soft hover:bg-surface hover:text-ink sm:size-8'
          : 'h-11 bg-surface px-3.5 text-sm text-ink hover:bg-surface-hover sm:h-9',
      )}
    >
      {done ? (
        <svg viewBox="0 0 24 24" className="size-4 text-link" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" />
          <path d="M15 11a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />
        </svg>
      )}
      {!compact ? (
        <span>
          <Untranslated>{done ? ot('market.linkCopied') : ot('market.share')}</Untranslated>
        </span>
      ) : null}
    </button>
  )
}
