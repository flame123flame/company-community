'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ConfirmProvider'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { departmentLabel } from '@/lib/office/departments'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import type { AccountStatus } from '@/types/database'

type Row = {
  id: string
  displayName: string
  nickname: string | null
  username: string | null
  department: string | null
  employeeCode: string | null
  isAdmin: boolean
  accountStatus: AccountStatus
  createdAt: string
  /* ── ข้อมูลจากฟอร์มสมัคร (0041) ── */
  prefix: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  company: string | null
  position: string | null
  purpose: string | null
  termsAcceptedAt: string | null
}

/** หน้าจัดการผู้ใช้งาน (FR-X09 · หัวข้อ 8.6) */
export function AdminUsers({ selfId }: { selfId: string }) {
  const ot = useOt()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** รหัสชั่วคราวที่เพิ่งสร้าง — แสดงครั้งเดียวแล้วหายเมื่อรีเฟรช */
  const [temp, setTemp] = useState<{ id: string; password: string } | null>(null)
  /** แถวที่กางรายละเอียดอยู่ — ทีละแถวเท่านั้น */
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Row[] }>('/api/office/admin/users')
      setRows(data.items)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, body: Record<string, unknown>) {
    /*
     * ★ ถามก่อนทุกการกระทำกับบัญชีผู้ใช้ — รวมไว้ที่นี่ที่เดียว เมนูและฟอร์มเรียกมาที่นี่หมด
     *   ★★ รีเซ็ตรหัส · ให้/ถอดสิทธิ์ admin · ระงับบัญชี = danger · คืนสถานะ/แก้ข้อมูล = edit
     */
    const row = rows.find((r) => r.id === id)
    const name = row ? row.nickname || row.displayName : undefined
    const label =
      body.action === 'resetPassword'
        ? ot('admin.users.resetPassword')
        : body.action === 'admin'
          ? body.isAdmin
            ? ot('admin.users.makeAdmin')
            : ot('admin.users.removeAdmin')
          : body.action === 'status'
            ? body.status === 'SUSPENDED'
              ? ot('admin.users.suspend')
              : ot('admin.users.restore')
            : null
    const kind = body.action === 'profile' || (body.action === 'status' && body.status === 'ACTIVE') ? 'edit' : 'danger'
    const ok = await confirm(
      label
        ? { kind, subject: name, title: name ? `${label} · ${name}` : label, confirmLabel: label }
        : { kind, subject: name },
    )
    if (!ok) return
    setBusy(id)
    setError(null)
    try {
      const res = await apiFetch<{ tempPassword?: string }>('/api/office/admin/users', {
        method: 'POST',
        body: { userId: id, ...body },
      })
      if (res.tempPassword) setTemp({ id, password: res.tempPassword })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  const filtered = rows.filter((r) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      r.displayName.toLowerCase().includes(q) ||
      (r.nickname ?? '').toLowerCase().includes(q) ||
      (r.employeeCode ?? '').toLowerCase().includes(q) ||
      (r.department ?? '').toLowerCase().includes(q) ||
      /* ★ เพิ่ม username · เบอร์โทร · บริษัท — Admin มักค้นจากสิ่งที่
         ผู้ใช้บอกมาทางโทรศัพท์ ซึ่งไม่ค่อยใช่ชื่อที่ตั้งไว้ในระบบ */
      (r.username ?? '').toLowerCase().includes(q) ||
      (r.phone ?? '').includes(q) ||
      (r.company ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="page-wide py-2">
      <p className="mt-1 text-sm text-ink-soft">{ot('admin.users.count', { n: rows.length })}</p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {temp ? (
        <div className="mt-4 rounded-(--radius-card) border border-warn/40 bg-warn/10 p-4">
          <p className="text-sm font-medium text-ink">{ot('admin.users.tempPassword')}</p>
          <p className="mt-1 font-mono text-lg tracking-wider text-ink">{temp.password}</p>
          {/* ★ บอกให้ชัดว่ามันโผล่ครั้งเดียว — ถ้าปิดไปแล้วต้องรีเซ็ตใหม่
              เพราะเราไม่เก็บรหัสนี้ไว้ที่ไหนเลยโดยตั้งใจ */}
          <p className="mt-2 text-xs text-ink-soft">
            {ot('admin.users.tempPasswordHint')}
          </p>
          <Button size="sm" className="mt-3" onClick={() => setTemp(null)}>
            {ot('common.close')}
          </Button>
        </div>
      ) : null}

      <div className="mt-5">
        <Input radius="round"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ot('admin.users.search')}
          className="max-w-md"
        />
      </div>

      <div className="chat-shell mt-3 overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-surface text-xs text-ink-soft">
            <tr>
              <Th>{ot('admin.users.colName')}</Th>
              <Th>{ot('admin.codes.code')}</Th>
              <Th>{ot('admin.users.colDept')}</Th>
              <Th>{ot('admin.users.colStatus')}</Th>
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
              filtered.map((row) => {
                const self = row.id === selfId
                return (
                  <Fragment key={row.id}>
                  <tr className="border-t border-line">
                    {/* ★★ ชื่อกับ username ซ้อนกันในช่องเดียว
                        ★ สองอย่างนี้ตอบคำถามเดียวกันคือ "คนนี้คือใคร"
                          ★★ แยกคอลัมน์แปลว่ากินความกว้างสองเท่าเพื่อข้อมูล
                             ที่ตาอ่านพร้อมกันอยู่แล้ว */}
                    <Td>
                      <span className="block font-medium text-ink">
                        {row.nickname || row.displayName}
                        {self ? <span className="ms-1 text-xs text-ink-faint">{ot('admin.users.you')}</span> : null}
                      </span>
                      {row.username ? (
                        <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                          @{row.username}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-ink-soft">
                      {row.employeeCode ?? '—'}
                    </Td>
                    <Td className="text-ink-soft">
                      <span dir="auto">{departmentLabel(ot, row.department) ?? '—'}</span>
                    </Td>
                    {/* ★ บทบาทกับสถานะรวมช่องเดียว — ทั้งคู่เป็นป้ายสั้น ๆ
                        ★★ และ whitespace-nowrap กัน "ใช้งาน" ถูกตัดเป็นสองบรรทัด */}
                    <Td className="whitespace-nowrap">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={row.accountStatus === 'ACTIVE' ? 'ok' : 'danger'}>
                          {row.accountStatus === 'ACTIVE'
                  ? ot('admin.users.statusActive')
                  : ot('admin.users.statusSuspended')}
                        </Badge>
                        {row.isAdmin ? <Badge tone="accent">Admin</Badge> : null}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-end">
                      {/*
                        * ★★★ ปุ่มหลักหนึ่งปุ่ม ที่เหลืออยู่ในเมนู
                        *
                        *     ★ เดิมวางสี่ปุ่มเรียงกันในช่องเดียว ★★ พอชื่อฝ่ายยาว
                        *       ช่องนี้ถูกบีบจนปุ่มตกลงไปบรรทัดที่สอง แถวสูงขึ้น
                        *       และตารางอ่านเป็นกองปุ่มมากกว่ารายชื่อคน
                        *     ★ "ดูข้อมูล" เป็นสิ่งที่กดบ่อยที่สุด จึงอยู่ข้างนอก
                        *       ★★ ส่วนระงับ/รีเซ็ต/สิทธิ์ เป็นของที่กดนาน ๆ ครั้ง
                        *          และกดผิดแล้วเดือดร้อน — อยู่ในเมนูจึงปลอดภัยกว่า
                        */}
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenId(openId === row.id ? null : row.id)}
                        >
                          {openId === row.id ? ot('common.close') : ot('admin.users.detail')}
                        </Button>

                        <RowMenu
                          row={row}
                          self={self}
                          busy={busy === row.id}
                          onAct={(body) => act(row.id, body)}
                        />
                      </span>
                    </Td>
                  </tr>

                  {openId === row.id ? (
                    <tr key={`${row.id}-detail`} className="border-t border-line bg-surface/40">
                      <td colSpan={5} className="px-4 py-4">
                        <UserDetail
                          row={row}
                          busy={busy === row.id}
                          onSave={(patch) => act(row.id, { action: 'profile', ...patch })}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * รายละเอียดผู้ใช้หนึ่งคน + แก้ไขได้ในที่
 *
 * ★★ แก้ตรงนี้เลย ไม่เด้งไปหน้าอื่น
 *    ★ Admin ที่กำลังไล่ตรวจคนสมัครเข้ามาสิบคน ต้องการแก้ชื่อที่พิมพ์ผิด
 *      แล้วไปคนถัดไป ★★ การเปิดหน้าใหม่แล้วกดกลับทุกครั้งทำให้เสียตำแหน่ง
 *      ที่ไล่อ่านมา และต้องค้นหาใหม่ทุกคน
 *
 * ★ ช่องที่แก้ไม่ได้ (username · รหัสพนักงาน) แสดงเป็นข้อความ ไม่ใช่ช่องกรอก
 *   ที่กดไม่ได้ ★★ ช่องเทา ๆ ที่พิมพ์ไม่ได้ชวนให้คนพยายามพิมพ์แล้วสงสัยว่าพัง
 */
/**
 * เมนูจัดการผู้ใช้หนึ่งคน
 *
 * ★★ ของที่กดผิดแล้วเดือดร้อนไม่ควรอยู่เป็นปุ่มเปล่าในตาราง
 *    ★ ระงับบัญชี · รีเซ็ตรหัสผ่าน · ให้สิทธิ์ผู้ดูแล — สามอย่างนี้กดนาน ๆ ครั้ง
 *      ★★ แต่ถ้าวางเรียงไว้ มือจะพลาดไปโดนตอนกวาดสายตาหาแถวที่ต้องการ
 *    ★ ซ่อนไว้หนึ่งชั้นทำให้ต้องตั้งใจกดจริง โดยไม่ได้ทำให้หายาก
 */
function RowMenu({
  row,
  self,
  busy,
  onAct,
}: {
  row: Row
  self: boolean
  busy: boolean
  onAct: (body: Record<string, unknown>) => void | Promise<void>
}) {
  const ot = useOt()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (body: Record<string, unknown>) => {
    setOpen(false)
    void onAct(body)
  }

  return (
    <span ref={boxRef as never} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ot('chat.menu')}
        className={cn(
          'grid size-8 place-items-center rounded-full text-ink-soft transition-colors',
          open ? 'bg-surface text-ink' : 'hover:bg-surface hover:text-ink',
          busy && 'opacity-40',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 z-40 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-elevated text-start shadow-xl"
        >
          <MenuItem onClick={() => run({ action: 'resetPassword' })}>
            {ot('admin.users.resetPassword')}
          </MenuItem>

          <MenuItem onClick={() => run({ action: 'admin', isAdmin: !row.isAdmin })}>
            {row.isAdmin ? ot('admin.users.removeAdmin') : ot('admin.users.makeAdmin')}
          </MenuItem>

          {/* ★ ปุ่มที่ใช้กับตัวเองไม่ได้ ไม่ต้องมีให้กด — RPC ปฏิเสธอยู่แล้ว
              ★★ แต่ปุ่มที่กดแล้วได้ error คือปุ่มที่ไม่ควรแสดงตั้งแต่แรก */}
          {!self ? (
            <MenuItem
              tone="danger"
              onClick={() =>
                run({
                  action: 'status',
                  status: row.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                })
              }
            >
              {row.accountStatus === 'ACTIVE'
                ? ot('admin.users.suspend')
                : ot('admin.users.restore')}
            </MenuItem>
          ) : null}
        </div>
      ) : null}
    </span>
  )
}

function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: 'danger'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'block w-full px-4 py-2.5 text-start text-sm transition-colors',
        tone === 'danger'
          ? 'text-danger hover:bg-danger/10'
          : 'text-ink hover:bg-surface',
      )}
    >
      {children}
    </button>
  )
}

function UserDetail({
  row,
  busy,
  onSave,
}: {
  row: Row
  busy: boolean
  onSave: (patch: Record<string, string>) => void | Promise<void>
}) {
  const ot = useOt()
  const [prefix, setPrefix] = useState(row.prefix ?? '')
  const [firstName, setFirstName] = useState(row.firstName ?? '')
  const [lastName, setLastName] = useState(row.lastName ?? '')
  const [phone, setPhone] = useState(row.phone ?? '')
  const [company, setCompany] = useState(row.company ?? '')
  const [department, setDepartment] = useState(row.department ?? '')
  const [position, setPosition] = useState(row.position ?? '')

  const dirty =
    prefix !== (row.prefix ?? '') ||
    firstName !== (row.firstName ?? '') ||
    lastName !== (row.lastName ?? '') ||
    phone !== (row.phone ?? '') ||
    company !== (row.company ?? '') ||
    department !== (row.department ?? '') ||
    position !== (row.position ?? '')

  return (
    <div className="flex flex-col gap-4">
      {/* ── ของที่แก้ไม่ได้ ───────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-ink-soft">
        <span>
          Username <span className="font-mono text-ink">{row.username ?? '—'}</span>
        </span>
        <span>
          {ot('admin.codes.code')}{' '}
          <span className="font-mono text-ink">{row.employeeCode ?? '—'}</span>
        </span>
        <span>
          {ot('admin.users.registeredAt')}{' '}
          <span className="text-ink">
            {new Date(row.createdAt).toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </span>
      </div>

      {row.purpose ? (
        <div className="rounded-xl border border-line bg-elevated/50 p-3">
          <p className="text-[11px] text-ink-faint">{ot('admin.users.purpose')}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink">{row.purpose}</p>
        </div>
      ) : null}

      {/* ── ของที่แก้ได้ ──────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label={ot('reg.prefix')} value={prefix} onChange={setPrefix} max={20} />
        <Mini label={ot('reg.firstName')} value={firstName} onChange={setFirstName} max={60} />
        <Mini label={ot('reg.lastName')} value={lastName} onChange={setLastName} max={60} />
        <Mini label={ot('admin.users.phone')} value={phone} onChange={setPhone} max={30} />
        <Mini label={ot('admin.users.company')} value={company} onChange={setCompany} max={80} />
        <Mini label={ot('reg.department')} value={department} onChange={setDepartment} max={80} />
        <Mini label={ot('admin.users.position')} value={position} onChange={setPosition} max={80} />
      </div>

      <div>
        <Button
          size="sm"
          loading={busy}
          disabled={!dirty || !firstName.trim() || !lastName.trim()}
          onClick={() =>
            void onSave({ prefix, firstName, lastName, phone, company, department, position })
          }
        >
          {ot('common.save')}
        </Button>
      </div>
    </div>
  )
}

function Mini({
  label,
  value,
  onChange,
  max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  max: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <Input radius="round" value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} />
    </label>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-start font-medium">{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5 text-ink', className)}>{children}</td>
}

function Badge({
  tone,
  children,
}: {
  tone: 'ok' | 'danger' | 'accent'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs',
        tone === 'ok' && 'bg-surface text-ink',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'accent' && 'bg-accent/15 text-accent',
      )}
    >
      {children}
    </span>
  )
}
