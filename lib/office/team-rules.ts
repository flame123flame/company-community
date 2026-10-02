import { randomIndex } from './draw'
import { shuffle, type Member, type Team } from './teams'
import type { OfficeKey } from '@/lib/i18n/office-format'

/**
 * เหตุผลที่เงื่อนไขเป็นไปไม่ได้ — เป็น "กุญแจ + ตัวเลข" ไม่ใช่ประโยคไทย
 *
 * ★★★ เดิมคืนประโยคไทยสำเร็จรูปออกมาแล้วหน้าเว็บเอาไปแปะตรง ๆ
 *
 *     ★ ซึ่งแปลไม่ได้เลย — ประโยคถูกประกอบเสร็จในไฟล์ที่ไม่รู้ภาษาของคนอ่าน
 *       ★★ และต่อสตริงไว้ด้วย ลำดับคำจึงตายตัวเป็นไทยถาวร
 *          ("...มี 5 คน แต่ทีมหนึ่งรับได้มากสุด 3 คน" สลับที่ในภาษาอื่นไม่ได้)
 *
 *     ★ คืนกุญแจกับตัวเลขแยกกัน แล้วให้หน้าเว็บเรียก ot() เอง —
 *       ★★ ตรรกะการตรวจเงื่อนไขอยู่ที่เดิม และคำแปลอยู่ในดิกชันนารี
 *          ซึ่งเป็นที่ของมัน
 */
export type RuleProblem = {
  key: Extract<OfficeKey, `teamRule.${string}`>
  params?: Record<string, string | number>
}

/**
 * เงื่อนไขการแบ่งทีม (FR-C06)
 *
 *   TOGETHER — สองคนนี้ต้องอยู่ทีมเดียวกัน
 *   APART    — สองคนนี้ห้ามอยู่ทีมเดียวกัน
 *
 * ★★★ ทำไมต้องแยกไฟล์จาก teams.ts
 *
 *     splitTeams() ของเดิมเป็นการแจกไพ่ที่ "ไม่มีเงื่อนไข" — เร็ว ตรงไปตรงมา
 *     และพิสูจน์ได้ว่าขนาดทีมต่างกันไม่เกิน 1 คนเสมอ
 *     ★ การยัดเงื่อนไขเข้าไปในนั้นจะทำลายคุณสมบัตินั้นทิ้ง และทำให้
 *       โค้ดที่ทำงานถูกอยู่แล้วเสี่ยงพังโดยไม่จำเป็น
 *
 *     ★★ ไฟล์นี้จึงห่อ splitTeams อีกชั้น: ลองแบ่ง → ตรวจเงื่อนไข → ลองใหม่
 *        ของเดิมไม่ถูกแตะเลยแม้แต่บรรทัดเดียว
 */

export type RuleKind = 'TOGETHER' | 'APART'

export type TeamRule = {
  kind: RuleKind
  a: string
  b: string
}

/** หา index ของทีมที่คนคนนี้อยู่ — -1 ถ้าไม่เจอ */
function teamOf(teams: Team[], memberId: string): number {
  return teams.findIndex((t) => t.members.some((m) => m.id === memberId))
}

/** การแบ่งนี้ผิดเงื่อนไขข้อไหนบ้าง */
export function violations(teams: Team[], rules: TeamRule[]): TeamRule[] {
  return rules.filter((r) => {
    const ta = teamOf(teams, r.a)
    const tb = teamOf(teams, r.b)
    /* ★ คนที่ไม่ได้อยู่ในรอบนี้ไม่นับว่าผิด — เงื่อนไขค้างจากรอบก่อนได้ */
    if (ta < 0 || tb < 0) return false
    return r.kind === 'TOGETHER' ? ta !== tb : ta === tb
  })
}

/**
 * ตรวจว่าเงื่อนไขชุดนี้เป็นไปได้จริงไหม ก่อนจะเสียเวลาลองสุ่ม
 *
 * ★★★ เงื่อนไขที่ขัดกันเองทำให้วนหาคำตอบไม่จบ
 *
 *     ตัวอย่างที่เกิดจริง:
 *       • A-B ต้องอยู่ด้วยกัน · A-B ห้ามอยู่ด้วยกัน  → ขัดกันตรง ๆ
 *       • A,B,C ต้องอยู่ด้วยกันทั้งหมด แต่แบ่ง 4 ทีมจาก 4 คน
 *         → กลุ่มที่ต้องอยู่ด้วยกันใหญ่เกินกว่าที่ทีมจะรับไหว
 *       • A-B, B-C, A-C ห้ามอยู่ด้วยกันทั้งหมด แต่มีแค่ 2 ทีม
 *         → ต้องการ 3 ทีมเป็นอย่างน้อย
 *
 *     ★ ถ้าไม่ตรวจก่อน ผู้ใช้จะเห็นปุ่มหมุนค้างแล้วไม่รู้ว่าทำไม
 *       การบอกไปตรง ๆ ว่า "เงื่อนไขนี้เป็นไปไม่ได้" มีประโยชน์กว่ามาก
 */
export function checkFeasible(
  members: Member[],
  teamCount: number,
  rules: TeamRule[],
): { ok: true } | { ok: false; reason: RuleProblem } {
  const ids = new Set(members.map((m) => m.id))
  const active = rules.filter((r) => ids.has(r.a) && ids.has(r.b))

  /* ── 1 · ขัดกันตรง ๆ ─────────────────────────────────────────── */
  for (const r of active) {
    const opposite = active.find(
      (o) =>
        o.kind !== r.kind &&
        ((o.a === r.a && o.b === r.b) || (o.a === r.b && o.b === r.a)),
    )
    if (opposite) {
      return { ok: false, reason: { key: 'teamRule.contradiction' } }
    }
  }

  /* ── 2 · จัดกลุ่มคนที่ต้องอยู่ด้วยกัน (union-find อย่างง่าย) ──── */
  const group = new Map<string, string>()
  const find = (x: string): string => {
    let root = group.get(x) ?? x
    while (root !== (group.get(root) ?? root)) root = group.get(root) ?? root
    return root
  }
  for (const r of active) {
    if (r.kind !== 'TOGETHER') continue
    const ra = find(r.a)
    const rb = find(r.b)
    if (ra !== rb) group.set(ra, rb)
  }

  const sizes = new Map<string, number>()
  for (const m of members) {
    const root = find(m.id)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }

  /*
   * ★ กลุ่มที่ต้องอยู่ด้วยกันต้องยัดลงทีมเดียวได้
   *   ทีมใหญ่สุดที่เป็นไปได้ = ceil(จำนวนคน / จำนวนทีม)
   */
  const maxTeamSize = Math.ceil(members.length / teamCount)
  for (const size of sizes.values()) {
    if (size > maxTeamSize) {
      return {
        ok: false,
        reason: { key: 'teamRule.groupTooBig', params: { size, max: maxTeamSize } },
      }
    }
  }

  /* ── 3 · คนที่ห้ามอยู่ด้วยกัน ต้องมีทีมพอให้กระจาย ───────────── */
  const apartGraph = new Map<string, Set<string>>()
  for (const r of active) {
    if (r.kind !== 'APART') continue
    const ra = find(r.a)
    const rb = find(r.b)
    if (ra === rb) {
      return { ok: false, reason: { key: 'teamRule.mustAndCant' } }
    }
    if (!apartGraph.has(ra)) apartGraph.set(ra, new Set())
    if (!apartGraph.has(rb)) apartGraph.set(rb, new Set())
    apartGraph.get(ra)!.add(rb)
    apartGraph.get(rb)!.add(ra)
  }

  /*
   * ★ ดีกรีสูงสุด + 1 คือจำนวนทีมขั้นต่ำที่ "พอจะเป็นไปได้"
   *   (ขอบเขตของการระบายสีกราฟ — ไม่แม่นเป๊ะแต่จับเคสที่ชัดเจนได้)
   *   ★ ใช้เป็นตัวกรองหยาบ ๆ ส่วนคำตอบจริงยังต้องลองสุ่ม
   */
  let maxDegree = 0
  for (const s of apartGraph.values()) maxDegree = Math.max(maxDegree, s.size)
  if (maxDegree + 1 > teamCount) {
    return {
      ok: false,
      reason: { key: 'teamRule.needMoreTeams', params: { n: maxDegree + 1 } },
    }
  }

  return { ok: true }
}

/**
 * แบ่งทีมให้ตรงเงื่อนไข
 *
 * ★★ ลองสุ่มซ้ำแทนการเขียนอัลกอริทึมจัดวางตรง ๆ
 *
 *    การจัดวางแบบ backtracking ให้คำตอบเสมอก็จริง ★ แต่มันจะให้
 *    "คำตอบแรกที่เจอ" ซึ่งเป็นคำตอบเดิมทุกครั้งที่อินพุตเหมือนกัน —
 *    ทำลายความรู้สึกว่าการสุ่มเป็นการสุ่มจริง
 *
 *    ★★ สุ่มซ้ำจนผ่านให้ความหลากหลายเต็มที่ และกับขนาดทีมงานจริง
 *       (หลักสิบคน เงื่อนไขไม่กี่ข้อ) มันเจอคำตอบภายในไม่กี่รอบเสมอ
 *
 * ★ ถ้าครบ MAX_TRIES แล้วยังไม่ผ่าน คืนผลที่ผิดน้อยที่สุดพร้อมบอกว่าผิดข้อไหน
 *   ดีกว่าไม่คืนอะไรเลย — ผู้ใช้ปรับเงื่อนไขเองได้จากข้อมูลนั้น
 */
const MAX_TRIES = 400

export function splitTeamsWithRules(
  members: Member[],
  options: {
    mode: 'BY_TEAMS' | 'BY_SIZE'
    value: number
    mixDepartments: boolean
  },
  rules: TeamRule[],
  splitFn: (m: Member[], o: typeof options) => Team[],
): { teams: Team[]; unmet: TeamRule[]; tries: number } {
  if (rules.length === 0) {
    return { teams: splitFn(members, options), unmet: [], tries: 1 }
  }

  let best: Team[] | null = null
  let bestUnmet: TeamRule[] = rules

  for (let i = 1; i <= MAX_TRIES; i++) {
    const teams = splitFn(members, options)
    const unmet = violations(teams, rules)

    if (unmet.length === 0) return { teams, unmet: [], tries: i }

    if (unmet.length < bestUnmet.length) {
      best = teams
      bestUnmet = unmet
    }
  }

  return { teams: best ?? splitFn(members, options), unmet: bestUnmet, tries: MAX_TRIES }
}

/** คู่ที่ยังไม่ได้ตั้งเงื่อนไข — ใช้เติมตัวเลือกใน UI */
export function availablePairs(members: Member[], rules: TeamRule[]): [Member, Member][] {
  const used = new Set(rules.map((r) => [r.a, r.b].sort().join('|')))
  const out: [Member, Member][] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const key = [members[i]!.id, members[j]!.id].sort().join('|')
      if (!used.has(key)) out.push([members[i]!, members[j]!])
    }
  }
  /* ★ สุ่มลำดับ — ไม่งั้นตัวเลือกแรกจะเป็นคู่เดิมตลอด */
  return shuffle(out).slice(0, 50)
}

/** สุ่มคู่ตัวอย่างสำหรับปุ่ม "เพิ่มเงื่อนไข" */
export function randomPair(members: Member[]): [Member, Member] | null {
  if (members.length < 2) return null
  const a = randomIndex(members.length)
  let b = randomIndex(members.length - 1)
  if (b >= a) b += 1
  return [members[a]!, members[b]!]
}
