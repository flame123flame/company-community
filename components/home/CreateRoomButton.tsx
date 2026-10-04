'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiClientError, apiFetch, errorText } from '@/lib/api/client'
import { ensureSession, rememberDisplayName, resetSession } from '@/lib/auth/session'
import { useRememberedDisplayName } from '@/hooks/useRememberedDisplayName'
import { displayNameSchema, roomNameSchema } from '@/lib/validation/schemas'
import type { RoomDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'
import { useConfirm } from '@/components/ConfirmProvider'
import type { DictKey } from '@/lib/i18n/dict'

const MAX = 60

export function CreateRoomButton({ configured }: { configured: boolean }) {
  const t = useT()
  const confirm = useConfirm()
  const router = useRouter()
  /**
   * ★ ไม่มีช่อง "ชื่อของคุณ" ที่นี่แล้ว
   *   ตัวตนมาจากโปรไฟล์ที่เข้าใช้งานไว้ (ProfileGate บังคับก่อนถึงหน้านี้เสมอ)
   *   การถามชื่ออีกรอบตรงนี้ทำให้ผู้ใช้สงสัยว่า "ที่กรอกไปตอนแรกคืออะไร"
   *   — ยังอ่านค่าไว้เพื่อส่งให้ ensureSession เผื่อ session หลุดแล้วต้องสร้างใหม่
   */
  const [name] = useRememberedDisplayName()
  const [roomName, setRoomName] = useState('')
  const [pending, setPending] = useState(false)
  /**
   * ★★ กันเรียกซ้อนด้วย ref ไม่ใช่ state
   *
   *    state อัปเดตแบบไม่ทันที — ถ้ามีอะไรเรียก handleCreate สองรอบติดกัน
   *    ในเฟรมเดียว รอบที่สองจะยังเห็น pending เป็น false แล้วเข้าไปยิง API ซ้ำ
   *    ★ ref เปลี่ยนค่าทันทีที่สั่ง จึงเป็นด่านเดียวที่กันกรณีนี้ได้จริง
   *
   *    ★ ต้นเหตุที่แท้จริงแก้ไปแล้ว (เอา onClick ที่ซ้ำกับ onSubmit ออก)
   *      อันนี้คือกันไว้ไม่ให้เกิดซ้ำจากทางอื่นอีก — เช่นกด Enter รัว ๆ
   */
  const busy = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedRoom = roomName.trim()
  const ready = trimmedRoom.length > 0 && configured

  async function handleCreate() {
    /*
     * ★★ กันไว้ตรงนี้ด้วย ทั้งที่ปุ่มถูกปิดอยู่แล้วตอนยังไม่พิมพ์
     *    ปุ่มที่ disabled กันได้แค่เมาส์ ★ คนที่กด Enter หรือเรียกผ่านคีย์บอร์ด
     *      ยังเข้ามาถึงตรงนี้ได้ — และชั้น API ก็กันอีกชั้นอยู่ดี
     */
    if (!trimmedRoom) {
      setError(t('home.create.nameRequired'))
      return
    }

    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)

    try {
      const trimmed = name.trim()
      const parsed = trimmed ? displayNameSchema.safeParse(trimmed) : null
      if (parsed && !parsed.success) {
        /* ★ zod คืน "กุญแจแปล" ไม่ใช่ข้อความ (ดู lib/validation/schemas.ts) */
        setError(t((parsed.error.issues[0]?.message as DictKey | undefined) ?? 'home.create.errName'))
        setPending(false)
        busy.current = false
        return
      }

      // ★ ต้องมี session ก่อนเสมอ — server อ่าน owner จาก cookie ไม่ใช่จาก body
      await ensureSession(trimmed || undefined)
      if (trimmed) rememberDisplayName(trimmed)

      const parsedRoom = roomNameSchema.safeParse(trimmedRoom)
      if (!parsedRoom.success) {
        setError(
          t((parsedRoom.error.issues[0]?.message as DictKey | undefined) ?? 'home.create.errRoomName'),
        )
        setPending(false)
        busy.current = false
        return
      }

      // ★ ผ่านการตรวจทั้งหมดแล้ว — ถามยืนยันก่อนสร้างห้องจริง
      if (!(await confirm({ kind: 'create', subject: trimmedRoom }))) {
        setPending(false)
        busy.current = false
        return
      }

      const create = () =>
        apiFetch<{ room: RoomDto }>('/api/rooms', {
          method: 'POST',
          body: { name: trimmedRoom },
        })

      let room: RoomDto
      try {
        room = (await create()).room
      } catch (err) {
        // ★ session ใช้ไม่ได้ — ซ่อมให้อัตโนมัติแล้วลองใหม่หนึ่งครั้ง
        if (!(err instanceof ApiClientError) || err.code !== 'UNAUTHORIZED') throw err
        await resetSession(trimmed || undefined)
        room = (await create()).room
      }

      router.push(`/room/${room.code}`)
    } catch (err) {
      setError(errorText(err, t, 'home.create.errFailed'))
      setPending(false)
      busy.current = false
    }
    // ไม่ปลด pending ตอนสำเร็จ — กันกดซ้ำระหว่างรอเปลี่ยนหน้า
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void handleCreate()
      }}
      className="space-y-3"
    >
      <div className="relative">
        <Input
          value={roomName}
          onChange={(e) => {
            setRoomName(e.target.value)
            setError(null)
          }}
          placeholder={t('home.create.namePlaceholder')}
          maxLength={MAX}
          aria-label={t('home.create.nameLabel')}
          disabled={pending || !configured}
          invalid={Boolean(error)}
          /* ★ สีแบรนด์ตอนโฟกัส — เส้นฟ้าเริ่มต้นของคอมโพเนนต์ดูหลุดมาจากเว็บอื่น
               บนหน้าที่มีแต่แดง-ม่วง (เหตุผลเต็มอยู่ใน Input.tsx) */
          focusTone="accent"
          className="h-12 rounded-xl pe-14 text-[15px] sm:text-[15px]"
        />
        {/* ★ ตัวนับโผล่เฉพาะตอนใกล้เต็ม — โชว์ตลอดเวลาคือการเตือนเรื่องที่ยังไม่เกิด */}
        {roomName.length > MAX - 15 ? (
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-ink-faint">
            {roomName.length}/{MAX}
          </span>
        ) : null}
      </div>

      {/**
        * ★★★ ห้ามใส่ onClick ที่ปุ่มนี้ — type="submit" ยิง onSubmit ของฟอร์มอยู่แล้ว
        *
        *     เคยใส่ทั้งสองอย่าง แล้วกดครั้งเดียวเรียก handleCreate สองรอบ:
        *     รอบแรกจาก onClick รอบสองจาก submit ของเบราว์เซอร์
        *     ★ ผลคือสร้างห้องซ้ำสองห้องทุกครั้งที่กด — ผู้ใช้เจอก่อนผมเจอ
        *
        *     ★★ และ setPending(true) กันไม่ได้เลย เพราะ React อัปเดต state
        *        แบบไม่ทันที — ตอนรอบสองเริ่มทำงาน pending ยังเป็น false อยู่
        *        นี่คือเหตุผลที่ต้องมี ref กันซ้ำเพิ่มอีกชั้นข้างบน
        */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={pending}
        disabled={!ready}
        title={configured ? undefined : t('home.create.needSetup')}
        className="h-12 rounded-xl"
      >
        {t('home.create.submit')}
        <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
          <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
        </svg>
      </Button>

      {error ? (
        <p role="alert" className="text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
