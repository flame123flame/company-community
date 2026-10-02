import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { BUCKETS, removePrivate, signedUrl, uploadPrivate } from '@/lib/office/storage'

export const dynamic = 'force-dynamic'

/**
 * QR รับเงินของฉัน (FR-B03 / FR-X06)
 *
 * ★ GET คืน signed URL ของ "ของตัวเอง" เท่านั้น
 *   การดู QR ของคนอื่นทำผ่าน /api/office/wallet/debts/[id]/qr ซึ่งตรวจ
 *   ว่ามีรายการเงินร่วมกันจริงก่อน (NFR-07)
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const path = actor.profile.payment_qr_path

  /*
   * ★★ อ่านเบอร์พร้อมเพย์แบบล้มได้ — คอลัมน์มาจาก 0046
   *    ★ หน้านี้ต้องเปิดได้เสมอแม้ migration ยังไม่ขึ้น
   */
  let promptPayId: string | null = null
  const row = await getSupabaseAdminClient()
    .from('profiles')
    .select('promptpay_id')
    .eq('id', actor.id)
    .maybeSingle()
  if (!row.error) promptPayId = row.data?.promptpay_id ?? null

  return ok({
    url: path ? await signedUrl(BUCKETS.qr, path) : null,
    promptPayId,
  })
})

/**
 * PATCH — ตั้ง/ลบเบอร์พร้อมเพย์
 *
 * ★★★ แยกจาก POST ที่อัปรูป — คนละอย่างกันคนละวิธีส่ง
 *
 *     ★ POST รับ FormData (ไฟล์) ★ PATCH รับ JSON (ตัวเลข)
 *       ★★ ยัดรวมกันจะต้องเดาจากชนิด content-type ซึ่งอ่านยากและพลาดง่าย
 *
 * ★ null = ลบทิ้ง ไม่ใช่ "ไม่เปลี่ยน" — ผู้ใช้ต้องเอาเบอร์ออกได้
 */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(
    request,
    z.object({
      /*
       * ★ ตรวจรูปแบบที่นี่ด้วย ไม่พึ่ง check constraint อย่างเดียว
       *   ★★ constraint โยน error ของ Postgres ซึ่งแปลเป็นข้อความให้ผู้ใช้ไม่ได้
       */
      promptPayId: z
        .string()
        .trim()
        .regex(/^[0-9]{10,13}$/, 'valid.promptpay')
        .nullable(),
    }),
  )

  const actor = await requireOfficeUser()
  await enforceRateLimit('walletAction', actor.id)

  const { error } = await getSupabaseAdminClient()
    .from('profiles')
    .update({ promptpay_id: body.promptPayId })
    .eq('id', actor.id)

  if (error) throw fromPostgresError(error)
  return ok({ promptPayId: body.promptPayId })
})

/** POST — อัปโหลด/เปลี่ยนรูป QR */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('walletFile', actor.id)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
  }

  const path = await uploadPrivate(BUCKETS.qr, actor.id, file)

  const admin = getSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ payment_qr_path: path })
    .eq('id', actor.id)

  if (error) throw fromPostgresError(error)

  /* ★ ลบรูปเก่าหลังบันทึกตัวใหม่สำเร็จแล้วเท่านั้น
     ถ้าลบก่อนแล้ว update ล้ม ผู้ใช้จะไม่มี QR เลยทั้งที่เคยมี */
  await removePrivate(BUCKETS.qr, actor.profile.payment_qr_path)

  return ok({ url: await signedUrl(BUCKETS.qr, path) })
})

/** DELETE — เอา QR ออก */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('walletFile', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ payment_qr_path: null })
    .eq('id', actor.id)

  if (error) throw fromPostgresError(error)
  await removePrivate(BUCKETS.qr, actor.profile.payment_qr_path)

  return ok({ url: null })
})
