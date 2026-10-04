import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const BUCKET = 'restaurants'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/office/food/dish-photo — อัปรูปของเมนูหนึ่งรายการ (0060)
 *
 * ★★ ไม่ผูกกับร้าน — คืน path กลับไปให้ฟอร์มถือไว้ แล้วส่งมากับรายการเมนูตอนกดบันทึก
 *    ★ ร้านใหม่ยังไม่มี id ตอนเลือกรูป ทางนี้จึงใช้ได้ทั้งตอนเพิ่มและตอนแก้ไข
 *    ★ path อยู่ใต้ dishes/<คนอัป>/ — set_restaurant_dishes รับเฉพาะรูปแบบนี้
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)
  const actor = await requireOfficeUser()
  await enforceRateLimit('foodReviewUpload', actor.id)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })

  const ext = ALLOWED[file.type]
  if (!ext) throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.imgTypes3' })
  if (file.size > MAX_BYTES) throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.max2mb' })

  const admin = getSupabaseAdminClient()
  const path = `dishes/${actor.id}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '604800',
  })
  if (error) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })

  return ok({ path, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
})
