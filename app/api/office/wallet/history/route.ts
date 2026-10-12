import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'
import { getOt } from '@/lib/i18n/office-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/wallet/history — ประวัติการโอนย้อนหลัง ค้นหาได้
 *
 * ★★★ ต่างจาก /api/office/wallet ที่มีอยู่แล้วตรงไหน
 *
 *     ★ ตัวนั้นตอบคำถาม "ตอนนี้ติดใครอยู่" — ดึงมา 200 แถวล่าสุดทั้งหมด
 *       แล้วให้หน้าจอกรองเอง ★★ ซึ่งพอใช้กับของที่ค้างอยู่ไม่กี่ใบ
 *     ★ แต่ "ย้อนหลังทั้งหมด ค้นหาได้" คือคำถามคนละข้อ ★★ ปีหน้ามีสองพันใบ
 *       การส่งทั้งหมดมาให้เบราว์เซอร์กรองคือการส่งข้อมูลที่ 99% ไม่ได้ใช้
 *       ★ และ 200 ใบล่าสุดจะกลายเป็น "ค้นหาแล้วไม่เจอของเมื่อปีก่อน"
 *         โดยที่ไม่มีอะไรบอกว่ามันถูกตัดไป
 *
 * ★★ กรอง · ค้นหา · แบ่งหน้า ทำที่ฐานข้อมูลทั้งหมด
 *    ★ ยอดรวมของชุดที่กรองก็คิดจากของจริงทั้งชุด ไม่ใช่เฉพาะหน้าที่เห็น
 *      ★★ ยอดรวมที่เปลี่ยนตามหน้าที่เปิดอยู่คือยอดรวมที่ตอบอะไรไม่ได้เลย
 */

/** กี่รายการต่อหน้า — ตรงกับที่หน้าจอคาดไว้ */
const SIZE = 12
/** กันคนยิง page เยอะ ๆ เพื่อไล่อ่านทั้งตาราง */
const MAX_PAGE = 500

export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()
  const params = new URL(request.url).searchParams

  const q = (params.get('q') ?? '').trim().slice(0, 60)
  const dir = params.get('dir') === 'out' ? 'out' : params.get('dir') === 'in' ? 'in' : 'all'
  const status = params.get('status') ?? 'all'
  const from = params.get('from')
  const to = params.get('to')
  const page = Math.min(MAX_PAGE, Math.max(0, Number(params.get('page') ?? 0) || 0))

  /*
   * ★★ ค้นชื่อคนก่อน แล้วค่อยเอา id ไปกรองหนี้
   *    ★ debts ไม่มีชื่อคนอยู่ในตาราง มีแต่ id ★★ จะ join ก็ได้ แต่ PostgREST
   *      ต้อง embed ซึ่งทำให้ or() ข้ามตารางเขียนยากและอ่านยากกว่ามาก
   *    ★ ออฟฟิศมีคนหลักสิบ การค้นชื่อก่อนจึงเป็นคำขอที่เล็กมาก
   */
  let nameIds: string[] = []
  if (q) {
    const { data: hits } = await admin
      .from('profiles')
      .select('id')
      .or(`display_name.ilike.%${q}%,nickname.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(50)
    nameIds = (hits ?? []).map((h) => h.id)
  }

  function base() {
    let sel = admin
      .from('debts')
      .select(
        'id, amount, description, status, slip_path, paid_at, created_at, creditor_id, debtor_id, is_settlement, bill_id',
        { count: 'exact' },
      )

    /* ★ ทิศทาง — "จ่ายออก" คือเราเป็นลูกหนี้ · "รับเข้า" คือเราเป็นเจ้าหนี้ */
    if (dir === 'out') sel = sel.eq('debtor_id', actor.id)
    else if (dir === 'in') sel = sel.eq('creditor_id', actor.id)
    else sel = sel.or(`creditor_id.eq.${actor.id},debtor_id.eq.${actor.id}`)

    if (status === 'settled') sel = sel.eq('status', 'SETTLED')
    else if (status === 'pending') sel = sel.in('status', ['PENDING', 'PAID_PENDING'])
    else if (status === 'cancelled') sel = sel.eq('status', 'CANCELLED')

    if (from) sel = sel.gte('created_at', `${from}T00:00:00.000Z`)
    if (to) sel = sel.lte('created_at', `${to}T23:59:59.999Z`)

    /*
     * ★★ ค้นหาจับทั้งข้อความของรายการและชื่อคู่กรณี
     *    ★ คนจำได้บ้างว่า "ค่าข้าว" บ้างว่า "โอนให้มงมง" ★★ บังคับให้เลือก
     *      ว่าจะค้นอะไรคือการให้ผู้ใช้ทำงานที่ระบบทำแทนได้
     */
    if (q) {
      const parts = [`description.ilike.%${q}%`]
      for (const id of nameIds) {
        parts.push(`creditor_id.eq.${id}`, `debtor_id.eq.${id}`)
      }
      /*
       * ★★ พิมพ์เป็นตัวเลขก็ค้นยอดเงินได้ด้วย
       *    ★ "จำได้ว่าโอนไปสามร้อย" เป็นวิธีจำที่คนใช้จริงพอ ๆ กับจำชื่อเรื่อง
       *      ★★ ไม่ต้องมีช่องแยก — ถ้าสิ่งที่พิมพ์เป็นตัวเลขก็ลองทั้งสองทาง
       */
      const n = Number(q)
      if (Number.isFinite(n) && n > 0) parts.push(`amount.eq.${n}`)
      sel = sel.or(parts.join(','))
    }

    return sel
  }

  const { data: rows, count, error } = await base()
    .order('created_at', { ascending: false })
    .range(page * SIZE, page * SIZE + SIZE - 1)

  if (error) throw fromPostgresError(error)

  /*
   * ★★★ ยอดรวมคิดจากทั้งชุดที่กรอง ไม่ใช่จากหน้าที่เปิดอยู่
   *     ★ ดึงเฉพาะสองคอลัมน์ที่ต้องใช้ ★★ ไม่ดึงทั้งแถวเพราะชุดนี้อาจใหญ่
   */
  const { data: allRows } = await base().limit(5000)
  let paidOut = 0
  let gotIn = 0
  /*
   * ★★★ สรุปรายคนจากชุดเดียวกับยอดรวม
   *
   *     ★ ของเดิมหน้าสรุปบอกได้แค่ "กินกับใครบ่อย" (นับครั้ง) ★★ ซึ่งตอบ
   *       ไม่ได้ว่า "ปีนี้จ่ายให้คนนี้ไปเท่าไร" ที่เป็นคำถามที่คนถามกันจริง
   *     ★ คิดจาก allRows ที่กรองแล้ว ไม่ใช่จากหน้าที่เปิด — ตัวเลขรายคน
   *       ที่เปลี่ยนตามหน้าคือตัวเลขที่ตอบอะไรไม่ได้
   */
  const per = new Map<string, { out: number; in: number; times: number }>()
  for (const r of allRows ?? []) {
    const otherId = r.creditor_id === actor.id ? r.debtor_id : r.creditor_id
    const cell = per.get(otherId) ?? { out: 0, in: 0, times: 0 }
    cell.times += 1
    if (r.status === 'SETTLED') {
      if (r.debtor_id === actor.id) {
        paidOut += Number(r.amount)
        cell.out += Number(r.amount)
      } else {
        gotIn += Number(r.amount)
        cell.in += Number(r.amount)
      }
    }
    per.set(otherId, cell)
  }

  /* ★ เรียงตาม "เงินที่เกี่ยวข้องกันทั้งหมด" ไม่ใช่จำนวนครั้ง
       ★★ คนที่เจอกันสิบครั้งครั้งละยี่สิบบาท ไม่ได้สำคัญเท่าคนที่เจอครั้งเดียว
          แต่เป็นเงินสองพัน — และหน้านี้เป็นหน้าเรื่องเงิน */
  const people = [...per.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.out + b.in - (a.out + a.in))
    .slice(0, 8)

  /* ── ชื่อและรูปของคู่กรณี ───────────────────────────────────── */
  const others = [
    ...new Set([
      ...(rows ?? []).map((d) => (d.creditor_id === actor.id ? d.debtor_id : d.creditor_id)),
      ...people.map((p) => p.id),
    ]),
  ]
  const peopleMap = new Map<string, { name: string; avatarUrl: string | null }>()
  if (others.length > 0) {
    const { data: ps } = await admin
      .from('profiles')
      .select('id, display_name, nickname, avatar_url')
      .in('id', others)
    for (const p of ps ?? []) {
      peopleMap.set(p.id, { name: p.nickname || p.display_name, avatarUrl: p.avatar_url })
    }
  }

  /* ★ ชื่อบิลต้นทาง — ตอบคำถาม "โอนค่าอะไร" ได้ดีกว่า description บางใบ */
  const billIds = [...new Set((rows ?? []).map((d) => d.bill_id).filter(Boolean) as string[])]
  const bills = new Map<string, string>()
  if (billIds.length > 0) {
    const { data: bs } = await admin.from('expense_bills').select('id, title').in('id', billIds)
    for (const b of bs ?? []) bills.set(b.id, b.title ?? '')
  }

  const { ot } = await getOt()
  const people2name = (id: string) => peopleMap.get(id)?.name ?? ot('common.unknownName')
  const people2avatar = (id: string) => peopleMap.get(id)?.avatarUrl ?? null

  return ok({
    page,
    size: SIZE,
    total: count ?? 0,
    pages: Math.max(1, Math.ceil((count ?? 0) / SIZE)),
    paidOut,
    gotIn,
    people: people.map((p) => ({
      id: p.id,
      name: people2name(p.id),
      avatarUrl: people2avatar(p.id),
      out: p.out,
      in: p.in,
      times: p.times,
    })),
    items: (rows ?? []).map((d) => {
      const otherId = d.creditor_id === actor.id ? d.debtor_id : d.creditor_id
      const other = peopleMap.get(otherId)
      return {
        id: d.id,
        amount: Number(d.amount),
        description: d.description,
        billTitle: d.bill_id ? (bills.get(d.bill_id) ?? null) : null,
        status: d.status,
        /** ★ ทิศทางคิดที่ server — หน้าจอไม่ต้องเทียบ id เอง */
        direction: d.debtor_id === actor.id ? ('out' as const) : ('in' as const),
        createdAt: d.created_at,
        paidAt: d.paid_at,
        hasSlip: Boolean(d.slip_path),
        isSettlement: d.is_settlement,
        otherId,
        otherName: other?.name ?? ot('common.unknownName'),
        otherAvatar: other?.avatarUrl ?? null,
      }
    }),
  })
})
