import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { BUCKETS } from '@/lib/office/storage'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/office/wallet/receipt — อัปรูปใบเสร็จ คืน path (ไม่ใช่ URL)
 *
 * ★★★ คืน path ไม่ใช่ URL — ถังนี้เป็น private
 *
 *     ★ NFR-06 ระบุชัดว่าสลิป ใบเสร็จ และ QR ต้องเป็นส่วนตัว
 *       ★★ ใบเสร็จมีรายการที่สั่ง เวลา และบางทีมีเลขบัตรเครดิตสี่ตัวท้าย
 *          ★ public URL ของถังแบบนั้นคือลิงก์ที่ใครเดาถูกก็เปิดได้
 *     ★ ฝั่งที่จะแสดงผลต้องขอ signed URL เอาเอง (ดู debts/[id]/files)
 *
 * ★★ มีขึ้นเพราะหน้าสร้างบิลไม่เคยมีทางอัปใบเสร็จเลย
 *    ★ schema รับ receiptPath มาตั้งแต่แรก แต่ไม่มีใครส่งค่าให้ —
 *      ★★ ช่องที่รับค่าแต่ไม่มีทางกรอก คือฟีเจอร์ที่เขียนไว้ครึ่งเดียว
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('createBill', actor.id)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
  }

  const ext = ALLOWED[file.type]
  if (!ext) throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.imgTypes3' })
  if (file.size > MAX_BYTES) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.max2mb' })
  }

  const admin = getSupabaseAdminClient()
  /* ★ แยกโฟลเดอร์ตามเจ้าของ — ง่ายต่อการลบทั้งก้อนวันที่คนลาออก */
  const path = `${actor.id}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage.from(BUCKETS.receipts).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (error) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })

  return ok({ path })
})
