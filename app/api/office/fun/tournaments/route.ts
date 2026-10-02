import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { getOt } from '@/lib/i18n/office-server'

export const dynamic = 'force-dynamic'

/** GET — ทัวร์นาเมนต์ล่าสุด + สถิติรายคน (FR-C08 / FR-C09) */
export const GET = withErrorHandling(async () => {
  await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const [{ data: list, error }, { data: skill }] = await Promise.all([
    admin
      .from('tournaments')
      .select('id, name, status, owner_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.rpc('player_skill'),
  ])

  if (error) throw fromPostgresError(error)

  /* ชื่อผู้เล่นสำหรับตารางสถิติ */
  const ids = (skill ?? []).map((s) => s.user_id)
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, nickname')
      .in('id', ids)
    for (const p of profiles ?? []) names.set(p.id, p.nickname || p.display_name)
  }

  return ok({
    items: list ?? [],
    /* ★ เรียงจากชนะมากไปน้อย — ตารางอันดับที่ไม่เรียงคือตารางที่ไม่มีใครอ่าน */
    stats: (skill ?? [])
      .map((s) => ({
        userId: s.user_id,
        name: names.get(s.user_id) ?? '—',
        skill: Number(s.skill),
        matches: s.matches,
      }))
      .sort((a, b) => b.skill - a.skill || b.matches - a.matches),
  })
})

const createSchema = z.object({
  name: z.string().trim().max(60).optional(),
  teams: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(20),
        color: z.string().max(20),
        members: z.array(z.object({ id: z.string().optional(), label: z.string().max(60) })),
      }),
    )
    .min(2, 'valid.needTwoTeams')
    .max(32),
})

/** POST — สร้างสายจากทีมที่สุ่มมาแล้ว */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, createSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('funAction', actor.id)

  /* ★ ชื่อสำรองก็ต้องตามภาษาของคนกด — มันไปโผล่เป็นชื่อสายการแข่งขันจริง */
  const { ot } = await getOt()

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('create_tournament', {
    p_actor: actor.id,
    p_name: body.name ?? ot('fun.cup.defaultName'),
    p_teams: body.teams,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data })
})
