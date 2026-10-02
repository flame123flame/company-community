'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderSVG } from 'uqr'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { formatBaht } from '@/lib/office/wallet'
import { promptPayPayload } from '@/lib/office/promptpay'
import { shrinkImage } from '@/lib/image/shrink'
import { ChatAvatar } from './ChatAvatar'

export type PayTarget = {
  /** หนี้ทุกใบที่ปุ่มนี้ครอบคลุม — ยอดสุทธิที่หักลบแล้วมีหลายใบ */
  debtIds: string[]
  otherId: string
  otherName: string
  otherAvatar: string | null
  otherPromptPayId: string | null
  otherHasQr: boolean
  amount: number
  /** true = เป็นยอดสุทธิที่ต้องหักลบก่อนจึงจะจ่ายได้ */
  needsNetting: boolean
}

/**
 * แผ่นจ่ายเงิน — เลื่อนขึ้นจากล่างจอ
 *
 * ★★★ จ่ายให้จบใน 2 แตะ: "จ่าย" → "จ่ายแล้ว"
 *
 *     ★ ทุกอย่างที่คนต้องใช้ตอนโอนอยู่ในแผ่นเดียว — QR ที่มียอดอยู่แล้ว ·
 *       เบอร์ให้คัดลอก · ปุ่มยืนยัน ★★ ไม่ต้องเปลี่ยนหน้า ไม่ต้องจำยอด
 *     ★ QR สร้างสด ๆ จากเบอร์พร้อมเพย์ + ยอดเงิน ไม่ใช่รูปที่อัปไว้
 *       ★★ รูปที่อัปไว้ไม่มียอดอยู่ข้างใน คนจ่ายต้องพิมพ์เอง ซึ่งเป็นจุดที่
 *          โอนผิดจำนวนกันบ่อยที่สุด
 *
 * ★★ แผ่นล่างจอ ไม่ใช่กล่องกลางจอ
 *    ★ นิ้วโป้งอยู่ล่างจอ ★★ กล่องกลางจอทำให้ปุ่มสำคัญไปอยู่กลางมือ
 *      ซึ่งต้องขยับทั้งมือเพื่อกด
 */
export function PaySheet({
  target,
  onClose,
  onDone,
}: {
  target: PayTarget
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const ot = useOt()
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [slipPath, setSlipPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /*
   * ★ สร้าง SVG ครั้งเดียวต่อยอด/เบอร์ ไม่ใช่ทุกครั้งที่ re-render
   *   ★★ การเข้ารหัส QR เป็นงานคำนวณจริง ไม่ใช่การต่อสตริง
   */
  const qrSvg = useMemo(() => {
    if (!target.otherPromptPayId) return null
    const payload = promptPayPayload(target.otherPromptPayId, target.amount)
    if (!payload) return null
    /* ★ uqr คืน SVG จากข้อมูลที่เราสร้างเอง ไม่มีอินพุตจากผู้ใช้คนอื่นปน */
    /* ★ ตั้งสีเองให้แน่ใจว่าเป็นดำบนขาวเสมอ ไม่ว่าธีมของหน้าจะเป็นอะไร
         ★★ ecc 'M' เผื่อแสงสะท้อนและนิ้วบัง — ชุดเดียวกับที่ห้องเพลงใช้ */
    return renderSVG(payload, {
      ecc: 'M',
      border: 2,
      blackColor: '#0f0f0f',
      whiteColor: '#ffffff',
    })
  }, [target.otherPromptPayId, target.amount])

  async function copyId() {
    if (!target.otherPromptPayId) return
    try {
      await navigator.clipboard.writeText(target.otherPromptPayId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(ot('wallet.owed.copyPromptpay'), target.otherPromptPayId)
    }
  }

  function saveQr() {
    if (!qrSvg) return
    /*
     * ★★ บันทึกเป็นไฟล์ SVG ไม่ใช่ PNG
     *    ★ การแปลงเป็น PNG ต้องใช้ canvas ซึ่งแปลว่าต้องวาดแล้วอ่านกลับ
     *      ★★ SVG เปิดได้ทุกเครื่องและคมทุกขนาด — แอปธนาคารอ่านจากรูปในคลัง
     *         ได้เหมือนกัน
     */
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promptpay-${target.amount}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function uploadSlip(file: File) {
    setUploading(true)
    try {
      const small = await shrinkImage(file, 1280)
      const form = new FormData()
      form.append('file', small)
      const res = await fetch('/api/office/wallet/receipt', { method: 'POST', body: form })
      const payload = (await res.json()) as
        | { ok: true; data: { path: string } }
        | { ok: false; error: { message: string } }
      if (!payload.ok) throw new Error(payload.error.message)
      setSlipPath(payload.data.path)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setUploading(false)
    }
  }

  async function markPaid() {
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      /*
       * ★★★ ยอดสุทธิต้องหักลบที่ฐานข้อมูลก่อน แล้วค่อยจ่ายใบที่เหลือ
       *
       *     ★ ข้อกำหนด 3.2: "ถ้าเป็นยอดสุทธิที่หักลบแล้ว กด 'จ่ายแล้ว'
       *       ครั้งเดียวต้องครอบคลุมทุกบิลที่เกี่ยวข้อง"
       *     ★★ การไล่ mark ทีละใบฝั่งเราอย่างเดียวจะผิด — หนี้ฝั่งที่เขาค้างเรา
       *        จะยังค้างอยู่ ทั้งที่ถูกใช้หักไปแล้วในยอดสุทธิ
       *        ★ net_debts_between ปิดทั้งสองฝั่งพร้อมกันในทรานแซกชันเดียว
       *          แล้วสร้างใบสุทธิใบเดียวออกมา ซึ่งเป็นใบที่เราจ่าย
       */
      if (target.needsNetting) {
        const net = await apiFetch<{ newDebtId: string | null }>('/api/office/wallet/net', {
          method: 'POST',
          body: { otherId: target.otherId },
        })
        if (net.newDebtId) {
          await apiFetch(`/api/office/wallet/debts/${net.newDebtId}`, {
            method: 'POST',
            body: { action: 'markPaid', slipPath },
          })
        }
      } else {
        /*
         * ★ หลายใบที่ไม่ต้องหักลบ — ยิงทีละใบตามลำดับ
         *   ★★ ไม่ใช้ Promise.all ★ ถ้าใบที่สามล้ม เราต้องรู้ว่าสองใบแรก
         *      สำเร็จไปแล้ว ไม่ใช่ได้ error รวมที่บอกไม่ได้ว่าอะไรผ่านบ้าง
         */
        for (const id of target.debtIds) {
          await apiFetch(`/api/office/wallet/debts/${id}`, {
            method: 'POST',
            body: { action: 'markPaid', slipPath },
          })
        }
      }
      onDone(ot('wallet.owed.toastPaid'))
    } catch (e) {
      setError(officeErrorText(e, ot))
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={ot('wallet.owed.pay')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* ★ มุมบนโค้ง มุมล่างตรงบนมือถือ — รูปทรงของแผ่นที่เลื่อนขึ้นจากขอบจอ */}
      <div className="w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-elevated p-5 pb-7 sm:max-h-[90dvh] sm:rounded-3xl">
        <div className="flex items-center gap-3">
          <ChatAvatar name={target.otherName} url={target.otherAvatar} size={44} />
          <div className="min-w-0 flex-1">
            <p dir="auto" className="truncate text-[15px] font-semibold text-ink">
              {target.otherName}
            </p>
            <p className="text-2xl font-bold tabular-nums text-accent">
              ฿{formatBaht(locale, target.amount)}
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

        {/* ── QR ───────────────────────────────────────────────── */}
        {qrSvg ? (
          <div className="mt-4">
            <p className="text-center text-xs text-ink-soft">
              <Untranslated>
                {ot('wallet.owed.scanToPay', { amount: `฿${formatBaht(locale, target.amount)}` })}
              </Untranslated>
            </p>
            {/*
              * ★★ พื้นขาวเสมอรอบ QR แม้อยู่โหมดมืด
              *    ★ เครื่องสแกนต้องการคอนทราสต์ขาว-ดำ ★★ QR สีขาวบนพื้นดำ
              *       อ่านไม่ออกบนกล้องหลายรุ่น ซึ่งคนจะโทษว่าแอปธนาคารพัง
              */}
            {/*
              * ★★★ ต้องกำหนดความกว้างให้กล่อง ไม่ใช่ w-fit
              *
              *     ★ SVG ที่ uqr คืนมาไม่มี width/height ★★ ปล่อยให้ w-fit
              *       คำนวณเอง แล้วมันยุบเหลือจุดเดียว
              *       ★ เห็นบนจอจริงเป็นวงกลมขาวเล็ก ๆ แทน QR — สแกนไม่ได้
              *         และไม่มีอะไรฟ้องเลยทั้ง tsc และ build
              *     ★★ ห้องเพลงเจอเรื่องเดียวกันและตรึงไว้ที่ 200px — ใช้ท่าเดียวกัน
              */}
            <div
              className="mx-auto mt-2 w-[208px] overflow-hidden rounded-2xl bg-white p-2"
              /* ★ SVG สร้างจากสายอักขระที่เราประกอบเอง ไม่มีอินพุตของผู้ใช้คนอื่นปน */
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="secondary" className="min-h-11" onClick={saveQr}>
                <Untranslated>{ot('wallet.owed.saveQr')}</Untranslated>
              </Button>
              <Button size="sm" variant="secondary" className="min-h-11" onClick={copyId}>
                <Untranslated>
                  {copied ? ot('wallet.owed.copied') : ot('wallet.owed.copyPromptpay')}
                </Untranslated>
              </Button>
            </div>
          </div>
        ) : (
          /*
           * ★★ ไม่มี QR ก็ยังกด "จ่ายแล้ว" ได้ตามข้อกำหนด
           *    ★ คนโอนกันทางอื่นได้ (โอนมือ เงินสด) ★★ การบล็อกไว้จะทำให้
           *      หนี้ที่จ่ายจริงแล้วค้างอยู่ในระบบตลอดไป
           */
          <p className="mt-4 rounded-xl bg-surface px-3 py-2.5 text-center text-xs text-ink-soft">
            <Untranslated>{ot('wallet.owed.noQrYet')}</Untranslated>
          </p>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-center text-xs text-danger">
            {error}
          </p>
        ) : null}

        {/* ── ปุ่มหลัก ─────────────────────────────────────────── */}
        <Button
          variant="primary"
          loading={busy}
          onClick={markPaid}
          className="mt-4 h-12 w-full text-base"
        >
          <Untranslated>{ot('wallet.owed.paidIt')}</Untranslated>
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-ink-faint">
          <Untranslated>{ot('wallet.owed.markPaidHint')}</Untranslated>
        </p>

        {/* ── แนบสลิป (ไม่บังคับ) ──────────────────────────────── */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void uploadSlip(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mx-auto mt-3 block min-h-11 px-3 text-xs text-link hover:underline disabled:opacity-50"
        >
          {slipPath ? ot('wallet.pay.changeSlip') : ot('wallet.pay.attachSlip')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
