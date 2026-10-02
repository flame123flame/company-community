'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Toast, useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt, type Ot } from '@/lib/i18n/office'
import { formatBaht } from '@/lib/office/wallet'
import { toBaht, toSatang } from '@/lib/office/money'
import { ChatAvatar } from './ChatAvatar'
import { PaySheet, type PayTarget } from './PaySheet'

type Debt = {
  id: string
  amount: number
  description: string | null
  status: 'PENDING' | 'PAID_PENDING' | 'SETTLED' | 'CANCELLED'
  createdAt: string
  paidAt: string | null
  hasSlip: boolean
  lastRemindedAt: string | null
  otherId: string
  otherName: string
  otherAvatar: string | null
  otherHasQr: boolean
  otherPromptPayId: string | null
  isSettlement: boolean
  daysOwed: number
}

type Data = {
  summary: { iOwe: number; owedToMe: number; pendingConfirm: number }
  iOwe: Debt[]
  owedToMe: Debt[]
}

/** กี่ชั่วโมงที่ทวงซ้ำไม่ได้ — ข้อกำหนด 3.3 */
const REMIND_COOLDOWN_H = 24
/** เกินกี่วันถึงเปลี่ยนเป็นสีเตือน — ข้อกำหนด 3.4 */
const STALE_DAYS = 7

/**
 * หน้ายอดค้างของฉัน — ออกแบบใหม่ทั้งหน้า
 *
 * ★★★ รวมหนี้กับคนเดียวกันเป็นแถวเดียว ไม่ใช่เรียงทีละบิล
 *
 *     ★ เดิมเป็นรายการบิลเรียงกันลงมา ★★ คนที่กินข้าวกับทีมทุกวันจะมี
 *        หนี้กับคนเดิมสิบใบ แล้วหน้าจอกลายเป็นรายการยาวที่อ่านไม่ออกว่า
 *        "สรุปต้องจ่ายใครเท่าไหร่"
 *     ★ คำถามจริงคือ "ติดใครอยู่บ้าง คนละเท่าไหร่" ไม่ใช่ "มีบิลอะไรบ้าง"
 *       ★★ รายบิลยังดูได้ด้วยการแตะขยาย — ย้ายของที่ถามน้อยกว่าไปอีกชั้น
 *
 * ★★★ หักลบหนี้สองทางเป็นเรื่องของ "การแสดงผล" ไม่ใช่การเขียนข้อมูล
 *
 *     ★ ถ้าฉันค้าง A ฿50 และ A ค้างฉัน ฿30 หน้าจอแสดงยอดสุทธิ ฿20
 *       ★★ แต่ฐานข้อมูลยังเก็บหนี้สองก้อนไว้เหมือนเดิม จนกว่าจะมีคนกดจ่าย
 *          ★ การเขียนทันทีที่เปิดหน้าคือการแก้ข้อมูลของคนอื่นโดยที่เขาไม่ได้สั่ง
 *     ★ ตอนกด "จ่ายแล้ว" ค่อยเรียก net_debts_between ซึ่งปิดทั้งสองฝั่ง
 *       ในทรานแซกชันเดียว (ดู PaySheet)
 */
export function WalletOwed() {
  const ot = useOt()
  const locale = useLocale()
  const { toast, showToast } = useToast()

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [side, setSide] = useState<'iOwe' | 'owedToMe'>('iOwe')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pay, setPay] = useState<PayTarget | null>(null)
  const [showSettled, setShowSettled] = useState(false)
  const [settledQuery, setSettledQuery] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Data>('/api/office/wallet'))
      setError(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /*
   * ── จัดกลุ่มตามคน + หักลบสองทาง ────────────────────────────
   * ★ ทำฝั่ง client จากอาร์เรย์เดียวกับที่ API ส่งมา
   *   ★★ เหตุผลเดียวกับหน้าสรุปค่าข้าว: ยอดบนการ์ดกับยอดในลิสต์
   *      ต้องมาจากการรวมชุดเดียวกัน ไม่งั้นมันจะเพี้ยนจากกันวันหนึ่ง
   */
  const groups = useMemo(() => {
    if (!data) return []

    const mine = new Map<string, Debt[]>()
    const theirs = new Map<string, Debt[]>()
    for (const d of data.iOwe) {
      if (d.status === 'SETTLED' || d.status === 'CANCELLED') continue
      mine.set(d.otherId, [...(mine.get(d.otherId) ?? []), d])
    }
    for (const d of data.owedToMe) {
      if (d.status === 'SETTLED' || d.status === 'CANCELLED') continue
      theirs.set(d.otherId, [...(theirs.get(d.otherId) ?? []), d])
    }

    const ids = [...new Set([...mine.keys(), ...theirs.keys()])]

    return ids.map((id) => {
      const a = mine.get(id) ?? []
      const b = theirs.get(id) ?? []
      const first = a[0] ?? b[0]!

      /*
       * ★★★ ยอดสุทธินับเฉพาะใบที่ยัง PENDING
       *
       *     ★ ใบที่ "รอยืนยัน" คือใบที่โอนไปแล้ว รอเจ้าหนี้กดรับ ★★ มันไม่ใช่
       *       เงินที่ต้องจ่ายอีก — การรวมเข้ามาทำให้คนเห็นยอดที่ต้องจ่ายสูงเกินจริง
       *       แล้วอาจโอนซ้ำ
       *     ★ และ net_debts_between ก็นับเฉพาะ PENDING เหมือนกัน —
       *       ★★ ถ้าหน้าจอนับคนละชุดกับที่ฐานข้อมูลจะทำ ยอดบนแผ่นจ่ายเงิน
       *          จะไม่ตรงกับยอดที่ถูกปิดจริง
       */
      const pendingMine = a.filter((d) => d.status === 'PENDING')
      const pendingTheirs = b.filter((d) => d.status === 'PENDING')

      /*
       * ★★★ แยกสองยอด: "ยอดที่จ่ายได้" กับ "ยอดที่แสดง"
       *
       *     ★ ยอดที่จ่ายได้ นับเฉพาะ PENDING — ตรงกับที่ net_debts_between ทำ
       *     ★★ ยอดที่แสดง นับ PAID_PENDING ด้วย ★ ไม่งั้นแถวที่โอนไปแล้ว
       *        รอเจ้าหนี้ยืนยัน จะมียอดสุทธิเป็นศูนย์แล้วหายไปจากทั้งสองฝั่ง
       *        ★★ เจ้าหนี้จึงกดยืนยันรับเงินไม่ได้เลย — เจอตอนทดสอบสองบัญชี
       */
      const payableSat =
        pendingMine.reduce((s, d) => s + toSatang(d.amount), 0) -
        pendingTheirs.reduce((s, d) => s + toSatang(d.amount), 0)

      const displaySat =
        a.reduce((s, d) => s + toSatang(d.amount), 0) -
        b.reduce((s, d) => s + toSatang(d.amount), 0)

      /*
       * ★ ยอดเท่ากันพอดีแต่ยังมีใบค้างอยู่ — ต้องโผล่สักฝั่ง ไม่ใช่หายไป
       *   ★★ ให้ไปอยู่ฝั่งเจ้าหนี้ถ้ามีใบที่เขาค้างเรา เพราะเราคือคนที่ต้องกดยืนยัน
       */
      const sideOf: 'iOwe' | 'owedToMe' =
        displaySat > 0 ? 'iOwe' : displaySat < 0 ? 'owedToMe' : b.length > 0 ? 'owedToMe' : 'iOwe'

      return {
        otherId: id,
        otherName: first.otherName,
        otherAvatar: first.otherAvatar,
        otherHasQr: first.otherHasQr,
        otherPromptPayId: a[0]?.otherPromptPayId ?? null,
        mine: a,
        theirs: b,
        pendingMine,
        pendingTheirs,
        /** ยอดที่กดจ่ายได้จริง (เฉพาะ PENDING) */
        payableSat,
        /** ยอดที่แสดงบนแถวและใช้รวมเป็นยอดการ์ด */
        displaySat,
        sideOf,
        /** หักลบจริงเมื่อมีหนี้ "ที่ยังค้าง" ทั้งสองทาง */
        netted: pendingMine.length > 0 && pendingTheirs.length > 0,
        /** วันค้างนานสุดในกลุ่ม — ใช้ตัดสินสีเตือน */
        daysOwed: Math.max(0, ...[...a, ...b].map((d) => d.daysOwed)),
        waiting: [...a, ...b].filter((d) => d.status === 'PAID_PENDING'),
      }
    })
  }, [data])

  const iOweGroups = useMemo(
    () =>
      groups
        .filter((g) => g.sideOf === 'iOwe')
        .sort((a, b) => b.displaySat - a.displaySat),
    [groups],
  )
  const owedGroups = useMemo(
    () =>
      groups
        .filter((g) => g.sideOf === 'owedToMe')
        .sort((a, b) => a.displaySat - b.displaySat),
    [groups],
  )

  /*
   * ★★ ยอดบนการ์ดมาจากกลุ่มเดียวกับลิสต์ ไม่ได้ใช้ summary จาก API
   *    ★ summary ของ API ไม่รู้เรื่องการหักลบ — ถ้าเอามาแสดงคู่กัน
   *      การ์ดจะบอก ฿50 แต่ลิสต์รวมได้ ฿20 แล้วไม่มีใครรู้ว่าอันไหนถูก
   */
  const iOweSat = iOweGroups.reduce((s, g) => s + Math.max(0, g.displaySat), 0)
  const owedSat = owedGroups.reduce((s, g) => s + Math.max(0, -g.displaySat), 0)

  const settled = useMemo(() => {
    if (!data) return []
    const q = settledQuery.trim().toLowerCase()
    const all = [...data.iOwe, ...data.owedToMe].filter((d) => d.status === 'SETTLED')
    return q
      ? all.filter((d) => `${d.otherName} ${d.description ?? ''}`.toLowerCase().includes(q))
      : all
  }, [data, settledQuery])

  async function act(id: string, body: Record<string, unknown>, msg?: string) {
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/api/office/wallet/debts/${id}`, { method: 'POST', body })
      await load()
      if (msg) showToast(msg)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
      setMenuFor(null)
    }
  }

  /** ทวงทุกคนที่ยังค้างและพ้นคูลดาวน์แล้ว */
  async function remindAll() {
    const due = owedGroups.flatMap((g) =>
      g.theirs.filter((d) => d.status === 'PENDING' && canRemind(d)),
    )
    if (due.length === 0) return
    setBusy('all')
    try {
      /* ★ ทีละใบตามลำดับ — ถ้าใบหนึ่งชนด่านจำกัดอัตรา เราต้องรู้ว่าถึงใบไหนแล้ว */
      for (const d of due) {
        await apiFetch(`/api/office/wallet/debts/${d.id}`, {
          method: 'POST',
          body: { action: 'remind', tone: 'POLITE' },
        })
      }
      await load()
      showToast(ot('wallet.owed.toastRemindedN', { n: due.length }))
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  const shown = side === 'iOwe' ? iOweGroups : owedGroups

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
  }

  return (
    <div className="max-w-2xl pb-24">
      {/* ── การ์ดสรุป 2 ใบ ───────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SummaryCard
          label={ot('wallet.owed.iOwe')}
          amount={toBaht(iOweSat)}
          danger
          active={side === 'iOwe'}
          onClick={() => setSide('iOwe')}
        />
        <SummaryCard
          label={ot('wallet.owed.owedToMe')}
          amount={toBaht(owedSat)}
          active={side === 'owedToMe'}
          note={
            data && data.summary.pendingConfirm > 0
              ? ot('wallet.owed.pendingConfirm', { n: data.summary.pendingConfirm })
              : undefined
          }
          onClick={() => setSide('owedToMe')}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ★ ทวงทุกคน — อยู่เหนือลิสต์ตามข้อกำหนด 3.3 */}
      {side === 'owedToMe' &&
      owedGroups.flatMap((g) => g.theirs.filter((d) => d.status === 'PENDING' && canRemind(d)))
        .length > 1 ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-4 min-h-11"
          loading={busy === 'all'}
          onClick={remindAll}
        >
          <Untranslated>{ot('wallet.owed.remindAll')}</Untranslated>
        </Button>
      ) : null}

      {/* ── รายการ ───────────────────────────────────────────── */}
      <div className="mt-4 flex flex-col gap-2">
        {shown.length === 0 ? (
          <EmptyState
            icon={'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'}
            title={ot('wallet.owed.empty')}
            description={ot('wallet.owed.emptyHint')}
          />
        ) : (
          shown.map((g) => {
            const amount = toBaht(Math.abs(g.displaySat))
            const bills = [...g.mine, ...g.theirs]
            const isOpen = open === g.otherId
            const waiting = g.waiting.length > 0

            return (
              <div
                key={g.otherId}
                className="rounded-2xl border border-line bg-elevated/60 backdrop-blur-md"
              >
                <div className="flex items-center gap-3 p-3">
                  <ChatAvatar name={g.otherName} url={g.otherAvatar} size={44} />

                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : g.otherId)}
                    aria-expanded={isOpen}
                    className="min-h-11 min-w-0 flex-1 text-start"
                  >
                    <span dir="auto" className="block truncate text-[15px] font-semibold text-ink">
                      {g.otherName}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
                      <span className="text-ink-soft">
                        {ot('wallet.owed.bills', { n: bills.length })}
                      </span>
                      {/*
                        * ★★ "ค้างมา N วัน" ใช้สีปกติถ้าไม่เกิน 7 วัน
                        *    ★ หนี้ค่าข้าวเมื่อวานไม่ใช่เรื่องต้องเตือน ★★ สีเตือน
                        *      ที่ขึ้นตั้งแต่วันแรก ทำให้สีเตือนไม่มีความหมาย
                        */}
                      {g.daysOwed > 0 ? (
                        <span className={cn(g.daysOwed > STALE_DAYS ? 'text-warn' : 'text-ink-faint')}>
                          {ot('wallet.owed.days', { n: g.daysOwed })}
                        </span>
                      ) : null}
                      {g.netted ? (
                        <span
                          className="rounded-full bg-link/15 px-1.5 py-0.5 text-link"
                          title={ot('wallet.owed.netHint')}
                        >
                          <Untranslated>{ot('wallet.owed.netted')}</Untranslated>
                        </span>
                      ) : null}
                      {waiting ? (
                        <span className="rounded-full bg-warn/20 px-1.5 py-0.5 text-warn">
                          <Untranslated>{ot('wallet.owed.waiting')}</Untranslated>
                        </span>
                      ) : null}
                    </span>
                  </button>

                  <span className="shrink-0 text-end">
                    <span
                      className={cn(
                        'block text-[17px] font-bold tabular-nums',
                        /* ★ สีแดงเฉพาะยอดที่ฉันต้องจ่ายจริง ไม่ใช่ทุกตัวเลข */
                        side === 'iOwe' && amount > 0 ? 'text-danger' : 'text-ink',
                      )}
                    >
                      ฿{formatBaht(locale, amount)}
                    </span>
                  </span>
                </div>

                {/* ── ปุ่มหลักของแถว ───────────────────────────── */}
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
                  {side === 'iOwe' ? (
                    /*
                     * ★★★ มีใบที่ยังค้างอยู่ → ต้องมีปุ่มจ่ายเสมอ
                     *
                     *     ★ เดิมเช็กแค่ "มีใบรอยืนยันไหม" ★★ ผลคือพอจ่ายบิลหนึ่ง
                     *       ไปแล้ว ปุ่มจ่ายของบิลที่เหลือกับคนเดียวกันหายหมด
                     *       ★ เจอตอนทดสอบซ้ำรอบที่สอง — จ่ายบิลที่สองไม่ได้เลย
                     *         จนกว่าเจ้าหนี้จะกดยืนยันบิลแรก
                     */
                    g.pendingMine.length === 0 ? (
                      <span className="text-xs text-warn">
                        <Untranslated>{ot('wallet.owed.waiting')}</Untranslated>
                      </span>
                    ) : (
                      /* ★★ ปุ่มเดียว เปิดแผ่นจ่ายเงิน — แตะที่ 1 จาก 2 */
                      <Button
                        size="sm"
                        variant="primary"
                        className="min-h-11 min-w-20"
                        onClick={() =>
                          setPay({
                            debtIds: g.pendingMine.map((d) => d.id),
                            otherId: g.otherId,
                            otherName: g.otherName,
                            otherAvatar: g.otherAvatar,
                            otherPromptPayId: g.otherPromptPayId,
                            otherHasQr: g.otherHasQr,
                            /* ★ ยอดบนแผ่นจ่ายเงินคือยอดที่จ่ายได้จริง
                                 ★★ ไม่ใช่ยอดที่แสดงบนแถว ซึ่งรวมใบที่รอยืนยันอยู่ */
                            amount: toBaht(Math.abs(g.payableSat)),
                            needsNetting: g.netted,
                          })
                        }
                      >
                        <Untranslated>{ot('wallet.owed.pay')}</Untranslated>
                      </Button>
                    )
                  ) : (
                    <OwedActions
                      group={g}
                      ot={ot}
                      busy={busy}
                      onAct={act}
                      locale={locale}
                    />
                  )}

                  {/* ── เมนู ⋯ : ของที่ใช้ไม่บ่อย ─────────────── */}
                  <span className="relative ms-auto">
                    <button
                      type="button"
                      onClick={() => setMenuFor(menuFor === g.otherId ? null : g.otherId)}
                      aria-label={ot('wallet.owed.more')}
                      aria-expanded={menuFor === g.otherId}
                      /*
                       * ★★ ไม่ใช้ .msg-act เฉย ๆ — คลาสนั้นสูง 28px ซึ่งพอดีกับ
                       *    ปุ่มที่ลอยข้างฟองแชท แต่เล็กเกินไปสำหรับเมนูในแถวรายการ
                       *    ★ ข้อกำหนดบอกว่าจุดแตะทุกจุดต้อง ≥44px
                       */
                      className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                    >
                      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="19" cy="12" r="1.8" />
                      </svg>
                    </button>

                    {menuFor === g.otherId ? (
                      <span className="absolute end-0 top-10 z-40 w-48 overflow-hidden rounded-xl border border-line bg-elevated shadow-xl">
                        {/*
                          * ★★ "ยกเลิกหนี้" ทำได้เฉพาะเจ้าหนี้ และอยู่ในเมนู
                          *    ★ มันคือการลบเงินของตัวเองทิ้ง ซึ่งทำน้อยมาก
                          *      ★★ วางไว้ข้างปุ่ม "จ่าย" คือเชิญให้กดพลาด
                          */}
                        {g.theirs.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(ot('wallet.owed.cancelAsk'))) return
                              for (const d of g.theirs) {
                                void act(d.id, { action: 'cancel' })
                              }
                            }}
                            className="flex min-h-11 w-full items-center px-3 text-start text-[13px] text-danger hover:bg-surface"
                          >
                            <Untranslated>{ot('wallet.owed.cancelDebt')}</Untranslated>
                          </button>
                        ) : (
                          <p className="px-3 py-3 text-[12px] text-ink-faint">
                            <Untranslated>{ot('wallet.owed.nothingHere')}</Untranslated>
                          </p>
                        )}
                      </span>
                    ) : null}
                  </span>
                </div>

                {/* ── รายบิล (แตะขยาย) ──────────────────────────── */}
                {isOpen ? (
                  <ul className="divide-y divide-line border-t border-line">
                    {bills.map((d) => (
                      <li key={d.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                        <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                          {d.description || ot('wallet.owed.bills', { n: 1 })}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[13px] tabular-nums',
                            g.mine.includes(d) ? 'text-danger' : 'text-link',
                          )}
                        >
                          {g.mine.includes(d) ? '−' : '+'}฿{formatBaht(locale, d.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      {/* ── จ่ายครบแล้ว (ยุบไว้) ─────────────────────────────── */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowSettled((v) => !v)}
          aria-expanded={showSettled}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-start"
        >
          <span className="text-sm font-medium text-ink-soft">
            <Untranslated>{ot('wallet.owed.settled')}</Untranslated>
            {settled.length > 0 ? ` (${settled.length})` : ''}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={cn('size-4 text-ink-faint transition-transform', showSettled && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {showSettled ? (
          <div className="mt-2">
            <Input
              radius="round"
              value={settledQuery}
              onChange={(e) => setSettledQuery(e.target.value)}
              placeholder={ot('wallet.owed.settledSearch')}
              aria-label={ot('wallet.owed.settledSearch')}
            />
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-elevated/40">
              {settled.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-ink-faint">
                  <Untranslated>{ot('wallet.owed.nothingHere')}</Untranslated>
                </li>
              ) : (
                settled.slice(0, 50).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                    <ChatAvatar name={d.otherName} url={d.otherAvatar} size={28} />
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-[13px] text-ink">
                        {d.otherName}
                      </span>
                      <span dir="auto" className="block truncate text-[11px] text-ink-faint">
                        {d.description ?? ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-ink-faint">
                      ฿{formatBaht(locale, d.amount)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {/*
        * ── ปุ่มลอยสร้างรายการเงิน ─────────────────────────────
        * ★★ ลอยมุมขวาล่างบนมือถือ เป็นปุ่มปกติบนจอกว้าง
        *    ★ มือถือถือด้วยมือขวาเป็นส่วนใหญ่ มุมขวาล่างคือที่ที่นิ้วโป้งถึง
        *      โดยไม่ต้องขยับมือ
        */}
      {/*
        * ★★ บนมือถือเป็นวงกลมไอคอนอย่างเดียว บนจอกว้างเป็นปุ่มมีข้อความ
        *    ★ ปุ่มลอยที่มีข้อความยาวกินพื้นที่มุมขวาล่างไปกว่าครึ่งความกว้างจอ
        *      ★★ ซึ่งทับรายการที่คนกำลังอ่านอยู่พอดี
        *    ★ ความหมายยังครบเพราะมี aria-label — เครื่องหมายบวกในแอปการเงิน
        *      อ่านเป็น "เพิ่มรายการ" ได้ทันทีอยู่แล้ว
        */}
      <Link
        href="/office/wallet/create"
        aria-label={ot('wallet.owed.create')}
        className={cn(
          'fixed bottom-5 end-5 z-40 grid size-14 place-items-center rounded-full bg-accent',
          'text-accent-ink shadow-xl transition-colors hover:bg-accent-hover',
          'sm:static sm:mt-6 sm:inline-flex sm:size-auto sm:h-11 sm:gap-2 sm:px-5 sm:text-sm sm:font-medium sm:shadow-none',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-6 sm:size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden sm:inline">
          <Untranslated>{ot('wallet.owed.create')}</Untranslated>
        </span>
      </Link>

      {pay ? (
        <PaySheet
          target={pay}
          onClose={() => setPay(null)}
          onDone={(msg) => {
            setPay(null)
            showToast(msg)
            void load()
          }}
        />
      ) : null}

      <Toast toast={toast} />
    </div>
  )
}

/** ทวงได้หรือยัง — คูลดาวน์ 24 ชม. ต่อคน */
function canRemind(d: Debt): boolean {
  if (!d.lastRemindedAt) return true
  return Date.now() - Date.parse(d.lastRemindedAt) >= REMIND_COOLDOWN_H * 3_600_000
}

function hoursLeft(d: Debt): number {
  if (!d.lastRemindedAt) return 0
  const left = REMIND_COOLDOWN_H * 3_600_000 - (Date.now() - Date.parse(d.lastRemindedAt))
  return Math.max(1, Math.ceil(left / 3_600_000))
}

/**
 * ปุ่มฝั่ง "คนอื่นต้องจ่ายฉัน"
 *
 * ★★ "ยืนยันรับเงิน" ต้องเด่นที่สุดในแถวเมื่อมีคนแจ้งโอนแล้ว
 *    ★ มันคือสิ่งเดียวที่เจ้าหนี้ต้องทำ และทำไม่ได้ถ้าหาปุ่มไม่เจอ
 *      ★★ ส่วน "ยังไม่ได้รับ" เป็นลิงก์เล็ก เพราะเป็นทางออกของกรณีที่ผิดพลาด
 */
function OwedActions({
  group,
  ot,
  busy,
  onAct,
  locale,
}: {
  group: {
    otherId: string
    theirs: Debt[]
    waiting: Debt[]
  }
  ot: Ot
  busy: string | null
  onAct: (id: string, body: Record<string, unknown>, msg?: string) => void
  locale: string
}) {
  const waiting = group.waiting.filter((d) => group.theirs.includes(d))

  if (waiting.length > 0) {
    return (
      <>
        <Button
          size="sm"
          variant="primary"
          className="min-h-11 min-w-28"
          loading={busy === waiting[0]!.id}
          onClick={() => {
            for (const d of waiting) onAct(d.id, { action: 'confirm' }, ot('wallet.owed.toastConfirmed'))
          }}
        >
          <Untranslated>{ot('wallet.owed.confirmGot')}</Untranslated>
        </Button>
        <button
          type="button"
          onClick={() => {
            for (const d of waiting) onAct(d.id, { action: 'reject' }, ot('wallet.owed.toastRejected'))
          }}
          className="min-h-11 px-2 text-xs text-link hover:underline"
        >
          <Untranslated>{ot('wallet.owed.notGot')}</Untranslated>
        </button>
      </>
    )
  }

  const pending = group.theirs.filter((d) => d.status === 'PENDING')
  if (pending.length === 0) return null

  const due = pending.filter(canRemind)
  const blocked = due.length === 0

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="min-h-11 min-w-20"
        disabled={blocked}
        loading={busy === pending[0]!.id}
        onClick={() => {
          for (const d of due) onAct(d.id, { action: 'remind', tone: 'POLITE' }, ot('wallet.owed.toastReminded'))
        }}
      >
        <Untranslated>{ot('wallet.owed.remind')}</Untranslated>
      </Button>
      {/*
        * ★ บอกเวลาที่ทวงล่าสุด และเวลาที่ทวงได้อีกครั้ง
        *   ★★ ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผล ทำให้คนกดซ้ำแล้วคิดว่าเว็บค้าง
        */}
      {blocked ? (
        <span className="text-[11px] text-ink-faint">
          <Untranslated>{ot('wallet.owed.remindWait', { n: hoursLeft(pending[0]!) })}</Untranslated>
        </span>
      ) : pending[0]!.lastRemindedAt ? (
        <span className="text-[11px] text-ink-faint">
          <Untranslated>
            {ot('wallet.owed.remindedAgo', { when: agoLabel(ot, locale, pending[0]!.lastRemindedAt) })}
          </Untranslated>
        </span>
      ) : null}
    </>
  )
}

function agoLabel(ot: Ot, _locale: string, iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 60) return ot('time.minutesAgo', { n: Math.max(1, min) })
  const hr = Math.floor(min / 60)
  if (hr < 24) return ot('time.hoursAgo', { n: hr })
  return ot('time.daysAgo', { n: Math.floor(hr / 24) })
}

function SummaryCard({
  label,
  amount,
  danger,
  active,
  note,
  onClick,
}: {
  label: string
  amount: number
  danger?: boolean
  active: boolean
  note?: string
  onClick: () => void
}) {
  const locale = useLocale()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-2xl border p-4 text-start transition-colors',
        active ? 'border-accent/45 bg-surface' : 'border-line bg-elevated hover:bg-surface',
      )}
    >
      <p className="text-sm text-ink-soft">{label}</p>
      {/* ★ สีแดงเฉพาะเมื่อมียอดค้างจริง — ฿0.00 สีแดงคือการเตือนเรื่องที่ไม่มีอยู่ */}
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          danger && amount > 0 ? 'text-danger' : 'text-ink',
        )}
      >
        ฿{formatBaht(locale, amount)}
      </p>
      {note ? <p className="mt-1 text-xs text-warn">{note}</p> : null}
    </button>
  )
}
