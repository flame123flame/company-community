import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/http/guard'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import type { ProfileRow } from '@/types/database'

/**
 * ด่านของโมดูลกิจกรรมออฟฟิศ
 *
 * ★★★ เป็นด่าน "ชั้นที่สอง" ต่อจาก requireUser() ไม่ใช่ตัวแทน
 *
 *     requireUser() ตอบว่า "คนนี้สมัครห้องเพลงแล้วหรือยัง"
 *     ด่านนี้ตอบว่า "คนนี้เป็นพนักงานที่มีสิทธิ์ใช้โมดูลออฟฟิศไหม"
 *
 *     ★ แยกกันเพราะสองคำถามนี้มีคำตอบต่างกันได้จริง และต้องต่างกันได้:
 *       ห้องเพลงยังเปิดให้คนที่มีแค่ username เข้าได้เหมือนเดิมทุกประการ
 *       (ข้อกำหนดจากเจ้าของระบบ: "ของเดิมยังทำงานได้เหมือนเดิมทุกอย่าง")
 *
 *     ถ้ารวมสองด่านเป็นอันเดียว คนที่ใช้ห้องเพลงอยู่ทุกวันจะเข้าไม่ได้ทันที
 *     ที่ deploy — ซึ่งเป็นสิ่งที่ห้ามเกิดขึ้น
 */

export type OfficeUser = {
  id: string
  profile: ProfileRow
  isAdmin: boolean
}

/** คอลัมน์ที่ด่านนี้ต้องอ่าน — รวมไว้ที่เดียวกันหลุด */
const PROFILE_COLUMNS =
  'id, display_name, nickname, avatar_url, username, department, employee_code, is_admin, account_status, payment_qr_path'

/**
 * อ่านโปรไฟล์เต็มของผู้ใช้ที่ login อยู่
 *
 * ★ ใช้ admin client (ข้าม RLS) เพราะต้องอ่าน is_admin และ account_status
 *   ซึ่ง policy "profiles: read self or co-member" ให้อ่านได้อยู่แล้วก็จริง
 *   แต่การพึ่ง RLS ตรงนี้แปลว่าด่านความปลอดภัยขึ้นกับ policy ที่อาจถูกแก้
 *   ในอนาคตโดยคนที่ไม่รู้ว่ามีโค้ดนี้พึ่งอยู่ — อ่านตรงจึงชัดเจนกว่า
 */
async function loadProfile(userId: string): Promise<ProfileRow> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('UNAUTHORIZED', { messageKey: 'srvErr.sessionGone' })
  return data as ProfileRow
}

/**
 * ผู้ใช้ที่ login แล้ว + ยังไม่ถูกระงับ — ยังไม่บังคับว่าต้องมีรหัสพนักงาน
 *
 * ★ ใช้กับ endpoint ที่คนยังไม่ผูกรหัสต้องเรียกได้ เช่น การผูกรหัสเอง
 *   และหน้าโปรไฟล์ที่ต้องแสดงสถานะว่า "ยังไม่ได้ผูก"
 */
export async function requireActiveUser(): Promise<OfficeUser> {
  const user = await requireUser()
  const profile = await loadProfile(user.id)

  /*
   * ★★ บัญชีถูกระงับต้องถูกปฏิเสธที่ทุกทาง ไม่ใช่แค่ซ่อนเมนู
   *    รหัสพนักงานที่เปลี่ยนเป็น "ลาออก" ระงับบัญชีอัตโนมัติ (FR-X02)
   *    ถ้าด่านนี้ไม่ตรวจ คนที่ลาออกแล้วแต่ยังมี session ค้างในเครื่อง
   *    จะใช้ระบบต่อได้จนกว่า token จะหมดอายุ — ซึ่งอาจเป็นวัน
   */
  if (profile.account_status === 'SUSPENDED') {
    throw new AppError('ACCOUNT_SUSPENDED')
  }

  return { id: user.id, profile, isAdmin: profile.is_admin }
}

/**
 * ผู้ใช้ที่มีสิทธิ์ใช้โมดูลออฟฟิศเต็มรูปแบบ (NFR-11)
 *
 * ★ เงื่อนไขคือ "ผูกรหัสพนักงานแล้ว" ไม่ใช่ "มีอีเมลจริง"
 *   เพราะรหัสพนักงานคือสิ่งที่พิสูจน์ว่าเป็นคนในบริษัท ส่วนอีเมลกับรหัสผ่าน
 *   เป็นแค่วิธีเข้าระบบ ซึ่งผู้ใช้เดิมใช้ username แทนได้
 */
export async function requireOfficeUser(): Promise<OfficeUser> {
  const actor = await requireActiveUser()

  /*
   * ★★ ไม่ตรวจรหัสพนักงานแล้ว (0043) — ใครมีบัญชีที่ยังไม่ถูกระงับก็ใช้ได้
   *    ★ requireActiveUser() ด้านบนตรวจสถานะบัญชีให้แล้ว
   *    ★★ คงฟังก์ชันนี้ไว้แทนที่จะลบ เพราะมีจุดเรียกเป็นสิบ และวันที่
   *       อยากกลับไปบังคับรหัส จะได้เติมเงื่อนไขที่นี่ที่เดียว
   */
  return actor
}

/** เฉพาะ Admin (FR-X09) */
export async function requireAdmin(): Promise<OfficeUser> {
  const actor = await requireOfficeUser()

  if (!actor.isAdmin) {
    throw new AppError('FORBIDDEN')
  }

  return actor
}
