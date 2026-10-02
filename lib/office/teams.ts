import { randomIndex } from './draw'

/**
 * แบ่งทีม (FR-C03 / FR-C05)
 *
 * ★★ ไม่มี React และไม่แตะ DOM — ทดสอบได้ด้วยการเรียกฟังก์ชันตรง ๆ
 *    และใช้ซ้ำได้ทั้งหน้าสุ่มทีมและ (วันหนึ่ง) ห้องสุ่มกลุ่มในเฟส 2
 */

export type Member = {
  id: string
  label: string
  /** ฝ่าย — ใช้ตอนเปิดตัวเลือกกระจายฝ่าย (FR-C05) */
  department?: string | null
}

export type Team = {
  name: string
  color: string
  members: Member[]
}

/*
 * ★ ชื่อทีมและสีสุ่มจากชุดที่เตรียมไว้ ไม่ใช่ "ทีม 1 / ทีม 2"
 *   ชื่อที่มีบุคลิกทำให้คนจำได้ว่าตัวเองอยู่ทีมไหนระหว่างเล่น
 *   ★ ทั้งคู่แก้ได้ทีหลังตามที่ FR-C04 กำหนด
 *
 * ★★★ ชื่อย้ายไปอยู่ในดิกชันนารี (fun.team.names) แล้ว ไฟล์นี้ไม่รู้จักภาษา
 *
 *     ★ คนเรียกส่ง teamNames เข้ามาทาง SplitOptions ★★ ไฟล์นี้ถูกเรียก
 *       จากทั้งฝั่ง client และฝั่งทดสอบ การให้มันไปหยิบคำแปลเองหมายถึง
 *       มันต้องรู้ภาษาของคนอ่าน ซึ่งไม่ใช่เรื่องของตัวแบ่งทีม
 *     ★ ค่าสำรองเป็นชุดว่าง — ไม่มีชื่อก็ตกไปที่ชื่อที่คนเรียกส่งมาเป็น
 *       teamFallback แทน (เช่น "Team 3")
 */

/** ★ สีจากจานเดียวกับ confetti เพื่อให้ทั้งโมดูลดูเป็นชุดเดียวกัน */
const TEAM_COLORS = [
  '#ff0033', '#3ea6ff', '#ffd24d', '#4ade80', '#c084fc',
  '#fb923c', '#2dd4bf', '#f472b6',
]

/** สลับลำดับแบบ Fisher-Yates ด้วย CSPRNG ตัวเดียวกับวงล้อ */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export type SplitOptions = {
  /** กำหนดจำนวนทีม หรือจำนวนคนต่อทีม — อย่างใดอย่างหนึ่ง */
  mode: 'BY_TEAMS' | 'BY_SIZE'
  value: number
  /** FR-C05 — ให้แต่ละทีมมีคนจากหลายฝ่ายปนกัน */
  mixDepartments: boolean
  /** ★ ชื่อทีมที่แปลแล้ว — คนเรียกหยิบจาก ot('fun.team.names') มาให้ */
  teamNames?: string[]
  /** ★ ชื่อสำรองเมื่อทีมเยอะกว่าชื่อที่มี — รับ index แล้วคืนชื่อ */
  teamFallback?: (index: number) => string
}

/**
 * แบ่งสมาชิกเป็นทีม
 *
 * ★★★ วิธีแจกคือ "แจกไพ่" ไม่ใช่ "ตัดเป็นท่อน"
 *
 *     ตัดเป็นท่อน (slice) ทำให้ทีมสุดท้ายรับเศษทั้งหมด —
 *     11 คน 3 ทีม จะได้ 4/4/3 ก็จริง แต่ถ้า 10 คน 3 ทีม จะได้ 4/4/2
 *     ★ ซึ่งไม่ยุติธรรมเมื่อเล่นเกมที่จำนวนคนมีผลต่อผลแพ้ชนะ
 *
 *     แจกทีละคนวนไปเรื่อย ๆ ทำให้ขนาดทีมต่างกันไม่เกิน 1 คนเสมอ
 *     10 คน 3 ทีม → 4/3/3 ซึ่งเป็นการแบ่งที่ดีที่สุดที่เป็นไปได้
 */
export function splitTeams(members: Member[], options: SplitOptions): Team[] {
  if (members.length === 0) return []

  const teamCount =
    options.mode === 'BY_TEAMS'
      ? Math.max(1, Math.min(options.value, members.length))
      : Math.max(1, Math.ceil(members.length / Math.max(1, options.value)))

  const order = options.mixDepartments
    ? groupByDepartment(members)
    : shuffle(members)

  /* ★ ชื่อและสีสุ่มโดยไม่ซ้ำกันในรอบเดียว */
  const names = shuffle(options.teamNames ?? []).slice(0, teamCount)
  const colors = shuffle(TEAM_COLORS).slice(0, teamCount)

  const teams: Team[] = Array.from({ length: teamCount }, (_, i) => ({
    name: names[i] ?? options.teamFallback?.(i) ?? `#${i + 1}`,
    color: colors[i] ?? TEAM_COLORS[i % TEAM_COLORS.length]!,
    members: [],
  }))

  /*
   * ★★★ แจกวนทางเดียว ไม่ใช่งูเลื้อย — เคยเขียนเป็นงูเลื้อยแล้วผิด
   *
   *     งูเลื้อย (0,1,2,2,1,0,…) มีคาบ 2×จำนวนทีม ★ ซึ่งไปสั่นพ้องกับ
   *     ลำดับที่จัดฝ่ายมาแล้ว ทำให้ทีมกลางได้ฝ่ายเดียวกันทั้งทีมทุกรอบ
   *
   *     จับได้จากการทดสอบ: เปิดกระจายฝ่ายแล้ว "ทุกทีมมีครบ 3 ฝ่าย"
   *     เกิดขึ้น 0/200 รอบ ขณะที่ไม่เปิดเลยได้ 34% — ตัวเลือกนี้ทำให้
   *     ผลแย่ลงแทนที่จะดีขึ้น ซึ่งมองด้วยตาจากหน้าจอไม่มีทางเห็น
   *
   *     ★★ วนทางเดียวบนลำดับที่ "เรียงเป็นกองตามฝ่าย" กระจายได้ถูกต้อง
   *        เพราะคนในฝ่ายเดียวกันที่อยู่ติดกันจะถูกโยนไปคนละทีมเสมอ
   *
   * ★ offset สุ่มเพราะเมื่อหารไม่ลงตัว ทีมต้น ๆ จะได้คนเกินมา 1 คน
   *   ถ้า offset คงที่ ทีมแรกจะได้เปรียบทุกครั้งที่สุ่ม
   */
  const offset = randomIndex(teamCount)

  order.forEach((member, index) => {
    teams[(index + offset) % teamCount]!.members.push(member)
  })

  return teams
}

/**
 * เรียงคนเป็นกองตามฝ่าย (FR-C05)
 *
 * ★★★ "เรียงเป็นกอง" ไม่ใช่ "สลับฝ่าย" — ฟังดูกลับหัวแต่ถูกกว่า
 *
 *     สัญชาตญาณบอกให้สลับเป็น IT, บัญชี, ขาย, IT, บัญชี, ขาย…
 *     ★ แต่ลำดับแบบนั้นมีคาบเท่ากับจำนวนฝ่าย พอเอาไปแจกวนตามจำนวนทีม
 *       ที่บังเอิญเท่ากัน ทุกทีมจะได้ฝ่ายเดียวกันทั้งทีม
 *
 *     ★★ เรียงเป็นกอง [IT×4, บัญชี×4, ขาย×4] แล้วแจกวนทางเดียว
 *        คนในฝ่ายเดียวกันที่อยู่ติดกันจะถูกโยนไปคนละทีมเสมอ
 *        = แต่ละฝ่ายถูกเกลี่ยไปทั่วทุกทีมโดยอัตโนมัติ
 *
 * ★ สลับทั้งลำดับในกองและลำดับของกอง เพื่อไม่ให้ฝ่ายเดิมได้ทีมเดิมทุกครั้ง
 *
 * ★★ ไม่รับประกันว่า "ทุกทีมมีครบทุกฝ่าย" — เป็นไปไม่ได้เมื่อคนไม่พอ
 *    (5 คนจาก 2 ฝ่าย แบ่ง 3 ทีม ย่อมมีทีมที่มีฝ่ายเดียว)
 *    ★ สิ่งที่รับประกันคือ "กระจายดีที่สุดเท่าที่จำนวนคนเอื้อ"
 */
function groupByDepartment(members: Member[]): Member[] {
  const groups = new Map<string, Member[]>()
  for (const m of members) {
    const key = m.department?.trim() || '—'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }

  return shuffle([...groups.values()]).flatMap(shuffle)
}

/** สุ่มกัปตันของทีม — ใช้ในแอนิเมชันไฟสปอตไลต์ (หัวข้อ 4.1) */
export function pickCaptain(team: Team): Member | null {
  if (team.members.length === 0) return null
  return team.members[randomIndex(team.members.length)]!
}
