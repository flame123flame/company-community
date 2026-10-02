import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireAdmin } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{1,31}$/
/** ★ เพดานต่อการนำเข้าหนึ่งครั้ง — กัน CSV ที่มีหมื่นแถวทำให้ request หมดเวลา */
const MAX_IMPORT = 2000

/** GET /api/office/admin/codes — รายชื่อรหัสพนักงานพร้อมสถานะการสมัคร */
export const GET = withErrorHandling(async () => {
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  const admin = getSupabaseAdminClient()

  const { data, error } = await admin
    .from('employee_codes')
    .select('code, status, claimed_by, claimed_at, created_at')
    .order('code')

  if (error) throw fromPostgresError(error)

  /*
   * ★ ดึงชื่อผู้สมัครแยกคำขอ แล้วต่อกันในหน่วยความจำ
   *   PostgREST join ข้ามตารางได้ก็จริง แต่ต้องมี FK จริงซึ่งเราตั้งใจไม่ผูก
   *   (เหตุผลอยู่ใน migration 0023) — สองคำขอตรงไปตรงมากว่าและ
   *   รายชื่อรหัสพนักงานมีหลักร้อย ไม่ใช่หลักล้าน
   */
  const ids = [...new Set((data ?? []).map((r) => r.claimed_by).filter(Boolean))] as string[]

  const names = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, display_name, nickname, department')
      .in('id', ids)

    if (profileError) throw fromPostgresError(profileError)
    for (const p of profiles ?? []) {
      names.set(p.id, p.nickname || p.display_name)
    }
  }

  return ok({
    items: (data ?? []).map((row) => ({
      code: row.code,
      status: row.status,
      claimedBy: row.claimed_by,
      claimedName: row.claimed_by ? (names.get(row.claimed_by) ?? null) : null,
      claimedAt: row.claimed_at,
    })),
  })
})

const addSchema = z.object({
  /** ★ รับทีละหลายรหัสเสมอ — หน้าเว็บส่งรหัสเดียวก็ใส่ array ความยาว 1
      ทำให้ "เพิ่มทีละรายการ" กับ "นำเข้า CSV" ใช้เส้นทางเดียวกันทั้งหมด */
  codes: z.array(z.string()).min(1).max(MAX_IMPORT),
})

/** POST /api/office/admin/codes — เพิ่มรหัสทีละรายการหรือนำเข้าจาก CSV */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, addSchema)
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  /*
   * ★ normalize + ตัดซ้ำก่อนส่งเข้าฐานข้อมูล
   *   CSV ที่คนทำมือมักมีช่องว่างท้ายบรรทัด บรรทัดว่าง และรหัสซ้ำ
   *   ★ ถ้าปล่อยเข้าไปดิบ ๆ จะได้ error ที่อ่านไม่รู้เรื่องกลับไปให้ Admin
   */
  const cleaned = [...new Set(body.codes.map((c) => c.trim().toUpperCase()).filter(Boolean))]

  const invalid = cleaned.filter((c) => !CODE_RE.test(c))
  if (invalid.length > 0) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.employeeCode' })
  }
  if (cleaned.length === 0) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.employeeCode' })
  }

  const admin = getSupabaseAdminClient()

  /*
   * ★★ upsert + ignoreDuplicates ไม่ใช่ insert
   *    Admin นำเข้า CSV ไฟล์เดิมซ้ำเป็นเรื่องปกติ (เช่นเพิ่มพนักงานใหม่
   *    ท้ายไฟล์แล้วนำเข้าทั้งไฟล์อีกรอบ) ★ ถ้าพังเพราะรหัสเก่าซ้ำ
   *    Admin จะต้องมานั่งลบบรรทัดเก่าออกเองทุกครั้ง ซึ่งไม่มีใครอยากทำ
   *
   *    ★ ignoreDuplicates สำคัญกว่าที่คิด: ถ้าเป็น update แทน
   *      รหัสที่มีคนสมัครไปแล้วจะถูกรีเซ็ต claimed_by เป็น null
   *      = คนที่สมัครแล้วหลุดจากระบบทั้งหมดโดยไม่มีใครรู้
   */
  const { error } = await admin
    .from('employee_codes')
    .upsert(
      cleaned.map((code) => ({ code, created_by: actor.id })),
      { onConflict: 'code', ignoreDuplicates: true },
    )

  if (error) throw fromPostgresError(error)

  return ok({ added: cleaned.length })
})

const statusSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODE_RE, 'valid.employeeCode'),
  status: z.enum(['ACTIVE', 'RESIGNED']),
})

/** PATCH /api/office/admin/codes — เปลี่ยนสถานะรหัส (ลาออก = ระงับบัญชีอัตโนมัติ) */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, statusSchema)
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('set_employee_code_status', {
    p_actor: actor.id,
    p_code: body.code,
    p_status: body.status,
  })

  if (error) throw fromPostgresError(error)
  return ok({ code: data?.code ?? body.code, status: data?.status ?? body.status })
})
