import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** คำค้นแจ้งเตือน (FR-D09) */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin
    .from('search_alerts')
    .select('id, keyword')
    .eq('user_id', actor.id)
    .order('created_at')

  if (error) throw fromPostgresError(error)
  return ok({ items: data ?? [] })
})

const schema = z.object({
  keyword: z.string().trim().min(2, 'valid.keywordLen').max(40),
  on: z.boolean(),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('marketAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('set_search_alert', {
    p_actor: actor.id,
    p_keyword: body.keyword,
    p_on: body.on,
  })

  if (error) throw fromPostgresError(error)
  return ok({ keyword: body.keyword.toLowerCase(), on: body.on })
})
