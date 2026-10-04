'use client'

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Avatar, avatarHue } from '@/components/AppHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { apiFetch, apiUpload, errorText } from '@/lib/api/client'
import {
  ensureSession,
  rememberProfile,
  signOutCompletely,
  type LocalProfile,
} from '@/lib/auth/session'
import { shrinkImage } from '@/lib/image/shrink'
import { cn } from '@/lib/cn'
import { useMounted } from '@/hooks/useMounted'
import { useT } from '@/lib/i18n/client'
import { useConfirm } from '@/components/ConfirmProvider'

const NAME_MAX = 40
const NICK_MAX = 30

/**
 * ตั้งโปรไฟล์ — ชื่อ · รูป · ฉายา
 *
 * ★★ ทำไมไม่มีรหัสผ่าน และทำไมนั่นไม่ใช่การลดคุณภาพ
 *
 *    ตัวตนของผู้ใช้คือ anonymous auth user ของ Supabase ซึ่งอยู่ในเครื่อง
 *    ข้ามการปิดเปิดเบราว์เซอร์ได้อยู่แล้ว — สิ่งที่ขาดมาตลอดไม่ใช่ "บัญชี"
 *    แต่คือ "ของที่ผูกกับตัวตนนั้น" (รูปกับฉายา) และการที่หน้าเข้าห้อง
 *    ไม่ยอมจำว่าเราตั้งชื่อไว้แล้ว
 *
 *    ★ รหัสผ่านจะเพิ่มประตูก่อนฟังเพลงกับเพื่อน โดยแลกมาด้วยความปลอดภัย
 *      ของข้อมูลที่ไม่มีอะไรให้ปกป้องเลย (ชื่อเล่นกับรูปในห้องฟังเพลง)
 *
 * ★★ ทำไมถามทีเดียวจบ ไม่ทำเป็นหลายขั้น
 *
 *    ทั้งสามช่องสั้นและไม่มีอันไหนบังคับนอกจากชื่อ การแบ่งเป็นขั้นตอน
 *    ทำให้รู้สึกเหมือนการสมัครสมาชิก ซึ่งเป็นความรู้สึกที่ผู้ใช้บอกว่าไม่อยากได้
 *
 * ★★★ หัวกล่องคือ "ตัวอย่างจริง" ไม่ใช่ป้ายชื่อกล่อง
 *
 *     ของเดิมมีหัวข้อกับคำอธิบายกินที่อยู่บนสุด แล้วรูปเป็นแถวเล็ก ๆ ข้าง ๆ
 *     ★ ทั้งที่คำถามเดียวที่คนตอบอยู่ตรงนี้คือ "แล้วคนอื่นจะเห็นเราเป็นยังไง"
 *
 *     ★★ เอารูปกับชื่อขึ้นมาวางบนปกให้เห็นเต็ม ๆ แล้วให้มันอัปเดตสดตามที่พิมพ์
 *        คำตอบจึงอยู่ตรงหน้าตลอดเวลาโดยไม่ต้องมีใครเขียนอธิบายสักคำ
 */
export function ProfileDialog({
  initial,
  userId,
  title,
  submitLabel,
  onSaved,
  onClose,
}: {
  initial: LocalProfile | null
  /**
   * ★★ id จริงของคน — ใช้เลือกสีประจำตัว
   *
   *    สีของอวาตาร์ทั้งเว็บคำนวณจาก id ★ ถ้ากล่องนี้คำนวณจากชื่อแทน
   *      คนคนเดียวกันจะได้คนละสีระหว่างในกล่องกับบนแถบบน ซึ่งทำลาย
   *      เหตุผลทั้งหมดของการมีสีประจำตัว (จำหน้ากันได้จากสี)
   *
   *    ★ ไม่ส่งมาก็ยังทำงานได้ — ตกไปใช้ชื่อผู้ใช้แทน ซึ่งคงที่พอ ๆ กัน
   *      สำหรับหน้าที่ยังไม่รู้จัก id (หน้ารอเข้าห้อง)
   */
  userId?: string
  title?: string
  submitLabel?: string
  onSaved: (profile: LocalProfile) => void
  /** ไม่ส่งมา = ปิดไม่ได้ (ใช้ตอนตั้งครั้งแรก) */
  onClose?: () => void
}) {
  const t = useT()
  const confirm = useConfirm()
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const mounted = useMounted()

  /**
   * ★★ สีประจำตัวมาจาก "ตัวตน" ไม่ใช่ "ชื่อที่พิมพ์อยู่"
   *
   *    ถ้าคำนวณจากช่องชื่อ ปกจะเปลี่ยนสีวูบวาบทุกตัวอักษรที่พิมพ์ ★ ซึ่งนอกจาก
   *      กวนตาแล้วยังผิดความหมาย — สีนี้แทนคน ไม่ได้แทนข้อความในช่อง
   */
  const identity = userId ?? initial?.username ?? initial?.displayName ?? 'me'
  const hue = avatarHue(identity)

  /**
   * ★★ ค่าตั้งต้นของหัวข้อกับปุ่ม ไม่ใช่ปล่อยให้ว่าง
   *
   *    ที่เรียกใช้บางแห่งไม่ได้ส่งสองอย่างนี้มา ★ ผลคือหัวกล่องหายไปทั้งบรรทัด
   *      และปุ่มบันทึกกลายเป็นแถบแดงเปล่า ๆ ที่ไม่มีใครรู้ว่ากดแล้วเกิดอะไร
   *
   *    ★ เป็นบั๊กที่ TypeScript จับไม่ได้เพราะ prop เป็น optional โดยตั้งใจ
   *      — ตัวที่ต้องรับผิดชอบจึงเป็นค่าตั้งต้นตรงนี้ ไม่ใช่ที่เรียก
   */
  const heading = title ?? t('header.profile')
  const saveLabel = submitLabel ?? t('common.save')

  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * ★ ล็อกการเลื่อนของหน้าข้างหลัง
   *   บนมือถือ การปัดในกล่องแล้วหน้าข้างหลังเลื่อนตามไปด้วย ทำให้พอปิดกล่อง
   *   ผู้ใช้อยู่คนละที่กับตอนเปิด — ซึ่งอ่านว่า "เว็บพาไปไหนไม่รู้"
   */
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  /** ★ โฟกัสช่องชื่อให้เลย — ช่องเดียวที่บังคับ และเป็นเหตุผลที่กล่องนี้เปิดขึ้นมา */
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  async function uploadImage(file: File) {
    /**
     * ★ ปฏิเสธไฟล์ที่ไม่ใช่รูปตั้งแต่ในเครื่อง
     *   ลากไฟล์ .zip มาวางแล้วต้องรอเน็ตไปกลับเพื่อให้ server บอกว่าใช้ไม่ได้
     *   คือการให้ผู้ใช้รอเพื่อฟังคำตอบที่เรารู้อยู่แล้วตั้งแต่วินาทีแรก
     */
    if (!file.type.startsWith('image/')) {
      setError(t('toast.uploadFailed'))
      return
    }

    setUploading(true)
    setError(null)
    try {
      // ★ ต้องมี session ก่อนอัป — คนที่เพิ่งเปิดเว็บครั้งแรกยังไม่มี
      await ensureSession(displayName.trim() || undefined)

      /**
       * ★ ย่อในเครื่องก่อนส่ง ไม่ปล่อยไฟล์ 8MB จากกล้องขึ้นไปตรง ๆ
       *   อวาตาร์ถูกวาดที่ขนาด 28–32px การส่งรูปเต็มความละเอียดคือการจ่าย
       *   ค่าเน็ตของผู้ใช้เพื่อพิกเซลที่ไม่มีวันถูกแสดง
       */
      const small = await shrinkImage(file, 256)
      // ★ apiUpload ไม่ใช่ apiFetch — apiFetch จะ JSON.stringify ไฟล์ทิ้ง
      const res = await apiUpload<{ avatarUrl: string }>('/api/profile/avatar', small, {
        signal: AbortSignal.timeout(30_000),
      })
      setAvatarUrl(res.avatarUrl)
    } catch (err) {
      setError(errorText(err, t, 'toast.uploadFailed'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function pickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void uploadImage(file)
  }

  /**
   * ★★ วางรูปจากคลิปบอร์ดได้ด้วย ไม่ใช่แค่เลือกไฟล์
   *
   *    คนที่เพิ่งครอปรูปตัวเองในโปรแกรมแต่งรูป หรือกด "คัดลอกรูปภาพ" จากเว็บ
   *    ★ มีรูปอยู่ในมือแล้ว แต่ยังไม่มีไฟล์ — ทางเดียวคือเซฟลงเครื่องก่อน
     *      ทั้งที่ Ctrl+V ควรจบเรื่องได้ตรงนั้นเลย
   *
   *  ★ เก็บฟังก์ชันไว้ใน ref เพราะ effect นี้ผูกครั้งเดียวตอนเปิดกล่อง
   *    แต่ตัวฟังก์ชันอ่านค่า state ล่าสุดเสมอ (ชื่อที่พิมพ์ไว้ใช้ตอน ensureSession)
   */
  const uploadRef = useRef(uploadImage)
  useEffect(() => {
    uploadRef.current = uploadImage
  })
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) void uploadRef.current(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void uploadImage(file)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const name = displayName.trim()
    if (!name) {
      setError(t('profile.needName'))
      nameRef.current?.focus()
      return
    }
    /* ★ ตั้งครั้งแรก = เพิ่ม · มีโปรไฟล์อยู่แล้ว = แก้ไข — ถามหลังตรวจชื่อผ่านแล้ว */
    if (!(await confirm({ kind: initial ? 'edit' : 'create', subject: name }))) return

    setPending(true)
    setError(null)
    try {
      await ensureSession(name)
      const nick = nickname.trim()
      const saved = await apiFetch<LocalProfile>('/api/profile', {
        method: 'PATCH',
        body: { displayName: name, nickname: nick || null },
      })

      // ★ เก็บ avatarUrl จาก state เพราะ PATCH ไม่ได้แตะรูป
      //   (รูปถูกบันทึกไปแล้วตอนอัป — สองอย่างนี้เป็นคนละคำขอโดยตั้งใจ
      //    ผู้ใช้จะได้เห็นรูปเปลี่ยนทันทีโดยไม่ต้องรอกดบันทึก)
      const profile: LocalProfile = {
        displayName: saved.displayName,
        nickname: saved.nickname ?? null,
        avatarUrl: avatarUrl ?? saved.avatarUrl ?? null,
        // ★ ชื่อผู้ใช้เปลี่ยนไม่ได้จากที่นี่ — มันคือกุญแจเข้าระบบ ไม่ใช่ของตกแต่ง
        username: initial?.username ?? null,
      }
      rememberProfile(profile)
      onSaved(profile)
    } catch (err) {
      setError(errorText(err, t, 'profile.saveFailed'))
      setPending(false)
    }
  }

  if (!mounted) return null

  const previewName = displayName.trim()
  const previewNick = nickname.trim()

  return createPortal(
    <div
      className={cn(
        'dialog-veil fixed inset-0 z-[70] grid place-items-center overflow-y-auto p-4',
        /* ★ เบลอฉากหลังด้วย ไม่ใช่แค่ทำให้มืด — ของที่ยังอ่านออกอยู่ข้างหลัง
             ยังแย่งสายตาอยู่ดี ทั้งที่กล่องนี้ขอความสนใจทั้งหมดอยู่ */
        'bg-black/70 backdrop-blur-sm',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      <form
        onSubmit={submit}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          // ★ เช็คว่าออกจากกล่องจริง ไม่ใช่แค่ข้ามจากลูกไปหาลูกอีกตัว
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={onDrop}
        style={{ '--cover-hue': hue } as CSSProperties}
        className={cn(
          'dialog-pop relative w-full max-w-[420px] overflow-hidden rounded-[28px]',
          'border border-line bg-elevated',
          /* ★ เงาสองชั้น: ชั้นนอกคือเงาจริงที่ทำให้กล่องลอย
               ชั้นใน (inset บรรทัดบน) คือเส้นแสงบาง ๆ ที่ขอบบน — เทคนิคเก่าแก่
               ที่ทำให้ของดูเหมือนมีแสงส่องจากด้านบนจริง ไม่ใช่รูปสี่เหลี่ยมแบน */
          'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-white/[0.06]',
          dragging && 'ring-2 ring-accent',
        )}
      >
        {/* ── ปก ──────────────────────────────────────────────────── */}
        <div className="profile-cover relative h-[124px] overflow-hidden">
          <span aria-hidden="true" className="cover-blob cover-blob-1" />
          <span aria-hidden="true" className="cover-blob cover-blob-2" />
          <span aria-hidden="true" className="cover-blob cover-blob-3" />
          <span aria-hidden="true" className="cover-sheen" />

          {/**
            * ★ หัวข้อกับคำสัญญาอยู่บนปก ไม่ได้กินที่ของเนื้อหาข้างล่าง
            *   ★★ กว้างแค่ครึ่งเดียวโดยตั้งใจ — อีกครึ่งเป็นที่ของอวาตาร์
            *      ที่คร่อมขึ้นมา ถ้าปล่อยให้ยาวเต็มบรรทัดสองอย่างจะทับกัน
            */}
          <p className="absolute start-5 top-4 text-[11px] font-medium uppercase tracking-[0.2em] text-white/75">
            {heading}
          </p>
          <p className="absolute start-5 top-9 max-w-[58%] text-[11px] leading-relaxed text-white/50">
            {t('profile.hint')}
          </p>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              /* ★ พื้นทึบจาง ๆ ใต้ปุ่ม — ปกเป็นภาพไล่สี ปุ่มที่ลอยเปล่า ๆ
                   จะจมหายตรงจุดที่สีเข้มพอดี */
              className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="px-5 pb-5">
          {/* ── รูป + ตัวอย่างสิ่งที่คนอื่นเห็น ──────────────────── */}
          {/**
            * ★★ อวาตาร์คร่อมขอบปก ไม่ได้อยู่ใต้ปกหรือบนปกอย่างเดียว
            *
            *    การคร่อมทำให้สองชั้นนี้เป็นของชิ้นเดียวกัน ★ ถ้าวางใต้ปก
            *      ปกจะกลายเป็นแถบตกแต่งที่ไม่เกี่ยวกับอะไรเลย
            *
            *    ★ วงแหวนสีเดียวกับพื้นกล่อง (ไม่ใช่สีขาว) คือสิ่งที่ทำให้
            *      มันดูเหมือน "เจาะ" ออกมาจริง ๆ ไม่ใช่สติกเกอร์แปะทับ
            */}
          <div className="pop-step -mt-12 flex flex-col items-center" style={{ '--i': 0 } as CSSProperties}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={t('profile.pickPhoto')}
              className="group relative rounded-full disabled:opacity-60"
            >
              {/**
                * ★ เงาใต้รูปด้วย ไม่ใช่วงแหวนอย่างเดียว
                *   ในโหมดมืด วงแหวนสีพื้นกล่องกับปกมืดพอ ๆ กัน จนแทบไม่เหลือ
                *   เส้นแบ่ง — เงาคือสิ่งที่ยังทำงานได้เมื่อสองสีใกล้กันเกินไป
                *
                * ★★ เงาชั้นที่สองเป็นสีประจำตัวของเจ้าของ ไม่ใช่สีดำ
                *    เงาสีทำให้รูปดูเหมือน "เรืองแสง" ออกมาจากปกที่ย้อมสีเดียวกัน
                *    แทนที่จะดูเหมือนของแข็งวางทับอยู่เฉย ๆ
                */}
              <span className="avatar-glow block rounded-full ring-4 ring-elevated transition-transform duration-200 group-hover:scale-[1.04]">
                <Avatar
                  userId={identity}
                  name={previewName || '?'}
                  avatarUrl={avatarUrl}
                  size={88}
                />
              </span>

              {/* ★ ฝ้าดำ + ไอคอนกล้องตอนชี้ — บอกว่ากดได้โดยไม่ต้องมีคำอธิบาย */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <svg viewBox="0 0 24 24" className="size-7 text-white" fill="currentColor">
                  <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                </svg>
              </span>

              <span
                aria-hidden="true"
                className="absolute -bottom-0.5 -end-0.5 grid size-7 place-items-center rounded-full border-[3px] border-elevated bg-accent text-accent-ink"
              >
                {uploading ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
                    <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                  </svg>
                )}
              </span>
            </button>

            {/**
              * ★★★ ชื่อที่โชว์ตรงนี้อัปเดตสดตามที่พิมพ์ในช่องข้างล่าง
              *
              *     ช่องกรอกบอกได้แค่ว่า "ตัวหนังสืออะไรอยู่ในช่อง" ★ แต่คำถาม
              *       จริงของหน้านี้คือ "แล้วมันจะไปโผล่ยังไงในห้อง" ซึ่งเป็น
              *       คนละเรื่อง — ชื่อยาวโดนตัด ฉายาตัวเล็กกว่าที่คิด
              *
              *     ★ ตัวอย่างที่ขยับตามมือทำให้เห็นคำตอบก่อนกดบันทึก
              *       ไม่ใช่หลังจากเข้าห้องไปแล้วค่อยรู้ว่าชื่อยาวไป
              */}
            <p
              dir="auto"
              className="mt-2.5 max-w-full truncate text-[17px] font-semibold leading-tight"
            >
              {previewName || (
                <span className="text-ink-faint">{t('profile.namePlaceholder')}</span>
              )}
            </p>
            {previewNick ? (
              <p dir="auto" className="mt-0.5 max-w-full truncate text-xs text-ink-soft">
                {previewNick}
              </p>
            ) : null}

            <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-faint">
              {t('profile.tapToChange')}
              <br />
              {t('profile.fileRule')}
            </p>

            {avatarUrl ? (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                className="mt-1 text-[11px] text-ink-faint underline underline-offset-2 transition-colors hover:text-danger"
              >
                {t('profile.removePhoto')}
              </button>
            ) : null}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={pickAvatar}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* ── ชื่อ ──────────────────────────────────────────────── */}
          <div className="pop-step mt-5" style={{ '--i': 1 } as CSSProperties}>
            <Field
              id="profile-name"
              label={t('profile.displayName')}
              value={displayName}
              max={NAME_MAX}
            >
              <Input
                ref={nameRef}
                id="profile-name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  setError(null)
                }}
                placeholder={t('profile.namePlaceholder')}
                maxLength={NAME_MAX}
                autoComplete="nickname"
                aria-label={t('profile.displayName')}
                invalid={Boolean(error) && !displayName.trim()}
                focusTone="accent"
                className="h-11 rounded-xl"
              />
            </Field>
          </div>

          {/* ── ฉายา ─────────────────────────────────────────────── */}
          <div className="pop-step mt-3" style={{ '--i': 2 } as CSSProperties}>
            <Field
              id="profile-nick"
              label={
                <>
                  {t('profile.nickname')}{' '}
                  <span className="text-ink-faint">{t('profile.optional')}</span>
                </>
              }
              value={nickname}
              max={NICK_MAX}
            >
              <Input
                id="profile-nick"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('profile.nickPlaceholder')}
                maxLength={NICK_MAX}
                aria-label={t('profile.nickname')}
                focusTone="accent"
                className="h-11 rounded-xl"
              />
            </Field>
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
            style={{ '--i': 3 } as CSSProperties}
            className="cta-glow pop-step mt-4 h-12 rounded-xl"
          >
            {saveLabel}
          </Button>

          {/**
            * ★★ ต้องมีทางออก ไม่งั้นเครื่องหนึ่งผูกกับชื่อเดียวตลอดไป
            *
            *    คนที่ยืมคอมเพื่อน หรือใช้เครื่องร่วมกันที่บ้าน จะเปลี่ยนเป็นชื่อ
            *    ตัวเองไม่ได้เลยนอกจากไปล้าง site data เอง ซึ่งไม่มีใครรู้วิธี
            *
            * ★ ถามด้วยกล่อง "ยื้อ" กลางของเว็บ — เจ้าของสั่งให้ทุกการออกจากระบบต้องยืนยัน (4 ต.ค. 2026)
            */}
          {initial?.username ? (
            <button
              type="button"
              onClick={async () => {
                if (!(await confirm({ kind: 'logout' }))) return
                void signOutCompletely().then(() => window.location.reload())
              }}
              className="mt-3 block w-full text-center text-xs text-ink-faint underline underline-offset-2 hover:text-ink"
            >
              {t('profile.signOut')}
              <span className="ms-1 opacity-70">
                {t('profile.currently', { name: initial.username })}
              </span>
            </button>
          ) : null}
        </div>

        {/**
          * ★★ ป้าย "ปล่อยตรงนี้" ทับทั้งกล่องตอนลากรูปเข้ามา
          *
          *    พื้นที่รับของต้องใหญ่เท่าที่คนเล็งได้จริง ★ ถ้ารับเฉพาะวงกลม
          *      อวาตาร์ 88px คนจะปล่อยพลาดแล้วเบราว์เซอร์จะเปิดรูปนั้นทับทั้งหน้า
          *      — ซึ่งแปลว่าสิ่งที่กรอกค้างไว้หายหมด
          */}
        {dragging ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center rounded-3xl bg-page/85 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent px-6 py-5">
              <svg viewBox="0 0 24 24" className="size-7 text-accent" fill="currentColor">
                <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14a6 6 0 0 0 6 6h13a5 5 0 0 0 .35-9.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
              </svg>
              <p className="text-sm font-medium">{t('profile.dropPhoto')}</p>
            </div>
          </div>
        ) : null}
      </form>
    </div>,
    document.body,
  )
}

/**
 * ป้ายช่องกรอก + ตัวนับอักษร
 *
 * ★ ตัวนับโผล่เฉพาะตอนใกล้เต็ม — เหตุผลเดียวกับช่องชื่อห้องบนหน้าแรก
 *   การโชว์ "3/40" ตั้งแต่ตัวแรกคือการเตือนเรื่องที่ยังไม่เกิด และมันกวนตา
 *   ★★ แต่พอเหลืออีกไม่กี่ตัว การรู้ล่วงหน้าสำคัญมาก — ไม่งั้นคนจะพิมพ์
 *      ต่อแล้วงงว่าทำไมตัวอักษรไม่ขึ้น โดยไม่มีอะไรบอกว่าชนเพดานแล้ว
 */
function Field({
  id,
  label,
  value,
  max,
  children,
}: {
  id: string
  label: React.ReactNode
  value: string
  max: number
  children: React.ReactNode
}) {
  const near = value.length > max - 8

  return (
    <>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs text-ink-soft" htmlFor={id}>
          {label}
        </label>
        {near ? (
          <span
            className={cn(
              'font-mono text-[11px] tabular-nums',
              value.length >= max ? 'text-warn' : 'text-ink-faint',
            )}
          >
            {value.length}/{max}
          </span>
        ) : null}
      </div>
      {children}
    </>
  )
}
