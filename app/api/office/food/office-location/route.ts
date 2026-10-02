import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/food/office-location — พิกัดออฟฟิศ
 *
 * ★★ แยกจาก /api/office/admin/settings เพราะคนละสิทธิ์
 *
 *    ค่าตั้งทั้งก้อนเป็นของ Admin ★ แต่พิกัดออฟฟิศต้องอ่านได้โดยพนักงานทุกคน
 *    เพราะปุ่ม "ไปร้าน" ต้องใช้มันเป็นจุดตั้งต้นของเส้นทาง
 *    ★★ ทางเลือกคือเปิด endpoint ของ Admin ให้ทุกคนอ่าน ซึ่งจะเผยค่าตั้ง
 *       อื่นทั้งหมดไปด้วยโดยไม่มีใครตั้งใจ
 *
 * ★ ล้มแล้วคืน null ไม่ throw — ข้อกำหนดบอกว่าร้านที่ไม่มีพิกัดให้ซ่อนส่วนนี้
 *   ★★ ออฟฟิศที่ยังไม่ตั้งพิกัดก็เข้าข่ายเดียวกัน ไม่ใช่ความผิดพลาด
 */
export const GET = withErrorHandling(async () => {
  await requireOfficeUser()

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'office_latlng')
    .maybeSingle()

  if (error) return ok({ office: null })

  const v = data?.value as { lat?: number; lng?: number } | null
  const okCoords = v && typeof v.lat === 'number' && typeof v.lng === 'number'

  return ok({ office: okCoords ? { lat: v.lat as number, lng: v.lng as number } : null })
})
