import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/market — ประกาศทั้งหมด (FR-D03)
 *
 * ★ อ่านด้วย admin client แล้วกรอง hidden เอง แทนการพึ่ง RLS
 *   เพราะต้องคำนวณ canManage และ myQueuePosition ต่อแถวอยู่แล้ว
 *   ★ กฎการมองเห็นที่นี่ต้องตรงกับ policy ใน 0029 เป๊ะ ๆ:
 *     ซ่อนแล้วเห็นได้เฉพาะเจ้าของกับ Admin
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const { data: rows, error } = await admin
    .from('listings')
    .select(
      'id, seller_id, title, price, kind, category, condition, description, meet_building, meet_floor, meet_desk, status, hidden, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) throw fromPostgresError(error)

  const visible = (rows ?? []).filter(
    (l) => !l.hidden || l.seller_id === actor.id || actor.isAdmin,
  )
  const ids = visible.map((l) => l.id)

  if (ids.length === 0) return ok({ items: [] })

  const [{ data: images }, { data: reservations }, { data: sellers }] = await Promise.all([
    admin.from('listing_images').select('listing_id, url, sort').in('listing_id', ids),
    admin
      .from('listing_reservations')
      .select('listing_id, user_id, position, status')
      .in('listing_id', ids)
      .eq('status', 'ACTIVE'),
    admin
      .from('profiles')
      .select('id, display_name, nickname, avatar_url, department, payment_qr_path')
      .in('id', [...new Set(visible.map((l) => l.seller_id))]),
  ])

  const imageMap = new Map<string, string[]>()
  for (const img of (images ?? []).sort((a, b) => a.sort - b.sort)) {
    const list = imageMap.get(img.listing_id) ?? []
    list.push(img.url)
    imageMap.set(img.listing_id, list)
  }

  /* ★ คิวของแต่ละประกาศ เรียงตาม position เพื่อหาว่าฉันอยู่ลำดับที่เท่าไหร่ */
  const queueMap = new Map<string, { userId: string; position: number }[]>()
  for (const r of reservations ?? []) {
    const list = queueMap.get(r.listing_id) ?? []
    list.push({ userId: r.user_id, position: r.position })
    queueMap.set(r.listing_id, list)
  }
  for (const list of queueMap.values()) list.sort((a, b) => a.position - b.position)

  const sellerMap = new Map(
    (sellers ?? []).map((p) => [
      p.id,
      {
        name: p.nickname || p.display_name,
        /* ★ รูปกับฝ่าย — การ์ดใหม่ให้คนขายเด่นขึ้น ไม่ใช่บรรทัดจาง ๆ ท้ายการ์ด
             ★★ ของมือสองซื้อขายกันด้วยความไว้ใจ คนซื้อดูก่อนว่า "ใครขาย" */
        avatarUrl: p.avatar_url,
        department: p.department,
        hasQr: Boolean(p.payment_qr_path),
      },
    ]),
  )

  return ok({
    items: visible.map((l) => {
      const queue = queueMap.get(l.id) ?? []
      const mine = queue.findIndex((q) => q.userId === actor.id)
      const seller = sellerMap.get(l.seller_id)

      return {
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
        images: imageMap.get(l.id) ?? [],
        sellerId: l.seller_id,
        sellerName: seller?.name ?? null,
        sellerAvatar: seller?.avatarUrl ?? null,
        sellerDepartment: seller?.department ?? null,
        sellerHasQr: seller?.hasQr ?? false,
        queueCount: queue.length,
        myQueuePosition: mine >= 0 ? mine + 1 : 0,
        canManage: l.seller_id === actor.id || actor.isAdmin,
        createdAt: l.created_at,
      }
    }),
  })
})

const createSchema = z.object({
  title: z.string().trim().min(1, 'common.required').max(100),
  price: z.number().min(0).max(9_999_999).default(0),
  kind: z.enum(['SELL', 'FREE', 'TRADE', 'WANTED']).default('SELL'),
  category: z
    .enum(['ELECTRONICS', 'FURNITURE', 'CLOTHES', 'BOOKS', 'SPORTS', 'FOOD', 'PLANT', 'OTHER'])
    .default('OTHER'),
  condition: z.enum(['NEW', 'GOOD', 'FLAWED']).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  building: z.string().trim().max(40).optional().nullable(),
  floor: z.string().trim().max(20).optional().nullable(),
  desk: z.string().trim().max(40).optional().nullable(),
  /** ★ FR-D01 บังคับรูป — ตรวจทั้งที่นี่และใน RPC */
  images: z.array(z.url().startsWith('https://')).min(1, 'valid.needImage').max(5),
})

/** POST /api/office/market — ลงประกาศ (FR-D01) */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, createSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('createListing', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('create_listing', {
    p_actor: actor.id,
    p_title: body.title,
    p_price: body.price,
    p_kind: body.kind,
    p_category: body.category,
    p_condition: body.condition ?? null,
    p_description: body.description ?? null,
    p_building: body.building ?? null,
    p_floor: body.floor ?? null,
    p_desk: body.desk ?? null,
    p_images: body.images,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data?.id, title: data?.title })
})
