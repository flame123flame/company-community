import { type Locale } from '../config'
import { makeOt, type Ot } from '../office-format'
import { th, type OfficeDict, type OfficeKey } from './th'
import { en } from './en'
import { ja } from './ja'
import { zh } from './zh'
import { ko } from './ko'
import { lo } from './lo'
import { vi } from './vi'
import { id } from './id'
import { ms } from './ms'
import { fr } from './fr'
import { de } from './de'
import { es } from './es'
import { pt } from './pt'
import { it } from './it'
import { ru } from './ru'
import { ar } from './ar'

export type { OfficeDict, OfficeKey, Ot }

/*
 * ★★★ ไฟล์นี้ลากข้อความทั้ง 16 ภาษาเข้ามา — ใช้ได้ฝั่ง server เท่านั้น
 *
 *     ★ ฝั่ง client ต้อง import จาก '../office' (provider + useOt)
 *       ★★ ซึ่งรู้จักแต่ชนิด ไม่รู้จักข้อความของภาษาไหนเลย
 *     ★ ถ้ามีใคร import ไฟล์นี้ในคอมโพเนนต์ที่มี 'use client'
 *       บันเดิลของ browser จะโตขึ้นประมาณ 600KB เงียบ ๆ โดยไม่มีอะไรฟ้อง
 */

/*
 * ★★ Record เต็ม ไม่ใช่ Partial — เหตุผลเดียวกับ dict ของห้องเพลง
 *
 *    ระหว่างที่ยังแปลไม่ครบ ตัวนี้เป็น Partial เพื่อให้ภาษาที่ยังไม่มีไฟล์
 *    ตกไปอังกฤษ ★ ตอนนี้ครบ 16 ภาษาแล้ว จึงเปลี่ยนกลับเป็น Record เต็มทันที —
 *      วันที่ใครเพิ่มภาษาใน LOCALES แล้วลืมสร้างดิกชันนารี TypeScript
 *      จะไม่ยอมคอมไพล์ ★★ แทนที่จะปล่อยให้ภาษานั้นตกไปอังกฤษเงียบ ๆ
 *      แล้วไม่มีใครรู้จนกว่าจะมีคนบ่น
 */
const DICTS: Record<Locale, OfficeDict> = {
  th, en, zh, ja, ko, lo, vi, id, ms, fr, de, es, pt, it, ru, ar,
}

export function officeDictOf(locale: Locale): OfficeDict {
  return DICTS[locale] ?? en
}

/**
 * ภาษาสำรองเมื่อกุญแจไหนยังไม่ได้แปล
 *
 * ★ อังกฤษ ไม่ใช่ไทย — เหตุผลเขียนไว้ละเอียดใน dict/index.ts แล้ว
 *   สรุปสั้น ๆ: คนเวียดนามที่เจอข้อความไทยโผล่มากลางหน้า อ่านไม่ออกเลย
 *   แม้แต่ตัวเดียว แต่เดาอังกฤษได้บ้าง
 */
function fallbackFor(locale: Locale): OfficeDict {
  return locale === 'th' ? th : en
}

/** ตัวแปลฝั่ง server component */
export function officeTranslator(locale: Locale): Ot {
  return makeOt({ ...fallbackFor(locale), ...officeDictOf(locale) })
}

/**
 * ก้อนที่ส่งลงไปให้ browser ทาง props ของ OfficeI18nProvider
 *
 * ★★ ยุบภาษาสำรองเข้ามาให้แล้วตั้งแต่ฝั่งนี้ — ฝั่ง client ไม่มีทางรู้จัก
 *    ดิกชันนารีอื่นได้เลย (ถ้ารู้จัก = ลากทุกภาษาเข้าบันเดิล)
 */
export function clientOfficeDict(locale: Locale): OfficeDict {
  return { ...fallbackFor(locale), ...officeDictOf(locale) }
}

/**
 * ก้อนย่อยของดิกชันนารี — เฉพาะกุญแจที่ขึ้นต้นด้วยคำนำหน้าที่ขอมา
 *
 * ★★★ มีไว้สำหรับหน้าที่อยู่นอก /office แต่ใช้คอมโพเนนต์ของออฟฟิศชิ้นเดียว
 *
 *     ★ หน้าแรกใส่กระดิ่งแจ้งเตือนเข้าไป ซึ่งเป็น client component ที่ใช้
 *       useOt() ★★ ถ้าส่ง clientOfficeDict() ไปทั้งก้อน หน้าแรกจะแบก
 *       ข้อความ 779 กุญแจของทุกโมดูล เพื่อป้ายไม่กี่คำบนกระดิ่งอันเดียว
 *
 *     ★ วัดจริงบนหน้าแรกตอนล็อกอินแล้ว: ก้อนเต็ม 269,764 ไบต์ ·
 *       ก้อนย่อย 235,038 ไบต์ — ต่างกัน 34,726 ไบต์ (ราว 13%)
 *       ★★ ซึ่งคนทุกคนต้องโหลดทุกครั้งที่เปิดเว็บ ไม่ว่าจะมีแจ้งเตือนไหม
 *
 * ★★ ไม่ใช้ fallback ภาษาอังกฤษซ้อนเหมือน clientOfficeDict()
 *    ★ ตอนนี้ทุกภาษาแปลครบแล้ว การซ้อนจึงไม่ได้เพิ่มอะไรนอกจากขนาด
 *      ★★ และ makeOt() คืนชื่อกุญแจเองถ้าหาไม่เจอ — ไม่มีทางเป็นจอขาว
 */
export function officeDictSubset(locale: Locale, prefixes: string[]): Partial<OfficeDict> {
  const full = officeDictOf(locale)
  const out: Partial<OfficeDict> = {}
  for (const [key, value] of Object.entries(full)) {
    if (prefixes.some((p) => key.startsWith(p))) out[key as OfficeKey] = value
  }
  return out
}
