/**
 * กติกาการสุ่มและจังหวะแอนิเมชัน (FR-X05 · หัวข้อ 4.1)
 *
 * ★★★ ความยุติธรรม: สุ่มผลจริงก่อน แล้วให้แอนิเมชันหยุดตรงผลนั้น
 *
 *     ตรงข้ามกับการ "ปล่อยวงล้อหมุนแล้วดูว่าหยุดตรงไหน" ซึ่งฟังดูเป็นธรรมชาติ
 *     แต่ทำให้ผลขึ้นกับ frame rate ของเครื่อง — มือถือเครื่องช้าจะได้ผลต่างจาก
 *     คอมแรง ๆ และในห้องสุ่มกลุ่มทุกคนจะได้คนละผล ซึ่งพังทั้งฟีเจอร์
 *
 *     ★ แอนิเมชันเป็นแค่การแสดงผล ไม่มีผลต่อโอกาสแม้แต่นิดเดียว
 *
 * ★★ ไฟล์นี้ไม่มี React และไม่แตะ DOM เลย
 *    จึงทดสอบได้ด้วยการเรียกฟังก์ชันตรง ๆ และใช้ซ้ำได้ทั้งวงล้อ สล็อต และการ์ด
 */

/** ช่วงเวลาที่เอกสารกำหนด — 4–7 วินาทีต่อการสุ่มหนึ่งครั้ง */
export const MIN_MS = 4000
export const MAX_MS = 7000
/** ปุ่ม "ข้าม" โผล่หลังเริ่มหมุนกี่มิลลิวินาที */
export const SKIP_AFTER_MS = 1000
/** โอกาสเกิดจังหวะหลอก — ประมาณ 1 ใน 3 ตามเอกสาร */
export const FAKE_OUT_CHANCE = 1 / 3

export type DrawPlan = {
  /** ดัชนีของผลลัพธ์ใน items */
  winner: number
  /** ระยะเวลารวมของแอนิเมชัน (ms) */
  duration: number
  /** รอบนี้มีจังหวะหลอกไหม */
  fakeOut: boolean
  /** ถ้ามีจังหวะหลอก จะเกือบหยุดที่ช่องนี้ก่อน */
  fakeIndex: number
}

/**
 * สุ่มจำนวนเต็ม 0..max-1 ด้วย CSPRNG
 *
 * ★★ ใช้ crypto ไม่ใช่ Math.random() ด้วยเหตุผลเดียวกับ generate_room_code
 *    ใน migration 0004 — Math.random() เดาต่อได้เมื่อรู้ seed
 *
 *    ★ ที่นี่ไม่ใช่เรื่องความปลอดภัย แต่เป็นเรื่อง "ความเชื่อใจ":
 *      ระบบที่คนใช้จับสลากว่าใครต้องไปซื้อกาแฟ ต้องไม่มีใครเดาผลล่วงหน้าได้
 *
 *    ★★ ตัดค่าที่ทำให้เกิด modulo bias ทิ้ง ไม่ใช่ % เฉย ๆ
 *       ถ้า 2^32 หารด้วย max ไม่ลงตัว ช่องแรก ๆ จะถูกสุ่มได้บ่อยกว่าช่องท้าย
 *       — กับ 3 ตัวเลือกความต่างเล็กมาก แต่มันคือความไม่เป็นธรรมที่เลี่ยงได้ฟรี
 */
export function randomIndex(max: number): number {
  if (max <= 0) throw new Error('randomIndex: ต้องมีอย่างน้อย 1 ตัวเลือก')
  if (max === 1) return 0

  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)

  for (;;) {
    crypto.getRandomValues(buf)
    const value = buf[0]!
    if (value < limit) return value % max
  }
}

/** วางแผนการสุ่มหนึ่งรอบ — เรียกก่อนเริ่มแอนิเมชันเสมอ */
export function planDraw(count: number): DrawPlan {
  const winner = randomIndex(count)
  const duration = MIN_MS + randomIndex(MAX_MS - MIN_MS + 1)

  /*
   * ★ สุ่มว่าจะหลอกไหม "ทุกครั้ง" ไม่ใช่สลับกันไปมา
   *   ถ้าทำเป็นรอบเว้นรอบ คนจะจับทางได้ภายในสามครั้ง แล้วจังหวะลุ้นจะหายไป
   */
  const fakeOut = count > 2 && randomIndex(3) === 0

  /*
   * ★ ช่องหลอกต้องไม่ใช่ช่องที่ชนะ ไม่งั้นมันจะ "เกือบหยุดที่ผลจริง
   *   แล้วเลื่อนไปที่ผลจริง" ซึ่งดูเหมือนแอนิเมชันค้าง ไม่ใช่การหลอก
   */
  let fakeIndex = winner
  if (fakeOut) {
    fakeIndex = randomIndex(count - 1)
    if (fakeIndex >= winner) fakeIndex += 1
  }

  return { winner, duration, fakeOut, fakeIndex }
}

/**
 * ความคืบหน้า 0..1 → ตำแหน่ง 0..1 (ease-out แรงมาก)
 *
 * ★★ เลขชี้กำลัง 4 ไม่ใช่ 2 หรือ 3
 *
 *    เอกสารกำหนดว่า "ช่วง 1–2 วินาทีสุดท้ายช้ามากจนเกือบหยุด"
 *    ★ quadratic (2) ยังไหลลงเร็วเกินไป — ช่วงท้ายไม่มีความลุ้น
 *      quartic (4) ทำให้ 80% ของระยะทางจบใน 40% แรกของเวลา
 *      เวลาที่เหลือจึงเป็นการคืบทีละนิดซึ่งคือจังหวะที่คนลุ้น
 */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - clamped, 4)
}

/**
 * ตำแหน่งของตัวชี้ ณ เวลา t — รวมจังหวะหลอกไว้แล้ว
 *
 * คืนค่าเป็น "ระยะทางเป็นจำนวนช่อง" นับจากช่อง 0 (ทศนิยมได้)
 *
 * ★ จังหวะหลอกทำโดย "เล็งไปที่ช่องหลอกก่อน แล้วขยับเป้าหมายตอนท้าย"
 *   ไม่ใช่การถอยหลัง — วงล้อที่หมุนกลับทางดูเหมือนบั๊กมากกว่าการหลอก
 */
export function positionAt(
  plan: DrawPlan,
  count: number,
  elapsed: number,
  /** หมุนกี่รอบเต็มก่อนถึงผล — ยิ่งมากยิ่งดูหมุนแรงตอนเริ่ม */
  spins = 4,
): number {
  const t = Math.min(1, elapsed / plan.duration)

  /*
   * ★ ช่วงหลอกอยู่ที่ 78%–92% ของเวลา
   *   ก่อนหน้านั้นยังเร็วเกินกว่าจะดูออกว่า "เกือบหยุด"
   *   หลังจากนั้นเหลือเวลาไม่พอให้เลื่อนต่ออย่างนุ่มนวล
   */
  const FAKE_START = 0.78
  const FAKE_END = 0.92

  const base = spins * count

  if (!plan.fakeOut) {
    return easeOut(t) * (base + plan.winner)
  }

  if (t < FAKE_END) {
    /* เล็งไปที่ช่องหลอก โดยบีบ ease ให้ "ถึงเกือบสุด" ตอน FAKE_START */
    const fakeTarget = base + plan.fakeIndex
    const squeezed = easeOut(Math.min(1, t / FAKE_START))
    return squeezed * fakeTarget
  }

  /* ★ ช่วงสุดท้าย: คืบจากช่องหลอกไปช่องจริงแบบเชิงเส้นช้า ๆ
     ใช้เชิงเส้นตรงนี้โดยตั้งใจ — ease อีกชั้นจะทำให้ดูเหมือนกระตุก */
  const from = base + plan.fakeIndex
  const to = base + plan.winner + (plan.winner < plan.fakeIndex ? count : 0)
  const k = (t - FAKE_END) / (1 - FAKE_END)
  return from + (to - from) * k
}

/**
 * ผู้ใช้ตั้งค่า "ลดการเคลื่อนไหว" ไว้ไหม
 *
 * ★ ไม่ได้แปลว่า "ข้ามแอนิเมชัน" — เอกสารระบุชัดว่ายังต้องมีช่วงลุ้น
 *   แค่ใช้แบบสั้นแทน ★ การตัดช่วงลุ้นทิ้งคือการเอาความสนุกทั้งหมดออกไป
 *   จากคนที่แพ้การเคลื่อนไหว ซึ่งไม่ใช่สิ่งที่ตัวเลือกนั้นขอ
 */
export function prefersReducedMotion(): boolean {
  /*
   * ★★★ คืน false เสมอ — เว็บนี้เลิกลดการเคลื่อนไหวตามค่าของระบบปฏิบัติการ
   *
   *     ★ เหตุผลเต็มอยู่หัวไฟล์ globals.css โดยย่อคือ Windows เปิดค่านี้ไว้
   *       เป็นค่าเริ่มต้นในหลายเครื่องเพื่อให้เครื่องลื่น ไม่ใช่เหตุผลทางสุขภาพ
   *       ★★ แล้วผลที่ได้คือช่วงลุ้นตอนสุ่มหดสั้นจนไม่มีอะไรให้ลุ้น
   *
   * ★ คงฟังก์ชันไว้แทนที่จะลบทิ้ง เพราะจุดที่เรียกใช้กระจายอยู่หลายที่
   *   ★★ และวันที่ทำสวิตช์ในหน้าโปรไฟล์ จะได้แก้ที่นี่ที่เดียว
   */
  return false
}

/** ระยะเวลาที่ควรใช้จริง — สั้นลงถ้าผู้ใช้ขอลดการเคลื่อนไหว */
export function effectiveDuration(plan: DrawPlan): number {
  return prefersReducedMotion() ? 1600 : plan.duration
}
