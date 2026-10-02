import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** เลขที่บันทึกไว้ + วันออกรางวัลงวดถัดไป (FR-C11) */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const [{ data: picks, error }, { data: setting }] = await Promise.all([
    admin
      .from('lottery_picks')
      .select('id, number, draw_date, created_at')
      .eq('user_id', actor.id)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('app_settings').select('value').eq('key', 'lottery_next_draw').maybeSingle(),
  ])

  if (error) throw fromPostgresError(error)

  /* ★ jsonb 'null' กับ null ของ SQL เป็นคนละอย่าง — แปลงให้เหลือแบบเดียว */
  const raw = setting?.value
  const nextDraw = typeof raw === 'string' && raw.length > 0 ? raw : null

  return ok({
    nextDraw,
    items: (picks ?? []).map((p) => ({
      id: p.id,
      number: p.number,
      drawDate: p.draw_date,
      createdAt: p.created_at,
    })),
  })
})

const saveSchema = z.object({
  /** 2, 3 หรือ 6 หลัก — ตรงกับ check constraint ใน 0028 */
  number: z.string().regex(/^\d{2}$|^\d{3}$|^\d{6}$/, 'valid.lotteryNumber'),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, saveSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('funAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('save_lottery_pick', {
    p_actor: actor.id,
    p_number: body.number,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data?.id, number: data?.number, drawDate: data?.draw_date })
})

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, z.object({ id: z.uuid() }))
  const actor = await requireOfficeUser()
  await enforceRateLimit('funAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('delete_lottery_pick', { p_actor: actor.id, p_id: body.id })
  if (error) throw fromPostgresError(error)

  return ok({ deleted: body.id })
})
