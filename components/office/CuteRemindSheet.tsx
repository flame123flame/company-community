'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { REMIND_TONES, TONE_EMOJI, TONE_TINT, type RemindTone } from '@/lib/office/remind'

/**
 * กล่องเลือกสไตล์ทวงเงินแบบน่ารัก
 *
 * ★★ ทวงเงินเพื่อนร่วมงานมันเกรงใจ — ให้ข้อความทำหน้าที่ "ขำ ๆ" แทนคนทวง
 *    ★ เลือกได้ 6 แบบ เห็นตัวอย่างฟองข้อความ (ชื่อ + ยอด) ก่อนกดส่ง
 *    ★ ส่งแล้ว: อีโมจิของสไตล์นั้นลอยขึ้นเต็มกล่องแล้วปิดเอง
 * ★ ไม่ใช่กล่องยืนยันอีกชั้น — การเลือกสไตล์คือการยืนยันในตัว
 */
export function CuteRemindSheet({
  name,
  amount,
  count = 1,
  onSend,
  onClose,
}: {
  /** ชื่อคนที่ถูกทวง — null = ทวงหลายคนพร้อมกัน */
  name: string | null
  /** ยอดที่แสดงในตัวอย่าง เช่น "฿120" */
  amount: string | null
  count?: number
  onSend: (tone: RemindTone) => void
  onClose: () => void
}) {
  const ot = useOt()
  const [tone, setTone] = useState<RemindTone>('CAT')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  function send() {
    setSent(true)
    onSend(tone)
    window.setTimeout(onClose, 1100)
  }

  const who = name ?? ot('wallet.tone.everyone', { n: count })

  return createPortal(
    <div className="cfm-root fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ot('wallet.tone.title')}
        className="cfm-card relative w-full max-w-[520px] overflow-hidden rounded-t-[32px] sm:rounded-[32px]"
        style={{ '--pc': TONE_TINT[tone], '--pc2': '175 82 222' } as CSSProperties}
      >
        <div className="pop-hero relative overflow-hidden px-6 pb-5 pt-6">
          <span aria-hidden="true" className="pop-blob pop-blob-a" />
          <span aria-hidden="true" className="pop-blob pop-blob-b" />
          <div className="relative flex items-center gap-3">
            <span key={tone} aria-hidden="true" className="remind-face grid size-16 shrink-0 place-items-center rounded-[22px] bg-[var(--ck-shine)] text-4xl">
              {TONE_EMOJI[tone]}
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-[var(--ck-shine)]">
                <Untranslated>{ot('wallet.tone.title')}</Untranslated>
              </h2>
              <p className="truncate text-xs text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
                <Untranslated>{ot('wallet.tone.lead', { name: who })}</Untranslated>
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {/* ตัวอย่างฟองข้อความ — หน้าตาที่คนถูกทวงจะเห็นในแจ้งเตือน */}
          <div className="remind-preview relative rounded-[22px] p-4">
            <p className="text-[11px] font-bold text-ink-faint">
              <Untranslated>{ot('wallet.tone.preview')}</Untranslated>
            </p>
            <div key={tone} className="remind-bubble mt-2 flex items-start gap-2.5 rounded-2xl rounded-tl-md p-3">
              <span aria-hidden="true" className="text-2xl leading-none">{TONE_EMOJI[tone]}</span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-ink">
                  <Untranslated>{ot(`wallet.tone.${tone}.title` as 'wallet.tone.CAT.title')}</Untranslated>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">
                  <Untranslated>{ot(`wallet.tone.${tone}.msg` as 'wallet.tone.CAT.msg')}</Untranslated>
                </span>
                {amount ? <span className="remind-amount mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums">{amount}</span> : null}
              </span>
            </div>
          </div>

          {/* ตัวเลือกสไตล์ */}
          <div role="radiogroup" aria-label={ot('wallet.tone.title')} className="mt-4 grid grid-cols-3 gap-2">
            {REMIND_TONES.map((t, i) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                onClick={() => setTone(t)}
                className={cn('remind-chip flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2', tone === t && 'remind-chip-on')}
                style={{ '--tint': TONE_TINT[t], '--i': i } as CSSProperties}
              >
                <span aria-hidden="true" className="text-2xl leading-none">{TONE_EMOJI[t]}</span>
                <span className="text-[11.5px] font-bold text-ink">
                  <Untranslated>{ot(`wallet.tone.${t}.name` as 'wallet.tone.CAT.name')}</Untranslated>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={onClose} className="min-h-12 rounded-2xl bg-surface px-5 text-sm font-semibold text-ink-soft ring-1 ring-line">
              <Untranslated>{ot('game.quiz.cancel')}</Untranslated>
            </button>
            <button type="button" disabled={sent} onClick={send} className="cfm-ok min-h-12 rounded-2xl px-4 text-base font-bold">
              <Untranslated>{sent ? ot('wallet.tone.sent') : ot('wallet.tone.send', { emoji: TONE_EMOJI[tone] })}</Untranslated>
            </button>
          </div>
        </div>

        {/* ส่งแล้ว: อีโมจิลอยขึ้นเต็มกล่อง */}
        {sent ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="cfm-heart absolute bottom-10 text-3xl" style={{ left: `${4 + ((i * 37) % 92)}%`, '--dl': `${(i % 7) * 0.06}s` } as CSSProperties}>
                {TONE_EMOJI[tone]}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
