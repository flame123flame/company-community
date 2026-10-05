import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { CODE_ALPHABET, QUIZ_SECONDS, type QuizListItem } from '@/lib/office/quiz'

export const dynamic = 'force-dynamic'

/**
 * ควิซออฟฟิศ — รายการห้องที่ยังเล่นอยู่ (หรือหาห้องจากรหัส ?code=) + สร้างห้อง
 *
 * ★ ตาราง office_quiz_* — quiz_* เป็นของเกมทายเพลงในห้องฟังเพลง (0020)
 * ★ แสดงเฉพาะห้องที่ยังไม่จบและสร้างภายใน 12 ชั่วโมง — ห้องค้างข้ามวันไม่มีใครเล่นต่อแล้ว
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()
  const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase() ?? ''

  let q = admin
    .from('office_quiz_rooms')
    .select('id, code, title, status, host_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  q = code
    ? q.eq('code', code)
    : q.neq('status', 'DONE').gte('created_at', new Date(Date.now() - 12 * 3600_000).toISOString())

  const { data, error } = await q
  if (error) throw fromPostgresError(error)
  const rows = data ?? []

  const ids = rows.map((r) => r.id)
  const hostIds = [...new Set(rows.map((r) => r.host_id))]
  const [{ data: players }, { data: hosts }] = await Promise.all([
    ids.length ? admin.from('office_quiz_players').select('room_id').in('room_id', ids) : Promise.resolve({ data: [] as { room_id: string }[] }),
    hostIds.length
      ? admin.from('profiles').select('id, display_name, nickname').in('id', hostIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string; nickname: string | null }[] }),
  ])
  const count = new Map<string, number>()
  for (const p of players ?? []) count.set(p.room_id, (count.get(p.room_id) ?? 0) + 1)
  const nameOf = new Map((hosts ?? []).map((h) => [h.id, h.nickname || h.display_name]))

  const items: QuizListItem[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status,
    players: count.get(r.id) ?? 0,
    hostName: nameOf.get(r.host_id) ?? '—',
    isHost: r.host_id === actor.id,
  }))
  return ok({ items })
})

const questionSchema = z
  .object({
    body: z.string().trim().min(1, 'common.required').max(200),
    choices: z.array(z.string().trim().min(1, 'common.required').max(80)).min(2).max(4),
    correct: z.number().int().min(0).max(3),
    seconds: z.number().int().refine((n) => (QUIZ_SECONDS as readonly number[]).includes(n)),
  })
  .refine((q) => q.correct < q.choices.length, { message: 'valid.invalid' })

const createSchema = z.object({
  title: z.string().trim().min(1, 'common.required').max(80),
  questions: z.array(questionSchema).min(1).max(30),
})

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, createSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('quizRoom', actor.id)
  const admin = getSupabaseAdminClient()

  /* ★ รหัสชนกันโอกาสน้อยมาก (31^5) แต่ลองใหม่ได้สามครั้งก่อนยอมแพ้ */
  let room: { id: string; code: string } | null = null
  for (let i = 0; i < 3 && !room; i++) {
    const { data, error } = await admin
      .from('office_quiz_rooms')
      .insert({ code: newCode(), host_id: actor.id, title: body.title, q_count: body.questions.length })
      .select('id, code')
      .single()
    if (!error) room = data
    else if (error.code !== '23505') throw fromPostgresError(error)
  }
  if (!room) throw new AppError('INTERNAL_ERROR')

  const { error: qErr } = await admin.from('office_quiz_questions').insert(
    body.questions.map((q, idx) => ({ room_id: room.id, idx, body: q.body, choices: q.choices, correct: q.correct, seconds: q.seconds })),
  )
  if (qErr) {
    await admin.from('office_quiz_rooms').delete().eq('id', room.id)
    throw fromPostgresError(qErr)
  }
  return ok({ id: room.id, code: room.code })
})
