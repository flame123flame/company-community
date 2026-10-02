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
 * การกระทำกับร้านหนึ่งร้าน
 *
 * ★★ รวม vote / report / visit ไว้ใน POST เดียวด้วยฟิลด์ action
 *
 *    ทางเลือกคือแยกเป็น /vote /report /visit สามไฟล์ ซึ่งอ่านง่ายกว่าเล็กน้อย
 *    ★ แต่ทั้งสามทำสิ่งเดียวกันเป๊ะในโครงสร้าง: ตรวจสิทธิ์ → เรียก RPC → คืนแถว
 *      การแยกไฟล์แปลว่าต้องคัดลอกด่านตรวจสามรอบ ซึ่งเป็นที่ที่ความต่าง
 *      จะแอบเข้ามาโดยไม่มีใครสังเกต (เช่นลืม rate limit ในไฟล์ที่สาม)
 */

const idSchema = z.uuid()

function parseId(raw: string): string {
  const parsed = idSchema.safeParse(raw)
  if (!parsed.success) throw new AppError('VALIDATION_FAILED')
  return parsed.data
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('vote') }),
  z.object({ action: z.literal('reportClosed') }),
  z.object({ action: z.literal('visit') }),
])

/** POST /api/office/food/restaurants/[id] — เห็นด้วย · แจ้งปิด · บันทึกการไป */
/**
 * GET /api/office/food/restaurants/[id] — ร้านเดียว พร้อมสถิติการกินของออฟฟิศ
 *
 * ★★★ "คนในออฟฟิศกินร้านนี้ X ครั้งในเดือนนี้" นับจากบิลจริง
 *
 *     ★ ไม่ได้นับจาก restaurant_visits ซึ่งเป็นการกด "เคยไปมาแล้ว" ด้วยมือ
 *       ★★ คนกดปุ่มนั้นน้อยมาก ★ ส่วนบิลค่าข้าวถูกสร้างทุกครั้งที่มีการจ่ายเงินจริง
 *          ซึ่งเป็นหลักฐานที่เชื่อได้มากกว่าและไม่ต้องขอให้ใครทำอะไรเพิ่ม
 *     ★★ นับ "บิล" ไม่ใช่ "คน" — บิลหนึ่งใบคือการไปกินหนึ่งครั้งของกลุ่มหนึ่งกลุ่ม
 *
 * ★ นับของทั้งออฟฟิศ ไม่ใช่ของฉันคนเดียว
 *   ★★ คำถามคือ "ร้านนี้คนที่นี่ชอบไหม" ไม่ใช่ "ฉันไปบ่อยแค่ไหน"
 */
export const GET = withErrorHandling(
  async (_request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
    const actor = await requireOfficeUser()
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const admin = getSupabaseAdminClient()

    const { data: r, error } = await admin
      .from('restaurants')
      .select(
        'id, name, signature_dish, image_path, cuisine, price_range, distance, map_url, note, added_by, vote_count, maybe_closed, created_at',
      )
      .eq('id', id)
      .maybeSingle()

    if (error) throw fromPostgresError(error)
    if (!r) throw new AppError('ROOM_NOT_FOUND')

    /* ★ ต้นเดือนนี้ตามเวลาเครื่อง server — ตรงกับช่วงที่หน้าสรุปค่าข้าวใช้ */
    const now = new Date()
    const monthFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [{ data: votes }, { data: bills }, { data: adder }] = await Promise.all([
      admin.from('restaurant_votes').select('user_id').eq('restaurant_id', id).eq('user_id', actor.id),
      /*
       * ★★ ห่อ try ไม่ได้ใน Promise.all — ถ้า restaurant_id ยังไม่เคยถูกเขียน
       *    ผลลัพธ์จะเป็นอาร์เรย์ว่าง ซึ่งถูกต้องอยู่แล้ว ไม่ใช่ error
       */
      admin
        .from('expense_bills')
        .select('id, payer_id, bill_date')
        .eq('restaurant_id', id)
        .gte('bill_date', monthFrom),
      r.added_by
        ? admin.from('profiles').select('display_name, nickname').eq('id', r.added_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    return ok({
      restaurant: {
        id: r.id,
        name: r.name,
        signatureDish: r.signature_dish,
        imagePath: r.image_path,
        cuisine: r.cuisine,
        priceRange: r.price_range,
        distance: r.distance,
        mapUrl: r.map_url,
        note: r.note,
        addedBy: r.added_by,
        addedByName: adder?.nickname || adder?.display_name || null,
        voteCount: r.vote_count,
        maybeClosed: r.maybe_closed,
        voted: (votes ?? []).length > 0,
        canManage: r.added_by === actor.id || actor.isAdmin,
      },
      /** จำนวนบิลของร้านนี้ในเดือนนี้ — ทั้งออฟฟิศ */
      visitsThisMonth: (bills ?? []).length,
      /** ฉันเองกินร้านนี้กี่ครั้งในเดือนนี้ (เป็นคนจ่าย) */
      myVisitsThisMonth: (bills ?? []).filter((b) => b.payer_id === actor.id).length,
    })
  },
)

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
  assertSameOrigin(request)

  /* ★ Next.js 16: params เป็น Promise เสมอ ต้อง await */
  const { id: rawId } = await context.params
  const id = parseId(rawId)

  const body = await parseJsonBody(request, actionSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('foodAction', actor.id)

  const admin = getSupabaseAdminClient()

  if (body.action === 'vote') {
    const { data, error } = await admin.rpc('toggle_restaurant_vote', {
      p_actor: actor.id,
      p_id: id,
    })
    if (error) throw fromPostgresError(error)
    return ok({ voteCount: data?.vote_count ?? 0 })
  }

  if (body.action === 'reportClosed') {
    const { data, error } = await admin.rpc('report_restaurant_closed', {
      p_actor: actor.id,
      p_id: id,
    })
    if (error) throw fromPostgresError(error)
    return ok({
      reports: data?.reports ?? 0,
      threshold: data?.threshold ?? 3,
      maybeClosed: data?.maybeClosed ?? false,
    })
  }

  const { error } = await admin.rpc('log_restaurant_visit', { p_actor: actor.id, p_id: id })
  if (error) throw fromPostgresError(error)
  return ok({ logged: true })
})

const updateSchema = z.object({
  name: z.string().trim().min(1, 'common.required').max(80),
  signatureDish: z.string().trim().min(1, 'common.required').max(120),
  cuisine: z.string().trim().max(40).optional().nullable(),
  priceRange: z.enum(['฿', '฿฿', '฿฿฿']).optional().nullable(),
  distance: z.enum(['WALK', 'DRIVE', 'DELIVERY']).optional().nullable(),
  mapUrl: z.url().startsWith('https://').max(500).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(300).optional().nullable(),
  clearClosed: z.boolean().optional(),
})

/** PATCH — แก้ไขร้าน (FR-A06) · สิทธิ์ตรวจใน RPC */
export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
  assertSameOrigin(request)

  const { id: rawId } = await context.params
  const id = parseId(rawId)

  const body = await parseJsonBody(request, updateSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('foodAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('update_restaurant', {
    p_actor: actor.id,
    p_id: id,
    p_name: body.name,
    p_dish: body.signatureDish,
    p_cuisine: body.cuisine ?? null,
    p_price: body.priceRange ?? null,
    p_distance: body.distance ?? null,
    p_map_url: body.mapUrl || null,
    p_note: body.note ?? null,
    p_clear_closed: body.clearClosed ?? false,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data?.id, maybeClosed: data?.maybe_closed ?? false })
})

/** DELETE — ลบร้าน (FR-A06) */
export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
  assertSameOrigin(request)

  const { id: rawId } = await context.params
  const id = parseId(rawId)

  const actor = await requireOfficeUser()
  await enforceRateLimit('foodAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('delete_restaurant', { p_actor: actor.id, p_id: id })
  if (error) throw fromPostgresError(error)

  return ok({ deleted: id })
})
