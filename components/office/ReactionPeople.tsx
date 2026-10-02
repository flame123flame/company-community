'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { ChatAvatar } from './ChatAvatar'

type Who = {
  userId: string
  emoji: string
  name: string
  avatarUrl: string | null
  mine: boolean
}

/**
 * ใครกดความรู้สึกไว้บ้าง
 *
 * ★★★ จำนวนอย่างเดียวตอบคำถามผิดข้อ
 *
 *     ★ เม็ด "👍 3" บอกว่ามีสามคนเห็นด้วย ★★ แต่คำถามที่คนถามจริงในที่ทำงาน
 *       คือ "หัวหน้าเห็นหรือยัง" ไม่ใช่ "กี่คน"
 *     ★ ในห้องกลุ่มสิบคน ตัวเลข 3 แปลว่ายังมีอีกเจ็ดคนที่ยังไม่ตอบ —
 *       ★★ ซึ่งเป็นข้อมูลที่ใช้ตัดสินใจได้ก็ต่อเมื่อรู้ว่าใครคือสามคนนั้น
 *
 * ★★ โหลดตอนเปิดกล่องเท่านั้น ไม่ได้มากับรายการข้อความ
 *    ★ เหตุผลเขียนไว้ที่ route /api/office/chat/[id]/reactions แล้ว
 *      สรุปสั้น ๆ: ข้อความ 300 ใบถูกดึงใหม่ทุก 5 วินาที
 *
 * ★ กล่องนี้ถอนความรู้สึกของตัวเองได้ด้วย — แถวของเรากดได้ แถวคนอื่นกดไม่ได้
 *   ★★ คนที่เปิดกล่องมาเห็นชื่อตัวเองอยู่ในนั้น ส่วนใหญ่มาเพราะอยากถอน
 */
export function ReactionPeople({
  roomId,
  messageId,
  onClose,
  onToggle,
}: {
  roomId: string
  messageId: string
  onClose: () => void
  onToggle: (emoji: string) => void
}) {
  const ot = useOt()
  const [rows, setRows] = useState<Who[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** อีโมจิที่เลือกกรองอยู่ — null = ทั้งหมด */
  const [tab, setTab] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<{ people: Who[] }>(`/api/office/chat/${roomId}/reactions?message=${messageId}`)
      .then((d) => {
        /*
         * ★★ ทิ้งผลลัพธ์ถ้ากล่องถูกปิดไปแล้ว
         *    ★ คนกดเม็ดแล้วกดปิดทันทีเร็วกว่าคำขอจะกลับมาได้ง่ายมาก
         *      ★★ setState หลัง unmount ไม่พังอะไรใน React 19 แต่ก็ไม่มีใครดู
         */
        if (alive) setRows(d.people)
      })
      .catch((e) => {
        if (alive) setError(officeErrorText(e, ot))
      })
    return () => {
      alive = false
    }
  }, [roomId, messageId, ot])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /*
   * ★★ นับจากรายชื่อที่โหลดมา ไม่ได้รับตัวเลขมาจากฟอง
   *    ★ ถ้ารับมา สองตัวเลขจะเพี้ยนจากกันทันทีที่มีคนกดเพิ่มระหว่างที่กล่องเปิด
   */
  const counts = new Map<string, number>()
  for (const r of rows ?? []) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1)

  const shown = tab ? (rows ?? []).filter((r) => r.emoji === tab) : (rows ?? [])
  const total = rows?.length ?? 0

  return createPortal(
    <div
      className="dialog-veil fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={ot('chat.reactionsTitle', { n: total })}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog-pop w-full max-w-[380px] overflow-hidden rounded-3xl border border-line bg-elevated shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <p className="text-[15px] font-semibold text-ink">
            {ot('chat.reactionsTitle', { n: total })}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={ot('common.close')}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/*
          * ★★ แถบกรองโผล่เฉพาะตอนมีอีโมจิมากกว่าหนึ่งแบบ
          *    ★ ข้อความที่มีแต่ 👍 อย่างเดียว การมีแท็บ "ทั้งหมด" กับ "👍"
          *      ที่ให้ผลเหมือนกันเป๊ะ คือปุ่มสองปุ่มที่ไม่ได้ทำอะไรเลย
          */}
        {counts.size > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5">
            <button
              type="button"
              onClick={() => setTab(null)}
              className={cn('rx-tab', tab === null && 'rx-tab-on')}
            >
              {ot('chat.reactAll')} {total}
            </button>
            {[...counts.entries()]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([emoji, n]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setTab(emoji)}
                  className={cn('rx-tab', tab === emoji && 'rx-tab-on')}
                >
                  <span aria-hidden="true">{emoji}</span> {n}
                </button>
              ))}
          </div>
        ) : null}

        <div className="max-h-[22rem] overflow-y-auto overscroll-contain py-1.5">
          {error ? (
            <p role="alert" className="px-5 py-6 text-center text-xs text-danger">
              {error}
            </p>
          ) : rows === null ? (
            <p className="px-5 py-8 text-center text-xs text-ink-faint">{ot('common.loading')}</p>
          ) : (
            shown.map((r) => {
              /*
               * ★★★ แถวของเราเป็นปุ่ม แถวคนอื่นเป็นข้อความเฉย ๆ
               *
               *     ★ ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่คนจะกดซ้ำแล้วคิดว่าเว็บค้าง
               *       ★★ และ `<button disabled>` ก็ยังบอกว่า "ปุ่มนี้ควรกดได้
               *          แต่ตอนนี้ยังไม่ได้" ซึ่งไม่จริง — ความรู้สึกของคนอื่น
               *          ไม่มีวันกดได้
               */
              const Row = r.mine ? 'button' : 'div'
              return (
                <Row
                  key={`${r.userId}:${r.emoji}`}
                  {...(r.mine
                    ? {
                        type: 'button' as const,
                        onClick: () => {
                          onToggle(r.emoji)
                          onClose()
                        },
                        title: ot('chat.unreact'),
                      }
                    : {})}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-2.5 text-start',
                    r.mine && 'transition-colors hover:bg-surface',
                  )}
                >
                  <ChatAvatar name={r.name} url={r.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-sm text-ink">
                      {r.name}
                    </span>
                    {r.mine ? (
                      <span className="block text-[11px] text-ink-faint">
                        {ot('chat.reactMineHint')}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-lg leading-none" aria-hidden="true">
                    {r.emoji}
                  </span>
                </Row>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
