'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { shrinkImage } from '@/lib/image/shrink'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { Toggle } from '@/components/ui/Toggle'
import { companyLabel } from '@/lib/office/company'
import { DEPARTMENTS } from '@/lib/office/departments'
import { Untranslated, useOt, type OfficeKey } from '@/lib/i18n/office'

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
    return <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
  }

  return (
    <div className="max-w-3xl py-2">

      {/*
        * ═══ หัวโปรไฟล์: รูป + ชื่อ + รหัสพนักงาน ═══
        *
        * ★★★ หน้านี้เคยเป็นตารางคู่ป้าย-ค่า สามบรรทัด
        *     ★ ซึ่งอ่านเป็น "หน้าแสดงข้อมูล" ไม่ใช่ "โปรไฟล์ของฉัน"
        *       ★★ รูปกับชื่อที่ใหญ่พอทำให้คนรู้ทันทีว่ากำลังดูของตัวเองอยู่
        *          ซึ่งสำคัญในระบบที่มีเรื่องเงินและเครื่องที่ใช้ร่วมกัน
        */}
      <div className="profile-hero mt-4 flex flex-col items-center gap-4 rounded-3xl p-6 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          {profile.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="size-24 rounded-full object-cover ring-2 ring-accent/35"
            />
          ) : (
            <span className="grid size-24 place-items-center rounded-full bg-accent text-3xl font-bold text-accent-ink ring-2 ring-accent/35">
              <span dir="auto">
                {(profile.nickname || profile.displayName).trim().charAt(0) || '?'}
              </span>
            </span>
          )}

          {/* ★ ปุ่มกล้องทับมุมรูป — ที่ที่คนไปกดเปลี่ยนรูปโดยไม่ต้องอ่าน */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title={ot('profile.avatarChange')}
            aria-label={ot('profile.avatarChange')}
            className={cn(
              'absolute -end-1 -bottom-1 grid size-9 place-items-center rounded-full',
              'border-2 border-page bg-surface text-ink transition-colors',
              'hover:bg-accent hover:text-accent-ink disabled:opacity-50',
            )}
          >
            {uploading ? (
              <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
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

        <div className="min-w-0 flex-1 text-center sm:text-start">
          <p className="text-[22px] font-bold leading-tight text-ink">
            <span dir="auto">{profile.nickname || profile.displayName}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-soft sm:justify-start">
            {profile.username ? <span className="font-mono">@{profile.username}</span> : null}
            {profile.employeeCode ? (
              <span className="rounded-full bg-surface px-2 py-0.5 font-mono">
                {profile.employeeCode}
              </span>
            ) : null}
            {profile.isAdmin ? (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent">
                Admin
              </span>
            ) : null}
          </p>

          <p className="mt-2 text-xs text-ink-faint">{ot('profile.avatarHint')}</p>
          {avatarNote ? <p className="mt-1 text-xs text-accent">{avatarNote}</p> : null}

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Link
              href="/office/wallet/qr"
              className="inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-hover"
            >
              {profile.hasQr ? ot('profile.qrChange') : ot('profile.qrAdd')}
            </Link>
          </div>
        </div>
      </div>

      {/* ── ชื่อของฉัน ────────────────────────────────────────── */}
      {/*
        * ★★★ อยู่เหนือ "ข้อมูลพนักงาน" โดยตั้งใจ
        *
        *     ★ การ์ดข้างล่างเป็นข้อมูลที่ผู้ใช้แก้เองไม่ได้ (ผู้ดูแลแก้ให้)
        *       ★★ ถ้าวางช่องที่แก้ได้ไว้ใต้ช่องที่แก้ไม่ได้ คนจะเลื่อนผ่าน
        *          การ์ดบนแล้วสรุปว่า "หน้านี้แก้อะไรไม่ได้เลย" แล้วออกไป
        *     ★ ของที่กดได้ควรอยู่ก่อนของที่อ่านอย่างเดียวเสมอ
        */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5">
        {/*
          * ★ สองบรรทัดนี้ยังไม่ได้แปล (กติกา "ทำไทยอย่างเดียว" ใน AGENTS.md)
          *   ★★ <Untranslated> ติดป้าย lang="th" ให้ และจะเลิกติดเองวันที่แปลเสร็จ
          */}
        <p className="text-sm font-medium text-ink">
          <Untranslated>{ot('profile.secName')}</Untranslated>
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          <Untranslated>{ot('profile.nameHint')}</Untranslated>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="dispName" className="sr-only">
            {ot('profile.name')}
          </label>
          <Input
            id="dispName"
            radius="round"
            className="min-w-0 flex-1 sm:max-w-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            /* ★ ความยาวสูงสุดตรงกับ displayNameSchema ฝั่ง server เป๊ะ
                 ★★ ให้ช่องกรอกหยุดที่ 40 ดีกว่าปล่อยให้พิมพ์ 60 แล้วค่อย
                    ฟ้องตอนกดบันทึก ซึ่งแปลว่าต้องลบทิ้งเองยี่สิบตัว */
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
          <Button
            size="sm"
            variant="primary"
            onClick={saveName}
            /* ★ ชื่อว่างบันทึกไม่ได้ — ปุ่มบอกก่อนกด ไม่ใช่ฟ้องหลังกด */
            disabled={!name.trim() || nameBusy}
          >
            {ot('common.save')}
          </Button>
          {nameNote ? (
            <p className="text-xs text-accent">
              <Untranslated>{nameNote}</Untranslated>
            </p>
          ) : null}
        </div>
      </div>

      {/* ── ข้อมูลพนักงาน (อ่านอย่างเดียว) ───────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5">
        <p className="text-sm font-medium text-ink">{ot('profile.secEmployee')}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{ot('profile.askAdmin')}</p>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label={ot('reg.firstName')} value={profile.firstName} />
          <Row label={ot('reg.lastName')} value={profile.lastName} />
          <Row label={ot('profile.phone')} value={profile.phone} mono />
          <Row label={ot('profile.position')} value={profile.position} />
          <Row label={ot('profile.company')} value={companyLabel(ot, profile.company)} wide />
        </dl>

        {/*
          * ★★★ เอาบรรทัด "ชื่อและรูปแก้ได้ที่หน้าตั้งค่าของห้องเพลง" ออกแล้ว
          *
          *     ★ มันพูดไม่จริงมาตั้งแต่วันที่ใส่ปุ่มกล้องบนรูปในหน้านี้ —
          *       รูปแก้ได้ที่นี่อยู่แล้ว ★★ และตอนนี้ชื่อก็แก้ได้ที่นี่ด้วย
          *     ★ คำแนะนำที่พาไปผิดที่ แย่กว่าไม่มีคำแนะนำเลย — คนจะเดินไป
          *       หน้าห้องเพลงแล้วหาไม่เจอ แล้วสรุปว่าแก้ชื่อไม่ได้
          *     ★★ เรื่อง "ใช้ร่วมกันทั้งสองระบบ" ย้ายไปอยู่ใต้หัวข้อชื่อ
          *        ซึ่งเป็นที่ที่คนกำลังจะแก้ชื่ออ่านอยู่พอดี
          */}
      </div>

      {/* ── ฝ่าย/แผนก ────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
        <label htmlFor="dept" className="block text-sm font-medium text-ink">
          {ot('profile.department')}
        </label>
        <p className="mt-0.5 text-xs text-ink-faint">{ot('profile.departmentHint')}</p>
        {/*
          * ★★ เป็นรายการให้เลือก ไม่ใช่ช่องพิมพ์ — ชุดเดียวกับฟอร์มสมัคร
          *    ★ ถ้าที่นี่พิมพ์อิสระ คนจะแก้ "ฝ่ายพัฒนาระบบ" เป็น "IT" แล้ว
          *      หลุดออกจากกลุ่มที่ตัวกรองในหน้า Admin ใช้ทันที
          *      ★★ ซึ่งเป็นปัญหาเดียวกับที่แก้ไปแล้วตอนทำฟอร์มสมัคร
          *         การแก้ที่เดียวแล้วปล่อยอีกที่ไว้คือการแก้ครึ่งเดียว
          */}
        <div className="mt-2.5 flex items-center gap-2">
          <select
            id="dept"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value)
              setSaved(false)
            }}
            className={cn(
              'field-input h-11 min-w-0 flex-1 rounded-full border border-line bg-input px-4',
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
            {/* ★ ฝ่ายเดิมที่ไม่อยู่ในรายการต้องไม่หายไปจากช่อง
                ★★ คนที่ Admin ตั้งค่าให้เป็นฝ่ายอื่น หรือสมัครด้วย "อื่น ๆ"
                   จะเห็นช่องว่างเปล่าแล้วเผลอเซฟทับของเดิมทิ้ง */}
            {department && !DEPARTMENTS.some((d) => d.value === department) ? (
              <option value={department}>{department}</option>
            ) : null}
          </select>

          <Button size="sm" loading={busy} disabled={!department} onClick={saveDepartment}>
            {ot('common.save')}
          </Button>
        </div>
        {saved ? <p className="mt-2 text-xs text-accent">{ot('profile.saved')}</p> : null}
      </div>

      {/* ── สวิตช์แจ้งเตือน ──────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
        <p className="text-sm font-medium text-ink">{ot('profile.notify')}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{ot('profile.notifyHint')}</p>

        <div className="mt-3 flex flex-col gap-4">
          {NOTIFY_GROUPS.map((g) => (
            <div key={g.titleKey}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {ot(g.titleKey)}
              </p>
              <div className="flex flex-col gap-1">
                {g.items.map((n) => {
                  const on = !off.has(n.type)
                  return (
                    <Toggle
                      key={n.type}
                      plain
                      checked={on}
                      onChange={() => void toggle(n.type)}
                      label={ot(n.labelKey)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
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
