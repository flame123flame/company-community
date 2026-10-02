'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { renderSVG } from 'uqr'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { isValidPromptPayId, promptPayPayload } from '@/lib/office/promptpay'

/** หน้า QR รับเงินของฉัน (FR-B03 · หัวข้อ 8.1) */
export function WalletQr() {
  const ot = useOt()
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ppId, setPpId] = useState('')
  const [ppSaved, setPpSaved] = useState<string | null>(null)
  const [ppBusy, setPpBusy] = useState(false)
  const [ppError, setPpError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ url: string | null; promptPayId: string | null }>(
        '/api/office/wallet/qr',
      )
      setUrl(data.url)
      setPpId(data.promptPayId ?? '')
      setPpSaved(data.promptPayId ?? null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const data = await apiUpload<{ url: string }>('/api/office/wallet/qr', file)
      setUrl(data.url)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    if (!window.confirm(ot('confirm.deleteQr'))) return
    setBusy(true)
    try {
      await apiFetch('/api/office/wallet/qr', { method: 'DELETE' })
      setUrl(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  async function savePromptPay(value: string | null) {
    setPpBusy(true)
    setPpError(null)
    try {
      await apiFetch('/api/office/wallet/qr', {
        method: 'PATCH',
        body: { promptPayId: value },
      })
      setPpSaved(value)
      if (value === null) setPpId('')
    } catch (e) {
      setPpError(officeErrorText(e, ot))
    } finally {
      setPpBusy(false)
    }
  }

  /*
   * ★★ ตัวอย่าง QR ใช้ยอด 0 — ไม่ใช่ยอดสมมติ
   *    ★ QR ที่ไม่มียอดคือ "ใช้ซ้ำได้" ซึ่งเป็นสิ่งที่ถูกต้องสำหรับตัวอย่าง
   *      ★★ ใส่ยอดสมมติไว้แล้วมีคนแคปไปใช้จริง จะกลายเป็นการขอเงินผิดจำนวน
   */
  const preview = ppSaved && isValidPromptPayId(ppSaved) ? promptPayPayload(ppSaved) : null
  const previewSvg = preview
    ? renderSVG(preview, { ecc: 'M', border: 2, blackColor: '#0f0f0f', whiteColor: '#ffffff' })
    : null

  return (
    <div className="max-w-md py-2">
      <p className="mt-1 text-sm text-ink-soft">{ot('wallet.qr.hint')}</p>

      {/*
        * ── เบอร์พร้อมเพย์ (5.1) ────────────────────────────────
        * ★★★ วางไว้ "เหนือ" การอัปรูป เพราะเป็นทางที่ดีกว่า
        *
        *     ★ รูป QR ที่อัปเองไม่มียอดเงินอยู่ข้างใน คนจ่ายต้องพิมพ์ยอดเอง
        *       ★★ ซึ่งเป็นจุดที่โอนผิดจำนวนกันบ่อยที่สุด
        *     ★ ใส่เบอร์แล้วระบบสร้าง QR พร้อมยอดให้ทุกครั้งที่มีคนจะจ่าย
        */}
      <div className="mt-5 rounded-2xl border border-line bg-elevated/60 p-5 backdrop-blur-md">
        <label htmlFor="pp" className="block text-sm font-medium text-ink">
          <Untranslated>{ot('wallet.qr.promptpay')}</Untranslated>
        </label>
        <p className="mt-0.5 text-xs text-ink-faint">
          <Untranslated>{ot('wallet.qr.promptpayHint')}</Untranslated>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            id="pp"
            radius="round"
            value={ppId}
            onChange={(e) => {
              setPpId(e.target.value.replace(/\D/g, ''))
              setPpError(null)
            }}
            /* ★ numeric ไม่ใช่ decimal — เบอร์โทรไม่มีจุดทศนิยม */
            inputMode="numeric"
            maxLength={13}
            placeholder="0812345678"
            aria-label={ot('wallet.qr.promptpay')}
            className="max-w-44"
          />
          <Button
            variant="primary"
            className="min-h-11"
            loading={ppBusy}
            onClick={() => {
              if (!isValidPromptPayId(ppId)) {
                setPpError(ot('wallet.qr.promptpayBad'))
                return
              }
              void savePromptPay(ppId)
            }}
          >
            {ot('common.save')}
          </Button>
          {ppSaved ? (
            <button
              type="button"
              onClick={() => void savePromptPay(null)}
              className="min-h-11 px-2 text-xs text-link hover:underline"
            >
              <Untranslated>{ot('wallet.qr.promptpayClear')}</Untranslated>
            </button>
          ) : null}
        </div>

        {ppError ? <p className="mt-1.5 text-xs text-danger">{ppError}</p> : null}
        {!ppError && ppSaved && ppSaved === ppId ? (
          <p className="mt-1.5 text-xs text-link">
            <Untranslated>{ot('wallet.qr.promptpaySaved')}</Untranslated>
          </p>
        ) : null}

        {previewSvg ? (
          <div className="mt-4">
            <p className="text-xs text-ink-faint">
              <Untranslated>{ot('wallet.qr.preview')}</Untranslated>
            </p>
            {/* ★ ความกว้างคงที่ — uqr คืน SVG ที่ไม่มีขนาด (บทเรียนจาก PaySheet) */}
            <div
              className="mt-1.5 w-[160px] overflow-hidden rounded-xl bg-white p-2"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
        {!loaded ? (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={ot('wallet.qr.title')}
            className="mx-auto block w-full max-w-64 rounded-xl"
          />
        ) : (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('wallet.qr.none')}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
          }}
        />

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" loading={busy} onClick={() => fileRef.current?.click()}>
            {url ? ot('wallet.qr.replace') : ot('wallet.qr.upload')}
          </Button>
          {url ? (
            <Button variant="danger" loading={busy} onClick={remove}>
              {ot('wallet.qr.remove')}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ★ บอกขอบเขตการมองเห็นให้ชัด — เป็นข้อมูลที่ PDPA กำหนดให้แจ้ง
          และเป็นสิ่งที่คนลังเลจะอัปโหลดอยากรู้ก่อนกดปุ่ม */}
      <p className="mt-4 rounded-xl border border-line p-3 text-xs leading-relaxed text-ink-soft">
        {ot('wallet.qr.privacy')} {ot('wallet.qr.privacyMore')}
      </p>
    </div>
  )
}
