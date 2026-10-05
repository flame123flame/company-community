import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import type { QuizState } from '@/lib/office/quiz'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/games/quiz/[id]'>

/**
 * สถานะห้องควิซ — ทุกเครื่องดึงจากที่นี่เมื่อ Realtime ส่งสัญญาณ (และทุก 2.5 วินาทีกันพลาด)
 *
 * ★★★ เฉลยออกจากที่นี่เฉพาะสถานะ REVEAL/DONE เท่านั้น
 *     ระหว่างถาม ส่งแค่ตัวคำถามกับตัวเลือก — ช่อง correct ไม่เคยออกนอกเซิร์ฟเวอร์
 * ★ serverNow ให้เครื่องผู้เล่นปรับนาฬิกาตัวนับถอยหลังให้ตรงกับฐานข้อมูล
 */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  const { data: room, error } = await admin
    .from('office_quiz_rooms')
    .select('id, code, title, status, host_id, q_index, q_count, q_started_at, answered')
    .eq('id', id)
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  if (!room) throw new AppError('ROOM_NOT_FOUND')

  const live = room.status === 'QUESTION' || room.status === 'REVEAL'
  const [{ data: players }, { data: question }, { data: answers }, { data: nowIso }] = await Promise.all([
    admin.from('office_quiz_players').select('user_id, score, joined_at').eq('room_id', id).order('joined_at'),
    live
      ? admin.from('office_quiz_questions').select('body, choices, correct, seconds').eq('room_id', id).eq('idx', room.q_index).maybeSingle()
      : Promise.resolve({ data: null }),
    live
      ? admin.from('office_quiz_answers').select('user_id, choice, points').eq('room_id', id).eq('idx', room.q_index)
      : Promise.resolve({ data: [] as { user_id: string; choice: number; points: number }[] }),
    admin.rpc('server_now'),
  ])

  const ids = [...new Set([...(players ?? []).map((p) => p.user_id), room.host_id])]
  const { data: people } = await admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', ids)
  const person = new Map((people ?? []).map((p) => [p.id, p]))
  const nameOf = (uid: string) => person.get(uid)?.nickname || person.get(uid)?.display_name || '—'

  const revealed = room.status === 'REVEAL'
  const byUser = new Map((answers ?? []).map((a) => [a.user_id, a]))
  const choices = (question?.choices as string[] | undefined) ?? []
  const mine = byUser.get(actor.id)

  const state: QuizState = {
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      status: room.status,
      qIndex: room.q_index,
      qCount: room.q_count,
      startedAt: room.q_started_at,
      answered: room.answered,
      isHost: room.host_id === actor.id,
      hostName: nameOf(room.host_id),
    },
    question: question ? { body: question.body, choices, seconds: question.seconds } : null,
    reveal:
      revealed && question
        ? { correct: question.correct, counts: choices.map((_, i) => (answers ?? []).filter((a) => a.choice === i).length) }
        : null,
    players: (players ?? [])
      .map((p) => ({
        id: p.user_id,
        name: nameOf(p.user_id),
        avatarUrl: person.get(p.user_id)?.avatar_url ?? null,
        score: p.score,
        isMe: p.user_id === actor.id,
        answered: live && byUser.has(p.user_id),
        gained: revealed ? (byUser.get(p.user_id)?.points ?? 0) : null,
      }))
      .sort((a, b) => b.score - a.score),
    me: {
      joined: (players ?? []).some((p) => p.user_id === actor.id),
      choice: live ? (mine?.choice ?? null) : null,
      points: revealed ? (mine?.points ?? 0) : null,
    },
    serverNow: typeof nowIso === 'string' ? nowIso : new Date().toISOString(),
  }
  return ok(state)
})

const actSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('answer'), choice: z.number().int().min(0).max(3) }),
  z.object({ action: z.literal('reveal') }),
  z.object({ action: z.literal('next') }),
  z.object({ action: z.literal('delete') }),
])

export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, actSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('quizAct', actor.id)
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  const { data: room, error } = await admin.from('office_quiz_rooms').select('id, host_id, status').eq('id', id).maybeSingle()
  if (error) throw fromPostgresError(error)
  if (!room) throw new AppError('ROOM_NOT_FOUND')
  const isHost = room.host_id === actor.id

  switch (body.action) {
    case 'join': {
      /* ★ ผู้จัดไม่เป็นผู้เล่น — คนตั้งคำถามรู้เฉลยอยู่แล้ว */
      if (isHost) throw new AppError('FORBIDDEN')
      if (room.status === 'DONE') throw new AppError('FORBIDDEN')
      const { error: e } = await admin
        .from('office_quiz_players')
        .upsert({ room_id: id, user_id: actor.id }, { onConflict: 'room_id,user_id', ignoreDuplicates: true })
      if (e) throw fromPostgresError(e)
      return ok({ joined: true })
    }
    case 'leave': {
      const { error: e } = await admin.from('office_quiz_players').delete().eq('room_id', id).eq('user_id', actor.id)
      if (e) throw fromPostgresError(e)
      return ok({ left: true })
    }
    case 'answer': {
      const { data, error: e } = await admin.rpc('office_quiz_answer', { p_actor: actor.id, p_room: id, p_choice: body.choice })
      if (e) throw fromPostgresError(e)
      return ok(data)
    }
    case 'reveal': {
      const { error: e } = await admin.rpc('office_quiz_reveal', { p_actor: actor.id, p_room: id })
      if (e) throw fromPostgresError(e)
      return ok({ done: true })
    }
    case 'next': {
      const { error: e } = await admin.rpc('office_quiz_next', { p_actor: actor.id, p_room: id })
      if (e) throw fromPostgresError(e)
      return ok({ done: true })
    }
    case 'delete': {
      if (!isHost) throw new AppError('FORBIDDEN')
      const { error: e } = await admin.from('office_quiz_rooms').delete().eq('id', id)
      if (e) throw fromPostgresError(e)
      return ok({ deleted: true })
    }
  }
})
