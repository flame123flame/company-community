'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { Spinner } from '@/components/ui/Spinner'

const noopSubscribe = () => () => {}
/* ★ ฝั่ง server เดาเป็น Mac ไว้ก่อน — คนส่วนใหญ่ในออฟฟิศใช้ MacBook */
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
/* ★ มือถือไม่มีคีย์บอร์ด — บอกให้กดปุ่ม "วางรูป" แทน ⌘V */
const isTouch = () => window.matchMedia('(pointer: coarse)').matches

function imageFrom(items: DataTransferItemList | undefined | null): File | null {
  const item = [...(items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
  return item?.getAsFile() ?? null
}

/**
 * กล่องแนบสลิป — วางรูป (⌘V) · เลือกรูป · ลากมาวาง
 *
 * ★★★ คนโอนเงินบนมือถือ แต่กดในระบบบน Mac
 *
 *     ★ การส่งรูปสลิปจาก iPhone มา Mac (AirDrop / ส่งแชทหาตัวเอง) ยาวกว่า
 *       ตัวการโอนเงินเสียอีก ★★ Universal Clipboard ทำให้ "คัดลอกบน iPhone →
 *       ⌘V บน Mac" ใช้ได้ทันที — กล่องนี้จึงรับการวางจากทั้งหน้า ไม่ต้องคลิก
 *       ช่องไหนก่อน
 *     ★ ปุ่ม "วางรูป" มีไว้สำหรับคนไม่ถนัดคีย์ลัด และสำหรับมือถือที่ไม่มี ⌘V
 *
 * ★ พรีวิวใช้ object URL ของไฟล์ในเครื่อง — ถังสลิปเป็น private
 *   ★★ ไม่ต้องขอ signed URL กลับมาเพื่อโชว์รูปที่อยู่ในเครื่องอยู่แล้ว
 */
export function SlipDrop({
  onFile,
  onRemove,
  existingUrl = null,
  disabled = false,
}: {
  /** อัปไฟล์ — คืน true เมื่อสำเร็จ (ผู้เรียกแสดง error เอง) */
  onFile: (file: File) => Promise<boolean>
  /** ไม่ส่งมา = เอาออกไม่ได้ (สลิปที่บันทึกลงหนี้ไปแล้ว) */
  onRemove?: () => void
  /** สลิปที่แนบไว้ก่อนหน้า (signed URL) */
  existingUrl?: string | null
  disabled?: boolean
}) {
  const ot = useOt()
  const apple = useSyncExternalStore(noopSubscribe, isApple, () => true)
  const touch = useSyncExternalStore(noopSubscribe, isTouch, () => false)
  const keys = apple ? '⌘V' : 'Ctrl+V'
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [flash, setFlash] = useState(0)

  const shown = preview ?? existingUrl
  const locked = busy || disabled

  async function take(file: File) {
    if (locked) return
    setHint(null)
    setBusy(true)
    try {
      if (await onFile(file)) {
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old)
          return URL.createObjectURL(file)
        })
        setFlash((n) => n + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  /*
   * ★★ ฟังการวางทั้งหน้าระหว่างที่กล่องนี้อยู่บนจอ
   *    ★ คนกด ⌘V ทันทีที่เปิดแผ่นจ่าย โดยไม่คลิกอะไรก่อน
   *    ★ ถ้าคลิปบอร์ดไม่มีรูป ปล่อยให้การวางข้อความทำงานตามปกติ
   *    ★ เก็บฟังก์ชันไว้ใน ref — effect ผูกครั้งเดียว แต่อ่าน state ล่าสุดเสมอ
   */
  const takeRef = useRef(take)
  useEffect(() => {
    takeRef.current = take
  })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFrom(e.clipboardData?.items)
      if (!file) return
      e.preventDefault()
      void takeRef.current(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  /*
   * ★ ปุ่มวาง — ใช้ Clipboard API อ่านรูปตรง ๆ
   *   ★★ Safari/iOS จะเด้งปุ่ม "วาง" ให้ยืนยันอีกครั้ง — เป็นเรื่องปกติ
   *   ★ อ่านไม่ได้ (เบราว์เซอร์เก่า / ไม่อนุญาต) = บอกให้ใช้คีย์ลัดแทน
   */
  async function pasteFromButton() {
    if (locked) return
    setHint(null)
    if (!navigator.clipboard?.read) {
      setHint(ot('wallet.slip.useKeys', { keys }))
      return
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const ext = type.split('/')[1] ?? 'png'
        await take(new File([blob], `slip.${ext}`, { type }))
        return
      }
      setHint(ot('wallet.slip.noImage'))
    } catch {
      setHint(ot('wallet.slip.useKeys', { keys }))
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
    if (file) void take(file)
  }

  function remove() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    onRemove?.()
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
      className={cn(
        'relative rounded-2xl border border-dashed p-3 transition-colors',
        dragging
          ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]'
          : 'border-line-strong bg-surface/40',
      )}
    >
      <div className="flex items-center gap-3">
        {/* ── ภาพย่อ / ไอคอน ─────────────────────────────────── */}
        <div
          key={flash}
          className={cn(
            'relative grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-lg',
            shown ? 'ring-1 ring-line' : 'bg-elevated text-ink-faint ring-1 ring-line',
            flash > 0 && 'qr-pop',
          )}
        >
          {busy ? (
            <Spinner className="size-4" />
          ) : shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL / signed URL ส่วนตัว
            <img src={shown} alt={ot('wallet.pay.slipAlt')} className="size-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
              <path d="M14 3v4h4M9 13h6M9 17h4" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {ot('wallet.pay.slip')}{' '}
            <span className="text-xs font-normal text-ink-faint">· {ot('wallet.slip.optional')}</span>
          </p>
          <p aria-live="polite" className={cn('mt-0.5 text-xs', shown && !busy ? 'font-medium text-ink' : 'text-ink-soft')}>
            {busy
              ? ot('wallet.slip.uploading')
              : dragging
                ? ot('wallet.slip.dropHere')
                : shown
                  ? ot('wallet.slip.attached')
                  : touch
                    ? ot('wallet.slip.pasteHintTouch')
                    : ot('wallet.slip.pasteHint', { keys })}
          </p>
        </div>

        {shown && onRemove && !busy ? (
          <button
            type="button"
            onClick={remove}
            aria-label={ot('wallet.slip.remove')}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-danger"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* ── ปุ่ม: วางรูป · เลือกรูป ─────────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void pasteFromButton()}
          disabled={locked}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-3 text-sm font-medium text-page transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
          </svg>
          {ot('wallet.slip.paste')}
          <kbd className="hidden rounded-md bg-[color-mix(in_srgb,var(--color-page)_18%,transparent)] px-1.5 py-0.5 font-sans text-[11px] sm:inline">
            {keys}
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={locked}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-elevated px-3 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
            <path d="m3.5 16 4.5-4.5 4 4 3-3 5 5M15.5 9.5h.01" />
          </svg>
          {shown ? ot('wallet.pay.changeSlip') : ot('wallet.slip.pick')}
        </button>
      </div>

      {hint ? (
        <p role="alert" className="mt-2 text-center text-xs text-warn">
          {hint}
        </p>
      ) : null}

      {/* ── วิธีคัดลอกจาก iPhone ────────────────────────────────── */}
      <details className="group mt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 text-xs text-link [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
            <path d="M11 18.5h2" />
          </svg>
          {ot('wallet.slip.howTitle')}
          <svg viewBox="0 0 24 24" className="size-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <ol className="mt-1 space-y-2.5 rounded-xl bg-elevated p-3 text-xs leading-relaxed text-ink-soft ring-1 ring-line">
          {[ot('wallet.slip.how1'), ot('wallet.slip.how2'), ot('wallet.slip.how3', { keys })].map((text, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">
                {i + 1}
              </span>
              <span className="min-w-0 pt-px">{text}</span>
            </li>
          ))}
          <li className="border-t border-line pt-2.5 text-[11px] text-ink-faint">{ot('wallet.slip.howNote')}</li>
        </ol>
      </details>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void take(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
