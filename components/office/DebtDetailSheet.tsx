'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { formatBaht } from '@/lib/office/wallet'
import { ChatAvatar } from './ChatAvatar'

/**
 * รายละเอียดของรายการที่ปิดไปแล้ว
 *
 * ★★★ ประวัติที่บอกแค่ "ใคร · เท่าไหร่" ตอบคำถามที่คนย้อนมาดูไม่ได้
 *
 *     ★ คนเปิดประวัติเพราะมีข้อสงสัย — "จ่ายไปตอนไหน" · "มีสลิปไหม" ·
 *       "บิลนั้นคือมื้อไหน" ★★ ซึ่งลิสต์บรรทัดเดียวตอบไม่ได้สักข้อ
 *       และการทำให้ลิสต์ตอบได้หมดก็จะได้ลิสต์ที่อ่านไม่ออก
 *     ★ แผ่นรายละเอียดจึงเป็นที่ของข้อมูลชั้นสอง ส่วนลิสต์เหลือไว้ให้กวาดตา
 *
 * ★★ สลิปกับใบเสร็จดึงตอนเปิดแผ่น ไม่ใช่ดึงมาพร้อมลิสต์
 *    ★ ลิงก์ของไฟล์เป็น signed URL ที่มีอายุ — ขอมาล่วงหน้า 50 ใบ
 *      คือการสร้างลิงก์ที่ 49 ใบไม่มีใครเปิด แล้วมันก็หมดอายุไปเฉย ๆ
 *      ★★ และ endpoint นั้นตรวจสิทธิ์รายรายการ (NFR-07) การเรียกทีละใบ
 *         จึงตรงกับที่มันถูกออกแบบมา
 */

type Debt = {
  id: string
  amount: number
  description: string | null
  createdAt: string
  paidAt: string | null
  hasSlip: boolean
  otherName: string
  otherAvatar: string | null
  isSettlement: boolean
}

type Files = { slipUrl: string | null; receiptUrl: string | null }

export function DebtDetailSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const ot = useOt()
  const locale = useLocale()
  const [files, setFiles] = useState<Files | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    void apiFetch<Files>(`/api/office/wallet/debts/${debt.id}/files`)
      .then((r) => {
        if (alive) setFiles(r)
      })
      .catch((e) => {
        /* ★ ไฟล์โหลดไม่ได้ไม่ควรทำให้ทั้งแผ่นว่าง — ข้อมูลตัวอักษรยังอ่านได้ */
        if (alive) setError(officeErrorText(e, ot))
      })
    return () => {
      alive = false
    }
  }, [debt.id])

  if (!mounted) return null

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return createPortal(
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={ot('wallet.owed.detailTitle')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-elevated p-5 pb-7 sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <ChatAvatar name={debt.otherName} url={debt.otherAvatar} size={44} />
          <div className="min-w-0 flex-1">
            <p dir="auto" className="truncate text-[15px] font-semibold text-ink">
              {debt.otherName}
            </p>
            {/* ★ ปิดแล้วทุกใบในที่นี่ — สีเขียวคือ "เรื่องนี้จบแล้ว" ไม่ใช่ทิศทางเงิน */}
            <p className="text-2xl font-bold tabular-nums text-[rgb(52_199_123)]">
              ฿{formatBaht(locale, debt.amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ot('common.close')}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* ── ไทม์ไลน์ ──────────────────────────────────────────
            ★★ สองวันนี้คือ "เริ่มค้าง" กับ "ปิด" ★ ระยะห่างของมันคือคำตอบ
               ของ "ค้างกันอยู่นานแค่ไหน" ซึ่งเป็นเหตุผลหลักที่คนย้อนมาดู */}
        <dl className="mt-5 space-y-3">
          <Row label={ot('wallet.owed.detailCreated')} value={when(debt.createdAt)} />
          {debt.paidAt ? (
            <Row label={ot('wallet.owed.detailPaid')} value={when(debt.paidAt)} accent />
          ) : null}
          {debt.description ? (
            <Row label={ot('wallet.owed.detailNote')} value={debt.description} wrap />
          ) : null}
        </dl>

        {/* ── หลักฐาน ───────────────────────────────────────── */}
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          <Untranslated>{ot('wallet.owed.detailProof')}</Untranslated>
        </p>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : files === null ? (
          <p className="mt-2 text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : !files.slipUrl && !files.receiptUrl ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-faint">
            <Untranslated>{ot('wallet.owed.detailNoProof')}</Untranslated>
          </p>
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {files.slipUrl ? (
              <Proof url={files.slipUrl} label={ot('wallet.owed.detailSlip')} />
            ) : null}
            {files.receiptUrl ? (
              <Proof url={files.receiptUrl} label={ot('wallet.owed.detailReceipt')} />
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Row({
  label,
  value,
  accent,
  wrap,
}: {
  label: string
  value: string
  accent?: boolean
  wrap?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12px] text-ink-faint">
        <Untranslated>{label}</Untranslated>
      </dt>
      <dd
        dir="auto"
        className={cn(
          'min-w-0 text-end text-[13px]',
          wrap ? 'break-words' : 'truncate tabular-nums',
          accent ? 'font-medium text-ink' : 'text-ink-soft',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * รูปหลักฐาน
 *
 * ★ เปิดเต็มจอด้วยการกด — รูปสลิปในกรอบเล็กอ่านตัวเลขไม่ออก
 *   ★★ ซึ่งเป็นสิ่งเดียวที่คนเปิดมันมาดู
 */
function Proof({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <span className="flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-ink-soft">
        <Untranslated>{label}</Untranslated>
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 4h6v6M20 4l-8 8M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
        </svg>
      </span>
    </a>
  )
}
