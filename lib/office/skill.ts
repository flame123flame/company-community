import { shuffle, type Member, type Team } from './teams'
import { randomIndex } from './draw'

/**
 * ถ่วงฝีมือตอนแบ่งทีม (FR-C09)
 *
 * ★★★ เป้าหมายคือ "ทีมสูสี" ไม่ใช่ "ทีมที่แข็งที่สุด"
 *
 *     คนมักเข้าใจว่าถ่วงฝีมือ = เอาคนเก่งไปรวมกัน ★ ซึ่งตรงข้ามกับสิ่งที่ขอ
 *     เอกสารเขียนว่า "ถ่วงฝีมือจากสถิติชนะ-แพ้เดิม" ในบริบทของการสุ่มทีม
 *     ซึ่งหมายถึงทำให้ทุกทีมมีคะแนนรวมใกล้เคียงกัน = แข่งแล้วสนุก
 */

export type Skill = { userId: string; skill: number; matches: number }

/** คนที่ยังไม่เคยแข่งถือว่ากลาง ๆ — ไม่ใช่อ่อนที่สุด */
export const DEFAULT_SKILL = 0.5

export function skillOf(member: Member, table: Map<string, number>): number {
  /* ★ ชื่อที่พิมพ์เองไม่มี id จึงไม่มีสถิติ — ได้ค่ากลางเสมอ */
  return table.get(member.id) ?? DEFAULT_SKILL
}

/**
 * แบ่งทีมให้คะแนนรวมใกล้เคียงกัน
 *
 * ★★ วิธี: เรียงจากเก่งไปอ่อน แล้วแจกแบบงูเลื้อย
 *
 *    งูเลื้อย (0,1,2,2,1,0,…) เป็นวิธีมาตรฐานของการแบ่งทีมให้สูสี —
 *    ทีมที่ได้คนเก่งที่สุดจะได้คนอ่อนที่สุดของรอบถัดไปชดเชย
 *
 *    ★★ ตรงนี้งูเลื้อย "ถูก" ต่างจากตอนกระจายฝ่ายใน teams.ts ที่มันผิด
 *       เพราะที่นั่นลำดับถูกจัดให้มีคาบเท่าจำนวนทีมแล้วไปสั่นพ้องกัน
 *       ★ ส่วนที่นี่ลำดับเรียงตามคะแนนซึ่งไม่มีคาบ — งูเลื้อยจึงชดเชยได้จริง
 *
 * ★ สลับคนที่คะแนนเท่ากันก่อน ไม่งั้นทีมเดิมได้คนเดิมทุกครั้งที่สุ่ม
 */
export function splitBalanced(
  members: Member[],
  teamCount: number,
  skills: Map<string, number>,
): Member[][] {
  const count = Math.max(1, Math.min(teamCount, members.length))

  /* จัดกลุ่มตามคะแนน สลับในกลุ่ม แล้วเรียงกลุ่มจากมากไปน้อย */
  const buckets = new Map<number, Member[]>()
  for (const m of members) {
    const s = skillOf(m, skills)
    if (!buckets.has(s)) buckets.set(s, [])
    buckets.get(s)!.push(m)
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, list]) => shuffle(list))

  const teams: Member[][] = Array.from({ length: count }, () => [])

  ordered.forEach((m, i) => {
    const round = Math.floor(i / count)
    const pos = i % count
    teams[round % 2 === 0 ? pos : count - 1 - pos]!.push(m)
  })

  return teams
}

/** คะแนนรวมของทีม — ใช้แสดงให้ผู้ใช้เห็นว่าสูสีแค่ไหน */
export function teamStrength(team: Team, skills: Map<string, number>): number {
  if (team.members.length === 0) return 0
  const sum = team.members.reduce((s, m) => s + skillOf(m, skills), 0)
  return Math.round((sum / team.members.length) * 1000) / 1000
}

/**
 * ความต่างระหว่างทีมแข็งสุดกับอ่อนสุด — ยิ่งน้อยยิ่งสูสี
 *
 * ★ ใช้ค่าเฉลี่ยไม่ใช่ผลรวม เพราะทีมที่มีคนมากกว่าจะมีผลรวมสูงกว่าเสมอ
 *   ทั้งที่ฝีมือเฉลี่ยอาจเท่ากัน
 */
export function strengthSpread(teams: Team[], skills: Map<string, number>): number {
  if (teams.length === 0) return 0
  const values = teams.map((t) => teamStrength(t, skills))
  return Math.round((Math.max(...values) - Math.min(...values)) * 1000) / 1000
}

/** สุ่มคู่แข่งขัน — คืนลำดับทีมที่จะเอาไปวางในสาย (FR-C08) */
export function drawBracketOrder<T>(teams: T[]): T[] {
  /*
   * ★ สุ่มลำดับล้วน ไม่จัดวางตามฝีมือ
   *   การวางให้ทีมแข็งเจอกันรอบท้าย (seeding) เป็นกติกาของการแข่งจริงจัง
   *   ★ แต่นี่เป็นเกมในออฟฟิศ — ความไม่แน่นอนคือส่วนที่สนุก
   *     และคนจะรู้สึกว่าถูกจัดให้แพ้ถ้าระบบวางสายให้
   */
  return shuffle(teams)
}

/** สุ่มผู้ชนะ (ใช้ตอนทดสอบสายเท่านั้น — ไม่ได้ใช้ใน UI จริง) */
export function randomWinner<T>(a: T, b: T): T {
  return randomIndex(2) === 0 ? a : b
}
