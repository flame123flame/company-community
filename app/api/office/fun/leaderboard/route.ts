import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/fun/leaderboard — เลขยอดฮิตงวดนี้ (FR-C12)
 *
 * ★ RPC คืนเฉพาะเลข + จำนวนครั้ง ไม่มี user_id เลย
 *   (เหตุผลเต็มอยู่ใน migration 0030 — ตาราง lottery_picks เป็นของส่วนตัว)
 */
export const GET = withErrorHandling(async () => {
  await requireOfficeUser()

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('lottery_leaderboard', { p_limit: 10 })
  if (error) throw fromPostgresError(error)

  return ok({ items: data ?? [] })
})
