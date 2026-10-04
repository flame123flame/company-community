import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { cuisineSchema, karaokeSchema, karaokeToStore, readKaraoke } from '@/lib/office/food-schema'
import { KARAOKE as KARAOKE_CUISINE } from '@/lib/office/food'

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

    /*
     * ★★ คอลัมน์พิกัดมาจาก 0050 — ลองชุดเต็มก่อน ถ้าล้มถอยไปชุดเดิม
     *    ★ เหตุผลเดียวกับหน้ารายการ: หน้ารายละเอียดต้องเปิดได้เสมอ
     *      ต่อให้ migration ยังไม่ถูกรัน
     */
    const BASE =
      'id, name, signature_dish, image_path, cuisine, price_range, distance, map_url, note, added_by, vote_count, maybe_closed, created_at'

    const full = await admin
      .from('restaurants')
      .select(`${BASE}, lat, lng, travel_meters, travel_minutes, travel_mode, open_hours`)
      .eq('id', id)
      .maybeSingle()

    let r = full.data as unknown as (Record<string, unknown> & { added_by: string | null }) | null
    let error = full.error

    if (error) {
      const fallback = await admin.from('restaurants').select(BASE).eq('id', id).maybeSingle()
      r = fallback.data as unknown as (Record<string, unknown> & { added_by: string | null }) | null
      error = fallback.error
    }

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

    /* ★ อ่านแบบล้มแล้วถอยได้ — คอลัมน์มาจาก 0049 */
    let ratingSum = 0
    let ratingCount = 0
    {
      const { data: agg } = await admin
        .from('restaurants')
        .select('rating_sum, rating_count')
        .eq('id', id)
        .maybeSingle()
      ratingSum = agg?.rating_sum ?? 0
      ratingCount = agg?.rating_count ?? 0
    }

    const shopDishes: { name: string; price: number | null; photo: string | null; photoUrl: string | null }[] = []
    {
      const { data: dishRows } = await admin
        .from('restaurant_dishes')
        .select('name, price_satang, photo_path')
        .eq('restaurant_id', id)
        .order('sort', { ascending: true })
      for (const row of dishRows ?? []) {
        shopDishes.push({
          name: row.name,
          price: row.price_satang == null ? null : row.price_satang / 100,
          photo: row.photo_path,
          photoUrl: row.photo_path ? admin.storage.from('restaurants').getPublicUrl(row.photo_path).data.publicUrl : null,
        })
      }
    }

    const shopPhotos: { id: string; url: string }[] = []
    {
      const { data: photoRows } = await admin
        .from('restaurant_photos')
        .select('id, path')
        .eq('restaurant_id', id)
        .order('sort', { ascending: true })
      for (const row of photoRows ?? []) {
        shopPhotos.push({
          id: row.id,
          url: admin.storage.from('restaurants').getPublicUrl(row.path).data.publicUrl,
        })
      }
    }

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
        /* ★ ?? null ทุกช่อง — เส้นทางถอยไม่มีคอลัมน์พวกนี้ */
        lat: (r.lat as number | null) ?? null,
        lng: (r.lng as number | null) ?? null,
        travelMeters: (r.travel_meters as number | null) ?? null,
        travelMinutes: (r.travel_minutes as number | null) ?? null,
        travelMode: (r.travel_mode as 'walking' | 'driving' | null) ?? null,
        openHours: (r.open_hours as Record<string, [string, string] | null> | null) ?? null,
        /* ── 0061 ── ราคาคาราโอเกะ (อ่านแยก ล้มได้) */
        karaoke: (await readKaraoke(admin, [id])).get(id) ?? null,
        /*
         * ── 0056 ── รูปของร้าน
         * ★ ล้มแล้วถอยได้ — ตารางมาจาก migration 0056 ซึ่งอาจยังไม่ได้รัน
         *   ★★ หน้ารายละเอียดต้องไม่พังทั้งหน้าเพราะแกลเลอรีว่าง
         */
        photos: shopPhotos,
        /* ── 0057 ── รายการเมนู (แปลงสตางค์เป็นบาทที่นี่ที่เดียว) */
        dishes: shopDishes,
        /*
         * ── 0049 ── ดาวเฉลี่ยและจำนวนรีวิว
         * ★ ส่งทั้งคู่เสมอ ★★ ★4.0 จากรีวิวเดียว กับ ★4.0 จาก 40 รีวิว
         *   ไม่ใช่ข้อมูลเดียวกัน
         */
        rating: ratingCount > 0 ? ratingSum / ratingCount : null,
        ratingCount,
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
  /* ── 0061 ── ประเภทจากรายการตายตัว + ราคาคาราโอเกะ */
  cuisine: cuisineSchema,
  karaoke: karaokeSchema,
  priceRange: z.enum(['฿', '฿฿', '฿฿฿']).optional().nullable(),
  distance: z.enum(['WALK', 'DRIVE', 'DELIVERY']).optional().nullable(),
  mapUrl: z.url().startsWith('https://').max(500).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(300).optional().nullable(),
  clearClosed: z.boolean().optional(),
  /* ── 0057 ── เมนูเด็ดหลายรายการ ราคาไม่บังคับ */
  dishes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        price: z.number().min(0).max(100000).optional().nullable(),
        /* ── 0060 ── รูปของเมนู */
        photo: z.string().regex(/^dishes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/).optional().nullable(),
      }),
    )
    .max(20)
    .optional(),
  /* ★ ชุดเดียวกับตอนสร้างร้าน — ส่งมาคู่กันเท่านั้นถึงจะถูกใช้ */
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
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

  /*
   * ★★★ 0061 — เปลี่ยนจากคาราโอเกะเป็นประเภทอื่น: ล้างราคาคาราโอเกะ "ก่อน" update_restaurant
   *
   *     ★ constraint restaurants_karaoke_shape ห้ามมีราคาคาราโอเกะในร้านที่ไม่ใช่คาราโอเกะ
   *       ★★ ล้างทีหลังไม่ได้ — update_restaurant จะเปลี่ยนประเภทในขณะที่ราคายังค้างอยู่
   *          แล้ว constraint ปฏิเสธทั้งคำขอ (เจอจากการทดสอบจริง: ได้ 400)
   *     ★ ตรวจสิทธิ์เองก่อนเขียน — กฎเดียวกับใน update_restaurant (คนเพิ่มร้าน หรือผู้ดูแล)
   *       คนที่ไม่มีสิทธิ์ข้ามขั้นนี้ไป แล้ว RPC ปฏิเสธตามปกติ
   */
  if (body.cuisine !== KARAOKE_CUISINE) {
    const { data: own } = await admin.from('restaurants').select('added_by').eq('id', id).maybeSingle()
    if (own && (own.added_by === actor.id || actor.isAdmin)) {
      await admin.from('restaurants').update({ karaoke: null } as never).eq('id', id)
    }
  }

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

  /*
   * ★★★ แก้พิกัดได้หลังสร้างร้านแล้ว
   *
   *     ★ set_restaurant_latlng มีมาตั้งแต่ 0050 แต่ถูกเรียกที่เดียว
   *       คือตอนสร้างร้าน ★★ ร้านที่ปักหมุดผิด หรือร้านเก่าที่สร้างก่อน
   *       มีแผนที่ จึงแก้ไม่ได้เลยตลอดกาล และระยะทางของมันว่างไปตลอด
   *     ★ ล้มแล้วไม่ล้มทั้งคำขอ — ข้อมูลอื่นที่แก้ไปแล้วถูกบันทึกไปแล้ว
   *       ★★ การโยน error ตรงนี้จะทำให้หน้าจอบอกว่า "บันทึกไม่สำเร็จ"
   *          ทั้งที่ชื่อร้านกับโน้ตถูกเปลี่ยนไปเรียบร้อยแล้ว
   */
  /* ── 0061 ── ร้านคาราโอเกะ: เขียนราคาหลัง update_restaurant (สิทธิ์ผ่านแล้ว) */
  if (body.cuisine === KARAOKE_CUISINE && body.karaoke !== undefined) {
    await admin
      .from('restaurants')
      .update({ karaoke: karaokeToStore(body.cuisine, body.karaoke) } as never)
      .eq('id', id)
  }

  if (body.dishes && body.dishes.length > 0) {
    /* ★ ล้มแล้วไม่ล้มทั้งคำขอ — ข้อมูลอื่นถูกบันทึกไปแล้ว (เหตุผลเดียวกับพิกัด) */
    await admin.rpc('set_restaurant_dishes', {
      p_actor: actor.id,
      p_shop: id,
      p_dishes: body.dishes,
    })
  }

  if (body.lat != null && body.lng != null) {
    await admin.rpc('set_restaurant_latlng', {
      p_actor: actor.id,
      p_id: id,
      p_lat: body.lat,
      p_lng: body.lng,
    })
  }

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
