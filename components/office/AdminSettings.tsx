'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'

type Settings = {
  report_threshold?: number
  no_repeat_days?: number
  reminder_days?: number[]
  lottery_next_draw?: string | null
}

/** หน้าตั้งค่าระบบ (FR-X09 · หัวข้อ 8.6) */
export function AdminSettings() {
  const ot = useOt()
  const [settings, setSettings] = useState<Settings>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ settings: Settings }>('/api/office/admin/settings')
      setSettings(data.settings)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(key: string, value: unknown) {
    setSaving(key)
    setError(null)
    setSaved(null)
    try {
      await apiFetch('/api/office/admin/settings', { method: 'PATCH', body: { key, value } })
      setSaved(key)
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="max-w-2xl py-2">

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-4">
        <NumberRow
          label={ot('admin.settings.reportThreshold')}
          hint={ot('admin.settings.reportThresholdHint')}
          value={settings.report_threshold ?? 3}
          min={1}
          max={50}
          saving={saving === 'report_threshold'}
          saved={saved === 'report_threshold'}
          onSave={(v) => void save('report_threshold', v)}
        />

        <NumberRow
          label={ot('admin.settings.noRepeatDays')}
          hint={ot('admin.settings.noRepeatDaysHint')}
          value={settings.no_repeat_days ?? 7}
          min={0}
          max={90}
          saving={saving === 'no_repeat_days'}
          saved={saved === 'no_repeat_days'}
          onSave={(v) => void save('no_repeat_days', v)}
        />

        <ListRow
          label={ot('admin.settings.reminderDays')}
          hint={ot('admin.settings.reminderDaysHint')}
          value={settings.reminder_days ?? [1, 3, 7]}
          saving={saving === 'reminder_days'}
          saved={saved === 'reminder_days'}
          onSave={(v) => void save('reminder_days', v)}
        />

        <DateRow
          label={ot('admin.settings.lotteryDate')}
          hint={ot('admin.settings.lotteryDateHint')}
          value={settings.lottery_next_draw ?? null}
          saving={saving === 'lottery_next_draw'}
          saved={saved === 'lottery_next_draw'}
          onSave={(v) => void save('lottery_next_draw', v)}
        />
      </div>
    </div>
  )
}

function Card({
  label,
  hint,
  saved,
  children,
}: {
  label: string
  hint: string
  saved: boolean
  children: React.ReactNode
}) {
  const ot = useOt()
  return (
    <div className="rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>
        </div>
        {/* ★ บอกว่าบันทึกแล้วตรงช่องที่แก้ ไม่ใช่ toast มุมจอ
            ฟอร์มที่มีหลายช่องบันทึกแยกกัน ต้องรู้ว่าอันไหนที่เพิ่งบันทึก */}
        {saved ? <span className="text-xs text-ink-soft">{ot('admin.settings.saved')}</span> : null}
      </div>
      <div className="mt-3 flex items-center gap-2">{children}</div>
    </div>
  )
}

function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  saving,
  saved,
  onSave,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  saving: boolean
  saved: boolean
  onSave: (v: number) => void
}) {
  const ot = useOt()
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const n = Number(draft)
  const valid = Number.isInteger(n) && n >= min && n <= max

  return (
    <Card label={label} hint={hint} saved={saved}>
      <Input radius="round"
        type="number"
        min={min}
        max={max}
        value={draft}
        invalid={!valid}
        onChange={(e) => setDraft(e.target.value)}
        className="max-w-28"
      />
      <Button loading={saving} disabled={!valid || n === value} onClick={() => onSave(n)}>
        {ot('common.save')}
      </Button>
    </Card>
  )
}

function ListRow({
  label,
  hint,
  value,
  saving,
  saved,
  onSave,
}: {
  label: string
  hint: string
  value: number[]
  saving: boolean
  saved: boolean
  onSave: (v: number[]) => void
}) {
  const ot = useOt()
  const [draft, setDraft] = useState(value.join(','))
  useEffect(() => setDraft(value.join(',')), [value])

  const parsed = draft
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365)

  /* ★ ต้องไม่ว่างและจำนวนต้องตรงกับที่พิมพ์ — ไม่งั้น "1,abc,7" จะผ่านเป็น [1,7]
     แล้ว Admin จะไม่รู้เลยว่าค่าที่พิมพ์ผิดถูกกลืนหายไปเงียบ ๆ */
  const typed = draft.split(',').filter((s) => s.trim() !== '').length
  const valid = parsed.length > 0 && parsed.length === typed

  return (
    <Card label={label} hint={hint} saved={saved}>
      <Input radius="round"
        value={draft}
        invalid={!valid}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="1,3,7"
        className="max-w-40"
      />
      <Button
        loading={saving}
        disabled={!valid || parsed.join(',') === value.join(',')}
        onClick={() => onSave(parsed)}
      >
        {ot('common.save')}
      </Button>
    </Card>
  )
}

function DateRow({
  label,
  hint,
  value,
  saving,
  saved,
  onSave,
}: {
  label: string
  hint: string
  value: string | null
  saving: boolean
  saved: boolean
  onSave: (v: string | null) => void
}) {
  const ot = useOt()
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  return (
    <Card label={label} hint={hint} saved={saved}>
      <Input radius="round"
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="max-w-44"
      />
      <Button
        loading={saving}
        disabled={draft === (value ?? '')}
        onClick={() => onSave(draft || null)}
      >
        {ot('common.save')}
      </Button>
    </Card>
  )
}
