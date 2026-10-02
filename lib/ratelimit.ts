import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'

/**
 * Rate limit ที่นับใน Postgres — ดู supabase/migrations/0007_cache_ratelimit.sql
 *
 * ★ ทุก bucket ผูกกับ user id ไม่ใช่ IP
 *   IP ของผู้ใช้มือถือเปลี่ยนตลอด และผู้ใช้หลายคนอาจอยู่หลัง NAT เดียวกัน
 *   (เช่น ทั้งออฟฟิศฟังห้องเดียวกัน) — จำกัดด้วย IP จะลงโทษผิดคน
 *   เราบังคับ anonymous sign-in อยู่แล้ว ทุกคนจึงมี id ที่นับได้เสมอ
 */

export const LIMITS = {
  /** สร้างห้อง — ราคาแพงที่สุด (เขียน 3 ตาราง) และไม่มีเหตุผลที่ต้องรัว */
  createRoom: { limit: 10, windowSeconds: 3600 },
  /** เข้าห้อง — เผื่อรีเฟรชหน้าบ่อย ๆ แต่กันการไล่เดารหัสห้อง */
  joinRoom: { limit: 30, windowSeconds: 60 },
  /** อ่าน bootstrap — เกิดทุกครั้งที่ reconnect */
  roomRead: { limit: 120, windowSeconds: 60 },
  /**
   * ★ ค้นหา YouTube — เพดานที่สำคัญที่สุดในระบบ
   *   1 ครั้ง = 101 units จาก quota 10,000/วัน ทั้งโปรเจกต์
   *   ถ้าไม่จำกัด ผู้ใช้คนเดียวกดรัว ๆ 100 ครั้งทำให้ทั้งเว็บค้นหาไม่ได้ทั้งวัน
   */
  youtubeSearch: { limit: 10, windowSeconds: 60 },
  /**
   * คำแนะนำใต้ช่องค้นหา — ยิงระหว่างพิมพ์ จึงต้องปล่อยกว้าง
   * ★ ไม่แตะ quota ของ YouTube เลย (อ่านจาก cache ของเราเอง)
   *   เพดานนี้มีไว้กันการถล่มฐานข้อมูล ไม่ใช่กัน quota
   */
  suggest: { limit: 240, windowSeconds: 60 },
  /**
   * อัปรูปเข้าแชท — จำกัดแน่นกว่าข้อความมาก
   * ★ รูปกินพื้นที่เก็บถาวร (ต่างจากข้อความที่หายไปเอง) และ 3MB ต่อไฟล์
   *   20 รูป/นาที = 60MB/นาที ต่อคน ซึ่งเป็นเพดานที่ใจกว้างพอสำหรับการใช้จริง
   */
  chatImage: { limit: 20, windowSeconds: 60 },
  // ★ แชทเขียนลง DB แล้ว จึงต้องมีเพดาน — 60 ข้อความ/นาที เผื่อคนพิมพ์เร็วจริง ๆ
  chatSend: { limit: 60, windowSeconds: 60 },
  // ★ ด่านเดียวที่กันการไล่เดาชื่อคนอื่นเพื่อสวมรอย — ผูกกับ "ชื่อที่ขอ" ไม่ใช่ผู้ใช้
  signIn: { limit: 10, windowSeconds: 600 },
  // ★ เปลี่ยนชื่อ/ฉายาเป็นของที่ทุกคนในห้องเห็น — จำกัดไว้กันการกดรัว
  profileUpdate: { limit: 20, windowSeconds: 300 },
  avatarUpload: { limit: 10, windowSeconds: 600 },
  /** แต่งตัวละคร — กดเปลี่ยนสีเล่นได้เต็มที่ แค่กันการยิงรัวจากสคริปต์ */
  appearance: { limit: 40, windowSeconds: 300 },
  /** เพิ่มเพลง — กันการถล่มคิวจนคนอื่นไม่มีที่ */
  addToQueue: { limit: 20, windowSeconds: 60 },
  /** ข้าม/เล่น/หยุด — ปุ่มพวกนี้กดรัวได้ง่ายโดยไม่ตั้งใจ */
  playbackControl: { limit: 60, windowSeconds: 60 },

  /* ── ระบบกิจกรรมออฟฟิศ (0023) ───────────────────────────────────────── */

  /**
   * ★★★ กรอกรหัสพนักงาน — เพดานนี้เป็นข้อกำหนดตรง ๆ จาก FR-X02
   *     "จำกัดการกรอกรหัสผิดไม่เกิน 5 ครั้งต่อ 15 นาที"
   *
   *     ★ ต่างจาก rate limit ตัวอื่นในไฟล์นี้ตรงที่มันเป็น "มาตรการความปลอดภัย"
   *       ไม่ใช่แค่กันการใช้งานเกินพอดี — รหัสพนักงานคือด่านเดียวที่กันคนนอก
   *       บริษัทออกจากระบบ ถ้าไล่เดาได้ไม่จำกัด ด่านนั้นไม่มีความหมายเลย
   *
   *     ★★ จึงเป็นตัวเดียวที่ "นับเฉพาะครั้งที่ผิด" (ดู route ที่เรียก)
   *        คนที่กรอกถูกตั้งแต่ครั้งแรกไม่ควรเสียโควตา และคนที่พิมพ์ผิดจริง ๆ
   *        ยังมีโอกาสแก้ตัวพอสมควรก่อนโดนล็อก
   */
  employeeCode: { limit: 5, windowSeconds: 900 },
  /** อ่านแจ้งเตือน/กดอ่านแล้ว — เกิดบ่อยแต่ถูกมาก */
  notifications: { limit: 120, windowSeconds: 60 },
  /** รายงานเนื้อหา — กันคนไล่กดรายงานทุกอย่างในระบบ */
  reportContent: { limit: 20, windowSeconds: 3600 },
  /** งานของ Admin — ปล่อยกว้าง แค่กันสคริปต์ยิงรัว */
  adminAction: { limit: 120, windowSeconds: 60 },

  /* ── โมดูล A · กินอะไรดี (0025) ─────────────────────────────────────── */

  /** เพิ่มร้าน — ร้านรอบออฟฟิศมีจำกัด ไม่มีเหตุผลที่ต้องเพิ่มรัว ๆ */
  addRestaurant: { limit: 15, windowSeconds: 3600 },
  /** กดเห็นด้วย / แจ้งปิด / บันทึกการไป — กดเล่นได้ แค่กันสคริปต์ */
  foodAction: { limit: 60, windowSeconds: 60 },
  /** ตรวจชื่อคล้ายระหว่างพิมพ์ (FR-A02) — ยิงถี่ตามการพิมพ์ */
  similarCheck: { limit: 120, windowSeconds: 60 },

  /* ── โมดูล B · กระเป๋าเงิน (0026/0027) ──────────────────────────────── */

  /**
   * ★ สร้างบิล — จำกัดแน่นกว่าที่อื่นเพราะบิลหนึ่งใบสร้างหนี้ได้ถึง 50 รายการ
   *   และแต่ละรายการยิงแจ้งเตือนหาคนหนึ่งคน การยิงรัวจึงกลายเป็นการสแปม
   *   ทั้งออฟฟิศได้ในไม่กี่วินาที
   */
  createBill: { limit: 20, windowSeconds: 3600 },
  /** กดโอนแล้ว / ยืนยัน / ยกเลิก / ทวง — เพดานจริงของการทวงอยู่ที่ DB */
  walletAction: { limit: 60, windowSeconds: 60 },
  /** อัป/อ่าน QR · ใบเสร็จ · สลิป */
  walletFile: { limit: 30, windowSeconds: 300 },

  /* ── โมดูล C · สุ่มและเกม (0028) ─────────────────────────────────── */

  /**
   * บันทึกชุดรายชื่อ / เลข
   * ★ การสุ่มเองไม่ผ่าน API เลย — ทำฝั่ง client ด้วย crypto ทั้งหมด
   *   เพดานนี้จึงคุมแค่การเขียนลงฐานข้อมูล ไม่ได้คุมการเล่น
   */
  funAction: { limit: 60, windowSeconds: 300 },

  /* ── โมดูล D · ตลาดนัด (0029) ────────────────────────────────────── */

  /** ลงประกาศ — หนึ่งประกาศมีรูปได้ 5 รูป จึงกินพื้นที่มากกว่าที่อื่น */
  createListing: { limit: 20, windowSeconds: 3600 },
  /** จอง / รายงาน / เปลี่ยนสถานะ */
  marketAction: { limit: 60, windowSeconds: 60 },
  marketUpload: { limit: 40, windowSeconds: 600 },

  /* ── ห้องสุ่มกลุ่ม (0035) ─────────────────────────────────────────── */

  /**
   * สร้างห้องสุ่ม
   * ★ เพดานต่ำเพราะห้องเป็นของถาวรที่คนอื่นเห็นในรายการ —
   *   ห้องขยะ 50 ห้องทำให้ฟีเจอร์ใช้ไม่ได้ ต่างจากการกดสุ่มที่ไม่เหลืออะไรไว้
   *   (SQL จำกัดห้องที่ยังไม่สุ่มไว้ 3 ห้องต่อคนอีกชั้นหนึ่ง)
   */
  drawRoom: { limit: 10, windowSeconds: 600 },

  /* ── แชทออฟฟิศ (0038) ──────────────────────────────────────────── */

  /**
   * ส่งข้อความ / เปิดห้อง
   * ★ เพดานสูงกว่าที่อื่นมาก เพราะการพิมพ์คุยกันเร็ว ๆ เป็นพฤติกรรมปกติ
   *   ★★ ลิมิตที่ต่ำเกินไปในระบบแชทไม่ได้กันสแปม แต่กันคนที่คุยเก่ง
   */
  chatAction: { limit: 120, windowSeconds: 60 },
  /** อัปโหลดไฟล์ในแชท — หนักกว่าส่งข้อความมาก จึงคุมแยก */
  chatUpload: { limit: 30, windowSeconds: 300 },
} as const

export type RateLimitName = keyof typeof LIMITS

type ConsumeResult = {
  allowed: boolean
  used: number
  limitValue: number
  resetAt: string
}

async function consume(
  bucket: string,
  limit: number,
  windowSeconds: number,
  cost = 1,
): Promise<ConsumeResult> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    p_cost: cost,
  })

  if (error) {
    // ★ ตัดสินใจไว้ล่วงหน้า: ถ้าตัวนับพัง ให้ "ปล่อยผ่าน" ไม่ใช่ "ปฏิเสธ"
    //   rate limit เป็นมาตรการกันการใช้งานเกินพอดี ไม่ใช่มาตรการความปลอดภัย
    //   (ความปลอดภัยอยู่ที่ RLS + permission ใน RPC)
    //   การทำให้ทั้งเว็บใช้ไม่ได้เพราะตารางนับพังนั้นแย่กว่าปล่อยให้ยิงเกินชั่วคราว
    console.error('[ratelimit] ตัวนับขัดข้อง ปล่อยผ่าน', error)
    return { allowed: true, used: 0, limitValue: limit, resetAt: new Date().toISOString() }
  }

  const row = data?.[0]
  if (!row) return { allowed: true, used: 0, limitValue: limit, resetAt: new Date().toISOString() }

  return {
    allowed: row.allowed,
    used: row.used,
    limitValue: row.limit_value,
    resetAt: row.reset_at,
  }
}

/** ใช้โควตา 1 หน่วย ถ้าเกินเพดานจะโยน AppError('RATE_LIMITED') พร้อม retryAfter */
export async function enforceRateLimit(
  name: RateLimitName,
  userId: string,
): Promise<void> {
  const { limit, windowSeconds } = LIMITS[name]
  const result = await consume(`${name}:${userId}`, limit, windowSeconds)

  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((Date.parse(result.resetAt) - Date.now()) / 1000),
    )
    throw new AppError('RATE_LIMITED', { retryAfter })
  }
}

/** สำหรับ YouTube quota ที่หักทีละหลาย unit — ใช้จริงใน Phase 4 */
export async function consumeYouTubeQuota(units: number, dailyLimit = 9500) {
  const day = new Date().toISOString().slice(0, 10)
  return consume(`youtube:quota:${day}`, dailyLimit, 86_400, units)
}
