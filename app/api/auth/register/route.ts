import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/** ★ โดเมนปลอมตัวเดียวกับทางเข้าเดิม — ไม่เคยถูกส่งอีเมลไปหา (RFC 2606) */
/*
 * ★★★ ห้ามเปลี่ยนตามชื่อแบรนด์ แม้เว็บจะเปลี่ยนชื่อเป็น AWA ROOM แล้ว
 *
 *     ★ อีเมลของทุกบัญชีที่มีอยู่คือ "<username>@frameroom.invalid"
 *       ★★ เปลี่ยนค่านี้ = GoTrue หาบัญชีเดิมไม่เจอทุกบัญชี แล้วทุกคน
 *          เข้าระบบไม่ได้พร้อมกัน รวมถึง Admin
 *     ★ มันเป็นกุญแจในฐานข้อมูล ไม่ใช่ข้อความที่ผู้ใช้เห็น —
 *       ★★ และไม่มีใครเคยเห็นมันเลยเพราะโดเมนนี้ไม่มีอยู่จริง (RFC 2606)
 */
const FAKE_DOMAIN = 'frameroom.invalid'

const bodySchema = z
  .object({
    /* ── ข้อมูลบัญชี ── */
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._]{3,20}$/, 'valid.usernameRule'),
    password: z.string().min(8, 'valid.passwordShort').max(72),
    confirm: z.string(),

    /* ── ข้อมูลพนักงาน ── */
    /* ★ ชื่อเล่นอย่างเดียว ★★ ไม่มีรหัสพนักงาน ไม่มีชื่อ-นามสกุลจริง
       — ใครก็สมัครได้ ดูเหตุผลเต็มใน 0043 */
    nickname: z.string().trim().min(1, 'common.required').max(40),
    phone: z.string().trim().max(30).optional().default(''),
    company: z.string().trim().max(80).optional().default(''),
    department: z.string().trim().min(1, 'common.required').max(80),
    position: z.string().trim().max(80).optional().default(''),

    /* ── ข้อมูลการสมัคร ── */
    purpose: z.string().trim().max(500).optional().default(''),
    terms: z.literal(true, { message: 'valid.termsRequired' }),
  })
  /*
   * ★ ตรวจรหัสผ่านตรงกันที่ schema ไม่ใช่ใน handler
   *   ★★ ข้อผิดพลาดจะได้ชี้ไปที่ช่อง "ยืนยัน Password" เหมือน error ตัวอื่น
   *      แทนที่จะเป็นข้อความลอยอยู่บนฟอร์ม
   */
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'valid.passwordMismatch',
  })

/**
 * POST /api/auth/register — สมัครสมาชิกพร้อมผูกรหัสพนักงานในขั้นเดียว
 *
 * ★★★ ใครก็สมัครได้ ไม่ต้องมีรหัสพนักงาน (0043)
 *
 *     ★ ด่านรหัสพนักงานถูกถอดออกทั้งระบบ — เหตุผลและผลกระทบอยู่ใน 0043
 *       ★★ ที่นี่จึงเหลือแค่ สร้างบัญชี → เขียนโปรไฟล์
 *
 * ★★★ ถ้าขั้นเขียนโปรไฟล์ล้ม ต้องลบบัญชีที่เพิ่งสร้างทิ้ง
 *      ★ ไม่งั้นชื่อผู้ใช้นั้นถูกจองโดยบัญชีที่ใช้งานไม่ได้
 *        ★★ แล้วคนสมัครจะเจอ "ชื่อนี้ถูกใช้แล้ว" ตอนลองใหม่
 *           ทั้งที่คนที่ใช้ชื่อนั้นคือตัวเขาเองเมื่อสิบวินาทีก่อน
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  await enforceRateLimit('signIn', `register:${body.username}`)

  const admin = getSupabaseAdminClient()
  const email = `${body.username}@${FAKE_DOMAIN}`

  /* ── 1. สร้างบัญชีพร้อมรหัสผ่าน ──────────────────────────────── */
  /*
   * ★ email_confirm: true เพราะไม่มีอีเมลจริงให้ยืนยัน
   *   ★★ ถ้าไม่ตั้ง บัญชีจะค้างอยู่สถานะ "รอยืนยันอีเมล" แล้วเข้าไม่ได้เลย
   *      โดยไม่มีทางยืนยันได้ด้วย เพราะโดเมนนั้นไม่มีอยู่จริง
   */
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  })

  const userId = created?.user?.id

  if (createError || !userId) {
    /* ★ ชื่อซ้ำเป็นเรื่องที่ผู้ใช้แก้ได้เอง ต้องแยกจากระบบพัง */
    const dup = /already|exists|registered/i.test(createError?.message ?? '')
    throw new AppError(dup ? 'VALIDATION_FAILED' : 'DATABASE_ERROR', {
      messageKey: dup ? 'valid.usernameTaken' : 'srvErr.signInFailed',
    })
  }

  try {
    /* ── 2. ชื่อผู้ใช้ลงโปรไฟล์ (trigger สร้างแถวไว้ให้แล้ว) ──────── */
    const { error: nameError } = await admin
      .from('profiles')
      .update({ username: body.username })
      .eq('id', userId)

    if (nameError) throw fromPostgresError(nameError)

    /* ── 3. ข้อมูลโปรไฟล์ ──────────────────────────────────────── */
    const { error: rpcError } = await admin.rpc('register_open', {
      p_actor: userId,
      p_nickname: body.nickname,
      p_phone: body.phone || null,
      p_company: body.company || null,
      p_dept: body.department,
      p_position: body.position || null,
      p_purpose: body.purpose || null,
    })

    if (rpcError) throw fromPostgresError(rpcError)
  } catch (e) {
    /*
     * ★★★ ล้างบัญชีที่เพิ่งสร้างทิ้งก่อนโยน error ออกไป
     *     ★ ไม่งั้นชื่อผู้ใช้นั้นถูกจองโดยบัญชีที่ใช้งานไม่ได้
     *       ★★ และคนสมัครจะเจอ "ชื่อนี้ถูกใช้แล้ว" ตอนลองใหม่
     *          ทั้งที่คนที่ใช้ชื่อนั้นคือตัวเขาเองเมื่อสิบวินาทีก่อน
     */
    await admin.auth.admin.deleteUser(userId).catch(() => undefined)
    throw e
  }

  /* ── 4. ออก token ให้เข้าใช้งานต่อได้ทันที ───────────────────── */
  /*
   * ★ ใช้ทางเดียวกับการเข้าสู่ระบบเดิม — client แลก tokenHash เป็น session
   *   ด้วย verifyOtp อยู่แล้ว ★★ จึงไม่ต้องแก้โค้ดฝั่ง client เลยสักบรรทัด
   */
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token

  if (!tokenHash) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.signInFailed' })

  return ok({ username: body.username, tokenHash })
})
