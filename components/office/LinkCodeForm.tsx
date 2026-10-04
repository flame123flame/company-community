'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
import { Input } from '@/components/ui/Input'
import { useOt } from '@/lib/i18n/office'

/**
 * ฟอร์มผูกรหัสพนักงาน (FR-X02)
 *
 * ★★ ไม่ตรวจว่า "รหัสนี้มีจริงไหม" ฝั่ง client แม้แต่นิดเดียว
 *
 *    ทำได้ง่าย ๆ ด้วยการยิง API ตอนพิมพ์ แล้วขึ้นติ๊กถูกให้ดูดี
 *    ★ แต่นั่นคือการสร้างเครื่องมือไล่เดารหัสพนักงานให้คนร้ายฟรี ๆ —
 *      พิมพ์ไปเรื่อย ๆ แล้วดูว่าอันไหนขึ้นติ๊กถูก
 *
 *    ★★ ตรวจตอนกดส่งครั้งเดียว และหักโควตาทุกครั้ง (5 ครั้ง/15 นาที)
 *       เป็นราคาที่ต้องจ่ายเพื่อให้ด่านเข้าระบบมีความหมายจริง
 */

type Props = {
  defaultDisplayName: string
  defaultNickname: string | null
  defaultDepartment: string | null
}

export function LinkCodeForm({ defaultDisplayName, defaultNickname, defaultDepartment }: Props) {
  const ot = useOt()
  const router = useRouter()
  const confirm = useConfirm()
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState(defaultDisplayName)
  const [nickname, setNickname] = useState(defaultNickname ?? '')
  const [department, setDepartment] = useState(defaultDepartment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    /* ★ ผูกรหัสพนักงานกับบัญชี — ถามก่อน (ช่องว่างถูกเบราว์เซอร์กันไว้แล้วด้วย required) */
    if (!(await confirm({ kind: 'create', subject: code.trim() || undefined }))) return

    setBusy(true)
    setError(null)

    try {
      const response = await fetch('/api/office/employee-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          displayName,
          nickname: nickname.trim() || null,
          department: department.trim() || null,
        }),
      })

      const payload = (await response.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } }

      if (!payload.ok) {
        setError(payload.error.message)
        return
      }

      /*
       * ★ refresh() ไม่ใช่ push() — ด่านอยู่ใน layout ซึ่งเป็น Server Component
       *   ต้องให้ server วาดใหม่เพื่ออ่าน employee_code ที่เพิ่งเขียน
       *   ★ push('/office') อย่างเดียวจะได้หน้าเดิมจากแคชฝั่ง client
       *     แล้วผู้ใช้จะเห็นหน้า "ต้องผูกรหัส" ค้างอยู่ทั้งที่ผูกสำเร็จแล้ว
       */
      router.replace('/')
      router.refresh()
    } catch {
      setError(ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={ot('link.code')} hint={ot('link.codeHint')} required>
        <Input radius="round"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="EMP001"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          invalid={Boolean(error)}
          focusTone="accent"
          className="font-mono tracking-wider"
        />
      </Field>

      <Field label={ot('link.displayName')} required>
        <Input radius="round"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ot('link.nickname')} hint={ot('link.optional')}>
          <Input radius="round" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
        </Field>
        <Field label={ot('link.department')} hint={ot('link.optional')}>
          <Input radius="round"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            maxLength={60}
            placeholder="IT"
          />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={busy} block>
        {busy ? ot('link.working') : ot('link.submit')}
      </Button>
    </form>
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
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ms-0.5 text-accent">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </label>
  )
}
