'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderSVG } from 'uqr'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { isValidPromptPayId, promptPayPayload } from '@/lib/office/promptpay'
import { ChatAvatar } from './ChatAvatar'

/*
 * ═══════════════════════════════════════════════════════════════════════
 * QR รับเงินของฉัน — "บัตรรับเงิน" ที่ยื่นให้เพื่อนสแกนได้ทันที
 *
 * ★★★ ของสำคัญที่สุดบนหน้าคือ QR ตัวใหญ่ที่สแกนได้จริง
 *     ทุกอย่างอื่น (ใส่ยอด · ดาวน์โหลด · แชร์ · คัดลอกเบอร์) อยู่รอบ ๆ มัน
 *
 * ★★ สองแหล่ง เลือกได้ทั้งคู่
 *    • เบอร์พร้อมเพย์ → ระบบสร้าง QR เอง ใส่ยอดให้ได้ด้วย (หลักที่แนะนำ)
 *    • รูป QR จากแอปธนาคาร → สำรอง สำหรับคนที่ไม่อยากใส่เบอร์
 *
 * ★★ สีของตัว QR เป็นดำบนขาวเสมอ ไม่ตามธีม — ข้อยกเว้นเดียวของหน้า
 *    ★ แอปธนาคารหลายแอปสแกน QR กลับสี (ขาวบนดำ) ไม่ได้ ★ ส่วนอื่นใช้ token ทั้งหมด
 * ═══════════════════════════════════════════════════════════════════════
 */

const QR_DARK = '#0f0f0f'
const QR_LIGHT = '#ffffff'

/** 0812345678 → 081-234-5678 · เลขบัตร 13 หลัก → x-xxxx-xxxxx-xx-x */
function formatId(id: string): string {
  if (id.length === 10) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`
  if (id.length === 13) return `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`
  return id
}

/** ★ ปิดเลขกลาง — บัตรนี้ถูกแชร์/ถ่ายหน้าจอได้ */
function maskId(id: string): string {
  /* เห็น 3 ตัวแรกกับ 4 ตัวท้าย — ตัวกลางเป็นจุด (ปุ่มคัดลอกยังได้เลขเต็ม) */
  let k = 0
  return formatId(id).replace(/\d/g, (d) => {
    const i = k++
    return i < 3 || i >= id.length - 4 ? d : '•'
  })
}

export function WalletQr({ me }: { me: { name: string; avatarUrl: string | null } }) {
  const ot = useOt()
  const confirm = useConfirm()
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ppId, setPpId] = useState('')
  const [ppSaved, setPpSaved] = useState<string | null>(null)
  const [ppBusy, setPpBusy] = useState(false)
  const [ppError, setPpError] = useState<string | null>(null)
  const [editingPp, setEditingPp] = useState(false)
  const [amount, setAmount] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ url: string | null; promptPayId: string | null }>('/api/office/wallet/qr')
      setUrl(data.url)
      setPpId(data.promptPayId ?? '')
      setPpSaved(data.promptPayId ?? null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setLoaded(true)
    }
  }, [ot])

  useEffect(() => {
    void load()
  }, [load])

  /* ★ ข้อความแจ้งสั้น ๆ หายเองใน 2 วินาที */
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  async function upload(file: File) {
    /* ★ ถามก่อนเพิ่ม/เปลี่ยนรูป QR — ยกเลิกแล้วล้างช่องไฟล์ ให้เลือกไฟล์เดิมซ้ำได้ */
    if (!(await confirm({ kind: url ? 'edit' : 'create', subject: ot('qr.bankImage') }))) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
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
    if (!(await confirm({ kind: 'delete', subject: ot('qr.bankImage'), message: ot('confirm.deleteQr') }))) return
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
    /* ★ null = ล้างเบอร์ (ลบ) · มีค่า = ตั้งครั้งแรก (เพิ่ม) หรือเปลี่ยน (แก้ไข) */
    const kind = value === null ? 'delete' : ppSaved ? 'edit' : 'create'
    if (!(await confirm({ kind, subject: `${ot('wallet.qr.promptpay')} ${value ?? ppSaved ?? ''}`.trim() }))) return
    setPpBusy(true)
    setPpError(null)
    try {
      await apiFetch('/api/office/wallet/qr', { method: 'PATCH', body: { promptPayId: value } })
      setPpSaved(value)
      setEditingPp(false)
      if (value === null) setPpId('')
      setToast(ot(value ? 'wallet.qr.promptpaySaved' : 'qr.cleared'))
    } catch (e) {
      setPpError(officeErrorText(e, ot))
    } finally {
      setPpBusy(false)
    }
  }

  const amountNum = Number(amount)
  const validAmount = amount !== '' && Number.isFinite(amountNum) && amountNum > 0 ? amountNum : undefined
  const ready = !!ppSaved && isValidPromptPayId(ppSaved)

  /* ★ QR สร้างใหม่ทุกครั้งที่ยอดเปลี่ยน — ใส่ยอดแล้วคนสแกนไม่ต้องพิมพ์เอง */
  const qrSvg = useMemo(() => {
    if (!ready) return null
    const payload = promptPayPayload(ppSaved!, validAmount)
    return payload ? renderSVG(payload, { ecc: 'M', border: 1, blackColor: QR_DARK, whiteColor: QR_LIGHT }) : null
  }, [ready, ppSaved, validAmount])

  async function qrPng(): Promise<Blob | null> {
    if (!qrSvg) return null
    /* ★ วาด SVG ลง canvas เป็น PNG 1024px — ส่งต่อในแชท/บันทึกลงอัลบั้มได้ */
    const img = new Image()
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('qr'))
      img.src = src
    })
    const size = 1024
    const pad = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = QR_LIGHT
    ctx.fillRect(0, 0, size, size)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2)
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'))
  }

  async function download() {
    const blob = await qrPng()
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `promptpay-${ppSaved}${validAmount ? `-${validAmount}` : ''}.png`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function share() {
    const blob = await qrPng()
    if (!blob) return
    const file = new File([blob], 'promptpay.png', { type: 'image/png' })
    const text = validAmount ? ot('qr.shareTextAmount', { amount: validAmount.toFixed(2) }) : ot('qr.shareText')
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
        return
      }
    } catch {
      return /* ผู้ใช้กดยกเลิกการแชร์ */
    }
    /* ★ เบราว์เซอร์ที่แชร์ไฟล์ไม่ได้ (คอมส่วนใหญ่) → ดาวน์โหลดแทน */
    await download()
  }

  async function copyId() {
    if (!ppSaved) return
    try {
      await navigator.clipboard.writeText(ppSaved)
      setToast(ot('qr.copied'))
    } catch {
      /* clipboard ถูกปิด */
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-8">
      {/* ── สถานะพร้อมรับเงิน ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill ok={ready} label={ot('wallet.qr.promptpay')} />
        <StatusPill ok={!!url} label={ot('qr.bankImage')} />
        <span
          className={cn(
            'ms-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold',
            ready || url ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent' : 'bg-surface text-ink-soft',
          )}
        >
          <span className={cn('size-2 rounded-full', ready || url ? 'qr-pulse bg-accent' : 'bg-ink-soft')} aria-hidden="true" />
          <Untranslated>{ot(ready || url ? 'qr.ready' : 'qr.notReady')}</Untranslated>
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ═══ บัตรรับเงิน ═══════════════════════════════════════════ */}
        <section className="qr-card relative isolate min-w-0 overflow-hidden rounded-[28px] border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-line))] p-5 sm:p-7">
          <span aria-hidden="true" className="qr-card-glow pointer-events-none absolute inset-0 -z-10" />
          <span aria-hidden="true" className="qr-card-shine pointer-events-none absolute inset-0 -z-10" />

          <div className="flex items-center gap-3">
            <ChatAvatar name={me.name || '?'} url={me.avatarUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                <Untranslated>{ot('qr.cardLabel')}</Untranslated>
              </p>
              <p dir="auto" className="truncate text-lg font-bold text-ink">
                {me.name}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-2xl bg-accent text-accent-ink shadow-[0_10px_24px_-10px] shadow-accent/70" aria-hidden="true">
              <Icon d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" className="size-5" />
            </span>
          </div>

          {!loaded ? (
            <div className="mx-auto mt-6 aspect-square w-full max-w-[280px] animate-pulse rounded-3xl bg-surface" />
          ) : ready && !editingPp ? (
            <>
              {/* ★ กรอบ QR: พื้นขาวเสมอ + มุมสี accent ให้ตาเล็งถูก */}
              <div className="relative mx-auto mt-6 w-full max-w-[280px]">
                <span aria-hidden="true" className="qr-corners pointer-events-none absolute -inset-3" />
                <div
                  className="qr-pop aspect-square w-full overflow-hidden rounded-3xl p-3 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--color-ink)_60%,transparent)] [&>svg]:size-full"
                  style={{ background: QR_LIGHT }}
                  role="img"
                  aria-label={ot('wallet.qr.preview')}
                  dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }}
                />
              </div>

              <div className="mt-5 text-center">
                <p className="text-xs text-ink-soft">
                  <Untranslated>{ot('wallet.qr.promptpay')}</Untranslated>
                </p>
                <button
                  type="button"
                  onClick={() => void copyId()}
                  className="group mt-0.5 inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-mono text-xl font-bold tracking-wider text-ink transition-colors hover:bg-surface"
                  aria-label={ot('qr.copy')}
                >
                  {maskId(ppSaved!)}
                  <Icon d="M9 9h10v10H9zM5 15V5h10" className="size-4 text-ink-soft group-hover:text-ink" />
                </button>
              </div>

              {/* ── ใส่ยอดลงใน QR ── */}
              <div className="mx-auto mt-4 w-full max-w-[320px]">
                <label htmlFor="qr-amount" className="mb-1.5 block text-center text-xs text-ink-soft">
                  <Untranslated>{ot('qr.amountLabel')}</Untranslated>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-4 grid place-items-center text-lg font-bold text-accent">฿</span>
                  <input
                    id="qr-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-14 w-full rounded-2xl border border-line bg-page/70 ps-10 pe-12 text-center text-2xl font-bold tabular-nums text-ink backdrop-blur-md placeholder:text-ink-soft/50 focus:border-accent focus:outline-none"
                  />
                  {amount ? (
                    <button
                      type="button"
                      onClick={() => setAmount('')}
                      aria-label={ot('qr.clearAmount')}
                      className="absolute inset-y-0 end-1 grid w-11 place-items-center text-ink-soft hover:text-ink"
                    >
                      <Icon d="M6 6l12 12M18 6 6 18" className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex justify-center gap-1.5">
                  {[50, 100, 200, 500].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className={cn(
                        'h-10 rounded-full px-3.5 text-[13px] font-medium tabular-nums transition-colors sm:h-8',
                        validAmount === v ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                      )}
                    >
                      ฿{v}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── ทำอะไรกับ QR ── */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <Action icon="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" label={ot('qr.share')} onClick={() => void share()} primary />
                <Action icon="M12 4v11M7 10l5 5 5-5M5 20h14" label={ot('qr.download')} onClick={() => void download()} />
                <Action icon="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" label={ot('qr.editNumber')} onClick={() => setEditingPp(true)} />
              </div>
            </>
          ) : (
            /* ── ยังไม่มีเบอร์ / กำลังแก้ ── */
            <div className="mt-6">
              {!ready ? (
                <div className="mx-auto mb-5 grid size-20 place-items-center rounded-3xl bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent">
                  <Icon d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" className="size-9" />
                </div>
              ) : null}
              <p className="text-center text-lg font-bold text-ink">
                <Untranslated>{ot(ready ? 'qr.editTitle' : 'qr.setupTitle')}</Untranslated>
              </p>
              <p className="mx-auto mt-1 max-w-sm text-center text-sm text-ink-soft">
                <Untranslated>{ot('wallet.qr.promptpayHint')}</Untranslated>
              </p>
              <div className="mx-auto mt-4 flex w-full max-w-sm items-center gap-2">
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
                  className="min-w-0 flex-1 text-center font-mono text-lg tracking-wider"
                />
                <Button
                  variant="primary"
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
              </div>
              {ppError ? <p className="mt-2 text-center text-xs text-danger">{ppError}</p> : null}
              <div className="mt-2 flex justify-center gap-3">
                {ready ? (
                  <button type="button" onClick={() => { setEditingPp(false); setPpId(ppSaved ?? '') }} className="min-h-11 text-xs text-ink-soft hover:text-ink">
                    {ot('common.cancel')}
                  </button>
                ) : null}
                {ppSaved ? (
                  <button type="button" onClick={() => void savePromptPay(null)} className="min-h-11 text-xs text-danger hover:underline">
                    <Untranslated>{ot('wallet.qr.promptpayClear')}</Untranslated>
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {/* ═══ ด้านขวา: รูป QR สำรอง · วิธีใช้ · ความเป็นส่วนตัว ════════ */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-3xl border border-line bg-elevated/60 p-5 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface text-ink">
                <Icon d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 16l4-4 3 3 4-5 5 6" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">
                  <Untranslated>{ot('qr.bankImage')}</Untranslated>
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{ot('wallet.qr.hint')}</p>
              </div>
            </div>

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

            {!loaded ? (
              <div className="mt-4 h-40 animate-pulse rounded-2xl bg-surface" />
            ) : url ? (
              <div className="mt-4 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก signed URL ของ Storage */}
                <img src={url} alt={ot('wallet.qr.title')} className="size-32 shrink-0 rounded-2xl bg-surface object-contain ring-1 ring-line" />
                <div className="flex flex-col gap-2">
                  <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
                    {ot('wallet.qr.replace')}
                  </Button>
                  <Button variant="danger" loading={busy} onClick={remove}>
                    {ot('wallet.qr.remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-4 py-7 text-center transition-colors hover:border-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] disabled:opacity-50"
              >
                <span className="grid size-11 place-items-center rounded-full bg-surface text-ink">
                  <Icon d="M12 16V4M7 9l5-5 5 5M4 20h16" className="size-5" />
                </span>
                <span className="text-sm font-semibold text-ink">{ot('wallet.qr.upload')}</span>
                <span className="text-xs text-ink-soft">JPG · PNG</span>
              </button>
            )}
            {error ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </section>

          {/* ── เพื่อนจ่ายคุณยังไง ── */}
          <section className="rounded-3xl border border-line bg-elevated/60 p-5 backdrop-blur-md">
            <h2 className="text-sm font-semibold text-ink">
              <Untranslated>{ot('qr.howTitle')}</Untranslated>
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {(['qr.how1', 'qr.how2', 'qr.how3'] as const).map((k, i) => (
                <li key={k} className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{i + 1}</span>
                  <p className="pt-1 text-sm leading-relaxed text-ink">
                    <Untranslated>{ot(k)}</Untranslated>
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* ★ บอกขอบเขตการมองเห็นให้ชัด — ข้อมูลที่ PDPA กำหนดให้แจ้ง */}
          <section className="flex items-start gap-3 rounded-3xl border border-line bg-surface/60 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-page text-ink">
              <Icon d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9.5 12l2 2 3.5-3.5" className="size-4" />
            </span>
            <p className="text-xs leading-relaxed text-ink-soft">
              {ot('wallet.qr.privacy')} {ot('wallet.qr.privacyMore')}
            </p>
          </section>
        </div>
      </div>

      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto w-fit rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-page shadow-xl">
          <Untranslated>{toast}</Untranslated>
        </div>
      ) : null}
    </div>
  )
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs', ok ? 'border-line bg-elevated/70 text-ink' : 'border-dashed border-line-strong text-ink-soft')}>
      <span className={cn('grid size-4 place-items-center rounded-full', ok ? 'bg-accent text-accent-ink' : 'bg-surface')} aria-hidden="true">
        {ok ? <Icon d="m5 12 4 4L19 7" className="size-2.5" /> : null}
      </span>
      <Untranslated>{label}</Untranslated>
    </span>
  )
}

function Action({ icon, label, onClick, primary = false }: { icon: string; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium transition-transform active:scale-95',
        primary ? 'bg-accent text-accent-ink shadow-[0_12px_28px_-14px] shadow-accent/70 hover:bg-accent-hover' : 'bg-page/70 text-ink ring-1 ring-line backdrop-blur-md hover:bg-surface',
      )}
    >
      <Icon d={icon} className="size-5" />
      <Untranslated>{label}</Untranslated>
    </button>
  )
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
