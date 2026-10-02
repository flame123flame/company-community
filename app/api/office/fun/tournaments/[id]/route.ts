import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** GET — ผังสายเต็ม */
export const GET = withErrorHandling(
  async (_r: NextRequest, context: RouteContext<'/api/office/fun/tournaments/[id]'>) => {
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    const admin = getSupabaseAdminClient()

    const [{ data: t }, { data: teams }, { data: matches }] = await Promise.all([
      admin.from('tournaments').select('id, name, status, owner_id').eq('id', id).maybeSingle(),
      admin.from('tournament_teams').select('id, name, color, members, seed').eq('tournament_id', id).order('seed'),
      admin
        .from('tournament_matches')
        .select('id, round, slot, team_a, team_b, winner, score_a, score_b')
        .eq('tournament_id', id)
        .order('round')
        .order('slot'),
    ])

    if (!t) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    return ok({
      id: t.id,
      name: t.name,
      status: t.status,
      /* ★ คำนวณที่ server — หน้าเว็บไม่ต้องรู้กติกาว่าใครแก้ผลได้ */
      canManage: t.owner_id === actor.id || actor.isAdmin,
      teams: (teams ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        color: x.color,
        members: (x.members ?? []) as { id?: string; label: string }[],
      })),
      matches: matches ?? [],
    })
  },
)

const resultSchema = z.object({
  matchId: z.uuid(),
  winner: z.uuid(),
  scoreA: z.number().int().min(0).max(999).optional().nullable(),
  scoreB: z.number().int().min(0).max(999).optional().nullable(),
})

/** POST — บันทึกผลนัด */
export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/fun/tournaments/[id]'>) => {
    assertSameOrigin(request)
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const body = await parseJsonBody(request, resultSchema)
    const actor = await requireOfficeUser()
    await enforceRateLimit('funAction', actor.id)

    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('record_match_result', {
      p_actor: actor.id,
      p_match: body.matchId,
      p_winner: body.winner,
      p_score_a: body.scoreA ?? null,
      p_score_b: body.scoreB ?? null,
    })

    if (error) throw fromPostgresError(error)
    return ok({ recorded: true })
  },
)

export const DELETE = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/fun/tournaments/[id]'>) => {
    assertSameOrigin(request)
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('delete_tournament', { p_actor: actor.id, p_id: id })
    if (error) throw fromPostgresError(error)
    return ok({ deleted: id })
  },
)
