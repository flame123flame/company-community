'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * "ใครกำลังพิมพ์" — ส่งผ่าน Realtime broadcast ไม่เก็บลงฐานข้อมูล
 *
 * ★★★ สถานะกำลังพิมพ์ไม่ใช่ข้อมูล มันคือสัญญาณ
 *
 *     ★ ถ้าเก็บเป็นคอลัมน์ในตาราง คนพิมพ์หนึ่งประโยคจะเขียนฐานข้อมูลสิบกว่าครั้ง
 *       คูณจำนวนคนในออฟฟิศ เพื่อข้อมูลที่หมดค่าภายในสามวินาที
 *     ★★ broadcast ไม่แตะตารางเลย ไม่ต้อง migration และหายเองเมื่อปิดหน้าเว็บ
 *        ★ ซึ่งเป็นพฤติกรรมที่ถูกอยู่แล้ว — ปิดแท็บไปคือหยุดพิมพ์
 *
 * ★★ ไม่มีสัญญาณ "หยุดพิมพ์" แยกต่างหาก ใช้การหมดอายุแทน
 *    ★ สัญญาณหยุดหายไปได้ (เน็ตหลุด ปิดแท็บ แท็บถูกพักการทำงาน) แล้วคำว่า
 *      "กำลังพิมพ์…" จะค้างอยู่บนจอคนอื่นตลอดกาล
 *    ★★ การนับถอยหลังจากสัญญาณล่าสุดพังไม่เป็น — เงียบเมื่อไหร่ก็หายไปเอง
 */

/** ส่งสัญญาณซ้ำทุก 1.5 วินาทีระหว่างที่ยังพิมพ์อยู่ */
const BEAT_MS = 1500
/** ไม่ได้ยินเกิน 4 วินาที ถือว่าหยุดพิมพ์แล้ว */
const GONE_MS = 4000

export function useChatTyping(roomId: string | null, meId: string | null, meName: string) {
  const [names, setNames] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const heard = useRef(new Map<string, { name: string; at: number }>())
  const lastSent = useRef(0)

  useEffect(() => {
    heard.current.clear()
    setNames([])
    if (!roomId || !meId) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`office-typing:${roomId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const id = (payload as { id?: string } | null)?.id
        const name = (payload as { name?: string } | null)?.name
        /* ★ ไม่นับตัวเอง — broadcast ส่งกลับมาหาคนส่งด้วยถ้าเปิด self ไว้ */
        if (!id || id === meId) return
        heard.current.set(id, { name: name ?? '', at: Date.now() })
      })
      .subscribe()

    channelRef.current = channel

    /*
     * ★ กวาดคนที่เงียบไปแล้วทุก 700 มิลลิวินาที แต่ setState เฉพาะตอนรายชื่อเปลี่ยนจริง
     *   ★★ ถ้าเซ็ตทุกรอบ ห้องแชทจะวาดใหม่วินาทีละครั้งครึ่งตลอดเวลาที่เปิดค้างไว้
     */
    const tick = window.setInterval(() => {
      const now = Date.now()
      for (const [id, v] of heard.current) {
        if (now - v.at > GONE_MS) heard.current.delete(id)
      }
      const next = [...heard.current.values()].map((v) => v.name)
      setNames((prev) =>
        prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next,
      )
    }, 700)

    return () => {
      window.clearInterval(tick)
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [roomId, meId])

  /*
   * ★★ หน่วงการส่ง — เรียกได้ทุกครั้งที่กดแป้น แต่ส่งจริงแค่ทุก 1.5 วินาที
   *    ★ พิมพ์เร็ว ๆ หนึ่งประโยคคือการกดแป้นหลายสิบครั้ง ถ้าส่งทุกครั้ง
   *      จะยิงข้อความผ่านซ็อกเก็ตถี่กว่าที่หน้าจอปลายทางจะใช้ประโยชน์ได้
   */
  const notify = useCallback(() => {
    const now = Date.now()
    if (now - lastSent.current < BEAT_MS) return
    lastSent.current = now
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { id: meId, name: meName },
    })
  }, [meId, meName])

  return { typing: names, notify }
}
