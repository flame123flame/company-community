import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireAdmin } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * ค่าตั้งระบบที่แก้ได้จากหน้า Admin (FR-X09 · หัวข้อ 8.6)
 *
 * ★★ ประกาศ schema ต่อคีย์ ไม่ใช่รับ jsonb อะไรก็ได้
 *
 *    ตาราง app_settings เก็บ jsonb ซึ่งรับอะไรก็ได้จริง — ★ แต่ค่าพวกนี้
 *    ถูกอ่านโดย RPC ที่ cast เป็น integer (เช่น report_threshold)
 *    ถ้ามีใครยัดสตริงเข้าไป RPC จะพังตอนรันซึ่งไกลจากจุดที่ผิดมาก
 *
 *    ★ ตรวจตั้งแต่ตรงนี้ = ค่าที่ผิดรูปไม่มีวันเข้าฐานข้อมูลได้เลย
 */
const SETTINGS = {
  report_threshold: z.number().int().min(1).max(50),
  no_repeat_days: z.number().int().min(0).max(90),
  reminder_days: z.array(z.number().int().min(1).max(365)).max(10),
  lottery_next_draw: z.string().date().nullable(),
  /*
   * ★ พิกัดออฟฟิศ (0050) — null = ยังไม่ได้ตั้ง ซึ่งเป็นสถานะที่ถูกต้อง
   *   ★★ ไม่ใช่ค่าตั้งธรรมดา: การเขียนมันต้องคำนวณระยะทางทุกร้านใหม่ด้วย
   *      จึงถูกแยกไปเขียนผ่าน RPC ข้างล่าง ไม่ผ่าน upsert ก้อนเดียวกับคีย์อื่น
   */
  office_latlng: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable(),
} as const

type SettingKey = keyof typeof SETTINGS

/** GET /api/office/admin/settings */
export const GET = withErrorHandling(async () => {
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.from('app_settings').select('key, value')
  if (error) throw fromPostgresError(error)

  const out: Record<string, unknown> = {}
  for (const row of data ?? []) out[row.key] = row.value

  return ok({ settings: out })
})

const patchSchema = z
  .object({
    key: z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]),
    value: z.unknown(),
  })
  /* ★ ตรวจ value ตาม key ที่ส่งมา — superRefine เพราะ schema ขึ้นกับค่าอีกฟิลด์ */
  .superRefine((input, ctx) => {
    const schema = SETTINGS[input.key]
    const parsed = schema.safeParse(input.value)
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'apiErr.VALIDATION_FAILED', path: ['value'] })
    }
  })

/** PATCH /api/office/admin/settings */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, patchSchema)
  const actor = await requireAdmin()
  await enforceRateLimit('adminAction', actor.id)

  const admin = getSupabaseAdminClient()

  /*
   * ★★★ พิกัดออฟฟิศเขียนผ่าน RPC ไม่ใช่ upsert ตรง ๆ
   *
   *     ★ การเขียนค่านี้ต้องตามด้วยการคำนวณระยะทางใหม่ทุกร้าน
   *       ★★ ถ้า upsert ตรง ๆ ค่าจะถูกบันทึกสำเร็จ แต่ระยะทางทุกร้าน
   *          ยังเป็นของพิกัดเก่า — หน้าเว็บจะบอก "เดิน 3 นาที" ไปยังที่
   *          ที่อยู่คนละฝั่งเมือง โดยไม่มีอะไรฟ้องว่าผิด
   *     ★ RPC ทำสองอย่างใน transaction เดียว จึงไม่มีช่วงที่ข้อมูลขัดกัน
   */
  if (body.key === 'office_latlng') {
    const v = body.value as { lat: number; lng: number } | null
    const { data, error: rpcError } = await admin.rpc('set_office_latlng', {
      p_actor: actor.id,
      p_lat: v?.lat ?? null,
      p_lng: v?.lng ?? null,
    })
    if (rpcError) throw fromPostgresError(rpcError)

    await admin.from('audit_log').insert({
      actor_id: actor.id,
      action: 'settings.update',
      target_type: 'app_setting',
      target_id: body.key,
      detail: { value: body.value },
    })

    /* ★ คืนจำนวนร้านที่ถูกคิดใหม่ เพื่อให้หน้าจอบอกได้ว่าเกิดอะไรขึ้นจริง */
    return ok({ key: body.key, value: body.value, recomputed: data as number })
  }

  const { error } = await admin.from('app_settings').upsert(
    {
      key: body.key,
      value: body.value,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )

  if (error) throw fromPostgresError(error)

  /* ★ ค่าตั้งระบบกระทบทุกคน จึงบันทึก audit ไว้ว่าใครเปลี่ยนอะไรเมื่อไหร่ */
  await admin.from('audit_log').insert({
    actor_id: actor.id,
    action: 'settings.update',
    target_type: 'app_setting',
    target_id: body.key,
    detail: { value: body.value },
  })

  return ok({ key: body.key, value: body.value })
})
