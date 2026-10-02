import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/draw/rooms/[id]'>

/** สภาพห้อง + คนในห้อง */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  const { data: room, error } = await admin
    .from('draw_rooms')
    .select('id, host_id, title, options, status, winner_id, winner_label, spun_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw fromPostgresError(error)
  if (!room) return ok({ room: null })

  const { data: members } = await admin
    .from('draw_room_members')
    .select('user_id, joined_at')
    .eq('room_id', id)
    .order('joined_at')

  const ids = (members ?? []).map((m) => m.user_id)
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', ids)
    : { data: [] as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }[] }

  const byId = new Map((people ?? []).map((p) => [p.id, p]))

  return ok({
    room: {
      id: room.id,
      title: room.title,
      options: room.options,
      status: room.status,
      winnerId: room.winner_id,
      winnerLabel: room.winner_label,
      spunAt: room.spun_at,
      isHost: room.host_id === actor.id,
      hostName: byId.get(room.host_id)?.nickname || byId.get(room.host_id)?.display_name || '—',
    },
    members: ids.map((uid) => ({
      id: uid,
      name: byId.get(uid)?.nickname || byId.get(uid)?.display_name || '—',
      avatarUrl: byId.get(uid)?.avatar_url ?? null,
      isMe: uid === actor.id,
    })),
  })
})

const actionSchema = z.object({
  action: z.enum(['join', 'leave', 'spin', 'finish']),
})

export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, actionSchema)
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  /*
   * ★ ไม่ rate limit action พวกนี้
   *   join/leave/finish ไม่สร้างข้อมูลใหม่ (upsert/delete ซ้ำได้ไม่มีผล)
   *   ★ spin ถูกกันด้วยเงื่อนไข status = 'OPEN' ใน SQL อยู่แล้ว —
   *     กดรัวแค่ไหนก็ตัดสินผลได้ครั้งเดียว ซึ่งแข็งแรงกว่า rate limit
   */
  const fn = {
    join: 'join_draw_room',
    leave: 'leave_draw_room',
    spin: 'spin_draw_room',
    finish: 'finish_draw_room',
  }[body.action] as 'join_draw_room' | 'leave_draw_room' | 'spin_draw_room' | 'finish_draw_room'

  const { data, error } = await admin.rpc(fn, { p_actor: actor.id, p_room: id })
  if (error) throw fromPostgresError(error)

  /* spin คืนสภาพห้องหลังตัดสินผล — เจ้าของห้องได้ผลทันทีไม่ต้องรอ Realtime */
  if (body.action === 'spin' && data && typeof data === 'object' && 'status' in data) {
    const room = data as { status: string; winner_id: string | null; winner_label: string | null; spun_at: string | null }
    return ok({
      status: room.status,
      winnerId: room.winner_id,
      winnerLabel: room.winner_label,
      spunAt: room.spun_at,
    })
  }

  return ok({})
})

export const DELETE = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  const { error } = await admin.rpc('delete_draw_room', { p_actor: actor.id, p_room: id })
  if (error) throw fromPostgresError(error)
  return ok({})
})
