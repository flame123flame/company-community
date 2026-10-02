import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireActiveUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/office/employee-code — ผูกรหัสพนักงานเข้ากับบัญชีที่ login อยู่
 *
 * ★★★ นี่คือเส้นทางที่ทำให้ "ผู้ใช้เดิมไม่ต้องสมัครใหม่"
 *
 *     คนที่ใช้ห้องเพลงอยู่แล้วมี auth user + profile + ประวัติครบแล้ว
 *     สิ่งเดียวที่ขาดคือรหัสพนักงาน — ผูกเพิ่มเข้าไปบน id เดิม
 *     ประวัติเพลง ห้องที่เคยเข้า และแชททั้งหมดจึงยังเป็นของคนเดิมทุกแถว
 *
 *     ★ ตรงข้ามกับการให้สมัครใหม่ ซึ่งจะได้ auth user ใหม่คนละ id
 *       แล้วของเดิมทั้งหมดกลายเป็นของ "คนอื่น" ที่ไม่มีใครเข้าถึงได้อีก
 */

const bodySchema = z.object({
  /** ★ normalize เป็นพิมพ์ใหญ่ตั้งแต่ตรงนี้ ให้ตรงกับที่ตารางเก็บ */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{1,31}$/, 'valid.employeeCode'),
  displayName: z.string().trim().min(1).max(40),
  nickname: z.string().trim().max(30).optional().nullable(),
  department: z.string().trim().max(60).optional().nullable(),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireActiveUser()

  /**
   * ★★★ ต้องหักโควตา "ก่อน" ลองผูก ไม่ใช่หลังจากรู้ว่าผิด
   *
   *     เคยเขียนแบบหักทีหลังเฉพาะตอนผิด เพราะ FR-X02 เขียนว่า
   *     "จำกัดการกรอกรหัสผิดไม่เกิน 5 ครั้ง" — ฟังดูตรงตัวกว่า
   *
   *     ★ แต่มันเปิดช่องจริง: การตรวจเพดานเกิดหลัง RPC ทำงานไปแล้ว
   *       คนที่ไล่เดาจนมาเจอรหัสถูกพอดีในครั้งที่ 6 จะ "ผูกสำเร็จ"
   *       แล้วค่อยโดนบอกว่าเกินเพดาน — ซึ่งสายไปแล้ว รหัสถูกยึดไปเรียบร้อย
   *
   *     ★★ หักก่อนเสมอจึงเป็นทางเดียวที่เพดานมีผลจริง
   *        คนที่กรอกถูกตั้งแต่ครั้งแรกเสียโควตา 1 ใน 5 ก็จริง แต่เขาผูกเสร็จ
   *        แล้วและไม่ต้องใช้อีกเลย — ไม่มีใครเสียหายจากข้อนี้
   *
   *     ผูกกับ user id ไม่ใช่กับรหัสที่กรอก เพราะถ้าผูกกับรหัส
   *     คนร้ายจะเปลี่ยนรหัสที่เดาไปเรื่อย ๆ แล้วไม่มีทางชนเพดานเลยสักครั้ง
   */
  await enforceRateLimit('employeeCode', actor.id)

  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('claim_employee_code', {
    p_actor: actor.id,
    p_code: body.code,
    p_display_name: body.displayName,
    p_nickname: body.nickname ?? null,
    p_department: body.department ?? null,
  })

  if (error) throw fromPostgresError(error)

  return ok({
    employeeCode: data?.employee_code ?? body.code,
    displayName: data?.display_name ?? body.displayName,
    nickname: data?.nickname ?? null,
    department: data?.department ?? null,
  })
})
