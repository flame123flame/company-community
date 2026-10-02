'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/AppHeader'
import { roleLabelKey } from '@/lib/room/permissions'
import { cn } from '@/lib/cn'
import type { MemberRole } from '@/types/database'
import { useT } from '@/lib/i18n/client'

/**
 * รายชื่อคนในห้อง — กดที่ตัวเลขบนหัวจอแล้วกางออกมา
 *
 * ★ ทำไมเป็น dropdown ไม่ใช่แถบถาวรข้างจอ
 *
 *   พื้นที่ทั้งสองฝั่งถูกจองไว้แล้ว (player ซ้าย · คิวเพลงขวา) ตามเลย์เอาต์
 *   watch page ของ YouTube การแทรกคอลัมน์ที่สามจะทำให้ player แคบลง
 *   เพื่อข้อมูลที่ผู้ใช้อยากรู้เป็นครั้งคราว ไม่ใช่ตลอดเวลา
 *
 *   ตัวเลข "กี่คนกำลังฟัง" ยังอยู่บนจอเสมอเหมือนเดิม แค่กดได้แล้ว
 *
 * ★★★ โชว์เฉพาะคนที่อยู่ในห้องตอนนี้ ไม่โชว์ "เคยเข้าห้อง" อีกแล้ว
 *
 *     เดิมมีสองกลุ่ม: กำลังฟังอยู่ (จาก presence) กับเคยเข้าห้อง (จาก room_members)
 *     ★ ปัญหาคือกลุ่มหลังโตขึ้นเรื่อย ๆ ไม่มีวันหด — ห้องที่เปิดมาสองอาทิตย์
 *       มีรายชื่อยาวสามสิบคนที่ไม่มีใครอยู่แล้วสักคน
 *
 *     ★★ และมันตอบคำถามผิดข้อ คนกดปุ่มนี้เพราะอยากรู้ว่า "ตอนนี้ใครอยู่บ้าง"
 *        ไม่ใช่ "ใครเคยแวะมาบ้าง" — รายชื่อคนที่ไม่อยู่แล้วจึงเป็นเสียงรบกวน
 *        ที่ดันสิ่งที่อยากรู้จริงให้ต้องเลื่อนหา
 *
 *     ข้อมูลยังอยู่ครบในฐานข้อมูล แค่ไม่เอามาแสดงตรงนี้
 */

export type Listener = {
  userId: string
  displayName: string
  avatarUrl: string | null
  /** ฉายา — โชว์ต่อท้ายบทบาท ถ้ามี */
  nickname: string | null
  /** null = ยังไม่รู้บทบาท (เพิ่งเข้ามา ข้อมูลสมาชิกยังตามมาไม่ถึง) */
  role: MemberRole | null
  /** ลัดคิว/ข้ามเพลงได้ไหม (เจ้าของห้อง = true เสมอ) */
  canSkip: boolean
  /** เปิดหน้าห้องค้างอยู่ตอนนี้ไหม (จาก presence) */
  online: boolean
  isMe: boolean
}

export function ListenersPanel({
  listeners,
  canTransfer = false,
  transferringTo = null,
  onTransfer,
  onSetSkip,
  savingSkipFor = null,
}: {
  listeners: Listener[]
  /** ผู้ใช้ปัจจุบันเป็นเจ้าของห้อง → ยกตำแหน่งให้คนอื่นได้ และแจกสิทธิ์ลัดคิวได้ */
  canTransfer?: boolean
  /** userId ที่กำลังโอนให้อยู่ (กันกดซ้ำ) */
  transferringTo?: string | null
  onTransfer?: (userId: string, displayName: string) => void
  /** เจ้าของห้องมอบ/ถอนสิทธิ์ลัดคิว */
  onSetSkip?: (userId: string, displayName: string, allow: boolean) => void
  savingSkipFor?: string | null
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  /* ★ กรองที่นี่ที่เดียว — ข้างล่างไม่มีใครต้องรู้จักคนออฟไลน์อีกเลย */
  const online = listeners.filter((l) => l.online)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    // ★ capture phase ด้วยเหตุผลเดียวกับใน AppHeader:
    //   แถวที่ถูกกดอาจหายไปจาก DOM ก่อนที่ handler นี้จะได้ตรวจ
    //   (เช่นกดยกตำแหน่งแล้วปุ่มนั้นหายไปเพราะคนนั้นกลายเป็นเจ้าของ)
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('touchstart', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t('listeners.open', { n: online.length })}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
          open ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
        )}
      >
        <PeopleIcon className="size-5" />
        <span className="tabular-nums">{online.length}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('listeners.title')}
          // ★ กว้าง 300px แบบเมนูของ YouTube · ชิดขวาเพราะปุ่มอยู่มุมขวา
          className="absolute end-0 top-[calc(100%+8px)] z-50 w-[300px] overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-medium">{t('listeners.title')}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {t('common.listeners', { n: online.length })}
            </p>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto py-1">
            {online.map((l) => (
              <Row
                key={l.userId}
                listener={l}
                canTransfer={canTransfer}
                transferring={transferringTo === l.userId}
                onTransfer={onTransfer}
                onSetSkip={onSetSkip}
                savingSkip={savingSkipFor === l.userId}
              />
            ))}

            {online.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-soft">{t('listeners.empty')}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({
  listener,
  canTransfer = false,
  transferring = false,
  onTransfer,
  onSetSkip,
  savingSkip = false,
}: {
  listener: Listener
  canTransfer?: boolean
  transferring?: boolean
  onTransfer?: (userId: string, displayName: string) => void
  onSetSkip?: (userId: string, displayName: string, allow: boolean) => void
  savingSkip?: boolean
}) {
  const t = useT()
  /**
   * ★ ยกตำแหน่งให้ได้เฉพาะ "คนอื่นที่ยังอยู่ในห้อง"
   *
   *   ตัวเอง   — ยกให้ตัวเองไม่มีความหมาย
   *   ★ ไม่ต้องเช็ก online แล้ว เพราะรายการนี้มีแต่คนที่อยู่ในห้องตอนนี้
   *     (เงื่อนไขที่เป็นจริงเสมอคือเงื่อนไขที่หลอกคนอ่านว่ามันยังทำงานอยู่)
   */
  const mayHandOver = canTransfer && !listener.isMe

  /** ★ เจ้าของห้องมีสิทธิ์นี้อยู่แล้วโดยนิยาม จึงไม่มีสวิตช์ให้กด */
  const maySetSkip = canTransfer && !listener.isMe && listener.role !== 'OWNER'

  return (
    <div className="px-2 py-1">
      <div className="rounded-2xl px-2 py-2 transition-colors hover:bg-surface">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar
              userId={listener.userId}
              name={listener.displayName}
              avatarUrl={listener.avatarUrl}
              size={36}
            />
            {/* ★ จุดเขียว = เปิดหน้าห้องค้างอยู่จริงตอนนี้ */}
            <span
              className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-elevated bg-[#2ba640]"
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p dir="auto" className="truncate text-sm font-medium">
              <span dir="auto">{listener.displayName}</span>
              {listener.isMe ? (
                <span className="font-normal text-ink-faint"> {t('listeners.you')}</span>
              ) : null}
            </p>
            {listener.role ? (
              <p className="truncate text-xs text-ink-soft">
                {listener.nickname ? <span dir="auto">{listener.nickname} · </span> : ''}
                {t(roleLabelKey(listener.role))}
              </p>
            ) : null}
          </div>

          {listener.role === 'OWNER' ? (
            /* ★ มงกุฎ + คำว่าเจ้าของ — ไอคอนอย่างเดียวคนต้องเดา คำอย่างเดียวจืด */
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/12 px-2 py-1 text-[11px] font-medium text-accent">
              <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
                <path d="M5 16 3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
              </svg>
              {t('listeners.owner')}
            </span>
          ) : mayHandOver ? (
            <button
              type="button"
              onClick={() => onTransfer?.(listener.userId, listener.displayName)}
              disabled={transferring}
              aria-label={t('listeners.transferTo', { name: listener.displayName })}
              title={t('listeners.makeHost')}
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-soft',
                'transition-colors hover:border-accent hover:text-accent disabled:opacity-50',
              )}
            >
              {/**
                * ★★ เปลี่ยนจากปุ่มข้อความ "ยกให้" เป็นไอคอนมงกุฎ
                *
                *    คำว่า "ยกให้" ลอย ๆ ไม่ได้บอกว่ายกอะไรให้ใคร — คนถึงงง
                *    ★ มงกุฎบอกเรื่องเดียวกันโดยไม่ต้องแปล และกดแล้วมีกล่อง
                *      อธิบายเต็ม ๆ ตามมาอยู่แล้ว (TransferOwnerDialog)
                *
                *    ★ ยังมี title กับ aria-label เป็นคำเต็มไว้ให้คนที่ต้องการ
                */}
              {transferring ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                  <path d="M5 16 3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
                </svg>
              )}
            </button>
          ) : null}
        </div>

        {/**
          * ★★★ แถวสิทธิ์ออกแบบใหม่ทั้งแถว
          *
          *     ของเดิมเป็นสวิตช์เล็ก ๆ กับคำว่า "ลัดคิว / ข้ามเพลงได้"
          *     ★ อ่านไม่ออกว่าตอนนี้ "เปิดอยู่" หรือ "กดเพื่อเปิด" —
          *       เพราะข้อความไม่เปลี่ยนตามสถานะเลย มีแต่สวิตช์ที่เล็กมาก
          *
          *     ★★ ของใหม่ให้ข้อความเป็นตัวบอกสถานะ:
          *        เปิดอยู่ → "ข้ามเพลงได้"  ·  ปิดอยู่ → "ฟังอย่างเดียว"
          *        อ่านแล้วรู้ทันทีว่าตอนนี้เป็นยังไง ไม่ต้องตีความสวิตช์
          *
          *     และทั้งแถบกดได้ ไม่ใช่เฉพาะสวิตช์ — เป้ากดใหญ่ขึ้นสามเท่า
          *     ซึ่งสำคัญมากบนมือถือที่นิ้วกว้างกว่าสวิตช์ 28px อยู่แล้ว
          */}
        {maySetSkip ? (
          <button
            type="button"
            role="switch"
            aria-checked={listener.canSkip}
            disabled={savingSkip}
            onClick={() => onSetSkip?.(listener.userId, listener.displayName, !listener.canSkip)}
            aria-label={t('listeners.toggleSkip', {
              action: listener.canSkip ? t('listeners.revoke') : t('listeners.grant'),
              name: listener.displayName,
            })}
            title={t('perm.skipHint')}
            className={cn(
              'mt-2 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start transition-colors',
              'disabled:opacity-50',
              listener.canSkip
                ? 'border-accent/35 bg-accent/10 hover:bg-accent/15'
                : 'border-line hover:border-line-strong hover:bg-elevated',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-lg transition-colors',
                listener.canSkip ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-faint',
              )}
            >
              {/* ★ ไอคอนข้ามเพลง — ตรงกับปุ่มข้ามจริงในห้อง คนจึงโยงได้เอง */}
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </span>

            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate text-[13px] font-medium',
                  listener.canSkip ? 'text-ink' : 'text-ink-soft',
                )}
              >
                {savingSkip
                  ? t('listeners.saving')
                  : listener.canSkip
                    ? t('perm.skipOn')
                    : t('perm.skipOff')}
              </span>
            </span>

            {/* สวิตช์ยังอยู่ แต่เป็นตัวยืนยันสถานะ ไม่ใช่ตัวเดียวที่บอกสถานะ */}
            <span
              aria-hidden="true"
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                listener.canSkip ? 'bg-accent' : 'bg-line-strong',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-white transition-all',
                  listener.canSkip ? 'start-[18px]' : 'start-0.5',
                )}
              />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9 13c-2.2 0-6.5 1.1-6.5 3.3V19h13v-2.7C15.5 14.1 11.2 13 9 13zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.5 2.2c1.1.8 1.9 1.8 1.9 3.1V19H22v-2.7c0-1.8-2.9-2.8-5.5-3.1zM15 11a3.5 3.5 0 1 0-1.1-6.8 5.5 5.5 0 0 1 0 6.6c.36.13.73.2 1.1.2z" />
    </svg>
  )
}
