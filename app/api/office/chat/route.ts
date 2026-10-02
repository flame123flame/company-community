import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** รายการห้องแชทของฉัน */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('my_office_chats', { p_actor: actor.id })
  if (error) throw fromPostgresError(error)

  /*
   * ★★★ รูปกลุ่มอยู่ใน bucket ส่วนตัว ต้องเซ็น URL ก่อนส่งออกไป
   *
   *     ★ RPC คืนมาเป็น avatar_path ซึ่งเป็น "ที่อยู่ในถัง" ไม่ใช่ลิงก์ที่เปิดได้
   *       ★★ เดิมไม่มีใครแปลงมันเลย รายการห้องจึงไม่เคยมีรูปกลุ่ม —
   *          รูปขึ้นเฉพาะในหัวห้องกับแผงข้อมูลกลุ่ม ซึ่งเป็นสองที่ที่ route อื่น
   *          เซ็นให้อยู่แล้ว ★ ผู้ใช้รายงานตรง ๆ ว่า "แก้รูปกลุ่มแล้วแต่ไม่มา
   *          แสดงฝั่งซ้าย"
   *
   * ★★ เซ็นรวดเดียวทั้งชุดด้วย createSignedUrls ไม่ใช่วนทีละห้อง
   *    ★ คนที่อยู่ในกลุ่มสิบกลุ่มจะเสียเวลาไปกลับสิบรอบเพื่อเปิดหน้าแชทหนึ่งครั้ง
   *
   * ★ อายุ 10 นาที เท่ากับไฟล์ในแชท — รายการถูกดึงใหม่ทุก 5 วินาทีอยู่แล้ว
   *   ลิงก์จึงไม่มีโอกาสหมดอายุคาหน้าจอ
   */
  type Row = { kind: string; avatar: string | null; avatar_path: string | null }
  const rooms = (data ?? []) as Row[]
  const paths = rooms.map((r) => r.avatar_path).filter((p): p is string => Boolean(p))

  if (paths.length > 0) {
    const { data: urls } = await admin.storage.from('chat-files').createSignedUrls(paths, 600)
    const signed = new Map<string, string>()
    for (const [i, u] of (urls ?? []).entries()) {
      const path = paths[i]
      if (path && u.signedUrl) signed.set(path, u.signedUrl)
    }
    for (const r of rooms) {
      if (r.avatar_path) r.avatar = signed.get(r.avatar_path) ?? null
    }
  }

  /*
   * ★★ ห้องกลุ่มที่ยังไม่ได้ตั้งรูป ต้องเป็น null ไม่ใช่รูปของสมาชิกคนใดคนหนึ่ง
   *    ★ RPC หยิบ avatar ของ "คนอื่นคนแรกในห้อง" ซึ่งถูกสำหรับแชทส่วนตัว
   *      ★★ แต่ในกลุ่มมันคือรูปของสมาชิกสุ่ม ๆ หนึ่งคน — คนจะอ่านว่าเป็น
   *         แชทส่วนตัวกับคนนั้น แล้วทักผิดห้อง
   */
  for (const r of rooms) {
    if (r.kind === 'GROUP' && !r.avatar_path) r.avatar = null
  }

  /*
   * ★★ บอก id ของตัวเองมาด้วย
   *    ★ /api/office/people คืนพนักงานทุกคนรวมตัวเราเอง ซึ่งถูกแล้วสำหรับ
   *      ฟอร์มอื่น (เราอยู่ในบิลค่าข้าวได้) ★★ แต่แชทกับตัวเองไม่ได้ —
   *      RPC โยน VALIDATION_FAILED ทิ้ง หน้าเว็บจึงต้องคัดชื่อตัวเองออกก่อน
   *    ★ คัดที่หน้าเว็บ ไม่ใช่แก้ people API ซึ่งมีหน้าอื่นใช้อยู่ด้วย
   */
  return ok({ rooms, meId: actor.id })
})

const schema = z.union([
  /* แชทส่วนตัว — เปิดซ้ำได้ ได้ห้องเดิมเสมอ */
  z.object({ action: z.literal('dm'), userId: z.uuid() }),
  /* ห้องกลุ่ม */
  z.object({
    action: z.literal('group'),
    title: z.string().trim().min(1, 'common.required').max(60),
    members: z.array(z.uuid()).min(1, 'valid.needMembers').max(50),
  }),
])

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('chatAction', actor.id)

  const admin = getSupabaseAdminClient()

  if (body.action === 'dm') {
    const { data, error } = await admin.rpc('open_office_dm', {
      p_actor: actor.id,
      p_other: body.userId,
    })
    if (error) throw fromPostgresError(error)
    return ok({ roomId: data })
  }

  const { data, error } = await admin.rpc('create_office_group', {
    p_actor: actor.id,
    p_title: body.title,
    p_members: body.members,
  })
  if (error) throw fromPostgresError(error)
  return ok({ roomId: data })
})
