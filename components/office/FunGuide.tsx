'use client'

import { useSyncExternalStore, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { splitList } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'

export type GuideArt =
  | 'hub' | 'wheel' | 'room' | 'teams' | 'lottery' | 'cup' | 'checkers' | 'typing'
  | 'owed' | 'bill' | 'chart' | 'qr'
  | 'market' | 'post' | 'mine' | 'chat'
  | 'picks' | 'spin' | 'talk' | 'idcard'
  | 'vinyl' | 'stage' | 'connect4' | 'quiz'

/*
 * ★★ จำว่า "ซ่อนคำอธิบาย" ไว้ในเครื่อง — ของสะดวกส่วนตัว ไม่ใช่ข้อมูลสำคัญ
 *    ★ คนใช้ครั้งแรกเห็นคำอธิบายเต็ม · คนใช้ทุกวันกดซ่อนครั้งเดียวแล้วไม่เห็นอีก
 *    ★ อ่าน/เขียน localStorage ห่อ try/catch — โหมดส่วนตัวบางเบราว์เซอร์โยน error
 */
const listeners = new Set<() => void>()
const keyOf = (id: string) => `funGuide:hidden:${id}`
function readHidden(id: string): boolean {
  try {
    return window.localStorage.getItem(keyOf(id)) === '1'
  } catch {
    return false
  }
}
function writeHidden(id: string, hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(keyOf(id), '1')
    else window.localStorage.removeItem(keyOf(id))
  } catch {
    /* เก็บไม่ได้ก็แค่ไม่จำ — ใช้งานต่อได้ปกติ */
  }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * แผงอธิบายหัวหน้าเพจ — ใช้ร่วมกันทุกหน้าในหมวด "สุ่มและเกม" "กระเป๋าเงิน" "ตลาดนัด" "กินอะไรดี" "แชท" และโปรไฟล์
 *
 * ★★★ ให้หน้าอธิบายตัวเองได้ ลดการต้องสอนกันปากต่อปาก
 *     ★ บอก 3 อย่างเสมอ: ใช้ทำอะไร · ทำยังไงใน 3 ขั้น · เคล็ดลับที่คนมักไม่รู้
 *     ★★ ยุบได้และจำไว้ — คำอธิบายที่บังเครื่องมือทุกวันคือสิ่งที่คนเกลียด
 *
 * ★ ข้อความทั้งหมดมาจากดิกชันนารีด้วยกุญแจ `guide.<id>.*`
 *   (badge · title · desc · s1t/s1 · s2t/s2 · s3t/s3 · uses · tips)
 */
export function FunGuide({ id, art }: { id: string; art: GuideArt }) {
  const ot = useOt()
  /* ★ กุญแจประกอบจาก id — ตรวจครบทุกภาษาโดย office-dict-check อยู่แล้ว */
  const k = (s: string) => ot(`guide.${id}.${s}` as 'guide.name.title')
  return (
    <GuideView
      id={id}
      art={art}
      text={{
        badge: k('badge'),
        title: k('title'),
        desc: k('desc'),
        steps: [
          [k('s1t'), k('s1')],
          [k('s2t'), k('s2')],
          [k('s3t'), k('s3')],
        ],
        uses: splitList(k('uses')),
        tips: splitList(k('tips')),
        show: ot('guide.show', { title: k('title') }),
        hide: ot('guide.hide'),
        usesLabel: ot('guide.usesLabel'),
      }}
    />
  )
}

export type GuideText = {
  badge: string
  title: string
  desc: string
  steps: readonly (readonly [string, string])[]
  uses: string[]
  tips: string[]
  show: string
  hide: string
  usesLabel: string
}

/**
 * ★★ ตัวแผงล้วน ๆ — รับข้อความที่แปลแล้ว ไม่สนว่ามาจากดิกชันนารีไหน
 *    ★ หน้าออฟฟิศใช้ผ่าน FunGuide (ดิกออฟฟิศ) · ห้องเพลงใช้ผ่าน MusicGuide (ดิกหลัก)
 *      ★★ ห้องเพลงไม่มีดิกออฟฟิศในหน้า — ส่งทั้งก้อนลงมาเพื่อแผงเดียวไม่คุ้ม
 */
export function GuideView({ id, art, text }: { id: string; art: GuideArt; text: GuideText }) {
  const hidden = useSyncExternalStore(subscribe, () => readHidden(id), () => false)

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => writeHidden(id, false)}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-elevated/70 px-4 text-[13px] text-ink-soft backdrop-blur transition-colors hover:border-line-strong hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />
        </svg>
        <Untranslated>{text.show}</Untranslated>
      </button>
    )
  }

  const { uses, tips } = text

  return (
    <section className="@container room-hero relative mt-2 rounded-[28px] p-5 sm:p-7">
      {/* ★★ จัดตามความกว้าง "ของแผงเอง" ไม่ใช่ของจอ — แผงนี้อยู่ได้ทั้งหน้ากว้างเต็มและคอลัมน์แคบในห้องเพลง */}
      <div className="grid items-center gap-6 @4xl:grid-cols-[minmax(0,1fr)_280px] @4xl:gap-8">
      <button
        type="button"
        onClick={() => writeHidden(id, true)}
        aria-label={text.hide}
        title={text.hide}
        className="absolute end-3 top-3 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs text-ink-faint transition-colors hover:bg-surface hover:text-ink"
      >
        <Untranslated>{text.hide}</Untranslated>
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      <div className="min-w-0">
        <span className="inline-flex max-w-[calc(100%-5.5rem)] items-center gap-2 rounded-full bg-accent/12 px-3 py-1 text-xs font-semibold text-accent">
          <span aria-hidden="true" className="room-live shrink-0" />
          <span className="truncate">
            <Untranslated>{text.badge}</Untranslated>
          </span>
        </span>
        <h2 className="mt-3 text-[clamp(1.5rem,5.2vw,2.25rem)] font-black leading-[1.15] tracking-tight text-ink">
          <Untranslated>{text.title}</Untranslated>
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-[15px]">
          <Untranslated>{text.desc}</Untranslated>
        </p>

        <ol className="mt-5 grid gap-3 @xl:grid-cols-3">
          {text.steps.map(([st, sd], i) => (
            <li key={i} className="flex gap-3 rounded-2xl border border-line bg-elevated/70 p-3.5 backdrop-blur">
              <span className="room-step-num grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">
                  <Untranslated>{st}</Untranslated>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                  <Untranslated>{sd}</Untranslated>
                </span>
              </span>
            </li>
          ))}
        </ol>

        {tips.length > 0 ? (
          <ul className="mt-4 grid gap-1.5 @xl:grid-cols-2">
            {tips.map((t) => (
              <li key={t} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-3.5 shrink-0 text-[var(--ck-gold-deep)]" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" />
                </svg>
                <Untranslated>{t}</Untranslated>
              </li>
            ))}
          </ul>
        ) : null}

        {uses.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink-faint">
              <Untranslated>{text.usesLabel}</Untranslated>
            </span>
            {uses.map((u) => (
              <span key={u} className="rounded-full bg-surface px-3 py-1 text-xs text-ink-soft">
                <Untranslated>{u}</Untranslated>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div aria-hidden="true" className="relative mx-auto hidden size-[260px] @4xl:block">
        <Art kind={art} />
      </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * ภาพประกอบ — CSS ล้วน สีจาก token · ซ่อนบนมือถือเพื่อไม่ดันเครื่องมือลงไป
 * ═══════════════════════════════════════════════════════════════════ */
function Art({ kind }: { kind: GuideArt }) {
  switch (kind) {
    case 'wheel':
    case 'room':
      return (
        <>
          <span className="room-pointer" />
          <div className="room-wheel absolute left-5 top-5 size-[220px]" />
          {kind === 'room'
            ? (
                [
                  ['A', '-2%', '18%', 'bg-accent', '0s', 40],
                  ['B', '82%', '6%', 'bg-link', '0.6s', 36],
                  ['C', '86%', '70%', 'bg-ink text-page', '1.2s', 38],
                  ['D', '0%', '76%', 'bg-[var(--ck-gold-deep)]', '1.8s', 34],
                ] as const
              ).map(([l, x, y, bg, d, s]) => (
                <span key={l} className={cn('room-peer text-sm', bg)} style={{ left: x, top: y, width: s, height: s, '--dl': d } as CSSProperties}>
                  {l}
                </span>
              ))
            : null}
        </>
      )
    case 'teams':
      return (
        <div className="absolute inset-0 grid place-items-center">
          {(
            [
              ['var(--color-accent)', '-8deg', '-40px', '0s'],
              ['var(--color-link)', '4deg', '0px', '0.5s'],
              ['var(--ck-gold)', '12deg', '40px', '1s'],
            ] as const
          ).map(([c, r, y, d], i) => (
            <div
              key={c}
              className="guide-team absolute w-44 rounded-2xl p-3"
              style={{ '--tc': c, transform: `translate(${(i - 1) * 34}px, ${y}) rotate(${r})`, '--dl': d } as CSSProperties}
            >
              <span className="block h-2 w-16 rounded-full" style={{ background: c }} />
              <span className="mt-2.5 flex gap-1.5">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="guide-team-dot size-7 rounded-full" style={{ animationDelay: `${i * 0.3 + k * 0.15}s` }} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )
    case 'lottery':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="guide-slot flex gap-2 rounded-3xl p-3">
            {['8', '2', '7'].map((d, i) => (
              <span key={i} className="guide-digit grid h-24 w-16 place-items-center rounded-2xl text-5xl font-black tabular-nums" style={{ '--dl': `${i * 0.25}s` } as CSSProperties}>
                {d}
              </span>
            ))}
          </div>
        </div>
      )
    case 'cup':
      return (
        <svg viewBox="0 0 260 260" className="absolute inset-0 size-full" fill="none">
          <g stroke="var(--color-line-strong)" strokeWidth="3" strokeLinecap="round" className="guide-bracket">
            <path d="M20 40h50v40h40M20 120h50V80M20 160h50v40h40M20 240h50v-40M110 80v60h40M110 200v-60" />
            <path d="M240 40h-50v40h-40M240 120h-50V80M240 160h-50v40h-40M240 240h-50v-40" opacity="0.4" />
          </g>
          {[40, 120, 160, 240].map((y, i) => (
            <circle key={y} cx="20" cy={y} r="7" fill={i % 2 ? 'var(--color-link)' : 'var(--color-accent)'} />
          ))}
          <g className="guide-cup">
            <path d="M112 112h36v14a18 18 0 0 1-36 0zM112 117h-9v5a9 9 0 0 0 9 9M148 117h9v5a9 9 0 0 1-9 9M124 144h12v8h8v6h-28v-6h8z" fill="var(--ck-gold)" stroke="var(--ck-gold-deep)" strokeWidth="2" strokeLinejoin="round" />
          </g>
        </svg>
      )
    case 'checkers':
      return (
        <div className="ck-stage absolute inset-3">
          <div className="ck-frame">
            <div className="ck-board grid aspect-square grid-cols-4 grid-rows-4 overflow-hidden" dir="ltr">
              {Array.from({ length: 16 }, (_, i) => {
                const dark = (Math.floor(i / 4) + (i % 4)) % 2 === 1
                const piece = { 1: 'ck-pearl', 3: 'ck-pearl', 6: 'ck-pearl', 9: 'ck-red', 12: 'ck-red', 14: 'ck-red' }[i]
                return (
                  <span key={i} className={cn('relative grid place-items-center', dark ? 'ck-sq-dark' : 'ck-sq-light')}>
                    {piece ? <span className={cn('ck-piece', piece, i === 9 && 'guide-hop')} /> : null}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )
    case 'typing':
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <p className="rounded-2xl bg-elevated px-4 py-3 text-lg font-semibold text-ink shadow-sm">
            <Untranslated>สวัสดี</Untranslated>
            <span className="text-ink-faint">
              <Untranslated>ทุกคน</Untranslated>
            </span>
            <span className="guide-caret ms-0.5 inline-block h-5 w-0.5 translate-y-0.5 bg-accent" />
          </p>
          <div className="flex flex-col items-center gap-1.5">
            {['QWERTY', 'ASDFG', 'ZXCV'].map((row, r) => (
              <div key={row} className="flex gap-1.5">
                {row.split('').map((ch, c) => (
                  <span key={ch} className="guide-key grid size-8 place-items-center rounded-lg text-xs font-bold" style={{ '--dl': `${(r * 3 + c) * 0.37}s` } as CSSProperties}>
                    {ch}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )
    case 'owed':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative flex w-full items-center justify-between px-4">
            <span className="guide-person grid size-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-accent-ink" style={{ '--dl': '0s' } as CSSProperties}>
              A
            </span>
            <span className="guide-flow relative mx-2 h-1.5 flex-1 rounded-full" />
            <span className="guide-person grid size-16 shrink-0 place-items-center rounded-full bg-link text-xl font-bold text-accent-ink" style={{ '--dl': '0.8s' } as CSSProperties}>
              B
            </span>
          </div>
          <span className="guide-coin absolute grid size-12 place-items-center rounded-full text-lg font-black">฿</span>
          <span className="absolute bottom-6 rounded-full bg-elevated px-4 py-2 text-sm font-bold text-ink shadow-md ring-1 ring-line">
            ✓ <span className="tabular-nums">฿120</span>
          </span>
        </div>
      )
    case 'bill':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="guide-receipt relative w-40 rounded-t-2xl px-4 pb-6 pt-4">
            <span className="block h-2 w-20 rounded-full bg-ink/70" />
            {[70, 54, 62].map((w, i) => (
              <span key={i} className="mt-3 flex items-center justify-between">
                <span className="h-1.5 rounded-full bg-ink-faint/60" style={{ width: `${w}%` }} />
                <span className="h-1.5 w-6 rounded-full bg-ink-faint/60" />
              </span>
            ))}
            <span className="mt-4 flex items-center justify-between border-t border-dashed border-line-strong pt-2 text-sm font-black text-ink">
              <span>Σ</span>
              <span className="tabular-nums">฿360</span>
            </span>
          </div>
          <div className="absolute bottom-3 flex gap-3">
            {(['bg-accent', 'bg-link', 'bg-[var(--ck-gold-deep)]'] as const).map((bg, i) => (
              <span key={bg} className={cn('guide-split grid size-12 place-items-center rounded-full text-xs font-black text-accent-ink shadow-md', bg)} style={{ '--dl': `${i * 0.2}s` } as CSSProperties}>
                ฿120
              </span>
            ))}
          </div>
        </div>
      )
    case 'chart':
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="flex h-36 items-end gap-2.5">
            {[42, 68, 50, 88, 60, 100, 74].map((h, i) => (
              <span
                key={i}
                className={cn('guide-bar w-6 rounded-t-lg', i === 5 ? 'bg-accent' : 'bg-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-elevated))]')}
                style={{ height: `${h}%`, '--dl': `${i * 0.12}s` } as CSSProperties}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-elevated px-4 py-2.5 shadow-md ring-1 ring-line">
            <span className="guide-ring size-10 rounded-full" />
            <span className="text-left">
              <span className="block text-sm font-black tabular-nums text-ink">฿4,280</span>
              <span className="block text-[11px] text-ink-faint">72%</span>
            </span>
          </div>
        </div>
      )
    case 'qr':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative rounded-3xl bg-elevated p-4 shadow-xl ring-1 ring-line">
            <div className="guide-qr relative size-40 overflow-hidden rounded-xl">
              <span className="guide-scan absolute inset-x-0 h-8" />
            </div>
            <p className="mt-3 text-center text-sm font-black tabular-nums text-ink">฿250.00</p>
          </div>
        </div>
      )
    case 'market':
      return (
        <div className="absolute inset-0">
          {(
            [
              ['💻', '฿8,900', 'mkt-kind-SELL', '6%', '10%', '-6deg', '0s'],
              ['🪴', 'ฟรี', 'mkt-kind-FREE', '52%', '2%', '5deg', '0.7s'],
              ['📚', '฿150', 'mkt-kind-SELL', '0%', '54%', '4deg', '1.4s'],
              ['🪑', '⇄', 'mkt-kind-TRADE', '50%', '50%', '-4deg', '2.1s'],
            ] as const
          ).map(([e, price, kind, x, y, r, d]) => (
            <span
              key={e}
              className="guide-tag absolute flex w-28 flex-col items-center gap-1.5 rounded-2xl px-3 pb-3 pt-4"
              style={{ left: x, top: y, rotate: r, '--dl': d } as CSSProperties}
            >
              <span className="text-4xl">{e}</span>
              <span className={cn('mkt-kind', kind)}>
                <Untranslated>{price}</Untranslated>
              </span>
            </span>
          ))}
        </div>
      )
    case 'post':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative w-44 overflow-hidden rounded-3xl bg-elevated shadow-xl ring-1 ring-line">
            <div className="mkt-preview-media relative grid h-28 place-items-center text-5xl">
              🎧
              <span className="guide-flash absolute inset-0 bg-[var(--ck-shine)]" />
              <span className="mkt-price absolute bottom-2 start-2 text-sm">฿1,290</span>
            </div>
            <div className="space-y-1.5 p-3">
              <span className="block h-2.5 w-28 rounded-full bg-ink/70" />
              <span className="block h-2 w-20 rounded-full bg-ink-faint/50" />
              <span className="mt-2 flex gap-1">
                <span className="h-4 w-10 rounded-full bg-surface" />
                <span className="h-4 w-12 rounded-full bg-surface" />
              </span>
            </div>
          </div>
          <span className="guide-person absolute end-2 top-6 grid size-14 place-items-center rounded-2xl bg-accent text-2xl" style={{ '--dl': '0.4s' } as CSSProperties}>
            📷
          </span>
        </div>
      )
    case 'mine':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <span className="guide-tag relative grid size-36 place-items-center rounded-[28px] text-7xl" style={{ '--dl': '0s' } as CSSProperties}>
            📦
            <span className="mkt-kind mkt-kind-SELL absolute -end-3 -top-3 text-xs">
              <Untranslated>3 คิว</Untranslated>
            </span>
          </span>
          <div className="absolute bottom-4 flex -space-x-2">
            {(['bg-accent', 'bg-link', 'bg-[var(--ck-gold-deep)]'] as const).map((bg, i) => (
              <span key={bg} className={cn('guide-person grid size-10 place-items-center rounded-full text-sm font-bold text-accent-ink', bg)} style={{ '--dl': `${i * 0.3}s` } as CSSProperties}>
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      )
    case 'chat':
      return (
        <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-2">
          <span className="guide-bubble max-w-[78%] self-start rounded-2xl rounded-bl-md bg-elevated px-3.5 py-2 text-sm text-ink ring-1 ring-line" style={{ '--dl': '0s' } as CSSProperties}>
            <Untranslated>ยังอยู่ไหมครับ? 👀</Untranslated>
          </span>
          <span className="guide-bubble max-w-[78%] self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-ink" style={{ '--dl': '0.6s' } as CSSProperties}>
            <Untranslated>อยู่ครับ นัดรับชั้น 8 ได้เลย</Untranslated>
          </span>
          <span className="guide-bubble max-w-[78%] self-start rounded-2xl rounded-bl-md bg-elevated px-3.5 py-2 text-sm text-ink ring-1 ring-line" style={{ '--dl': '1.2s' } as CSSProperties}>
            <Untranslated>เดี๋ยวเที่ยงไปรับนะ 🙏</Untranslated>
          </span>
          <span className="guide-bubble mt-1 inline-flex items-center gap-2 self-center rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft" style={{ '--dl': '1.8s' } as CSSProperties}>
            <Untranslated>{'🔔 มีประกาศ "คีย์บอร์ด" ใหม่'}</Untranslated>
          </span>
        </div>
      )
    case 'picks':
      return (
        <div className="absolute inset-0">
          {(
            [
              ['🍜', '4.8', '12', '4%', '8%', '-6deg', '0s'],
              ['🍣', '4.6', '9', '50%', '0%', '5deg', '0.8s'],
              ['🥗', '4.5', '7', '22%', '52%', '3deg', '1.6s'],
            ] as const
          ).map(([e, rating, hearts, x, y, r, d], i) => (
            <span
              key={e}
              className="guide-tag absolute w-32 overflow-hidden rounded-2xl"
              style={{ left: x, top: y, rotate: r, '--dl': d } as CSSProperties}
            >
              <span className="mkt-preview-media relative grid h-16 place-items-center text-3xl">
                {e}
                {i === 0 ? <span className="absolute start-1.5 top-1.5 text-base">🥇</span> : null}
              </span>
              <span className="flex items-center justify-between px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[var(--ck-gold-deep)]">★ {rating}</span>
                <span className="text-accent">♥ {hearts}</span>
              </span>
            </span>
          ))}
        </div>
      )
    case 'spin':
      return (
        <>
          <span className="room-pointer" />
          <div className="room-wheel absolute left-5 top-5 size-[220px]" />
          {(['🍜', '🍛', '🍣', '🥗', '🍕', '🍔', '🥘', '🍲'] as const).map((e, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <span
                key={e}
                className="guide-food absolute grid size-10 place-items-center rounded-full bg-elevated text-xl shadow-md ring-1 ring-line"
                style={{ left: `${50 + Math.sin(a) * 50}%`, top: `${50 - Math.cos(a) * 50}%`, '--dl': `${i * 0.25}s` } as CSSProperties}
              >
                {e}
              </span>
            )
          })}
        </>
      )
    case 'talk':
      return (
        <div className="absolute inset-0">
          {(
            [
              ['A', '4%', '6%', 'bg-accent', '0s'],
              ['B', '76%', '2%', 'bg-link', '0.6s'],
              ['C', '80%', '72%', 'bg-[var(--ck-gold-deep)]', '1.2s'],
              ['D', '2%', '74%', 'bg-ink text-page', '1.8s'],
            ] as const
          ).map(([l, x, y, bg, d]) => (
            <span key={l} className={cn('guide-person absolute grid size-12 place-items-center rounded-full text-base font-bold text-accent-ink', bg)} style={{ left: x, top: y, '--dl': d } as CSSProperties}>
              {l}
              <span className="who-dot-on absolute -bottom-0.5 -end-0.5 size-3.5 rounded-full ring-2 ring-elevated" />
            </span>
          ))}
          <div className="absolute inset-x-8 top-1/2 flex -translate-y-1/2 flex-col gap-2">
            <span className="guide-bubble max-w-[80%] self-start rounded-2xl rounded-bl-md bg-elevated px-3 py-1.5 text-xs text-ink ring-1 ring-line" style={{ '--dl': '0s' } as CSSProperties}>
              <Untranslated>เดโมบ่ายสองนะ 📊</Untranslated>
            </span>
            <span className="guide-bubble max-w-[80%] self-end rounded-2xl rounded-br-md bg-accent px-3 py-1.5 text-xs text-accent-ink" style={{ '--dl': '0.6s' } as CSSProperties}>
              <Untranslated>รับทราบ ส่งสไลด์ให้แล้ว 📎</Untranslated>
            </span>
            <span className="guide-bubble self-end text-[10px] font-semibold text-ink-faint" style={{ '--dl': '1.1s' } as CSSProperties}>
              <Untranslated>อ่านแล้ว 3</Untranslated>
            </span>
            <span className="guide-bubble inline-flex w-fit items-center gap-1 self-start rounded-full bg-surface px-3 py-1.5" style={{ '--dl': '1.6s' } as CSSProperties}>
              {[0, 1, 2].map((k) => (
                <span key={k} className="ck-live size-1.5 text-ink-soft" style={{ animationDelay: `${k * 0.2}s` }} />
              ))}
            </span>
          </div>
        </div>
      )
    case 'idcard':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="guide-tag relative w-52 overflow-hidden rounded-3xl" style={{ '--dl': '0s', rotate: '-4deg' } as CSSProperties}>
            <div className="prof-banner h-16" />
            <span className="absolute start-1/2 top-7 grid size-16 -translate-x-1/2 place-items-center rounded-full bg-accent text-2xl font-black text-accent-ink ring-4 ring-elevated">
              P
            </span>
            <div className="px-4 pb-4 pt-10 text-center">
              <span className="mx-auto block h-2.5 w-24 rounded-full bg-ink/70" />
              <span className="mx-auto mt-1.5 block h-2 w-16 rounded-full bg-ink-faint/50" />
              <span className="mt-3 flex justify-center gap-1">
                {[3, 1, 2, 1, 3, 2, 1, 3, 1, 2, 3, 1].map((w, k) => (
                  <span key={k} className="h-5 rounded-sm bg-ink/70" style={{ width: w * 2 }} />
                ))}
              </span>
            </div>
          </div>
          <span className="guide-person absolute end-2 top-8 grid size-12 place-items-center rounded-2xl bg-elevated text-2xl shadow-md ring-1 ring-line" style={{ '--dl': '0.6s' } as CSSProperties}>
            🔔
          </span>
          <span className="guide-person absolute bottom-8 start-2 grid size-12 place-items-center rounded-2xl bg-elevated text-2xl shadow-md ring-1 ring-line" style={{ '--dl': '1.2s' } as CSSProperties}>
            📷
          </span>
        </div>
      )
    case 'quiz':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="guide-tag w-56 rounded-3xl p-3" style={{ '--dl': '0s' } as CSSProperties}>
            <div className="flex items-center gap-2">
              <span className="quiz-ring grid size-10 place-items-center rounded-full" style={{ '--p': '250deg' } as CSSProperties}>
                <span className="grid size-[30px] place-items-center rounded-full bg-elevated text-xs font-black text-ink">12</span>
              </span>
              <span className="h-2.5 flex-1 rounded-full bg-ink/70" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {(['red', 'blue', 'gold', 'green'] as const).map((tone, k) => (
                <span key={tone} className={cn('quiz-choice grid h-11 place-items-center rounded-xl text-base font-black', `quiz-tone-${tone}`, k === 1 && 'quiz-choice-correct')}>
                  {['▲', '◆', '●', '■'][k]}
                </span>
              ))}
            </div>
          </div>
          {(
            [
              ['🙋', '2%', '6%', '0s'],
              ['🎉', '82%', '10%', '0.6s'],
              ['🏆', '78%', '74%', '1.2s'],
              ['⚡', '4%', '76%', '1.8s'],
            ] as const
          ).map(([e, x, y, d]) => (
            <span key={e} className="guide-person absolute grid size-12 place-items-center rounded-2xl bg-elevated text-2xl ring-1 ring-line" style={{ left: x, top: y, '--dl': d } as CSSProperties}>
              {e}
            </span>
          ))}
        </div>
      )
    case 'connect4':
      return (
        <div className="absolute inset-0 grid place-items-center">
          <div className="c4-board c4-art w-[230px] rounded-[22px] p-2.5">
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 42 }, (_, i) => {
                const red = [35, 29, 23, 17, 36, 31].includes(i)
                const gold = [37, 38, 30, 24, 39].includes(i)
                return (
                  <span key={i} className="c4-hole relative aspect-square rounded-full">
                    {red || gold ? (
                      <span
                        className={cn('c4-disc c4-drop absolute inset-[6%]', red ? 'c4-red' : 'c4-gold', [35, 29, 23, 17].includes(i) && 'c4-win')}
                        style={{ '--fall': Math.floor(i / 7) + 1, animationDelay: `${(i % 7) * 0.15}s` } as CSSProperties}
                      />
                    ) : null}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )
    case 'vinyl':
    case 'stage':
      return (
        <div className="absolute inset-0">
          {/* ★ แผ่นเสียงหมุน — ร่องจาก repeating-radial-gradient · ฉลากกลางสีแบรนด์ */}
          <div className={cn('mus-vinyl absolute', kind === 'vinyl' ? 'left-6 top-6 size-[200px]' : 'left-[50px] top-[50px] size-[160px]')}>
            <span className="mus-vinyl-label" />
          </div>
          {kind === 'vinyl' ? <span className="mus-arm" /> : null}
          {kind === 'vinyl'
            ? (
                [
                  ['♪', '78%', '6%', '0s'],
                  ['♫', '2%', '64%', '0.7s'],
                  ['♬', '84%', '58%', '1.4s'],
                ] as const
              ).map(([n, x, y, d]) => (
                <span key={n} className="mus-note absolute grid size-11 place-items-center rounded-2xl text-xl font-black" style={{ left: x, top: y, '--dl': d } as CSSProperties}>
                  {n}
                </span>
              ))
            : (
                [
                  ['A', '2%', '8%', 'bg-accent', '0s'],
                  ['B', '78%', '4%', 'bg-link', '0.6s'],
                  ['C', '82%', '70%', 'bg-[var(--ck-gold-deep)]', '1.2s'],
                  ['D', '0%', '72%', 'bg-ink text-page', '1.8s'],
                ] as const
              ).map(([l, x, y, bg, d]) => (
                <span key={l} className={cn('guide-person absolute grid size-12 place-items-center rounded-full text-base font-bold text-accent-ink', bg)} style={{ left: x, top: y, '--dl': d } as CSSProperties}>
                  {l}
                </span>
              ))}
          {kind === 'stage'
            ? ['❤️', '🔥', '👏'].map((e, i) => (
                <span key={e} className="mus-float absolute text-2xl" style={{ left: `${36 + i * 14}%`, '--dl': `${i * 0.9}s` } as CSSProperties}>
                  {e}
                </span>
              ))
            : null}
          {/* ★ อีควอไลเซอร์ใต้แผ่น — บอกว่า "กำลังเล่นอยู่" โดยไม่ต้องมีคำ */}
          <span className="absolute inset-x-12 bottom-0 flex h-8 items-end justify-center gap-1">
            {[10, 22, 14, 28, 18, 24, 12, 20, 16].map((h, i) => (
              <span key={i} className="eq-bar mus-eq w-1.5 rounded-full" style={{ height: h, animationDuration: `${0.6 + (i % 4) * 0.15}s`, animationDelay: `${i * 0.08}s` }} />
            ))}
          </span>
        </div>
      )
    case 'hub':
    default:
      return (
        <div className="absolute inset-0">
          {(
            [
              ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v4l3 2', '18%', '8%', 'bg-accent text-accent-ink', '0s'],
              ['M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16', '58%', '4%', 'bg-ink text-page', '0.4s'],
              ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6', '4%', '44%', 'bg-link text-accent-ink', '0.8s'],
              ['M3 7h18v10H3zM7 11h.01M10 11h.01M13 11h.01M16 11h.01M8 14h8', '40%', '38%', 'bg-elevated text-ink', '1.2s'],
              ['M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M10 17h4l1 3H9z', '72%', '42%', 'bg-[var(--ck-gold)] text-ink', '1.6s'],
              ['M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM9 8v8', '24%', '74%', 'bg-surface text-ink', '2s'],
              ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 9h.01M16 9h.01M8 15c1.5 1.3 6.5 1.3 8 0', '60%', '76%', 'bg-accent text-accent-ink', '2.4s'],
            ] as const
          ).map(([d, x, y, cls, dl]) => (
            <span key={d} className={cn('room-peer size-14 rounded-2xl', cls)} style={{ left: x, top: y, '--dl': dl } as CSSProperties}>
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d={d} />
              </svg>
            </span>
          ))}
        </div>
      )
  }
}

