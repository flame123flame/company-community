import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const BUCKET = 'listings'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/office/market/upload — อัปรูปสินค้า คืน public URL
 *
 * ★★ bucket นี้เป็น public ต่างจากของโมดูล B โดยตั้งใจ
 *    NFR-06 ระบุให้เฉพาะสลิป ใบเสร็จ และ QR เป็นส่วนตัว
 *    ★ รูปสินค้าแสดงเป็นตารางหลายสิบใบพร้อมกัน — ถ้าเป็น private
 *      ต้องออก signed URL ทีละใบทุกครั้งที่โหลดหน้า ซึ่งช้าโดยไม่ได้
 *      ปกป้องอะไรเพิ่ม (พนักงานทุกคนเห็นได้อยู่แล้ว)
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('marketUpload', actor.id)

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
  const path = `${actor.id}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '604800',
  })

  if (error) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return ok({ url: data.publicUrl })
})
