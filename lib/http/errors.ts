/**
 * Error taxonomy ของทั้งระบบ
 *
 * กฎเหล็ก: ผู้ใช้เห็นได้แค่ `code` + `message` ที่เราเขียนเองเท่านั้น
 * ข้อความดิบจาก Postgres / YouTube / stack trace ถูก log ฝั่ง server
 * แล้วส่งกลับเป็น INTERNAL_ERROR + requestId เท่านั้น
 */

import type { DictKey } from '@/lib/i18n/dict'

export const APP_ERRORS = {
  VALIDATION_FAILED: { status: 400 },
  INVALID_ROOM_CODE: { status: 400 },
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  ROOM_NOT_FOUND: { status: 404 },
  QUEUE_ITEM_NOT_FOUND: { status: 404 },
  MEMBER_NOT_FOUND: { status: 404 },
  VIDEO_UNAVAILABLE: { status: 404 },
  VIDEO_NOT_EMBEDDABLE: { status: 422 },
  QUEUE_LOCKED: { status: 409 },
  QUEUE_FULL: { status: 409 },
  DUPLICATE_IN_QUEUE: { status: 409 },
  STALE_PLAYBACK: { status: 409 },
  PREMATURE_END: { status: 409 },
  RATE_LIMITED: { status: 429 },

  /* ── ระบบกิจกรรมออฟฟิศ (0023) ─────────────────────────────────────────
   * ★ ชื่อต้องตรงกับที่ RPC `raise exception` เป๊ะ ๆ
   *   fromPostgresError() จับคู่ด้วยการ match ชื่อในข้อความ error
   */
  /** ไม่มีรหัสพนักงานนี้ในรายชื่อ */
  CODE_NOT_FOUND: { status: 404 },
  /** รหัสนี้มีคนสมัครไปแล้ว — 1 รหัสต่อ 1 บัญชี */
  CODE_TAKEN: { status: 409 },
  /** รหัสถูกเปลี่ยนสถานะเป็นลาออก */
  CODE_INACTIVE: { status: 403 },
  /** บัญชีนี้ผูกรหัสพนักงานไว้แล้ว */
  ALREADY_LINKED: { status: 409 },
  /** บัญชีถูกระงับ */
  ACCOUNT_SUSPENDED: { status: 403 },
  /** ยังไม่ได้ผูกรหัสพนักงาน — เข้าโมดูลออฟฟิศไม่ได้ */
  NEEDS_EMPLOYEE_CODE: { status: 403 },

  NOT_CONFIGURED: { status: 503 },
  YOUTUBE_QUOTA_EXCEEDED: { status: 503 },
  YOUTUBE_UNAVAILABLE: { status: 502 },
  DATABASE_ERROR: { status: 500 },
  INTERNAL_ERROR: { status: 500 },
} as const

export type AppErrorCode = keyof typeof APP_ERRORS

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  /**
   * กุญแจแปลเฉพาะกรณี — ใช้ตอนอยากบอกละเอียดกว่าข้อความมาตรฐานของ code นั้น
   *
   * ★ เก็บ "กุญแจ" ไม่ใช่ข้อความ เพราะ error ถูกสร้างลึกในชั้นที่ไม่รู้จัก
   *   ภาษาของคนเรียก — respond.ts เป็นคนแปลตอนจะส่งออก
   */
  readonly messageKey?: DictKey
  readonly retryAfter?: number

  constructor(
    code: AppErrorCode,
    options?: { messageKey?: DictKey; retryAfter?: number; cause?: unknown },
  ) {
    const spec = APP_ERRORS[code]
    /* ★ ข้อความใน super() มีไว้ให้ log อ่าน ไม่เคยถึงตาผู้ใช้ — ใช้ code ตรง ๆ พอ */
    super(options?.messageKey ?? code, { cause: options?.cause })
    this.name = 'AppError'
    this.code = code
    this.status = spec.status
    if (options?.messageKey) this.messageKey = options.messageKey
    if (options?.retryAfter !== undefined) this.retryAfter = options.retryAfter
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/**
 * แปลง exception ที่โยนมาจาก Postgres RPC เป็น AppError
 *
 * RPC ของเรา `raise exception 'QUEUE_FULL'` เป็นชื่อ code ตรง ๆ
 * ส่วน error code ของ Postgres เอง (23505 = unique violation) map แยก
 */
export function fromPostgresError(error: {
  message?: string
  code?: string
  details?: string
}): AppError {
  const raw = error.message ?? ''

  for (const code of Object.keys(APP_ERRORS) as AppErrorCode[]) {
    if (raw.includes(code)) return new AppError(code, { cause: error })
  }

  switch (error.code) {
    case '23505': // unique_violation
      return new AppError('DUPLICATE_IN_QUEUE', { cause: error })
    case '23503': // foreign_key_violation
      return new AppError('ROOM_NOT_FOUND', { cause: error })
    case '23514': // check_violation
      return new AppError('VALIDATION_FAILED', { cause: error })
    case '42501': // insufficient_privilege (RLS ปฏิเสธ)
      return new AppError('FORBIDDEN', { cause: error })
    default:
      return new AppError('DATABASE_ERROR', { cause: error })
  }
}
