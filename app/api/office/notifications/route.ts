import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireActiveUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** จำนวนสูงสุดที่ดึงมาแสดงในกล่องกระดิ่ง */
const PAGE_SIZE = 30

/**
 * GET /api/office/notifications — รายการแจ้งเตือนของฉัน (FR-X04)
 *
 * ★ ใช้ admin client อ่าน แล้วกรองด้วย user_id ที่มาจาก session
 *   ไม่ใช่ปล่อยให้ client อ่านผ่าน RLS ตรง ๆ เพราะ:
 *     • ได้รูปแบบ response เดียวกับ API อื่นทั้งระบบ (แปล error ที่เดียว)
 *     • นับ unread ในคำขอเดียวกันได้ ไม่ต้องยิงสองรอบ
 *   ★ RLS ยังเป็นด่านสำรองอยู่ ถ้าวันหนึ่งมีใครเผลอเปิดให้ client อ่านเอง
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireActiveUser()
  await enforceRateLimit('notifications', actor.id)

  const admin = getSupabaseAdminClient()

  const { data, error } = await admin
    .from('notifications')
    .select('id, type, title_key, params, link, read_at, created_at')
    .eq('user_id', actor.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) throw fromPostgresError(error)

  /*
   * ★ นับ unread แยก ไม่ใช่นับจากรายการที่ดึงมา
   *   ถ้ามีแจ้งเตือนค้าง 50 ใบแต่ดึงมาแค่ 30 ตัวเลขบนกระดิ่งจะผิดเป็น 30
   *   head: true = ขอแค่จำนวน ไม่ต้องส่งแถวกลับมา
   */
  const { count, error: countError } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', actor.id)
    .is('read_at', null)

  if (countError) throw fromPostgresError(countError)

  return ok({
    items: (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      titleKey: row.title_key,
      params: (row.params ?? {}) as Record<string, unknown>,
      link: row.link,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    unread: count ?? 0,
  })
})

const markSchema = z.object({
  /** ไม่ส่ง = อ่านทั้งหมด */
  ids: z.array(z.uuid()).max(PAGE_SIZE).optional(),
})

/** POST /api/office/notifications — กดอ่านแล้ว */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, markSchema)
  const actor = await requireActiveUser()
  await enforceRateLimit('notifications', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('mark_notifications_read', {
    p_actor: actor.id,
    p_ids: body.ids ?? null,
  })

  if (error) throw fromPostgresError(error)
  return ok({ marked: data ?? 0 })
})
