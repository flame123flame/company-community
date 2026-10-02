'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Guest identity
 *
 * ★ ใช้ Supabase Anonymous Sign-in ไม่ใช่ cookie ที่เราทำเอง
 *
 *   ผู้ใช้ทุกคน — แม้ไม่เคยสมัคร — ได้ JWT จริงและมี auth.uid() จริง
 *   ซึ่งสำคัญมากเพราะ:
 *     1. RLS policy เขียนชุดเดียวใช้ได้กับทุกคน ไม่ต้องมีสาขา "ถ้าเป็น guest"
 *     2. Realtime กรองข้อมูลให้ตาม RLS อัตโนมัติ
 *     3. queue_items.added_by เป็น FK จริงไปหา profiles
 *     4. วันที่อยากให้ผูก email/Google ภายหลัง ใช้ linkIdentity() ได้เลย
 *        โดย id เดิมไม่เปลี่ยน — ประวัติเพลงที่เคยเพิ่มไว้ยังเป็นของคนเดิม
 *
 *   ถ้าเราทำ guest id เองด้วย cookie จะต้องเขียน authorization ทั้งระบบเองทั้งหมด
 *   และ RLS จะกลายเป็นของประดับ
 */

export type SessionUser = {
  id: string
  isAnonymous: boolean
}

/**
 * ให้แน่ใจว่ามี session อยู่ — ถ้ายังไม่มีก็สมัครแบบ anonymous ให้เลย
 * เรียกซ้ำได้ ไม่สร้าง user ใหม่ถ้ามี session อยู่แล้ว
 */
export async function ensureSession(_displayName?: string): Promise<SessionUser> {
  const supabase = getSupabaseBrowserClient()

  /**
   * ★★★ ไม่สร้าง anonymous user อีกแล้ว — เคยสร้าง ตอนนี้เลิก
   *
   *     เดิมฟังก์ชันนี้เรียก signInAnonymously() ให้อัตโนมัติเมื่อไม่มี session
   *     ซึ่งแปลว่าใครก็เข้าใช้ระบบได้โดยไม่ต้องผ่านหน้าสมัครเลยสักครั้ง —
   *     ขัดกับข้อกำหนดที่ว่า "ต้องสมัครก่อนใช้งาน 100%"
   *
   *     ★ ตอนนี้ทางเดียวที่จะมี session คือผ่าน /api/auth/username
   *       ฝั่ง server ก็ปฏิเสธคนที่ไม่มี username อยู่แล้ว (requireUser)
   *       ทั้งสองฝั่งจึงพูดตรงกัน ไม่มีประตูหลังเหลือ
   *
   * ★★ ต้องเป็น getUser() ไม่ใช่ getSession()
   *
   *    getSession() อ่าน cookie ในเครื่องเฉย ๆ ไม่เคยถามเซิร์ฟเวอร์ว่า
   *    session นั้นยังใช้ได้จริงไหม — มันจึงคืน session ที่ "ตายแล้ว" กลับมาได้
   *    (ผู้ใช้ถูกลบ · refresh token ถูกเพิกถอน · ย้าย project)
   *
   *    อาการที่เกิด: client คิดว่ามี session → ยิง API → server ตอบ 401
   *    → รีเฟรชแล้วเจอเหมือนเดิมเพราะ cookie เก่ายังอยู่ ติดวนถาวร
   */
  const { data, error } = await supabase.auth.getUser()

  if (!error && data.user) {
    return { id: data.user.id, isAnonymous: data.user.is_anonymous ?? false }
  }

  /*
   * ★ ลืมโปรไฟล์ในเครื่องทิ้งด้วย ไม่ใช่แค่โยน error
   *   โปรไฟล์คือตัวตัดสินว่าจะแสดงหน้าสมัครไหม ถ้าไม่ล้าง ผู้ใช้จะค้างอยู่ใน
   *   สถานะ "ดูเหมือนเข้าระบบแล้วแต่ทำอะไรไม่ได้" ซึ่งไม่มีทางออกด้วยตัวเอง
   */
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* ล้างไม่ได้ก็ยังลืมโปรไฟล์ต่อ */
  }
  forgetProfile()

  throw new Error('NEEDS_SIGN_IN')
}


/**
 * ทิ้ง session ปัจจุบันแล้วเริ่มใหม่ — ใช้เมื่อ API ตอบ UNAUTHORIZED
 *
 * ★ เป็นตาข่ายชั้นสอง ต่อจาก getUser() ใน ensureSession()
 *   เผื่อกรณีที่ session ใช้ไม่ได้ "ระหว่าง" ที่เรากำลังทำงานอยู่
 *   เช่น token หมดอายุพอดีระหว่าง getUser() กับ fetch ถัดไป
 *
 *   ผู้ใช้ไม่ควรต้องรู้เลยว่าเกิดอะไรขึ้น — ระบบซ่อมตัวเองแล้วทำงานต่อ
 */
export async function resetSession(_displayName?: string): Promise<SessionUser> {
  // ★ ไม่มี "เริ่มใหม่แบบเงียบ ๆ" อีกแล้ว — ทางเดียวคือกลับไปหน้าสมัคร
  //   (เหตุผลเต็มอยู่ใน ensureSession ด้านบน)
  return ensureSession()
}


/**
 * แก้ชื่อที่แสดง
 * ★ เขียนตรงจาก client ได้โดยไม่ต้องผ่าน API เพราะเป็นข้อมูลของตัวเอง
 *   ไม่มีเงื่อนไขสิทธิ์ที่ซับซ้อน และ RLS มี policy "profiles: update own"
 *   จำกัดให้แก้ได้เฉพาะแถวของ auth.uid() และเฉพาะคอลัมน์ display_name/avatar_url
 */
export async function updateDisplayName(displayName: string): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('ยังไม่มีเซสชัน')

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', data.user.id)

  if (error) throw new Error(error.message)
}

/** ชื่อที่เคยตั้งไว้ เก็บไว้เติมให้อัตโนมัติตอนเข้าห้องถัดไป */
const NAME_KEY = 'music-room:display-name'
/**
 * ★★ มี :v2 ต่อท้ายโดยตั้งใจ
 *
 *    ตอนเปิดระบบโปรไฟล์ เราล้างผู้ใช้เดิมในฐานข้อมูลทิ้งทั้งหมดเพื่อให้ทุกคน
 *    เริ่มใหม่พร้อมกัน แต่ localStorage อยู่บนเครื่องผู้ใช้ เราเอื้อมไปลบไม่ได้
 *
 *    ถ้าใช้คีย์เดิม เครื่องที่เคยเข้ามาแล้วจะยังอ่านชื่อเก่าเจอ แล้วข้ามหน้าตั้ง
 *    โปรไฟล์ไปเลย — กลายเป็นว่าคนเก่าไม่เคยถูกถาม ซึ่งตรงข้ามกับที่ต้องการ
 *
 *    ★ ขึ้นเวอร์ชันคีย์ = ทุกเครื่องในโลกเริ่มนับหนึ่งพร้อมกัน โดยไม่ต้องลบ
 *      อะไรบนเครื่องใคร และย้อนดูได้ว่าข้อมูลชุดไหนมาจากยุคไหน
 */
/* ★ ไม่เปลี่ยนตามชื่อแบรนด์ — เป็นกุญแจที่เก็บไว้ในเครื่องผู้ใช้แล้ว
   ★★ เปลี่ยนแล้วค่าที่เขาตั้งไว้จะถูกมองว่าไม่มี แล้วรีเซ็ตเงียบ ๆ ทุกคน */
const PROFILE_KEY = 'frameroom:profile:v2'

export function rememberDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Safari โหมดส่วนตัวโยน error ตอนเขียน — ไม่ใช่เรื่องคอขาดบาดตาย
  }
}

export function recallDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/* ── โปรไฟล์ที่จำไว้ในเครื่อง ─────────────────────────────────────────────
 *
 * ★★ ทำไมต้องเก็บซ้ำในเครื่องทั้งที่มีอยู่ในฐานข้อมูลแล้ว
 *
 *    ตัวจริงอยู่ในตาราง profiles เสมอ — แต่การจะอ่านมันต้องมี session ก่อน
 *    และ session ต้องยืนยันกับ Supabase หนึ่งรอบ (getUser) ซึ่งกินเวลา
 *
 *    หน้าแรกต้องตัดสินใจ "จะถามชื่อไหม" ตั้งแต่เฟรมแรก ถ้ารอผลจาก network
 *    ผู้ใช้ที่ตั้งโปรไฟล์ไว้แล้วจะเห็นหน้าถามชื่อแวบหนึ่งทุกครั้งที่เข้าเว็บ
 *    — ซึ่งคือปัญหาที่ผู้ใช้บ่นมาพอดี ("ทุกครั้งเข้ามาต้องกรอกชื่อใหม่")
 *
 *    ★ ในเครื่องคือ "สำเนาไว้ตัดสินใจเร็ว" ฐานข้อมูลคือ "ของจริง"
 *      ถ้าสองที่ไม่ตรงกัน ของจริงชนะเสมอ — เราเขียนทับสำเนาทุกครั้งที่บันทึก
 */

export type LocalProfile = {
  displayName: string
  nickname: string | null
  avatarUrl: string | null
  /** ชื่อผู้ใช้ที่ใช้เข้าระบบ — null สำหรับผู้ใช้เก่าที่ยังไม่ได้ตั้ง */
  username?: string | null
}

/* ── ร้านเก็บโปรไฟล์ ──────────────────────────────────────────────────────
 *
 * ★★★ ต้องแคชค่าไว้ ห้ามอ่าน localStorage ใหม่ทุกครั้งที่ถูกเรียก
 *
 *     บั๊กที่เจอจริง (หน้าแรกขึ้น "เกิดข้อผิดพลาด" ทันทีหลังกดบันทึกโปรไฟล์):
 *
 *     useSyncExternalStore เรียก getSnapshot ทุก render แล้วเทียบผลลัพธ์กับ
 *     ของรอบก่อนด้วย Object.is เพื่อตัดสินว่าต้องวาดใหม่ไหม
 *
 *     ★ JSON.parse สร้าง "อ็อบเจกต์ใหม่" ทุกครั้งแม้ข้อมูลจะเหมือนเดิมเป๊ะ
 *       Object.is จึงตอบ false ตลอด → React คิดว่าค่าเปลี่ยนตลอด →
 *       วาดใหม่ → เรียก getSnapshot อีก → วนไม่จบจน React ยอมแพ้แล้วโยน error
 *
 *     อาการหลอกตรงที่มันไม่พังตอนโหลดหน้า แต่พังตอน "มีอะไรสั่งให้ render"
 *     ซึ่งคือจังหวะที่กดบันทึกพอดี — ดูเหมือนปุ่มบันทึกพัง ทั้งที่ API สำเร็จแล้ว
 *
 *     ★ เก็บผลไว้ตัวเดียวแล้วคืนตัวเดิมทุกครั้ง เปลี่ยนก็ต่อเมื่อเราเขียนเอง
 */

let profileCache: LocalProfile | null | undefined
const profileListeners = new Set<() => void>()

function readProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) {
      /*
       * ★ ไม่เลื่อนขั้นชื่อเก่าจาก NAME_KEY มาเป็นโปรไฟล์
       *   ตอนเปิดระบบโปรไฟล์เราตั้งใจให้ทุกคนตั้งใหม่พร้อมกัน ถ้าเลื่อนขั้นให้
       *   คนเก่าจะข้ามหน้าตั้งโปรไฟล์ไปโดยไม่เคยเห็นมันเลยสักครั้ง
       */
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as LocalProfile).displayName !== 'string' ||
      (parsed as LocalProfile).displayName.trim() === ''
    ) {
      return null
    }

    const p = parsed as LocalProfile
    return {
      displayName: p.displayName,
      nickname: typeof p.nickname === 'string' ? p.nickname : null,
      avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : null,
      username: typeof p.username === 'string' ? p.username : null,
    }
  } catch {
    return null
  }
}

export function recallProfile(): LocalProfile | null {
  // undefined = ยังไม่เคยอ่าน · null = อ่านแล้วและไม่มี
  if (profileCache === undefined) profileCache = readProfile()
  return profileCache
}

export function subscribeProfile(listener: () => void): () => void {
  profileListeners.add(listener)
  return () => {
    profileListeners.delete(listener)
  }
}

export const profileOnServer = (): LocalProfile | null => null

export function rememberProfile(profile: LocalProfile): void {
  // ★ อัปเดตแคชก่อนเขียนดิสก์ — ถ้า localStorage โยน (Safari โหมดส่วนตัว)
  //   หน้าจอต้องยังเปลี่ยนตามให้ได้ในรอบนี้ แค่จำข้ามครั้งไม่ได้เท่านั้น
  profileCache = profile
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    // ★ เขียน NAME_KEY ต่อไปด้วย — โค้ดเก่าบางส่วนยังอ่านค่านั้น
    localStorage.setItem(NAME_KEY, profile.displayName)
  } catch {
    /* เขียนไม่ได้ = ถามใหม่ครั้งหน้า ไม่ใช่เรื่องคอขาดบาดตาย */
  }
  for (const fn of profileListeners) fn()
}

export function forgetProfile(): void {
  profileCache = null
  try {
    localStorage.removeItem(PROFILE_KEY)
    localStorage.removeItem(NAME_KEY)
  } catch {
    /* ไม่เป็นไร */
  }
  for (const fn of profileListeners) fn()
}


/**
 * แลก token จาก /api/auth/username เป็น session จริง
 *
 * ★★ ทำไมต้องเป็น verifyOtp ฝั่ง client ไม่ใช่ตั้ง cookie จาก server
 *
 *    Supabase client ในเบราว์เซอร์เก็บ session ไว้เองใน localStorage และ
 *    ต่ออายุ token ให้อัตโนมัติ ถ้า server ไปตั้ง cookie เอง client จะไม่รู้จัก
 *    session นั้น แล้ว Realtime กับ RLS จะยังคิดว่าเรายังไม่ได้เข้าระบบ
 *
 *    ★ verifyOtp ทำให้ client เป็นคนสร้าง session เอง ทุกอย่างที่เหลือ
 *      (auto refresh · realtime auth · การกู้ session ตอนเปิดใหม่) จึงทำงาน
 *      เหมือนการเข้าระบบปกติทุกประการ โดยที่ไม่มีรหัสผ่านอยู่ในระบบเลย
 *
 * ★ ล้าง session เดิมก่อนเสมอ — คนที่เคยเป็น anonymous user อยู่ต้องเปลี่ยนตัวตน
 *   ถ้าไม่ล้าง verifyOtp จะเจอ session ค้างแล้วได้ผลลัพธ์ที่เดาไม่ได้
 */
export async function signInWithUsername(tokenHash: string): Promise<LocalProfile> {
  const supabase = getSupabaseBrowserClient()

  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* ล้างไม่ได้ก็ยังลองต่อ */
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  })

  if (error || !data.user) {
    throw new Error(error?.message ?? 'auth.errFailed')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, nickname, avatar_url, username')
    .eq('id', data.user.id)
    .maybeSingle()

  return {
    displayName: profile?.display_name ?? '',
    nickname: profile?.nickname ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    username: profile?.username ?? null,
  }
}


/**
 * ออกจากระบบ — ลืมทั้งตัวตนและโปรไฟล์ในเครื่องนี้
 *
 * ★★ ทำไมต้องมี ทั้งที่ระบบนี้ "ไม่มีรหัสผ่าน"
 *
 *    เพราะการไม่มีทางออกคือกับดัก: เครื่องหนึ่งเครื่องผูกกับชื่อเดียวตลอดไป
 *    คนที่ยืมคอมเพื่อนเข้ามาฟังเพลง หรือใช้เครื่องร่วมกันที่บ้าน
 *    จะเปลี่ยนเป็นชื่อตัวเองไม่ได้เลยนอกจากไปล้าง site data เอง
 *    ซึ่งผู้ใช้ทั่วไปไม่รู้ว่าทำยังไง
 *
 * ★ ต้องล้างสองที่ ไม่ใช่ที่เดียว
 *   session ของ Supabase (ตัวตนจริง) และโปรไฟล์ในเครื่อง (ตัวตัดสินว่าจะ
 *   ถามชื่อไหม) ถ้าล้างแค่อย่างใดอย่างหนึ่งจะได้สถานะครึ่ง ๆ กลาง ๆ:
 *   ไม่มี session แต่ไม่ถูกถามชื่อ → ทำอะไรไม่ได้และไม่รู้ว่าทำไม
 */
export async function signOutCompletely(): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* ล้างไม่ได้ก็ยังลืมโปรไฟล์ต่อ — ด่านโปรไฟล์จะถามชื่อใหม่อยู่ดี */
  }
  forgetProfile()
}
