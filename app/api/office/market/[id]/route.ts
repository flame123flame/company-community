import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/market/[id] — ประกาศชิ้นเดียว พร้อมรายละเอียดเต็ม
 *
 * ★★★ คืนมากกว่าที่รายการรวมคืน ไม่ใช่ซ้ำกันเฉย ๆ
 *
 *     ★ หน้ารายละเอียดต้องการ "คิวทั้งคิว" (ใครจองบ้าง ลำดับไหน) ซึ่ง
 *       หน้ารวมไม่ต้องการ — มันต้องการแค่จำนวนกับลำดับของฉัน
 *       ★★ ถ้าให้หน้ารวมส่งคิวเต็มมาด้วย ประกาศ 300 ชิ้นจะลากรายชื่อ
 *          คนจองทั้งหมดมาทุกครั้งที่เปิดหน้าตลาด เพื่อข้อมูลที่ใช้
 *          เฉพาะตอนกดเข้าไปดูทีละชิ้น
 *
 * ★ ชื่อคนในคิวเห็นได้เฉพาะเจ้าของประกาศกับ Admin
 *   ★★ คนซื้อคนอื่นควรรู้แค่ว่า "มีกี่คนต่อหน้าฉัน" ไม่ใช่ว่าใครบ้าง —
 *      รายชื่อคนที่สนใจซื้อของมือสองเป็นเรื่องส่วนตัวของเขา
 */
export const GET = withErrorHandling(
  async (_request: NextRequest, context: RouteContext<'/api/office/market/[id]'>) => {
    const actor = await requireOfficeUser()
    const { id } = await context.params
    const admin = getSupabaseAdminClient()

    const { data: l, error } = await admin
      .from('listings')
      .select(
        'id, seller_id, title, price, kind, category, condition, description, meet_building, meet_floor, meet_desk, status, hidden, created_at, updated_at',
      )
      .eq('id', id)
      .maybeSingle()

    if (error) throw fromPostgresError(error)
    /* ★ ไม่ใส่ messageKey — AppError รับกุญแจของดิกชันนารีห้องเพลง ไม่ใช่ของออฟฟิศ
         ★★ หน้ารายละเอียดแปลรหัสนี้เป็น market.gone เองฝั่ง client */
    if (!l) throw new AppError('ROOM_NOT_FOUND')

    /* ★ กฎการมองเห็นชุดเดียวกับหน้ารวม — ซ่อนแล้วเห็นได้เฉพาะเจ้าของกับ Admin */
    const canManage = l.seller_id === actor.id || actor.isAdmin
    if (l.hidden && !canManage) throw new AppError('ROOM_NOT_FOUND')

    const [{ data: images }, { data: queue }, { data: seller }] = await Promise.all([
      admin.from('listing_images').select('url, sort').eq('listing_id', id).order('sort'),
      admin
        .from('listing_reservations')
        .select('user_id, position, status, created_at')
        .eq('listing_id', id)
        .eq('status', 'ACTIVE')
        .order('position'),
      admin
        .from('profiles')
        .select('id, display_name, nickname, avatar_url, department, payment_qr_path')
        .eq('id', l.seller_id)
        .maybeSingle(),
    ])

    const q = queue ?? []
    const mine = q.findIndex((r) => r.user_id === actor.id)

    const names = canManage
      ? await admin
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .in('id', q.map((r) => r.user_id).length ? q.map((r) => r.user_id) : ['-'])
      : { data: [] }

    const byId = new Map((names.data ?? []).map((p) => [p.id, p]))

    return ok({
      listing: {
        id: l.id,
        title: l.title,
        price: l.price,
        kind: l.kind,
        category: l.category,
        condition: l.condition,
        description: l.description,
        meet: { building: l.meet_building, floor: l.meet_floor, desk: l.meet_desk },
        status: l.status,
        hidden: l.hidden,
        images: (images ?? []).map((i) => i.url),
        sellerId: l.seller_id,
        sellerName: seller?.nickname || seller?.display_name || null,
        sellerAvatar: seller?.avatar_url ?? null,
        sellerDepartment: seller?.department ?? null,
        sellerHasQr: Boolean(seller?.payment_qr_path),
        queueCount: q.length,
        myQueuePosition: mine >= 0 ? mine + 1 : 0,
        canManage,
        createdAt: l.created_at,
      },
      /* ★ อาร์เรย์ว่างเมื่อไม่ใช่เจ้าของ — ไม่ใช่ null ★★ หน้าเว็บจะได้
           ไม่ต้องเขียนเงื่อนไขสองแบบ แค่ .map() แล้วไม่ได้อะไรออกมา */
      queue: canManage
        ? q.map((r, i) => ({
            userId: r.user_id,
            name: byId.get(r.user_id)?.nickname || byId.get(r.user_id)?.display_name || '—',
            avatarUrl: byId.get(r.user_id)?.avatar_url ?? null,
            position: i + 1,
            at: r.created_at,
          }))
        : [],
    })
  },
)

/** การกระทำกับประกาศหนึ่งชิ้น (FR-D04 / D05 / D07 / D10) */
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve') }),
  z.object({ action: z.literal('report'), reason: z.string().trim().max(200).optional() }),
  z.object({
    action: z.literal('status'),
    status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD']),
    buyerId: z.uuid().optional().nullable(),
  }),
  /**
   * FR-D07 — สร้างรายการค้างจ่ายให้ผู้ซื้อ
   * ★ ใช้ create_expense_bill ของโมดูล B ตัวเดิม ไม่ทำระบบเงินซ้ำ
   *   ผู้ซื้อจึงเห็นรายการนี้ในหน้ายอดค้างเดียวกับค่าข้าว
   */
  z.object({ action: z.literal('bill'), buyerId: z.uuid() }),
])

export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/market/[id]'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const body = await parseJsonBody(request, actionSchema)
    const actor = await requireOfficeUser()
    await enforceRateLimit('marketAction', actor.id)

    const admin = getSupabaseAdminClient()

    if (body.action === 'reserve') {
      const { data, error } = await admin.rpc('toggle_reservation', {
        p_actor: actor.id,
        p_id: id,
      })
      if (error) throw fromPostgresError(error)
      return ok({ reserved: data?.reserved ?? false, queue: data?.queue ?? 0 })
    }

    if (body.action === 'report') {
      const { data, error } = await admin.rpc('report_listing', {
        p_actor: actor.id,
        p_id: id,
        p_reason: body.reason ?? null,
      })
      if (error) throw fromPostgresError(error)
      return ok({
        reports: data?.reports ?? 0,
        threshold: data?.threshold ?? 3,
        hidden: data?.hidden ?? false,
      })
    }

    if (body.action === 'status') {
      const { data, error } = await admin.rpc('set_listing_status', {
        p_actor: actor.id,
        p_id: id,
        p_status: body.status,
        p_buyer: body.buyerId ?? null,
      })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    /* ── สร้างรายการค้างจ่ายจากประกาศ (FR-D07) ──────────────────── */
    const { data: listing, error: readError } = await admin
      .from('listings')
      .select('id, seller_id, title, price, kind')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw fromPostgresError(readError)
    if (!listing) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    /* ★ เฉพาะผู้ขาย — คนซื้อสร้างหนี้ให้ตัวเองไม่ได้ (จะกลายเป็นหนี้ปลอม) */
    if (listing.seller_id !== actor.id) throw new AppError('FORBIDDEN')
    if (listing.price <= 0) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.noPriceForBill' })
    }

    const { data: bill, error: billError } = await admin.rpc('create_expense_bill', {
      p_actor: actor.id,
      p_title: listing.title,
      p_total: listing.price,
      p_category: 'OTHER',
      p_date: null,
      p_receipt: null,
      p_split: 'CUSTOM',
      p_shares: [{ userId: body.buyerId, amount: listing.price }],
      /* ★ ผู้ขายไม่ได้ "ร่วมจ่าย" — เขาเป็นคนรับเงินทั้งก้อน */
      p_include_self: false,
    })

    if (billError) throw fromPostgresError(billError)
    return ok({ billId: bill?.id })
  },
)

export const DELETE = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/market/[id]'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    await enforceRateLimit('marketAction', actor.id)

    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('delete_listing', { p_actor: actor.id, p_id: id })
    if (error) throw fromPostgresError(error)

    return ok({ deleted: id })
  },
)
