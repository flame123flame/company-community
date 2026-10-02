import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireAdmin } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** แดชบอร์ดการใช้งาน (FR-X10) — Admin เท่านั้น */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireAdmin()

  /* ★ ช่วงเวลาถูกจำกัดซ้ำใน SQL ด้วย — ที่นี่แค่กันค่าที่ parse ไม่ได้ */
  const raw = Number(request.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), 365) : 30

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('office_usage_stats', { p_actor: actor.id, p_days: days })

  if (error) throw fromPostgresError(error)
  return ok({ stats: data })
})
