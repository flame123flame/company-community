import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'

/**
 * ไฟล์ส่วนตัวของโมดูลกระเป๋าเงิน (NFR-06 / NFR-07)
 *
 * ★★★ ต่างจาก avatars ตรงที่ bucket พวกนี้เป็น private
 *
 *     avatars เป็น public เพราะรูปโปรไฟล์ต้องโผล่ในทุกฟองแชทของทุกคน
 *     ★ แต่ QR รับเงิน ใบเสร็จ และสลิปโอนเงินมีเลขบัญชีอยู่ในรูป
 *       bucket สาธารณะแปลว่าใครเดา URL ถูกก็เปิดดูของคนทั้งบริษัทได้
 *
 *     ★★ การอ่านจึงต้องผ่าน signed URL ที่ server ออกให้หลังตรวจสิทธิ์แล้ว
 *        ไม่ใช่ getPublicUrl() ที่ใครถือลิงก์ก็เปิดได้ตลอดกาล
 */

export const BUCKETS = {
  receipts: 'receipts',
  slips: 'slips',
  qr: 'payment-qr',
} as const

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS]

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** QR เล็กกว่าเพราะเป็นภาพ code ล้วน ไม่ใช่ภาพถ่าย */
const MAX_BYTES: Record<BucketName, number> = {
  receipts: 5 * 1024 * 1024,
  slips: 5 * 1024 * 1024,
  'payment-qr': 2 * 1024 * 1024,
}

/**
 * ★ อายุ signed URL สั้นมากโดยตั้งใจ
 *
 *   5 นาทีพอสำหรับ "เปิดดูแล้วสแกน" ซึ่งเป็นสิ่งเดียวที่ทำกับรูปพวกนี้
 *   ★ ถ้าตั้งยาว ลิงก์ที่หลุดจาก devtools หรือประวัติเบราว์เซอร์จะใช้ได้
 *     นานเกินจำเป็น — และผู้ใช้ไม่มีทางเพิกถอนมันเองได้เลย
 */
const SIGNED_TTL_SECONDS = 300

/**
 * อัปโหลดไฟล์เข้า private bucket
 *
 * ★ path ขึ้นต้นด้วย user id เสมอ — เป็นทั้งการจัดระเบียบและด่านสุดท้าย
 *   ถ้าวันหนึ่งมีใครเปิด RLS ให้ client เขียนเอง policy จะเขียนได้ง่าย ๆ
 *   ว่า "เขียนได้เฉพาะโฟลเดอร์ที่ชื่อตรงกับ auth.uid()"
 */
export async function uploadPrivate(
  bucket: BucketName,
  ownerId: string,
  file: File,
): Promise<string> {
  const ext = ALLOWED[file.type]
  if (!ext) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.imgTypes3' })
  }
  if (file.size > MAX_BYTES[bucket]) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.max2mb' })
  }

  const admin = getSupabaseAdminClient()
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
    /* ★ ไม่ cache ที่ CDN — ไฟล์ส่วนตัวไม่ควรอยู่ในแคชสาธารณะที่ไหนเลย */
    cacheControl: 'no-store',
  })

  if (error) {
    throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })
  }

  return path
}

/**
 * ออกลิงก์ชั่วคราวให้ดูไฟล์
 *
 * ★★ ผู้เรียกต้องตรวจสิทธิ์มาก่อนแล้ว — ฟังก์ชันนี้ไม่ตรวจให้
 *
 *    เขียนไว้ให้ชัดเพราะมันดูเหมือนฟังก์ชันที่ปลอดภัยในตัว ★ ซึ่งไม่ใช่
 *    มันออกลิงก์ให้ทุก path ที่ส่งมา — ด่านอยู่ที่คนเรียกเสมอ
 */
/**
 * ลิงก์ชั่วคราว — คืน null ถ้าสร้างไม่ได้ แทนการโยน error
 *
 * ★★★ ใช้ตอน "อ่าน" ไฟล์ที่อาจไม่มีอยู่แล้ว
 *
 *     ★ อาการที่เจอจริง: หน้าจ่ายเงินค้างที่ "กำลังโหลด…" ตลอดกาล
 *       เพราะ QR ของเจ้าหนี้ชี้ไปหาไฟล์ที่ถูกลบไปแล้ว
 *       ★★ แล้ว createSignedUrl ล้ม → ทั้ง endpoint ตอบ 500 →
 *          ทั้งหน้าไม่มีอะไรแสดงเลย แม้แต่ยอดเงินกับปุ่ม "โอนแล้ว"
 *          ที่ไม่ได้เกี่ยวกับไฟล์นั้นเลยสักนิด
 *
 *     ★★ ไฟล์หายหนึ่งไฟล์ไม่ควรทำให้ทั้งหน้าใช้ไม่ได้ —
 *        ★ ของที่มีก็แสดงไป ของที่หายก็ว่างไว้ แล้วคนยังทำงานต่อได้
 *
 * ★ ยังมี signedUrl() ตัวที่โยน error อยู่ สำหรับตอน "เพิ่งอัปเสร็จ"
 *   ★★ ตรงนั้นถ้าสร้างลิงก์ไม่ได้แปลว่าการอัปโหลดมีปัญหาจริง ต้องรู้
 */
export async function signedUrlOrNull(
  bucket: BucketName,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function signedUrl(bucket: BucketName, path: string): Promise<string> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })
  }
  return data.signedUrl
}

/** ลบไฟล์เก่าทิ้ง — เรียกหลังอัปตัวใหม่สำเร็จเท่านั้น */
export async function removePrivate(bucket: BucketName, path: string | null): Promise<void> {
  if (!path) return
  const admin = getSupabaseAdminClient()
  /* ★ ลบไม่สำเร็จไม่ใช่เรื่องคอขาดบาดตาย — ไฟล์กำพร้ากินพื้นที่ แต่ไม่มีใครเห็น
     การโยน error ตรงนี้จะทำให้การเปลี่ยนรูปล้มทั้งที่รูปใหม่ขึ้นไปแล้ว */
  await admin.storage.from(bucket).remove([path]).catch(() => undefined)
}
