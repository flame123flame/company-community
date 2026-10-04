'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { renderSVG } from 'uqr'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * กล่องแชร์ห้อง — QR + ลิงก์ + เปลี่ยนชื่อห้อง
 *
 * ★★ ทำไม QR ถึงคุ้มกับการเพิ่ม dependency
 *
 *    สถานการณ์จริงของแอปนี้คือคนนั่งอยู่ด้วยกันแล้วอยากฟังเพลงเดียวกัน
 *    การบอกรหัส 6 ตัวปากเปล่าแล้วให้เพื่อนพิมพ์ตามคือจุดที่ช้าที่สุดทั้งกระบวนการ
 *    — และพิมพ์ผิดบ่อยด้วย (0 กับ O ถึงต้องใช้ Crockford Base32 ตั้งแต่แรก)
 *
 *    ยื่นจอให้สแกนคือ "เข้าห้องได้ใน 2 วินาที" ซึ่งเปลี่ยนประสบการณ์จริง
 *
 * ★ ใช้ uqr เพราะเล็กและคืน SVG ตรง ๆ ไม่ต้องมี canvas
 *   (เขียน encoder เองได้แต่ต้องทำ Reed–Solomon ครบ ~200 บรรทัด
 *    ที่ผิดแล้วหายาก — ไม่คุ้มกับการประหยัด dependency ตัวเดียว)
 */
// ★ ต้องอยู่นอกคอมโพเนนต์เพื่อให้ reference คงที่ ไม่งั้น React resubscribe ทุก render
const subscribeNoop = () => () => {}
const getOrigin = () => window.location.origin
const getOriginServer = () => ''
const getCanShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const getCanShareServer = () => false

export function ShareDialog({
  roomCode,
  roomName,
  onClose,
  onRename,
  onToast,
}: {
  roomCode: string
  roomName: string
  onClose: () => void
  onRename: (name: string) => Promise<void>
  onToast: (text: string, tone?: 'success' | 'error') => void
}) {
  const t = useT()
  const confirm = useConfirm()
  const [name, setName] = useState(roomName)
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  /**
   * ★ คำนวณตอน render ผ่าน useSyncExternalStore ไม่ใช่ setState ใน effect
   *
   *   `location` ไม่มีบน server จึงอ่านตอน render ตรง ๆ ไม่ได้
   *   แต่การใช้ effect + setState ทำให้ render สองรอบและผู้ใช้เห็น
   *   กล่องเปล่าแวบหนึ่งก่อน QR จะโผล่
   *
   *   useSyncExternalStore มี getServerSnapshot แยก React จึงรู้ตั้งแต่แรก
   *   ว่าฝั่ง server คือค่าว่าง แล้ว hydrate ด้วยค่าจริงในรอบเดียว
   *   (หลักการเดียวกับ useRememberedDisplayName)
   */
  const origin = useSyncExternalStore(subscribeNoop, getOrigin, getOriginServer)
  const canShare = useSyncExternalStore(subscribeNoop, getCanShare, getCanShareServer)
  const url = origin ? `${origin}/room/${roomCode}` : ''
  const svg = url
    ? renderSVG(url, {
        // ★ ecc สูงขึ้นเผื่อสแกนจากจอที่มีแสงสะท้อน/นิ้วบัง
        ecc: 'M',
        border: 2,
        blackColor: '#0f0f0f',
        whiteColor: '#ffffff',
      })
    : ''

  useEffect(() => {
    /* ★ ระหว่างกล่องยืนยันเปิดอยู่ (portal แยก นอก boxRef) — Esc/คลิกเป็นของกล่องนั้น ไม่ใช่สั่งปิดกล่องแชร์ */
    const confirmOpen = () => document.querySelector('.cfm-root') !== null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmOpen()) onClose()
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (confirmOpen()) return
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // capture phase ด้วยเหตุผลเดียวกับ AppHeader (ดูคอมเมนต์ที่นั่น)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose])

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      onToast(t('share.copied', { what: label }), 'success')
    } catch {
      // clipboard ถูกบล็อก (http หรือผู้ใช้ปฏิเสธ) — ข้อความอยู่บนจอให้อ่านอยู่แล้ว
      onToast(text, 'success')
    }
  }

  async function save() {
    const value = name.trim()
    if (!value || value === roomName) return
    if (!(await confirm({ kind: 'edit', subject: value }))) return
    setSaving(true)
    try {
      await onRename(value)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('share.label')}
    >
      <div
        ref={boxRef}
        className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-line bg-elevated"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-medium">{t('share.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* ── QR ─────────────────────────────────────────────── */}
          <div className="flex justify-center">
            {svg ? (
              <div
                className="w-[200px] overflow-hidden rounded-xl bg-white p-1"
                // uqr คืน SVG ที่สร้างจากข้อมูลของเราเอง ไม่มีอินพุตจากผู้ใช้อื่น
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="size-[200px] animate-pulse rounded-xl bg-surface" />
            )}
          </div>

          <p className="text-center text-xs text-ink-soft">{t('share.scanHint')}</p>

          {/**
           * ★★ ปุ่มแชร์ของเครื่อง — โผล่เฉพาะเครื่องที่รองรับ
           *
           *   บนมือถือ navigator.share เปิดแผงแชร์ของระบบ ส่งเข้า LINE /
           *   Messages / อะไรก็ได้ที่ติดตั้งไว้ ซึ่งเป็นสิ่งที่คนอยากทำจริง ๆ
           *   ("ส่งลิงก์ให้เพื่อนใน LINE") ไม่ใช่การคัดลอกแล้วไปหาแอปเอง
           *
           *   ★ ต้องเช็คก่อนแสดง ไม่ใช่แสดงแล้วค่อย fallback —
           *     บนเดสก์ท็อปส่วนใหญ่ไม่มี API นี้ ปุ่มที่กดแล้วไม่เกิดอะไร
           *     แย่กว่าไม่มีปุ่ม และปุ่มคัดลอกลิงก์ด้านล่างทำหน้าที่แทนได้อยู่แล้ว
           */}
          {canShare ? (
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => {
                void navigator
                  .share({ title: t('share.systemTitle', { name: roomName }), text: t('share.systemText', { code: roomCode }), url })
                  // ผู้ใช้กดยกเลิกแผงแชร์ = ไม่ใช่ error ที่ต้องบอกอะไร
                  .catch(() => {})
              }}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.4.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8.1 9.8c-.6-.5-1.3-.8-2.1-.8-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2.1-.8l7 4.1c-.1.2-.1.4-.1.6 0 1.6 1.3 3 3 3s3-1.3 3-3-1.4-2.9-3-2.9z" />
              </svg>
              {t('share.shareLink')}
            </Button>
          ) : null}

          {/* ── รหัสห้อง ────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => void copy(roomCode, t('home.join.codeLabel'))}
            className={cn(
              'flex w-full items-center justify-between rounded-xl border border-line px-4 py-3',
              'transition-colors hover:border-line-strong hover:bg-surface',
            )}
          >
            <span className="text-xs text-ink-soft">{t('home.join.codeLabel')}</span>
            <span className="font-mono text-lg tracking-[0.3em]">{roomCode}</span>
          </button>

          <button
            type="button"
            onClick={() => void copy(url, t('share.link'))}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl border border-line px-4 py-2.5',
              'transition-colors hover:border-line-strong hover:bg-surface',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-soft" fill="currentColor" aria-hidden="true">
              <path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z" />
            </svg>
            <span dir="ltr" className="min-w-0 flex-1 truncate text-left text-xs text-ink-soft">{url}</span>
          </button>

          {/* ── ชื่อห้อง ────────────────────────────────────────── */}
          <div className="border-t border-line pt-4">
            <label className="mb-1.5 block text-xs text-ink-soft" htmlFor="room-name">
              {t('share.roomName')}
            </label>
            <div className="flex gap-2">
              <Input
                id="room-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save()
                }}
                maxLength={60}
                aria-label={t('share.roomName')}
                disabled={saving}
              />
              <Button
                onClick={() => void save()}
                loading={saving}
                disabled={!name.trim() || name.trim() === roomName}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
