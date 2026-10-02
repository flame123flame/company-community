import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** ห้องสุ่มกลุ่ม (FR-A09) — รายการห้อง + สร้างห้อง */
export const GET = withErrorHandling(async () => {
  await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin
    .from('draw_rooms')
    .select('id, title, status, host_id, winner_label, created_at, options')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw fromPostgresError(error)

  const rows = data ?? []
  const hostIds = [...new Set(rows.map((r) => r.host_id))]

  const { data: hosts } = hostIds.length
    ? await admin.from('profiles').select('id, display_name, nickname').in('id', hostIds)
    : { data: [] as { id: string; display_name: string; nickname: string | null }[] }

  const nameOf = new Map((hosts ?? []).map((h) => [h.id, h.nickname || h.display_name]))

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      hostName: nameOf.get(r.host_id) ?? '—',
      winnerLabel: r.winner_label,
      /* ★ ส่งแค่จำนวนตัวเลือก — หน้ารายการไม่ต้องรู้ว่ามีอะไร */
      optionCount: Array.isArray(r.options) ? r.options.length : 0,
    })),
  })
})

const createSchema = z.object({
  title: z.string().trim().min(1, 'common.required').max(80),
  options: z
    .array(z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(80) }))
    .min(2, 'valid.needTwoOptions')
    .max(100),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, createSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('drawRoom', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('create_draw_room', {
    p_actor: actor.id,
    p_title: body.title,
    p_options: body.options,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data?.id })
})
