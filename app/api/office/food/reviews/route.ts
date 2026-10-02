import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const BUCKET = 'reviews'

/**
 * GET /api/office/food/reviews?shop={id} — รีวิวของร้าน เรียงใหม่ไปเก่า
 *
 * ★ คืนรูปเป็น url เต็มที่ประกอบจาก path ตอนอ่าน ไม่ใช่เก็บ url ไว้ในตาราง
 *   (เหตุผลอยู่ใน route อัปโหลด)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()

  const shop = new URL(request.url).searchParams.get('shop')
  if (!shop) throw new AppError('VALIDATION_FAILED')

  const admin = getSupabaseAdminClient()

  const { data: rows, error } = await admin
    .from('restaurant_reviews')
    .select('id, author_id, rating, body, at_shop, created_at, updated_at')
    .eq('restaurant_id', shop)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw fromPostgresError(error)

  const ids = (rows ?? []).map((r) => r.id)

  /*
   * ★ ดึงรูปและชื่อคนเขียนเป็นชุดเดียว แล้วต่อในหน่วยความจำ
   *   ★★ ไม่ใช่ยิงต่อรีวิวหนึ่งคำขอ — รีวิว 50 อันจะกลายเป็น 100 คำขอ
   *      ซึ่งเป็นรูปแบบ N+1 ที่ทำให้หน้าช้าขึ้นตามความสำเร็จของฟีเจอร์เอง
   */
  const [{ data: photos }, { data: profiles }] = await Promise.all([
    ids.length
      ? admin
          .from('restaurant_review_photos')
          .select('review_id, path, sort')
          .in('review_id', ids)
          .order('sort', { ascending: true })
      : Promise.resolve({ data: [] as { review_id: string; path: string; sort: number }[] }),
    admin
      .from('profiles')
      .select('id, display_name, nickname, avatar_url')
      .in('id', [...new Set((rows ?? []).map((r) => r.author_id))].length
        ? [...new Set((rows ?? []).map((r) => r.author_id))]
        : ['00000000-0000-0000-0000-000000000000']),
  ])

  const byReview = new Map<string, string[]>()
  for (const p of photos ?? []) {
    const url = admin.storage.from(BUCKET).getPublicUrl(p.path).data.publicUrl
    const list = byReview.get(p.review_id)
    if (list) list.push(url)
    else byReview.set(p.review_id, [url])
  }

  const who = new Map((profiles ?? []).map((p) => [p.id, p]))

  return ok({
    items: (rows ?? []).map((r) => {
      const p = who.get(r.author_id)
      return {
        id: r.id,
        rating: r.rating,
        body: r.body,
        atShop: r.at_shop,
        createdAt: r.created_at,
        authorId: r.author_id,
        authorName: p ? p.nickname || p.display_name : null,
        authorAvatar: p?.avatar_url ?? null,
        photos: byReview.get(r.id) ?? [],
        /** ★ คำนวณที่ server ที่เดียว — หน้าเว็บไม่ต้องรู้กติกาสิทธิ์ */
        canManage: r.author_id === actor.id || actor.isAdmin,
      }
    }),
  })
})

const writeSchema = z.object({
  shop: z.uuid(),
  /** มี = แก้ของเดิม · ไม่มี = เขียนใหม่ */
  reviewId: z.uuid().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional().nullable(),
  atShop: z.boolean().optional(),
  photos: z.array(z.string().min(1).max(400)).max(10).optional(),
})

/** POST /api/office/food/reviews — เขียนหรือแก้รีวิว */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('foodReview', actor.id)

  const body = await parseJsonBody(request, writeSchema)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('upsert_restaurant_review', {
    p_actor: actor.id,
    p_shop: body.shop,
    p_review: body.reviewId ?? null,
    p_rating: body.rating,
    p_body: body.body ?? null,
    p_at_shop: body.atShop ?? false,
    p_photos: body.photos ?? [],
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data as string })
})

/** DELETE /api/office/food/reviews?id={reviewId} */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('foodReview', actor.id)

  const id = new URL(request.url).searchParams.get('id')
  if (!id) throw new AppError('VALIDATION_FAILED')

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('delete_restaurant_review', {
    p_actor: actor.id,
    p_review: id,
  })

  if (error) throw fromPostgresError(error)
  /*
   * ★ RPC คืน false เมื่อ "ไม่มีแถวที่ลบได้" ซึ่งรวมทั้งไม่มีอยู่จริง
   *   และไม่ใช่ของฉัน — สองกรณีนี้ตอบเหมือนกันโดยตั้งใจ
   *   ★★ ตอบต่างกันเมื่อไหร่ คนนอกจะใช้มันไล่เดาว่า id ไหนมีอยู่จริง
   */
  if (!data) throw new AppError('FORBIDDEN')
  return ok({ deleted: true })
})
