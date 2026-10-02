import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/people — รายชื่อพนักงานสำหรับเลือกในฟอร์ม
 *
 * ★★ คืนแค่ ชื่อ · ฝ่าย · รูป · id เท่านั้น
 *
 *    ไม่มีรหัสพนักงาน ไม่มี username ไม่มีสถานะบัญชี ★ เพราะฟอร์มที่เรียก
 *    ตัวนี้ต้องการแค่ "รายชื่อให้กดเลือก" — ข้อมูลที่เกินจากนั้นคือ
 *    ข้อมูลที่รั่วได้โดยไม่มีใครได้ประโยชน์
 *    ★★ รูปโปรไฟล์อยู่ใน bucket สาธารณะอยู่แล้ว (เห็นกันได้ทั้งระบบ)
 *       การส่งมาด้วยจึงไม่ได้เปิดอะไรใหม่ และทำให้เลือกคนถูกเร็วขึ้นมาก
 *
 * ★★★ เกณฑ์คือ "ใช้ระบบออฟฟิศได้" ไม่ใช่ "มีรหัสพนักงาน"
 *
 *     ★ เดิมกรอง employee_code is not null ซึ่งเคยตรงกับความจริง
 *       ★★ แต่ตั้งแต่ 0043 เปิดให้ใครก็สมัครได้ รหัสพนักงานกลายเป็นข้อมูล
 *          ประกอบ ไม่ใช่ใบผ่าน — can_use_office() ดูแค่ account_status
 *     ★ ผลคือคนที่สมัครหลัง 0043 หายไปจากตัวเลือกผู้ร่วมจ่ายทั้งหมด
 *       ★★ วัดได้ตอนเจอ: 6 จาก 11 บัญชีที่ใช้งานอยู่ ไม่โผล่ในรายการเลย
 *          และอาการคือ "หาเพื่อนไม่เจอ" ซึ่งคนใช้จะโทษตัวเองว่าค้นผิด
 *
 * ★ เฉพาะพนักงานที่ใช้งานอยู่ — คนที่ถูกระงับไม่ควรถูกใส่ในบิลใหม่
 */
export const GET = withErrorHandling(async () => {
  await requireOfficeUser()

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name, nickname, department, avatar_url')
    .eq('account_status', 'ACTIVE')
    .order('display_name')

  if (error) throw fromPostgresError(error)

  return ok({
    items: (data ?? []).map((p) => ({
      id: p.id,
      name: p.nickname || p.display_name,
      department: p.department,
      avatarUrl: p.avatar_url,
    })),
  })
})
