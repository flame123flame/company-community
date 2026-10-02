'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * ใครออนไลน์อยู่ตอนนี้ — ทั้งระบบ ไม่ใช่เฉพาะในห้อง
 *
 * ★★★ ใช้ Realtime presence ไม่ใช่คอลัมน์ last_seen_at ในฐานข้อมูล
 *
 *     ★ คอลัมน์ต้องมี migration · ต้องมี heartbeat เขียนทับทุกไม่กี่วินาที
 *       · และต้องมีงานล้างค่าที่ค้างของคนที่ปิดแท็บไปเฉย ๆ
 *       ★★ ซึ่งแปลว่าทุกคนที่เปิดเว็บค้างไว้จะยิง UPDATE ลงตารางเดียวกัน
 *          ตลอดเวลา เพื่อข้อมูลที่หมดอายุใน 30 วินาที
 *
 *     ★ presence เก็บอยู่ในหน่วยความจำของ Realtime เท่านั้น ไม่แตะฐานข้อมูล
 *       ★★ และหายเองเมื่อการเชื่อมต่อหลุด — ไม่มีสถานะค้างให้ต้องล้าง
 *          ซึ่งตรงกับความหมายของคำว่า "ออนไลน์" พอดี
 *
 * ★★ ช่องเดียวสำหรับทั้งระบบ ('office-presence')
 *    ★ ไม่ได้แยกตามห้องแชท เพราะคำถามคือ "คนนี้ออนไลน์ไหม" ไม่ใช่
 *      "คนนี้อยู่ในห้องนี้ไหม" — คนที่กำลังดูหน้าตลาดนัดอยู่ก็ยังทักได้
 *
 * ★ คืนเป็น Set เพื่อให้จุดที่เรียกเช็กด้วย .has() ซึ่งเป็น O(1)
 *   ★★ รายชื่อคนในออฟฟิศถูกวาดใหม่ทุกครั้งที่พิมพ์ในช่องค้นหา การใช้
 *      .includes() บนอาร์เรย์จะกลายเป็น O(n²) ตอนคนเยอะ
 */
/**
 * การเชื่อมต่อร่วมของทั้งแท็บ — หนึ่งช่องต่อหนึ่ง meId ไม่ใช่หนึ่งช่องต่อหนึ่ง hook
 *
 * ★★★ เคยไม่มีตัวนี้ แล้วหน้าแชทพังทั้งหน้าทันทีที่แถบบนมีเมนูแชท
 *
 *     ★ ก่อนหน้านี้มีที่เดียวที่เรียก hook นี้ จึงไม่มีใครเจอปัญหา
 *       ★★ พอใส่ ChatMenu เข้าไปในแถบบน หน้า /office/chat กลายเป็นมีสองที่
 *          ที่เรียก hook เดียวกันพร้อมกัน
 *     ★ supabase.channel('office-presence') เรียกสองครั้งด้วยชื่อเดียวกัน
 *       ไม่ได้สร้างช่องใหม่ — client คืนช่องเดิมที่ subscribe ไปแล้ว
 *       ★★ แล้วการ .on('presence', …) บนช่องที่ subscribe แล้วเป็น error
 *          ของ supabase ตรง ๆ: "cannot add presence callbacks … after subscribe()"
 *     ★ error นี้ถูกโยนตอน render จึงพาหน้าทั้งหน้าลงไปด้วย — ช่องพิมพ์
 *       ไม่ถูกเรนเดอร์เลย ★★ วัดได้จากเบราว์เซอร์จริง ไม่ใช่จาก tsc หรือ build
 *       ซึ่งผ่านทั้งคู่
 *
 * ★★ แก้ด้วยการนับผู้ใช้ (refcount) ไม่ใช่ตั้งชื่อช่องให้ไม่ซ้ำ
 *    ★ ชื่อที่ไม่ซ้ำ = คนละห้อง presence ★★ แปลว่า ChatMenu จะไม่เห็นคนที่
 *      OfficeChat เห็น และสองที่บนหน้าเดียวกันจะบอกสถานะคนเดียวกันไม่ตรงกัน
 */
type Shared = {
  channel: RealtimeChannel
  listeners: Set<(ids: Set<string>) => void>
  online: Set<string>
}

const SHARED = new Map<string, Shared>()

function joinPresence(meId: string, onChange: (ids: Set<string>) => void): () => void {
  let shared = SHARED.get(meId)

  if (!shared) {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase.channel(`office-presence:${meId}`, {
      config: { presence: { key: meId } },
    })
    const fresh: Shared = { channel, listeners: new Set(), online: new Set() }

    const sync = () => {
      /* ★ คีย์ของ presence state คือ userId ที่เราตั้งไว้ตอน subscribe */
      fresh.online = new Set(Object.keys(channel.presenceState()))
      for (const fn of fresh.listeners) fn(fresh.online)
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        /*
         * ★★ ต้อง track หลัง SUBSCRIBED เท่านั้น
         *    ★ เรียกก่อนหน้านั้นจะเงียบหาย — ไม่มี error และเราจะไม่ปรากฏ
         *      ในสายตาคนอื่นเลย ทั้งที่หน้าเราแสดงว่าคนอื่นออนไลน์ปกติ
         */
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() })
      })

    SHARED.set(meId, fresh)
    shared = fresh
  }

  shared.listeners.add(onChange)
  /* ★ ผู้เข้าร่วมรายใหม่ต้องได้ภาพปัจจุบันทันที ไม่ต้องรอ event ถัดไป
       ★★ ไม่งั้น ChatMenu ที่ติดมาทีหลังจะโชว์ "ไม่มีใครออนไลน์" จนมีคนเข้า/ออก */
  if (shared.online.size > 0) onChange(shared.online)

  return () => {
    const s = SHARED.get(meId)
    if (!s) return
    s.listeners.delete(onChange)
    /*
     * ★★ ปิดช่องเฉพาะเมื่อไม่มีใครฟังแล้ว
     *    ★ ถ้าปิดทันทีที่ตัวใดตัวหนึ่งเลิกฟัง (เช่นเปลี่ยนหน้าออกจาก /office/chat
     *      แต่แถบบนยังอยู่) เมนูแชทจะหยุดรู้สถานะออนไลน์เงียบ ๆ
     */
    if (s.listeners.size === 0) {
      SHARED.delete(meId)
      void getSupabaseBrowserClient().removeChannel(s.channel)
    }
  }
}

export function useOnlinePeople(meId: string | null): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set())

  /*
   * ★ ผูก effect กับ meId ตรง ๆ ไม่ใช้ ref
   *   ★★ เคยคิดจะเก็บใน ref เพื่อไม่ให้ subscribe ใหม่ ★ แต่พอต้องรอ meId
   *      โหลดเสร็จก่อนถึงจะ track ได้ effect ก็ต้องรันซ้ำตอนมันมาถึงอยู่ดี
   *      ★★ ref จะทำให้ค่าที่ใช้ตอน subscribe เป็นค่าเก่าโดยไม่มีอะไรฟ้อง
   */
  useEffect(() => {
    /*
     * ★★ ยังไม่รู้ว่าเราเป็นใคร = ยัง track ไม่ได้
     *    ★ presence ต้องมีคีย์ที่เป็น userId จริง ★★ ถ้า subscribe ไปก่อน
     *      ด้วยคีย์ว่าง เราจะไปโผล่เป็นคนลึกลับในสายตาคนอื่น และพอรู้ id
     *      แล้ว effect รันใหม่ก็จะเห็นเราหายแล้วโผล่
     */
    if (!meId) return
    return joinPresence(meId, setOnline)
  }, [meId])

  return online
}
