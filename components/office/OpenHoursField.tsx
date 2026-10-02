'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { DAY_KEYS, type OpenHours, type DayKey } from '@/lib/office/geo'

/**
 * กรอกเวลาเปิด-ปิดรายวัน — ไม่บังคับ
 *
 * ★★★ มีขึ้นเพราะตรรกะ isOpenNow กับป้าย "เปิดอยู่/ปิดแล้ว" เสร็จไปก่อน
 *     แต่ไม่มีที่ให้กรอก ★ ฟีเจอร์ที่คำนวณได้แต่ไม่มีใครป้อนข้อมูลเข้าไป
 *     ก็คือฟีเจอร์ที่ไม่มีอยู่จริง
 *
 * ★★ "ใช้เวลาเดียวกันทุกวัน" เป็นค่าเริ่มต้น
 *    ★ ร้านส่วนใหญ่เปิดเวลาเดิมทุกวัน การบังคับกรอก 7 บรรทัดตั้งแต่แรก
 *      ทำให้ไม่มีใครกรอกเลย ★★ คนที่ต้องแยกรายวันจริงค่อยกดขยาย
 */
export function OpenHoursField({
  value,
  onChange,
}: {
  value: OpenHours | null
  onChange: (v: OpenHours | null) => void
}) {
  const ot = useOt()
  const [perDay, setPerDay] = useState(() => {
    if (!value) return false
    const spans = DAY_KEYS.map((d) => JSON.stringify(value[d] ?? null))
    return new Set(spans).size > 1
  })

  /* ★ ค่าที่โชว์ในโหมด "ทุกวันเหมือนกัน" — เอาของวันจันทร์เป็นตัวแทน */
  const uniform = value?.mon ?? null

  function setAll(open: string, close: string) {
    const span: [string, string] = [open, close]
    onChange(Object.fromEntries(DAY_KEYS.map((d) => [d, span])) as OpenHours)
  }

  function setDay(day: DayKey, span: [string, string] | null) {
    onChange({ ...(value ?? {}), [day]: span })
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={() => setAll('09:00', '18:00')}
        className="flex h-11 w-full items-center justify-between rounded-xl bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-hover"
      >
        <span>{ot('food.hours.add')}</span>
        <span aria-hidden="true" className="text-ink-faint">＋</span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          <Untranslated>{ot('food.hours.title')}</Untranslated>
        </p>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="h-11 rounded-full px-3 text-[13px] text-danger hover:bg-surface"
        >
          <Untranslated>{ot('food.hours.clear')}</Untranslated>
        </button>
      </div>

      {perDay ? (
        <ul className="mt-2 flex flex-col gap-1">
          {DAY_KEYS.map((d) => {
            const span = value[d] ?? null
            return (
              <li key={d} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs text-ink-soft">{ot(`food.day.${d}` as 'food.day.mon')}</span>
                {span ? (
                  <>
                    <TimeBox value={span[0]} onChange={(v) => setDay(d, [v, span[1]])} />
                    <span className="text-ink-faint">–</span>
                    <TimeBox value={span[1]} onChange={(v) => setDay(d, [span[0], v])} />
                  </>
                ) : (
                  <span className="flex-1 text-xs text-ink-faint">{ot('food.hours.closedDay')}</span>
                )}
                <button
                  type="button"
                  onClick={() => setDay(d, span ? null : ['09:00', '18:00'])}
                  className="ms-auto grid size-11 place-items-center rounded-full text-xs text-ink-soft hover:bg-surface"
                  aria-label={ot('food.hours.closedDay')}
                >
                  {span ? '✕' : '＋'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <TimeBox value={uniform?.[0] ?? '09:00'} onChange={(v) => setAll(v, uniform?.[1] ?? '18:00')} />
          <span className="text-ink-faint">–</span>
          <TimeBox value={uniform?.[1] ?? '18:00'} onChange={(v) => setAll(uniform?.[0] ?? '09:00', v)} />
          <span className="text-xs text-ink-faint">{ot('food.hours.everyday')}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPerDay((v) => !v)}
        className="mt-2 h-11 rounded-full px-2 text-[13px] text-link hover:underline"
      >
        <Untranslated>{perDay ? ot('food.hours.sameEveryday') : ot('food.hours.perDay')}</Untranslated>
      </button>
    </div>
  )
}

/* ★ type="time" — คีย์บอร์ดและตัวเลือกเวลาของระบบปฏิบัติการดีกว่าที่เราทำเองเสมอ */
function TimeBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-11 rounded-lg border border-line bg-page px-2 text-sm text-ink',
        'focus:border-line-strong focus:outline-none',
      )}
    />
  )
}
