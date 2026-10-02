import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireAdmin } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** GET /api/office/admin/users — รายชื่อผู้ใช้ (FR-X09) */
export const GET = withErrorHandling(async () => {
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  const admin = getSupabaseAdminClient()

  /*
   * ★★★ ไม่ดึงข้อมูลการเงินของผู้ใช้มาแม้แต่คอลัมน์เดียว
   *
   *     เอกสารระบุชัดท้ายหัวข้อ 8.6: "ข้อมูลการเงินส่วนตัวของผู้ใช้
   *     (ยอดค้าง สลิป QR รับเงิน) Admin ไม่เห็นในหน้า Admin"
   *
   *     ★ payment_qr_path ไม่อยู่ใน select นี้โดยตั้งใจ ไม่ใช่เพราะลืม
   *       — ใครที่มาเพิ่มทีหลังต้องรู้ว่ามันถูกเว้นไว้ด้วยเหตุผล
   */
  const { data, error } = await admin
    .from('profiles')
    /* ★ ต้องเป็นสตริงก้อนเดียว ห้ามต่อด้วย + ★★ supabase-js อ่านชื่อคอลัมน์
       จาก literal เพื่อสร้าง type ให้ — พอต่อสตริงมันจะกลายเป็น string ธรรมดา
       แล้ว type ของผลลัพธ์พังทั้งก้อน (เจอมาแล้วตอนเพิ่มคอลัมน์ชุดนี้)
       ★ ยังไม่มี payment_qr_path เหมือนเดิม ดูเหตุผลข้างบน */
    .select(
      'id, display_name, nickname, username, department, employee_code, is_admin, account_status, created_at, prefix, first_name, last_name, phone, company, position_title, purpose, terms_accepted_at',
    )
    .not('employee_code', 'is', null)
    .order('created_at', { ascending: false })

  if (error) throw fromPostgresError(error)

  return ok({
    items: (data ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      nickname: p.nickname,
      username: p.username,
      department: p.department,
      employeeCode: p.employee_code,
      isAdmin: p.is_admin,
      accountStatus: p.account_status,
      createdAt: p.created_at,
      prefix: p.prefix,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      company: p.company,
      position: p.position_title,
      purpose: p.purpose,
      termsAcceptedAt: p.terms_accepted_at,
    })),
  })
})

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    userId: z.uuid(),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
  }),
  z.object({
    action: z.literal('admin'),
    userId: z.uuid(),
    isAdmin: z.boolean(),
  }),
  z.object({
    action: z.literal('resetPassword'),
    userId: z.uuid(),
  }),
  /* ★ แก้ข้อมูลพนักงาน (0041) — ชื่อ/นามสกุลบังคับ ที่เหลือว่างได้ */
  z.object({
    action: z.literal('profile'),
    userId: z.uuid(),
    prefix: z.string().trim().max(20).nullish(),
    firstName: z.string().trim().min(1, 'common.required').max(60),
    lastName: z.string().trim().min(1, 'common.required').max(60),
    phone: z.string().trim().max(30).nullish(),
    company: z.string().trim().max(80).nullish(),
    department: z.string().trim().max(80).nullish(),
    position: z.string().trim().max(80).nullish(),
  }),
])

/** POST /api/office/admin/users — ระงับ/คืนสถานะ · สิทธิ์ Admin · รีเซ็ตรหัสผ่าน */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, actionSchema)
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  const admin = getSupabaseAdminClient()

  if (body.action === 'status') {
    const { data, error } = await admin.rpc('set_account_status', {
      p_actor: actor.id,
      p_target: body.userId,
      p_status: body.status,
    })
    if (error) throw fromPostgresError(error)
    return ok({ accountStatus: data?.account_status ?? body.status })
  }

  /*
   * ★ Admin แก้ข้อมูลพนักงานที่กรอกผิดตอนสมัคร หรือย้ายฝ่าย
   *   ★★ ไม่ให้แก้ username และ employee_code จากที่นี่ — สองอันนั้นเป็น
   *      ตัวตนที่ของอื่นอ้างถึงอยู่ ต้องไปเส้นทางของมันเอง
   */
  if (body.action === 'profile') {
    const { error } = await admin.rpc('admin_update_profile', {
      p_actor: actor.id,
      p_target: body.userId,
      p_prefix: body.prefix ?? null,
      p_first: body.firstName,
      p_last: body.lastName,
      p_phone: body.phone ?? null,
      p_company: body.company ?? null,
      p_dept: body.department ?? null,
      p_position: body.position ?? null,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'admin') {
    const { data, error } = await admin.rpc('set_admin_role', {
      p_actor: actor.id,
      p_target: body.userId,
      p_admin: body.isAdmin,
    })
    if (error) throw fromPostgresError(error)
    return ok({ isAdmin: data?.is_admin ?? body.isAdmin })
  }

  /* ── รีเซ็ตรหัสผ่าน (FR-X03) ────────────────────────────────────── */

  /*
   * ★★★ เรียก Supabase Admin API ฝั่งเซิร์ฟเวอร์เท่านั้น ตามที่ FR-X03 กำหนด
   *
   *     service role key อยู่ใน getSupabaseAdminClient() ซึ่งมี 'server-only'
   *     กำกับไว้ — ถ้าวันหนึ่งมีใคร import ไฟล์นี้เข้าคอมโพเนนต์ client
   *     การ build จะพังทันที แทนที่จะหลุดคีย์ขึ้นเว็บเงียบ ๆ
   *
   * ★★ รหัสชั่วคราวถูกส่งกลับไปให้ Admin "ครั้งเดียว" แล้วไม่เก็บไว้ที่ไหนเลย
   *    ไม่บันทึกลง audit_log ด้วย (log เก็บแค่ว่า "มีการรีเซ็ต" ไม่เก็บรหัส)
   *    ★ รหัสผ่านที่อยู่ในฐานข้อมูลเป็นข้อความธรรมดาคือช่องโหว่ที่ร้ายที่สุด
   *      ที่ระบบแบบนี้จะมีได้ — ต่อให้เป็นรหัสชั่วคราวก็ตาม
   */
  const temp = generateTempPassword()

  const { data: target, error: readError } = await admin
    .from('profiles')
    .select('id, employee_code')
    .eq('id', body.userId)
    .maybeSingle()

  if (readError) throw fromPostgresError(readError)
  if (!target) throw new AppError('MEMBER_NOT_FOUND')

  const { error: updateError } = await admin.auth.admin.updateUserById(body.userId, {
    password: temp,
  })

  if (updateError) {
    throw new AppError('DATABASE_ERROR', { cause: updateError })
  }

  /*
   * ★★★ ประทับว่าบัญชีนี้ "มีรหัสผ่านแล้ว" (0042)
   *
   *     ★ ถ้าไม่ทำ ระบบจะยังคิดว่าบัญชีนี้เป็นบัญชีรุ่นเก่าที่ไม่มีรหัสผ่าน
   *       ★★ แล้วใครก็เข้าได้ด้วยการเว้นช่องรหัสผ่านว่างไว้ —
   *          รหัสชั่วคราวที่เพิ่งตั้งให้จะไม่มีความหมายเลย
   */
  const { error: markError } = await admin.rpc('mark_password_set', { p_user: body.userId })
  if (markError) throw fromPostgresError(markError)

  await admin.from('audit_log').insert({
    actor_id: actor.id,
    action: 'account.resetPassword',
    target_type: 'profile',
    target_id: body.userId,
    /* ★ ไม่มีรหัสผ่านใน detail — เก็บแค่ว่าใครรีเซ็ตให้ใครเมื่อไหร่ */
    detail: {},
  })

  return ok({ tempPassword: temp })
})

/**
 * รหัสชั่วคราวที่อ่านออกทางโทรศัพท์ได้
 *
 * ★ ตัด 0/O และ 1/I/l ออก — Admin ต้องอ่านรหัสนี้ให้ผู้ใช้ฟัง
 *   ตัวอักษรที่ฟังแล้วแยกไม่ออกทำให้ต้องอ่านซ้ำหลายรอบ
 *   (เหตุผลเดียวกับชุดอักษรของรหัสห้องใน migration 0001)
 */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('')
}
