'use client'

import { useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { ChatAvatar } from './ChatAvatar'

/**
 * แผงข้อมูลกลุ่ม — เปลี่ยนชื่อ · เปลี่ยนรูป · จัดการสมาชิก · ออกจากกลุ่ม
 *
 * ★★ เป็นแผงเลื่อนเข้ามาทับห้องแชท ไม่ใช่หน้าใหม่
 *
 *    ★ การเปิดหน้าใหม่ทำให้เสียบริบทว่ากำลังคุยอยู่กับใคร และกดกลับแล้ว
 *      ต้องเลื่อนหาตำแหน่งเดิมในบทสนทนาอีกครั้ง
 *    ★★ แผงที่ทับอยู่ข้างบนปิดแล้วเจอที่เดิมเป๊ะ — เหมือนแอปแชททุกตัว
 *
 * ★ ใครก็ได้ในกลุ่มแก้ชื่อและรูปได้ แต่เอาคนอื่นออกได้เฉพาะเจ้าของกลุ่ม
 *   (กฎเดียวกับที่บังคับไว้ใน RPC — หน้าเว็บแค่ซ่อนปุ่มให้ตรงกัน)
 */

type Member = {
  id: string
  name: string
  avatarUrl: string | null
  isOwner: boolean
  isMe: boolean
}

type Person = { id: string; name: string; department: string | null }

export function ChatGroupPanel({
  roomId,
  title,
  avatarUrl,
  members,
  people,
  iAmOwner,
  onClose,
  onChanged,
  onLeft,
}: {
  roomId: string
  title: string
  avatarUrl: string | null
  members: Member[]
  people: Person[]
  iAmOwner: boolean
  onClose: () => void
  onChanged: () => void
  onLeft: () => void
}) {
  const ot = useOt()
  const confirm = useConfirm()
  const [name, setName] = useState(title)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const memberIds = new Set(members.map((m) => m.id))
  const candidates = people.filter((p) => !memberIds.has(p.id))

  async function act(body: Record<string, unknown>, okNote?: string) {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await apiFetch(`/api/office/chat/${roomId}`, { method: 'POST', body })
      onChanged()
      if (okNote) setNote(okNote)
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  async function uploadAvatar(file: File) {
    // ★ เปลี่ยนรูปกลุ่ม = แก้ข้อมูลกลุ่ม → ถามก่อน
    if (!(await confirm({ kind: 'edit', subject: title }))) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('roomId', roomId)

      const res = await fetch('/api/office/chat/upload', { method: 'POST', body: form })
      const payload = (await res.json()) as
        | { ok: true; data: { path: string } }
        | { ok: false; error: { message: string } }

      if (!payload.ok) throw new Error(payload.error.message)

      await apiFetch(`/api/office/chat/${roomId}`, {
        method: 'POST',
        body: { action: 'group', avatarPath: payload.data.path },
      })
      onChanged()
      setNote(ot('chat.saved'))
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-elevated">
      {/* หัวแผง */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={ot('common.close')}
          className="grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="m12 10.6 5-5 1.4 1.4-5 5 5 5-1.4 1.4-5-5-5 5L5.6 17l5-5-5-5L12 5.6z" />
          </svg>
        </button>
        <p className="text-[15px] font-semibold text-ink">{ot('chat.groupInfo')}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ── รูปและชื่อ ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative"
            title={ot('chat.changePhoto')}
          >
            <ChatAvatar name={title} url={avatarUrl} group size={88} />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              {ot('chat.changePhoto')}
            </span>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadAvatar(f)
              e.target.value = ''
            }}
          />

          <div className="mt-4 flex w-full max-w-sm items-center gap-2">
            <Input
              radius="round"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              aria-label={ot('chat.rename')}
            />
            <Button
              size="sm"
              loading={busy}
              disabled={!name.trim() || name.trim() === title}
              onClick={async () => {
                if (!(await confirm({ kind: 'edit', subject: name.trim() }))) return
                void act({ action: 'group', title: name.trim() }, ot('chat.saved'))
              }}
            >
              {ot('common.save')}
            </Button>
          </div>

          {note ? <p className="mt-2 text-xs text-accent">{note}</p> : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>

        {/* ── สมาชิก ─────────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">
            {ot('chat.members')} <span className="text-ink-faint">{members.length}</span>
          </p>
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            {ot('chat.addMembers')}
          </Button>
        </div>

        {adding ? (
          <div className="mt-2 rounded-2xl border border-line bg-surface/60 p-3">
            {candidates.length === 0 ? (
              <p className="text-xs text-ink-faint">{ot('common.empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'create', subject: p.name }))) return
                      void act({ action: 'addMembers', members: [p.id] })
                    }}
                    className="h-10 sm:h-8 rounded-full bg-elevated px-3 text-xs text-ink-soft transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-50"
                  >
                    + <span dir="auto">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <ul className="mt-2 flex flex-col">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-line/60 py-2.5">
              <ChatAvatar name={m.name} url={m.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">
                  {m.name}
                  {m.isMe ? <span className="ms-1 text-xs text-ink-faint">({ot('room.you')})</span> : null}
                </span>
                {m.isOwner ? (
                  <span className="block text-[11px] text-accent">{ot('chat.owner')}</span>
                ) : null}
              </span>

              {/* ★ ปุ่มเอาออกโผล่เฉพาะเจ้าของกลุ่ม และไม่โผล่กับตัวเอง
                  — ตัวเองใช้ปุ่ม "ออกจากกลุ่ม" ซึ่งเป็นคนละเรื่อง */}
              {iAmOwner && !m.isMe ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !(await confirm({
                        kind: 'delete',
                        subject: m.name,
                        message: ot('chat.removeConfirm', { name: m.name }),
                      }))
                    )
                      return
                    void act({ action: 'removeMember', userId: m.id })
                  }}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  {ot('chat.removeMember')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <Button
          variant="ghost"
          className={cn('mt-6 w-full text-danger')}
          onClick={async () => {
            if (!(await confirm({ kind: 'leave', subject: title, message: ot('chat.leaveConfirm') })))
              return
            void apiFetch(`/api/office/chat/${roomId}`, { method: 'POST', body: { action: 'leave' } })
              .then(onLeft)
              .catch((e: unknown) =>
                setError(officeErrorText(e, ot)),
              )
          }}
        >
          {ot('chat.leave')}
        </Button>
      </div>
    </div>
  )
}
