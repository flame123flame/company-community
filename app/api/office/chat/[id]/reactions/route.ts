import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/chat/[id]/reactions'>

/**
 * ใครกดความรู้สึกอะไรไว้บนข้อความหนึ่ง
 *
 * ★★★ แยกเป็นคำขอต่างหาก ไม่ยัดรวมไปกับรายการข้อความ
 *
 *     ★ หน้าแชทดึงข้อความ 300 ใบทุก 5 วินาที ★★ ถ้าแนบรายชื่อคนที่กด
 *       ไปกับทุกใบ ก้อนข้อมูลจะโตตามจำนวนคนในบริษัทคูณจำนวนข้อความ
 *       เพื่อข้อมูลที่คนเปิดดูจริงวันละไม่กี่ครั้ง
 *     ★ และรายชื่อ "ใครกดอะไร" ละเอียดกว่าที่ฟองข้อความต้องใช้ —
 *       ★★ ฟองต้องการแค่ "อีโมจิอะไร กี่คน เรากดไหม" ซึ่งส่งไปแล้วใน GET หลัก
 *          ★ ส่งรายชื่อไปด้วยทุกรอบ = แจกข้อมูลที่ไม่มีใครดูในกรณีส่วนใหญ่
 *
 * ★ ตรวจสมาชิกห้องที่นี่ด้วย ไม่พึ่ง RLS — route นี้ใช้ service role
 *   ซึ่งข้าม RLS ไปทั้งหมด (เหตุผลเดียวกับ GET ของห้อง)
 */
export const GET = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const messageId = new URL(request.url).searchParams.get('message')

  if (!messageId) throw new AppError('VALIDATION_FAILED')

  const admin = getSupabaseAdminClient()

  const { data: member } = await admin
    .from('office_chat_members')
    .select('room_id')
    .eq('room_id', id)
    .eq('user_id', actor.id)
    .maybeSingle()

  if (!member) throw new AppError('FORBIDDEN')

  /*
   * ★★ ยืนยันว่าข้อความอยู่ในห้องนี้จริง ไม่ใช่แค่ "เราอยู่ห้องนี้"
   *    ★ ไม่งั้นคนที่อยู่ห้อง A จะใส่ id ของข้อความในห้อง B แล้วอ่าน
   *      รายชื่อคนที่กดได้ ★★ ซึ่งบอกได้ว่าใครคุยกับใครโดยไม่ต้องเข้าห้องนั้น
   */
  const { data: msg } = await admin
    .from('office_chat_messages')
    .select('id')
    .eq('id', messageId)
    .eq('room_id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!msg) throw new AppError('FORBIDDEN')

  const { data: rows } = await admin
    .from('office_chat_reactions')
    .select('user_id, emoji, created_at')
    .eq('message_id', messageId)
    .order('created_at')

  const ids = [...new Set((rows ?? []).map((r) => r.user_id))]
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', ids)
    : { data: [] as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }[] }

  const byId = new Map((people ?? []).map((p) => [p.id, p]))

  return ok({
    people: (rows ?? []).map((r) => ({
      userId: r.user_id,
      emoji: r.emoji,
      name: byId.get(r.user_id)?.nickname || byId.get(r.user_id)?.display_name || '—',
      avatarUrl: byId.get(r.user_id)?.avatar_url ?? null,
      /* ★ บอกว่าแถวไหนคือเรา หน้าเว็บจะได้ชี้ทางให้ถอนได้จากในกล่องเลย */
      mine: r.user_id === actor.id,
    })),
  })
})
