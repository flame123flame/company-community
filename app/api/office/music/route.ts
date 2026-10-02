import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * ห้องเพลงของฉัน (FR-X11)
 *
 * ★ อ่านอย่างเดียว ไม่มี POST — ระบบออฟฟิศไม่สั่งอะไรในห้องเพลงเลย
 *   ★★ ของเดิมต้องทำงานเหมือนเดิมทุกอย่าง การเพิ่มทางสั่งจากที่นี่
 *      คือการเพิ่มทางที่ห้องเพลงจะพังจากโค้ดที่ไม่ได้ถูกทดสอบร่วมกัน
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('my_music_rooms', { p_actor: actor.id, p_limit: 4 })
  if (error) throw fromPostgresError(error)

  return ok({ rooms: data ?? [] })
})
