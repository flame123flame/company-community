import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
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
 * รูปของร้าน (0056)
 *
 * ★★★ แยก bucket และตารางจากรูปรีวิว เพราะอายุของมันต่างกัน
 *
 *     ★ รูปรีวิวหายไปพร้อมรีวิว — ถูกต้องสำหรับรูปของรีวิว
 *     ★★ แต่หน้าปกของร้านที่ดึงมาจากรูปรีวิวใบล่าสุด จะเปลี่ยนเองทุกครั้ง
 *        ที่มีคนรีวิวใหม่ และหายไปเลยถ้าคนนั้นลบรีวิว
 *        ★ ซึ่งเป็นอาการที่หน้ารายการร้านเป็นอยู่ก่อนเฟสนี้
 *
 * ★ เพดาน 10 รูปต่อร้านบังคับใน add_restaurant_photos ไม่ใช่ที่นี่
 *   ★★ route ใช้ service role ซึ่งข้าม RLS ได้ ด่านสุดท้ายจึงต้องอยู่ใน DB
 */

/** POST — อัปโหลดรูปทีละใบ แล้วผูกกับร้าน */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: RouteContext<'/api/office/food/restaurants/[id]/photos'>,
  ) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

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
    const path = `${id}/${crypto.randomUUID()}.${ext}`

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '604800',
    })
    if (upErr) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })

    /*
     * ★★ ผูกกับร้านทันทีในคำขอเดียวกัน ไม่ใช่คืน path ให้หน้าเว็บส่งกลับมาอีกรอบ
     *    ★ รูปของร้านไม่มีฟอร์มให้กด "บันทึก" เหมือนรีวิว — มันคือ
     *      "เลือกไฟล์แล้วขึ้นเลย" ★★ การแยกสองขั้นจึงสร้างแต่ไฟล์กำพร้า
     *      เมื่อคนปิดหน้าไประหว่างทาง
     */
    const { error } = await admin.rpc('add_restaurant_photos', {
      p_actor: actor.id,
      p_shop: id,
      p_paths: [path],
    })

    if (error) {
      /* ★ ผูกไม่สำเร็จ (เกิน 10 รูป ฯลฯ) → เก็บไฟล์ที่เพิ่งอัปทิ้ง
           ★★ ไม่งั้นโควตาเต็มไปด้วยไฟล์ที่ไม่มีแถวไหนชี้ถึง */
      await admin.storage.from(BUCKET).remove([path])
      throw fromPostgresError(error)
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return ok({ path, url: data.publicUrl })
  },
)

const delSchema = z.object({ photoId: z.uuid() })

/** DELETE — เอารูปออก (คนอัปโหลด · เจ้าของร้าน · แอดมิน) */
export const DELETE = withErrorHandling(
  async (
    request: NextRequest,
    context: RouteContext<'/api/office/food/restaurants/[id]/photos'>,
  ) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    await enforceRateLimit('foodReviewUpload', actor.id)

    const body = await parseJsonBody(request, delSchema)
    const admin = getSupabaseAdminClient()

    /* ★ อ่าน path ไว้ก่อนลบแถว — ลบแล้วไม่มีทางรู้ว่าไฟล์ไหนต้องเก็บกวาด */
    const { data: row } = await admin
      .from('restaurant_photos')
      .select('path, restaurant_id')
      .eq('id', body.photoId)
      .maybeSingle()

    if (!row || row.restaurant_id !== id) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    const { error } = await admin.rpc('delete_restaurant_photo', {
      p_actor: actor.id,
      p_photo: body.photoId,
    })
    if (error) throw fromPostgresError(error)

    /* ★ ไฟล์ลบไม่ได้ไม่ควรทำให้คำขอล้ม — แถวหายไปแล้ว รูปไม่โผล่ที่ไหนอีก */
    await admin.storage.from(BUCKET).remove([row.path])

    return ok({ deleted: true })
  },
)
