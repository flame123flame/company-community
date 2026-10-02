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
 * POST /api/office/wallet/net — หักลบยอดกับคนคนเดียว (FR-B08)
 *
 * ★ ไม่ต้องขอความยินยอมอีกฝ่าย เพราะการหักลบไม่ทำให้ใครเสียเปรียบ
 *   (เหตุผลเต็มอยู่ใน migration 0030) — แต่ต้องแจ้งเขาเสมอ ซึ่ง RPC ทำให้แล้ว
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, z.object({ otherId: z.uuid() }))
  const actor = await requireOfficeUser()
  await enforceRateLimit('walletAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('net_debts_between', {
    p_actor: actor.id,
    p_other: body.otherId,
  })

  if (error) throw fromPostgresError(error)
  return ok({
    closed: data?.closed ?? 0,
    net: data?.net ?? 0,
    direction: data?.direction ?? 'EVEN',
    /* ★ ใบสุทธิที่เพิ่งสร้าง — แผ่นจ่ายเงินเอาไปกด "จ่ายแล้ว" ต่อทันที */
    newDebtId: data?.newDebtId ?? null,
  })
})
