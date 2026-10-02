import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** ชุดรายชื่อที่บันทึกไว้ (FR-C01) */

const memberSchema = z.object({
  /** มี id = คนในระบบ · ไม่มี = ชื่อที่พิมพ์เอง */
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(60),
  department: z.string().trim().max(60).optional().nullable(),
})

export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('name_sets')
    .select('id, name, members, updated_at')
    .eq('owner_id', actor.id)
    .order('updated_at', { ascending: false })

  if (error) throw fromPostgresError(error)

  return ok({
    items: (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      members: (s.members ?? []) as z.infer<typeof memberSchema>[],
      updatedAt: s.updated_at,
    })),
  })
})

const saveSchema = z.object({
  id: z.uuid().optional().nullable(),
  name: z.string().trim().min(1, 'common.required').max(60),
  members: z.array(memberSchema).max(200),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, saveSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('funAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('save_name_set', {
    p_actor: actor.id,
    p_id: body.id ?? null,
    p_name: body.name,
    p_members: body.members,
  })

  if (error) {
    /*
     * ★ unique violation ของชื่อชุดต้องอ่านรู้เรื่อง
     *   fromPostgresError map 23505 เป็น DUPLICATE_IN_QUEUE ซึ่งข้อความ
     *   เป็น "เพลงนี้อยู่ในคิวแล้ว" — ผิดบริบทจนผู้ใช้งงหนักกว่าเดิม
     */
    if (error.code === '23505') {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.nameSetTaken' })
    }
    throw fromPostgresError(error)
  }

  return ok({ id: data?.id, name: data?.name })
})

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, z.object({ id: z.uuid() }))
  const actor = await requireOfficeUser()
  await enforceRateLimit('funAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('delete_name_set', { p_actor: actor.id, p_id: body.id })
  if (error) throw fromPostgresError(error)

  return ok({ deleted: body.id })
})
