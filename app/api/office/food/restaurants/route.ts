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
 * GET /api/office/food/restaurants — รายการร้าน (FR-A03)
 *
 * ★★ คืน "ร้านที่ฉันกดเห็นด้วยแล้ว" มาด้วยในคำขอเดียว
 *
 *    หน้าเว็บต้องรู้ว่าปุ่มไหนควรเป็นสถานะกดแล้ว ★ ถ้าไม่ส่งมาด้วย
 *    หน้าจะต้องยิงอีกคำขอ แล้วปุ่มจะกระพริบจาก "ยังไม่กด" เป็น "กดแล้ว"
 *    หลังโหลดเสร็จ ซึ่งทำให้คนกดซ้ำโดยไม่ตั้งใจ
 */
/** คอลัมน์ที่มีมาตั้งแต่ 0025 — มีอยู่แน่นอนไม่ว่า migration ใหม่จะรันหรือยัง */
const BASE_COLUMNS =
  'id, name, signature_dish, image_path, cuisine, price_range, distance, map_url, note, added_by, vote_count, maybe_closed, created_at'

/** คอลัมน์พิกัด/เวลาทำการจาก 0050 */
const GEO_COLUMNS = 'lat, lng, travel_meters, travel_minutes, travel_mode, open_hours'

/** แถวร้านที่หน้าเว็บใช้ — ช่องจาก 0050 เป็น optional เพราะอาจยังไม่มีคอลัมน์ */
type Row = {
  id: string
  name: string
  signature_dish: string
  image_path: string | null
  cuisine: string | null
  price_range: string | null
  distance: string | null
  map_url: string | null
  note: string | null
  added_by: string | null
  vote_count: number
  maybe_closed: boolean
  created_at: string
  lat?: number | null
  lng?: number | null
  travel_meters?: number | null
  travel_minutes?: number | null
  travel_mode?: string | null
  open_hours?: unknown
}

export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()

  const admin = getSupabaseAdminClient()

  /*
   * ★★★ คอลัมน์พิกัด/เวลาทำการมาจาก 0050 ซึ่งอาจยังไม่ถูกรัน
   *
   *     ★ ต่างจาก rating ตรงที่พวกนี้อยู่ตารางเดียวกับของเดิม จึงแยก
   *       เป็นคำขอต่างหากไม่ได้โดยไม่ยิงซ้ำทั้งตาราง
   *     ★★ ทางออก: ลองชุดเต็มก่อน ถ้าล้มค่อยถอยไปชุดเดิม
   *        ร้านทุกร้านยังแสดงได้ปกติ แค่ไม่มีระยะทาง ซึ่งเป็นสถานะเดียวกับ
   *        "ร้านที่ยังไม่มีพิกัด" ที่ข้อกำหนดบอกให้ซ่อนส่วนนั้นอยู่แล้ว
   */
  const listQuery = (columns: string) =>
    admin
      .from('restaurants')
      .select(columns)
      /*
       * ★ เรียงตามที่ FR-A05 กำหนด: ร้านที่อาจปิดไปอยู่ท้ายสุดเสมอ
       *   แล้วค่อยเรียงตามคะแนน (FR-A04) — สองข้อนี้ต้องอยู่ในลำดับนี้
       *   ไม่งั้นร้านที่ปิดแล้วแต่คะแนนสูงจะยังอยู่บนสุด
       */
      .order('maybe_closed', { ascending: true })
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: false })

  const [full, { data: votes, error: voteError }] = await Promise.all([
    listQuery(`${BASE_COLUMNS}, ${GEO_COLUMNS}`),
    admin.from('restaurant_votes').select('restaurant_id').eq('user_id', actor.id),
  ])

  let rows = full.data as unknown as Row[] | null
  let error = full.error

  if (error) {
    const fallback = await listQuery(BASE_COLUMNS)
    rows = fallback.data as unknown as Row[] | null
    error = fallback.error
  }

  if (error) throw fromPostgresError(error)
  if (voteError) throw fromPostgresError(voteError)

  const mine = new Set((votes ?? []).map((v) => v.restaurant_id))

  /*
   * ── ดาวเฉลี่ย + รูปปกจากรีวิว ────────────────────────────────────
   *
   * ★★★ แยกเป็นคำขอต่างหาก และยอมให้มันล้มได้เงียบ ๆ
   *
   *     คอลัมน์ rating_sum/rating_count มาจาก migration 0049
   *     ★ ถ้าใส่ไว้ใน select ก้อนหลักแล้ว migration ยังไม่ถูกรัน
   *       ทั้งคำขอจะ error → หน้าร้านเด็ดว่างเปล่าทั้งหน้า
   *       ★★ ฟีเจอร์ใหม่ที่ยังไม่พร้อม ไม่ควรทำให้ของเดิมที่ทำงานอยู่พัง
   *          โปรเจกต์นี้เคยเจอมาแล้วกับคอลัมน์ใหม่ที่อ่านตรง ๆ
   *
   *     ★ ล้ม = ไม่มีดาว ไม่มีปก ซึ่งเป็นหน้าตาเดียวกับ "ยังไม่มีใครรีวิว"
   *       ที่ผู้ใช้เข้าใจได้อยู่แล้ว
   */
  const ratings = new Map<string, { sum: number; count: number }>()
  const covers = new Map<string, string>()

  const { data: ratingRows, error: ratingError } = await admin
    .from('restaurants')
    .select('id, rating_sum, rating_count')

  if (!ratingError) {
    for (const r of ratingRows ?? []) {
      ratings.set(r.id, { sum: r.rating_sum ?? 0, count: r.rating_count ?? 0 })
    }

    /*
     * ★ รูปปก = รูปล่าสุดจากรีวิวของร้านนั้น
     *   ★★ ดึงรีวิวใหม่สุดมาจำนวนจำกัดแล้วหยิบใบแรกต่อร้านในหน่วยความจำ
     *      ไม่ใช่ยิงต่อร้านหนึ่งคำขอ — ร้านห้าสิบแห่ง = ห้าสิบคำขอ
     */
    const { data: photoRows } = await admin
      .from('restaurant_review_photos')
      .select('path, created_at, restaurant_reviews!inner(restaurant_id, created_at)')
      .order('created_at', { ascending: false })
      .limit(500)

    for (const row of (photoRows ?? []) as unknown as {
      path: string
      restaurant_reviews: { restaurant_id: string } | { restaurant_id: string }[]
    }[]) {
      const rel = Array.isArray(row.restaurant_reviews)
        ? row.restaurant_reviews[0]
        : row.restaurant_reviews
      if (!rel) continue
      /* ★ ใบแรกที่เจอคือใบล่าสุด เพราะเรียงมาแล้ว — ใบถัดไปไม่ต้องทับ */
      if (!covers.has(rel.restaurant_id)) {
        covers.set(rel.restaurant_id, admin.storage.from('reviews').getPublicUrl(row.path).data.publicUrl)
      }
    }
  }

  /* ชื่อผู้แนะนำ (FR-A03) — ดึงชุดเดียวแล้วต่อในหน่วยความจำ */
  const addedBy = [...new Set((rows ?? []).map((r) => r.added_by).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (addedBy.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, nickname')
      .in('id', addedBy)
    for (const p of profiles ?? []) names.set(p.id, p.nickname || p.display_name)
  }

  return ok({
    items: (rows ?? []).map((r) => ({
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
      addedByName: r.added_by ? (names.get(r.added_by) ?? null) : null,
      voteCount: r.vote_count,
      maybeClosed: r.maybe_closed,
      voted: mine.has(r.id),
      /*
       * ★ ต้องส่งลงไปด้วย ไม่งั้นตัวเลือกเรียง "เพิ่มล่าสุด" เรียงไม่ได้จริง
       *   ★★ ของเดิมมีตัวเลือกนั้นอยู่แล้ว แต่ฝั่งหน้าเว็บได้แค่ดันร้านที่ปิด
       *      ไปท้าย แล้วพึ่งลำดับที่ server ส่งมา — ซึ่งเรียงตามคะแนน
       *      ★ ผลคือกด "เพิ่มล่าสุด" แล้วลำดับแทบไม่ขยับ และไม่มีอะไรฟ้อง
       *        เพราะหน้าจอก็ "เรียงใหม่" จริง ๆ แค่เรียงด้วยกุญแจที่ไม่มีความหมาย
       */
      createdAt: r.created_at,
      /*
       * ★ ส่งทั้ง "ดาวเฉลี่ย" และ "จำนวนรีวิว" ไม่ใช่ส่งแค่เฉลี่ย
       *   ★★ ★4.0 จากรีวิวเดียว กับ ★4.0 จาก 40 รีวิว ไม่ใช่ข้อมูลเดียวกัน
       *      การซ่อนจำนวนไว้ทำให้ร้านที่เพิ่งมีคนรีวิวคนเดียวดูน่าเชื่อเท่ากัน
       */
      ratingCount: ratings.get(r.id)?.count ?? 0,
      rating:
        (ratings.get(r.id)?.count ?? 0) > 0
          ? (ratings.get(r.id)!.sum / ratings.get(r.id)!.count)
          : null,
      coverUrl: covers.get(r.id) ?? null,
      /* ★ ?? null ทุกช่อง — เส้นทางถอยไม่มีคอลัมน์พวกนี้เลย
           หน้าเว็บจึงได้ null เหมือนร้านที่ยังไม่ได้ปักพิกัด ซึ่งมันรับมือได้อยู่แล้ว */
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      travelMeters: r.travel_meters ?? null,
      travelMinutes: r.travel_minutes ?? null,
      travelMode: (r.travel_mode ?? null) as 'walking' | 'driving' | null,
      openHours: (r.open_hours ?? null) as Record<string, [string, string] | null> | null,
      /** ★ แก้/ลบได้ไหม — คำนวณฝั่ง server ที่เดียว หน้าเว็บไม่ต้องรู้กติกา */
      canManage: r.added_by === actor.id || actor.isAdmin,
    })),
    /** รายชื่อประเภทอาหารที่มีจริง — ใช้สร้างตัวกรองโดยไม่ต้อง hardcode */
    cuisines: [...new Set((rows ?? []).map((r) => r.cuisine).filter(Boolean))].sort(),
  })
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'common.required').max(80),
  signatureDish: z.string().trim().min(1, 'common.required').max(120),
  cuisine: z.string().trim().max(40).optional().nullable(),
  priceRange: z.enum(['฿', '฿฿', '฿฿฿']).optional().nullable(),
  distance: z.enum(['WALK', 'DRIVE', 'DELIVERY']).optional().nullable(),
  mapUrl: z.url().startsWith('https://').max(500).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(300).optional().nullable(),
  /* ★ พิกัดไม่บังคับ — ร้านที่ไม่มีก็ใช้งานได้ทุกอย่างยกเว้นระยะทาง */
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  /* ★ {"mon":["09:00","18:00"], "sun":null, …} — รูปแบบเดียวกับที่ isOpenNow อ่าน */
  openHours: z
    .record(z.string(), z.tuple([z.string(), z.string()]).nullable())
    .optional()
    .nullable(),
})

/** POST /api/office/food/restaurants — เพิ่มร้าน (FR-A01) */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, createSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('addRestaurant', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('add_restaurant', {
    p_actor: actor.id,
    p_name: body.name,
    p_dish: body.signatureDish,
    p_cuisine: body.cuisine ?? null,
    p_price: body.priceRange ?? null,
    p_distance: body.distance ?? null,
    p_map_url: body.mapUrl || null,
    p_note: body.note ?? null,
  })

  if (error) throw fromPostgresError(error)

  /*
   * ★★ ตั้งพิกัดเป็นขั้นที่สอง ไม่ยัดเพิ่มเข้า add_restaurant
   *    ★ การเปลี่ยนลายเซ็น RPC ที่ของเดิมเรียกอยู่ แปลว่าต้องแก้ทุกจุด
   *      ที่เรียกมันพร้อมกันเป๊ะ ๆ — ความเสี่ยงที่ไม่จำเป็นกับฟีเจอร์ใหม่
   *    ★★ ถ้าขั้นนี้ล้ม ร้านยังถูกสร้างสำเร็จ แค่ไม่มีพิกัด ซึ่งเป็น
   *       สถานะที่ถูกต้องอยู่แล้วสำหรับร้านเก่าทุกแห่ง
   */
  /* ★ เวลาเปิด-ปิดเขียนตรง ๆ ได้ ไม่ต้องผ่าน RPC — มันไม่กระทบอะไรนอกแถวตัวเอง */
  if (data?.id && body.openHours) {
    await admin.from('restaurants').update({ open_hours: body.openHours } as never).eq('id', data.id)
  }

  if (data?.id && body.lat != null && body.lng != null) {
    await admin.rpc('set_restaurant_latlng', {
      p_actor: actor.id,
      p_id: data.id,
      p_lat: body.lat,
      p_lng: body.lng,
    })
  }

  return ok({ id: data?.id, name: data?.name })
})
