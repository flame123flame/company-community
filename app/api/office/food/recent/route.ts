import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/food/recent — ร้านที่ฉันเพิ่งไป (FR-A08)
 *
 * ★ คืนแค่รายชื่อ ไม่ได้สุ่มให้ — การสุ่มต้องเกิดฝั่ง client เท่านั้น
 *   (หลักการ FR-X05: ผลถูกสุ่มก่อนเริ่มแอนิเมชันเสมอ)
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const [{ data, error }, { data: setting }] = await Promise.all([
    admin.rpc('recent_restaurant_visits', { p_actor: actor.id }),
    admin.from('app_settings').select('value').eq('key', 'no_repeat_days').maybeSingle(),
  ])

  if (error) throw fromPostgresError(error)

  return ok({
    days: Number(setting?.value ?? 7),
    ids: (data ?? []).map((r) => r.restaurant_id),
  })
})
