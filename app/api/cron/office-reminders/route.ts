import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/cron/office-reminders — เตือนหนี้ค้างอัตโนมัติ (FR-B05)
 *
 * ★ ตรรกะทั้งหมดอยู่ใน send_due_reminders() — ที่นี่แค่กดปุ่ม
 *   ★★ รอบที่ส่งไปแล้วถูกจำใน debts.auto_reminded
 *      จึงเรียกซ้ำกี่ครั้งก็ไม่ส่งซ้ำ — สำคัญเพราะ cron ของ Vercel
 *      ไม่รับประกันว่ายิงครั้งเดียว และการทวงเงินซ้ำ ๆ คือเรื่องที่คนโมโหจริง
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) throw new AppError('FORBIDDEN')
  }

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('send_due_reminders')
  if (error) throw fromPostgresError(error)

  return ok({ sent: data ?? 0 })
})
