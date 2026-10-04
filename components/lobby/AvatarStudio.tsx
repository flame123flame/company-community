'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMounted } from '@/hooks/useMounted'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import {
  appearanceKey,
  HAIRS,
  HAIR_STYLES,
  PANTS,
  SHIRTS,
  SKINS,
  defaultAppearance,
  type Appearance,
} from '@/lib/lobby/appearance'
import { SPRITE_H, SPRITE_W, spriteSheet } from '@/lib/lobby/sprite'
import { useT } from '@/lib/i18n/client'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * ห้องแต่งตัว
 *
 * ★★ ทุกการกดเห็นผลทันทีบนแผนที่ ไม่ต้องกด "บันทึก" ก่อนถึงจะเห็น
 *
 *    การแต่งตัวคือการลองผิดลองถูก ★ ถ้าต้องกดบันทึกก่อนถึงจะเห็นผล
 *      คนจะเลิกลองตั้งแต่ชุดที่สอง
 *    ปุ่มบันทึกจึงทำหน้าที่ "จำไว้ให้ข้ามเครื่อง" เท่านั้น ไม่ใช่ "ทำให้เห็น"
 *
 * ★★ ทำไมตัวอย่างเดินอยู่ตลอด
 *
 *    ตัวละครยืนนิ่งกับตัวละครที่เดินอยู่ให้ความรู้สึกคนละอย่างมาก
 *    และผู้ใช้จะได้เห็นเลยว่าทรงผมที่เลือกดูเป็นยังไงตอนขยับจริง
 */
export function AvatarStudio({
  value,
  onChange,
  onClose,
}: {
  value: Appearance
  onChange: (next: Appearance) => void
  onClose: () => void
}) {
  const t = useT()
  const confirm = useConfirm()
  const mounted = useMounted()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [frame, setFrame] = useState(0)
  const [dir, setDir] = useState(0)

  const sheet = useMemo(() => spriteSheet(value), [value])

  useEffect(() => {
    const walk = setInterval(() => setFrame((f) => (f + 1) % 4), 150)
    // หมุนตัวให้ดูรอบด้านโดยไม่ต้องกดอะไร
    const turn = setInterval(() => setDir((d) => (d + 1) % 4), 2400)
    return () => {
      clearInterval(walk)
      clearInterval(turn)
    }
  }, [])

  useEffect(() => {
    const esc = (event: KeyboardEvent) => {
      // ★ Esc ที่กล่องยืนยันกินไปแล้ว (preventDefault) ไม่ต้องปิดสตูดิโอตามไปด้วย
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  function set<K extends keyof Appearance>(key: K, next: Appearance[K]) {
    setSaved(false)
    onChange({ ...value, [key]: next })
  }

  async function save() {
    if (!(await confirm({ kind: 'edit' }))) return
    setSaving(true)
    try {
      await apiFetch('/api/profile/appearance', { method: 'POST', body: value })
      setSaved(true)
    } catch {
      /*
       * ★ ล้มเหลวแล้วเงียบโดยตั้งใจ
       *   หน้าตายังถูกส่งให้คนอื่นเห็นผ่าน presence อยู่ดีแม้บันทึกไม่ผ่าน
       *   สิ่งที่เสียไปคือ "จำไว้ข้ามเครื่อง" เท่านั้น ซึ่งไม่คุ้มที่จะขึ้น
       *   กล่องแดงขัดจังหวะคนที่กำลังสนุกกับการแต่งตัวอยู่
       */
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      data-ui
      role="dialog"
      aria-modal="true"
      aria-label={t('avatar.title')}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          'flex max-h-[88dvh] w-full max-w-[520px] flex-col overflow-hidden',
          'rounded-t-3xl border border-line bg-elevated sm:rounded-3xl',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{t('avatar.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid size-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </header>

        {/* ── ตัวอย่าง ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-6 border-b border-line bg-surface py-5">
          <div
            aria-hidden="true"
            style={{
              width: SPRITE_W * 3,
              height: SPRITE_H * 3,
              backgroundImage: `url(${sheet})`,
              backgroundSize: `${SPRITE_W * 4 * 3}px ${SPRITE_H * 4 * 3}px`,
              backgroundPosition: `-${frame * SPRITE_W * 3}px -${dir * SPRITE_H * 3}px`,
              imageRendering: 'pixelated',
            }}
          />
          <div className="flex flex-col gap-2">
            {[0, 2, 3, 1].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                aria-label={t((['avatar.face', 'avatar.faceLeft', 'avatar.faceRight', 'avatar.faceBack'] as const)[d]!)}
                className={cn(
                  'size-6 rounded-md border text-[9px] transition-colors',
                  dir === d ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-soft',
                )}
              >
                {['↓', '←', '→', '↑'][d]}
              </button>
            ))}
          </div>
        </div>

        {/* ── ตัวเลือก ─────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <Row label={t('avatar.skin')}>
            {SKINS.map((color, index) => (
              <Swatch
                key={color}
                color={color}
                active={value.skin === index}
                onClick={() => set('skin', index)}
                label={t('avatar.skinN', { n: index + 1 })}
              />
            ))}
          </Row>

          <Row label={t('avatar.hair')}>
            {HAIR_STYLES.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => set('hair', index)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  value.hair === index
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line text-ink-soft hover:border-line-strong',
                )}
              >
                {t(key)}
              </button>
            ))}
          </Row>

          <Row label={t('avatar.hairColor')}>
            {HAIRS.map((color, index) => (
              <Swatch
                key={color}
                color={color}
                active={value.hairColor === index}
                onClick={() => set('hairColor', index)}
                label={t('avatar.hairColorN', { n: index + 1 })}
              />
            ))}
          </Row>

          <Row label={t('avatar.shirt')}>
            {SHIRTS.map((color, index) => (
              <Swatch
                key={color}
                color={color}
                active={value.shirt === index}
                onClick={() => set('shirt', index)}
                label={t('avatar.shirtN', { n: index + 1 })}
              />
            ))}
          </Row>

          <Row label={t('avatar.pants')}>
            {PANTS.map((color, index) => (
              <Swatch
                key={color}
                color={color}
                active={value.pants === index}
                onClick={() => set('pants', index)}
                label={t('avatar.pantsN', { n: index + 1 })}
              />
            ))}
          </Row>

          <Row label={t('avatar.glasses')}>
            {[false, true].map((on) => (
              <button
                key={String(on)}
                type="button"
                onClick={() => set('glasses', on)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  value.glasses === on
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line text-ink-soft hover:border-line-strong',
                )}
              >
                {on ? t('avatar.glassesOn') : t('avatar.glassesOff')}
              </button>
            ))}
          </Row>
        </div>

        <footer className="flex items-center gap-2 border-t border-line p-3">
          <button
            type="button"
            onClick={() => {
              setSaved(false)
              /*
               * ★ ต้องต่างจากของเดิมจริง ๆ ไม่ใช่แค่ "สุ่มใหม่"
               *   ตัวเลือกมีจำกัด การสุ่มจึงออกหน้าเดิมได้บ่อยพอที่คนจะคิดว่า
               *   ปุ่มเสีย — วนสุ่มจนกว่าจะได้อันที่ไม่ซ้ำ (ไม่เกิน 12 ครั้ง)
               */
              let next = value
              for (let i = 0; i < 12 && appearanceKey(next) === appearanceKey(value); i++) {
                next = defaultAppearance(`${i}:${Date.now()}:${Math.random()}`)
              }
              onChange(next)
            }}
            className="rounded-full border border-line px-4 py-2 text-xs text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            {t('avatar.random')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ml-auto rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? t('avatar.saving') : saved ? t('avatar.saved') : t('avatar.save')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-ink-soft">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Swatch({
  color,
  active,
  onClick,
  label,
}: {
  color: string
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'size-8 rounded-lg border-2 transition-transform',
        active ? 'border-accent scale-110' : 'border-line hover:scale-105',
      )}
      style={{ background: color }}
    />
  )
}
