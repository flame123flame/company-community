import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/food/similar?q=… — เตือนชื่อร้านใกล้เคียง (FR-A02)
 *
 * ★ เป็น GET เพราะไม่เปลี่ยนอะไรเลย และถูกยิงระหว่างพิมพ์
 *   ★ ไม่ต้อง assertSameOrigin เพราะไม่มีผลข้างเคียงให้ CSRF ใช้ประโยชน์
 *     (ด่านที่เหลือ — ต้องเป็นพนักงาน + rate limit — ยังอยู่ครบ)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''

  /* ★ สั้นกว่า 2 ตัวไม่ต้องถามฐานข้อมูล — trigram กับ 1 ตัวอักษรคืนขยะล้วน */
  if (q.length < 2) return ok({ items: [] })

  await enforceRateLimit('similarCheck', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('similar_restaurants', { p_name: q, p_limit: 5 })

  if (error) throw fromPostgresError(error)

  return ok({
    items: (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      signatureDish: r.signature_dish,
      similarity: r.similarity,
    })),
  })
})
