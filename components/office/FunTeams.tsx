'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { splitList } from '@/lib/i18n/office-format'
import { departmentLabel } from '@/lib/office/departments'
import { useOt } from '@/lib/i18n/office'
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

type Person = { id: string; name: string; department: string | null }
type NameSet = { id: string; name: string; members: Member[] }

/** สุ่มทีม (FR-C03 / C04 / C05 / C07) */
export function FunTeams() {
  const ot = useOt()
  const locale = useLocale()
  const router = useRouter()
  const [people, setPeople] = useState<Person[]>([])
  const [sets, setSets] = useState<NameSet[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [typed, setTyped] = useState('')
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
    setCreatingCup(true)
    try {
      /* ★ สุ่มลำดับฝั่ง client แล้วส่งไป — server ไม่สุ่มให้ (ดู migration 0032) */
      const ordered = drawBracketOrder(teams)
      const res = await apiFetch<{ id: string }>('/api/office/fun/tournaments', {
        method: 'POST',
        body: {
          name: ot('fun.team.matchOn', { date: new Date().toLocaleDateString(locale) }),
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

  return (
    <div className="py-2">

      {!teams ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
            <p className="text-sm font-medium text-ink">
              {ot('fun.team.players')} ({total})
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setMembers((m) =>
                      m.some((x) => x.id === p.id)
                        ? m.filter((x) => x.id !== p.id)
                        : [...m, { id: p.id, label: p.name, department: p.department }],
                    )
                  }
                  className={cn(
                    'h-8 rounded-full px-3 text-[13px] transition-colors',
                    members.some((m) => m.id === p.id)
                      ? 'bg-ink text-page'
                      : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                  )}
                >
                  <span dir="auto">{p.name}</span>
                  {p.department ? (
                    <span className="ms-1 opacity-60" dir="auto">
                      · {departmentLabel(ot, p.department)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Input radius="round"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typed.trim()) {
                    e.preventDefault()
                    setMembers((m) => [
                      ...m,
                      { id: `typed:${crypto.randomUUID()}`, label: typed.trim() },
                    ])
                    setTyped('')
                  }
                }}
                placeholder={ot('fun.name.addPlaceholder')}
                maxLength={60}
              />
            </div>

            {members.filter((m) => m.id.startsWith('typed:')).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {members
                  .filter((m) => m.id.startsWith('typed:'))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMembers((x) => x.filter((y) => y.id !== m.id))}
                      className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink hover:bg-danger/15 hover:text-danger"
                    >
                      <span dir="auto">{m.label}</span> ✕
                    </button>
                  ))}
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-4">
            <div className="flex gap-1.5">
              <Chip active={mode === 'BY_TEAMS'} onClick={() => setMode('BY_TEAMS')}>
                {ot('fun.team.byTeams')}
              </Chip>
              <Chip active={mode === 'BY_SIZE'} onClick={() => setMode('BY_SIZE')}>
                {ot('fun.team.bySize')}
              </Chip>
            </div>

            <Input radius="round"
              type="number"
              min={1}
              max={50}
              value={value}
              onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
              className="max-w-24 tabular-nums"
            />

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={mix}
                onChange={(e) => setMix(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="text-sm text-ink">{ot('fun.team.mixDepartments')}</span>
                <span className="block text-xs text-ink-faint">{ot('fun.team.mixHint')}</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={useSkill}
                onChange={(e) => setUseSkill(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="text-sm text-ink">{ot('fun.stats.useSkill')}</span>
                <span className="block text-xs text-ink-faint">
                  {ot('fun.stats.useSkillHint')}
                </span>
              </span>
            </label>

            {sets.length > 0 ? (
              <div>
                <p className="text-xs text-ink-faint">{ot('fun.sets.title')}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMembers(s.members)}
                      className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink-soft hover:bg-surface-hover hover:text-ink"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── เงื่อนไขการจับทีม (FR-C06) ──────────────────────── */}
            <div className="border-t border-line pt-3">
              <p className="text-sm font-medium text-ink">{ot('fun.rules.title')}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{ot('fun.rules.hint')}</p>

              {members.length < 2 ? (
                <p className="mt-2 text-xs text-ink-faint">{ot('fun.rules.needTwo')}</p>
              ) : (
                <>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex gap-1.5">
                      <Chip
                        active={ruleKind === 'TOGETHER'}
                        onClick={() => setRuleKind('TOGETHER')}
                      >
                        {ot('fun.rules.together')}
                      </Chip>
                      <Chip active={ruleKind === 'APART'} onClick={() => setRuleKind('APART')}>
                        {ot('fun.rules.apart')}
                      </Chip>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <PersonSelect members={members} value={ruleA} onChange={setRuleA} />
                      <span className="text-xs text-ink-faint">+</span>
                      <PersonSelect members={members} value={ruleB} onChange={setRuleB} />
                      <Button
                        size="sm"
                        onClick={addRule}
                        disabled={!ruleA || !ruleB || ruleA === ruleB}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  {useSkill ? (
                <p className="mt-4 text-center text-xs text-ink-soft">
                  {ot('fun.stats.spread', { n: spread })}
                  {spread < 0.15 ? ` · ✓ ${ot('fun.stats.balanced')}` : ''}
                </p>
              ) : null}

              {rules.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {rules.map((r, i) => (
                        <li key={`${r.a}-${r.b}`} className="flex items-center gap-2 text-xs">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5',
                              r.kind === 'TOGETHER'
                                ? 'bg-surface text-ink'
                                : 'bg-danger/15 text-danger',
                            )}
                          >
                            {r.kind === 'TOGETHER'
                              ? ot('fun.rules.together')
                              : ot('fun.rules.apart')}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-ink-soft">
                            {nameOf(r.a)} · {nameOf(r.b)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRules((p) => p.filter((_, j) => j !== i))}
                            className="text-ink-faint hover:text-danger"
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

              {ruleError ? (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {ruleError}
                </p>
              ) : null}
            </div>

            <Button
              variant="primary"
              size="lg"
              block
              disabled={members.length < 2}
              onClick={() => draw(false)}
            >
              {ot('fun.team.draw')}
            </Button>
            {members.length < 2 ? (
              <p className="text-xs text-ink-faint">{ot('fun.team.need')}</p>
            ) : null}
          </aside>
        </div>
      ) : (
        /* ── ผลการแบ่ง ────────────────────────────────────────────── */
        <div className="relative mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <div
                key={t.name}
                className={cn(
                  'rounded-2xl border-2 p-4 transition-shadow',
                  /* ★ ทีมที่ครบแล้วเรืองแสง ตามหัวข้อ 4.1 */
                  done && 'shadow-lg',
                )}
                style={{ borderColor: t.color, boxShadow: done ? `0 0 16px ${t.color}44` : undefined }}
              >
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: t.color }} />
                  <input
                    defaultValue={t.name}
                    /* ★ FR-C04: ชื่อทีมแก้ได้ — ไม่ต้อง state แยก
                       เพราะไม่มีอะไรอื่นอ่านค่านี้นอกจากตาคน */
                    className="min-w-0 flex-1 bg-transparent font-bold text-ink outline-none"
                    maxLength={20}
                  />
                </div>

                <ul className="mt-2 flex flex-col gap-1">
                  {t.members.map((m) => {
                    const idx = revealOrder.get(m.id) ?? 0
                    const show = idx < revealed
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          'rounded-xl px-2 py-1 text-sm transition-all duration-300',
                          show
                            ? 'bg-surface text-ink opacity-100'
                            : 'bg-surface/40 text-transparent opacity-40',
                        )}
                      >
                        {show ? m.label : '···'}
                        {show && captains[t.name] === m.id ? (
                          <span className="ms-1.5" title={ot('fun.team.captainBadge')}>
                            👑
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>

                {done ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      const c = pickCaptain(t)
                      if (c) {
                        setCaptains((p) => ({ ...p, [t.name]: c.id }))
                        playCelebrate()
                      }
                    }}
                  >
                    {ot('fun.team.captain')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          {done ? (
            <>
              {useSkill ? (
                <p className="mt-4 text-center text-xs text-ink-soft">
                  {ot('fun.stats.spread', { n: spread })}
                  {spread < 0.15 ? ` · ✓ ${ot('fun.stats.balanced')}` : ''}
                </p>
              ) : null}

              {rules.length > 0 ? (
                <p
                  className={cn(
                    'mt-4 text-center text-xs',
                    unmet ? 'text-danger' : 'text-ink-soft',
                  )}
                >
                  {unmet
                    ? ot('fun.rules.unmet', { n: unmet.n, tries: unmet.tries })
                    : `✓ ${ot('fun.rules.met')}`}
                </p>
              ) : null}

              {redrawUsed ? (
                <p className="mt-1 text-center text-xs text-warn">{ot('fun.team.wasRedrawn')}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  disabled={redrawUsed}
                  title={redrawUsed ? ot('fun.team.redrawUsed') : undefined}
                  onClick={() => draw(true)}
                >
                  {redrawUsed ? ot('fun.team.redrawUsed') : ot('fun.team.redraw')}
                </Button>
                <Button onClick={copyResult}>
                  {copied ? ot('fun.team.copied') : ot('fun.team.copy')}
                </Button>
                <Button
                  variant="secondary"
                  loading={creatingCup}
                  disabled={teams.length < 2}
                  onClick={createCup}
                >
                  {ot('fun.cup.create')}
                </Button>
                <Button variant="ghost" onClick={newRound}>
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
        'h-8 min-w-0 flex-1 rounded-full bg-surface px-3 text-[13px] text-ink',
        'border-0 outline-none focus:ring-1 focus:ring-line-strong',
      )}
    >
      <option value="">{ot('fun.rules.pick')}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          <span dir="auto">{m.label}</span>
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
        'h-8 flex-1 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}
