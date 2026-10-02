import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

const schema = z.union([
  z.object({
    action: z.literal('save'),
    name: z.string().trim().min(1, 'common.required').max(40),
    memberIds: z.array(z.uuid()).min(1, 'valid.noPeople').max(50),
  }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
])

/**
 * POST /api/office/wallet/groups — บันทึก/ลบกลุ่มคนที่หารด้วย
 *
 * ★★ เรียกจากปุ่ม "บันทึกเป็นกลุ่ม" บนหน้าสร้างบิล ไม่ใช่จากหน้าตั้งค่า
 *    ★ ข้อกำหนดระบุว่า "ไม่ต้องให้ผู้ใช้ไปสร้างกลุ่มเอง" — ระบบเสนอให้
 *      ตอนที่เห็นว่าใช้ชุดเดิมซ้ำแล้ว ★★ ซึ่งเป็นจังหวะเดียวที่คนจะกดจริง
 *      เพราะเขากำลังเลือกคนชุดนั้นอยู่พอดี
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('createBill', actor.id)

  const admin = getSupabaseAdminClient()

  if (body.action === 'delete') {
    /* ★ ลบได้เฉพาะกลุ่มของตัวเอง — เงื่อนไข owner_id อยู่ใน query ไม่ใช่ใน if
         ★★ การเช็กก่อนแล้วค่อยลบ เปิดช่องให้ race condition */
    const { error } = await admin
      .from('split_groups')
      .delete()
      .eq('id', body.id)
      .eq('owner_id', actor.id)
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  /*
   * ★★ ตัดตัวเองออกจากกลุ่มเสมอ
   *    ★ "แก๊งข้าวเที่ยง" ของฉัน หมายถึงคนอื่นที่ฉันหารด้วย ★★ ถ้าเก็บตัวเอง
   *      ไว้ในกลุ่มด้วย พอกดเลือกกลุ่มจะได้ตัวเองเป็นลูกหนี้ของตัวเอง
   *      ซึ่ง RPC ปฏิเสธ แล้วผู้ใช้จะเห็นแค่ "สร้างบิลไม่ได้" โดยไม่รู้สาเหตุ
   */
  const members = [...new Set(body.memberIds.filter((id) => id !== actor.id))]
  if (members.length === 0) throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.noPeople' })

  const { data, error } = await admin
    .from('split_groups')
    .insert({ owner_id: actor.id, name: body.name, member_ids: members })
    .select('id, name, member_ids')
    .single()

  if (error) throw fromPostgresError(error)
  return ok({ id: data.id, name: data.name, memberIds: data.member_ids })
})
