'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast, useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { categoryLabel, formatBaht } from '@/lib/office/wallet'
import { shrinkImage } from '@/lib/image/shrink'
import { computeSplit, customRemainder, loadPrefs, savePrefs, type BillPrefs } from '@/lib/office/billDraft'
import { toBaht } from '@/lib/office/money'
import { ChatAvatar } from './ChatAvatar'

type Person = { id: string; name: string; avatarUrl: string | null; department: string | null }
type Shop = { id: string; name: string; cuisine: string | null }
type Group = { id: string; name: string; memberIds: string[] }

type Recent = {
  lastBill: { shopId: string | null; shopName: string | null; splitMode: 'EQUAL' | 'CUSTOM'; people: Person[] } | null
  frequentPeople: Person[]
  shops: Shop[]
  groups: Group[]
  suggestGroup: string[] | null
}

/**
 * หน้าสร้างรายการเงิน — ออกแบบใหม่ทั้งหน้าเพื่อ "กรอกให้น้อยที่สุด"
 *
 * ★★★ หน้านี้ถูกเปิดตอนยืนอยู่หน้าแคชเชียร์ ไม่ใช่ตอนนั่งหน้าคอม
 *
 *     ★ ทุกการตัดสินใจในไฟล์นี้ยึดข้อนี้: ช่องบังคับมีแค่ยอดเงินกับคนที่หาร
 *       ★★ ที่เหลือมีค่าเริ่มต้นหมด และซ่อนอยู่ใต้ "เพิ่มรายละเอียด"
 *     ★ ลำดับบนหน้าจอเรียงตามลำดับที่คนคิดจริง: จ่ายไปเท่าไหร่ → ร้านอะไร →
 *       หารกับใคร → คนละเท่าไหร่ ★★ ไม่ใช่เรียงตามลำดับคอลัมน์ในฐานข้อมูล
 *
 * ★★ ปุ่มบันทึกติดล่างจอ และบอกสิ่งที่ขาดบนตัวปุ่ม
 *    ★ ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผล ทำให้คนกดซ้ำแล้วคิดว่าเว็บค้าง
 */
export function WalletCreate() {
  const ot = useOt()
  const locale = useLocale()
  const router = useRouter()
  const params = useSearchParams()
  const { toast, showToast } = useToast()

  const [recent, setRecent] = useState<Recent | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [meId, setMeId] = useState<string | null>(null)

  /* ── ค่าที่กรอก ────────────────────────────────────────────── */
  const [amount, setAmount] = useState('')
  const [shopId, setShopId] = useState<string | null>(null)
  const [shopName, setShopName] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [prefs, setPrefs] = useState<BillPrefs>(() => loadPrefs())

  /* ── รายละเอียดเสริม ──────────────────────────────────────── */
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<'FOOD' | 'COFFEE' | 'OTHER'>('FOOD')
  const [billDate, setBillDate] = useState(() => todayIso())
  const [delivery, setDelivery] = useState('')
  const [discount, setDiscount] = useState('')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<Record<string, string>>({})
  const [askGroup, setAskGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const [shopSearch, setShopSearch] = useState(false)
  const [shopQuery, setShopQuery] = useState('')
  /** ร้านที่กำลังชวนให้โหวตหลังบันทึกบิล — null = ไม่ชวน */
  const [voteShop, setVoteShop] = useState<string | null>(null)

  const amountRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /* ── โหลดข้อมูลที่ระบบใช้เดา ───────────────────────────────── */
  const load = useCallback(async () => {
    try {
      const [r, all] = await Promise.all([
        apiFetch<Recent>('/api/office/wallet/recent'),
        apiFetch<{ items: Person[]; meId: string }>('/api/office/people'),
      ])
      setRecent(r)
      setPeople(all.items)
      setMeId(all.meId ?? null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /*
   * ── กรอกล่วงหน้าผ่าน URL (ใช้กับเฟส 5) ──────────────────────
   * ★ ?shop=&people=&amount= — ปุ่ม "กินร้านนี้แล้ว สร้างบิล" จากหน้าสุ่มอาหาร
   *   ★★ อ่านครั้งเดียวตอนเปิดหน้า ไม่ผูกกับ state ที่เปลี่ยนทีหลัง
   */
  useEffect(() => {
    const a = params.get('amount')
    const s = params.get('shop')
    const p = params.get('people')
    if (a && /^\d+(\.\d{1,2})?$/.test(a)) setAmount(a)
    if (s) setShopId(s)
    if (p) setPicked(p.split(',').filter(Boolean))
  }, [params])

  /*
   * ★★★ ชื่อร้านที่ส่งมาทาง URL — ถามชื่อมาเองถ้าไม่อยู่ใน 5 ร้านล่าสุด
   *
   *     ★ ร้านที่มาจากหน้าร้านเด็ดหรือหน้าสุ่มอาหาร ส่วนใหญ่ "ไม่ใช่ร้านที่เพิ่งใช้"
   *       ★★ มันคือร้านใหม่ที่เพิ่งเจอ ★ ถ้าหาเฉพาะใน recent.shops จะไม่เจอ
   *          แล้วหน้าจะไม่มีอะไรบอกเลยว่าร้านถูกเลือกไว้
   *
   * ★★★ effect นี้ผูกกับ shopId อย่างเดียว ห้ามผูกกับ recent
   *
   *     ★ เคยผูกกับ recent ด้วย ★★ แล้ว recent เปลี่ยนค่าระหว่างที่ fetch
   *        ยังไม่กลับมา → cleanup ตั้ง alive = false → ผลลัพธ์ถูกทิ้งเงียบ ๆ
   *        ★ วัดได้จากเบราว์เซอร์จริง: คำขอคืน 200 พร้อมชื่อร้านครบ
   *          แต่หน้าจอไม่ขึ้นอะไรเลย และ catch ก็ไม่ทำงานเพราะไม่มี error
   */
  const [urlShop, setUrlShop] = useState<Shop | null>(null)

  useEffect(() => {
    if (!shopId) return
    let alive = true
    apiFetch<{ restaurant: { id: string; name: string; cuisine: string | null } }>(
      `/api/office/food/restaurants/${shopId}`,
    )
      .then((d) => {
        if (!alive) return
        setUrlShop({ id: d.restaurant.id, name: d.restaurant.name, cuisine: d.restaurant.cuisine })
        setShopName(d.restaurant.name)
        /* ★ ร้านกาแฟ → เดาประเภทให้เลย เหมือนตอนกดชิปเอง */
        if (/กาแฟ|coffee|cafe/i.test(`${d.restaurant.name} ${d.restaurant.cuisine ?? ''}`)) {
          setCategory('COFFEE')
        }
      })
      .catch(() => {
        /* ★ ร้านถูกลบไปแล้ว — ยังบันทึกบิลได้ แค่ไม่ผูกร้าน */
      })
    return () => {
      alive = false
    }
  }, [shopId])

  /* ★ โฟกัสช่องเงินทันทีที่เปิดหน้า — คนเปิดหน้านี้มาเพื่อกรอกยอด */
  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  const others = useMemo(() => people.filter((p) => p.id !== meId), [people, meId])
  const byId = useMemo(() => new Map(others.map((p) => [p.id, p])), [others])

  /*
   * ★★ แถวบนสุดคือคนที่หารด้วยบ่อยที่สุด ตามด้วยคนที่เลือกแล้วแต่ไม่อยู่ในแถว
   *    ★ คนที่เพิ่งเลือกจาก "ดูทุกคน" ต้องยังเห็นว่าถูกเลือกอยู่
   *      ★★ ไม่งั้นเขาจะกดเลือกซ้ำแล้วกลายเป็นยกเลิก
   */
  const quickPeople = useMemo(() => {
    const freq = recent?.frequentPeople ?? []
    const extra = picked.filter((id) => !freq.some((p) => p.id === id)).map((id) => byId.get(id))
    return [...freq, ...extra].filter((p): p is Person => Boolean(p))
  }, [recent, picked, byId])

  /* ★ ร้านจาก URL ขึ้นก่อนเสมอ — มันคือร้านที่ผู้ใช้เพิ่งเลือกมาจากอีกหน้า */
  const shopChips = useMemo(() => {
    const base = recent?.shops ?? []
    if (!urlShop || base.some((s) => s.id === urlShop.id)) return base
    return [urlShop, ...base].slice(0, 6)
  }, [recent, urlShop])

  const split = useMemo(
    () =>
      computeSplit({
        amount: Number(amount) || 0,
        deliveryFee: Number(delivery) || 0,
        discount: Number(discount) || 0,
        others: picked.length,
        includeSelf: prefs.includeSelf,
        rounded: prefs.rounded,
      }),
    [amount, delivery, discount, picked.length, prefs.includeSelf, prefs.rounded],
  )

  const remainder = useMemo(
    () =>
      prefs.splitMode === 'CUSTOM'
        ? customRemainder(
            Number(amount) || 0,
            Number(delivery) || 0,
            Number(discount) || 0,
            picked.map((id) => Number(custom[id]) || 0),
          )
        : 0,
    [prefs.splitMode, amount, delivery, discount, picked, custom],
  )

  function setPref<K extends keyof BillPrefs>(k: K, v: BillPrefs[K]) {
    const next = { ...prefs, [k]: v }
    setPrefs(next)
    savePrefs(next)
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
    setFieldError((f) => ({ ...f, people: '' }))
  }

  function applyAgain() {
    const last = recent?.lastBill
    if (!last) return
    setPicked(last.people.map((p) => p.id))
    if (last.shopId) {
      setShopId(last.shopId)
      setShopName(last.shopName)
    }
    /*
     * ★★★ ไม่คัดลอก split_mode จากบิลเก่า — ตั้งใจ ไม่ใช่ลืม
     *
     *     ★ หน้านี้คำนวณยอดรายคนเองแล้วส่ง splitMode: 'CUSTOM' ไปที่ API เสมอ
     *       (เพราะ RPC หารเองไม่ได้ มันไม่รู้เรื่องค่าส่ง ส่วนลด และการปัดเศษ)
     *       ★★ แปลว่าบิลทุกใบที่สร้างจากหน้านี้ถูกบันทึกเป็น CUSTOM
     *          ไม่ว่าผู้ใช้จะเลือก "หารเท่ากัน" ก็ตาม
     *     ★ ถ้าเอาค่านั้นมาคืนให้ผู้ใช้ จะกลายเป็นว่า "หารแบบครั้งก่อน"
     *       สลับไปโหมดระบุยอดรายคนทุกครั้ง แล้วกดบันทึกไม่ได้เพราะยังไม่กรอกยอด
     *       ★★ วัดเจอตอนขับเบราว์เซอร์จริง: กดแล้วปุ่มบันทึกไม่ตอบสนองเลย
     *          และข้อความบอกเหตุผลถูกซ่อนอยู่ใน "+ เพิ่มรายละเอียด" ที่ยุบอยู่
     *
     *     ★ วิธีหารที่เป็นความตั้งใจของผู้ใช้จริง ๆ อยู่ใน localStorage
     *       ซึ่งจำค่าล่าสุดที่เขา "เลือกเอง" ไว้แล้ว — จึงไม่ต้องแตะอะไรตรงนี้
     */
    amountRef.current?.focus()
  }

  async function uploadReceipt(file: File) {
    setUploading(true)
    setError(null)
    try {
      /* ★ ย่อก่อนส่ง — ใบเสร็จถ่ายจากมือถือใบหนึ่ง 4MB เพื่อรูปที่เปิดดูครั้งเดียว */
      const small = await shrinkImage(file, 1280)
      const form = new FormData()
      form.append('file', small)
      const res = await fetch('/api/office/wallet/receipt', { method: 'POST', body: form })
      const payload = (await res.json()) as
        | { ok: true; data: { path: string } }
        | { ok: false; error: { message: string } }
      if (!payload.ok) throw new Error(payload.error.message)
      setReceiptPath(payload.data.path)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setUploading(false)
    }
  }

  /** ปุ่มบันทึกบอกสิ่งที่ขาด แทนที่จะ disable เงียบ ๆ */
  const missing = !Number(amount) ? 'amount' : picked.length === 0 ? 'people' : null

  async function submit() {
    if (busy) return

    /* ★ error ขึ้นใต้ช่องที่ผิด ไม่ใช่ popup — ข้อกำหนดระบุไว้ชัด */
    if (!Number(amount)) {
      setFieldError({ amount: ot('wallet.create.needAmount') })
      amountRef.current?.focus()
      return
    }
    if (picked.length === 0) {
      setFieldError({ people: ot('wallet.create.needPeople') })
      return
    }
    if (prefs.splitMode === 'CUSTOM' && remainder !== 0) {
      /*
       * ★★★ กาง "+ เพิ่มรายละเอียด" ให้เอง — ข้อความผิดพลาดอยู่ข้างใน
       *
       *     ★ ข้อกำหนดบอกว่า error ต้องแสดงใต้ช่องที่ผิด "ทันที"
       *       ★★ แต่ช่องนั้นอยู่ในส่วนที่ยุบไว้เป็นค่าเริ่มต้น
       *          ★ ผลที่วัดได้: กดบันทึกแล้วไม่มีอะไรเกิดขึ้นเลยสักอย่าง
       *            ไม่มี error ไม่มีการเปลี่ยนหน้า — อ่านเป็น "ปุ่มเสีย"
       */
      setOpen(true)
      setFieldError({
        custom:
          remainder > 0
            ? ot('wallet.create.leftOver', { amount: `฿${formatBaht(locale, toBaht(remainder))}` })
            : ot('wallet.create.overBy', { amount: `฿${formatBaht(locale, toBaht(-remainder))}` }),
      })
      return
    }

    setBusy(true)
    setError(null)
    setFieldError({})

    const shares =
      prefs.splitMode === 'CUSTOM'
        ? picked.map((id) => ({ userId: id, amount: Number(custom[id]) || 0 }))
        : picked.map((id, i) => ({ userId: id, amount: toBaht(split.othersSatang[i] ?? 0) }))

    try {
      await apiFetch('/api/office/wallet', {
        method: 'POST',
        body: {
          /* ★ ชื่อรายการไม่บังคับ — ตั้งให้เองจากร้านหรือวันที่ */
          title: title.trim() || shopName || ot('wallet.create.titleAuto', { date: billDate }),
          total: toBaht(split.totalSatang),
          category,
          billDate,
          receiptPath,
          /*
           * ★★ ส่ง CUSTOM เสมอ ไม่ว่าจะเลือกโหมดไหน
           *    ★ เราคำนวณยอดรายคนเองฝั่ง client แล้ว (เป็นสตางค์ integer)
           *      ★★ ถ้าส่ง EQUAL ให้ RPC หารเอง มันจะหารด้วยกฎของตัวเอง
           *         ซึ่งไม่รู้เรื่องค่าส่ง ส่วนลด และการปัดเศษ — ยอดจะไม่ตรง
           *         กับที่ผู้ใช้เห็นบนจอตอนกดบันทึก
           */
          splitMode: 'CUSTOM',
          includeSelf: prefs.includeSelf,
          shares,
          restaurantId: shopId,
          deliveryFee: Number(delivery) || 0,
          discount: Number(discount) || 0,
          rounded: prefs.rounded,
        },
      })

      /*
       * ★ ถามเรื่องกลุ่มหลังบันทึกสำเร็จ ไม่ใช่ก่อน
       *   ★★ ตอนก่อนบันทึกผู้ใช้กำลังรีบ — คำถามที่ขวางทางคือคำถามที่ถูกกดข้าม
       */
      const key = [...picked].sort().join(',')
      const suggest = recent?.suggestGroup ? [...recent.suggestGroup].sort().join(',') : null
      if (suggest && key === suggest) {
        setAskGroup(true)
        setBusy(false)
        return
      }

      finish()
    } catch (e) {
      setError(officeErrorText(e, ot))
      setBusy(false)
    }
  }

  function finish() {
    showToast(ot('wallet.create.savedToast', { n: picked.length }))

    /*
     * ★★★ บิลที่ระบุร้าน → ชวนโหวตให้ร้านนั้น (เฟส 5.2)
     *
     *     ★ ข้อกำหนดเขียนว่า "รีวิวร้านนี้" ★★ แต่ระบบไม่มีรีวิว มีแต่โหวต
     *        ★ จึงชวนโหวตแทน ซึ่งเป็นการให้ความเห็นเรื่องร้านเหมือนกัน
     *          และใช้ของที่มีอยู่แล้วโดยไม่ต้องสร้างฟีเจอร์ใหม่
     *     ★ ไม่ถามซ้ำถ้าโหวตร้านนี้ไปแล้วใน 7 วัน — เก็บใน localStorage
     *       ★★ เก็บฝั่งเครื่องพอ เพราะมันเป็นเรื่อง "เคยถูกถามไปแล้วไหม"
     *          ไม่ใช่ข้อมูลที่ต้องตรงกันข้ามเครื่อง
     */
    if (shopId && !askedRecently(shopId)) {
      markAsked(shopId)
      setVoteShop(shopId)
      return
    }

    /* ★ หน่วงให้ toast ทันขึ้น แล้วค่อยพาไปหน้ายอดค้างตามข้อกำหนด */
    window.setTimeout(() => router.push('/office/wallet/owed'), 600)
  }

  async function voteShop_() {
    if (!voteShop) return
    try {
      await apiFetch(`/api/office/food/restaurants/${voteShop}`, {
        method: 'POST',
        body: { action: 'vote' },
      })
    } catch {
      /* ★ โหวตไม่สำเร็จไม่ควรบังบิลที่บันทึกไปแล้ว */
    }
    setVoteShop(null)
    router.push('/office/wallet/owed')
  }

  async function saveGroup() {
    if (!groupName.trim()) return
    try {
      await apiFetch('/api/office/wallet/groups', {
        method: 'POST',
        body: { action: 'save', name: groupName.trim(), memberIds: picked },
      })
      showToast(ot('wallet.create.groupSaved'))
    } catch {
      /* ★ บันทึกกลุ่มไม่สำเร็จไม่ควรบังบิลที่บันทึกไปแล้ว */
    }
    setAskGroup(false)
    finish()
  }

  const shopList = useMemo(() => {
    const q = shopQuery.trim().toLowerCase()
    if (!q) return recent?.shops ?? []
    return (recent?.shops ?? []).filter((s) => s.name.toLowerCase().includes(q))
  }, [recent, shopQuery])

  const allList = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? others.filter((p) => `${p.name} ${p.department ?? ''}`.toLowerCase().includes(q)) : others
  }, [others, query])

  return (
    <div className="max-w-xl pb-28">
      {/* ── 1 · หารแบบครั้งก่อน ──────────────────────────────── */}
      {recent?.lastBill && recent.lastBill.people.length > 0 ? (
        <button
          type="button"
          onClick={applyAgain}
          /*
           * ★★★ ปุ่มเดียวที่เติมคน ร้าน และวิธีหารให้ครบ
           *     ★ ข้อกำหนด: กรอกยอดแล้วกดบันทึก = 3 แตะ
           *       ★★ แตะ 1 ปุ่มนี้ · แตะ 2 ช่องเงิน (พิมพ์) · แตะ 3 บันทึก
           */
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-accent/35 bg-accent/5 p-3 text-start transition-colors hover:bg-accent/10"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              <Untranslated>{ot('wallet.create.again')}</Untranslated>
            </span>
            <span dir="auto" className="block truncate text-[12px] text-ink-soft">
              {recent.lastBill.shopName
                ? ot('wallet.create.againWith', {
                    names: recent.lastBill.people.map((p) => p.name).join(', '),
                    shop: recent.lastBill.shopName,
                  })
                : ot('wallet.create.againNoShop', {
                    names: recent.lastBill.people.map((p) => p.name).join(', '),
                  })}
            </span>
          </span>
        </button>
      ) : null}

      {/* ── 2 · ยอดรวม ───────────────────────────────────────── */}
      <div className="mt-4">
        <label htmlFor="amt" className="block text-sm font-medium text-ink">
          <Untranslated>{ot('wallet.create.total')}</Untranslated>
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 focus-within:border-accent">
          <span className="text-2xl font-bold text-ink-faint">฿</span>
          <input
            ref={amountRef}
            id="amt"
            value={amount}
            onChange={(e) => {
              /* ★ รับเฉพาะตัวเลขกับจุด — คีย์บอร์ดบางตัวยังส่งอักษรมาได้ */
              const v = e.target.value.replace(/[^\d.]/g, '')
              setAmount(v)
              setFieldError((f) => ({ ...f, amount: '' }))
            }}
            /* ★★ inputmode="decimal" เปิดคีย์บอร์ดตัวเลขบนมือถือ
                 ★ type="number" จะได้ลูกศรขึ้นลงที่ไม่มีใครใช้ และ
                   เลื่อนเมาส์ทับแล้วค่าเปลี่ยนเองโดยไม่ตั้งใจ */
            inputMode="decimal"
            placeholder="0"
            aria-describedby="amtHint"
            className="min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        {fieldError.amount ? (
          <p className="mt-1 text-xs text-danger">{fieldError.amount}</p>
        ) : (
          <p id="amtHint" className="mt-1 text-xs text-ink-faint">
            <Untranslated>{ot('wallet.create.amountHint')}</Untranslated>
          </p>
        )}
      </div>

      {/* ── 3 · ร้าน ─────────────────────────────────────────── */}
      <div className="mt-5">
        <p className="text-sm font-medium text-ink">
          <Untranslated>{ot('wallet.create.shop')}</Untranslated>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shopChips.map((s) => (
            <Chip
              key={s.id}
              active={shopId === s.id}
              onClick={() => {
                const on = shopId === s.id
                setShopId(on ? null : s.id)
                setShopName(on ? null : s.name)
                /* ★ ร้านกาแฟ → เดาประเภทเป็นกาแฟให้เลย (ข้อกำหนด 2.7) */
                if (!on && /กาแฟ|coffee|cafe/i.test(`${s.name} ${s.cuisine ?? ''}`)) setCategory('COFFEE')
              }}
            >
              <span dir="auto">{s.name}</span>
            </Chip>
          ))}
          <Chip active={shopSearch} onClick={() => setShopSearch((v) => !v)}>
            <Untranslated>{ot('wallet.create.shopSearch')}</Untranslated>
          </Chip>
        </div>

        {shopSearch ? (
          <div className="mt-2">
            <Input
              radius="round"
              value={shopQuery}
              onChange={(e) => setShopQuery(e.target.value)}
              placeholder={ot('wallet.create.shopSearch')}
              aria-label={ot('wallet.create.shopSearch')}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {shopList.map((s) => (
                <Chip
                  key={s.id}
                  active={shopId === s.id}
                  onClick={() => {
                    setShopId(s.id)
                    setShopName(s.name)
                    setShopSearch(false)
                  }}
                >
                  <span dir="auto">{s.name}</span>
                </Chip>
              ))}
              {/* ★ ร้านที่ยังไม่มีในระบบ — ใช้เป็นชื่อบิลได้ แต่ไม่ผูก restaurant_id */}
              {shopQuery.trim() && !shopList.some((s) => s.name === shopQuery.trim()) ? (
                <Chip
                  active={false}
                  onClick={() => {
                    setShopId(null)
                    setShopName(shopQuery.trim())
                    setShopSearch(false)
                  }}
                >
                  <Untranslated>{ot('wallet.create.shopNew', { name: shopQuery.trim() })}</Untranslated>
                </Chip>
              ) : null}
            </div>
          </div>
        ) : null}

        {shopName && !shopId ? (
          <p dir="auto" className="mt-1.5 text-xs text-ink-soft">
            {shopName}
          </p>
        ) : null}
      </div>

      {/* ── 4 · คนที่หาร ─────────────────────────────────────── */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">
            <Untranslated>{ot('wallet.create.people')}</Untranslated>
          </p>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            /* ★ สูง 44px ตามข้อกำหนด — ลิงก์ตัวเล็กที่สูง 16px กดพลาดตลอดบนมือถือ */
            className="-my-2 min-h-11 px-2 text-xs text-link hover:underline"
          >
            <Untranslated>{ot('wallet.create.seeAll')}</Untranslated>
          </button>
        </div>

        {/* กลุ่มที่บันทึกไว้ */}
        {(recent?.groups ?? []).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recent!.groups.map((g) => (
              <Chip
                key={g.id}
                active={g.memberIds.every((id) => picked.includes(id)) && g.memberIds.length === picked.length}
                onClick={() => setPicked(g.memberIds)}
              >
                <span dir="auto">{g.name}</span>
              </Chip>
            ))}
          </div>
        ) : null}

        {/*
          * ★★ วงกลมใหญ่แตะเลือก ไม่ใช่ checkbox
          *    ★ ข้อกำหนดระบุชัด และเหตุผลคือเป้ากด 56px กับ 16px ต่างกันมาก
          *      เมื่อยืนกดด้วยนิ้วโป้งข้างเดียว
          */}
        <div className="mt-2 flex flex-wrap gap-2">
          {quickPeople.map((p) => {
            const on = picked.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                className="flex w-16 flex-col items-center gap-1"
              >
                <span
                  className={cn(
                    'relative grid place-items-center rounded-full p-0.5 transition-colors',
                    on ? 'bg-accent' : 'bg-transparent',
                  )}
                >
                  <ChatAvatar name={p.name} url={p.avatarUrl} size={48} />
                  {on ? (
                    <span className="absolute -bottom-0.5 -inset-e-0.5 grid size-5 place-items-center rounded-full bg-accent text-accent-ink">
                      <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    </span>
                  ) : null}
                </span>
                <span dir="auto" className={cn('w-full truncate text-center text-[11px]', on ? 'font-semibold text-ink' : 'text-ink-soft')}>
                  {p.name}
                </span>
              </button>
            )
          })}
        </div>

        {showAll ? (
          <div className="mt-2 rounded-2xl border border-line bg-elevated/40 p-3">
            <Input
              radius="round"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ot('wallet.create.search')}
              aria-label={ot('wallet.create.search')}
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {allList.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-faint">{ot('wallet.create.noMatch')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {allList.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      aria-pressed={picked.includes(p.id)}
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-start transition-colors',
                        picked.includes(p.id) ? 'bg-accent/15' : 'hover:bg-surface',
                      )}
                    >
                      <ChatAvatar name={p.name} url={p.avatarUrl} size={28} />
                      <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-soft">{ot('wallet.create.picked', { n: picked.length })}</p>

          {/* ★ "ฉันร่วมจ่ายด้วย" อยู่ในส่วนนี้ และจำค่าล่าสุด */}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={prefs.includeSelf}
              onChange={(e) => setPref('includeSelf', e.target.checked)}
              className="size-4 accent-(--color-accent)"
            />
            {ot('wallet.create.includeSelf')}
          </label>
        </div>

        {fieldError.people ? <p className="mt-1 text-xs text-danger">{fieldError.people}</p> : null}
      </div>

      {/* ── 5 · สรุปยอดต่อคน ─────────────────────────────────── */}
      {picked.length > 0 && Number(amount) > 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-elevated/50 p-4">
          <p className="text-[22px] font-bold text-ink">
            <Untranslated>
              {ot('wallet.create.summaryHead', {
                n: picked.length + (prefs.includeSelf ? 1 : 0),
                each: `฿${formatBaht(locale, toBaht(split.perHeadSatang))}`,
              })}
            </Untranslated>
          </p>
          {prefs.includeSelf ? (
            <p className="mt-0.5 text-xs text-ink-soft">
              {ot('wallet.create.myShare')} ฿{formatBaht(locale, toBaht(split.mineSatang))}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── 6 · เพิ่มรายละเอียด ──────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-1 text-start"
      >
        <span className="text-sm font-medium text-link">
          + <Untranslated>{ot('wallet.create.more')}</Untranslated>
        </span>
        {/* ★ สรุปสั้น ๆ ตอนยุบ ถ้ากรอกอะไรไปแล้ว (ข้อกำหนด 2.7) */}
        {!open ? (
          <span dir="auto" className="truncate text-xs text-ink-faint">
            {[
              billDate !== todayIso() ? billDate : '',
              Number(delivery) ? `${ot('wallet.create.delivery')} ฿${delivery}` : '',
              Number(discount) ? `${ot('wallet.create.discount')} ฿${discount}` : '',
              receiptPath ? ot('wallet.create.receiptDone') : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mt-2 flex flex-col gap-4 rounded-2xl border border-line bg-elevated/30 p-4">
          <Field label={ot('wallet.create.billTitle')}>
            <Input
              radius="round"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              dir="auto"
              placeholder={shopName ?? ot('wallet.create.titleAuto', { date: billDate })}
            />
          </Field>

          <Field label={ot('wallet.create.category')}>
            <div className="flex flex-wrap gap-1.5">
              {(['FOOD', 'COFFEE', 'OTHER'] as const).map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {/* ★ ใช้ categoryLabel ของโมดูล ไม่ประกอบชื่อกุญแจเอง
                        ★★ ผมเดาว่าเป็น wallet.cat.* แต่ของจริงคือ wallet.category.*
                           แล้วชิปโชว์คำว่า "wallet.cat.FOOD" ออกจอ
                           ★ ตัวประกอบชื่อกุญแจเองไม่มีอะไรมาจับผิดให้ตอนคอมไพล์ */}
                  {categoryLabel(ot, c)}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label={ot('wallet.create.date')} error={fieldError.date}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={billDate === todayIso()} onClick={() => setBillDate(todayIso())}>
                <Untranslated>{ot('wallet.create.today')}</Untranslated>
              </Chip>
              <Chip active={billDate === yesterdayIso()} onClick={() => setBillDate(yesterdayIso())}>
                <Untranslated>{ot('wallet.create.yesterday')}</Untranslated>
              </Chip>
              <input
                type="date"
                value={billDate}
                /* ★ ห้ามเลือกวันในอนาคต — บังคับที่ input ด้วย ไม่ใช่เช็กตอนกดบันทึก */
                max={todayIso()}
                onChange={(e) => {
                  if (e.target.value > todayIso()) {
                    setFieldError((f) => ({ ...f, date: ot('wallet.create.noFuture') }))
                    return
                  }
                  setFieldError((f) => ({ ...f, date: '' }))
                  setBillDate(e.target.value)
                }}
                className="h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              />
            </div>
          </Field>

          <Field label={ot('wallet.create.splitLabel')}>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={prefs.splitMode === 'EQUAL'} onClick={() => setPref('splitMode', 'EQUAL')}>
                {ot('wallet.create.splitEqual')}
              </Chip>
              <Chip active={prefs.splitMode === 'CUSTOM'} onClick={() => setPref('splitMode', 'CUSTOM')}>
                {ot('wallet.create.splitCustom')}
              </Chip>
            </div>
          </Field>

          {prefs.splitMode === 'CUSTOM' && picked.length > 0 ? (
            <div>
              {picked.map((id) => (
                <div key={id} className="flex items-center gap-2 py-1">
                  <ChatAvatar name={byId.get(id)?.name ?? '—'} url={byId.get(id)?.avatarUrl ?? null} size={28} />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-ink">
                    {byId.get(id)?.name ?? '—'}
                  </span>
                  <input
                    value={custom[id] ?? ''}
                    onChange={(e) =>
                      setCustom((c) => ({ ...c, [id]: e.target.value.replace(/[^\d.]/g, '') }))
                    }
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={byId.get(id)?.name ?? ''}
                    className="h-11 w-24 rounded-xl border border-line bg-surface px-3 text-end text-sm tabular-nums text-ink"
                  />
                </div>
              ))}
              {/*
                * ★ ยอดครบพอดีบอกด้วยเครื่องหมายถูก ไม่ใช่ "เหลืออีก ฿0.00"
                *   ★★ ประโยคที่บอกว่าเหลือศูนย์ อ่านเป็นคำเตือนที่ยังค้างอยู่
                *      ★ คนจะมองหาว่ายังขาดอะไร ทั้งที่กรอกครบแล้ว
                */}
              <p className={cn('mt-1 text-xs', remainder === 0 ? 'text-ink-soft' : 'text-warn')}>
                {remainder === 0
                  ? `✓ ฿${formatBaht(locale, toBaht(split.totalSatang))}`
                  : remainder > 0
                    ? ot('wallet.create.leftOver', { amount: `฿${formatBaht(locale, toBaht(remainder))}` })
                    : ot('wallet.create.overBy', { amount: `฿${formatBaht(locale, toBaht(-remainder))}` })}
              </p>
              {fieldError.custom ? <p className="mt-1 text-xs text-danger">{fieldError.custom}</p> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={ot('wallet.create.delivery')}>
              <input
                value={delivery}
                onChange={(e) => setDelivery(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                aria-label={ot('wallet.create.delivery')}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm tabular-nums text-ink"
              />
            </Field>
            <Field label={ot('wallet.create.discount')}>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                aria-label={ot('wallet.create.discount')}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm tabular-nums text-ink"
              />
            </Field>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={prefs.rounded}
              onChange={(e) => setPref('rounded', e.target.checked)}
              className="size-4 accent-(--color-accent)"
            />
            <Untranslated>{ot('wallet.create.roundUp')}</Untranslated>
          </label>

          <div>
            {/* ★ capture="environment" เปิดกล้องหลังเลย — แต่ยังเลือกจากคลังได้
                 ★★ ถ้าผู้ใช้ไม่อนุญาตกล้อง เบราว์เซอร์จะถอยไปหน้าเลือกไฟล์เอง */}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadReceipt(f)
                e.target.value = ''
              }}
            />
            <Button
              variant="secondary"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
              className="min-h-11"
            >
              <Untranslated>
                {receiptPath ? ot('wallet.create.receiptDone') : ot('wallet.create.receiptAdd')}
              </Untranslated>
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── 7 · ปุ่มบันทึก (ติดล่างจอ) ───────────────────────── */}
      {/*
        * ★★ sticky ไม่ใช่ fixed — fixed จะลอยทับเนื้อหาตอนเลื่อนสุดล่าง
        *    ★ sticky bottom-0 หยุดอยู่ท้ายฟอร์มพอดีเมื่อเลื่อนถึง
        *    ★★ pb-28 ที่ตัวหน้าเผื่อที่ให้ปุ่มไม่ทับช่องสุดท้าย
        */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t border-line bg-page/95 px-4 py-3 backdrop-blur-md">
        <Button
          variant="primary"
          loading={busy}
          onClick={submit}
          className="h-12 w-full text-base"
        >
          <Untranslated>
            {missing === 'amount'
              ? ot('wallet.create.needAmount')
              : missing === 'people'
                ? ot('wallet.create.needPeople')
                : ot('wallet.create.submit')}
          </Untranslated>
        </Button>
      </div>

      {/* ── ถามว่าบันทึกเป็นกลุ่มไหม ─────────────────────────── */}
      {askGroup ? (
        <div className="fixed inset-0 z-70 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-elevated p-5">
            <p className="text-base font-semibold text-ink">
              <Untranslated>{ot('wallet.create.saveGroup')}</Untranslated>
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              <Untranslated>{ot('wallet.create.saveGroupHint')}</Untranslated>
            </p>
            <Input
              radius="round"
              className="mt-3"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={40}
              dir="auto"
              placeholder={ot('wallet.create.groupName')}
              aria-label={ot('wallet.create.groupName')}
            />
            <div className="mt-4 flex gap-2">
              <Button variant="primary" className="min-h-11 flex-1" onClick={saveGroup}>
                {ot('common.save')}
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => { setAskGroup(false); finish() }}>
                <Untranslated>{ot('wallet.create.skip')}</Untranslated>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── ชวนโหวตร้านหลังบันทึกบิล ─────────────────────────── */}
      {voteShop ? (
        <div className="fixed inset-x-4 bottom-4 z-70 mx-auto max-w-sm rounded-2xl border border-line bg-elevated p-4 shadow-2xl">
          <p className="text-sm font-medium text-ink">
            <Untranslated>{ot('wallet.create.savedToast', { n: picked.length })}</Untranslated>
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="primary" className="min-h-11 flex-1" onClick={voteShop_}>
              <Untranslated>{ot('food.voteThis')}</Untranslated>
            </Button>
            {/* ★ ข้ามได้เสมอ — การชวนที่ปิดไม่ได้คือการบังคับ */}
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setVoteShop(null)
                router.push('/office/wallet/owed')
              }}
            >
              <Untranslated>{ot('wallet.create.skip')}</Untranslated>
            </Button>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} />
    </div>
  )
}

/* ── จำว่าเคยชวนโหวตร้านไหนไปแล้วเมื่อไหร่ ───────────────────── */
const ASK_KEY = 'awa:voted-ask'
const ASK_DAYS = 7

function askedRecently(shopId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(ASK_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const at = map[shopId]
    return typeof at === 'number' && Date.now() - at < ASK_DAYS * 86_400_000
  } catch {
    /* ★ อ่านไม่ได้ = ถือว่าเคยถามแล้ว ★★ ชวนซ้ำน่ารำคาญกว่าไม่ได้ชวน */
    return true
  }
}

function markAsked(shopId: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(ASK_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    map[shopId] = Date.now()
    window.localStorage.setItem(ASK_KEY, JSON.stringify(map))
  } catch {
    /* ★ เขียนไม่ได้ (โหมดส่วนตัว) — ไม่ใช่เรื่องที่ต้องบอกผู้ใช้ */
  }
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayIso(): string {
  const d = new Date(Date.now() - 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-soft">{label}</p>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      /* ★ สูง 44px ตามข้อกำหนด — จุดแตะทุกจุดต้องกดโดนด้วยนิ้วโป้ง */
      className={cn(
        'min-h-11 rounded-full px-3.5 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
