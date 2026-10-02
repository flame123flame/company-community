/**
 * ค่าหน้าตาของผีแต่ละแบบ
 *
 * ★★★ 30 แบบต่อตน สร้างจากสูตร ไม่ใช่วาดมือ 90 หน้า
 *
 *     วาดมือ 90 หน้าเป็นไปได้ แต่เปลี่ยนดีไซน์ทีเดียวต้องแก้ 90 ที่
 *     ★ และของที่วาดมือเยอะ ๆ จะเริ่มซ้ำกันเองโดยคนวาดไม่รู้ตัว
 *
 *     ★★ ที่นี่ทุกแบบมาจากพารามิเตอร์ชุดเดียวกัน (ขนาดหัว · รูปตา · ชนิดปาก ·
 *        สีผิว · เลือดออกตรงไหน · รอยแตก · เส้นเลือด) ★ การรับประกันว่า
 *        "ไม่ซ้ำ" จึงเป็นเรื่องที่พิสูจน์ได้ด้วยการนับ ไม่ใช่ความรู้สึก
 *
 * ★★★ ต้องได้ผลเหมือนเดิมทุกครั้งที่ใส่เลขเดิม (deterministic)
 *
 *     ถ้าใช้ Math.random() ตรง ๆ ตอน render หน้าจะเปลี่ยนทุกเฟรมที่ React
 *     วาดใหม่ ★ และ HTML ที่ server กับ client สร้างจะไม่ตรงกัน
 *     ★★ จึงใช้ PRNG ที่รับ seed — ตัวสุ่มจริงอยู่ที่ "เลือกเลข" ไม่ใช่ที่นี่
 */

export type MouthKind = 'void' | 'scream' | 'teeth' | 'stitch' | 'gape' | 'slit'
export type BloodFrom = 'eyes' | 'mouth' | 'nose' | 'all' | 'none'
export type Variant = 'hooded' | 'hair' | 'gaunt'

export type FaceParams = {
  /** ครึ่งความกว้าง/ความสูงของกะโหลก */
  headW: number
  headH: number
  /** ระยะจากกึ่งกลางถึงตาแต่ละข้าง */
  eyeGap: number
  eyeY: number
  eyeW: number
  eyeH: number
  /** องศาเอียงของตา — บวกคือหางตาตก */
  eyeTilt: number
  /** ขนาดประกายในเบ้าตา 0 = ไม่มีเลย (เบ้าตาโบ๋สนิท) */
  glow: number
  mouth: MouthKind
  mouthY: number
  mouthW: number
  mouthH: number
  /** สีผิว — เก็บเป็น hex คู่ (สว่าง, กลาง) */
  skin: [string, string]
  bloodFrom: BloodFrom
  bloodAmount: 0 | 1 | 2 | 3
  cracks: boolean
  veins: boolean
  /** ขากรรไกรหลุดยาวผิดปกติ */
  jawDrop: boolean
  /** ความแรงที่หมอกบิดขอบ */
  distort: number
  seed: number
}

/** จำนวนแบบต่อหนึ่งตน */
export const FACES_PER_VARIANT = 30

/**
 * ★ PRNG แบบ mulberry32 — เล็ก เร็ว และกระจายตัวดีพอสำหรับงานนี้
 *   ★★ ไม่ใช้ Math.sin เป็นตัวสุ่มแบบที่เห็นบ่อย ๆ เพราะมันวนซ้ำเป็นคาบ
 *      แล้วแบบที่ 7 กับแบบที่ 23 จะกลายเป็นหน้าเดียวกันพอดี
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SKINS: [string, string][] = [
  ['#f4f8fd', '#c9d6e8'], // ซีดอมฟ้า
  ['#f6f2e9', '#cfc4ae'], // ซีดอมเหลือง เหมือนศพเก่า
  ['#eef6f1', '#b9cfc3'], // ซีดอมเขียว
  ['#f7eef0', '#d5bcc1'], // ซีดอมชมพู เลือดคั่ง
  ['#eceff5', '#adb6c6'], // เทาเถ้า
]

/** ปากที่เข้ากับโครงหน้าของแต่ละตน — กะโหลกไม่มีปากเย็บ ผมยาวไม่มีฟันเรียง */
const MOUTHS: Record<Variant, MouthKind[]> = {
  hooded: ['void', 'slit', 'gape', 'stitch', 'scream'],
  hair: ['scream', 'gape', 'void', 'slit'],
  gaunt: ['teeth', 'gape', 'void'],
}

const BLOOD: BloodFrom[] = ['eyes', 'mouth', 'nose', 'all', 'none']

/**
 * หน้าแบบที่ `index` ของตน `variant`
 *
 * ★ index นอกช่วงถูกวนกลับ — ผู้เรียกจะส่งเลขอะไรมาก็ได้โดยไม่ต้องเช็กเอง
 */
export function faceParams(variant: Variant, index: number): FaceParams {
  const i = ((index % FACES_PER_VARIANT) + FACES_PER_VARIANT) % FACES_PER_VARIANT
  const base = variant === 'hooded' ? 1000 : variant === 'hair' ? 2000 : 3000
  const r = rng(base + i * 7919)

  const pick = <T,>(list: T[]): T => list[Math.floor(r() * list.length)]!
  const span = (lo: number, hi: number) => lo + r() * (hi - lo)

  /*
   * ★★ โครงหลักต่างกันตามตน แล้วค่อยแกว่งรอบ ๆ โครงนั้น
   *
   *    ถ้าปล่อยให้ทุกค่าสุ่มอิสระเต็มช่วง ★ ตนที่ 1 แบบที่ 12 อาจหน้าตา
   *    เหมือนตนที่ 3 แบบที่ 5 ทุกประการ แล้ว "สามตน" ก็ไม่มีความหมาย
   *    ★★ การแกว่งรอบโครงจึงรักษาเอกลักษณ์ของตนไว้ พร้อมกับให้ 30 แบบต่างกันจริง
   */
  const frame =
    variant === 'hooded'
      ? { w: span(30, 36), h: span(42, 50), gap: span(10, 13), ey: span(94, 100) }
      : variant === 'hair'
        ? { w: span(26, 32), h: span(46, 56), gap: span(11, 14), ey: span(86, 94) }
        : { w: span(28, 34), h: span(40, 48), gap: span(12, 15), ey: span(90, 98) }

  const jawDrop = r() < 0.22
  const mouth = pick(MOUTHS[variant])
  const bloodFrom = pick(BLOOD)

  return {
    headW: Math.round(frame.w),
    headH: Math.round(frame.h),
    eyeGap: Math.round(frame.gap),
    eyeY: Math.round(frame.ey),
    eyeW: Math.round(span(7, variant === 'hair' ? 14 : 12) * 10) / 10,
    eyeH: Math.round(span(4, variant === 'hair' ? 11 : 9) * 10) / 10,
    eyeTilt: Math.round(span(-14, 14)),
    /* ★ บางแบบไม่มีประกายตาเลย — เบ้าโบ๋สนิทน่ากลัวคนละแบบกับตาที่เรืองแสง */
    glow: r() < 0.28 ? 0 : Math.round(span(2, 4) * 10) / 10,
    mouth,
    mouthY: Math.round(frame.ey + span(30, 46) + (jawDrop ? 6 : 0)),
    mouthW: Math.round(span(6, 14)),
    mouthH: Math.round(span(6, jawDrop ? 26 : 16)),
    skin: pick(SKINS),
    bloodFrom,
    bloodAmount: bloodFrom === 'none' ? 0 : (Math.ceil(r() * 3) as 1 | 2 | 3),
    cracks: r() < 0.35,
    veins: r() < 0.3,
    jawDrop,
    distort: Math.round(span(2, 7)),
    seed: Math.floor(r() * 10000),
  }
}

/** สรุปหน้าแบบหนึ่ง ๆ เป็นข้อความสั้น — ใช้ตรวจว่า 30 แบบไม่ซ้ำกันจริง */
export function faceSignature(p: FaceParams): string {
  return [
    p.headW,
    p.headH,
    p.eyeGap,
    p.eyeW,
    p.eyeH,
    p.eyeTilt,
    p.glow,
    p.mouth,
    p.mouthW,
    p.mouthH,
    p.skin[0],
    p.bloodFrom,
    p.bloodAmount,
    p.cracks ? 'c' : '-',
    p.veins ? 'v' : '-',
    p.jawDrop ? 'j' : '-',
  ].join('|')
}
