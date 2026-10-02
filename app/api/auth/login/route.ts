import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

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

const bodySchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,20}$/, 'valid.usernameRule'),
  /* ★ บังคับทุกคน ★★ ไม่มี optional อีกแล้ว — เหตุผลเต็มอยู่ใต้ POST */
  password: z.string().min(1, 'valid.passwordRequired').max(72),
})

/**
 * POST /api/auth/login — เข้าสู่ระบบด้วยชื่อผู้ใช้ + รหัสผ่าน
 *
 * ★★★ ทุกบัญชีต้องมีรหัสผ่าน ไม่มีข้อยกเว้นอีกแล้ว
 *
 *     ★ เดิมยอมให้บัญชีรุ่นเก่าเข้าได้โดยเว้นช่องว่าง เพราะตอนนั้น
 *       บัญชีที่ใช้งานอยู่ทั้งหมดยังไม่มีรหัสผ่าน รวมถึง Admin ทุกคน
 *       ★★ บังคับตอนนั้น = ทุกคนเข้าไม่ได้พร้อมกันและไม่เหลือใครแก้ได้
 *
 *     ★★ ตอนนี้เงื่อนไขนั้นหมดไปแล้ว — บัญชีที่เหลือทุกตัวตั้งรหัสผ่านแล้ว
 *        ★ ทางผ่อนผันจึงกลายเป็นช่องโหว่ล้วน ๆ ที่ไม่มีใครได้ประโยชน์
 *
 * ★★ ถ้ามีบัญชีที่ไม่มีรหัสผ่านหลุดมาได้อีก (เช่นสร้างจากสคริปต์)
 *    มันจะเข้าไม่ได้เลยแทนที่จะเข้าได้ฟรี ★ ซึ่งเป็นฝั่งที่ถูกของความผิดพลาด
 *    — Admin รีเซ็ตรหัสให้ได้ แต่ถ้าปล่อยผ่านจะไม่มีใครรู้ว่าเกิดขึ้น
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  await enforceRateLimit('signIn', `login:${body.username}`)

  const admin = getSupabaseAdminClient()
  const email = `${body.username}@${FAKE_DOMAIN}`

  /* ── บัญชีนี้มีอยู่ไหม และตั้งรหัสผ่านไว้หรือยัง ──────────────── */
  const { data: profile } = await admin
    .from('profiles')
    .select('id, account_status')
    .eq('username', body.username)
    .maybeSingle()

  if (!profile) throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.loginFailed' })

  if (profile.account_status === 'SUSPENDED') {
    throw new AppError('FORBIDDEN', { messageKey: 'account.suspended' })
  }

  /*
   * ★★ ตรวจรหัสผ่านด้วย GoTrue เอง ไม่เทียบ hash เอง
   *    ★ ใช้ client ธรรมดา (publishable key) เพราะ signInWithPassword
   *      ไม่ใช่คำสั่งฝั่ง admin ★★ และ session ที่ได้ทิ้งไปเลย —
   *      เราต้องการแค่คำตอบว่า "รหัสผ่านถูกไหม"
   *
   * ★★★ นี่คือด่านเดียวแล้ว ไม่มีทางอื่นที่ข้ามมันได้
   *     ★ ก่อนหน้านี้มี /api/auth/username ที่ออก session ให้ใครก็ได้
   *       ที่พิมพ์ชื่อมา โดยสร้างบัญชีให้ด้วยถ้ายังไม่มี — ถูกลบทิ้งแล้ว
   */
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { error: pwError } = await anon.auth.signInWithPassword({ email, password: body.password })
  if (pwError) throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.loginFailed' })

  /* ── ออก token ให้ client แลกเป็น session (ทางเดียวกับของเดิม) ── */
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token

  if (!tokenHash) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.signInFailed' })

  return ok({ username: body.username, tokenHash })
})
