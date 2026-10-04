'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { apiFetch } from '@/lib/api/client'
import { useConfirm } from '@/components/ConfirmProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { splitList } from '@/lib/i18n/office-format'
import { departmentLabel } from '@/lib/office/departments'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  pickCaptain,
  splitTeams,
  type Member,
  type SplitOptions,
  type Team,
} from '@/lib/office/teams'
import {
  checkFeasible,
  splitTeamsWithRules,
  type TeamRule,
} from '@/lib/office/team-rules'
import { splitBalanced, strengthSpread } from '@/lib/office/skill'
import { drawBracketOrder } from '@/lib/office/skill'
import { useRouter } from 'next/navigation'
import { playCelebrate, playTick, vibrate } from '@/lib/office/sound'
import { prefersReducedMotion } from '@/lib/office/draw'
import { Confetti } from './Confetti'
import { FunGuide } from './FunGuide'

type Person = { id: string; name: string; department: string | null }
type NameSet = { id: string; name: string; members: Member[] }

/** สุ่มทีม (FR-C03 / C04 / C05 / C07) */
export function FunTeams() {
  const ot = useOt()
  const confirm = useConfirm()
  const locale = useLocale()
  const router = useRouter()
  const [people, setPeople] = useState<Person[]>([])
  const [sets, setSets] = useState<NameSet[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const resultRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'BY_TEAMS' | 'BY_SIZE'>('BY_TEAMS')
  const [value, setValue] = useState(2)
  const [mix, setMix] = useState(true)
  const [teams, setTeams] = useState<Team[] | null>(null)
  /** FR-C07 — สุ่มใหม่ได้ 1 ครั้งต่อรอบ */
  const [redrawUsed, setRedrawUsed] = useState(false)
  const [captains, setCaptains] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  /** จำนวนคนที่เปิดแล้ว — ใช้ทำแอนิเมชันเปิดทีละคน (FR-C04) */
  const [revealed, setRevealed] = useState(0)
  /** FR-C06 — เงื่อนไขคู่ที่ต้อง/ห้ามอยู่ทีมเดียวกัน */
  const [rules, setRules] = useState<TeamRule[]>([])
  const [ruleA, setRuleA] = useState('')
  const [ruleB, setRuleB] = useState('')
  const [ruleKind, setRuleKind] = useState<'TOGETHER' | 'APART'>('TOGETHER')
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [unmet, setUnmet] = useState<{ n: number; tries: number } | null>(null)
  /** FR-C09 — ถ่วงฝีมือจากสถิติชนะ-แพ้ */
  const [useSkill, setUseSkill] = useState(false)
  const [skills, setSkills] = useState<Map<string, number>>(new Map())
  const [creatingCup, setCreatingCup] = useState(false)

  useEffect(() => {
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => setPeople(d.items))
      .catch(() => undefined)
    void apiFetch<{ items: NameSet[] }>('/api/office/fun/name-sets')
      .then((d) => setSets(d.items))
      .catch(() => undefined)
    void apiFetch<{ stats: { userId: string; skill: number }[] }>('/api/office/fun/tournaments')
      .then((d) => setSkills(new Map(d.stats.map((s) => [s.userId, s.skill]))))
      .catch(() => undefined)
  }, [])

  const total = members.length
  const revealTarget = teams?.reduce((s, t) => s + t.members.length, 0) ?? 0

  /*
   * ★★ เปิดชื่อทีละคนด้วย timer ไม่ใช่ CSS animation-delay
   *
   *    animation-delay ทำให้ทุกใบเริ่มนับเวลาพร้อมกันตั้งแต่ render
   *    ★ ถ้าเครื่องช้าจน render ไม่ทัน ใบท้าย ๆ จะโผล่พร้อมกันหมด
   *      timer เดินตามความจริงของเครื่องเสมอ
   *
   *    ★ คนสุดท้ายช้าที่สุดตามที่หัวข้อ 4.1 กำหนด
   */
  useEffect(() => {
    if (!teams || revealed >= revealTarget) return

    const isLast = revealed === revealTarget - 1
    const delay = prefersReducedMotion() ? 60 : isLast ? 900 : 320

    const id = window.setTimeout(() => {
      setRevealed((n) => n + 1)
      playTick()
      if (isLast) {
        playCelebrate()
        vibrate([30, 40, 60])
      }
    }, delay)

    return () => window.clearTimeout(id)
  }, [teams, revealed, revealTarget])

  function draw(isRedraw = false) {
    if (members.length < 2) return

    /*
     * ★★ ชื่อทีมมาจากดิกชันนารี ไม่ได้ฝังอยู่ใน lib/office/teams.ts แล้ว
     *    ★ แต่ละภาษาเลือกชื่อที่ฟังดูเท่ในภาษาตัวเองได้ และไม่ต้องมี
     *      จำนวนเท่าไทย — splitTeams() ตกไปที่ teamFallback เมื่อชื่อไม่พอ
     */
    const opts = {
      mode,
      value,
      mixDepartments: mix,
      teamNames: splitList(ot('fun.team.names')),
      teamFallback: (i: number) => ot('fun.team.teamN', { n: i + 1 }),
    }
    const teamCount =
      mode === 'BY_TEAMS'
        ? Math.max(1, Math.min(value, members.length))
        : Math.max(1, Math.ceil(members.length / Math.max(1, value)))

    /*
     * ★★ ตรวจว่าเงื่อนไขเป็นไปได้ก่อนสุ่ม
     *    ถ้าไม่ตรวจ ผู้ใช้จะเห็นผลที่ผิดเงื่อนไขโดยไม่รู้ว่าเพราะอะไร —
     *    "เป็นไปไม่ได้" กับ "สุ่มไม่เจอ" เป็นคนละปัญหาที่แก้คนละวิธี
     */
    const feasible = checkFeasible(members, teamCount, rules)
    if (!feasible.ok) {
      setRuleError(
        ot('fun.rules.impossible', {
          reason: ot(feasible.reason.key, feasible.reason.params),
        }),
      )
      return
    }
    setRuleError(null)

    /*
     * ★★ ถ่วงฝีมือแทนที่ตัวแบ่งทีม ไม่ใช่แก้ผลทีหลัง
     *    ส่ง splitBalanced เข้าไปเป็น splitFn ของ splitTeamsWithRules
     *    ★ เงื่อนไขทีม (FR-C06) จึงยังทำงานร่วมกับถ่วงฝีมือได้ทันที
     *      โดยไม่ต้องเขียน logic ผสมสองอย่างขึ้นมาใหม่
     */
    const splitFn = useSkill
      ? (m: Member[], o: SplitOptions) => {
          const n =
            o.mode === 'BY_TEAMS'
              ? Math.max(1, Math.min(o.value, m.length))
              : Math.max(1, Math.ceil(m.length / Math.max(1, o.value)))
          return splitBalanced(m, n, skills).map((group, i) => ({
            name: ot('fun.team.teamN', { n: i + 1 }),
            color: ['#ff0033', '#3ea6ff', '#ffd24d', '#4ade80', '#c084fc', '#fb923c'][i % 6]!,
            members: group,
          }))
        }
      : splitTeams

    const result = splitTeamsWithRules(members, opts, rules, splitFn)
    setTeams(result.teams)
    setUnmet(result.unmet.length > 0 ? { n: result.unmet.length, tries: result.tries } : null)
    setRevealed(0)
    setCaptains({})
    setCopied(false)
    if (isRedraw) setRedrawUsed(true)
    /* ★ มือถือกดปุ่มที่ติดขอบล่างหลังเลื่อนรายชื่อยาว ๆ — พาขึ้นไปดูผลทันที */
    window.requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
    )
  }

  function newRound() {
    setTeams(null)
    setRedrawUsed(false)
    setRevealed(0)
    setCaptains({})
    setUnmet(null)
  }

  function addRule() {
    if (!ruleA || !ruleB || ruleA === ruleB) return
    /* ★ กันเงื่อนไขซ้ำคู่เดิม — คู่เดียวกันมีได้ข้อเดียว */
    setRules((p) => [
      ...p.filter((r) => !((r.a === ruleA && r.b === ruleB) || (r.a === ruleB && r.b === ruleA))),
      { kind: ruleKind, a: ruleA, b: ruleB },
    ])
    setRuleA('')
    setRuleB('')
    setRuleError(null)
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.label ?? '—'

  /** FR-C08 — สร้างสายจากทีมที่แบ่งไว้ */
  async function createCup() {
    if (!teams || teams.length < 2) return
    const cupName = ot('fun.team.matchOn', { date: new Date().toLocaleDateString(locale) })
    if (!(await confirm({ kind: 'create', subject: cupName }))) return
    setCreatingCup(true)
    try {
      /* ★ สุ่มลำดับฝั่ง client แล้วส่งไป — server ไม่สุ่มให้ (ดู migration 0032) */
      const ordered = drawBracketOrder(teams)
      const res = await apiFetch<{ id: string }>('/api/office/fun/tournaments', {
        method: 'POST',
        body: {
          name: cupName,
          teams: ordered.map((t) => ({
            name: t.name,
            color: t.color,
            members: t.members.map((m) => ({
              /* ★ ส่ง id เฉพาะคนในระบบ — ชื่อที่พิมพ์เองไม่มี id และไม่ถูกนับสถิติ */
              ...(m.id.startsWith('typed:') ? {} : { id: m.id }),
              label: m.label,
            })),
          })),
        },
      })
      router.push(`/office/fun/cup?open=${res.id}`)
    } catch {
      setCreatingCup(false)
    }
  }

  function copyResult() {
    if (!teams) return
    const text = teams
      .map((t) => `${t.name}: ${t.members.map((m) => m.label).join(', ')}`)
      .join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    })
  }

  const done = teams !== null && revealed >= revealTarget

  /* ★ คำนวณไว้ล่วงหน้า — TypeScript narrow teams จาก done ไม่ได้
     และการใส่ ! ใน JSX จะซ่อนข้อผิดพลาดจริงที่อาจเกิดในอนาคต */
  const spread = teams ? strengthSpread(teams, skills) : 0

  /** ★ นับว่าคนที่ i ของทีม t ควรเปิดหรือยัง — เปิดวนทีละทีมตามลำดับการแจก */
  const revealOrder = useMemo(() => {
    if (!teams) return new Map<string, number>()
    const order = new Map<string, number>()
    let n = 0
    const max = Math.max(...teams.map((t) => t.members.length))
    for (let i = 0; i < max; i++) {
      for (const t of teams) {
        const m = t.members[i]
        if (m) order.set(m.id, n++)
      }
    }
    return order
  }, [teams])


  /* ── ค้นหาคน ───────────────────────────────────────────────── */
  const q = search.trim().toLowerCase()
  const shownPeople = q
    ? people.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (departmentLabel(ot, p.department)?.toLowerCase().includes(q) ?? false),
      )
    : people
  const picked = new Set(members.map((m) => m.id))
  const typedMembers = members.filter((m) => m.id.startsWith('typed:'))
  const allShownPicked = shownPeople.length > 0 && shownPeople.every((p) => picked.has(p.id))

  function togglePerson(p: Person) {
    setMembers((m) =>
      m.some((x) => x.id === p.id)
        ? m.filter((x) => x.id !== p.id)
        : [...m, { id: p.id, label: p.name, department: p.department }],
    )
  }

  /* ★ "เลือกทั้งหมด" ทำกับผลค้นหาที่เห็นอยู่ — ค้น "ไอที" แล้วกดได้ทั้งฝ่ายในทีเดียว */
  function toggleAllShown() {
    if (allShownPicked) {
      const drop = new Set(shownPeople.map((p) => p.id))
      setMembers((m) => m.filter((x) => !drop.has(x.id)))
    } else {
      setMembers((m) => [
        ...m,
        ...shownPeople
          .filter((p) => !m.some((x) => x.id === p.id))
          .map((p) => ({ id: p.id, label: p.name, department: p.department })),
      ])
    }
  }

  function addTyped() {
    const name = typed.trim()
    if (!name) return
    setMembers((m) => [...m, { id: `typed:${crypto.randomUUID()}`, label: name }])
    setTyped('')
  }

  /* ── ตัวอย่างผลก่อนกด: กี่ทีม ทีมละกี่คน ───────────────────────── */
  const previewTeams =
    total < 2
      ? 0
      : mode === 'BY_TEAMS'
        ? Math.max(1, Math.min(value, total))
        : Math.max(1, Math.ceil(total / Math.max(1, value)))
  const base = previewTeams ? Math.floor(total / previewTeams) : 0
  const extra = previewTeams ? total % previewTeams : 0
  const sizeRange = extra ? `${base}–${base + 1}` : `${base}`
  const maxValue = Math.max(2, Math.min(50, total || 50))

  function revealAll() {
    setRevealed(revealTarget)
    playCelebrate()
  }

  return (
    <div className="py-2">
      {!teams ? <FunGuide id="team" art="teams" /> : null}
      {!teams ? (
        <div className="mt-6 grid items-start gap-5 pb-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0">
          {/* ═══ ผู้เล่น ═══════════════════════════════════════════ */}
          <section className="team-panel rounded-3xl p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink shadow-sm">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-ink">{ot('fun.team.players')}</h2>
                <p className="text-xs text-ink-faint">
                  <Untranslated>{total < 2 ? ot('fun.team.need') : ot('fun.team.memberCount', { n: total })}</Untranslated>
                </p>
              </div>
              <span
                key={total}
                className="team-count-pop grid h-11 min-w-11 place-items-center rounded-2xl bg-ink px-3 text-lg font-bold tabular-nums text-page"
              >
                {total}
              </span>
            </div>

            {/* ── ค้นหา + เลือกทั้งหมด ── */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ot('fun.team.search')}
                  aria-label={ot('fun.team.search')}
                  className="h-11 w-full rounded-full border border-line bg-input ps-10 pe-4 text-base text-ink outline-none placeholder:text-ink-faint focus:border-line-strong sm:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={toggleAllShown}
                disabled={shownPeople.length === 0}
                className="inline-flex h-11 shrink-0 items-center rounded-full bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                <Untranslated>{allShownPicked ? ot('fun.team.clearAll') : ot('fun.team.selectAll')}</Untranslated>
              </button>
            </div>

            {/* ── รายชื่อ ── */}
            <div className="mt-3 flex max-h-[26rem] flex-wrap content-start gap-2 overflow-y-auto overscroll-contain pe-1">
              {shownPeople.map((p) => {
                const on = picked.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePerson(p)}
                    className="team-person inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-surface py-1 pe-3.5 ps-1 text-[13px] text-ink-soft hover:bg-surface-hover hover:text-ink sm:min-h-10"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
                        on ? 'bg-accent text-accent-ink' : 'bg-elevated text-ink-soft ring-1 ring-line',
                      )}
                    >
                      {on ? (
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 12 5 5 9-10" />
                        </svg>
                      ) : (
                        p.name.trim().slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span dir="auto" className="truncate font-medium">{p.name}</span>
                    {p.department ? (
                      <span className="hidden shrink-0 opacity-60 sm:inline" dir="auto">
                        {departmentLabel(ot, p.department)}
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {q && shownPeople.length === 0 ? (
                <p className="w-full py-6 text-center text-sm text-ink-faint">
                  <Untranslated>{ot('fun.team.noMatch')}</Untranslated>
                </p>
              ) : null}
            </div>

            {/* ── พิมพ์ชื่อเพิ่ม (คนนอกระบบ) ── */}
            <div className="mt-4 border-t border-line pt-4">
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
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={addTyped}
                  disabled={!typed.trim()}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <Untranslated>{ot('fun.team.add')}</Untranslated>
                </button>
              </div>

              {typedMembers.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {typedMembers.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-surface ps-3 text-[13px] text-ink">
                      <span dir="auto" className="max-w-40 truncate">{m.label}</span>
                      <button
                        type="button"
                        onClick={() => setMembers((x) => x.filter((y) => y.id !== m.id))}
                        aria-label={`✕ ${m.label}`}
                        className="grid size-11 place-items-center rounded-full text-ink-faint transition-colors hover:text-danger sm:size-9"
                      >
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {sets.length > 0 ? (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-xs font-medium text-ink-faint">{ot('fun.sets.title')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMembers(s.members)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-elevated px-3.5 text-[13px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink sm:min-h-9"
                    >
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 3h12v18l-6-4-6 4z" />
                      </svg>
                      {s.name}
                      <span className="tabular-nums text-ink-faint">· {s.members.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* ═══ ตั้งค่า + ปุ่มแบ่ง ═════════════════════════════════ */}
          <aside className="team-panel flex flex-col gap-4 rounded-3xl p-4 sm:p-5 lg:sticky lg:top-[calc(var(--spacing-header)+16px)]">
            <h2 className="text-base font-semibold text-ink">
              <Untranslated>{ot('fun.team.settings')}</Untranslated>
            </h2>

            <div role="radiogroup" aria-label={ot('fun.team.settings')} className="grid grid-cols-2 rounded-full bg-surface p-1">
              {(['BY_TEAMS', 'BY_SIZE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'h-10 rounded-full px-2 text-[13px] transition-all',
                    mode === m ? 'bg-elevated font-semibold text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {m === 'BY_TEAMS' ? ot('fun.team.byTeams') : ot('fun.team.bySize')}
                </button>
              ))}
            </div>

            {/* ── ตัวเลข: ปุ่มกดใหญ่ ไม่ต้องพิมพ์ ── */}
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-2">
              <button
                type="button"
                onClick={() => setValue((v) => Math.max(1, v - 1))}
                disabled={value <= 1}
                aria-label={ot('fun.team.decrease')}
                className="grid size-12 place-items-center rounded-xl bg-elevated text-ink shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
              <div className="text-center">
                <p key={value} className="team-count-pop text-3xl font-bold tabular-nums text-ink">{value}</p>
                <p className="text-[11px] text-ink-faint">
                  <Untranslated>{mode === 'BY_TEAMS' ? ot('fun.team.countTeams') : ot('fun.team.countSize')}</Untranslated>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setValue((v) => Math.min(maxValue, v + 1))}
                disabled={value >= maxValue}
                aria-label={ot('fun.team.increase')}
                className="grid size-12 place-items-center rounded-xl bg-elevated text-ink shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>

            {/* ── ตัวอย่างผล — รู้ก่อนกดว่าจะได้อะไร ── */}
            {previewTeams > 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-3 py-2.5">
                <p className="text-center text-xs text-ink-soft">
                  <Untranslated>{ot('fun.team.preview', { teams: previewTeams, range: sizeRange })}</Untranslated>
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5" aria-hidden="true">
                  {Array.from({ length: Math.min(previewTeams, 12) }, (_, i) => (
                    <span key={i} className="flex items-end gap-0.5 rounded-lg bg-surface px-1.5 py-1">
                      {Array.from({ length: Math.min(base + (i < extra ? 1 : 0), 8) }, (_, k) => (
                        <span key={k} className="size-1.5 rounded-full bg-ink-soft" />
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col">
              <Toggle
                on={mix}
                onChange={setMix}
                title={ot('fun.team.mixDepartments')}
                hint={ot('fun.team.mixHint')}
              />
              <Toggle
                on={useSkill}
                onChange={setUseSkill}
                title={ot('fun.stats.useSkill')}
                hint={ot('fun.stats.useSkillHint')}
              />
            </div>

            {/* ── เงื่อนไขการจับทีม (FR-C06) — ยุบไว้ เพราะคนส่วนใหญ่ไม่ใช้ ── */}
            <details className="group rounded-2xl bg-surface/60" open={rules.length > 0 || undefined}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{ot('fun.rules.title')}</span>
                  <span className="block text-[11px] text-ink-faint">{ot('fun.rules.hint')}</span>
                </span>
                {rules.length > 0 ? (
                  <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold tabular-nums text-page">
                    {rules.length}
                  </span>
                ) : null}
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>

              <div className="px-3 pb-3">
                {members.length < 2 ? (
                  <p className="text-xs text-ink-faint">{ot('fun.rules.needTwo')}</p>
                ) : (
                  <>
                    <div className="flex gap-1.5">
                      <Chip active={ruleKind === 'TOGETHER'} onClick={() => setRuleKind('TOGETHER')}>
                        {ot('fun.rules.together')}
                      </Chip>
                      <Chip active={ruleKind === 'APART'} onClick={() => setRuleKind('APART')}>
                        {ot('fun.rules.apart')}
                      </Chip>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <PersonSelect members={members} value={ruleA} onChange={setRuleA} />
                      <span className="text-xs text-ink-faint">+</span>
                      <PersonSelect members={members} value={ruleB} onChange={setRuleB} />
                      <button
                        type="button"
                        onClick={addRule}
                        disabled={!ruleA || !ruleB || ruleA === ruleB}
                        aria-label={ot('fun.rules.add')}
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-page transition-opacity disabled:opacity-35 sm:size-9"
                      >
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>

                    {rules.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1">
                        {rules.map((r, i) => (
                          <li key={`${r.a}-${r.b}`} className="flex items-center gap-2 rounded-xl bg-elevated ps-2 text-xs">
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5',
                                r.kind === 'TOGETHER' ? 'bg-surface text-ink' : 'bg-danger/15 text-danger',
                              )}
                            >
                              {r.kind === 'TOGETHER' ? ot('fun.rules.together') : ot('fun.rules.apart')}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-ink-soft">
                              {nameOf(r.a)} · {nameOf(r.b)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRules((p) => p.filter((_, j) => j !== i))}
                              className="grid size-11 shrink-0 place-items-center text-ink-faint hover:text-danger sm:size-9"
                              aria-label={ot('fun.team.removeRule')}
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-ink-faint">{ot('fun.rules.empty')}</p>
                    )}
                  </>
                )}
              </div>
            </details>

            {ruleError ? (
              <p role="alert" className="text-xs text-danger">
                {ruleError}
              </p>
            ) : null}

            {/*
              * ★★ มือถือ: ปุ่มแบ่งทีมลอยติดขอบล่างจอตลอด (แถบ fixed ด้านล่าง)
              *    ★ รายชื่อ 30 กว่าคนยาวเกินจอ — เลือกคนเสร็จกดได้ทันที ไม่ต้องเลื่อนหาปุ่ม
              *    ★ จอกว้างอยู่ในแผงตั้งค่าตามปกติ
              */}
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={() => draw(false)}
                disabled={members.length < 2}
                className="team-go flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-base font-bold"
              >
                <svg viewBox="0 0 24 24" className="team-go-dice size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
                  <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
                  <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                </svg>
                {members.length >= 2 ? (
                  <Untranslated>{ot('fun.team.drawN', { n: total })}</Untranslated>
                ) : (
                  ot('fun.team.draw')
                )}
              </button>
            </div>
          </aside>

          <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 lg:hidden">
                <button
                type="button"
                onClick={() => draw(false)}
                disabled={members.length < 2}
                className="team-go flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-base font-bold"
              >
                <svg viewBox="0 0 24 24" className="team-go-dice size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
                  <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
                  <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                </svg>
                {members.length >= 2 ? (
                  <Untranslated>{ot('fun.team.drawN', { n: total })}</Untranslated>
                ) : (
                  ot('fun.team.draw')
                )}
              </button>
          </div>
        </div>
      ) : (
        /* ═══ ผลการแบ่ง ═══════════════════════════════════════════ */
        <div ref={resultRef} className="relative mt-4 scroll-mt-[calc(var(--spacing-header)+12px)]">
          <div className="team-panel mb-4 flex flex-wrap items-center gap-3 rounded-3xl p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-ink">
                <Untranslated>{ot('fun.team.resultTitle')}</Untranslated>
              </h2>
              <p className="text-xs text-ink-soft">
                <Untranslated>
                  {done
                    ? ot('fun.team.summary', { teams: teams.length, n: revealTarget })
                    : ot('fun.team.revealing', { n: revealed, total: revealTarget })}
                </Untranslated>
              </p>
            </div>
            {!done ? (
              <button
                type="button"
                onClick={revealAll}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-hover"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 5 7 7-7 7M13 5l7 7-7 7" />
                </svg>
                <Untranslated>{ot('fun.team.revealAll')}</Untranslated>
              </button>
            ) : null}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
              <div
                className="team-progress h-full rounded-full"
                style={{ width: `${revealTarget ? (revealed / revealTarget) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t, ti) => (
              <section
                key={t.name}
                className={cn('team-card rounded-3xl p-4 pt-5', done && 'team-card-done')}
                style={{ '--tc': t.color, '--i': ti } as CSSProperties}
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="team-badge grid size-10 shrink-0 place-items-center rounded-2xl text-base font-black">
                    {ti + 1}
                  </span>
                  <input
                    defaultValue={t.name}
                    /* ★ FR-C04: ชื่อทีมแก้ได้ — ไม่ต้อง state แยก
                       เพราะไม่มีอะไรอื่นอ่านค่านี้นอกจากตาคน */
                    aria-label={t.name}
                    className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent text-lg font-bold text-ink outline-none focus:bg-surface focus:px-2"
                    maxLength={20}
                  />
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-soft">
                    <Untranslated>{ot('fun.team.memberCount', { n: t.members.length })}</Untranslated>
                  </span>
                </div>

                <ul className="mt-3 flex flex-col gap-1.5">
                  {t.members.map((m) => {
                    const idx = revealOrder.get(m.id) ?? 0
                    const show = idx < revealed
                    const captain = show && captains[t.name] === m.id
                    return (
                      <li key={m.id} className="min-h-11">
                        {show ? (
                          <div
                            className={cn(
                              'team-reveal flex min-h-11 items-center gap-2.5 rounded-2xl px-2 py-1.5',
                              captain ? 'team-captain' : 'bg-surface/70',
                            )}
                          >
                            <span aria-hidden="true" className="team-avatar grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold">
                              {m.label.trim().slice(0, 1).toUpperCase()}
                            </span>
                            <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                              {m.label}
                            </span>
                            {captain ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink" title={ot('fun.team.captainBadge')}>
                                <svg viewBox="0 0 24 24" className="team-crown size-5" fill="currentColor" aria-hidden="true">
                                  <path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5z" />
                                  <rect x="5" y="19.2" width="14" height="2.3" rx="1" />
                                </svg>
                                {ot('fun.team.captainBadge')}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div aria-hidden="true" className="team-slot flex min-h-11 items-center gap-2.5 rounded-2xl px-2">
                            <span className="grid size-8 place-items-center rounded-full bg-surface text-xs font-bold text-ink-faint">?</span>
                            <span className="h-2.5 w-24 rounded-full bg-surface" />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {done ? (
                  <button
                    type="button"
                    onClick={() => {
                      const c = pickCaptain(t)
                      if (c) {
                        setCaptains((p) => ({ ...p, [t.name]: c.id }))
                        playCelebrate()
                      }
                    }}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-[13px] font-medium text-ink-soft transition-colors hover:border-ink-soft hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                      <path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5z" />
                    </svg>
                    {ot('fun.team.captain')}
                  </button>
                ) : null}
              </section>
            ))}
          </div>

          {done ? (
            <>
              {useSkill ? (
                <p className="mt-5 text-center text-xs text-ink-soft">
                  {ot('fun.stats.spread', { n: spread })}
                  {spread < 0.15 ? ` · ✓ ${ot('fun.stats.balanced')}` : ''}
                </p>
              ) : null}

              {rules.length > 0 ? (
                <p className={cn('mt-3 text-center text-xs', unmet ? 'text-danger' : 'text-ink-soft')}>
                  {unmet ? ot('fun.rules.unmet', { n: unmet.n, tries: unmet.tries }) : `✓ ${ot('fun.rules.met')}`}
                </p>
              ) : null}

              {redrawUsed ? (
                <p className="mt-2 text-center text-xs text-warn">{ot('fun.team.wasRedrawn')}</p>
              ) : null}

              <div className="mx-auto mt-5 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
                <Button
                  variant="primary"
                  className="min-h-12"
                  disabled={redrawUsed}
                  title={redrawUsed ? ot('fun.team.redrawUsed') : undefined}
                  onClick={() => draw(true)}
                >
                  {redrawUsed ? ot('fun.team.redrawUsed') : ot('fun.team.redraw')}
                </Button>
                <Button className="min-h-12" onClick={copyResult}>
                  {copied ? ot('fun.team.copied') : ot('fun.team.copy')}
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-12"
                  loading={creatingCup}
                  disabled={teams.length < 2}
                  onClick={createCup}
                >
                  {ot('fun.cup.create')}
                </Button>
                <Button variant="ghost" className="min-h-12" onClick={newRound}>
                  {ot('fun.name.reset')}
                </Button>
              </div>

              <Confetti />
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** สวิตช์เปิด/ปิด พร้อมคำอธิบาย — ทั้งแถวกดได้ */
function Toggle({
  on,
  onChange,
  title,
  hint,
}: {
  on: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl py-2 text-start"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-surface-hover')}
      >
        <span
          className={cn(
            'absolute top-0.5 size-6 rounded-full bg-[var(--ck-shine)] shadow transition-all',
            on ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </span>
    </button>
  )
}

/** ช่องเลือกคนสำหรับตั้งเงื่อนไข — ใช้ select เพราะรายชื่ออาจยาวมาก */
function PersonSelect({
  members,
  value,
  onChange,
}: {
  members: Member[]
  value: string
  onChange: (v: string) => void
}) {
  const ot = useOt()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-11 min-w-0 flex-1 rounded-full bg-elevated px-3 text-base text-ink sm:h-9 sm:text-[13px]',
        'border border-line outline-none focus:border-line-strong',
      )}
    >
      <option value="">{ot('fun.rules.pick')}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-10 flex-1 rounded-full px-3 text-[13px] transition-colors sm:h-8',
        active ? 'bg-ink text-page' : 'bg-elevated text-ink-soft hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}
