'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast, useToast } from '@/components/ui/Toast'
import { Toggle } from '@/components/ui/Toggle'
import { useConfirm } from '@/components/ConfirmProvider'
import { DatePicker, todayIso } from '@/components/ui/DatePicker'
import { Section } from '@/components/ui/Section'
import { cuisineStyle } from '@/lib/office/cuisine'
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
type Shop = {
  id: string
  name: string
  cuisine: string | null
  /* ★ ทั้งสี่ตัวเป็น optional — API ถอยไปคอลัมน์พื้นฐานได้เมื่อ migration
       ยังไม่ขึ้น หน้าเว็บจึงต้องรับกรณีที่ไม่มีค่าได้โดยไม่พัง */
  rating?: number | null
  ratingCount?: number
  voteCount?: number
  walkMin?: number | null
  recent?: boolean
}
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
  const confirm = useConfirm()

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
  const [query, setQuery] = useState('')
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
       *       ★★ เดิมช่องนั้นอยู่ในส่วนที่ยุบไว้ จึงต้องสั่งกางก่อน
       *          ★ ตอนนี้รายละเอียดกางอยู่ตลอด — ข้อความจึงไปโผล่ที่ช่องเลย
       */
      setFieldError({
        custom:
          remainder > 0
            ? ot('wallet.create.leftOver', { amount: `฿${formatBaht(locale, toBaht(remainder))}` })
            : ot('wallet.create.overBy', { amount: `฿${formatBaht(locale, toBaht(-remainder))}` }),
      })
      return
    }

    /* ★ ถามก่อนสร้างบิล — หลังตรวจช่องผ่านแล้ว ฟอร์มที่ผิดยังขึ้นแดงตามเดิมโดยไม่มีกล่อง */
    const billTitle = title.trim() || shopName || ot('wallet.create.titleAuto', { date: billDate })
    if (!(await confirm({ kind: 'create', subject: billTitle }))) return

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
          title: billTitle,
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

  /*
   * ร้านที่แสดงเป็นการ์ด
   *
   * ★ ร้านจาก URL ขึ้นก่อนเสมอ — มันคือร้านที่ผู้ใช้เพิ่งเลือกมาจากอีกหน้า
   *   ★★ และร้านที่เลือกไว้แล้วต้องไม่หายไปตอนพิมพ์ค้นหาคำอื่น
   *      ★ ไม่งั้นคนจะคิดว่าการเลือกถูกยกเลิก แล้วกดเลือกใหม่ซ้ำ
   */
  const shopCards = useMemo(() => {
    const base = recent?.shops ?? []
    const all = urlShop && !base.some((x) => x.id === urlShop.id) ? [urlShop, ...base] : base
    const q = shopQuery.trim().toLowerCase()
    if (!q) return all.slice(0, 6)
    const hit = all.filter((x) => `${x.name} ${x.cuisine ?? ''}`.toLowerCase().includes(q))
    const chosen = all.find((x) => x.id === shopId)
    return chosen && !hit.some((x) => x.id === chosen.id) ? [chosen, ...hit] : hit
  }, [recent, urlShop, shopQuery, shopId])

  /*
   * รายชื่อคน — คนที่เลือกแล้วลอยขึ้นต้นตาราง
   *
   * ★★ รายชื่อสามสิบคนที่คนเลือกไว้กระจัดกระจาย ทำให้ตรวจทานก่อนกดบันทึก
   *    ไม่ได้เลย ★ ต้องเลื่อนขึ้นลงนับเองว่าครบไหม
   *    ★★ การดันขึ้นมาข้างบนทำให้ "ใครอยู่ในบิลนี้" อ่านได้ในหน้าจอเดียว
   */
  /** หารกี่คนจริง ๆ — รวมตัวเองด้วยถ้าเปิดสวิตช์ไว้ */
  const headcount = picked.length + (prefs.includeSelf ? 1 : 0)

  const peopleList = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? others.filter((x) => `${x.name} ${x.department ?? ''}`.toLowerCase().includes(q))
      : others
    const on = base.filter((x) => picked.includes(x.id))
    const off = base.filter((x) => !picked.includes(x.id))
    return [...on, ...off]
  }, [others, query, picked])

  return (
    /*
     * ★★★ สองคอลัมน์บนจอกว้าง: ฟอร์มซ้าย · สรุปที่เกาะอยู่ขวา
     *
     *     ★ ของเดิมเป็นคอลัมน์เดียวกว้าง 576px ในหน้าที่กว้าง 1000px
     *       แล้ว "สรุปยอดต่อคน" อยู่กลางฟอร์ม ★★ พอเลื่อนลงไปกรอก
     *       รายละเอียด ตัวเลขที่กำลังปรับก็หลุดออกนอกจอไปแล้ว
     *     ★★ สรุปที่เกาะอยู่ทำให้เห็นผลของทุกการกดทันที ซึ่งคือทั้งหมด
     *        ของการหารเงิน — คนปรับตัวเลขจนกว่าจะพอใจกับผลลัพธ์
     *     ★ บนมือถือยุบเป็นคอลัมน์เดียวเหมือนเดิม และปุ่มบันทึกยังติดขอบล่าง
     */
    <div className="w-full pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:pb-10">
      <div className="min-w-0">
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

      {/*
        * ── 3 · ร้าน ───────────────────────────────────────────
        *
        * ★★★ จากชิปกลม ๆ เรียงกัน → การ์ดที่มีรูปและคำอธิบาย
        *
        *     ★ ชิปบอกได้แค่ชื่อ ★★ ร้านสองร้านที่ชื่อคล้ายกันจึงแยกไม่ออก
        *       และคนที่ยังไม่เคยสั่งร้านนั้นไม่รู้ว่ามันขายอะไร
        *     ★ การ์ดมีที่ให้ประเภทอาหาร ซึ่งเป็นสิ่งที่คนใช้ตัดสินใจจริง
        *
        * ★★ ช่องค้นหาเปิดอยู่เสมอ ไม่ใช่ชิป "ค้นหา" ที่ต้องกดก่อน
        *    ★ ร้านในระบบมีหลายสิบ แต่ชิปลัดแสดงได้ไม่กี่ร้าน
        *      ★★ การซ่อนช่องค้นหาไว้หลังปุ่ม แปลว่าร้านที่เหลือทั้งหมด
        *         ต้องกดสองครั้งถึงจะหาเจอ
        */}
      <Section
        collapsible
        title={<Untranslated>{ot('wallet.create.shop')}</Untranslated>}
        hint={<Untranslated>{ot('wallet.create.shopHint')}</Untranslated>}
        /* ★ หุบแล้วยังเห็นว่าเลือกร้านไหนไว้ — ไม่ต้องกางออกมาตรวจ */
        summary={shopName ? <span dir="auto">{shopName}</span> : undefined}
      >
        <div>
          <Input
            radius="round"
            value={shopQuery}
            onChange={(e) => setShopQuery(e.target.value)}
            placeholder={ot('wallet.create.shopSearch')}
            aria-label={ot('wallet.create.shopSearch')}
          />
        </div>

        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {shopCards.map((shop) => {
            const on = shopId === shop.id
            /* ★ ไอคอนและสีมาจากโมดูลกลาง หน้าร้านเด็ดจะได้ใช้ชุดเดียวกัน */
            const style = cuisineStyle(shop.name, shop.cuisine)
            return (
              <button
                key={shop.id}
                type="button"
                aria-pressed={on}
                style={{ '--s': style.tint } as React.CSSProperties}
                onClick={() => {
                  const off = shopId === shop.id
                  setShopId(off ? null : shop.id)
                  setShopName(off ? null : shop.name)
                  /* ★ ร้านกาแฟ → เดาประเภทเป็นกาแฟให้เลย (ข้อกำหนด 2.7) */
                  if (!off && /กาแฟ|coffee|cafe/i.test(`${shop.name} ${shop.cuisine ?? ''}`)) {
                    setCategory('COFFEE')
                  }
                }}
                className={cn(
                  'group relative flex min-h-11 items-start gap-3 overflow-hidden rounded-2xl border p-3 text-start',
                  'transition-all duration-200',
                  on
                    ? 'border-[rgb(var(--s)/0.55)] bg-[rgb(var(--s)/0.08)]'
                    : 'border-line bg-elevated/50 hover:-translate-y-0.5 hover:border-[rgb(var(--s)/0.4)] hover:bg-surface',
                )}
              >
                {/* ★ แสงจางสีประจำประเภท — ติดอยู่ตลอด ไม่ใช่โผล่ตอนชี้
                    ★★ การ์ดที่มีสีเฉพาะตอนเอาเมาส์ไปชี้ คือการ์ดที่บนมือถือ
                       ไม่มีสีเลยตลอดกาล */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(120% 90% at 100% 0%, rgb(var(--s) / 0.10), transparent 60%)',
                  }}
                />

                <span
                  aria-hidden="true"
                  className={cn(
                    'relative grid size-11 shrink-0 place-items-center rounded-xl',
                    'text-[rgb(var(--s))] ring-1 ring-[rgb(var(--s)/0.3)]',
                    'transition-transform duration-300 group-hover:scale-110',
                  )}
                  style={{
                    background:
                      'linear-gradient(145deg, rgb(var(--s) / 0.22), rgb(var(--s) / 0.08))',
                  }}
                >
                  <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d={style.icon} />
                  </svg>
                </span>

                <span className="relative min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span dir="auto" className="min-w-0 truncate text-[13.5px] font-semibold text-ink">
                      {shop.name}
                    </span>
                    {/* ★ "เคยสั่ง" แยกร้านที่เรารู้จักออกจากร้านที่ระบบแนะนำ */}
                    {shop.recent ? (
                      <span className="shrink-0 rounded-full bg-[rgb(var(--s)/0.16)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-[rgb(var(--s))]">
                        <Untranslated>{ot('wallet.create.shopRecent')}</Untranslated>
                      </span>
                    ) : null}
                  </span>

                  {/*
                    * ★★ บรรทัดรายละเอียด — ประเภท · เดินกี่นาที · คะแนน · หัวใจ
                    *    ★ ของเดิมมีแค่ประเภท ซึ่งตอบไม่ได้ว่า "ไกลไหม" กับ
                    *      "คนอื่นว่าดีไหม" ★★ สองข้อนั้นคือสิ่งที่คนใช้เลือกร้านจริง
                    *    ★ ตัวที่ไม่มีข้อมูลก็หายไปเอง ไม่ใช่ขึ้นเป็นขีด
                    */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint">
                    {shop.cuisine ? (
                      <span dir="auto" className="min-w-0 truncate">
                        {shop.cuisine}
                      </span>
                    ) : null}
                    {shop.walkMin ? (
                      <span className="inline-flex items-center gap-0.5">
                        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11 22l1.5-6-2.5-2.5V9l4 2 2 3M9 22l2-5" />
                        </svg>
                        {ot('wallet.create.walkMin', { n: shop.walkMin })}
                      </span>
                    ) : null}
                    {shop.rating ? (
                      <span className="inline-flex items-center gap-0.5 text-warn">
                        <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
                          <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />
                        </svg>
                        <span className="tabular-nums">{shop.rating.toFixed(1)}</span>
                      </span>
                    ) : null}
                    {shop.voteCount ? (
                      <span className="inline-flex items-center gap-0.5">
                        <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
                          <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
                        </svg>
                        <span className="tabular-nums">{shop.voteCount}</span>
                      </span>
                    ) : null}
                  </span>
                </span>

                {on ? (
                  <span aria-hidden="true" className="relative mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[rgb(var(--s))] text-white">
                    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                ) : null}
              </button>
            )
          })}

          {/*
            * ★ ร้านที่ยังไม่มีในระบบ — ใช้เป็นชื่อบิลได้ แต่ไม่ผูก restaurant_id
            *   ★★ เส้นประบอกว่ามันคนละชนิดกับการ์ดร้านจริงข้าง ๆ
            */}
          {shopQuery.trim() && !shopCards.some((x) => x.name === shopQuery.trim()) ? (
            <button
              type="button"
              onClick={() => {
                setShopId(null)
                setShopName(shopQuery.trim())
              }}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-2xl border border-dashed p-3 text-start transition-colors',
                shopName === shopQuery.trim() && !shopId
                  ? 'border-accent/50 bg-accent/8'
                  : 'border-line hover:border-line-strong hover:bg-surface',
              )}
            >
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-ink-soft">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                <Untranslated>{ot('wallet.create.shopNew', { name: shopQuery.trim() })}</Untranslated>
              </span>
            </button>
          ) : null}
        </div>

        {shopName && !shopId ? (
          <p dir="auto" className="mt-2 text-xs text-ink-soft">
            {shopName}
          </p>
        ) : null}
      </Section>

      {/*
        * ── 4 · ผู้ร่วมจ่าย ────────────────────────────────────
        *
        * ★★★ รื้อทั้งส่วน — ของเดิมแยกเป็นสี่ก้อนที่ไม่รู้จักกัน
        *
        *     ชิปกลุ่ม · วงกลมคนที่คุยบ่อย · ลิงก์ "ดูทั้งหมด" ที่เปิดกล่อง
        *     ค้นหาอีกชั้น · และช่องติ๊ก "ฉันร่วมจ่ายด้วย" ลอยอยู่ล่างสุด
        *     ★ คนที่หาคนที่ไม่อยู่ในวงกลมสิบคนแรก ต้องกด "ดูทั้งหมด"
        *       แล้วพิมพ์ในกล่องที่เพิ่งโผล่ ★★ สองจังหวะเพื่อทำสิ่งเดียว
        *     ★★ และ "ฉันร่วมจ่ายด้วย" เป็นช่องติ๊ก 16px ทั้งที่มันเปลี่ยน
        *        ยอดต่อหัวของทุกคน — ซึ่งเป็นผลที่ใหญ่ที่สุดในหน้านี้
        *
        * ★ ตอนนี้: ตัวฉันเป็นการ์ดใบแรกที่มีสวิตช์ · ช่องค้นหาเปิดอยู่เสมอ ·
        *   ทุกคนอยู่ในตารางเดียวกัน · กลุ่มที่บันทึกไว้เป็นทางลัดข้างบน
        */}
      <Section
        collapsible
        title={<Untranslated>{ot('wallet.create.people')}</Untranslated>}
        hint={<Untranslated>{ot('wallet.create.peopleHint')}</Untranslated>}
        badge={
          headcount > 0 ? (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal tabular-nums text-ink-soft">
              {ot('wallet.owed.peopleN', { n: headcount })}
            </span>
          ) : undefined
        }
        /* ★ หุบแล้วยังเห็นชื่อคนที่เลือกไว้ ไม่ใช่แค่จำนวน */
        summary={
          picked.length > 0 ? (
            <span dir="auto">
              {picked
                .slice(0, 4)
                .map((id) => byId.get(id)?.name ?? '')
                .filter(Boolean)
                .join(', ')}
              {picked.length > 4 ? ` +${picked.length - 4}` : ''}
            </span>
          ) : undefined
        }
        action={
          picked.length > 0 ? (
            <button
              type="button"
              onClick={() => setPicked([])}
              className="min-h-11 px-2 text-xs text-link hover:underline"
            >
              <Untranslated>{ot('wallet.create.clearPicked')}</Untranslated>
            </button>
          ) : undefined
        }
      >
        {/*
          * ★★★ ตัวฉันแยกออกมาเป็นการ์ดของตัวเองพร้อมสวิตช์
          *     ★ มันไม่ใช่ "คนหนึ่งในรายชื่อ" — มันคือคำถามว่าหารกี่ทาง
          *       ★★ และคำตอบเปลี่ยนยอดของทุกคนในบิล จึงต้องอยู่บนสุด
          *          ไม่ใช่ช่องติ๊กเล็ก ๆ ที่ก้นส่วน
          */}
        <Toggle
          checked={prefs.includeSelf}
          onChange={(v) => setPref('includeSelf', v)}
          icon="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0"
          label={<Untranslated>{ot('wallet.create.includeSelf')}</Untranslated>}
          hint={
            prefs.includeSelf && split.mineSatang > 0 ? (
              <Untranslated>
                {`${ot('wallet.create.myShare')} ฿${formatBaht(locale, toBaht(split.mineSatang))}`}
              </Untranslated>
            ) : undefined
          }
        />

        {/* ── กลุ่มที่บันทึกไว้ ─────────────────────────────── */}
        {(recent?.groups ?? []).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recent!.groups.map((g) => {
              const on =
                g.memberIds.length === picked.length &&
                g.memberIds.every((id) => picked.includes(id))
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(g.memberIds)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors',
                    on ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:text-ink',
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6" />
                  </svg>
                  <span dir="auto">{g.name}</span>
                  <span className="text-[11px] tabular-nums opacity-60">{g.memberIds.length}</span>
                </button>
              )
            })}
          </div>
        ) : null}

        {/* ── ค้นหา — เปิดอยู่เสมอ ───────────────────────────── */}
        <div className="mt-3">
          <Input
            radius="round"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ot('wallet.create.search')}
            aria-label={ot('wallet.create.search')}
          />
        </div>

        {/*
          * ── ตารางคน ────────────────────────────────────────
          * ★ รูปใหญ่ 48px พร้อมชื่อและแผนก ★★ แผนกคือสิ่งที่แยก "พิม" สองคน
          *   ออกจากกันได้ ซึ่งชื่ออย่างเดียวทำไม่ได้
          * ★★ คนที่เลือกแล้วลอยขึ้นมาอยู่ต้นตาราง — รายชื่อยาวสามสิบคน
          *    ที่คนเลือกไว้กระจัดกระจาย ทำให้ตรวจทานก่อนกดบันทึกไม่ได้
          */}
        {/* ★ ขอบล่างจางลงบอกว่า "เลื่อนลงต่อได้" ★★ แถวที่ถูกตัดกลางคันตรง ๆ
            อ่านเป็น "แสดงไม่หมด" ซึ่งเป็นคนละความหมาย (วิธีเดียวกับกล่องแจ้งเตือน) */}
        <div className="notify-scroll mt-3 grid max-h-[22rem] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
          {peopleList.length === 0 ? (
            <p className="col-span-full py-8 text-center text-xs text-ink-faint">
              {ot('wallet.create.noMatch')}
            </p>
          ) : (
            peopleList.map((person) => {
              const on = picked.includes(person.id)
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(person.id)}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-2xl border p-2 text-start transition-all duration-200',
                    on
                      ? 'border-accent/50 bg-accent/8'
                      : 'border-transparent hover:border-line hover:bg-surface',
                  )}
                >
                  <span className="relative shrink-0">
                    <ChatAvatar name={person.name} url={person.avatarUrl} size={40} />
                    {on ? (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 -inset-e-0.5 grid size-5 place-items-center rounded-full bg-accent text-accent-ink ring-2 ring-page"
                      >
                        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      dir="auto"
                      className={cn(
                        'block truncate text-[13px]',
                        on ? 'font-semibold text-ink' : 'text-ink',
                      )}
                    >
                      {person.name}
                    </span>
                    {person.department ? (
                      <span dir="auto" className="block truncate text-[11px] text-ink-faint">
                        {person.department}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {fieldError.people ? <p className="mt-2 text-xs text-danger">{fieldError.people}</p> : null}
      </Section>

      {/*
        * ══ 5 · ค่าส่ง ส่วนลด และวิธีหาร ═══════════════════════
        *
        * ★★★ ชื่อเดิมคือ "เพิ่มรายละเอียด" ซึ่งไม่ได้บอกว่าใช้ตอนไหน
        *
        *     ★ คนที่ไม่เคยเปิดจะไม่มีวันรู้ว่าข้างในมีช่องค่าส่ง
        *       ★★ แล้วบิลที่มีค่าส่งแต่ไม่ได้กรอก คือบิลที่คนออกเงิน
        *          ขาดทุนเงียบ ๆ ทุกครั้ง
        *     ★★ แยกเป็นสองกองตามว่า "เปลี่ยนตัวเลข" หรือ "แค่บันทึกไว้"
        *        ★ กองแรกมีผลกับเงินของทุกคน กองหลังมีผลกับการค้นหาย้อนหลัง
        *          ★★ ซึ่งเป็นสองเหตุผลที่ต่างกันมากในการเปิดมันขึ้นมา
        */}
      <Section
        collapsible
        defaultOpen={Number(delivery) > 0 || Number(discount) > 0 || prefs.splitMode === 'CUSTOM'}
        title={<Untranslated>{ot('wallet.create.adjustTitle')}</Untranslated>}
        hint={<Untranslated>{ot('wallet.create.adjustHint')}</Untranslated>}
        summary={
          [
            Number(delivery) ? `${ot('wallet.create.delivery')} ฿${delivery}` : '',
            Number(discount) ? `${ot('wallet.create.discount')} ฿${discount}` : '',
            prefs.splitMode === 'CUSTOM' ? ot('wallet.create.splitCustom') : '',
            prefs.rounded ? ot('wallet.create.roundUp') : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated/50 p-4 backdrop-blur-md">
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

          <Toggle
            checked={prefs.rounded}
            onChange={(v) => setPref('rounded', v)}
            icon="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4"
            label={<Untranslated>{ot('wallet.create.roundUp')}</Untranslated>}
            hint={<Untranslated>{ot('wallet.create.roundUpHint')}</Untranslated>}
          />
        </div>
      </Section>

      {/*
        * ══ 6 · บันทึกไว้ว่าเป็นค่าอะไร ════════════════════════
        * ★ กองนี้ไม่เปลี่ยนตัวเลขสักบาท — มันคือสิ่งที่ทำให้ค้นเจอในวันหลัง
        *   ★★ จึงหุบไว้เป็นค่าเริ่มต้น ต่างจากกองบนที่กางเองเมื่อมีค่าอยู่แล้ว
        */}
      <Section
        collapsible
        defaultOpen={false}
        title={<Untranslated>{ot('wallet.create.recordTitle')}</Untranslated>}
        hint={<Untranslated>{ot('wallet.create.recordHint')}</Untranslated>}
        summary={
          [title, billDate !== todayIso() ? billDate : '', receiptPath ? ot('wallet.create.receiptDone') : '']
            .filter(Boolean)
            .join(' · ') || undefined
        }
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated/50 p-4 backdrop-blur-md">
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
                           แล้วชิปโชว์คำว่า "wallet.cat.FOOD" ออกจอ */}
                  {categoryLabel(ot, c)}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label={ot('wallet.create.date')} error={fieldError.date}>
            {/*
              * ★★ ปฏิทินของเราเอง ไม่ใช่ <input type="date"> ของเบราว์เซอร์
              *    ★ ของเดิมหน้าตาต่างกันทุกเบราว์เซอร์ และใส่ปุ่ม "วันนี้/เมื่อวาน"
              *      เข้าไปข้างในไม่ได้ จึงต้องมีชิปสองอันลอยอยู่ข้าง ๆ
              *      ★★ ตอนนี้ทางลัดอยู่ในปฏิทินเอง — ที่เดียว ไม่ใช่สามจุด
              */}
            <DatePicker
              value={billDate}
              onChange={(iso) => {
                setFieldError((f) => ({ ...f, date: '' }))
                setBillDate(iso)
              }}
              /* ★ ห้ามเลือกวันในอนาคต — บังคับที่ตัวเลือก ไม่ใช่เช็กตอนกดบันทึก */
              max={todayIso()}
              aria-label={ot('wallet.create.date')}
            />
          </Field>

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
      </Section>
      </div>

      {/*
        * ══ คอลัมน์ขวา · สรุปและปุ่มบันทึก ═══════════════════
        *
        * ★★★ เกาะอยู่กับที่เมื่อเลื่อน (sticky) บนจอกว้าง
        *     ★ ยอดต่อหัวคือผลของทุกการกดในหน้านี้ ★★ มันต้องอยู่ในสายตา
        *       ตลอดเวลาที่คนกำลังปรับ ไม่ใช่ต้องเลื่อนกลับไปดู
        *
        * ★ บนมือถือไหลลงมาอยู่ท้ายฟอร์ม และปุ่มบันทึกยังติดขอบล่างเหมือนเดิม
        */}
      <aside className="mt-6 lg:sticky lg:top-24 lg:mt-0">
        <div className="rounded-2xl border border-line bg-elevated/50 p-5 backdrop-blur-md">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <Untranslated>{ot('wallet.create.summaryTitle')}</Untranslated>
          </p>

          {Number(amount) > 0 && (picked.length > 0 || prefs.includeSelf) ? (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-[32px] font-bold leading-none tabular-nums text-ink">
                  ฿{formatBaht(locale, toBaht(split.perHeadSatang))}
                </span>
                <span className="text-[12px] text-ink-soft">
                  <Untranslated>{ot('wallet.create.perHead')}</Untranslated>
                </span>
              </p>

              {/* ★ แถวตัวเลขย่อย — ตอบว่ายอดต่อหัวนั้นมาจากไหน */}
              <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[12.5px]">
                <SumRow label={ot('wallet.create.total')} value={`฿${formatBaht(locale, Number(amount) || 0)}`} />
                {Number(delivery) > 0 ? (
                  <SumRow label={ot('wallet.create.delivery')} value={`+฿${formatBaht(locale, Number(delivery))}`} />
                ) : null}
                {Number(discount) > 0 ? (
                  <SumRow label={ot('wallet.create.discount')} value={`−฿${formatBaht(locale, Number(discount))}`} />
                ) : null}
                <SumRow
                  label={ot('wallet.create.headcount')}
                  value={ot('wallet.owed.peopleN', {
                    n: picked.length + (prefs.includeSelf ? 1 : 0),
                  })}
                />
                {prefs.includeSelf ? (
                  <SumRow
                    label={ot('wallet.create.myShare')}
                    value={`฿${formatBaht(locale, toBaht(split.mineSatang))}`}
                    strong
                  />
                ) : null}
              </dl>

              {/* ★ รูปคนที่อยู่ในบิล — ตรวจทานด้วยตาได้โดยไม่ต้องเลื่อนกลับขึ้นไป */}
              {picked.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1">
                  {picked.slice(0, 12).map((id) => (
                    <ChatAvatar
                      key={id}
                      name={byId.get(id)?.name ?? '—'}
                      url={byId.get(id)?.avatarUrl ?? null}
                      size={26}
                    />
                  ))}
                  {picked.length > 12 ? (
                    <span className="grid size-[26px] place-items-center rounded-full bg-surface text-[10px] font-medium text-ink-soft">
                      +{picked.length - 12}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            /* ★ ที่ว่างที่ตั้งใจ — บอกว่ายังขาดอะไร ไม่ใช่กล่องเปล่า */
            <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
              <Untranslated>{ot('wallet.create.summaryEmpty')}</Untranslated>
            </p>
          )}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        {/*
          * ★★ sticky ไม่ใช่ fixed — fixed จะลอยทับเนื้อหาตอนเลื่อนสุดล่าง
          *    ★ บนจอกว้างปุ่มอยู่ในคอลัมน์ขวาซึ่งเกาะอยู่แล้ว จึงไม่ต้อง sticky ซ้ำ
          */}
        {/* ★ บนจอกว้างปุ่มอยู่ในคอลัมน์ขวาซึ่งเกาะอยู่แล้ว
             ★★ บนมือถือใช้แถบล่างแทน (อยู่นอก aside เพื่อให้ sticky มีที่เกาะ) */}
        <div className="mt-4 hidden lg:block">
          <SaveButton ot={ot} busy={busy} missing={missing} onClick={submit} />
        </div>
      </aside>

      {/*
        * ══ แถบล่างบนมือถือ · สรุป + ปุ่มบันทึก ═══════════════
        *
        * ★★★ ข้อกำหนดบอกว่า "ยอดต่อคนต้องเห็นโดยไม่ต้องเลื่อน"
        *
        *     ★ พอย้ายสรุปไปคอลัมน์ขวา บนมือถือมันไหลไปอยู่ท้ายฟอร์ม
        *       ★★ ซึ่งแปลว่าต้องเลื่อนผ่านรายชื่อคนทั้งหมดถึงจะเห็นผลของ
        *          สิ่งที่เพิ่งกด — สคริปต์ทดสอบจับได้ทันที (top=-1)
        *     ★ แถบนี้แก้ทั้งสองอย่างในที่เดียว: ยอดอยู่เหนือปุ่มที่ต้องกดอยู่แล้ว
        *
        * ★★ อยู่นอก <aside> เพราะ sticky เกาะกับกล่องแม่
        *    ★ ใส่ไว้ใน aside ที่สูงแค่ไม่กี่ร้อย px แล้วมันจะไม่มีที่ให้เกาะ
        *      ★★ วัดได้จริง: ปุ่มไปโผล่ที่ y=1975 บนจอสูง 812
        */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-line bg-page/95 px-4 py-3 backdrop-blur-md lg:hidden">
        {Number(amount) > 0 && headcount > 0 ? (
          <p className="mb-2 text-[13px] font-medium text-ink">
            <Untranslated>
              {ot('wallet.create.summaryHead', {
                n: headcount,
                each: `฿${formatBaht(locale, toBaht(split.perHeadSatang))}`,
              })}
            </Untranslated>
          </p>
        ) : null}
        <SaveButton ot={ot} busy={busy} missing={missing} onClick={submit} />
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

/*
 * ★ todayIso/yesterdayIso ย้ายไปอยู่กับ DatePicker แล้ว
 *   ★★ สองที่ที่คำนวณ "วันนี้" เองคือสองที่ที่เลื่อนวันไม่ตรงกันได้
 *      เมื่อวันหนึ่งมีใครเปลี่ยนวิธีคิดเขตเวลาของที่หนึ่ง
 */

/**
 * ปุ่มบันทึก
 *
 * ★ แยกออกมาเพราะมีสองที่: คอลัมน์ขวาบนจอกว้าง และแถบล่างบนมือถือ
 *   ★★ เขียนซ้ำสองรอบคือการเปิดช่องให้ข้อความบนปุ่มสองที่ค่อย ๆ ต่างกัน
 */
function SaveButton({
  ot,
  busy,
  missing,
  onClick,
}: {
  ot: ReturnType<typeof useOt>
  busy: boolean
  missing: 'amount' | 'people' | null
  onClick: () => void
}) {
  return (
    <Button variant="primary" loading={busy} onClick={onClick} className="min-h-12 w-full text-base">
      <Untranslated>
        {missing === 'amount'
          ? ot('wallet.create.needAmount')
          : missing === 'people'
            ? ot('wallet.create.needPeople')
            : ot('wallet.create.submit')}
      </Untranslated>
    </Button>
  )
}

/** แถวตัวเลขในกล่องสรุป */
function SumRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">
        <Untranslated>{label}</Untranslated>
      </dt>
      <dd
        className={cn('shrink-0 tabular-nums', strong ? 'font-semibold text-ink' : 'text-ink-soft')}
      >
        {value}
      </dd>
    </div>
  )
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
