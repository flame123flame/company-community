import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** ขนาดสูงสุดต่อไฟล์ — ตรงกับ bucket ใน 0040 */
const MAX_BYTES = 20 * 1024 * 1024

/**
 * อัปโหลดไฟล์เข้าห้องแชท
 *
 * ★★ ตรวจสมาชิกก่อนอัปโหลด ไม่ใช่ตอนส่งข้อความ
 *    ★ ถ้าตรวจตอนส่ง คนนอกห้องจะยัดไฟล์เข้าที่เก็บของเราได้ฟรี
 *      แล้วเราจ่ายค่าพื้นที่ให้โดยไม่มีข้อความไหนอ้างถึงมันเลย
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('chatUpload', actor.id)

  const form = await request.formData()
  const file = form.get('file')
  const roomId = String(form.get('roomId') ?? '')

  if (!(file instanceof File)) throw new AppError('VALIDATION_FAILED')
  if (file.size > MAX_BYTES) throw new AppError("VALIDATION_FAILED", { messageKey: "valid.fileTooBig" })

  const admin = getSupabaseAdminClient()

  const { data: member } = await admin
    .from('office_chat_members')
    .select('room_id')
    .eq('room_id', roomId)
    .eq('user_id', actor.id)
    .maybeSingle()

  if (!member) throw new AppError('FORBIDDEN')

  /* ★ ชื่อไฟล์ในที่เก็บไม่เอาชื่อเดิมของผู้ใช้ — ชื่อไทย/อักขระแปลกทำให้ path พัง
     ★★ ชื่อจริงเก็บไว้ในคอลัมน์ file_name เพื่อแสดงผลและดาวน์โหลด */
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${roomId}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage
    .from('chat-files')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: 'no-store' })

  if (error) throw fromPostgresError(error)

  return ok({
    path,
    name: file.name.slice(0, 200),
    size: file.size,
    mime: file.type || 'application/octet-stream',
  })
})
