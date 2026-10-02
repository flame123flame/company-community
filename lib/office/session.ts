import 'server-only'

import { getCurrentUser, createSupabaseServerClient } from '@/lib/supabase/server'
import type { AccountStatus } from '@/types/database'

/**
 * ผู้ใช้ที่กำลังดูหน้าออฟฟิศอยู่ — สำหรับ Server Component
 *
 * ★ ต่างจาก requireOfficeUser() ใน guard.ts ตรงที่ "ไม่โยน error"
 *   Route Handler ต้องการ error เพื่อตอบ HTTP status ที่ถูกต้อง
 *   ส่วนหน้าเว็บต้องการ "ข้อมูลพอให้ตัดสินใจว่าจะ redirect ไปไหน"
 *   ★ ถ้าให้หน้าเว็บโยน error ผู้ใช้จะเห็นหน้า error แทนที่จะถูกพาไปหน้าที่ถูก
 */

export type OfficeViewer = {
  id: string
  displayName: string
  nickname: string | null
  avatarUrl: string | null
  username: string
  department: string | null
  employeeCode: string | null
  isAdmin: boolean
  accountStatus: AccountStatus
}

/**
 * ★★★ อ่านคอลัมน์ใหม่แบบเผื่อว่ายังไม่มีในฐานข้อมูล
 *
 *     บทเรียนเดียวกับที่ getRegisteredUser() บันทึกไว้ใน lib/supabase/server.ts:
 *     เคย deploy โค้ดที่ select คอลัมน์ใหม่ก่อน migration ถูกรัน แล้ว query
 *     ทั้งอันพัง → ทุกคนถูกเด้งออกจากระบบพร้อมกัน
 *
 *     ★ ที่นี่เสี่ยงกว่าเดิมอีก เพราะ Vercel deploy กับการรัน migration
 *       เป็นคนละขั้นตอนที่คนละคนกด — ลำดับสลับกันได้เสมอ
 *
 *     ★★ ถ้าอ่านคอลัมน์ใหม่ไม่ได้ ให้ถือว่า "ยังไม่ผูกรหัสพนักงาน"
 *        ผลคือคนเข้าหน้าออฟฟิศไม่ได้ชั่วคราว แต่ห้องเพลงยังใช้ได้ปกติ
 *        ซึ่งดีกว่าทั้งเว็บพังพร้อมกันมาก
 */
const BASE_COLUMNS = 'display_name, username, nickname, avatar_url'
const OFFICE_COLUMNS = 'department, employee_code, is_admin, account_status'

export async function getOfficeViewer(): Promise<OfficeViewer | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createSupabaseServerClient()

  type Row = {
    display_name: string
    username: string | null
    nickname: string | null
    avatar_url: string | null
    department?: string | null
    employee_code?: string | null
    is_admin?: boolean | null
    account_status?: AccountStatus | null
  }

  const wide = await supabase
    .from('profiles')
    .select(`${BASE_COLUMNS}, ${OFFICE_COLUMNS}`)
    .eq('id', user.id)
    .maybeSingle()

  const row = (
    wide.error
      ? (await supabase.from('profiles').select(BASE_COLUMNS).eq('id', user.id).maybeSingle()).data
      : wide.data
  ) as Row | null

  /* ★ ไม่มี username = ยังไม่ผ่านหน้าสมัครของห้องเพลง — ยังไม่ใช่ผู้ใช้ของเราเลย */
  if (!row?.username) return null

  return {
    id: user.id,
    displayName: row.display_name,
    username: row.username,
    nickname: row.nickname ?? null,
    avatarUrl: row.avatar_url ?? null,
    department: row.department ?? null,
    employeeCode: row.employee_code ?? null,
    isAdmin: row.is_admin ?? false,
    accountStatus: row.account_status ?? 'ACTIVE',
  }
}

/**
 * คนนี้เป็น Admin ไหม — คำถามเดียว คำตอบเดียว
 *
 * ★★ แยกจาก getOfficeViewer() เพราะหน้าแรกไม่ได้ต้องการข้อมูลทั้งชุด
 *    ★ มันต้องการแค่ "โชว์ปุ่ม Admin ไหม" ★★ และต้องไม่ทำให้หน้าแรกพัง
 *       ถ้า query นี้ล้ม — ล้มแล้วคืน false คือไม่เห็นปุ่ม ซึ่งยอมรับได้
 *       ต่างจากการโยน error ที่จะทำให้ทั้งหน้าไม่ขึ้น
 */
export async function viewerIsAdmin(userId: string): Promise<boolean> {
  try {
    /* ★ ใช้ client ของผู้ใช้เอง ไม่ใช่ service role — อ่านสิทธิ์ตัวเองพอ
       ★★ ไม่ต้องยกระดับสิทธิ์เพื่อตอบคำถามที่ RLS ยอมให้ถามอยู่แล้ว */
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    return Boolean(data?.is_admin)
  } catch {
    return false
  }
}
