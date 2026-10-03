'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocale } from './client'
import { markThai } from './untranslated'
import { makeOt, type OfficeDict, type Ot } from './office-format'

/*
 * ★★★ ไฟล์นี้มีแต่ provider กับ hook — ตรรกะการแปลอยู่ที่ './office-format'
 *
 *     ★ 'use client' บรรทัดแรกทำให้ "ทุก export" ในไฟล์กลายเป็นของฝั่ง client
 *       ★★ เคยเอา makeOt() มาไว้ที่นี่ด้วย แล้ว server component ที่เรียกมัน
 *          ล้มทั้งหน้าด้วยข้อความ "makeOt is on the client"
 *          ★ ซึ่ง tsc กับ next build ไม่จับให้เลย — เห็นตอนเปิดหน้าจริง
 *            เพราะเส้นแบ่ง server/client เป็นกฎของ Next ไม่ใช่ของ TypeScript
 *
 *     ★★ ชนิดที่ re-export ที่นี่ปลอดภัย — `export type` ถูกลบตอนคอมไพล์
 *        จึงไม่ได้สร้าง client reference ขึ้นมา
 */
export type { OfficeDict, OfficeKey, Ot } from './office-format'

/**
 * ภาษาของโมดูลออฟฟิศฝั่ง client
 *
 * ★★★ ทำไมโมดูลนี้มี provider ของตัวเอง ไม่ใช้ I18nProvider ของห้องเพลง
 *
 *     สองโมดูลมีข้อความรวมกันเกิน 1,400 กุญแจ ★ ถ้ายุบเป็นก้อนเดียว
 *       หน้าห้องเพลงจะต้องแบกข้อความออฟฟิศ 779 กุญแจที่ไม่มีหน้าไหนใช้
 *       และหน้าออฟฟิศจะแบกข้อความของห้องเพลงกลับกัน
 *
 *     ★★ แยก provider แล้วแต่ละหน้าได้เฉพาะก้อนที่ตัวเองใช้
 *        ★ /office/* ได้ก้อนออฟฟิศ · / กับ /room/* ได้ก้อนห้องเพลง
 *          ★★ หน้าที่ต้องใช้ทั้งสอง (เช่น /register) ครอบสอง provider ได้
 *             โดยไม่ต้องให้ทุกหน้าในเว็บจ่ายค่านั้นด้วย
 *
 * ★ server ส่ง "ดิกชันนารีของภาษาที่ใช้อยู่" ลงมา ไม่ใช่แค่ชื่อภาษา
 *   เหตุผลเดียวกับที่เขียนไว้ยาว ๆ ใน client.tsx ของห้องเพลง
 */
const OfficeI18nContext = createContext<Partial<OfficeDict>>({})

export function OfficeI18nProvider({
  dict,
  children,
}: {
  dict: Partial<OfficeDict>
  children: ReactNode
}) {
  /* ★ dict เป็นอ็อบเจ็กต์ก้อนเดิมที่ server ส่งมา — useMemo กัน consumer
       ทั้งหมด re-render เมื่อ parent render ใหม่โดยที่ภาษาไม่ได้เปลี่ยน */
  const value = useMemo(() => dict, [dict])
  return <OfficeI18nContext.Provider value={value}>{children}</OfficeI18nContext.Provider>
}

/**
 * ★ ตัวเดียวที่คอมโพเนนต์ฝั่ง client ต้องรู้จัก
 *
 *   ★★ ทุกฟังก์ชันที่เรียก ot() ต้องเรียก useOt() ของตัวเอง — ไม่ใช่รับ ot
 *      ผ่าน props ลงไปทีละชั้น ★ การส่งผ่าน props ทำให้คอมโพเนนต์ที่ไม่
 *        เกี่ยวกับภาษาเลยต้องมีพารามิเตอร์ ot โผล่ขึ้นมาในหน้าตาของมัน
 *
 *   ★ ยกเว้นฟังก์ชันช่วยที่ไม่ใช่คอมโพเนนต์ (formatWhen · dayLabel · typingLabel
 *     และป้ายใน lib/office/*) — พวกนั้นรับ ot เป็นพารามิเตอร์ เพราะเรียก
 *     hook ในฟังก์ชันที่ไม่ใช่คอมโพเนนต์ไม่ได้
 */
export function useOt(): Ot {
  const dict = useContext(OfficeI18nContext)
  return useMemo(() => makeOt(dict), [dict])
}

/**
 * ข้อความที่ยังไม่ได้แปล — ติดป้ายว่าเป็นภาษาไทยให้ถูกต้อง
 *
 * ★★★ มีไว้เพราะกติกา "ระหว่างพัฒนาทำไทยอย่างเดียว" ใน AGENTS.md
 *
 *     ★ กติกานั้นบอกให้เติมกุญแจใหม่ในอีก 15 ไฟล์ "ด้วยข้อความไทยชุดเดิม"
 *       ★★ ผลคือหน้าภาษาเยอรมันมีประโยคไทยโผล่กลางจอจริง ๆ ซึ่งตั้งใจ
 *     ★ แต่ประโยคไทยที่ไม่มีป้ายบอก คือข้อความที่ "อ้างว่าเป็นภาษาเยอรมัน"
 *       ★★ โปรแกรมอ่านหน้าจอจะออกเสียงมันด้วยกฎของภาษาเยอรมัน ซึ่งฟังไม่รู้เรื่อง
 *          ★ lang="th" เป็นคำอธิบายที่ตรงความจริงของตัวหนังสือตรงนั้น
 *            ไม่ใช่การหลบด่านตรวจ — บังเอิญที่ด่าน i18n ใช้ป้ายเดียวกันนี้
 *            แยก "ของที่ตั้งใจเป็นภาษาอื่น" ออกจาก "ของที่ลืมแปล"
 *
 * ★★★ ป้ายหายเองเมื่อแปลเสร็จ ไม่ต้องตามเก็บ
 *
 *     ★ เช็คจากตัวหนังสือจริงว่ามีอักษรไทยไหม ไม่ได้เช็คจากรายชื่อกุญแจ
 *       ★★ วันที่เจ้าของสั่งแปลแล้วเติมคำเยอรมันลงไป เงื่อนไขนี้เป็นเท็จทันที
 *          แล้ว <span> ก็หายไปเอง ★ ถ้าใช้รายชื่อกุญแจแทน จะเหลือป้าย
 *          lang="th" คาอยู่บนข้อความเยอรมัน ซึ่งผิดยิ่งกว่าไม่ติดป้ายเลย
 *
 * ★ ใช้เฉพาะข้อความที่ "มองเห็นบนจอ" — aria-label กับ title เป็นแอตทริบิวต์
 *   ห่อด้วย element ไม่ได้ ★★ ถ้าวันหนึ่งต้องติดป้ายให้พวกนั้นด้วย
 *   ต้องใส่ lang ที่ตัว element ที่ถือแอตทริบิวต์นั้นแทน
 */
export function Untranslated({ children }: { children: string }) {
  /* ★ ตรรกะอยู่ใน lib/i18n/untranslated.tsx ซึ่งไม่ใช่ 'use client'
       ★★ หน้าที่เป็น server component จึงใช้ของชิ้นเดียวกันได้ แทนการ
          เขียนช่วงอักษรไทยซ้ำแล้วปล่อยให้สองที่ค่อย ๆ ต่างกัน */
  return <>{markThai(useLocale(), children)}</>
}
