'use client'

import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'

/**
 * แถบบอกว่าถึงตาใคร — เด่นพอที่จะเห็นจากหางตา
 *
 * ★★★ ของเดิมเป็นข้อความสีเทาบรรทัดเดียวใต้กระดาน
 *
 *     ★ ปัญหาจริงคือมันอยู่ "ใต้" กระดาน ซึ่งบนมือถือแปลว่าอยู่นอกจอ
 *       ตอนกระดานเต็มความกว้าง ★★ คนจึงจ้องกระดานแล้วไม่รู้ว่าต้องเดิน
 *       หรือรออยู่ — ซึ่งเป็นคำถามเดียวที่ต้องตอบตลอดเวลาในเกมผลัดตา
 *     ★ สีเทาเหมือนข้อความประกอบทั่วไป ทำให้ตากวาดผ่าน
 *
 * ★★ อยู่เหนือกระดาน · ใช้สีเน้นเต็มตัวตอนถึงตาเรา · มีจุดเต้น
 *    ★ ตอนรออีกฝ่ายเป็นสีจาง ★★ ความต่างระหว่างสองสถานะต้องอ่านได้
 *      โดยไม่ต้องอ่านตัวอักษร ไม่ใช่ต่างกันแค่คำ
 *
 * ★★★ role="status" + aria-live="polite"
 *     ★ โปรแกรมอ่านหน้าจอประกาศเองตอนเปลี่ยนตา ★★ "เห็นชัด" สำหรับคนที่
 *       มองไม่เห็นคือ "ได้ยินตอนมันเปลี่ยน" ไม่ใช่ตัวอักษรใหญ่
 *     ★ polite ไม่ใช่ assertive — ไม่ควรตัดกลางประโยคที่กำลังอ่านอยู่
 */
export function TurnBanner({
  mine,
  name,
  seconds,
}: {
  /** ถึงตาเราไหม */
  mine: boolean
  /** ชื่อของอีกฝ่าย — ใช้ตอนรอเขา */
  name: string
  seconds: number
}) {
  const ot = useOt()
  /* ★ สิบวินาทีสุดท้ายเป็นสีเตือน ทั้งสองสถานะ — เวลาจะหมดก็ควรรู้ทั้งคู่ */
  const urgent = seconds <= 10

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mx-auto mb-3 flex max-w-[560px] items-center justify-center gap-2.5 rounded-full px-5 py-2.5 text-center transition-colors duration-300',
        mine ? 'turn-mine' : 'turn-theirs',
        urgent && 'turn-urgent',
      )}
    >
      <span aria-hidden="true" className={cn('turn-dot', mine && 'turn-dot-on')} />
      <span className="text-[15px] font-bold leading-tight sm:text-base">
        <Untranslated>{mine ? ot('game.online.yourTurn') : ot('game.online.theirTurn', { name })}</Untranslated>
      </span>
      {/*
        * ★★ ตัวเลขแยกชิ้นและใช้ตัวเลขความกว้างเท่ากัน
        *    ★ นับถอยหลังที่ตัวเลขขยับความกว้างทำให้ข้อความทั้งแถวกระตุก
        *      ซึ่งดึงความสนใจผิดที่ — สิ่งที่ควรเด่นคือ "ตาใคร" ไม่ใช่วินาที
        */}
      <span className="turn-clock shrink-0 text-sm tabular-nums">
        <Untranslated>{ot('game.online.secondsLeft', { n: seconds })}</Untranslated>
      </span>
    </div>
  )
}
