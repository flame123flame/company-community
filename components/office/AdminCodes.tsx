'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import type { EmployeeCodeStatus } from '@/types/database'

type Row = {
  code: string
  status: EmployeeCodeStatus
  claimedBy: string | null
  claimedName: string | null
  claimedAt: string | null
}

/** หน้าจัดการรหัสพนักงาน (FR-X09 · หัวข้อ 8.6) */
export function AdminCodes() {
  const ot = useOt()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [newCode, setNewCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Row[] }>('/api/office/admin/codes')
      setRows(data.items)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addCodes(codes: string[]) {
    if (codes.length === 0) return
    /* ★ ชื่อในกล่องยืนยัน = รหัสสามตัวแรก + จำนวนที่เหลือ (นำเข้า CSV ทีละมาก ๆ) */
    const subject = codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : '')
    if (!(await confirm({ kind: 'create', subject }))) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await apiFetch<{ added: number }>('/api/office/admin/codes', {
        method: 'POST',
        body: { codes },
      })
      setMessage(ot('admin.codes.imported', { n: res.added }))
      setNewCode('')
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(code: string, status: EmployeeCodeStatus) {
    /* ★ ปิดรหัส (ลาออก) = เสี่ยง · เปิดกลับ = แก้ไข */
    const who = rows.find((r) => r.code === code)?.claimedName
    if (!(await confirm({ kind: status === 'RESIGNED' ? 'danger' : 'edit', subject: who ? `${code} · ${who}` : code }))) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/admin/codes', { method: 'PATCH', body: { code, status } })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  /**
   * อ่าน CSV ที่มีคอลัมน์รหัสพนักงานคอลัมน์เดียว
   *
   * ★ ไม่ใช้ไลบรารี CSV เพราะรูปแบบที่รับคือ "หนึ่งรหัสต่อบรรทัด" เท่านั้น
   *   ★ ตัดคอมมาและเครื่องหมายคำพูดทิ้งเผื่อคนบันทึกจาก Excel ซึ่งมักได้
   *     `EMP001,` หรือ `"EMP001"` ติดมาด้วย — ถ้าไม่ตัด รหัสจะผิดรูปทั้งไฟล์
   *   ★ ข้ามบรรทัดหัวตารางที่เขียนว่า code/รหัสพนักงาน ให้อัตโนมัติ
   */
  async function importCsv(file: File) {
    const text = await file.text()
    const codes = text
      .split(/\r?\n/)
      .map((line) => line.split(',')[0] ?? '')
      .map((c) => c.replace(/["']/g, '').trim().toUpperCase())
      .filter(Boolean)
      .filter((c) => c !== 'CODE' && c !== 'รหัสพนักงาน' && c !== 'EMPLOYEE_CODE')

    await addCodes(codes)
    if (fileRef.current) fileRef.current.value = ''
  }

  const filtered = rows.filter(
    (r) =>
      !query ||
      r.code.includes(query.toUpperCase()) ||
      (r.claimedName ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  const claimed = rows.filter((r) => r.claimedBy).length

  return (
    <div className="py-2">
      <p className="mt-1 text-sm text-ink-soft">
        {ot('admin.codes.summary', {
          all: rows.length,
          claimed,
          free: rows.length - claimed,
        })}
      </p>

      {/* ── เพิ่มรหัส ─────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {ot('admin.codes.add')}
          </span>
          <Input radius="round"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="EMP001"
            className="font-mono tracking-wider"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addCodes([newCode])
            }}
          />
        </label>

        <Button onClick={() => void addCodes([newCode])} loading={busy} disabled={!newCode.trim()}>
          {ot('admin.codes.add')}
        </Button>

        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {ot('admin.codes.import')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importCsv(f)
          }}
        />

        {/* ★ ไฟล์ตัวอย่างสร้างในเครื่อง ไม่ต้องมีไฟล์จริงบนเซิร์ฟเวอร์ */}
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent('code\nEMP001\nEMP002\nEMP003\n')}`}
          download="employee-codes-template.csv"
          className="text-sm text-link hover:underline"
        >
          {ot('admin.codes.template')}
        </a>
      </div>

      {message ? <p className="mt-3 text-sm text-ink-soft">{message}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── ตาราง ────────────────────────────────────────────────── */}
      <div className="mt-5">
        <Input radius="round"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ot('common.search')}
          className="max-w-xs"
        />
      </div>

      <div className="mt-3 overflow-x-auto rounded-(--radius-card) border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-start text-xs text-ink-soft">
            <tr>
              <Th>{ot('admin.codes.code')}</Th>
              <Th>{ot('admin.codes.user')}</Th>
              <Th>{ot('admin.codes.claimed')}</Th>
              <Th>{ot('admin.codes.status')}</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-faint">
                  {ot('common.empty')}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.code} className="border-t border-line">
                  <Td className="font-mono tracking-wider">{row.code}</Td>
                  <Td className="text-ink-soft">{row.claimedName ?? '—'}</Td>
                  <Td>
                    <Badge tone={row.claimedBy ? 'ok' : 'muted'}>
                      {row.claimedBy ? ot('admin.codes.claimedYes') : ot('admin.codes.unclaimed')}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={row.status === 'ACTIVE' ? 'ok' : 'danger'}>
                      {row.status === 'ACTIVE'
                        ? ot('admin.codes.active')
                        : ot('admin.codes.resigned')}
                    </Badge>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant={row.status === 'ACTIVE' ? 'danger' : 'secondary'}
                      disabled={busy}
                      onClick={() =>
                        void setStatus(row.code, row.status === 'ACTIVE' ? 'RESIGNED' : 'ACTIVE')
                      }
                    >
                      {row.status === 'ACTIVE'
                        ? ot('admin.codes.resigned')
                        : ot('admin.codes.active')}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ★ เตือนให้ชัดว่าปุ่ม "ลาออก" ทำอะไรมากกว่าเปลี่ยนป้าย
          เพราะมันระงับบัญชีคนนั้นทันที ซึ่งกู้คืนได้แต่ทำให้ตกใจได้ */}
      <p className="mt-3 text-xs text-ink-faint">
        {ot('admin.codes.resignedHint', { resigned: ot('admin.codes.resigned') })}
      </p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-start font-medium">{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5 text-ink', className)}>{children}</td>
}

function Badge({ tone, children }: { tone: 'ok' | 'muted' | 'danger'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs',
        tone === 'ok' && 'bg-surface text-ink',
        tone === 'muted' && 'bg-surface text-ink-faint',
        tone === 'danger' && 'bg-danger/15 text-danger',
      )}
    >
      {children}
    </span>
  )
}
