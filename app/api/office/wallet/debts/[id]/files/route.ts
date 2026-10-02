import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { BUCKETS, signedUrl, signedUrlOrNull, uploadPrivate } from '@/lib/office/storage'

export const dynamic = 'force-dynamic'

/**
 * ไฟล์ของรายการค้างจ่ายหนึ่งรายการ (FR-B03 / FR-B04 / NFR-07)
 *
 * ★★★ นี่คือจุดที่ NFR-07 ถูกบังคับจริง
 *
 *     "รูป QR รับเงินและสลิปโอนเงินแสดงเฉพาะคู่ที่เกี่ยวข้อง"
 *     ★ ด่านคือ: ต้องเป็นเจ้าหนี้หรือลูกหนี้ของ "แถวนี้" เท่านั้น
 *       ไม่ใช่แค่ "เป็นพนักงาน" — พนักงานคนอื่นไม่มีสิทธิ์เห็นเลย
 *
 *     ★★ อ่านแถวก่อนเสมอเพื่อตรวจ แล้วค่อยออก signed URL
 *        signedUrl() เองไม่ตรวจอะไรให้ (เขียนกำกับไว้ใน lib/office/storage.ts)
 */

async function loadDebt(id: string, actorId: string) {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('debts')
    .select('id, creditor_id, debtor_id, slip_path, bill_id')
    .eq('id', id)
    .maybeSingle()

  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('QUEUE_ITEM_NOT_FOUND')

  /* ★ ด่านเดียวที่สำคัญที่สุดในไฟล์นี้ */
  if (data.creditor_id !== actorId && data.debtor_id !== actorId) {
    throw new AppError('FORBIDDEN')
  }

  return data
}

/**
 * GET — ลิงก์ชั่วคราวของ QR ผู้รับ · สลิป · ใบเสร็จ
 *
 * ★ คืนทีเดียวทั้งสามอย่าง เพราะหน้าจ่ายเงินแสดงพร้อมกันหมด
 *   การแยกเป็นสามคำขอทำให้ต้องตรวจสิทธิ์ซ้ำสามรอบโดยไม่ได้อะไรเพิ่ม
 */
export const GET = withErrorHandling(
  async (_request: NextRequest, context: RouteContext<'/api/office/wallet/debts/[id]/files'>) => {
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    const debt = await loadDebt(id, actor.id)
    await enforceRateLimit('walletFile', actor.id)

    const admin = getSupabaseAdminClient()

    /* QR ของ "ผู้รับเงิน" — คือเจ้าหนี้เสมอ ไม่ว่าคนขอจะเป็นฝ่ายไหน */
    const { data: creditor } = await admin
      .from('profiles')
      .select('payment_qr_path, display_name, nickname')
      .eq('id', debt.creditor_id)
      .maybeSingle()

    let receiptPath: string | null = null
    if (debt.bill_id) {
      const { data: bill } = await admin
        .from('expense_bills')
        .select('receipt_path')
        .eq('id', debt.bill_id)
        .maybeSingle()
      receiptPath = bill?.receipt_path ?? null
    }

    return ok({
      creditorName: creditor?.nickname || creditor?.display_name || null,
      /* ★★ ทั้งสามตัวใช้ signedUrlOrNull — ไฟล์ใดหายก็แค่ตัวนั้นเป็น null
         ★ เดิมใช้ signedUrl ที่โยน error ทำให้ไฟล์หายหนึ่งไฟล์
           ล้มทั้ง endpoint แล้วหน้าจ่ายเงินค้างที่ "กำลังโหลด…" */
      qrUrl: await signedUrlOrNull(BUCKETS.qr, creditor?.payment_qr_path),
      slipUrl: await signedUrlOrNull(BUCKETS.slips, debt.slip_path),
      receiptUrl: await signedUrlOrNull(BUCKETS.receipts, receiptPath),
    })
  },
)

/**
 * POST — ลูกหนี้แนบสลิป (FR-B04)
 *
 * ★ แนบสลิปอย่างเดียว ไม่เปลี่ยนสถานะ
 *   การกด "โอนแล้ว" เป็นคนละการกระทำ (POST /debts/[id] action=markPaid)
 *   ★ แยกกันเพราะคนอาจอยากแนบสลิปเพิ่มทีหลังโดยไม่ต้องกดโอนซ้ำ
 */
export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/wallet/debts/[id]/files'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    const debt = await loadDebt(id, actor.id)
    await enforceRateLimit('walletFile', actor.id)

    /* ★ เฉพาะลูกหนี้ — เจ้าหนี้แนบสลิปแทนไม่ได้ (เหตุผลเดียวกับ markPaid) */
    if (debt.debtor_id !== actor.id) throw new AppError('FORBIDDEN')

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
    }

    const path = await uploadPrivate(BUCKETS.slips, actor.id, file)

    const admin = getSupabaseAdminClient()
    const { error } = await admin.from('debts').update({ slip_path: path }).eq('id', id)
    if (error) throw fromPostgresError(error)

    return ok({ slipUrl: await signedUrl(BUCKETS.slips, path) })
  },
)
