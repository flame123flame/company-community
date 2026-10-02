'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { rememberProfile, signInWithUsername } from '@/lib/auth/session'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { COMPANY_VALUE } from '@/lib/office/company'
import {
  DEPARTMENTS,
  DEPT_OTHER,
  resolveDepartment,
} from '@/lib/office/departments'
import { useOt } from '@/lib/i18n/office'

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

  /* ★ ตรวจครบทุกช่องที่บังคับ ปุ่มจึงบอกได้ว่า "ยังกรอกไม่ครบ" ก่อนกด */
  const ready =
    /^[a-z0-9._]{3,20}$/.test(username.trim().toLowerCase()) &&
    password.length >= 8 &&
    confirm === password &&
    nickname.trim().length > 0 &&
    realDept.length > 0 &&
    terms

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return

    setBusy(true)
    setError(null)

    try {
      const { tokenHash, username: saved } = await apiFetch<{
        tokenHash: string
        username: string
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          username: username.trim().toLowerCase(),
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
          terms: true,
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
    <form onSubmit={submit} className="mx-auto w-full max-w-[640px] px-4 pb-16 pt-8">
      <h1 className="text-[30px] font-bold tracking-tight text-ink">{ot('reg.title')}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">{ot('reg.lead')}</p>

      {/* ═══ 1 · ข้อมูลบัญชี ═══════════════════════════════════════ */}
      <Section n={1} title={ot('reg.secAccount')}>
        <Field label={ot('reg.username')} required hint={ot('reg.usernameHint')}>
          <Input
            radius="round"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
        </Field>

        <Field label={ot('reg.password')} required hint={ot('reg.passwordHint')}>
          <Input
            radius="round"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            required
          />
        </Field>

        <Field label={ot('reg.confirm')} required>
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
      <Section n={2} title={ot('reg.secEmployee')}>
        {/*
          * ★★★ ชื่อเล่นช่องเดียว ไม่มีรหัสพนักงาน ไม่มีชื่อ-นามสกุลจริง
          *
          *     ★ ระบบนี้ใช้กันในออฟฟิศเดียว คนเรียกกันด้วยชื่อเล่นอยู่แล้ว
          *       ★★ ชื่อ-นามสกุลจริงเป็นสองช่องที่ไม่มีหน้าไหนเอาไปแสดงเลย
          *     ★ รหัสพนักงานเคยเป็นด่านของทั้งโมดูล ตอนนี้ถอดออกแล้ว (0043)
          *       ★★ ใครมีรหัสก็ยังไปผูกเองได้ที่ /office/link แต่ไม่บังคับ
          */}
        <Field label={ot('reg.nickname')} required hint={ot('reg.nicknameHint')}>
          <Input
            radius="round"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={40}
            required
          />
        </Field>

        <Field label={ot('reg.phone')} hint={ot('reg.optional')}>
          <Input
            radius="round"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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

        <Field label={ot('reg.department')} required>
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
              maxLength={80}
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
      <Section n={3} title={ot('reg.secRequest')}>
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

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface/50 p-4">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={!ready}
        className="mt-5"
      >
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
  const items: { t: string; b: string }[] = [
    { t: ot('reg.t1'), b: ot('reg.t1b') },
    { t: ot('reg.t2'), b: ot('reg.t2b') },
    { t: ot('reg.t3'), b: ot('reg.t3b') },
    { t: ot('reg.t4'), b: ot('reg.t4b') },
    { t: ot('reg.t5'), b: ot('reg.t5b') },
    { t: ot('reg.t6'), b: ot('reg.t6b') },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ot('reg.termsTitle')}
      /* ★ กดพื้นหลังเพื่อปิด — แต่เฉพาะพื้นหลังจริง ไม่ใช่ตัวแผง */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl border border-line bg-elevated sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold text-ink">{ot('reg.termsTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={ot('common.close')}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="m12 10.6 5-5 1.4 1.4-5 5 5 5-1.4 1.4-5-5-5 5L5.6 17l5-5-5-5L12 5.6z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ol className="flex flex-col gap-4">
            {items.map((it, i) => (
              <li key={it.t} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-bold text-ink-soft">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{it.t}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">
                    {it.b}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          <Button variant="primary" onClick={onAgree}>
            {ot('reg.termsAgreeHere')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {ot('reg.termsClose')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section
      className="mt-5 rounded-3xl border border-line bg-elevated/60 p-5 backdrop-blur-md sm:p-6"
      style={{ '--tint': '255 0 51' } as CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-ink">
          {n}
        </span>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      </div>

      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ms-0.5 text-accent">*</span> : null}
        {hint ? <span className="ms-1.5 text-xs font-normal text-ink-faint">({hint})</span> : null}
      </span>
      {children}
    </label>
  )
}
