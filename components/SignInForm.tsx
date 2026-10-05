'use client'

import type { CSSProperties } from 'react'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiClientError, apiFetch } from '@/lib/api/client'
import { rememberProfile, signInWithUsername } from '@/lib/auth/session'
import { useT } from '@/lib/i18n/client'
import { Untranslated } from '@/lib/i18n/office'

/**
 * ฟอร์มเข้าใช้งานด้วยชื่อผู้ใช้ช่องเดียว
 *
 * ★ แยกออกจากกล่องลอย เพราะถูกใช้สองที่ที่ต่างกันจริง ๆ:
 *   หน้าเต็มจอที่ server เป็นคนตัดสินใจแสดง (ด่านจริง) และกล่องลอยฝั่ง client
 *   (ตาข่ายกันพลาดตอน session หลุดกลางทาง) — ตัวฟอร์มเหมือนกันทุกบรรทัด
 *
 * ★★ ทำไมช่องเดียว และทำไมไม่มีปุ่ม "สมัคร" แยกจาก "เข้าสู่ระบบ"
 *
 *    สองปุ่มนั้นบังคับให้ผู้ใช้ตอบคำถามที่เขาไม่ควรต้องตอบ:
 *    "ฉันเคยสมัครไว้หรือยัง" — ซึ่งคนจำไม่ได้จริง ๆ โดยเฉพาะกับเว็บที่
 *    เข้าเดือนละครั้งเพื่อฟังเพลงกับเพื่อน
 *
 *    ★ ชื่อว่าง = สมัครให้ · ชื่อมีอยู่แล้ว = เข้าเป็นคนนั้น
 *      ผู้ใช้ไม่ต้องรู้ว่าระบบทำอะไร แค่พิมพ์ชื่อตัวเองแล้วเข้าได้เสมอ
 *
 * ★★★ ไม่มีรหัสผ่าน = ใครพิมพ์ชื่อคุณก็เข้าเป็นคุณได้
 *
 *      บอกผู้ใช้ตรง ๆ ในหน้านี้เลย ไม่ซ่อน — คนที่จะเลือกชื่อซ้ำกับคนอื่น
 *      ควรรู้ว่ากำลังทำอะไรอยู่ และคนที่กังวลควรตั้งชื่อที่เดายาก
 */
export function SignInForm({
  onDone,
  /**
   * ★★ หน้าเต็มกับกล่องลอยต้องการของไม่เหมือนกัน
   *
   *    page   — หน้าเข้าใช้งานเต็มจอ ★ โลโก้กับคำอธิบายว่าเว็บนี้คืออะไร
   *             ถูกย้ายไปอยู่ที่ SignInScreen แล้ว ที่นี่จึงเหลือแค่การ์ดฟอร์ม
   *    dialog — กล่องที่เด้งขึ้นมาตอน session ตายกลางทาง ★ คนใช้อยู่แล้ว
   *             รู้จักเว็บอยู่แล้ว การโฆษณาซ้ำตรงนั้นคือการขวางทางเขากลับเข้าห้อง
   *             แต่ยังต้องมีโลโก้ ไม่งั้นกล่องลอยมาเฉย ๆ ดูเหมือนของปลอม
   */
  variant = 'dialog',
}: {
  onDone: () => void
  variant?: 'page' | 'dialog'
}) {
  const t = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  /* ★ เริ่มที่ซ่อนเสมอ — คนกรอกต่อหน้าคนอื่นได้โดยไม่ต้องระวัง */
  const [reveal, setReveal] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* ★ ช่องที่ยังว่างตอนกดเข้าใช้งาน — ขึ้นแดงใต้ช่องนั้น (เจ้าของสั่ง 5 ต.ค. 2026) */
  const [missing, setMissing] = useState<{ username: boolean; password: boolean }>({ username: false, password: false })

  async function submit(event: FormEvent) {
    event.preventDefault()

    /* ★ ว่างทั้งช่อง = บอกตรง ๆ ว่ายังไม่ได้กรอก ไม่ใช่ "ชื่อผู้ใช้ไม่ถูกต้อง" */
    const lack = { username: username.trim() === '', password: password === '' }
    if (lack.username || lack.password) {
      setMissing(lack)
      setError(null)
      return
    }

    /**
     * ★ ทำความสะอาดให้เงียบ ๆ แทนการด่าผู้ใช้
     *   คนพิมพ์ "Frame Room" มาแล้วเจอ error ว่า "ห้ามมีช่องว่าง" จะรำคาญ
     *   กว่าการที่ระบบเปลี่ยนให้เป็น frame_room แล้วโชว์ให้เห็นว่าได้อะไร
     */
    const clean = username.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._]/g, '')

    if (clean.length < 3) {
      setError(t('auth.errInvalid'))
      setUsername(clean)
      return
    }

    setPending(true)
    setError(null)
    try {
      /**
       * ★★ ต้องมีเพดานเวลา ไม่งั้นปุ่มค้างตลอดกาล
       *
       *    บั๊กที่เจอจริงบน production: ฐานข้อมูลตอบช้าเป็นช่วง ๆ (instance
       *    ที่หลับอยู่ตื่นช้า) คำขอนี้เรียก Supabase ต่อกันสี่จังหวะ
       *    ความช้าจึงถูกคูณสี่ — วัดได้ 21 วินาทีสำหรับ query เดียว
       *
       *    ★ ตอนนั้นปุ่มขึ้น "กำลังโหลด" แล้วค้างอยู่อย่างนั้นไม่มีที่สิ้นสุด
       *      ผู้ใช้ไม่มีทางรู้ว่าเกิดอะไรและไม่มีปุ่มให้กดอะไรได้เลย
       *      ซึ่งแย่กว่าการขึ้น error มาก เพราะ error อย่างน้อยยังลองใหม่ได้
       *
       *    25 วินาทีเผื่อให้เครื่องที่หลับตื่นทัน แต่ไม่ปล่อยให้รอจนเลิกสนใจ
       */
      const { tokenHash, username: saved } = await apiFetch<{
        tokenHash: string
        username: string
        /*
         * ★★★ ต้องเป็น /api/auth/login ไม่ใช่ /api/auth/username
         *
         *     ★ ทางเดิมออก session ให้ทุกคนที่พิมพ์ชื่อถูก โดยไม่ดูรหัสผ่านเลย
         *       ★★ ถ้ายังเรียกทางนั้น คนที่ตั้งรหัสผ่านไว้จะถูกข้ามรหัสผ่าน
         *          ได้ด้วยการเข้าจากฟอร์มนี้ — รหัสผ่านกลายเป็นของประดับ
         *     ★ ทางใหม่ตรวจว่าบัญชีนั้น "เคยตั้งรหัสผ่านหรือยัง" แล้วบังคับ
         *       เฉพาะคนที่ตั้งไว้ ★★ บัญชีรุ่นเก่าจึงยังเข้าได้เหมือนเดิม
         */
      }>('/api/auth/login', {
        method: 'POST',
        body: { username: clean, password },
        signal: AbortSignal.timeout(25_000),
      })

      const profile = await signInWithUsername(tokenHash)
      rememberProfile({
        displayName: profile.displayName || saved,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        username: saved,
      })
      onDone()
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
      setError(
        timedOut
          ? t('auth.errSlow')
          : err instanceof ApiClientError
            ? err.message
            : t('auth.errFailed'),
      )
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[400px]">
      {/**
        * ★★ โลโก้ใหญ่และอยู่นอกการ์ด ไม่ใช่ยัดเข้าไปข้างใน
        *
        *    หน้านี้คือหน้าเดียวที่คนยังไม่รู้จักเว็บนี้จะได้เห็น ★ แบรนด์จึง
        *      ต้องมาก่อนฟอร์ม ไม่ใช่เป็นของประดับมุมบนของกล่องกรอกข้อมูล
        */}
      {variant === 'dialog' ? (
        <div className="hero-in mb-6 flex justify-center">
          <Logo />
        </div>
      ) : null}

      {/* ── การ์ดฟอร์ม ──────────────────────────────────────────── */}
      {/**
        * ★ ยกฟอร์มขึ้นเป็นการ์ดที่มีขอบและพื้นโปร่ง
        *   ของเดิมเป็นตัวหนังสือลอยบนพื้นดำล้วน ซึ่งอ่านออกแต่ไม่ได้บอกว่า
        *   "ตรงนี้คือที่ที่ต้องกรอก" — การ์ดทำหน้าที่นั้นโดยไม่ต้องมีคำอธิบาย
        */}
      <div
        className="auth-card hero-in p-6 sm:p-7"
        style={{ '--d': '90ms' } as CSSProperties}
      >
        {/* ★ ตราเล็ก ๆ เหนือหัวเรื่อง — บอกว่ากล่องนี้คือ "ประตู" ไม่ใช่แบบฟอร์ม
            ★★ รูปกุญแจอ่านได้ทุกภาษาโดยไม่ต้องแปล และตอบคำถามแรกสุด
               ("นี่ต้องกรอกเพื่ออะไร") เร็วกว่าหัวเรื่องหนึ่งจังหวะ */}
        <div className="flex justify-center">
          <span className="auth-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.2" cy="12" r="3.3" />
              <path d="M11.5 12H21M18.4 12v3M15.4 12v2.2" />
            </svg>
          </span>
        </div>

        <h1 className="mt-3.5 text-center text-[23px] font-semibold leading-snug tracking-tight">
          {t('auth.title')}
        </h1>
        <p className="mx-auto mt-2 max-w-[300px] text-center text-[11.5px] leading-relaxed text-ink-soft">
          {t('auth.hint1')}
          <br />
          {t('auth.hint2')}
        </p>

        <div className="mt-6">
          <label className="mb-1.5 block text-xs text-ink-soft" htmlFor="username">
            {t('auth.username')}
          </label>
          <div className="relative">
            {/* ★ @ นำหน้าช่อง — บอกว่านี่คือ "ชื่อผู้ใช้" ไม่ใช่ชื่อจริง โดยไม่ต้องเขียน
                 ★★ ระยะใช้ start-* ไม่ใช่ left-* — "ต้นบรรทัด" ต้องอยู่หน้าตัวหนังสือ
                    เสมอ ทั้งภาษาที่อ่านซ้ายไปขวาและขวาไปซ้าย (ดู .auth-lead) */}
            <span aria-hidden="true" className="auth-lead font-mono text-[15px]">
              @
            </span>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError(null)
                setMissing((m) => ({ ...m, username: false }))
              }}
              placeholder={t('auth.usernamePlaceholder')}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={t('auth.username')}
              disabled={pending}
              invalid={Boolean(error) || missing.username}
              aria-describedby={missing.username ? 'username-missing' : undefined}
              focusTone="accent"
              className="h-12 rounded-xl ps-11 text-[15px] sm:text-[15px]"
            />
          </div>
          {missing.username ? (
            <p id="username-missing" role="alert" className="mt-1.5 text-xs font-medium text-danger">
              <Untranslated>{t('auth.needUsername')}</Untranslated>
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-ink-faint">{t('auth.rule')}</p>
          )}
        </div>

        {/* ★ บังคับทั้งที่ฟอร์มและที่เซิร์ฟเวอร์ — ทุกบัญชีมีรหัสผ่านแล้ว
            ★★ required ที่ฟอร์มช่วยให้รู้ตั้งแต่ก่อนกดส่ง ไม่ต้องรอเน็ต */}
        <div className="mt-3">
          <label className="mb-1.5 block text-xs text-ink-soft" htmlFor="password">
            {t('auth.password')}
          </label>
          <div className="relative">
            <span aria-hidden="true" className="auth-lead">
              <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 10V7a5 5 0 0 0-10 0v3M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
              </svg>
            </span>
            <Input
              id="password"
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
                setMissing((m) => ({ ...m, password: false }))
              }}
              placeholder={t('auth.passwordPlaceholder')}
              maxLength={72}
              autoComplete="current-password"
              aria-label={t('auth.password')}
              required
              disabled={pending}
              invalid={Boolean(error) || missing.password}
              aria-describedby={missing.password ? 'password-missing' : undefined}
              focusTone="accent"
              className="h-12 rounded-xl ps-11 pe-11 text-[15px] sm:text-[15px]"
            />
            {/* ★★ type="button" บังคับ — ไม่งั้นมันกลายเป็นปุ่มส่งฟอร์มตัวที่สอง
                   แล้วการกดดูรหัสผ่านจะส่งฟอร์มทิ้งไปเลย */}
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="auth-eye"
              aria-label={t(reveal ? 'auth.hidePassword' : 'auth.showPassword')}
              aria-pressed={reveal}
              tabIndex={-1}
            >
              {reveal ? (
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.4 3.4M6.3 6.8C3.9 8.3 3 10.6 3 12c0 2.5 4 7 9 7a9.6 9.6 0 0 0 3.6-.7" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              )}
            </button>
          </div>
          {missing.password ? (
            <p id="password-missing" role="alert" className="mt-1.5 text-xs font-medium text-danger">
              <Untranslated>{t('auth.needPassword')}</Untranslated>
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={pending}
          className="join-cta mt-5 h-13 sm:h-13 rounded-2xl text-base font-bold"
        >
          {t('auth.submit')}
          {/* ★ rtl:-scale-x-100 — ลูกศร "ไปข้างหน้า" ต้องชี้ไปทางที่ภาษานั้นเดิน
               ในอาหรับข้างหน้าคือทางซ้าย ลูกศรชี้ขวาจึงกลายเป็น "ย้อนกลับ" */}
          <svg
            viewBox="0 0 24 24"
            className="size-4 rtl:-scale-x-100"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
          </svg>
        </Button>

        {/**
          * ★★ กล่องนี้เคยเป็น "คำเตือน" ว่าระบบไม่มีรหัสผ่าน
          *
          *    ★ พอมีรหัสผ่านจริงแล้ว ข้อความเดิมกลายเป็นคำโกหกที่น่าตกใจ —
          *      บอกว่า "ใครรู้ชื่อคุณก็เข้าเป็นคุณได้" ทั้งที่มีช่องรหัสผ่าน
          *      อยู่เหนือมันสองนิ้ว
          *    ★★ เปลี่ยนหน้าที่เป็น "บอกว่ารหัสผ่านปลอดภัยแค่ไหน และลืมแล้วทำยังไง"
          *       ★ ซึ่งเป็นคำถามที่คนยืนอยู่หน้านี้ถามจริง
          */}
        <div className="mt-5 flex gap-2.5 rounded-2xl bg-surface px-3.5 py-3">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 size-4 shrink-0 text-ink-faint"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm3 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
          </svg>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            {t('auth.warn1')}
            <br />
            <span className="text-ink-faint">{t('auth.warn2')}</span>
          </p>
        </div>
      </div>

      {variant === 'dialog' ? (
        <ul
          className="hero-in mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[11px] text-ink-faint"
          style={{ '--d': '220ms' } as CSSProperties}
        >
          {(['home.feature.sync', 'home.feature.chat', 'home.feature.queue'] as const).map(
            (k, idx) => (
              <li key={k} className="flex items-center gap-2">
                {idx > 0 ? <span aria-hidden="true">·</span> : null}
                <span>{t(k)}</span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {/* ★ เส้นคั่นบาง ๆ แยก "ของที่ต้องกรอก" ออกจาก "ทางอื่นที่ไปได้"
          ★★ ไม่มีเส้น ลิงก์สมัครจะอ่านเหมือนเป็นส่วนหนึ่งของฟอร์ม */}
      <div className="auth-rule mx-auto mt-5 w-32" aria-hidden="true" />
      {/*
        * ★★ ทางไปสมัครเป็นการ์ดปุ่มเต็มความกว้าง ไม่ใช่ลิงก์ตัวเล็กบรรทัดเดียว
        *    ★ เจ้าของสั่งให้เด่น (5 ต.ค. 2026) — คนใหม่ส่วนใหญ่ยังไม่มีบัญชี
        *      ลิงก์ 14px ใต้การ์ดคือสิ่งที่เขาหาไม่เจอ
        */}
      <Link href="/register" className="auth-signup group relative mt-4 flex min-h-[88px] items-center gap-4 overflow-hidden rounded-[22px] px-4 py-3.5">
        {/* แสงวาบกวาดผ่านทั้งปุ่มเป็นระยะ */}
        <span aria-hidden="true" className="auth-signup-sheen" />
        {/* ไอคอนใหญ่ + ประกายเล็กลอยวนรอบ */}
        <span aria-hidden="true" className="relative grid size-14 shrink-0 place-items-center">
          <span className="auth-signup-icon grid size-14 place-items-center rounded-2xl text-2xl">🚀</span>
          {(['✦', '✧', '✦'] as const).map((g, i) => (
            <span key={i} className="auth-signup-spark absolute text-[11px]" style={{ '--a': `${i * 120}deg`, '--dl': `${i * 0.4}s` } as React.CSSProperties}>
              {g}
            </span>
          ))}
        </span>
        <span className="relative min-w-0 flex-1 text-start">
          <span className="block text-xs font-medium text-ink-soft">{t('auth.noAccount')}</span>
          <span className="auth-signup-title block text-xl font-black leading-tight">{t('auth.register')}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">
            <Untranslated>{t('auth.registerHint')}</Untranslated>
          </span>
        </span>
        <span aria-hidden="true" className="auth-signup-go relative grid size-11 shrink-0 place-items-center rounded-full">
          <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor">
            <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
          </svg>
        </span>
      </Link>

    </form>
  )
}
