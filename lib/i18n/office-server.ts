import 'server-only'
import { getLocale } from './server'
import { clientOfficeDict, officeTranslator, type Ot } from './office-dict'

/**
 * ตัวแปลของโมดูลออฟฟิศ ฝั่ง server component
 *
 * ★ คืน dict มาด้วย เพราะหน้า/เลย์เอาต์ที่แปลเอง มักต้องส่งก้อนเดียวกันนี้
 *   ต่อให้ลูกที่เป็น client component ผ่าน OfficeI18nProvider
 *   ★★ การให้ผู้เรียกไปหา clientOfficeDict() เองอีกทีคือการเปิดช่องให้
 *      server render ภาษาหนึ่งแล้วส่งอีกภาษาลงไปให้ client
 *
 * ★★ ใช้ getLocale() ตัวเดียวกับห้องเพลง — ภาษาคือการตั้งค่าของคน ไม่ใช่
 *    ของโมดูล ★ คนที่เลือกญี่ปุ่นในห้องเพลงต้องได้ญี่ปุ่นในออฟฟิศด้วย
 *      โดยไม่ต้องเลือกซ้ำ และปุ่มเปลี่ยนภาษามีที่เดียวในเว็บ
 */
export async function getOt(): Promise<{ ot: Ot; dict: ReturnType<typeof clientOfficeDict> }> {
  const locale = await getLocale()
  return { ot: officeTranslator(locale), dict: clientOfficeDict(locale) }
}
