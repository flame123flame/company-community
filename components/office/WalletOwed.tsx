'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
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
import { DebtDetailSheet } from './DebtDetailSheet'

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
/** ประวัติแสดงกี่รายการต่อหน้า */
const HISTORY_PAGE = 10

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
  const confirm = useConfirm()
  const locale = useLocale()
  const { toast, showToast } = useToast()

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [side, setSide] = useState<'iOwe' | 'owedToMe'>('iOwe')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [pay, setPay] = useState<PayTarget | null>(null)
  const [showSettled, setShowSettled] = useState(false)
  const [settledQuery, setSettledQuery] = useState('')
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<Debt | null>(null)

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

  /*
   * ★ ตัวเลขประกอบของแถบยอดสุทธิ — คิดจาก groups ชุดเดียวกับลิสต์
   *   ★★ เหตุผลเดียวกับยอดรวมข้างบน: ถ้าดึงมาจาก summary ของ API
   *      แถบจะบอกคนละเรื่องกับรายการที่อยู่ใต้มันเองสองนิ้ว
   */
  const oldestDays = groups.reduce((m, g) => Math.max(m, g.daysOwed), 0)
  const staleCount = iOweGroups.filter((g) => g.daysOwed > STALE_DAYS).length

  const settled = useMemo(() => {
    if (!data) return []
    const q = settledQuery.trim().toLowerCase()
    const all = [...data.iOwe, ...data.owedToMe].filter((d) => d.status === 'SETTLED')
    return q
      ? all.filter((d) => `${d.otherName} ${d.description ?? ''}`.toLowerCase().includes(q))
      : all
  }, [data, settledQuery])

  /* ★ รวมเป็นสตางค์ก่อนแล้วค่อยแปลง — บวกทศนิยมลอยตัวทีละใบแล้วเพี้ยน */
  const settledTotal = useMemo(
    () => toBaht(settled.reduce((s, d) => s + toSatang(d.amount), 0)),
    [settled],
  )

  /*
   * ── การแบ่งหน้าของประวัติ ──────────────────────────────────
   *
   * ★★★ ของเดิมตัดที่ 50 ใบแล้วเงียบ — ใบที่ 51 หายไปโดยไม่มีอะไรบอก
   *
   *     ★ คนที่ใช้มาหนึ่งปีจะมีหลายร้อยใบ แล้วเขาจะคิดว่าระบบลืมของเก่าไป
   *       ★★ การแบ่งหน้าบอกทั้ง "มีทั้งหมดเท่าไหร่" และ "ตอนนี้อยู่หน้าไหน"
   *          ซึ่งเป็นสองอย่างที่การตัดเงียบ ๆ ไม่ได้บอกเลย
   *
   * ★ แบ่งฝั่ง client เพราะ API ส่งมาทั้งก้อนอยู่แล้ว
   *   ★★ วันที่ข้อมูลโตจนต้องแบ่งฝั่ง server ค่อยย้าย — แต่วันนั้น
   *      หน้าจอไม่ต้องเปลี่ยนอะไรเลย เพราะรูปแบบปุ่มเหมือนกัน
   */
  const pageCount = Math.max(1, Math.ceil(settled.length / HISTORY_PAGE))
  /* ★ พิมพ์ค้นหาแล้วจำนวนหน้าหด — หน้าปัจจุบันต้องไม่ค้างอยู่นอกช่วง */
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = settled.slice(safePage * HISTORY_PAGE, safePage * HISTORY_PAGE + HISTORY_PAGE)

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
    /*
     * ★★ กว้างเต็มคอลัมน์ของหน้า ไม่ใช่ max-w-2xl (672px) ลอยอยู่ซ้าย
     *    ★ คอลัมน์ของหมวดนี้กว้าง 1000px และการ์ดเมนูข้างบนก็กว้างเท่านั้น
     *      ★★ เนื้อหาที่แคบกว่าหัวหน้าทำให้ทั้งหน้าดูเหมือนวางเยื้อง
     *         และเหลือที่ว่างข้างขวาครึ่งจอโดยไม่ได้อะไรแลกมา
     */
    <div className="w-full pb-16">
      {error ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/*
        * ══ เซกชัน 1 · ยอดสุทธิของคุณ ════════════════════════
        *
        * ★★ ปุ่มสร้างรายการอยู่ที่หัวเซกชันแรก ไม่ใช่ก้นหน้า
        *    ★ ของเดิมต้องเลื่อนผ่านรายการทั้งหมดถึงจะเจอ — ซึ่งแปลว่า
        *      คนที่มีหนี้เยอะต้องเลื่อนไกลกว่าคนที่ไม่มีอะไรเลย
        *      ★★ ทั้งที่ "บันทึกรายการใหม่" ไม่เกี่ยวกับว่ามีของค้างกี่รายการ
        */}
      <Section
        ot={ot}
        title={ot('wallet.owed.secBalance')}
        action={
          <Link
            href="/office/wallet/create"
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-5',
              'text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <Untranslated>{ot('wallet.owed.create')}</Untranslated>
          </Link>
        }
      >
        <BalanceHero
          ot={ot}
          locale={locale}
          oweSat={iOweSat}
          getSat={owedSat}
          owePeople={iOweGroups.length}
          getPeople={owedGroups.length}
          oldestDays={oldestDays}
        />

        {/* ── สองฝั่ง — เป็นทั้งตัวเลขและตัวกรองของเซกชันถัดไป ── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SideCard
            ot={ot}
            flow="out"
            label={ot('wallet.owed.iOwe')}
            amount={toBaht(iOweSat)}
            people={iOweGroups.length}
            active={side === 'iOwe'}
            onClick={() => setSide('iOwe')}
            note={staleCount > 0 ? ot('wallet.owed.staleN', { n: staleCount }) : undefined}
          />
          <SideCard
            ot={ot}
            flow="in"
            label={ot('wallet.owed.owedToMe')}
            amount={toBaht(owedSat)}
            people={owedGroups.length}
            active={side === 'owedToMe'}
            onClick={() => setSide('owedToMe')}
            note={
              data && data.summary.pendingConfirm > 0
                ? ot('wallet.owed.pendingConfirm', { n: data.summary.pendingConfirm })
                : undefined
            }
          />
        </div>
      </Section>

      {/*
        * ══ เซกชัน 2 · รายการคงค้าง ══════════════════════════
        *
        * ★★ หัวเซกชันบอกว่ากำลังดูฝั่งไหนอยู่ ★ การ์ดสองใบข้างบนเป็นตัวกรอง
        *    แต่คนที่เลื่อนลงมาแล้วไม่เห็นมัน จะไม่รู้ว่าทำไมรายการมีแค่นี้
        */}
      <Section
        ot={ot}
        title={ot('wallet.owed.secOutstanding')}
        hint={side === 'iOwe' ? ot('wallet.owed.iOwe') : ot('wallet.owed.owedToMe')}
        count={shown.length}
        action={
          /* ★ ทวงทุกคน — อยู่เหนือลิสต์ตามข้อกำหนด 3.3 */
          side === 'owedToMe' &&
          owedGroups.flatMap((g) =>
            g.theirs.filter((d) => d.status === 'PENDING' && canRemind(d)),
          ).length > 1 ? (
            <Button
              size="sm"
              variant="secondary"
              className="min-h-11 shrink-0"
              loading={busy === 'all'}
              onClick={remindAll}
            >
              <Untranslated>{ot('wallet.owed.remindAll')}</Untranslated>
            </Button>
          ) : undefined
        }
      >
      {/*
        * ★★ สองคอลัมน์บนจอกว้าง ★ แถวสูง 100px ที่กว้าง 1000px คือ
        *    ที่ว่างตรงกลางแถวกว้างกว่าเนื้อหาทั้งแถวรวมกัน
        *    ★★ items-start กันไม่ให้ใบที่กางรายบิลอยู่ ดันใบข้าง ๆ ให้สูงตาม
        */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {shown.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              icon={'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'}
              title={ot('wallet.owed.empty')}
              description={ot('wallet.owed.emptyHint')}
            />
          </div>
        ) : (
          shown.map((g) => {
            const amount = toBaht(Math.abs(g.displaySat))
            const bills = [...g.mine, ...g.theirs]
            const isOpen = open === g.otherId
            const waiting = g.waiting.length > 0

            return (
              <div
                key={g.otherId}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-2xl border bg-elevated/50 backdrop-blur-md transition-colors',
                  /*
                   * ★★★ ใบที่ "ต้องทำอะไรสักอย่างเดี๋ยวนี้" มีขอบสีของตัวเอง
                   *
                   *     ★ มีคนแจ้งโอนแล้วรอเรากดยืนยัน = เราคือคนที่ค้างงานอยู่
                   *       ★★ ของเดิมบอกด้วยป้ายเล็ก ๆ กลางแถว ซึ่งอยู่ในกองป้าย
                   *          เดียวกับ "3 บิล" และ "ค้างมา 5 วัน" จึงกวาดตาแล้วไม่เห็น
                   *     ★ ค้างเกินเกณฑ์ = เรื่องเร่งด่วนแต่ยังไม่ใช่งานของเรา
                   *       จึงเป็นสีเตือน ไม่ใช่สีเน้น
                   */
                  waiting
                    ? 'border-accent/45'
                    : g.daysOwed > STALE_DAYS
                      ? 'border-warn/40'
                      : 'border-line',
                )}
              >
                {/*
                  * ★★ ทั้งแถวบนเป็นปุ่มกาง ไม่ใช่เฉพาะตรงชื่อ
                  *    ★ ของเดิมแตะโดนเฉพาะกล่องชื่อกับป้าย — แตะที่รูปหรือที่
                  *      ตัวเลขไม่ติด ซึ่งเป็นสองจุดที่คนเล็งบ่อยที่สุด
                  */}
                {/*
                  * ★★★ รางสีชิดขอบซ้าย = ทิศทางของเงินที่อ่านได้จากหางตา
                  *
                  *     ★ ของเดิมบอกทิศทางด้วยสีของตัวเลขอย่างเดียว ซึ่งอยู่
                  *       ขอบขวาสุดของการ์ด ★★ เวลากวาดตาลงมาตามคอลัมน์ซ้าย
                  *       (ซึ่งคือสิ่งที่คนทำ) จะไม่เจอสีนั้นเลยสักใบ
                  *     ★ รางอยู่ตรงที่ตาเริ่มอ่านพอดี และไม่กินที่ของเนื้อหา
                  */}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 start-0 w-1"
                  style={{ background: `rgb(${side === 'iOwe' ? FLOW.out.tint : FLOW.in.tint})` }}
                />

                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : g.otherId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 p-4 ps-5 text-start transition-colors hover:bg-surface/50"
                >
                  <ChatAvatar name={g.otherName} url={g.otherAvatar} size={44} />

                  <span className="min-w-0 flex-1">
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
                        <span
                          className={cn(
                            g.daysOwed > STALE_DAYS
                              ? 'rounded-full bg-warn/15 px-1.5 py-0.5 font-medium text-warn'
                              : 'text-ink-faint',
                          )}
                        >
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
                      {/*
                        * ★ ป้าย "รอยืนยัน" ถูกถอดออกจากกองนี้
                        *   ★★ มันขึ้นซ้ำกับแถบสถานะข้างล่างซึ่งพูดเรื่องเดียวกัน
                        *      แต่บอกได้ครบกว่าว่ารอใครอยู่
                        */}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-start gap-1.5">
                    <span className="text-end">
                      {/*
                        * ★★★ ป้ายบอกว่าตัวเลขนี้คืออะไร วางเหนือตัวเลข
                        *
                        *     ★ "฿140.00" สีแดงบอกได้แค่ว่าเกี่ยวกับเงินออก
                        *       ★★ แต่ "ต้องจ่าย" ตอบคำถามจริงว่าต้องทำอะไรกับมัน
                        *          ซึ่งคือสิ่งที่คนเปิดหน้านี้มาหา
                        */}
                      <span
                        className={cn(
                          'block text-[10px] font-bold uppercase tracking-wide',
                          side === 'iOwe' ? 'text-[rgb(255_59_48)]' : 'text-[rgb(52_199_123)]',
                        )}
                      >
                        <Untranslated>
                          {ot(side === 'iOwe' ? 'wallet.owed.mustPay' : 'wallet.owed.willGet')}
                        </Untranslated>
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block text-[21px] font-bold leading-none tabular-nums',
                          amount === 0
                            ? 'text-ink-faint'
                            : side === 'iOwe'
                              ? 'text-[rgb(255_59_48)]'
                              : 'text-[rgb(52_199_123)]',
                        )}
                      >
                        ฿{formatBaht(locale, amount)}
                      </span>
                    </span>

                    {/*
                      * ★★★ ลูกศรบอกว่ากางดูรายบิลได้
                      *
                      *     ★ ของเดิมแตะที่ชื่อแล้วกางออกมา แต่ไม่มีอะไรบนจอ
                      *       บอกว่าแตะได้ ★★ ฟีเจอร์ที่ต้องเดาเอาว่ามีอยู่
                      *       เท่ากับไม่มี สำหรับคนส่วนใหญ่
                      */}
                    <svg
                      viewBox="0 0 24 24"
                      className={cn(
                        'mt-2 size-4 text-ink-faint transition-transform duration-200',
                        isOpen && 'rotate-180',
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {/* ── ปุ่มหลักของแถว ───────────────────────────── */}
                {/*
                  * ── แถบสถานะ ──────────────────────────────────
                  *
                  * ★★★ "รอยืนยัน" เฉย ๆ ตอบไม่ได้ว่ารอใครทำอะไร
                  *
                  *     ★ ของเดิมมีคำนี้สองที่บนการ์ดใบเดียว — เป็นป้ายกลางแถว
                  *       และเป็นข้อความเดี่ยว ๆ ในแถบปุ่มที่เหลือพื้นที่ว่างทั้งแถบ
                  *       ★★ ซึ่งอ่านเป็น "ปุ่มหายไป" มากกว่า "สถานะ"
                  *     ★ ประโยคเต็มพร้อมไอคอนบอกครบในบรรทัดเดียว และทำให้
                  *       แถบนั้นมีเหตุผลที่จะมีอยู่
                  */}
                {waiting ? (
                  <p
                    className={cn(
                      'flex items-center gap-2 border-y border-line px-4 py-2.5 ps-5 text-[12px]',
                      /*
                       * ★★★ สีของแถบบอกว่า "ใครต้องทำ" ไม่ใช่ "มีสถานะ"
                       *
                       *     ★ ฝั่งฉันค้าง = โอนไปแล้ว รออีกฝ่าย → เป็นข่าวสาร
                       *       ไม่ใช่งานของเรา จึงใช้สีกลาง
                       *     ★★ ฝั่งคนอื่นค้าง = เขาโอนแล้ว รอเรากด → นี่คืองาน
                       *        ของเราและเป็นสิ่งเดียวบนการ์ดที่ต้องทำเดี๋ยวนี้
                       *        ★ ถ้าทั้งสองกรณีสีเดียวกัน สีก็เลิกบอกอะไร
                       */
                      side === 'iOwe'
                        ? 'bg-surface/70 text-ink-soft'
                        : 'bg-accent/10 font-medium text-ink',
                    )}
                  >
                    <svg viewBox="0 0 24 24" className={cn('size-4 shrink-0', side === 'iOwe' ? 'text-ink-faint' : 'text-accent')} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
                    </svg>
                    <span dir="auto" className="min-w-0">
                      <Untranslated>
                        {side === 'iOwe'
                          ? ot('wallet.owed.waitingFor', { name: g.otherName })
                          : ot('wallet.owed.waitingMe')}
                      </Untranslated>
                    </span>
                  </p>
                ) : null}

                {/*
                  * ── ปุ่มหลักของการ์ด ──────────────────────────
                  * ★★ mt-auto ดันไปชิดล่าง การ์ดในแถวเดียวกันจึงมีเส้นฐานเดียวกัน
                  *    ★ ของเดิมใบที่มีปุ่มสูงกว่าใบที่มีแต่ข้อความ แล้วแถวดูไม่เรียบ
                  */}
                <div className="mt-auto flex flex-wrap items-center gap-2 px-4 pb-4 ps-5 empty:hidden">
                  {side === 'iOwe' ? (
                    /*
                     * ★★★ มีใบที่ยังค้างอยู่ → ต้องมีปุ่มจ่ายเสมอ
                     *
                     *     ★ เดิมเช็กแค่ "มีใบรอยืนยันไหม" ★★ ผลคือพอจ่ายบิลหนึ่ง
                     *       ไปแล้ว ปุ่มจ่ายของบิลที่เหลือกับคนเดียวกันหายหมด
                     *       ★ เจอตอนทดสอบซ้ำรอบที่สอง — จ่ายบิลที่สองไม่ได้เลย
                     *         จนกว่าเจ้าหนี้จะกดยืนยันบิลแรก
                     */
                    g.pendingMine.length > 0 ? (
                      /*
                       * ★★ ปุ่มเดียว เปิดแผ่นจ่ายเงิน — แตะที่ 1 จาก 2
                       *    ★ ยอดอยู่บนตัวปุ่มเอง ★★ "จ่าย" เฉย ๆ ทำให้ต้องเงยไป
                       *      อ่านตัวเลขข้างบนก่อนกด และยอดที่จ่ายได้จริงอาจน้อยกว่า
                       *      ยอดบนหัวการ์ดเมื่อมีใบรอยืนยันปนอยู่ — ความต่างนั้น
                       *      ต้องเห็นก่อนกด ไม่ใช่หลังกด
                       */
                      <Button
                        size="sm"
                        variant="primary"
                        className="min-h-11 w-full"
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
                        <Untranslated>
                          {ot('wallet.owed.payAmount', {
                            amount: `฿${formatBaht(locale, toBaht(Math.abs(g.payableSat)))}`,
                          })}
                        </Untranslated>
                      </Button>
                    ) : null
                  ) : (
                    <OwedActions
                      group={g}
                      ot={ot}
                      busy={busy}
                      onAct={act}
                      locale={locale}
                    />
                  )}

                </div>

                {/* ── รายบิล (แตะขยาย) ──────────────────────────── */}
                {isOpen ? (
                  <>
                  <ul className="divide-y divide-line border-t border-line bg-surface/40">
                    {bills.map((d) => {
                      const outgoing = g.mine.includes(d)
                      return (
                        <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="min-w-0 flex-1">
                            <span
                              dir="auto"
                              className="block truncate text-[13px] text-ink-soft"
                            >
                              {d.description || ot('wallet.owed.bills', { n: 1 })}
                            </span>
                            {/*
                              * ★★ วันที่กับสถานะอยู่บรรทัดเดียวกัน
                              *    ★ "บิลไหนเก่าสุด" กับ "บิลไหนโอนไปแล้ว" คือสองคำถาม
                              *      ที่คนกางรายบิลออกมาถาม ★★ ของเดิมตอบไม่ได้สักข้อ —
                              *      มีแค่ชื่อกับยอด ซึ่งเห็นอยู่แล้วตอนยังไม่กาง
                              */}
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                              <time dateTime={d.createdAt}>
                                {new Date(d.createdAt).toLocaleDateString(locale, {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </time>
                              {d.status === 'PAID_PENDING' ? (
                                <span className="text-warn">
                                  <Untranslated>{ot('wallet.owed.waiting')}</Untranslated>
                                </span>
                              ) : null}
                              {d.hasSlip ? (
                                <span className="text-link">
                                  <Untranslated>{ot('wallet.owed.paidIt')}</Untranslated>
                                </span>
                              ) : null}
                            </span>
                          </span>

                          <span
                            className={cn(
                              'shrink-0 text-[13px] font-medium tabular-nums',
                              outgoing ? 'text-[rgb(255_59_48)]' : 'text-[rgb(52_199_123)]',
                            )}
                          >
                            {outgoing ? '−' : '+'}฿{formatBaht(locale, d.amount)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {/*
                    * ── ยกเลิกหนี้ ─────────────────────────────────
                    *
                    * ★★★ ย้ายออกจากเมนูจุดสามจุดมาอยู่ในแผงรายบิล
                    *
                    *     ★ เมนูจุดสามจุดลอยอยู่ทุกใบ ทั้งที่ของข้างในมีรายการ
                    *       เดียวและเจ้าหนี้เท่านั้นที่ใช้ได้ ★★ ใบฝั่ง "ฉันค้าง"
                    *       จึงมีปุ่มที่เปิดมาแล้วเจอ "ไม่มีรายการในกลุ่มนี้"
                    *       ★ ปุ่มที่เปิดมาแล้วว่างเปล่า คือปุ่มที่ไม่ควรมีอยู่
                    *     ★★ ที่นี่คือที่ของมัน — คนที่กางรายบิลออกมาดูแล้ว
                    *        คือคนที่กำลังตัดสินใจเรื่องบิลพวกนี้พอดี
                    *     ★ ยังอยู่ไกลจากปุ่ม "จ่าย"/"ยืนยันรับเงิน" พอที่จะ
                    *       ไม่กดพลาด ซึ่งเป็นเหตุผลเดิมที่มันถูกซ่อนไว้ในเมนู
                    */}
                  {g.theirs.length > 0 ? (
                    <div className="border-t border-line px-3 py-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!(await confirm({ kind: 'delete', subject: g.otherName, message: ot('wallet.owed.cancelAsk') }))) return
                          for (const d of g.theirs) {
                            void act(d.id, { action: 'cancel' })
                          }
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] text-danger transition-opacity hover:opacity-70"
                      >
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                        <Untranslated>{ot('wallet.owed.cancelDebt')}</Untranslated>
                      </button>
                    </div>
                  ) : null}
                  </>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      </Section>

      {/*
        * ══ เซกชัน 3 · ประวัติ ═══════════════════════════════
        *
        * ★★★ ของที่ปิดไปแล้วเป็น "ประวัติ" ไม่ใช่ "รายการอีกกองหนึ่ง"
        *
        *     ★ ของเดิมเป็นปุ่มพับบรรทัดเดียวต่อท้ายลิสต์ที่ยังค้างอยู่
        *       โดยไม่มีเส้นแบ่งอะไรเลย ★★ จึงอ่านเหมือนเป็นส่วนขยาย
        *       ของรายการข้างบน ทั้งที่มันคือคนละเรื่องกันคนละเวลา
        *     ★ ยุบไว้เหมือนเดิม เพราะคนเปิดหน้านี้มาดูของที่ยังค้าง
        *       ★★ แต่ยอดรวมโผล่อยู่บนหัวแม้ตอนยุบ — ตัวเลขเดียวที่ทำให้
        *          ส่วนนี้มีค่ามากกว่าการเป็นที่เก็บของเก่า
        */}
      {settled.length > 0 || settledQuery ? (
        <Section
          ot={ot}
          title={ot('wallet.owed.secHistory')}
          hint={ot('wallet.owed.historyHint')}
        >
          <div className="overflow-hidden rounded-2xl border border-line bg-elevated/50 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setShowSettled((v) => !v)}
              aria-expanded={showSettled}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-surface/60"
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink">
                  <Untranslated>{ot('wallet.owed.settled')}</Untranslated>
                </span>
                <span className="text-[12px] tabular-nums text-ink-soft">
                  {ot('wallet.owed.itemsN', { n: settled.length })}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-ink-faint">
                  ฿{formatBaht(locale, settledTotal)}
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className={cn(
                  'size-4 shrink-0 text-ink-faint transition-transform duration-200',
                  showSettled && 'rotate-180',
                )}
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
              <div className="border-t border-line p-3">
                <Input
                  radius="round"
                  value={settledQuery}
                  onChange={(e) => {
                    setSettledQuery(e.target.value)
                    /* ★ ค้นหาใหม่แล้วต้องกลับไปหน้าแรก ไม่งั้นผลลัพธ์ 3 ใบ
                         ที่ดูอยู่หน้า 4 จะกลายเป็นหน้าว่าง */
                    setPage(0)
                  }}
                  placeholder={ot('wallet.owed.settledSearch')}
                  aria-label={ot('wallet.owed.settledSearch')}
                />
                {/* ★ สองคอลัมน์บนจอกว้างเหมือนรายการข้างบน — ประวัติยาวกว่า
                    รายการที่ยังค้างเสมอ จึงได้ประโยชน์จากความกว้างมากกว่าด้วยซ้ำ */}
                <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                  {pageRows.length === 0 ? (
                    <li className="col-span-full py-6 text-center text-xs text-ink-faint">
                      <Untranslated>{ot('wallet.owed.nothingHere')}</Untranslated>
                    </li>
                  ) : (
                    pageRows.map((d) => (
                      <li key={d.id}>
                        {/*
                          * ★★ ทั้งแถวกดได้ เปิดแผ่นรายละเอียด
                          *    ★ ของเดิมเป็นข้อความเฉย ๆ — สลิปที่แนบไว้ตอนโอน
                          *      จึงไม่มีทางเปิดดูได้อีกเลยหลังรายการปิด
                          *      ★★ ทั้งที่มันคือหลักฐานที่คนเก็บไว้เพื่อวันที่มีปัญหา
                          */}
                        <button
                          type="button"
                          onClick={() => setDetail(d)}
                          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-surface"
                        >
                          <ChatAvatar name={d.otherName} url={d.otherAvatar} size={32} />
                          <span className="min-w-0 flex-1">
                            <span dir="auto" className="block truncate text-[13px] text-ink">
                              {d.otherName}
                            </span>
                            <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                              <time dateTime={d.paidAt ?? d.createdAt}>
                                {new Date(d.paidAt ?? d.createdAt).toLocaleDateString(locale, {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </time>
                              {d.description ? (
                                <span dir="auto" className="min-w-0 truncate">
                                  {d.description}
                                </span>
                              ) : null}
                            </span>
                          </span>

                          {/* ★ คลิปหนีบบอกว่าใบนี้มีสลิปแนบอยู่ — เห็นได้ก่อนกดเข้าไป */}
                          {d.hasSlip ? (
                            <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-link" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.3-7.3" />
                            </svg>
                          ) : null}

                          <span className="shrink-0 text-[13px] tabular-nums text-ink-faint">
                            ฿{formatBaht(locale, d.amount)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>

                {/* ── แบ่งหน้า ───────────────────────────────── */}
                {pageCount > 1 ? (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    {/* ★ บอกช่วงที่กำลังดูและทั้งหมด ไม่ใช่แค่เลขหน้า
                        ★★ "11–20 จาก 37" ตอบได้ทันทีว่าเหลืออีกเท่าไหร่ */}
                    <p className="text-[11.5px] tabular-nums text-ink-faint">
                      <Untranslated>
                        {ot('wallet.owed.pageRange', {
                          from: safePage * HISTORY_PAGE + 1,
                          to: safePage * HISTORY_PAGE + pageRows.length,
                          total: settled.length,
                        })}
                      </Untranslated>
                    </p>
                    <span className="flex items-center gap-1">
                      <PageBtn
                        ot={ot}
                        dir="prev"
                        disabled={safePage === 0}
                        onClick={() => setPage(safePage - 1)}
                      />
                      <span className="px-1 text-[12px] tabular-nums text-ink-soft">
                        {safePage + 1}/{pageCount}
                      </span>
                      <PageBtn
                        ot={ot}
                        dir="next"
                        disabled={safePage >= pageCount - 1}
                        onClick={() => setPage(safePage + 1)}
                      />
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/*
        * ★★ ปุ่มลอยมุมขวาล่างถูกถอดออก — ย้ายไปอยู่หัวเซกชันแรกแทน
        *    ★ ของเดิมมีปุ่มสร้างสองที่: ลอยอยู่มุมขวาล่างบนมือถือ และต่อท้าย
        *      ลิสต์บนจอกว้าง ★★ ปุ่มเดียวกันสองที่ทำให้ไม่มีที่ไหนเป็น "ที่ของมัน"
        *      ★ และตัวที่ลอยอยู่ก็ทับรายการใบล่างสุดตลอดเวลา
        */}

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

      {detail ? <DebtDetailSheet debt={detail} onClose={() => setDetail(null)} /> : null}

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
    otherName: string
    theirs: Debt[]
    waiting: Debt[]
  }
  ot: Ot
  busy: string | null
  onAct: (id: string, body: Record<string, unknown>, msg?: string) => void
  locale: string
}) {
  const confirm = useConfirm()
  const waiting = group.waiting.filter((d) => group.theirs.includes(d))

  if (waiting.length > 0) {
    return (
      <>
        <Button
          size="sm"
          variant="primary"
          className="min-h-11 flex-1"
          loading={busy === waiting[0]!.id}
          onClick={async () => {
            /* ★ ยืนยันรับเงิน = ปิดหนี้ — ถามก่อนเสมอ */
            if (!(await confirm({ kind: 'edit', subject: group.otherName, title: `${ot('wallet.owed.confirmGot')} · ${group.otherName}`, confirmLabel: ot('wallet.owed.confirmGot') }))) return
            for (const d of waiting) onAct(d.id, { action: 'confirm' }, ot('wallet.owed.toastConfirmed'))
          }}
        >
          <Untranslated>{ot('wallet.owed.confirmGot')}</Untranslated>
        </Button>
        <button
          type="button"
          onClick={async () => {
            if (!(await confirm({ kind: 'edit', subject: group.otherName, title: `${ot('wallet.owed.notGot')} · ${group.otherName}`, confirmLabel: ot('wallet.owed.notGot') }))) return
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
        className="min-h-11 w-full"
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

/**
 * ปุ่มเลื่อนหน้าของประวัติ
 *
 * ★ ลูกศรกลับด้านเองในภาษาที่อ่านขวาไปซ้าย (rtl:-scale-x-100)
 *   ★★ "หน้าถัดไป" ในภาษาอาหรับคือทางซ้าย ไม่ใช่ทางขวา
 */
function PageBtn({
  ot,
  dir,
  disabled,
  onClick,
}: {
  ot: Ot
  dir: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ot(dir === 'prev' ? 'wallet.owed.pagePrev' : 'wallet.owed.pageNext')}
      className={cn(
        'grid size-11 place-items-center rounded-full transition-colors',
        disabled
          ? 'cursor-not-allowed text-ink-faint/40'
          : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
}

/**
 * หัวเซกชัน
 *
 * ★★★ หน้านี้เคยเป็นของสี่กองไหลต่อกันโดยไม่มีอะไรคั่น
 *
 *     การ์ดสรุป → ปุ่มทวงทุกคน → รายการ → ของที่จ่ายครบแล้ว
 *     ★ ทั้งหมดห่างกันแค่ระยะขอบ จึงอ่านเป็นกองเดียวยาว ๆ
 *       ★★ แล้วคนที่เลื่อนลงมากลางหน้าไม่มีทางรู้ว่ากำลังดูอะไรอยู่
 *
 * ★ ชื่อเซกชันไม่ใช่ของประดับ — มันคือคำตอบของ "ตรงนี้คืออะไร"
 *   ★★ และตัวนับข้าง ๆ ตอบ "มีกี่อัน" ซึ่งเป็นคำถามถัดไปเสมอ
 */
function Section({
  ot,
  title,
  hint,
  count,
  action,
  children,
}: {
  ot: Ot
  title: string
  hint?: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-ink">
            <Untranslated>{title}</Untranslated>
            {count !== undefined ? (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal tabular-nums text-ink-soft">
                {ot('wallet.owed.itemsN', { n: count })}
              </span>
            ) : null}
          </h2>
          {hint ? (
            <p className="mt-0.5 text-[12px] text-ink-faint">
              <Untranslated>{hint}</Untranslated>
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/*
 * สีของทิศทางเงิน — ชุดเดียวกับการ์ดสรุปบนหน้าแรก
 *
 * ★★ แดง = ออกจากกระเป๋า · เขียว = เข้ากระเป๋า
 *    ★ คนที่เพิ่งเห็นการ์ดแดงบนหน้าแรกแล้วกดเข้ามา ต้องเจอสีเดิมที่นี่
 *      ★★ ไม่งั้นเขาต้องอ่านใหม่ว่าที่นี่สีแดงแปลว่าอะไร
 */
const FLOW = {
  out: { tint: '255 59 48', arrow: 'M12 19V5M5 12l7-7 7 7' },
  in: { tint: '52 199 123', arrow: 'M12 5v14M5 12l7 7 7-7' },
} as const

/**
 * แถบยอดสุทธิ
 *
 * ★★★ ตอบคำถามที่ตัวเลขสองก้อนตอบไม่ได้: "สรุปแล้วฉันติดหรือได้คืน"
 *
 *     ★ หน้าเดิมบอก "ฉันค้าง ฿760" กับ "คนอื่นค้างฉัน ฿592" แล้วปล่อยให้
 *       คนลบเอง ★★ ซึ่งคนทำทุกครั้งที่เปิดหน้านี้ เพราะนั่นคือสิ่งที่เขามาหา
 *
 * ★★★ แถบเทียบสัดส่วนคือตัวเลขเดิมในรูปแบบที่อ่านได้โดยไม่ต้องอ่าน
 *
 *     ★ สองก้อนที่ใกล้เคียงกันกับสองก้อนที่ต่างกันสิบเท่า เป็นสถานการณ์
 *       คนละเรื่องกันโดยสิ้นเชิง ★★ แต่ตัวเลขสองบรรทัดบอกไม่ได้ว่าอันไหน
 *       จนกว่าจะอ่านทั้งสองแล้วเทียบในหัว
 *
 * ★ คิดจาก groups ชุดเดียวกับลิสต์ ไม่ใช่ summary ของ API
 *   ★★ ไม่งั้นแถบจะบอกคนละเรื่องกับรายการที่อยู่ใต้มันเองสองนิ้ว
 */
function BalanceHero({
  ot,
  locale,
  oweSat,
  getSat,
  owePeople,
  getPeople,
  oldestDays,
}: {
  ot: Ot
  locale: string
  oweSat: number
  getSat: number
  owePeople: number
  getPeople: number
  oldestDays: number
}) {
  const netSat = oweSat - getSat
  const total = oweSat + getSat

  /* ★ ไม่มีอะไรค้างเลย → ไม่ต้องมีแถบ ★★ แถบที่ว่างเปล่าอ่านเป็นของที่พัง */
  if (total === 0) return null

  const owing = netSat > 0
  const even = netSat === 0
  const tint = even ? null : owing ? FLOW.out.tint : FLOW.in.tint

  /*
   * ★ ขั้นต่ำ 6% ต่อฝั่ง — ฝั่งที่เล็กมากต้องยังมองเห็น
   *   ★★ แถบที่หายไปเลยอ่านเป็น "ไม่มีฝั่งนั้น" ซึ่งเป็นคนละเรื่องกับ "มีน้อย"
   */
  const rawShare = (oweSat / total) * 100
  const share = Math.min(94, Math.max(6, rawShare))

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-elevated/50 p-5 backdrop-blur-md">
      {/* ★ ไม่มีป้ายชื่อซ้ำกับหัวเซกชันที่อยู่เหนือมันสองบรรทัด */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p
          className={cn(
            'text-[34px] font-bold leading-none tracking-tight tabular-nums',
            tint ? 'text-[rgb(var(--f))]' : 'text-ink',
          )}
          style={tint ? ({ '--f': tint } as React.CSSProperties) : undefined}
        >
          ฿{formatBaht(locale, toBaht(Math.abs(netSat)))}
        </p>
        <p className="text-[13px] text-ink-soft">
          <Untranslated>
            {even
              ? ot('wallet.owed.netEven')
              : owing
                ? ot('wallet.owed.netOwe')
                : ot('wallet.owed.netGet')}
          </Untranslated>
        </p>
      </div>

      {/*
        * ★ แถบเป็นภาพของตัวเลขที่เขียนไว้ใต้มัน ไม่ใช่ข้อมูลใหม่
        *   ★★ จึงเป็น aria-hidden — โปรแกรมอ่านหน้าจออ่านบรรทัดล่างได้ครบอยู่แล้ว
        *      การอ่านซ้ำเป็น "progressbar 56 เปอร์เซ็นต์" ไม่ได้ช่วยอะไร
        */}
      <div
        aria-hidden="true"
        className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface"
      >
        <span
          className="h-full transition-[width] duration-700"
          style={{ width: `${share}%`, background: `rgb(${FLOW.out.tint})` }}
        />
        <span
          className="h-full flex-1"
          style={{ background: `rgb(${FLOW.in.tint})` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
        <Leg
          ot={ot}
          locale={locale}
          flow="out"
          label={ot('wallet.owed.iOwe')}
          sat={oweSat}
          people={owePeople}
        />
        <Leg
          ot={ot}
          locale={locale}
          flow="in"
          label={ot('wallet.owed.owedToMe')}
          sat={getSat}
          people={getPeople}
        />

        {/* ★ ค้างนานสุดอยู่บรรทัดเดียวกับยอด เพราะมันคือ "ความเร่งด่วน"
            ซึ่งอ่านคู่กับ "จำนวนเงิน" เสมอ ไม่ใช่แยกไปอยู่อีกกล่อง */}
        {oldestDays > STALE_DAYS ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-warn">
            <Untranslated>{ot('wallet.owed.oldestN', { n: oldestDays })}</Untranslated>
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Leg({
  ot,
  locale,
  flow,
  label,
  sat,
  people,
}: {
  ot: Ot
  locale: string
  flow: 'out' | 'in'
  label: string
  sat: number
  people: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ '--f': FLOW[flow].tint } as React.CSSProperties}>
      <svg
        viewBox="0 0 24 24"
        className="size-3.5 text-[rgb(var(--f))]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={FLOW[flow].arrow} />
      </svg>
      <span className="text-ink-soft">
        <Untranslated>{label}</Untranslated>
      </span>
      <span className="font-semibold tabular-nums text-[rgb(var(--f))]">
        ฿{formatBaht(locale, toBaht(sat))}
      </span>
      {people > 0 ? (
        <span className="text-ink-faint">
          · <Untranslated>{ot('wallet.owed.peopleN', { n: people })}</Untranslated>
        </span>
      ) : null}
    </span>
  )
}

/**
 * การ์ดฝั่ง — เป็นทั้งตัวเลขและตัวกรอง
 *
 * ★★ ของเดิมเป็นปุ่มสองใบที่หน้าตาเหมือนกันทุกอย่างยกเว้นสีตัวเลข
 *    ★ จึงไม่มีอะไรบอกว่ามัน "กดได้" และกดแล้วเกิดอะไร
 *      ★★ ป้ายทิศทาง + ลูกศร + ขอบสีของตัวเอง ทำให้ทั้งสองอย่างชัดพร้อมกัน
 */
function SideCard({
  ot,
  flow,
  label,
  amount,
  people,
  active,
  note,
  onClick,
}: {
  ot: Ot
  flow: 'out' | 'in'
  label: string
  amount: number
  people: number
  active: boolean
  note?: string
  onClick: () => void
}) {
  const locale = useLocale()
  const { tint, arrow } = FLOW[flow]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ '--f': tint } as React.CSSProperties}
      className={cn(
        'group relative min-h-11 overflow-hidden rounded-2xl border p-4 text-start',
        'backdrop-blur-md transition-all duration-200',
        /*
         * ★★ ฝั่งที่เลือกอยู่ "สว่างขึ้น" ไม่ใช่ "เปลี่ยนเป็นสีอื่น"
         *    ★ ของเดิมใช้ขอบสีเน้นของระบบ ซึ่งเป็นสีเดียวกันทั้งสองใบ
         *      ★★ แปลว่าสีบอกได้แค่ "ใบนี้เลือกอยู่" แต่ไม่ได้บอกว่าใบนี้คือฝั่งไหน
         */
        active
          ? 'border-[rgb(var(--f)/0.55)] bg-[rgb(var(--f)/0.08)]'
          : 'border-line bg-elevated/50 hover:border-[rgb(var(--f)/0.35)] hover:bg-surface',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
            'bg-[rgb(var(--f)/0.16)] text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--f))]',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={arrow} />
          </svg>
          <Untranslated>{ot(flow === 'out' ? 'home.flowOut' : 'home.flowIn')}</Untranslated>
        </span>

        {people > 0 ? (
          <span className="text-[11px] text-ink-faint">
            <Untranslated>{ot('wallet.owed.peopleN', { n: people })}</Untranslated>
          </span>
        ) : null}
      </span>

      <span className="mt-2 block text-sm text-ink-soft">
        <Untranslated>{label}</Untranslated>
      </span>

      {/* ★ สีของทิศทางเฉพาะเมื่อมียอดจริง — ฿0.00 สีแดงคือการเตือนเรื่องที่ไม่มีอยู่ */}
      <span
        className={cn(
          'mt-0.5 block text-[26px] font-bold leading-tight tabular-nums',
          amount > 0 ? 'text-[rgb(var(--f))]' : 'text-ink-faint',
        )}
      >
        ฿{formatBaht(locale, amount)}
      </span>

      {note ? (
        <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">
          <Untranslated>{note}</Untranslated>
        </span>
      ) : null}
    </button>
  )
}
