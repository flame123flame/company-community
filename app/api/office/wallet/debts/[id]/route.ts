import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * การกระทำกับรายการค้างจ่ายหนึ่งรายการ (FR-B04 / FR-B06)
 *
 * ★★ ทุก action ตรวจสิทธิ์ใน RPC ไม่ใช่ที่นี่
 *
 *    RPC รู้ว่าใครเป็นเจ้าหนี้/ลูกหนี้ของแถวนั้นจริง ๆ ส่วน Route Handler
 *    รู้แค่ว่าคนยิงเป็นใคร ★ ถ้าตรวจที่นี่ต้องอ่านแถวมาก่อนหนึ่งรอบ
 *      แล้วระหว่างอ่านกับเขียนมีช่องว่างที่สถานะเปลี่ยนได้
 */

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('markPaid'), slipPath: z.string().max(300).optional().nullable() }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('cancel') }),
  /*
   * ★★★ "ยังไม่ได้รับ" — เจ้าหนี้ปฏิเสธการโอนที่ลูกหนี้แจ้งไว้
   *
   *     ★ ข้อกำหนด 3.3: ข้างปุ่มยืนยันต้องมีลิงก์เล็ก "ยังไม่ได้รับ"
   *       → สถานะกลับเป็นค้างจ่ายและแจ้งลูกหนี้
   *     ★★ เดิมไม่มีทางย้อน — เจ้าหนี้ที่กดยืนยันพลาด หรือลูกหนี้ที่กด
   *        "จ่ายแล้ว" ทั้งที่ยังไม่โอน ทำให้หนี้ค้างอยู่ในสถานะรอยืนยันตลอดไป
   *        ★ ทางออกเดียวคือ "ยกเลิกหนี้" ซึ่งลบหนี้ทิ้งทั้งที่เงินยังไม่ได้รับ
   */
  z.object({ action: z.literal('reject') }),
  z.object({ action: z.literal('remind'), tone: z.enum(['POLITE', 'FUNNY']).default('POLITE') }),
])

export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/wallet/debts/[id]'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const body = await parseJsonBody(request, actionSchema)
    const actor = await requireOfficeUser()
    await enforceRateLimit('walletAction', actor.id)

    const admin = getSupabaseAdminClient()

    if (body.action === 'markPaid') {
      const { data, error } = await admin.rpc('mark_debt_paid', {
        p_actor: actor.id,
        p_id: id,
        p_slip: body.slipPath ?? null,
      })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    if (body.action === 'confirm') {
      const { data, error } = await admin.rpc('confirm_debt', { p_actor: actor.id, p_id: id })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    if (body.action === 'reject') {
      /*
       * ★★ เขียนตรงที่ตาราง ไม่มี RPC ให้ใช้
       *    ★ เงื่อนไขความปลอดภัยอยู่ใน where ทั้งหมด: ต้องเป็นเจ้าหนี้ของใบนี้
       *      และใบนี้ต้องอยู่สถานะรอยืนยันเท่านั้น
       *      ★★ ใส่เงื่อนไขใน where ไม่ใช่เช็คก่อนแล้วค่อยเขียน —
       *         การเช็คก่อนเปิดช่องให้สถานะเปลี่ยนระหว่างนั้น
       */
      const { data, error } = await admin
        .from('debts')
        .update({ status: 'PENDING', paid_at: null, slip_path: null })
        .eq('id', id)
        .eq('creditor_id', actor.id)
        .eq('status', 'PAID_PENDING')
        .select('id, debtor_id, amount')
        .maybeSingle()

      if (error) throw fromPostgresError(error)
      if (!data) throw new AppError('FORBIDDEN')

      /* ★ ลูกหนี้ต้องรู้ว่าถูกตีกลับ ไม่งั้นเขาคิดว่าจบไปแล้ว */
      await admin.rpc('notify', {
        p_user: data.debtor_id,
        /*
         * ★★★ ชนิดของตัวเอง ไม่ใช่ยืม 'debtCreated' มาใช้
         *
         *     ★ สวิตช์ปิดแจ้งเตือนทำงานจากช่อง type ★★ การยืมชนิดของคนอื่น
         *       แปลว่าคนที่ปิด "มีคนสร้างรายการค้างจ่าย" จะไม่ได้รับข่าวว่า
         *       "เจ้าหนี้แจ้งว่ายังไม่ได้รับเงิน" ไปด้วย
         *       ★ ซึ่งเป็นข่าวที่เขาต้องรู้ที่สุด — เงินที่โอนไปแล้วถูกตีกลับ
         */
        p_type: 'debtRejected',
        p_title_key: 'notify.type.debtRejected',
        p_params: { amount: data.amount },
        p_link: '/office/wallet/owed',
      })

      return ok({ status: 'PENDING' })
    }

    if (body.action === 'cancel') {
      const { data, error } = await admin.rpc('cancel_debt', { p_actor: actor.id, p_id: id })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    const { data, error } = await admin.rpc('remind_debt', {
      p_actor: actor.id,
      p_id: id,
      p_tone: body.tone,
    })
    if (error) throw fromPostgresError(error)
    return ok({ lastRemindedAt: data?.last_reminded_at })
  },
)
