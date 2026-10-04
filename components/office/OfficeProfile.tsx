'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { shrinkImage } from '@/lib/image/shrink'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { Toggle } from '@/components/ui/Toggle'
import { companyLabel } from '@/lib/office/company'
import { DEPARTMENTS, departmentLabel } from '@/lib/office/departments'
import { Untranslated, useOt, type OfficeKey } from '@/lib/i18n/office'
import { FunGuide } from './FunGuide'

type Profile = {
  displayName: string
  nickname: string | null
  department: string | null
  employeeCode: string | null
  hasQr: boolean
  isAdmin: boolean
  avatarUrl: string | null
  username: string | null
  prefix: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  company: string | null
  position: string | null
}

/**
 * ชนิดแจ้งเตือนที่ผู้ใช้ปิดได้
 *
 * ★ ประกาศเป็นรายการตรงนี้ ไม่ดึงจากฐานข้อมูล
 *   ★★ ตาราง notification_prefs มีแถวเฉพาะชนิดที่ "เคยถูกปิด" —
 *      ถ้าดึงรายการจากตารางนั้น หน้าตั้งค่าจะว่างเปล่าสำหรับผู้ใช้ใหม่ทุกคน
 *      ★ รายการที่ผู้ใช้ควรเห็นคือ "ทุกชนิดที่ระบบส่ง" ซึ่งเป็นความรู้ของโค้ด
 */
/**
 * ชนิดแจ้งเตือนทั้งหมดที่ระบบส่งจริง
 *
 * ★★★ รายการนี้ต้องตรงกับค่า p_type ที่ public.notify() ถูกเรียกด้วย
 *
 *     ★ ของเดิมขาดสามชนิดและเกินความจริงหนึ่งชนิด:
 *       ★★ "ข้อความใหม่ในแชท" ไม่มีสวิตช์เลย ทั้งที่เป็นชนิดที่ส่งบ่อยที่สุด
 *          ในทั้งระบบ — คนที่อยู่ในกลุ่มใหญ่จึงปิดมันไม่ได้
 *       ★★ "เจ้าหนี้แจ้งว่ายังไม่ได้รับเงิน" · "หักลบยอดค้าง" · "ชวนตั้งค่า QR"
 *          ถูกส่งด้วยชนิด debtCreated ที่ยืมมา
 *          ★ แปลว่าคนที่ปิด "มีคนสร้างรายการค้างจ่าย" จะเงียบไปอีกสามเรื่อง
 *            ที่เขาไม่ได้สั่งให้เงียบ (แก้ที่ route และ migration 0059 แล้ว)
 *
 * ★★ จัดกลุ่มตามโมดูล ★ สิบสองสวิตช์เรียงติดกันเป็นกองเดียวอ่านไม่ออกว่า
 *    อันไหนเรื่องเงิน อันไหนเรื่องแชท
 */
type NotifyGroup = {
  titleKey: OfficeKey
  items: { type: string; labelKey: OfficeKey }[]
}

const NOTIFY_GROUPS: NotifyGroup[] = [
  {
    titleKey: 'profile.n.gWallet',
    items: [
      { type: 'debtCreated', labelKey: 'profile.n.debtCreated' },
      { type: 'debtReminder', labelKey: 'profile.n.debtReminder' },
      { type: 'debtPaidPending', labelKey: 'profile.n.debtPaidPending' },
      { type: 'debtRejected', labelKey: 'profile.n.debtRejected' },
      { type: 'debtNetted', labelKey: 'profile.n.debtNetted' },
      { type: 'setUpQr', labelKey: 'profile.n.setUpQr' },
    ],
  },
  {
    titleKey: 'profile.n.gChat',
    items: [
      /* ★ chatMention ใช้ชนิดเดียวกับ chatMessage — สวิตช์เดียวคุมทั้งคู่
           ★★ ฐานข้อมูลส่ง type 'chatMessage' เสมอ ต่างแค่ข้อความที่แสดง */
      { type: 'chatMessage', labelKey: 'profile.n.chatMessage' },
    ],
  },
  {
    titleKey: 'profile.n.gMarket',
    items: [
      { type: 'marketReserved', labelKey: 'profile.n.marketReserved' },
      { type: 'marketQueueTurn', labelKey: 'profile.n.marketQueueTurn' },
      { type: 'marketMessage', labelKey: 'profile.n.marketMessage' },
      { type: 'marketAlert', labelKey: 'profile.n.marketAlert' },
    ],
  },
  {
    titleKey: 'profile.n.gSystem',
    items: [{ type: 'contentHidden', labelKey: 'profile.n.contentHidden' }],
  },
]

/** หน้าโปรไฟล์ + ตั้งค่าแจ้งเตือน (หัวข้อ 8.1) */
export function OfficeProfile() {
  const ot = useOt()
  const confirm = useConfirm()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [department, setDepartment] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [avatarNote, setAvatarNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  /*
   * ★★ ช่องชื่อเก็บแยกจาก profile ที่โหลดมา ไม่ได้แก้ profile ตรง ๆ
   *    ★ profile คือ "ความจริงจากเซิร์ฟเวอร์" ส่วนสองตัวนี้คือ "สิ่งที่กำลังพิมพ์"
   *      ★★ ถ้าใช้ตัวเดียวกัน พอกดบันทึกไม่ผ่านแล้วจะไม่มีค่าเดิมให้ย้อนกลับ
   *         และหน้าจอจะโชว์ชื่อใหม่ทั้งที่เซิร์ฟเวอร์ยังเป็นชื่อเก่า
   */
  const [name, setName] = useState('')
  const [nameNote, setNameNote] = useState<string | null>(null)
  const [nameBusy, setNameBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ profile: Profile; off: string[] }>('/api/office/profile')
      setProfile(d.profile)
      setDepartment(d.profile.department ?? '')
      /* ★ ช่องนี้ต้องโชว์ "ชื่อที่คนอื่นเห็น" ซึ่งคือชื่อเล่นถ้ามี
           ★★ ถ้าโชว์ display_name เฉย ๆ คนที่มีชื่อเล่นจะเห็นค่าที่ไม่ตรงกับ
              ชื่อบนหัวการ์ดที่อยู่เหนือมันขึ้นไปสองนิ้ว */
      setName(d.profile.nickname || d.profile.displayName)
      setOff(new Set(d.off))
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * บันทึกชื่อ
   *
   * ★★★ ช่องเดียว เขียนลงทั้ง display_name และ nickname
   *
   *     ★ ตอนแรกทำเป็นสองช่องตามที่ฐานข้อมูลมีสองคอลัมน์ ★★ แล้วพบตอน
   *       ขับเบราว์เซอร์จริงว่าบัญชีที่เพิ่งสมัครมีสองค่านี้ "เท่ากันเป๊ะ"
   *       — RPC ตอนสมัครเขียน display_name = nickname = ชื่อเล่นที่กรอก
   *     ★★ และทุกที่ที่โชว์ชื่อใช้ coalesce(nickname, display_name)
   *        ★ ผลคือคนแก้ช่องบน (ชื่อที่แสดง) แล้วกดบันทึก จะไม่เห็นอะไร
   *          เปลี่ยนเลยสักที่ เพราะชื่อเล่นชนะอยู่ — วัดได้จริง: หัวการ์ด
   *          ยังเป็น "ชื่อเดิม" ทั้งที่บันทึกสำเร็จและขึ้นว่า "เปลี่ยนชื่อแล้ว"
   *     ★★ ช่องที่กรอกแล้วไม่มีอะไรเกิดขึ้น แย่กว่าไม่มีช่องให้กรอก
   *
   *     ★ ชื่อเดียวจึงถูกต้องกว่าสำหรับหน้านี้ — ในโมดูลออฟฟิศไม่มีที่ไหน
   *       แสดง display_name แยกจาก nickname เลยสักจุด (ตัวตนที่เป็นทางการ
   *       คือชื่อ-นามสกุลในการ์ด "ข้อมูลพนักงาน" ซึ่งคนละเรื่องกัน)
   *       ★★ ใครที่อยากให้สองค่าต่างกันจริง ๆ ยังตั้งแยกได้ที่กล่องโปรไฟล์
   *          ของห้องเพลง ซึ่งมีสองช่องอยู่แล้ว
   *
   * ★★ ใช้ PATCH /api/profile ของห้องเพลง ไม่สร้าง route ใหม่
   *    ★ คอลัมน์เดียวกันทั้งสองระบบ — route ใหม่ = สองที่ที่เขียนคอลัมน์
   *      เดียวกันด้วยกฎคนละชุด วันที่เปลี่ยนความยาวสูงสุดจะลืมแก้ที่หนึ่ง
   *    ★ และ route นั้นมี rate limit อยู่แล้ว (ชื่อคือสิ่งที่คนทั้งบริษัทเห็น)
   *    ★★ เหตุผลเดียวกับที่การอัปรูปใช้ /api/profile/avatar ของห้องเพลง
   */
  async function saveName() {
    const next = name.trim()
    if (!next || nameBusy) return
    if (!(await confirm({ kind: 'edit', subject: `${ot('profile.name')}: ${next}` }))) return

    setNameBusy(true)
    setError(null)
    setNameNote(null)

    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: { displayName: next, nickname: next },
      })
      await load()
      setNameNote(ot('profile.nameSaved'))
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setNameBusy(false)
    }
  }

  async function saveDepartment() {
    if (!(await confirm({ kind: 'edit', subject: `${ot('profile.department')}: ${departmentLabel(ot, department) ?? department}` }))) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/api/office/profile', {
        method: 'POST',
        body: { action: 'department', department },
      })
      setSaved(true)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  /**
   * ★★ ใช้ /api/profile/avatar ของห้องเพลง ไม่สร้างทางอัปใหม่
   *
   *    ★ รูปโปรไฟล์เป็นของเดียวกันทั้งสองระบบ (คอลัมน์ avatar_url เดียวกัน)
   *      ★★ ถ้าทำทางอัปของออฟฟิศแยก จะมีสองที่ที่เขียนคอลัมน์เดียวกัน
   *         ด้วยกฎคนละชุด — วันที่เปลี่ยนขนาดหรือชนิดไฟล์จะลืมแก้ที่หนึ่ง
   *
   * ★ ย่อเหลือ 256px ฝั่ง client ก่อนส่ง เหมือนที่ห้องเพลงทำ
   *   ★★ รูปจากมือถือใบหนึ่ง 4MB ส่งขึ้นไปเพื่อแสดงเป็นวงกลม 40px คือ
   *      การเผาเน็ตของคนใช้และพื้นที่เก็บของเราไปพร้อมกัน
   */
  async function uploadAvatar(file: File) {
    /* ★ เลือกไฟล์แล้วบันทึกทันที — จึงถามตรงนี้ */
    if (!(await confirm({ kind: 'edit', subject: ot('profile.avatarChange') }))) return
    setUploading(true)
    setError(null)
    setAvatarNote(null)
    try {
      const small = await shrinkImage(file, 256)
      await apiUpload<{ avatarUrl: string }>('/api/profile/avatar', small, {
        signal: AbortSignal.timeout(30_000),
      })
      await load()
      setAvatarNote(ot('profile.avatarSaved'))
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setUploading(false)
    }
  }

  async function toggle(type: string) {
    const next = new Set(off)
    const enabled = next.has(type)
    if (enabled) next.delete(type)
    else next.add(type)

    /* ★ สลับให้เห็นทันทีแล้วค่อยยิง — สวิตช์ที่หน่วงรู้สึกเหมือนกดไม่ติด */
    setOff(next)

    try {
      await apiFetch('/api/office/profile', {
        method: 'POST',
        body: { action: 'notify', type, enabled },
      })
    } catch (e) {
      setError(officeErrorText(e, ot))
      await load()
    }
  }

  if (!profile) {
    return (
      <div className="py-2">
        <FunGuide id="profile" art="idcard" />
        <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
      </div>
    )
  }

  const shownName = profile.nickname || profile.displayName
  /* ── ความพร้อมของโปรไฟล์ — เฉพาะเรื่องที่ผู้ใช้ทำเองได้ ── */
  /* ★ pickAvatar เป็นธงบอกชนิด ไม่ใช่ฟังก์ชัน — ปุ่มเรียก fileRef เองตอนกด (ห้ามแตะ ref ตอน render) */
  const checks: { key: OfficeKey; ok: boolean; href?: string; pickAvatar?: boolean }[] = [
    { key: 'profile.check.avatar', ok: !!profile.avatarUrl, pickAvatar: true },
    { key: 'profile.check.name', ok: !!shownName.trim(), href: '#prof-name' },
    { key: 'profile.check.dept', ok: !!profile.department, href: '#prof-dept' },
    { key: 'profile.check.qr', ok: profile.hasQr, href: '/office/wallet/qr' },
  ]
  const done = checks.filter((c) => c.ok).length
  const pct = Math.round((done / checks.length) * 100)
  const notifyTotal = NOTIFY_GROUPS.reduce((n, g) => n + g.items.length, 0)
  const notifyOn = NOTIFY_GROUPS.reduce((n, g) => n + g.items.filter((i) => !off.has(i.type)).length, 0)
  const deptName = profile.department ? departmentLabel(ot, profile.department) : null
  const QUICK: { href: string; emoji: string; key: OfficeKey }[] = [
    { href: '/office/wallet/qr', emoji: '🪪', key: 'top.qr' },
    { href: '/office/wallet/owed', emoji: '💸', key: 'nav.wallet.owed' },
    { href: '/office/wallet/summary', emoji: '📊', key: 'nav.wallet.summary' },
    { href: '/office/market/mine', emoji: '📦', key: 'nav.market.mine' },
  ]
  const GROUP_EMOJI = ['💰', '💬', '🛍️', '⚙️']

  return (
    <div className="py-2">
      <FunGuide id="profile" art="idcard" />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ═══ ซ้าย: บัตรพนักงาน + ความพร้อม + ทางลัด ═══ */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+16px)]">
          {/*
            * ★★★ หัวโปรไฟล์เป็น "บัตรพนักงาน" — รูปใหญ่ ชื่อใหญ่ รหัสพนักงาน
            *     ★ คนรู้ทันทีว่ากำลังดูของตัวเอง ซึ่งสำคัญในระบบที่มีเรื่องเงิน
            */}
          <div className="prof-card overflow-hidden rounded-[28px]">
            <div className="prof-banner relative h-28">
              {profile.isAdmin ? (
                <span className="absolute end-3 top-3 rounded-full bg-[color-mix(in_srgb,var(--ck-shade)_35%,transparent)] px-2.5 py-1 text-[11px] font-bold text-[var(--ck-shine)] backdrop-blur">
                  🛡️ Admin
                </span>
              ) : null}
            </div>
            <div className="-mt-14 flex flex-col items-center px-5 pb-6 text-center">
              <div className="relative">
                {profile.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={profile.avatarUrl} alt={profile.displayName} className="size-28 rounded-full object-cover ring-4 ring-elevated" />
                ) : (
                  <span className="grid size-28 place-items-center rounded-full bg-accent text-4xl font-black text-accent-ink ring-4 ring-elevated">
                    <span dir="auto">{shownName.trim().charAt(0) || '?'}</span>
                  </span>
                )}
                {/* ★ ปุ่มกล้องทับมุมรูป — ที่ที่คนไปกดเปลี่ยนรูปโดยไม่ต้องอ่าน */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title={ot('profile.avatarChange')}
                  aria-label={ot('profile.avatarChange')}
                  className="absolute -bottom-0.5 -end-0.5 grid size-11 place-items-center rounded-full border-4 border-elevated bg-ink text-page shadow-md transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-50"
                >
                  {uploading ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                      <circle cx="12" cy="13" r="3.2" />
                    </svg>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadAvatar(f)
                    e.target.value = ''
                  }}
                />
              </div>

              <p dir="auto" className="mt-3 text-[24px] font-black leading-tight text-ink">{shownName}</p>
              {profile.position ? <p dir="auto" className="mt-0.5 text-sm text-ink-soft">{profile.position}</p> : null}
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs">
                {profile.username ? <span className="rounded-full bg-surface px-2.5 py-1 font-mono text-ink-soft">@{profile.username}</span> : null}
                {profile.employeeCode ? (
                  <span className="rounded-full bg-surface px-2.5 py-1 font-mono font-semibold text-ink">🪪 {profile.employeeCode}</span>
                ) : null}
                {deptName ? <span dir="auto" className="rounded-full bg-accent/12 px-2.5 py-1 font-medium text-accent">🏢 {deptName}</span> : null}
              </div>
              <p className="mt-3 text-[11px] text-ink-faint">{ot('profile.avatarHint')}</p>
              {avatarNote ? <p className="mt-1 text-xs font-medium text-accent">{avatarNote}</p> : null}
            </div>
          </div>

          {/* ── ความพร้อมของโปรไฟล์ ── */}
          <div className="mkt-panel rounded-[28px] p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="prof-ring grid size-14 shrink-0 place-items-center rounded-full text-sm font-black tabular-nums text-ink"
                style={{ '--p': `${pct}%` } as CSSProperties}
              >
                <span className="grid size-11 place-items-center rounded-full bg-elevated">{pct}%</span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">
                  <Untranslated>{ot('profile.check.title')}</Untranslated>
                </span>
                <span className="block text-xs text-ink-soft">
                  <Untranslated>{done === checks.length ? ot('profile.check.done') : ot('profile.check.left', { n: checks.length - done })}</Untranslated>
                </span>
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {checks.map((c) => {
                const body = (
                  <>
                    <span aria-hidden="true" className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', c.ok ? 'mkt-check-done' : 'bg-surface text-ink-faint')}>
                      {c.ok ? '✓' : ''}
                    </span>
                    <span className={cn('min-w-0 flex-1 text-[13px]', c.ok ? 'text-ink-soft line-through decoration-ink-faint/50' : 'font-medium text-ink')}>
                      <Untranslated>{ot(c.key)}</Untranslated>
                    </span>
                    {!c.ok ? <span aria-hidden="true" className="text-ink-faint rtl:-scale-x-100">›</span> : null}
                  </>
                )
                const cls = 'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-start transition-colors hover:bg-surface'
                return (
                  <li key={c.key}>
                    {c.ok ? (
                      <div className={cls}>{body}</div>
                    ) : c.pickAvatar ? (
                      <button type="button" onClick={() => fileRef.current?.click()} className={cls}>{body}</button>
                    ) : c.href?.startsWith('#') ? (
                      <a href={c.href} className={cls}>{body}</a>
                    ) : (
                      <Link href={c.href ?? '#'} className={cls}>{body}</Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ── ทางลัดของฉัน ── */}
          <div className="mkt-panel rounded-[28px] p-4">
            <p className="text-sm font-bold text-ink">
              <Untranslated>{ot('profile.quick.title')}</Untranslated>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {QUICK.map((q) => (
                <Link key={q.href} href={q.href} className="chat-start flex min-h-14 items-center gap-2.5 rounded-2xl px-3 py-2">
                  <span aria-hidden="true" className="text-xl">{q.emoji}</span>
                  <span className="min-w-0 text-[12.5px] font-semibold leading-tight text-ink">{ot(q.key)}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* ═══ ขวา: ส่วนที่แก้ได้ (บน) → อ่านอย่างเดียว (ล่าง) ═══ */}
        <div className="flex min-w-0 flex-col gap-4">
          {/*
            * ★★★ ของที่แก้ได้อยู่ก่อนของที่อ่านอย่างเดียวเสมอ
            *     ★ ไม่งั้นคนเลื่อนผ่านการ์ดบนแล้วสรุปว่า "หน้านี้แก้อะไรไม่ได้เลย"
            */}
          {/* ── 1 · ชื่อที่แสดง ── */}
          <ProfSection id="prof-name" n={1} emoji="✏️" title={<Untranslated>{ot('profile.secName')}</Untranslated>} hint={<Untranslated>{ot('profile.nameHint')}</Untranslated>}>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="dispName" className="sr-only">{ot('profile.name')}</label>
              <Input
                id="dispName"
                radius="round"
                className="min-w-0 flex-1 sm:max-w-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                /* ★ ความยาวสูงสุดตรงกับ displayNameSchema ฝั่ง server เป๊ะ */
                maxLength={40}
                /* ★ ชื่อคนเป็นภาษาอะไรก็ได้ ไม่เกี่ยวกับภาษาของหน้า */
                dir="auto"
                onKeyDown={(e) => {
                  /* ★ Enter บันทึกเลย — ช่องเดียวในกล่องนี้ จึงไม่กำกวมว่าจะส่งอะไร */
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void saveName()
                  }
                }}
              />
              {/* ★ ชื่อว่างบันทึกไม่ได้ — ปุ่มบอกก่อนกด ไม่ใช่ฟ้องหลังกด */}
              <Button variant="primary" className="min-h-11" onClick={saveName} disabled={!name.trim() || nameBusy}>
                {ot('common.save')}
              </Button>
            </div>
            {nameNote ? (
              <p className="mt-2 text-xs font-medium text-accent">
                ✓ <Untranslated>{nameNote}</Untranslated>
              </p>
            ) : null}
          </ProfSection>

          {/* ── 2 · ฝ่าย/แผนก ── */}
          <ProfSection id="prof-dept" n={2} emoji="🏢" title={ot('profile.department')} hint={ot('profile.departmentHint')}>
            {/*
              * ★★ เป็นรายการให้เลือก ไม่ใช่ช่องพิมพ์ — ชุดเดียวกับฟอร์มสมัคร
              *    ★ พิมพ์อิสระแล้วคนจะแก้เป็นคำอื่น หลุดจากตัวกรองในหน้า Admin
              */}
            <div className="flex items-center gap-2">
              <label htmlFor="dept" className="sr-only">{ot('profile.department')}</label>
              <select
                id="dept"
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value)
                  setSaved(false)
                }}
                className={cn(
                  'field-input h-11 min-w-0 flex-1 rounded-full border border-line bg-input px-4 sm:max-w-sm',
                  'text-[16px] text-ink sm:text-sm',
                  'transition-colors focus:border-accent/70 focus:outline-none',
                  department === '' && 'text-ink-faint',
                )}
              >
                <option value="">{ot('reg.deptPick')}</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {ot(d.labelKey)}
                  </option>
                ))}
                {/* ★ ฝ่ายเดิมที่ไม่อยู่ในรายการต้องไม่หายไปจากช่อง — ไม่งั้นเผลอเซฟทับ */}
                {department && !DEPARTMENTS.some((d) => d.value === department) ? (
                  <option value={department}>{department}</option>
                ) : null}
              </select>
              <Button className="min-h-11" loading={busy} disabled={!department} onClick={saveDepartment}>
                {ot('common.save')}
              </Button>
            </div>
            {saved ? <p className="mt-2 text-xs font-medium text-accent">✓ {ot('profile.saved')}</p> : null}
          </ProfSection>

          {/* ── 3 · การแจ้งเตือน ── */}
          <ProfSection
            id="prof-notify"
            n={3}
            emoji="🔔"
            title={ot('profile.notify')}
            hint={ot('profile.notifyHint')}
            badge={
              <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink-soft">
                <Untranslated>{ot('profile.notifyOn', { n: notifyOn, total: notifyTotal })}</Untranslated>
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              {NOTIFY_GROUPS.map((g, gi) => (
                <div key={g.titleKey} className="rounded-2xl bg-surface/60 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-ink">
                    <span aria-hidden="true">{GROUP_EMOJI[gi]}</span>
                    {ot(g.titleKey)}
                  </p>
                  <div className="flex flex-col">
                    {g.items.map((n) => (
                      <Toggle key={n.type} plain checked={!off.has(n.type)} onChange={() => void toggle(n.type)} label={ot(n.labelKey)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ProfSection>

          {/* ── 4 · ข้อมูลพนักงาน (อ่านอย่างเดียว) ── */}
          <ProfSection
            id="prof-employee"
            n={4}
            emoji="🪪"
            title={ot('profile.secEmployee')}
            hint={ot('profile.askAdmin')}
            badge={
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                🔒 <Untranslated>{ot('profile.readonly')}</Untranslated>
              </span>
            }
          >
            <dl className="grid gap-x-6 gap-y-3 rounded-2xl bg-surface/50 p-4 sm:grid-cols-2">
              <Row label={ot('reg.firstName')} value={profile.firstName} />
              <Row label={ot('reg.lastName')} value={profile.lastName} />
              <Row label={ot('profile.phone')} value={profile.phone} mono />
              <Row label={ot('profile.position')} value={profile.position} />
              <Row label={ot('profile.company')} value={companyLabel(ot, profile.company)} wide />
            </dl>
          </ProfSection>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** หนึ่งส่วนของหน้าโปรไฟล์ — เลขลำดับ + ไอคอน + หัวข้อ + คำอธิบาย */
function ProfSection({
  id,
  n,
  emoji,
  title,
  hint,
  badge,
  children,
}: {
  id: string
  n: number
  emoji: string
  title: React.ReactNode
  hint: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mkt-panel scroll-mt-[calc(var(--spacing-header)+16px)] rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="room-step-num grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black">{n}</span>
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <span aria-hidden="true">{emoji}</span>
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{hint}</p>
        </div>
        {badge ? <div className="shrink-0 ps-12 sm:ps-0">{badge}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** หนึ่งบรรทัดของข้อมูลพนักงานที่อ่านอย่างเดียว */
function Row({
  label,
  value,
  mono,
  wide,
}: {
  label: string
  value: string | null
  mono?: boolean
  wide?: boolean
}) {
  const ot = useOt()
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      {/* ★ ช่องที่ยังไม่กรอกบอกว่า "ยังไม่ได้กรอก" ไม่ใช่ขีดกลาง
          ★★ ขีดกลางอ่านได้ทั้ง "ไม่มี" และ "ระบบดึงมาไม่ได้" */}
      {/* ★ ค่าในแถวพวกนี้มาจากฐานข้อมูล (ชื่อ · เบอร์ · ฝ่าย · บริษัท)
          ★★ เป็นภาษาอะไรก็ได้ ไม่เกี่ยวกับภาษาของหน้า จึงต้องกั้นทิศเอง */}
      <dd
        dir="auto"
        className={cn('mt-0.5 truncate text-sm', value ? 'text-ink' : 'text-ink-faint', mono && value && 'font-mono')}
      >
        {value || ot('profile.notSet')}
      </dd>
    </div>
  )
}
