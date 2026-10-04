'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'
import { Untranslated } from '@/lib/i18n/office'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * กล่องยืนยันกลางของทั้งเว็บ — แทน window.confirm ทุกที่
 *
 * ★★★ เจ้าของสั่ง (4 ต.ค. 2026): ทุกการ ลบ · เพิ่ม · แก้ไข · ออกจากระบบ ต้องมีกล่องยืนยันสวย ๆ
 *     ★ window.confirm ได้กล่องเทาของเบราว์เซอร์ ภาษาของเบราว์เซอร์ ปุ่ม "OK" ที่ไม่บอกว่าจะเกิดอะไร
 *     ★★ กล่องนี้บอกว่ากำลังจะทำอะไร กับอะไร (subject) และปุ่มพูดเป็นคำกริยาจริง ("ลบเลย" ไม่ใช่ "OK")
 *
 * ใช้:
 *   const confirm = useConfirm()
 *   if (!(await confirm({ kind: 'delete', subject: shop.name }))) return
 *
 * ★ ข้อความตั้งต้นตามชนิด (kind) อยู่ในดิกหลัก `cfm.*` — ส่ง title/message ของตัวเองทับได้
 * ★ ออกจากระบบ = กล่อง "ยื้อ" สุ่มประโยคน่าสงสาร ปุ่มอยู่ต่อเด่นกว่าปุ่มออก
 *   ★★ สุ่มตอนเปิดกล่อง (ใน event) ไม่ใช่ตอน render — render ต้องให้ผลเดิมเสมอ
 */
export type ConfirmKind = 'delete' | 'create' | 'edit' | 'leave' | 'danger' | 'logout'

export type ConfirmOptions = {
  kind: ConfirmKind
  /** ชื่อสิ่งที่กำลังจะทำ เช่น ชื่อร้าน — ขึ้นในหัวข้อเป็น “…” */
  subject?: string | null
  /** แทนหัวข้อตั้งต้น */
  title?: string
  /** แทนคำอธิบายตั้งต้น */
  message?: string
  confirmLabel?: string
  cancelLabel?: string
}

type Open = ConfirmOptions & { resolve: (ok: boolean) => void; variant: number }

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

/** สีหัวกล่องของแต่ละชนิด — rgb สามตัวเลข (ระบบเดียวกับ --pc/--pc2 ของกล่องแชท/แจ้งเตือน) */
const TINT: Record<ConfirmKind, [string, string]> = {
  delete: ['255 59 48', '255 149 0'],
  danger: ['255 0 51', '175 82 222'],
  create: ['52 199 123', '48 209 176'],
  edit: ['10 132 255', '175 82 222'],
  leave: ['255 176 32', '255 59 48'],
  logout: ['255 105 180', '175 82 222'],
}

const EMOJI: Record<ConfirmKind, string> = {
  delete: '🗑️',
  danger: '⚠️',
  create: '✨',
  edit: '✏️',
  leave: '🚪',
  logout: '🥺',
}

const LOGOUT_VARIANTS = 3

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null)

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setOpen({ ...o, resolve, variant: Math.floor(Math.random() * LOGOUT_VARIANTS) + 1 })
      }),
    [],
  )

  const close = useCallback(
    (ok: boolean) => {
      open?.resolve(ok)
      setOpen(null)
    },
    [open],
  )

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {open ? <ConfirmDialog o={open} onClose={close} /> : null}
    </ConfirmContext.Provider>
  )
}

/**
 * ★ นอก provider (เช่นหน้าที่ยังไม่ได้ครอบ) ถอยไปใช้ window.confirm — ไม่พัง และยังถามอยู่
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  const t = useT()
  return useCallback(
    (o: ConfirmOptions) => {
      if (ctx) return ctx(o)
      return Promise.resolve(window.confirm(o.message ?? o.title ?? t(`cfm.${o.kind}.title` as DictKey)))
    },
    [ctx, t],
  )
}

function ConfirmDialog({ o, onClose }: { o: Open; onClose: (ok: boolean) => void }) {
  const t = useT()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const okRef = useRef<HTMLButtonElement | null>(null)
  /* ★ กด "อยู่ต่อ" ในกล่องออกจากระบบ = ฉลองสั้น ๆ ก่อนปิด */
  const [cheer, setCheer] = useState(false)
  const k = o.kind
  const isLogout = k === 'logout'
  const [pc, pc2] = TINT[k]

  const key = (s: string) => t(`cfm.${k}.${s}` as DictKey)
  const title =
    o.title ??
    (isLogout
      ? t(`cfm.logout.title${o.variant}` as DictKey)
      : o.subject
        ? t(`cfm.${k}.titleOf` as DictKey, { subject: o.subject })
        : key('title'))
  const message = o.message ?? (isLogout ? t(`cfm.logout.msg${o.variant}` as DictKey) : key('msg'))
  const okLabel = o.confirmLabel ?? key('ok')
  const cancelLabel = o.cancelLabel ?? (isLogout ? t('cfm.logout.stay') : t('cfm.cancel'))

  const stay = useCallback(() => {
    if (!isLogout) return onClose(false)
    setCheer(true)
    window.setTimeout(() => onClose(false), 900)
  }, [isLogout, onClose])

  useEffect(() => {
    /* ★ โฟกัสปุ่มปลอดภัยก่อน — กด Enter เผลอ ๆ ต้องไม่ลบของทิ้ง */
    cancelRef.current?.focus()
    /*
     * ★★ ฟังแบบ capture แล้ว stopPropagation — กล่องนี้มักเปิดทับกล่องอื่น (แชร์ห้อง · ฟอร์มร้าน · โปรไฟล์)
     *    ซึ่งปิดตัวเองเมื่อกด Esc ★ ถ้าปล่อยให้ Esc ไหลต่อ กดยกเลิกที่นี่ = กล่องข้างล่างปิดตามไปด้วย
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        stay()
      }
      /* ★ วนโฟกัสอยู่ในกล่อง — สองปุ่ม */
      if (e.key === 'Tab') {
        e.preventDefault()
        const next = document.activeElement === cancelRef.current ? okRef.current : cancelRef.current
        next?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [stay])

  return createPortal(
    <div
      className="cfm-root fixed inset-0 z-[100] grid place-items-center p-4"
      onPointerDown={(e) => {
        /* ★ กันคลิกในกล่องนี้ไปถึงตัวฟัง "คลิกข้างนอก" ของกล่อง/เมนูที่อยู่ข้างล่าง (ฟังที่ document) */
        e.nativeEvent.stopPropagation()
        if (e.target === e.currentTarget) stay()
      }}
      onMouseDown={(e) => e.nativeEvent.stopPropagation()}
      onClick={(e) => e.nativeEvent.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cfm-title"
        aria-describedby="cfm-msg"
        className={cn('cfm-card relative w-full max-w-[420px] overflow-hidden rounded-[32px]', isLogout && 'cfm-logout')}
        style={{ '--pc': pc, '--pc2': pc2 } as CSSProperties}
      >
        <div className="pop-hero relative overflow-hidden px-6 pb-16 pt-8 text-center">
          <span aria-hidden="true" className="pop-blob pop-blob-a" />
          <span aria-hidden="true" className="pop-blob pop-blob-b" />
          {isLogout ? (
            /* น้ำตาหยดสามหยด — สะอื้นนิด ๆ ให้ใจอ่อน */
            <span aria-hidden="true" className="pointer-events-none absolute inset-0">
              {[30, 50, 70].map((x, i) => (
                <span key={x} className="cfm-tear absolute top-[38%] text-lg" style={{ left: `${x}%`, '--dl': `${i * 0.5}s` } as CSSProperties}>
                  💧
                </span>
              ))}
            </span>
          ) : null}
          {cheer ? (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0">
              {['💖', '🎉', '💕', '✨', '💗', '🥳'].map((e, i) => (
                <span key={i} className="cfm-heart absolute bottom-6 text-2xl" style={{ left: `${12 + i * 15}%`, '--dl': `${i * 0.06}s` } as CSSProperties}>
                  {e}
                </span>
              ))}
            </span>
          ) : null}
        </div>

        {/* ★ ไอคอนใหญ่ลอยคร่อมรอยต่อหัวกับเนื้อ — จุดดึงสายตาจุดเดียวของกล่อง */}
        <span aria-hidden="true" className={cn('cfm-icon absolute left-1/2 top-12 grid size-24 place-items-center rounded-[30px] text-5xl', `cfm-icon-${k}`)}>
          <span className="cfm-emoji">{cheer ? '🥰' : EMOJI[k]}</span>
        </span>

        <div className="px-6 pb-6 pt-[68px] text-center">
          <h2 id="cfm-title" className="text-[22px] font-black leading-tight text-ink">
            <Untranslated>{cheer ? t('cfm.logout.yay') : title}</Untranslated>
          </h2>
          <p id="cfm-msg" className="mx-auto mt-2 max-w-[330px] text-sm leading-relaxed text-ink-soft">
            <Untranslated>{cheer ? t('cfm.logout.yayMsg') : message}</Untranslated>
          </p>

          {/* ★ ออกจากระบบ: ปุ่ม "อยู่ต่อ" เด่น ปุ่มออกเป็นตัวหนังสือเล็ก — กลับด้านจากกล่องอื่นโดยตั้งใจ */}
          {isLogout ? (
            <div className="mt-6 flex flex-col gap-2">
              <button ref={cancelRef} type="button" onClick={stay} disabled={cheer} className="cfm-ok min-h-13 rounded-2xl px-5 text-base font-bold">
                <Untranslated>{cancelLabel}</Untranslated>
              </button>
              <button ref={okRef} type="button" onClick={() => onClose(true)} disabled={cheer} className="min-h-11 rounded-2xl px-5 text-sm font-medium text-ink-faint transition-colors hover:bg-surface hover:text-ink-soft">
                <Untranslated>{okLabel}</Untranslated>
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button ref={cancelRef} type="button" onClick={stay} className="min-h-12 rounded-2xl bg-surface px-4 text-sm font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-ink">
                <Untranslated>{cancelLabel}</Untranslated>
              </button>
              <button ref={okRef} type="button" onClick={() => onClose(true)} className="cfm-ok min-h-12 rounded-2xl px-4 text-sm font-bold">
                <Untranslated>{okLabel}</Untranslated>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
