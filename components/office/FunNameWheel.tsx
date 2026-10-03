'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { splitList } from '@/lib/i18n/office-format'
import { departmentLabel } from '@/lib/office/departments'
import { useOt } from '@/lib/i18n/office'
import { RandomWheel } from './RandomWheel'
import { SpinWheel, SEGMENT_TINTS } from './SpinWheel'
import type { Member } from '@/lib/office/teams'

type NameSet = { id: string; name: string; members: Member[]; updatedAt: string }
type Person = { id: string; name: string; department: string | null }

/**
 * วงล้อสุ่มชื่อ (FR-C01 / FR-C02)
 *
 * ★★★ วงล้อกลมเมื่อชื่อไม่เยอะ · แถบเลื่อนเมื่อเยอะ
 *
 *     วงล้อกลมคือภาพที่คนคาดหวังจากคำว่า "วงล้อสุ่มชื่อ" ★ แต่พอเกิน ~14 ชื่อ
 *     ช่องจะแคบจนอ่านไม่ออก และชื่อไทยยาว ๆ จะถูกตัดจนไม่เหลือความหมาย
 *     ★★ เกณฑ์จึงอยู่ที่ "อ่านออกไหม" ไม่ใช่ความชอบ — เกินเกณฑ์เปลี่ยนเป็น
 *        แถบเลื่อนอัตโนมัติ ซึ่งอ่านชื่อยาวได้เต็มบรรทัด
 *
 * ★ ทั้งสองแบบเรียก planDraw/easeOut ชุดเดียวกัน จังหวะลุ้นจึงเหมือนกันตาม FR-X05
 */

/** ★ เกินจำนวนนี้แล้วชื่อในวงล้อกลมจะอ่านไม่ออก */
const WHEEL_MAX = 14

/** ชื่อตัวอย่างในวงล้อจาง ๆ ตอนยังไม่มีใคร */


export function FunNameWheel() {
  const ot = useOt()
  const [topic, setTopic] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [typed, setTyped] = useState('')
  const [noRepeat, setNoRepeat] = useState(false)
  const [drawn, setDrawn] = useState<Member[]>([])
  const [sets, setSets] = useState<NameSet[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [showStaff, setShowStaff] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSets = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: NameSet[] }>('/api/office/fun/name-sets')
      setSets(d.items)
    } catch {
      /* ชุดที่บันทึกไว้เป็นของเสริม — โหลดไม่ได้ก็ยังเล่นได้ */
    }
  }, [])

  useEffect(() => {
    void loadSets()
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => setPeople(d.items))
      .catch(() => undefined)
  }, [loadSets])

  /* ★ FR-C02: ชื่อที่ถูกสุ่มแล้วหายจากวงล้อ แต่ยังอยู่ในรายการด้านข้าง
       ให้เห็นว่าใครออกไปแล้ว — ถ้าลบทิ้งเลยจะกดเริ่มรอบใหม่ไม่ได้ */
  const wheelItems = useMemo(() => {
    const drawnIds = new Set(drawn.map((d) => d.id))
    const pool = noRepeat ? members.filter((m) => !drawnIds.has(m.id)) : members
    return pool.map((m) => ({ id: m.id, label: m.label }))
  }, [members, drawn, noRepeat])

  /** สีประจำชื่อ — ตรงกับช่องในวงล้อช่องเดียวกัน */
  const tintOf = useCallback(
    (id: string) => {
      const i = wheelItems.findIndex((w) => w.id === id)
      return i >= 0 ? SEGMENT_TINTS[i % SEGMENT_TINTS.length]! : '142 142 147'
    },
    [wheelItems],
  )

  function addTyped() {
    const label = typed.trim()
    if (!label) return
    setMembers((m) => [...m, { id: `typed:${crypto.randomUUID()}`, label }])
    setTyped('')
  }

  function toggleStaff(p: Person) {
    setMembers((m) =>
      m.some((x) => x.id === p.id)
        ? m.filter((x) => x.id !== p.id)
        : [...m, { id: p.id, label: p.name, department: p.department }],
    )
  }

  async function saveSet() {
    const name = window.prompt(ot('fun.sets.savePrompt'))
    if (!name?.trim()) return
    try {
      await apiFetch('/api/office/fun/name-sets', {
        method: 'POST',
        body: { name: name.trim(), members },
      })
      await loadSets()
      setError(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  async function removeSet(id: string) {
    try {
      await apiFetch('/api/office/fun/name-sets', { method: 'DELETE', body: { id } })
      await loadSets()
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  const last = drawn.at(-1) ?? null

  return (
    <div className="py-2">
      <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
        {/* ═══ เวที ═══════════════════════════════════════════════ */}
        <div className="relative">
          {/*
            * ★★ หัวข้อเป็นพาดหัวกลางเวที ไม่ใช่ช่องกรอกที่มุมซ้าย
            *
            *    คำถามที่กำลังจะสุ่ม ("ใครไปซื้อกาแฟ") คือสิ่งที่ทุกคนในห้อง
            *    ต้องอ่านพร้อมกัน ★ วางเล็ก ๆ ที่มุมแล้วไม่มีใครเห็น
            *    ★ ช่องนี้จึงไม่มีขอบและอยู่กลาง — พิมพ์แล้วกลายเป็นพาดหัวทันที
            */}
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={ot('fun.name.topicPlaceholder')}
            maxLength={60}
            aria-label={ot('fun.name.topicPlaceholder')}
            className={cn(
              'mx-auto block w-full max-w-lg rounded-2xl bg-transparent px-4 py-2 text-center',
              'text-[22px] font-bold tracking-tight text-ink outline-none sm:text-[26px]',
              'placeholder:font-normal placeholder:text-ink-faint',
              'transition-colors hover:bg-elevated/40 focus:bg-elevated/60',
            )}
          />

          <div className="relative mt-4 grid place-items-center">
            {/* ★ แสงเวทีหลังวงล้อ — ทำให้ตรงกลางหน้าเป็นจุดที่ตาไปหยุด */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 mx-auto max-w-[520px] rounded-full opacity-70 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, rgb(255 0 51 / 0.22), rgb(96 110 235 / 0.16) 45%, transparent 72%)',
              }}
            />

            {wheelItems.length < 2 ? (
              <div className="grid place-items-center">
                <SpinWheel
                  preview
                  slots={splitList(ot('fun.name.previewNames')).map((label, i) => ({
                    id: `preview-${i}`,
                    label,
                  }))}
                  spinLabel={ot('fun.name.spin')}
                />
                <p className="mt-4 max-w-xs text-center text-sm text-ink-soft">
                  {ot('fun.name.empty')}
                </p>
                {people.length > 0 ? (
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      setMembers(
                        people
                          .slice(0, 8)
                          .map((p) => ({ id: p.id, label: p.name, department: p.department })),
                      )
                    }
                  >
                    {ot('fun.name.fillStaff')}
                  </Button>
                ) : null}
              </div>
            ) : wheelItems.length <= WHEEL_MAX ? (
              <SpinWheel
                key={`${wheelItems.length}-${noRepeat}`}
                slots={wheelItems}
                spinLabel={ot('fun.name.spin')}
                onResult={(item) => {
                  const m = members.find((x) => x.id === item.id)
                  if (m && !drawn.some((d) => d.id === m.id)) setDrawn((p) => [...p, m])
                }}
              />
            ) : (
              <RandomWheel
                key={`${wheelItems.length}-${noRepeat}`}
                items={wheelItems}
                spinLabel={ot('fun.name.spin')}
                onResult={(item) => {
                  const m = members.find((x) => x.id === item.id)
                  if (m && !drawn.some((d) => d.id === m.id)) setDrawn((p) => [...p, m])
                }}
              />
            )}
          </div>

          {/* ── ผู้ถูกเลือกล่าสุด ───────────────────────────────── */}
          {last ? (
            <div
              className="mx-auto mt-6 max-w-md rounded-3xl border p-5 text-center backdrop-blur-md"
              style={{
                borderColor: `rgb(${tintOf(last.id)} / 0.45)`,
                background: `rgb(${tintOf(last.id)} / 0.1)`,
              }}
            >
              <p className="text-xs text-ink-soft">{ot('fun.name.winner')}</p>
              <p className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-ink">
                {last.label}
              </p>
              {last.department ? (
                <p className="mt-0.5 text-xs text-ink-faint" dir="auto">
                  {departmentLabel(ot, last.department)}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {/* ★ เอาออกจากวงล้อทันที — กรณีที่ใช้บ่อยที่สุดหลังได้ผล
                    คือ "คนนี้ไปแล้ว หมุนหาคนต่อไป" */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setMembers((x) => x.filter((y) => y.id !== last.id))}
                >
                  {ot('fun.name.removeWinner')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrawn([])}>
                  {ot('fun.name.reset')}
                </Button>
              </div>
            </div>
          ) : null}

          {/* ── ลำดับที่ออกไปแล้ว ───────────────────────────────── */}
          {drawn.length > 1 ? (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
              <p className="text-sm font-medium text-ink">{ot('fun.name.drawn')}</p>
              <ol className="mt-2 flex flex-wrap gap-1.5">
                {drawn.map((d, i) => (
                  <li
                    key={d.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-ink-soft"
                  >
                    <span className="text-[10px] tabular-nums text-ink-faint">{i + 1}</span>
                    {d.label}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        {/* ═══ รายชื่อ ═══════════════════════════════════════════ */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
            <div className="flex items-center gap-2">
              <Input
                radius="round"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTyped()
                  }
                }}
                placeholder={ot('fun.name.addPlaceholder')}
                maxLength={60}
              />
              <Button size="sm" onClick={addTyped} disabled={!typed.trim()}>
                +
              </Button>
            </div>

            {/*
              * ★ สวิตช์ ไม่ใช่ช่องติ๊ก
              *   ★★ ช่องติ๊กสื่อว่า "เลือกหลายอย่างจากรายการ" ส่วนสวิตช์สื่อว่า
              *      "เปิด/ปิดโหมดนี้" ซึ่งตรงกับสิ่งที่ปุ่มนี้ทำจริง
              *   ★ ใช้ชุดเดียวกับสวิตช์ในหน้าโปรไฟล์ ทั้งระบบจึงเป็นภาษาเดียวกัน
              */}
            <button
              type="button"
              role="switch"
              aria-checked={noRepeat}
              onClick={() => setNoRepeat((v) => !v)}
              className="mt-3 flex w-full items-start gap-3 rounded-xl p-1 text-start transition-colors hover:bg-surface/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">{ot('fun.name.noRepeat')}</span>
                <span className="block text-xs text-ink-faint">{ot('fun.name.noRepeatHint')}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
                  noRepeat ? 'bg-accent' : 'bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-4 rounded-full bg-elevated shadow transition-[inset-inline-start]',
                    noRepeat ? 'start-4.5' : 'start-0.5',
                  )}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowStaff((v) => !v)}
              className="mt-3 text-xs text-link hover:underline"
            >
              {ot('fun.name.fromStaff')} {showStaff ? '▲' : '▼'}
            </button>

            {showStaff ? (
              <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleStaff(p)}
                    className={cn(
                      'h-7 rounded-full px-2.5 text-xs transition-colors',
                      members.some((m) => m.id === p.id)
                        ? 'bg-ink text-page'
                        : 'bg-surface text-ink-soft hover:bg-surface-hover',
                    )}
                  >
                    <span dir="auto">{p.name}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {members.length > 0 ? (
              <>
                {/*
                  * ★★ ชิปใช้สีเดียวกับช่องในวงล้อ
                  *
                  *    คนมองวงล้อแล้วเห็นช่องสีส้ม จะรู้ทันทีว่าคือชื่อไหนในรายการ
                  *    ★ ถ้าชิปเป็นสีเทาเหมือนกันหมด รายการกับวงล้อจะเป็นคนละเรื่องกัน
                  *    ★★ ชื่อที่ออกไปแล้ว (โหมดไม่สุ่มซ้ำ) เป็นสีเทาและขีดฆ่า —
                  *       ยังอยู่ให้เห็นว่าใครออกไปแล้ว แต่ไม่แย่งสีกับคนที่ยังอยู่
                  */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const out = noRepeat && drawn.some((d) => d.id === m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMembers((x) => x.filter((y) => y.id !== m.id))}
                        title={ot('common.delete')}
                        className={cn(
                          'group inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors',
                          out
                            ? 'bg-surface text-ink-faint line-through'
                            : 'bg-surface text-ink hover:bg-danger/15 hover:text-danger',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ background: out ? 'currentColor' : `rgb(${tintOf(m.id)})` }}
                        />
                        <span dir="auto">{m.label}</span>
                        <span className="text-ink-faint group-hover:text-danger">✕</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" className="flex-1" onClick={saveSet}>
                    {ot('fun.sets.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setMembers([])
                      setDrawn([])
                    }}
                  >
                    {ot('fun.name.clearAll')}
                  </Button>
                </div>
              </>
            ) : null}
          </div>

          {/* ชุดที่บันทึกไว้ */}
          <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
            <p className="text-sm font-medium text-ink">{ot('fun.sets.title')}</p>
            {sets.length === 0 ? (
              <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.sets.empty')}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {sets.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                      {s.name}
                      <span className="ms-1 text-xs text-ink-faint">({s.members.length})</span>
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setMembers(s.members)
                        setDrawn([])
                      }}
                    >
                      {ot('fun.sets.load')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void removeSet(s.id)}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
