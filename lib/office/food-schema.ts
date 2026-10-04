import { z } from 'zod'
import { CUISINES, KARAOKE, type KaraokePricing } from './food'
import type { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * ตัวตรวจข้อมูลร้านฝั่ง server — ใช้ร่วมกันทั้งตอนเพิ่มร้านและแก้ไขร้าน (0061)
 *
 * ★★ ประเภทร้านต้องอยู่ในรายการตายตัว — ฐานข้อมูลก็บังคับซ้ำด้วย check constraint
 * ★★ ราคาคาราโอเกะตรวจรูปแบบละเอียดที่นี่ ฐานข้อมูลตรวจแค่ "เป็น object"
 */
export const cuisineSchema = z.enum(CUISINES).optional().nullable()

const money = z.number().min(0).max(1_000_000)

export const karaokeSchema = z
  .object({
    hostessPerHour: money.nullable(),
    packages: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          price: money,
          /* ★ จำนวนเด็กเอ็นที่รวมในแพ็กเกจ — 0 ได้ (แพ็กเกจเหล้าอย่างเดียว) */
          hostesses: z.number().int().min(0).max(20),
        }),
      )
      .max(20),
    rooms: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(60),
            perHour: money.nullable(),
            night: money.nullable(),
          })
          /* ★ ห้องต้องมีราคาอย่างน้อยหนึ่งแบบ — ห้องที่ไม่มีราคาเลยไม่ได้บอกอะไร */
          .refine((r) => r.perHour != null || r.night != null, { message: 'food.karaoke.roomNeedsPrice' }),
      )
      .max(10),
    note: z.string().trim().max(300).nullable(),
  })
  .optional()
  .nullable()

/**
 * ค่า karaoke ที่จะเขียนลงฐานข้อมูล
 *
 * ★ ร้านที่ไม่ใช่คาราโอเกะ → null เสมอ (เปลี่ยนประเภทแล้วราคาเก่าต้องหาย —
 *   ฐานข้อมูลก็ห้ามไว้ด้วย constraint อยู่แล้ว)
 * ★ คาราโอเกะที่ไม่ได้กรอกอะไรเลย → null ไม่ใช่ object ว่าง
 */
export function karaokeToStore(
  cuisine: string | null | undefined,
  k: KaraokePricing | null | undefined,
): KaraokePricing | null {
  if (cuisine !== KARAOKE || !k) return null
  const empty = k.hostessPerHour == null && k.packages.length === 0 && k.rooms.length === 0 && !k.note
  return empty ? null : k
}

/**
 * อ่านราคาคาราโอเกะแบบยอมล้ม
 *
 * ★★ แยกเป็นคำขอเล็ก ๆ ต่างหาก ไม่ยัดเข้า select หลัก
 *    ★ คอลัมน์นี้มาจาก 0061 — ถ้ายังไม่ได้รัน migration คำขอนี้ล้ม
 *      แล้วได้ Map ว่าง ★★ หน้าร้านยังเปิดได้ปกติ แค่ไม่มีราคาคาราโอเกะ
 */
export async function readKaraoke(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  ids: string[],
): Promise<Map<string, KaraokePricing>> {
  const out = new Map<string, KaraokePricing>()
  if (ids.length === 0) return out
  try {
    const { data, error } = await admin.from('restaurants').select('id, karaoke').in('id', ids)
    if (error) return out
    for (const row of (data ?? []) as { id: string; karaoke: KaraokePricing | null }[]) {
      if (row.karaoke) out.set(row.id, row.karaoke)
    }
  } catch {
    /* คอลัมน์ยังไม่มี — ไม่ใช่เรื่องที่ต้องล้มทั้งหน้า */
  }
  return out
}
