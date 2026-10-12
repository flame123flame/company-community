import type { NextRequest } from 'next/server'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { BUCKETS, uploadPrivate } from '@/lib/office/storage'

export const dynamic = 'force-dynamic'

/**
 * POST /api/office/wallet/slip — อัปสลิปโอนเงิน คืน path (ไม่ใช่ URL)
 *
 * ★★★ มีขึ้นเพราะบั๊กจริง: สลิปที่อัปแล้ว "ไม่ขึ้น" ทุกใบ
 *
 *     ★ หน้าจ่ายเงินยิงสลิปไปที่ /api/office/wallet/receipt ซึ่งเก็บลงถัง
 *       receipts ★★ แต่ตอนอ่าน ระบบไปหาใน slips ตาม debts.slip_path
 *       ★ ไฟล์อยู่จริงทุกใบ แค่อยู่คนละถังกับที่ไปหา — จึงได้ null เงียบ ๆ
 *         แล้วหน้าจอแสดงว่า "ไม่มีสลิป" ทั้งที่ผู้ใช้เพิ่งอัปสำเร็จ
 *
 *     ★★ ตรวจกับฐานข้อมูลจริงแล้วเจอ 3 ใบที่ slip_path ชี้ไปถัง slips
 *        แต่ไฟล์อยู่ในถัง receipts ทั้งสามใบ
 *
 * ★★ ทำไมต้องมี endpoint แยก ไม่ใช้ของ debts/[id]/files ที่มีอยู่แล้ว
 *    ★ หน้าจ่ายเงินจ่ายหลายใบพร้อมกันได้ และกรณีหักลบยอด "ใบที่จะจ่าย"
 *      ยังไม่เกิดตอนที่ผู้ใช้แนบสลิป ★★ จึงต้องอัปก่อนแล้วค่อยผูกทีหลัง
 *    ★ ส่วน debts/[id]/files ยังอยู่ ใช้ตอนแนบสลิปให้ใบเดียวที่มีอยู่แล้ว
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('walletFile', actor.id)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
  }

  /* ★ uploadPrivate ตั้ง path เป็น <id ของเจ้าของ>/<uuid> ให้เอง
       ★★ ซึ่งเป็นสิ่งที่ด่านตรวจสิทธิ์ตอนผูกกับหนี้ใช้ยืนยันว่าเป็นของจริง */
  const path = await uploadPrivate(BUCKETS.slips, actor.id, file)
  return ok({ path })
})
