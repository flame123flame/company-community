'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { rememberProfile, signInWithUsername } from '@/lib/auth/session'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { splitList } from '@/lib/i18n/office-format'
import { COMPANY_VALUE } from '@/lib/office/company'
import {
  USERNAME_MAX,
  isValidUsername,
  normalizeUsername,
} from '@/lib/office/username'
import {
  DEPARTMENTS,
  DEPT_OTHER,
  resolveDepartment,
} from '@/lib/office/departments'
import { Untranslated, useOt } from '@/lib/i18n/office'

/**
 * ฟอร์มสมัครใช้งานระบบ
 *
 * ★★★ รวม "สร้างบัญชี" กับ "ผูกรหัสพนักงาน" เป็นฟอร์มเดียว
 *
 *     เดิมเป็นสองขั้น: ตั้งชื่อผู้ใช้ที่หน้าแรก แล้วถูกเด้งไป /office/link
 *     เพื่อกรอกรหัสพนักงานอีกหน้า
 *     ★ คนกรอกไม่รู้ตั้งแต่ต้นว่าต้องมีรหัสพนักงาน จึงไปเจอด่านตอนที่คิดว่า
 *       สมัครเสร็จแล้ว ★★ ซึ่งเป็นจังหวะที่คนเลิกกลางคันมากที่สุด
 *
 * ★★ แบ่งเป็นสามหัวข้อตามที่เจ้าของระบบกำหนด — ข้อมูลบัญชี · ข้อมูลพนักงาน ·
 *    ข้อมูลการสมัคร ★ ฟอร์ม 13 ช่องที่ไหลรวดเดียวอ่านแล้วไม่รู้ว่าเหลืออีกเท่าไหร่
 *
 * ★★★ ตรวจรหัสผ่านตรงกันฝั่ง client ด้วย ไม่ใช่รอ server ตอบ
 *      ★ สองช่องอยู่ติดกันบนจอ คนเห็นผลได้ทันทีที่พิมพ์เสร็จ
 *        ★★ การต้องกดส่งแล้วรอเน็ตเพื่อรู้ว่าพิมพ์ผิด คือการทำให้ความผิดพลาด
 *           ที่เห็นได้ด้วยตาเปล่ากลายเป็นเรื่องที่ต้องรอ
 *      ★ แต่ server ก็ตรวจซ้ำอยู่ดี — ฝั่ง client เป็นความเร็ว ไม่ใช่ด่าน
 */


/*
 * ★★★ ฝ่าย/แผนกเป็นรายการให้เลือก ไม่ใช่ช่องพิมพ์อิสระ
 *
 *     ★ ช่องพิมพ์อิสระทำให้ฝ่ายเดียวกันถูกเขียนหลายแบบ — "IT" · "ไอที" ·
 *       "ฝ่ายไอที" · "it" ★★ แล้วตัวกรองในหน้า Admin กับการสรุปยอดตามฝ่าย
 *       จะนับเป็นคนละฝ่ายกันทั้งหมด โดยไม่มีใครสังเกตจนกว่าจะมีคนทัก
 *
 * ★★ ยังมี "อื่น ๆ" ให้พิมพ์เองได้ ★ รายการที่ปิดตายจะบล็อกคนที่อยู่ฝ่ายใหม่
 *    ซึ่งเกิดขึ้นจริงเสมอในบริษัทที่ยังโต — และคนนั้นจะสมัครไม่ได้เลย
 */
export function RegisterForm() {
  const ot = useOt()
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState<string>('')
  const [customDept, setCustomDept] = useState('')
  const [position, setPosition] = useState('')

  const [purpose, setPurpose] = useState('')
  const [terms, setTerms] = useState(false)
  /** แผงเงื่อนไขเปิดอยู่หรือไม่ */
  const [showTerms, setShowTerms] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const realDept = resolveDepartment(department, customDept)

  /*
   * ── ตรวจทีละช่อง ───────────────────────────────────────────────
   *
   * ★★★ ของเดิมรวมทุกเงื่อนไขเป็น boolean เดียวแล้วปิดปุ่ม
   *
   *     ★ คนที่พิมพ์ชื่อผู้ใช้ผิดกติกาจะเจอ "ปุ่มตาย" โดยไม่มีข้อความสักตัว
   *       ★★ และไม่มีทางรู้ว่าช่องไหนผิด เพราะฟอร์มมีเก้าช่อง
   *          ★ ข้อความ valid.usernameRule มีอยู่ในดิกชันนารี แต่ถูกสร้าง
   *            ฝั่ง server เท่านั้น ซึ่งหน้าเว็บไม่มีวันเรียกถึง
   *            เพราะปุ่มถูกปิดไปก่อนแล้ว
   *
   * ★★ ขึ้นเฉพาะช่องที่ "แตะแล้ว" — ฟอร์มเปล่าที่แดงทั้งหน้าตั้งแต่เปิด
   *    คือฟอร์มที่สอนให้คนเลิกอ่านข้อความเตือน
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))

  /** ★ เบอร์โทรถูกตัดเหลือตัวเลขก่อนตรวจ — ฐานข้อมูลก็ทำแบบเดียวกัน */
  const phoneDigits = phone.replace(/\D/g, '')

  const fieldError: Record<string, string | null> = {
    username: isValidUsername(username) ? null : ot('reg.errUsername'),
    password: password.length >= 8 ? null : ot('reg.errPassword'),
    confirm: confirm === password ? null : ot('reg.passwordMismatch'),
    /*
     * ★★★ 30 ไม่ใช่ 40
     *
     *     ★ ของเดิมหน้าเว็บกับ zod ยอมถึง 40 แต่ CHECK ในฐานข้อมูลคือ 30
     *       ★★ ชื่อเล่น 35 ตัวจึงผ่านสองชั้นแรก แล้วไปตายที่ชั้นสุดท้าย
     *          ★ ผู้ใช้เห็นแค่ "ข้อมูลไม่ถูกต้อง" โดยไม่รู้ว่าช่องไหน
     *            และบัญชีที่เพิ่งถูกสร้างก็ถูกลบย้อนกลับไปแล้ว
     */
    nickname: nickname.trim().length === 0
      ? ot('common.required')
      : nickname.trim().length > 30
        ? ot('reg.errNicknameLong')
        : null,
    /*
     * ★ เบอร์โทรไม่บังคับ แต่ถ้ากรอกต้องเป็น 8–15 หลัก ตามที่ฐานข้อมูลบังคับ
     *   ★★ ของเดิมรับ 0–30 ตัวอักษรอะไรก็ได้ แล้วพิมพ์ "0812" ก็ไปตาย
     *      ที่ CHECK เหมือนกัน — และป้ายเขียนแค่ "ไม่บังคับ" ไม่เคยบอกรูปแบบ
     */
    phone: phone.trim() === '' || (phoneDigits.length >= 8 && phoneDigits.length <= 15)
      ? null
      : ot('reg.errPhone'),
    /* ★ แผนกที่พิมพ์เองยาวได้ 60 ตามฐานข้อมูล ไม่ใช่ 80 */
    department: realDept.length === 0
      ? ot('common.required')
      : realDept.length > 60
        ? ot('reg.errDeptLong')
        : null,
    terms: terms ? null : ot('reg.errTerms'),
  }

  const ready = Object.values(fieldError).every((v) => v === null)

  /*
   * ── ความคืบหน้า ───────────────────────────────────────────────
   *
   * ★★ นับเฉพาะช่องที่ "กรอกแล้วผ่าน" ไม่ใช่ช่องที่ไม่มี error
   *    ★ ฟอร์มเปล่า: ยืนยันรหัส '' === รหัส '' และเบอร์ว่างก็ผ่าน
   *      ถ้านับจาก error ล้วน ๆ จะขึ้น 29% ตั้งแต่ยังไม่ได้พิมพ์สักตัว
   */
  const okUser = fieldError.username === null
  const okPass = fieldError.password === null
  const okConfirm = confirm.length > 0 && fieldError.confirm === null
  const okNick = fieldError.nickname === null
  const okDept = fieldError.department === null
  const okTerms = fieldError.terms === null
  const progress = [okUser, okPass, okConfirm, okNick, okDept, okTerms]
  const pct = Math.round((progress.filter(Boolean).length / progress.length) * 100)
  const secDone: readonly [boolean, boolean, boolean] = [
    okUser && okPass && okConfirm,
    okNick && okDept && fieldError.phone === null,
    okTerms,
  ]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return

    /*
     * ★★ กรอกไม่ครบ → ทำให้ทุกช่องเป็น "แตะแล้ว" เพื่อให้ข้อความแดงขึ้นพร้อมกัน
     *    ★ แล้วเลื่อนไปที่ช่องแรกที่ผิด — ฟอร์มเก้าช่องบนมือถือยาวเกินหนึ่งจอ
     *      ★★ ขึ้นแดงอย่างเดียวโดยไม่เลื่อนไปหา ก็ยังไม่ต่างจากปุ่มที่กดไม่ได้
     *         สำหรับคนที่อยู่ท้ายฟอร์ม
     */
    if (!ready) {
      setTouched(Object.fromEntries(Object.keys(fieldError).map((k) => [k, true])))
      const firstBad = Object.keys(fieldError).find((k) => fieldError[k])
      if (firstBad) {
        document
          .querySelector<HTMLElement>(`[data-field="${firstBad}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    setBusy(true)
    setError(null)

    try {
      const { tokenHash, username: saved } = await apiFetch<{
        tokenHash: string
        username: string
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          username: normalizeUsername(username),
          password,
          confirm,
          nickname: nickname.trim(),
          phone: phone.trim(),
          /* ★ บริษัทเป็นค่าคงที่ ไม่ได้มาจากฟอร์ม — แต่ยังส่งไปเก็บ
             ★★ เพื่อให้หน้า Admin และรายงานยังอ่านฟิลด์เดิมได้เหมือนเดิม
                วันที่มีบริษัทที่สองจะได้ไม่ต้องย้อนไปเติมข้อมูลเก่าทั้งหมด
             ★★★ ส่ง COMPANY_VALUE ไม่ใช่ ot('reg.companyName')
                  ★ เคยส่งคำแปล แล้วบริษัทเดียวถูกเก็บเป็นหลายค่าตามภาษา
                    ที่คนนั้นเปิดหน้าไว้ตอนกดสมัคร — เหตุผลใน company.ts */
          company: COMPANY_VALUE,
          department: realDept,
          position: position.trim(),
          purpose: purpose.trim(),
          /* ★ ส่งค่าจริงจากช่อง ไม่ใช่ true ตายตัว
               ★★ ของเดิมฮาร์ดโค้ด true ทำให้ด่าน z.literal(true) ฝั่ง server
                  ไม่มีทางทำงาน — ด่านที่เป็นจริงเสมอคือด่านที่ไม่มีอยู่ */
          terms,
        },
        /* ★ เพดานเวลาเหมือนทางเข้าเดิม — คำขอนี้คุยกับ Supabase หลายจังหวะ
           ★★ ถ้าไม่มี ปุ่มจะค้างอยู่ "กำลังสมัคร…" ตลอดกาลเมื่อฐานข้อมูลหลับ */
        signal: AbortSignal.timeout(25_000),
      })

      const profile = await signInWithUsername(tokenHash)
      rememberProfile({
        displayName: profile.displayName || saved,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        username: saved,
      })

      router.replace('/')
    } catch (err) {
      const slow = err instanceof DOMException && err.name === 'TimeoutError'
      setError(
        slow
          ? ot('common.error')
          : err instanceof ApiClientError
            ? err.message
            : ot('common.error'),
      )
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      /*
       * ★★★ ปิดการตรวจของเบราว์เซอร์ ให้ตัวตรวจของเราเป็นคนตอบ
       *
       *     ★ ช่องที่มี required ทำให้เบราว์เซอร์บล็อกการส่งฟอร์มก่อน
       *       แล้ว onSubmit ของเราไม่เคยทำงานเลย ★★ ข้อความแดงที่เขียนไว้
       *       จึงไม่มีวันขึ้น — วัดได้จริงในเบราว์เซอร์: alerts = 0
       *       ★ เป็นสาเหตุที่หน้านี้ "เหมือนกดแล้วไม่มีอะไรเกิดขึ้น"
       *     ★★ และฟองของเบราว์เซอร์บอกได้ทีละช่อง เป็นภาษาของเบราว์เซอร์
       *        ซึ่งพูดกฎของเราไม่ได้เลย (เบอร์ 8–15 หลัก · ชื่อเล่น 30 ตัว)
       *     ★ required ยังอยู่บนช่อง เพราะมันคือความหมายสำหรับโปรแกรมอ่านหน้าจอ
       *       ไม่ใช่แค่ตัวบังคับ
       */
      noValidate
      className="mx-auto grid w-full max-w-[1120px] items-start gap-6 px-4 pb-16 pt-6 sm:pt-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10"
    >
      {/*
        * ── แผงข้าง: บอกว่าสมัครแล้วได้อะไร + กรอกไปถึงไหนแล้ว ──────────
        *
        * ★★ ฟอร์มมีเก้าช่องในสามส่วน — คนอยากรู้ว่า "อีกเท่าไหร่จะเสร็จ"
        *    ★ วงแหวนเปอร์เซ็นต์กับรายการสามส่วนตอบได้ในแวบเดียว
        *    ★ จอกว้างติดอยู่กับที่ขณะเลื่อนฟอร์ม · มือถืออยู่บนสุดก่อนฟอร์ม
        */}
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
        <div className="reg-hero relative overflow-hidden rounded-[28px] p-6">
          <span aria-hidden="true" className="pop-blob pop-blob-a" />
          <span aria-hidden="true" className="pop-blob pop-blob-b" />
          <span className="pop-pill relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            ✨ <Untranslated>{ot('reg.heroBadge')}</Untranslated>
          </span>
          <h1 className="relative mt-3 text-[clamp(28px,6vw,36px)] font-black leading-[1.1] tracking-tight text-[var(--ck-shine)]">
            {ot('reg.title')}
          </h1>
          <p className="relative mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
            {ot('reg.lead')}
          </p>
          <ul className="relative mt-4 flex flex-wrap gap-1.5">
            {splitList(ot('reg.getList')).map((m) => (
              <li key={m} className="pop-pill rounded-full px-2.5 py-1 text-[11.5px] font-medium">
                <Untranslated>{m}</Untranslated>
              </li>
            ))}
          </ul>
        </div>

        <div className="reg-progress rounded-[24px] p-5">
          <div className="flex items-center gap-4">
            <span
              className="reg-ring grid size-16 shrink-0 place-items-center rounded-full"
              style={{ '--p': `${pct * 3.6}deg` } as CSSProperties}
              role="img"
              aria-label={ot('reg.progress', { n: pct })}
            >
              <span className="grid size-12 place-items-center rounded-full bg-elevated text-sm font-black tabular-nums text-ink">
                {pct}%
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-base font-black text-ink">
                <Untranslated>{ot('reg.progressTitle')}</Untranslated>
              </p>
              <p className="text-xs text-ink-soft">
                <Untranslated>{pct === 100 ? ot('reg.progressDone') : ot('reg.progress', { n: pct })}</Untranslated>
              </p>
            </div>
          </div>
          <ol className="mt-4 flex flex-col gap-1.5">
            {[ot('reg.secAccount'), ot('reg.secEmployee'), ot('reg.secRequest')].map((title, i) => (
              <li key={title}>
                <a
                  href={`#reg-sec-${i + 1}`}
                  className={cn('reg-step flex min-h-11 items-center gap-3 rounded-2xl px-3', secDone[i] && 'reg-step-done')}
                >
                  <span className="reg-step-num grid size-7 shrink-0 place-items-center rounded-full text-xs font-black">
                    {secDone[i] ? (
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</span>
                  <span className="shrink-0 text-[11px] font-medium text-ink-faint">
                    <Untranslated>{secDone[i] ? ot('reg.stepDone') : ot('reg.stepTodo')}</Untranslated>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <div className="min-w-0">

      {/* ═══ 1 · ข้อมูลบัญชี ═══════════════════════════════════════ */}
      <Section n={1} title={ot('reg.secAccount')} tint="255 0 51" done={secDone[0]}>
        <Field
          label={ot('reg.username')}
          required
          hint={ot('reg.usernameHint')}
          error={touched.username ? fieldError.username : null}
          anchor="username"
        >
          <Input
            radius="round"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => touch('username')}
            invalid={Boolean(touched.username && fieldError.username)}
            autoComplete="username"
            maxLength={USERNAME_MAX}
            required
          />
        </Field>

        <Field
          label={ot('reg.password')}
          required
          hint={ot('reg.passwordHint')}
          error={touched.password ? fieldError.password : null}
          anchor="password"
        >
          <Input
            radius="round"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch('password')}
            invalid={Boolean(touched.password && fieldError.password)}
            autoComplete="new-password"
            maxLength={72}
            required
          />
        </Field>

        <Field
          label={ot('reg.confirm')}
          required
          error={touched.confirm ? fieldError.confirm : null}
          anchor="confirm"
        >
          <Input
            radius="round"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            required
          />
          {/* ★ บอกทันทีที่พิมพ์ ไม่รอกดส่ง — สองช่องอยู่ติดกัน เห็นได้ด้วยตา */}
          {confirm.length > 0 && confirm !== password ? (
            <p className="mt-1.5 text-xs text-danger">{ot('reg.passwordMismatch')}</p>
          ) : null}
        </Field>
      </Section>

      {/* ═══ 2 · ข้อมูลพนักงาน ═════════════════════════════════════ */}
      <Section n={2} title={ot('reg.secEmployee')} tint="10 132 255" done={secDone[1]}>
        {/*
          * ★★★ ชื่อเล่นช่องเดียว ไม่มีรหัสพนักงาน ไม่มีชื่อ-นามสกุลจริง
          *
          *     ★ ระบบนี้ใช้กันในออฟฟิศเดียว คนเรียกกันด้วยชื่อเล่นอยู่แล้ว
          *       ★★ ชื่อ-นามสกุลจริงเป็นสองช่องที่ไม่มีหน้าไหนเอาไปแสดงเลย
          *     ★ รหัสพนักงานเคยเป็นด่านของทั้งโมดูล ตอนนี้ถอดออกแล้ว (0043)
          *       ★★ ใครมีรหัสก็ยังไปผูกเองได้ที่ /office/link แต่ไม่บังคับ
          */}
        <Field
          label={ot('reg.nickname')}
          required
          hint={ot('reg.nicknameHint')}
          error={touched.nickname ? fieldError.nickname : null}
          anchor="nickname"
        >
          <Input
            radius="round"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onBlur={() => touch('nickname')}
            invalid={Boolean(touched.nickname && fieldError.nickname)}
            /* ★ 30 ตามที่ฐานข้อมูลบังคับ ไม่ใช่ 40 — ของเดิมปล่อยให้พิมพ์เกิน
                 แล้วไปตายที่ CHECK พร้อมข้อความที่ไม่บอกว่าช่องไหน */
            maxLength={30}
            required
          />
        </Field>

        <Field
          label={ot('reg.phone')}
          hint={ot('reg.phoneHint')}
          error={touched.phone ? fieldError.phone : null}
          anchor="phone"
        >
          <Input
            radius="round"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => touch('phone')}
            invalid={Boolean(touched.phone && fieldError.phone)}
            maxLength={30}
            className="tabular-nums"
          />
        </Field>

        {/*
          * ★★ บริษัทแสดงให้อ่าน ไม่ใช่ช่องกรอก
          *    ★ ระบบนี้ใช้ในบริษัทเดียว ช่องที่ทุกคนต้องพิมพ์คำตอบเดียวกัน
          *      คือช่องที่ไม่ควรมี — มีแต่จะพิมพ์ไม่ตรงกันเฉย ๆ
          *    ★★ แต่ยังต้องเห็นว่าสมัครเข้าบริษัทไหน จึงแสดงเป็นข้อมูลพร้อมที่อยู่
          */}
        <div className="rounded-2xl border border-line bg-surface/50 p-4">
          <p className="text-xs text-ink-faint">
            {ot('reg.company')}
            <span className="ms-1.5">({ot('reg.companyFixed')})</span>
          </p>
          <p className="mt-1 text-sm font-medium leading-snug text-ink">
            {ot('reg.companyName')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {ot('reg.companyAddress')}
          </p>
        </div>

        <Field
          label={ot('reg.department')}
          required
          error={touched.department ? fieldError.department : null}
          anchor="department"
        >
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            required
            className={cn(
              'field-input h-11 w-full rounded-full border border-line bg-input px-4',
              'text-[16px] text-ink sm:text-sm',
              'transition-colors focus:border-accent/70 focus:outline-none',
              /* ★ ยังไม่เลือก = สีจาง เหมือน placeholder ของช่องกรอกอื่น
                 ★★ ไม่งั้นข้อความ "เลือกฝ่าย/แผนก" จะดูเหมือนคำตอบที่เลือกไว้แล้ว */
              department === '' && 'text-ink-faint',
            )}
          >
            <option value="">{ot('reg.deptPick')}</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {ot(d.labelKey)}
              </option>
            ))}
            {/* ★ "อื่น ๆ" ใช้ค่าสัญลักษณ์ ไม่ใช่คำแปล — เหตุผลใน departments.ts */}
            <option value={DEPT_OTHER}>{ot('dept.other')}</option>
          </select>

          {department === DEPT_OTHER ? (
            <Input
              radius="round"
              value={customDept}
              onChange={(e) => setCustomDept(e.target.value)}
              onBlur={() => touch('department')}
              invalid={Boolean(touched.department && fieldError.department)}
              /* ★ 60 ตามที่ฐานข้อมูลบังคับ ไม่ใช่ 80 — เหตุผลเดียวกับชื่อเล่น */
              maxLength={60}
              className="mt-2"
              placeholder={ot('reg.deptOther')}
              required
            />
          ) : null}
        </Field>

        <Field label={ot('reg.position')} hint={ot('reg.optional')}>
          <Input
            radius="round"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            maxLength={80}
          />
        </Field>
      </Section>

      {/* ═══ 3 · ข้อมูลการสมัคร ════════════════════════════════════ */}
      <Section n={3} title={ot('reg.secRequest')} tint="175 82 222" done={secDone[2]}>
        <Field label={ot('reg.purpose')} hint={ot('reg.purposeHint')}>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            maxLength={500}
            rows={3}
            className={cn(
              'field-input w-full rounded-2xl border border-line bg-input px-4 py-3',
              'text-[16px] text-ink placeholder:text-ink-faint sm:text-sm',
              'transition-colors focus:border-accent/70 focus:outline-none',
            )}
          />
        </Field>

        <label
          data-field="terms"
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface/50 p-4 transition-colors',
            /* ★ ช่องนี้ไม่มีกรอบ Field จึงต้องทำขอบแดงเอง
                 ★★ ไม่งั้นมันเป็นช่องเดียวในฟอร์มที่กดส่งแล้วไม่มีอะไรเปลี่ยน */
            touched.terms && fieldError.terms ? 'border-danger' : 'border-line',
          )}
        >
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => {
              setTerms(e.target.checked)
              touch('terms')
            }}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
            required
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">
              {ot('reg.terms')}
              <span className="ms-0.5 text-accent">*</span>
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
              {ot('reg.termsBody')}
            </span>
            {touched.terms && fieldError.terms ? (
              <span role="alert" className="mt-1 block text-xs text-danger">
                {fieldError.terms}
              </span>
            ) : null}

            {/*
              * ★★★ เป็น <span role="button"> ไม่ใช่ <button>
              *
              *     ★ ทั้งก้อนนี้อยู่ใน <label> ที่ผูกกับ checkbox — ปุ่มจริง
              *       ซ้อนใน label จะทำให้คลิกแล้วติ๊กถูกสลับไปด้วย
              *       ★★ คนกดเพื่อ "อ่าน" แต่ได้ "ยอมรับ" ไปโดยไม่ได้อ่าน
              *          ซึ่งเป็นสิ่งที่ข้อความยินยอมไม่ควรทำเด็ดขาด
              *     ★ stopPropagation กันไม่ให้คลิกไหลไปถึง label
              */}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowTerms(true)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.stopPropagation()
                setShowTerms(true)
              }}
              className="mt-1.5 inline-block cursor-pointer text-xs font-medium text-link underline underline-offset-2 hover:opacity-80"
            >
              {ot('reg.termsLink')}
            </span>
          </span>
        </label>
      </Section>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/*
        * ★★★ ปุ่มกดได้เสมอ ไม่ปิดเมื่อกรอกไม่ครบ
        *
        *     ★ ปุ่มที่ปิดอยู่ไม่บอกว่าทำไมถึงกดไม่ได้ ★★ คนจึงไล่แก้ทีละช่อง
        *       แบบเดา หรือคิดว่าเว็บเสีย — ซึ่งเป็นอาการที่เจ้าของระบบเจอเอง
        *     ★ กดแล้วค่อยขึ้นแดงทุกช่องที่ยังไม่ผ่าน คือการตอบว่า
        *       "ยังขาดตรงนี้" ไม่ใช่การเงียบ
        *     ★★ และ onBlur ยังทำให้ช่องที่ผ่านไปแล้วเตือนทันทีโดยไม่ต้องรอกด
        */}
      <Button type="submit" variant="primary" size="lg" block loading={busy} className="join-cta mt-6 h-14 sm:h-14 rounded-2xl text-base font-bold">
        {busy ? ot('reg.working') : ot('reg.submit')}
      </Button>

      {showTerms ? (
        <TermsDialog
          onClose={() => setShowTerms(false)}
          onAgree={() => {
            setTerms(true)
            setShowTerms(false)
          }}
        />
      ) : null}

      <p className="mt-4 text-center text-sm text-ink-soft">
        {ot('reg.haveAccount')}{' '}
        <Link href="/" className="font-medium text-link hover:underline">
          {ot('reg.signIn')}
        </Link>
      </p>
      </div>
    </form>
  )
}

/**
 * แผงเงื่อนไขการใช้งาน
 *
 * ★★★ เปิดทับฟอร์ม ไม่ใช่ลิงก์ไปหน้าอื่น
 *
 *     ★ ตอนกดอ่าน คนกรอกฟอร์มมาแล้ว 13 ช่อง ★★ การพาออกไปหน้าอื่น
 *       แล้วกดกลับ = ฟอร์มถูกสร้างใหม่ ข้อมูลที่กรอกหายทั้งหมด
 *       ★ คนจะไม่กดอ่านเลย ซึ่งทำให้ลิงก์นั้นมีไว้เพื่อให้ดูเหมือนมี
 *
 * ★★ มีปุ่ม "ยอมรับและปิด" ให้ติ๊กจากในนี้ได้เลย
 *    ★ คนที่อ่านจบแล้วตั้งใจจะยอมรับอยู่แล้ว ไม่ควรต้องปิดหน้าต่างแล้วไปหา
 *      ช่องติ๊กเองอีกรอบ ★★ แต่ปุ่ม "เข้าใจแล้ว" ที่ปิดเฉย ๆ ก็ยังมี —
 *      การอ่านจบไม่ได้แปลว่ายอมรับ
 */
function TermsDialog({ onClose, onAgree }: { onClose: () => void; onAgree: () => void }) {
  const ot = useOt()
  /* ★ แถบความคืบหน้าการอ่าน — เลื่อนถึงไหนแถบยาวถึงนั่น (คำนวณใน onScroll ไม่ใช่ effect) */
  const [read, setRead] = useState(0)
  const items: { t: string; b: string; e: string }[] = [
    { t: ot('reg.t1'), b: ot('reg.t1b'), e: '👥' },
    { t: ot('reg.t2'), b: ot('reg.t2b'), e: '🔎' },
    { t: ot('reg.t3'), b: ot('reg.t3b'), e: '🔐' },
    { t: ot('reg.t4'), b: ot('reg.t4b'), e: '🚫' },
    { t: ot('reg.t5'), b: ot('reg.t5b'), e: '💸' },
    { t: ot('reg.t6'), b: ot('reg.t6b'), e: '✏️' },
  ]

  return (
    <div
      className="cfm-root fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ot('reg.termsTitle')}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      /* ★ กดพื้นหลังเพื่อปิด — แต่เฉพาะพื้นหลังจริง ไม่ใช่ตัวแผง */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="terms-card cfm-card flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-[32px] sm:rounded-[32px]"
        style={{ '--pc': '255 0 51', '--pc2': '175 82 222' } as CSSProperties}
      >
        {/* ── หัวไล่สี + ไอคอนใหญ่ ── */}
        <div className="pop-hero relative shrink-0 overflow-hidden px-6 pb-6 pt-6">
          <span aria-hidden="true" className="pop-blob pop-blob-a" />
          <span aria-hidden="true" className="pop-blob pop-blob-b" />
          <button
            type="button"
            onClick={onClose}
            aria-label={ot('common.close')}
            className="pop-action absolute end-4 top-4 z-10 grid size-11 place-items-center rounded-full"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="m12 10.6 5-5 1.4 1.4-5 5 5 5-1.4 1.4-5-5-5 5L5.6 17l5-5-5-5L12 5.6z" />
            </svg>
          </button>
          <div className="relative flex items-center gap-4 pe-12">
            <span aria-hidden="true" className="terms-icon grid size-16 shrink-0 place-items-center rounded-[22px] text-3xl">📜</span>
            <div className="min-w-0">
              <h2 className="text-[22px] font-black leading-tight text-[var(--ck-shine)]">{ot('reg.termsTitle')}</h2>
              <p className="mt-1 text-[13px] text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
                <Untranslated>{ot('reg.termsLead', { n: items.length })}</Untranslated>
              </p>
            </div>
          </div>
        </div>
        {/* แถบอ่านถึงไหนแล้ว */}
        <div aria-hidden="true" className="h-1 shrink-0 bg-surface">
          <div className="terms-progress h-full" style={{ width: `${Math.max(4, read)}%` }} />
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
          onScroll={(e) => {
            const el = e.currentTarget
            const max = el.scrollHeight - el.clientHeight
            setRead(max <= 0 ? 100 : Math.round((el.scrollTop / max) * 100))
          }}
        >
          <ol className="flex flex-col gap-3">
            {items.map((it, i) => (
              <li
                key={it.t}
                className="terms-item flex gap-3.5 rounded-[20px] p-4"
                style={{ '--i': i } as CSSProperties}
              >
                <span className="relative shrink-0">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-surface text-2xl">{it.e}</span>
                  <span className="terms-num absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full text-[11px] font-black">
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-black text-ink">{it.t}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">{it.b}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-2xl px-5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink sm:me-auto"
          >
            {ot('reg.termsClose')}
          </button>
          <button type="button" onClick={onAgree} className="cfm-ok inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl px-6 text-base font-bold">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
            {ot('reg.termsAgreeHere')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({
  n,
  title,
  tint,
  done,
  children,
}: {
  n: number
  title: string
  /** rgb สามตัวเลข — สีประจำส่วน ให้ตาแยกสามส่วนออกจากกันได้ก่อนอ่าน */
  tint: string
  /** ส่วนนี้กรอกครบแล้ว — หัวส่วนขึ้นเครื่องหมายถูก */
  done: boolean
  children: ReactNode
}) {
  return (
    <section
      id={`reg-sec-${n}`}
      className={cn('reg-sec relative mt-5 scroll-mt-24 overflow-hidden rounded-[28px] p-5 first:mt-0 sm:p-7', done && 'reg-sec-done')}
      style={{ '--tint': tint, '--i': n } as CSSProperties}
    >
      <span aria-hidden="true" className="mus-act-glow" />
      <div className="relative flex items-center gap-3">
        <span className="mus-act-icon grid size-10 shrink-0 place-items-center rounded-2xl text-base font-black">
          {done ? (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
          ) : (
            n
          )}
        </span>
        <h2 className="text-lg font-black text-ink">{title}</h2>
      </div>

      <div className="relative mt-5 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  required,
  error,
  anchor,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  /** ข้อความผิด — ขึ้นแทนคำใบ้เมื่อมี */
  error?: string | null
  /** ชื่อช่อง — ใช้เลื่อนมาหาเมื่อกดส่งแล้วยังไม่ผ่าน */
  anchor?: string
  children: ReactNode
}) {
  return (
    <label data-field={anchor} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ms-0.5 text-accent">*</span> : null}
        {hint ? <span className="ms-1.5 text-xs font-normal text-ink-faint">({hint})</span> : null}
      </span>
      {children}
      {/*
        * ★★ ข้อความผิดอยู่ใต้ช่องของตัวเอง ไม่ใช่รวมกันบนสุดของฟอร์ม
        *    ★ ฟอร์มนี้มีเก้าช่อง — รายการข้อผิดพลาดรวมบนสุดแปลว่าคนต้อง
        *      เลื่อนหาเองว่าช่องไหน
        *    ★★ role="alert" ให้โปรแกรมอ่านหน้าจอประกาศทันทีที่โผล่
        */}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  )
}
