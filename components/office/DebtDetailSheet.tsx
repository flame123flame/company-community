'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { formatBaht } from '@/lib/office/wallet'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { PhotoLightbox } from '@/components/ui/PhotoLightbox'
import { ChatAvatar } from './ChatAvatar'

/**
 * รายละเอียดของรายการเงินหนึ่งใบ
 *
 * ★★★ มีไว้เพื่อตอบคำถามชั้นสองที่ลิสต์ตอบไม่ได้
 *
 *     ★ ลิสต์ตอบได้แค่ "ใคร เท่าไร" ★★ คำถามที่เหลือคือ "ตอนนั้นค้างกี่วัน"
 *       "มีสลิปไหม" "ปิดไปเมื่อไหร่" ★ ซึ่งยัดลงลิสต์ไม่ได้โดยไม่ทำให้
 *       ลิสต์อ่านไม่ออก
 *
 * ★★ หัวกล่องบอกทิศทางเงินด้วยสีและเครื่องหมาย
 *    ★ ของเดิมใช้สีเขียวทุกใบโดยหมายถึง "เรื่องนี้จบแล้ว" ★★ แต่ในลิสต์
 *      ใบเดียวกันเป็นสีแดงพร้อมเครื่องหมายลบ — เปิดจากลิสต์แล้วสีเปลี่ยน
 *      ★ คนอ่านว่า "กดผิดใบหรือเปล่า" ซึ่งเป็นความสงสัยที่ไม่ควรมีในหน้าเงิน
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
  /** ★ ไม่ส่งมาก็ได้ — ของเก่าบางที่ยังไม่รู้ทิศทาง แล้วจะใช้โทนกลางแทน */
  direction?: 'out' | 'in'
  status?: 'PENDING' | 'PAID_PENDING' | 'SETTLED' | 'CANCELLED'
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
    /* ★ ล็อกการเลื่อนของหน้าข้างหลัง — คืนค่าเดิมตอนปิด ไม่เขียนทับด้วยค่าว่าง */
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
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

  const out = debt.direction === 'out'
  const known = debt.direction !== undefined
  const cancelled = debt.status === 'CANCELLED'

  /*
   * ★★ "ค้างกันกี่วัน" — ระยะห่างของสองวัน คือคำตอบที่คนย้อนมาดูจริง ๆ
   *    ★ ปัดขึ้นอย่างน้อย 0 ★★ รายการที่สร้างและปิดในนาทีเดียวกันต้องเป็น
   *      "วันเดียว" ไม่ใช่ติดลบจากการปัดเศษ
   */
  const heldDays = debt.paidAt
    ? Math.max(0, Math.round((Date.parse(debt.paidAt) - Date.parse(debt.createdAt)) / 86_400_000))
    : null

  return createPortal(
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ot('wallet.owed.detailTitle')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'dialog-pop relative max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain',
          'rounded-t-[28px] border border-line bg-elevated shadow-2xl sm:rounded-[28px]',
        )}
      >
        {/* ── ขีดจับบนมือถือ — บอกว่าแผ่นนี้ปัดลงปิดได้ในสายตาของคนใช้มือถือ ── */}
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-line-strong sm:hidden" />

        {/* ══ หัวกล่อง ══════════════════════════════════════════ */}
        <header
          className={cn('dsheet-hero relative px-5 pb-5 pt-4 sm:px-6', known && (out ? 'dsheet-out' : 'dsheet-in'))}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={ot('common.close')}
            className="absolute end-3 top-3 grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          <div className="flex items-center gap-3.5">
            <span className="relative shrink-0">
              <ChatAvatar name={debt.otherName} url={debt.otherAvatar} size={54} />
              {/* ★ ป้ายทิศทางเกาะที่รูป — ตอบ "เงินไปทางไหน" ก่อนอ่านตัวอักษรใด ๆ */}
              {known ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full ring-2 ring-elevated',
                    out ? 'bg-money-out-solid' : 'bg-money-in-solid',
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={out ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'} />
                  </svg>
                </span>
              ) : null}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-ink-soft">
                <Untranslated>
                  {known
                    ? ot(out ? 'wallet.detail.paidTo' : 'wallet.detail.gotFrom', { name: debt.otherName })
                    : debt.otherName}
                </Untranslated>
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[clamp(1.9rem,8vw,2.6rem)] font-black leading-none tracking-tight tabular-nums',
                  cancelled ? 'text-ink-faint line-through' : known ? (out ? 'text-money-out' : 'text-money-in') : 'text-ink',
                )}
              >
                {known ? (out ? '−' : '+') : ''}
                <span className="text-[0.55em] align-top font-bold">฿</span>
                {formatBaht(locale, debt.amount)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {debt.status ? <StatusPill status={debt.status} /> : null}
            {debt.isSettlement ? (
              <Pill tone="plain">
                <Untranslated>{ot('wallet.detail.netted')}</Untranslated>
              </Pill>
            ) : null}
            {/*
              * ★ ศูนย์วันต้องพูดว่า "จบในวันเดียว" ไม่ใช่ "ค้างอยู่ 0 วัน"
              *   ★★ เลขศูนย์ในประโยคที่แปลว่าระยะเวลา อ่านแล้วสะดุดทุกครั้ง
              */}
            {heldDays !== null ? (
              <Pill tone="plain">
                <Untranslated>
                  {heldDays === 0 ? ot('wallet.detail.sameDay') : ot('wallet.detail.held', { n: heldDays })}
                </Untranslated>
              </Pill>
            ) : null}
          </div>
        </header>

        <div className="px-5 pb-7 sm:px-6">
          {/* ══ เรื่องที่จ่าย ═════════════════════════════════════ */}
          {debt.description ? (
            <div className="rounded-2xl border border-line bg-surface/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                <Untranslated>{ot('wallet.owed.detailNote')}</Untranslated>
              </p>
              <p dir="auto" className="mt-1 break-words text-[15px] font-medium leading-relaxed text-ink">
                {debt.description}
              </p>
            </div>
          ) : null}

          {/* ══ ไทม์ไลน์ ══════════════════════════════════════════
              ★★★ เส้นเวลาแทนตารางสองแถว
                  ★ สองแถว "สร้างเมื่อ / ปิดเมื่อ" บอกวันที่ได้ แต่ไม่ได้บอกว่า
                    มันคือลำดับของเรื่องเดียวกัน ★★ เส้นกับจุดบอกเรื่องนั้นเอง
                    โดยไม่ต้องใช้คำเลยสักคำ */}
          <ol className={cn('relative mt-4 space-y-4 ps-6', debt.description && 'mt-4')}>
            <span aria-hidden="true" className="absolute bottom-2 start-[5px] top-2 w-px bg-line" />
            <Step label={ot('wallet.owed.detailCreated')} value={when(debt.createdAt)} />
            {debt.paidAt ? (
              <Step label={ot('wallet.detail.closed')} value={when(debt.paidAt)} done />
            ) : (
              <Step label={ot('wallet.detail.stillOpen')} value="" pending />
            )}
          </ol>

          {/* ══ หลักฐาน ═══════════════════════════════════════════ */}
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <Untranslated>{ot('wallet.owed.detailProof')}</Untranslated>
          </p>

          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : files === null ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <span className="h-44 animate-pulse rounded-2xl bg-surface" />
            </div>
          ) : !files.slipUrl && !files.receiptUrl ? (
            <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-7 text-center text-[12.5px] text-ink-faint">
              <Untranslated>{ot('wallet.owed.detailNoProof')}</Untranslated>
            </p>
          ) : (
            /* ★ มีใบเดียวก็ให้เต็มความกว้าง — รูปใหญ่ขึ้นเท่าตัวโดยไม่เสียอะไร */
            <div className={cn('mt-2 grid gap-3', files.slipUrl && files.receiptUrl && 'sm:grid-cols-2')}>
              {files.slipUrl ? <Proof url={files.slipUrl} label={ot('wallet.owed.detailSlip')} /> : null}
              {files.receiptUrl ? <Proof url={files.receiptUrl} label={ot('wallet.owed.detailReceipt')} /> : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ═══════════════════════════════════════════════════════════════════ */

function Pill({ tone, children }: { tone: 'plain' | 'ok' | 'warn' | 'off'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-bold',
        tone === 'ok' && 'bg-money-in-soft text-money-in',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'off' && 'bg-surface text-ink-faint',
        tone === 'plain' && 'bg-surface text-ink-soft',
      )}
    >
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: NonNullable<Debt['status']> }) {
  const ot = useOt()
  const map = {
    SETTLED: ['ok', 'wallet.history.stSettled'],
    PAID_PENDING: ['warn', 'wallet.history.tagWaiting'],
    PENDING: ['plain', 'wallet.history.tagOpen'],
    CANCELLED: ['off', 'wallet.history.stCancelled'],
  } as const
  const [tone, key] = map[status]
  return (
    <Pill tone={tone}>
      <Untranslated>{ot(key)}</Untranslated>
    </Pill>
  )
}

/** หนึ่งจุดบนเส้นเวลา */
function Step({
  label,
  value,
  done,
  pending,
}: {
  label: string
  value: string
  done?: boolean
  pending?: boolean
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={cn(
          'absolute -start-6 top-1 size-[11px] rounded-full ring-[3px] ring-elevated',
          done ? 'bg-money-in-solid' : pending ? 'bg-line-strong' : 'bg-ink-faint',
        )}
      />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-ink-soft">
          <Untranslated>{label}</Untranslated>
        </span>
        {value ? (
          <span className={cn('shrink-0 text-[13px] tabular-nums', done ? 'font-semibold text-ink' : 'text-ink-soft')}>
            {value}
          </span>
        ) : null}
      </div>
    </li>
  )
}

/**
 * รูปหลักฐาน
 *
 * ★★★ object-contain ไม่ใช่ object-cover
 *     ★ สลิปเป็นรูปแนวตั้งเกือบทุกใบ ★★ cover จะตัดหัวและท้ายทิ้ง
 *        ซึ่งเป็นที่อยู่ของชื่อผู้รับและเลขที่รายการพอดี
 *        ★ คือสองอย่างเดียวที่คนเปิดสลิปมาดู
 */
function Proof({ url, label }: { url: string; label: string }) {
  const ot = useOt()
  const [zoom, setZoom] = useState(false)
  return (
    <>
      {/*
       * ★★★ เปิดในกล่องดูรูปเต็มจอ ไม่ใช่แท็บใหม่
       *     ★ แท็บใหม่พาออกจากหน้าไปเลย ★★ ปิดแล้วกลับมาเจอว่าแผ่นรายละเอียด
       *       ปิดไปด้วย ต้องไล่หารายการเดิมใหม่
       *     ★ และลิงก์สลิปเป็น signed URL อายุห้านาที — แท็บที่เปิดค้างไว้
       *       จะกลายเป็นหน้าเสียเงียบ ๆ โดยไม่บอกว่าทำไม
       */}
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-line bg-surface text-start transition-colors hover:border-line-strong"
      >
        <span className="relative block h-52 overflow-hidden bg-page sm:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
          />
          {/* ★ แว่นขยายลอยอยู่มุม — บอกว่ากดแล้วขยายได้ โดยไม่กินที่ของรูป */}
          <span
            aria-hidden="true"
            className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
            </svg>
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="truncate text-[12px] font-medium text-ink">
            <Untranslated>{label}</Untranslated>
          </span>
          <span className="shrink-0 text-[11px] text-ink-faint">
            <Untranslated>{ot('wallet.detail.tapZoom')}</Untranslated>
          </span>
        </span>
      </button>

      {zoom ? (
        <PhotoLightbox photos={[url]} index={0} onIndex={() => undefined} onClose={() => setZoom(false)} label={label} />
      ) : null}
    </>
  )
}
