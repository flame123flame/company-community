import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const BUCKET = 'reviews'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/office/food/reviews/upload — อัปโหลดรูปรีวิวทีละใบ
 *
 * ★★ คืน "path" มาด้วย ไม่ใช่แค่ url
 *
 *    url ใช้แสดงผล ส่วน path คือสิ่งที่เก็บลงตาราง
 *    ★ ถ้าเก็บ url เต็มลงฐานข้อมูล วันที่ย้าย storage หรือเปลี่ยนโดเมน
 *      รูปเก่าทุกใบจะชี้ไปที่ที่ไม่มีอยู่แล้ว และแก้ได้ด้วยการไล่เขียนทับ
 *      ทุกแถวเท่านั้น
 *
 * ★ อัปโหลดก่อนบันทึกรีวิว แปลว่ามีโอกาสเหลือไฟล์กำพร้าถ้าคนปิดหน้าไปเฉย ๆ
 *   ★★ ยอมรับได้ — ทางเลือกคือส่งรูปพร้อมฟอร์มทีเดียว ซึ่งทำให้เห็น
 *      ความคืบหน้าการอัปโหลดต่อใบไม่ได้ และรูป 10 ใบจากมือถือ
 *      คือคำขอก้อนเดียวที่ใหญ่พอจะ timeout
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('foodReviewUpload', actor.id)

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
  return ok({ path, url: data.publicUrl })
})
