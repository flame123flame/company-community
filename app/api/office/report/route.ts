import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  targetType: z.enum(['restaurant', 'listing']),
  targetId: z.uuid(),
  reason: z.string().trim().max(200).optional().nullable(),
})

/**
 * POST /api/office/report — รายงานเนื้อหา (FR-X08)
 *
 * ★ ปลายทางเดียวสำหรับทุกชนิดเนื้อหาที่รายงานได้
 *   เกณฑ์ "ครบ 3 คนแล้วซ่อน" จึงอยู่ที่เดียวจริง ๆ และ Admin ปรับได้
 *   จากหน้าตั้งค่าโดยไม่ต้อง deploy (อ่านผ่าน public.setting)
 *
 * ★★ คืนจำนวนกลับไปให้ UI ด้วย ไม่ใช่แค่ ok เปล่า ๆ
 *    ผู้ใช้ที่กดรายงานแล้วไม่เห็นอะไรเปลี่ยนจะกดซ้ำหรือคิดว่าปุ่มเสีย
 *    การบอกว่า "รายงานแล้ว 2 จาก 3 คน" ทำให้เขารู้ว่าระบบรับไปแล้ว
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('reportContent', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('report_content', {
    p_actor: actor.id,
    p_target_type: body.targetType,
    p_target_id: body.targetId,
    p_reason: body.reason ?? null,
  })

  if (error) throw fromPostgresError(error)

  return ok({
    reports: data?.reports ?? 0,
    threshold: data?.threshold ?? 3,
    hidden: data?.hidden ?? false,
  })
})
