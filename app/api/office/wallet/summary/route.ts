import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'
import { toBaht, toSatang } from '@/lib/office/money'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/wallet/summary?from=&to= — สรุปค่าข้าว (FR-B09)
 *
 * ★★★ คืน "รายการย่อยทีละรายการ" ไม่ได้คืนยอดรวมสำเร็จรูป 4 ชุด
 *
 *     ★ ผู้ใช้รายงานว่า "ใช้จ่ายทั้งหมด ฿142" แต่ "แยกตามประเภท" และ
 *       "ร้านที่ใช้จ่ายมากสุด" แสดง ฿0.00
 *       ★★ สาเหตุ: RPC เดิมรวมยอดด้วย query 4 ชุดที่เงื่อนไขไม่ตรงกัน —
 *          total นับทั้งบิลที่ฉันจ่ายและส่วนของฉันในบิลคนอื่น
 *          แต่ byCategory/byRestaurant/byDay นับเฉพาะ `payer_id = ฉัน`
 *       ★ คนที่ไม่เคยเป็นคนออกเงินให้กลุ่ม (คนส่วนใหญ่) จึงเห็นยอดรวม
 *         มีตัวเลข แต่กราฟกับตารางว่างเปล่าตลอดไป
 *
 *     ★★ แก้ที่โครงสร้าง ไม่ใช่แก้เงื่อนไขให้ตรงกัน 4 ที่
 *        ★ สี่ที่ที่ต้องตรงกัน คือสี่ที่ที่วันหนึ่งจะไม่ตรงกันอีก
 *          ★★ คืนรายการย่อยชุดเดียวแล้วให้หน้าเว็บจัดกลุ่มเอง — ผลรวมของ
 *             ทุกส่วนเท่ากับยอดรวม "โดยโครงสร้าง" ไม่ใช่โดยความระมัดระวัง
 *     ★ และการแตะกราฟเพื่อดูรายการของวันนั้น กลายเป็นการกรองอาร์เรย์
 *       ที่มีอยู่แล้วในมือ ไม่ต้องยิงคำขอใหม่
 *
 * ★★ ไม่เรียก RPC my_expense_summary อีกแล้ว
 *    ★ ตรรกะ "เงินที่ฉันใช้ไปจริง" ต้องอยู่ที่เดียว และที่นี่คือที่ที่
 *      ทดสอบได้ง่ายที่สุด ★★ RPC ตัวนั้นยังอยู่ในฐานข้อมูล แต่ไม่มีใครเรียก
 *      — ปล่อยไว้ดีกว่าลบ เพราะการ drop function ต้องมี migration
 *      และมันไม่ได้ทำอันตรายอะไร
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()

  const params = request.nextUrl.searchParams
  const parsed = z
    .object({ from: z.string().date(), to: z.string().date() })
    .safeParse({ from: params.get('from'), to: params.get('to') })

  if (!parsed.success) throw new AppError('VALIDATION_FAILED')

  /* ★ ช่วงที่กลับหัวจะได้ผลลัพธ์ว่างเปล่าแบบเงียบ ๆ — ปฏิเสธไปเลยชัดกว่า */
  if (parsed.data.from > parsed.data.to) throw new AppError('VALIDATION_FAILED')

  const { from, to } = parsed.data
  const admin = getSupabaseAdminClient()

  /*
   * ★★★ "เงินที่ฉันใช้ไปจริง" มีสองทางเข้า และมีแค่สองทางนี้
   *
   *     1 · บิลที่ฉันเป็นคนจ่าย → ส่วนที่เหลือหลังหักหนี้ที่แตกให้คนอื่น
   *     2 · บิลที่คนอื่นจ่าย → ส่วนของฉันที่กลายเป็นหนี้
   *
   *     ★ สองทางนี้ไม่ซ้อนกัน เพราะคนจ่ายบิลไม่เป็นลูกหนี้ของบิลตัวเอง
   *       ★★ ถ้าวันหนึ่งกฎนั้นเปลี่ยน ยอดจะถูกนับซ้ำ — นี่คือจุดที่ต้องกลับมาดู
   */
  const [{ data: billsPaid, error: e1 }, { data: myDebts, error: e2 }] = await Promise.all([
    admin
      .from('expense_bills')
      .select('id, title, category, bill_date, total_amount, restaurant_id, delivery_fee, discount')
      .eq('payer_id', actor.id)
      .gte('bill_date', from)
      .lte('bill_date', to),
    admin
      .from('debts')
      .select('id, bill_id, amount, description, created_at, is_settlement, status')
      .eq('debtor_id', actor.id)
      .neq('status', 'CANCELLED'),
  ])

  if (e1) throw fromPostgresError(e1)
  if (e2) throw fromPostgresError(e2)

  const paid = billsPaid ?? []

  /* ── หนี้ที่แตกออกจากบิลที่ฉันจ่าย — ใช้หักออกจากยอดบิล ───────── */
  const paidIds = paid.map((b) => b.id)
  const { data: splitOut } = paidIds.length
    ? await admin
        .from('debts')
        .select('bill_id, amount')
        .in('bill_id', paidIds)
        .neq('status', 'CANCELLED')
    : { data: [] as { bill_id: string | null; amount: number }[] }

  const outOf = new Map<string, number>()
  for (const d of splitOut ?? []) {
    if (!d.bill_id) continue
    outOf.set(d.bill_id, (outOf.get(d.bill_id) ?? 0) + toSatang(d.amount))
  }

  /*
   * ── บิลต้นทางของหนี้ที่ฉันเป็นลูกหนี้ ──────────────────────────
   * ★ ต้องรู้ bill_date/category/restaurant ของบิลที่ "คนอื่นจ่าย"
   *   ★★ กรองช่วงวันที่ด้วย bill_date ของบิลนั้น ไม่ใช่ created_at ของหนี้
   *      ★ บิลเมื่อวานที่เพิ่งแตกหนี้วันนี้ ต้องนับเป็นค่าใช้จ่ายของเมื่อวาน
   */
  const debtBillIds = [
    ...new Set((myDebts ?? []).map((d) => d.bill_id).filter((v): v is string => Boolean(v))),
  ]
  const { data: otherBills } = debtBillIds.length
    ? await admin
        .from('expense_bills')
        .select('id, title, category, bill_date, restaurant_id')
        .in('id', debtBillIds)
    : { data: [] as { id: string; title: string; category: string; bill_date: string; restaurant_id: string | null }[] }

  const billOf = new Map((otherBills ?? []).map((b) => [b.id, b]))

  /* ── ชื่อร้าน ──────────────────────────────────────────────── */
  const shopIds = [
    ...new Set(
      [...paid, ...(otherBills ?? [])]
        .map((b) => b.restaurant_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ]
  const { data: shops } = shopIds.length
    ? await admin.from('restaurants').select('id, name').in('id', shopIds)
    : { data: [] as { id: string; name: string }[] }
  const shopOf = new Map((shops ?? []).map((r) => [r.id, r.name]))

  /* ── ประกอบรายการย่อย ─────────────────────────────────────── */
  type Item = {
    date: string
    title: string
    category: string
    shop: string | null
    shopId: string | null
    amount: number
    mine: boolean
    deliveryFee: number
    discount: number
  }
  const items: Item[] = []

  for (const b of paid) {
    /* ★ คำนวณเป็นสตางค์ตลอดทาง — ดูเหตุผลใน lib/office/money.ts */
    const left = toSatang(b.total_amount) - (outOf.get(b.id) ?? 0)
    if (left <= 0) continue
    items.push({
      date: b.bill_date,
      title: b.title,
      category: b.category,
      shop: b.restaurant_id ? (shopOf.get(b.restaurant_id) ?? null) : null,
      shopId: b.restaurant_id,
      amount: toBaht(left),
      mine: true,
      /* ★ ค่าส่ง/ส่วนลดของ "ทั้งบิล" ไม่ใช่ของส่วนฉัน — CSV ต้องการที่มาของตัวเลข */
      deliveryFee: Number(b.delivery_fee ?? 0),
      discount: Number(b.discount ?? 0),
    })
  }

  for (const d of myDebts ?? []) {
    /*
     * ★★ ข้ามรายการหักลบหนี้ — มันคือการย้ายยอด ไม่ใช่การใช้เงิน
     *    ★ ถ้านับ จะกลายเป็นว่า "หักลบหนี้" ทำให้ค่าข้าวเดือนนั้นเพิ่มขึ้น
     */
    if (d.is_settlement) continue

    const b = d.bill_id ? billOf.get(d.bill_id) : null
    const date = b?.bill_date ?? String(d.created_at).slice(0, 10)
    if (date < from || date > to) continue

    const sat = toSatang(d.amount)
    if (sat <= 0) continue

    items.push({
      /* ★ ส่วนของฉันในบิลคนอื่น ไม่มีค่าส่ง/ส่วนลดของตัวเอง — มันถูกหารมาแล้ว */
      deliveryFee: 0,
      discount: 0,
      date,
      title: b?.title ?? d.description ?? '',
      /* ★ หนี้เดี่ยวไม่มีประเภท — ให้เป็น OTHER ไม่ใช่ null
           ★★ null จะกลายเป็นคีย์ "null" ในตารางซึ่งแปลไม่ได้ */
      category: b?.category ?? 'OTHER',
      shop: b?.restaurant_id ? (shopOf.get(b.restaurant_id) ?? null) : null,
      shopId: b?.restaurant_id ?? null,
      amount: toBaht(sat),
      mine: false,
    })
  }

  items.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)))

  /*
   * ★★ ยอดรวมมาจากรายการเดียวกันนี้ ไม่ได้นับแยก
   *    ★ นี่คือหัวใจของการแก้บั๊ก — ยอดรวมกับรายละเอียดเพี้ยนจากกันไม่ได้อีก
   *      เพราะมันคือตัวเลขชุดเดียวกันที่ถูกรวมคนละวิธี
   */
  const totalSat = items.reduce((s, i) => s + toSatang(i.amount), 0)
  const mineSat = items.filter((i) => i.mine).reduce((s, i) => s + toSatang(i.amount), 0)

  /*
   * ── คนที่กินข้าวด้วยบ่อยสุดในช่วงนี้ ────────────────────────────
   * ★★ นับจาก "บิลที่แชร์กัน" ไม่ใช่จากรายชื่อเพื่อนหรือห้องแชท
   *    ★ คำถามของหน้านี้คือ "เงินค่าข้าวหมดไปกับการกินกับใคร"
   *      ★★ ซึ่งตอบได้จากบิลเท่านั้น
   */
  const sharedBillIds = [...paidIds, ...debtBillIds]
  const { data: companions } = sharedBillIds.length
    ? await admin
        .from('debts')
        .select('bill_id, debtor_id, creditor_id')
        .in('bill_id', sharedBillIds)
        .neq('status', 'CANCELLED')
    : { data: [] as { bill_id: string | null; debtor_id: string; creditor_id: string }[] }

  /* ★ นับ "กี่บิล" ไม่ใช่ "กี่แถวหนี้" — บิลหนึ่งใบนับคนหนึ่งคนครั้งเดียว */
  const seen = new Set<string>()
  const metCount = new Map<string, number>()
  for (const c of companions ?? []) {
    for (const uid of [c.debtor_id, c.creditor_id]) {
      if (uid === actor.id) continue
      const key = `${c.bill_id}:${uid}`
      if (seen.has(key)) continue
      seen.add(key)
      metCount.set(uid, (metCount.get(uid) ?? 0) + 1)
    }
  }

  const topIds = [...metCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)

  const { data: peopleRows } = topIds.length
    ? await admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', topIds)
    : { data: [] as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }[] }

  const personOf = new Map((peopleRows ?? []).map((p) => [p.id, p]))

  /*
   * ── ยอดของช่วงก่อนหน้า — ใช้เทียบ "▲ 12% จากเดือนก่อน" ────────
   * ★★ ใช้ช่วงยาวเท่ากันเลื่อนถอยหลัง ไม่ได้ยึดว่าเป็น "เดือนปฏิทินก่อนหน้า"
   *    ★ หน้านี้มีโหมดรายปีด้วย ★★ การเทียบต้องถูกทั้งสองโหมดโดยไม่ต้องแยกโค้ด
   *    ★ ผลข้างเคียงที่ยอมรับได้: เดือนที่มี 28 วันเทียบกับ 31 วันจะไม่แฟร์นัก
   *      ★★ แต่ความต่าง 3 วันไม่ได้เปลี่ยนข้อสรุปว่า "เดือนนี้ใช้มากขึ้นหรือน้อยลง"
   */
  const spanDays = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)
  const prevTo = new Date(Date.parse(from) - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const [{ data: prevPaid }, { data: prevDebts }] = await Promise.all([
    admin
      .from('expense_bills')
      .select('id, total_amount')
      .eq('payer_id', actor.id)
      .gte('bill_date', iso(prevFrom))
      .lte('bill_date', iso(prevTo)),
    admin
      .from('debts')
      .select('amount, bill_id, created_at, is_settlement')
      .eq('debtor_id', actor.id)
      .neq('status', 'CANCELLED'),
  ])

  const prevPaidIds = (prevPaid ?? []).map((b) => b.id)
  const { data: prevSplit } = prevPaidIds.length
    ? await admin.from('debts').select('bill_id, amount').in('bill_id', prevPaidIds).neq('status', 'CANCELLED')
    : { data: [] as { bill_id: string | null; amount: number }[] }

  const prevOut = new Map<string, number>()
  for (const d of prevSplit ?? []) {
    if (!d.bill_id) continue
    prevOut.set(d.bill_id, (prevOut.get(d.bill_id) ?? 0) + toSatang(d.amount))
  }

  let prevSat = 0
  for (const b of prevPaid ?? []) {
    prevSat += Math.max(0, toSatang(b.total_amount) - (prevOut.get(b.id) ?? 0))
  }

  const prevBillIds = [
    ...new Set((prevDebts ?? []).map((d) => d.bill_id).filter((v): v is string => Boolean(v))),
  ]
  const { data: prevBills } = prevBillIds.length
    ? await admin.from('expense_bills').select('id, bill_date').in('id', prevBillIds)
    : { data: [] as { id: string; bill_date: string }[] }
  const prevDateOf = new Map((prevBills ?? []).map((b) => [b.id, b.bill_date]))

  for (const d of prevDebts ?? []) {
    if (d.is_settlement) continue
    const date = (d.bill_id ? prevDateOf.get(d.bill_id) : null) ?? String(d.created_at).slice(0, 10)
    if (date < iso(prevFrom) || date > iso(prevTo)) continue
    prevSat += toSatang(d.amount)
  }

  /*
   * ── งบรายเดือน ───────────────────────────────────────────────
   * ★★ อ่านแบบล้มได้ — คอลัมน์มาจาก 0047
   *    ★ บทเรียนเดิม: select คอลัมน์ที่ยังไม่มี ทำให้ทั้งหน้าพัง
   */
  let monthlyBudget: number | null = null
  const budgetRow = await admin
    .from('profiles')
    .select('monthly_budget')
    .eq('id', actor.id)
    .maybeSingle()
  if (!budgetRow.error) monthlyBudget = budgetRow.data?.monthly_budget ?? null

  return ok({
    items,
    total: toBaht(totalSat),
    myShare: toBaht(mineSat),
    /** ยอดของช่วงก่อนหน้าที่ยาวเท่ากัน — null = ไม่มีข้อมูล ให้ซ่อนการเทียบ */
    prevTotal: prevSat > 0 ? toBaht(prevSat) : null,
    monthlyBudget,
    topPeople: topIds.map((id) => ({
      id,
      name: personOf.get(id)?.nickname || personOf.get(id)?.display_name || '—',
      avatarUrl: personOf.get(id)?.avatar_url ?? null,
      times: metCount.get(id) ?? 0,
    })),
    /*
     * ★★★ เปลี่ยนชื่อจาก owedOut → myShareOthers
     *
     *     ★ ชื่อเดิมอ่านว่า "ยอดที่ยังค้างคนอื่น" ★★ แต่ค่าจริงรวมหนี้ที่
     *       จ่ายจบไปแล้ว (SETTLED) ด้วย ★ ผู้ใช้จึงเห็นการ์ดนี้ ฿142
     *       ขณะที่หน้ายอดค้างบอก ฿0.00 แล้วสรุปว่าตัวเลขของระบบเชื่อไม่ได้
     *     ★ ค่าที่ถูกคือ "ส่วนของฉันในบิลที่คนอื่นจ่าย" ซึ่งเป็นเงินที่ฉัน
     *       ใช้ไปจริง ไม่ว่าจะจ่ายคืนแล้วหรือยัง — จึงต้องรวมในยอดรวม
     *       ★★ ชื่อใหม่บอกสิ่งที่มันเป็น ไม่ใช่สิ่งที่เคยถูกเข้าใจผิดว่าเป็น
     */
    myShareOthers: toBaht(totalSat - mineSat),
  })
})
