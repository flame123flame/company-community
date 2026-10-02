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
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()

  const admin = getSupabaseAdminClient()

  const [{ data: rows, error }, { data: votes, error: voteError }] = await Promise.all([
    admin
      .from('restaurants')
      .select(
        'id, name, signature_dish, image_path, cuisine, price_range, distance, map_url, note, added_by, vote_count, maybe_closed, created_at',
      )
      /*
       * ★ เรียงตามที่ FR-A05 กำหนด: ร้านที่อาจปิดไปอยู่ท้ายสุดเสมอ
       *   แล้วค่อยเรียงตามคะแนน (FR-A04) — สองข้อนี้ต้องอยู่ในลำดับนี้
       *   ไม่งั้นร้านที่ปิดแล้วแต่คะแนนสูงจะยังอยู่บนสุด
       */
      .order('maybe_closed', { ascending: true })
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: false }),
    admin.from('restaurant_votes').select('restaurant_id').eq('user_id', actor.id),
  ])

  if (error) throw fromPostgresError(error)
  if (voteError) throw fromPostgresError(voteError)

  const mine = new Set((votes ?? []).map((v) => v.restaurant_id))

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
  return ok({ id: data?.id, name: data?.name })
})
