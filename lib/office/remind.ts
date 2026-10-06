/**
 * สไตล์การทวงเงิน — เก็บเป็น params.tone ในแจ้งเตือน (ฐานข้อมูลเก็บเป็นข้อความอิสระอยู่แล้ว ไม่ต้องแก้ schema)
 *
 * ★ ข้อความจริงอยู่ในดิกชันนารี `wallet.tone.<TONE>.title / .msg` — ที่นี่มีแค่รายชื่อกับอีโมจิ
 * ★ API ตรวจด้วยรายชื่อนี้ (z.enum) — สไตล์ที่ไม่รู้จักถูกปฏิเสธ ไม่หลุดไปถึงหน้าจอคนถูกทวง
 */
export const REMIND_TONES = ['POLITE', 'CAT', 'PLEAD', 'COFFEE', 'HEART', 'FUNNY'] as const
export type RemindTone = (typeof REMIND_TONES)[number]

export const TONE_EMOJI: Record<RemindTone, string> = {
  POLITE: '🙏',
  CAT: '🐱',
  PLEAD: '🥺',
  COFFEE: '☕',
  HEART: '💕',
  FUNNY: '😂',
}

/** สีประจำสไตล์ — rgb สามตัวเลข (ระบบเดียวกับ --tint) */
export const TONE_TINT: Record<RemindTone, string> = {
  POLITE: '52 199 123',
  CAT: '255 149 0',
  PLEAD: '175 82 222',
  COFFEE: '162 110 60',
  HEART: '255 45 120',
  FUNNY: '10 132 255',
}

export const isTone = (v: unknown): v is RemindTone => typeof v === 'string' && (REMIND_TONES as readonly string[]).includes(v)
