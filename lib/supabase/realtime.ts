'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from './client'

/**
 * เตรียม Realtime ให้พร้อมก่อนเปิด channel
 *
 * ★★★ อาการ: บนเครื่องตัวเองดูเหมือนทำงาน แต่บน deploy ไม่มี event มาเลย
 *
 *     ★ Realtime ส่ง event ในนามของผู้ใช้ที่ subscribe ★★ ถ้า socket ยังไม่มี
 *       token ของผู้ใช้ตอนที่ channel ถูกเปิด RLS จะกรองทุกแถวทิ้ง
 *       ★ ไม่มี error ไม่มีอะไรฟ้อง — เงียบสนิท แบบเดียวกับที่ 0052 เล่าไว้
 *
 *     ★★★ ทำไมถึงต่างกันระหว่าง dev กับ deploy
 *         ★ มันคือการแข่งกันของสองอย่าง: คอมโพเนนต์ mount เสร็จ
 *           กับ session ถูกกู้คืนจากที่เก็บในเครื่อง
 *           ★★ บน dev หน้าโหลดช้ากว่ามาก (โค้ดยังไม่ถูกรวมร่าง) session
 *              จึงมาก่อนเกือบทุกครั้ง ★ บน build จริงหน้า hydrate เร็วมาก
 *              จน useEffect ยิงก่อน แล้ว channel ก็เปิดด้วย socket ที่ยังไม่มีใคร
 *         ★★ การแข่งกันแบบนี้คือบั๊กที่ "ทำงานบนเครื่องผมนะ" ของจริง
 *
 * ★★ คืนค่าเป็น "พร้อมหรือยัง" แทนที่จะพยายามแก้ให้เองเงียบ ๆ
 *    ★ คนเรียกเอาไปใส่ใน dependency ของ useEffect ที่เปิด channel
 *      ★★ พอ token มาถึง ค่าเปลี่ยน React จะ unmount effect เดิมแล้วเปิดใหม่
 *         ด้วย socket ที่รู้จักผู้ใช้แล้ว
 */
export function useRealtimeAuth(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let alive = true

    const apply = (token: string | undefined) => {
      if (!alive) return
      if (!token) {
        setReady(false)
        return
      }
      /* ★ บอก socket ว่าเราเป็นใคร — ตัวนี้คือสิ่งที่ขาดไปตอน channel เปิดเร็วเกิน */
      void supabase.realtime.setAuth(token)
      setReady(true)
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session?.access_token))

    /*
     * ★★ ฟังต่อด้วย — token หมดอายุทุกชั่วโมงแล้วถูกต่ออายุเอง
     *    ★ ไม่ฟัง socket จะยังถือ token ใบเก่าที่หมดอายุไปแล้ว
     *      ★★ ซึ่งทำให้ event หยุดมาเงียบ ๆ หลังเปิดหน้าทิ้งไว้นาน ๆ
     *         — อาการเดียวกับตอนแรกเป๊ะ แต่เกิดทีหลัง
     */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.access_token)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return ready
}

/** สถานะของ channel ที่เปิดอยู่ — ใช้ตัดสินว่าต้องพึ่งการดึงข้อมูลซ้ำแค่ไหน */
export type ChannelHealth = 'connecting' | 'live' | 'failed'

/**
 * ดึงข้อมูลซ้ำเป็นระยะ โดยถี่เท่าที่ Realtime ยังพึ่งไม่ได้
 *
 * ★★★ ของสำรองที่ "ปรับตัวตามความจริง" ไม่ใช่รอบคงที่
 *
 *     ★ Realtime ติดแล้ว → ดึงนาน ๆ ครั้งพอ แค่กันกรณี event หล่น
 *     ★ ยังต่อไม่ติดหรือหลุด → ดึงถี่ ๆ ไปก่อน ★★ ผู้ใช้จะรู้สึกว่า "ช้าไปนิด"
 *       แทนที่จะรู้สึกว่า "มันไม่ทำงานเลย" ซึ่งต่างกันคนละเรื่อง
 *
 * ★★ ดึงทันทีตอนกลับมาที่แท็บด้วย
 *    ★ เบราว์เซอร์พัก timer ของแท็บที่ไม่ได้ใช้ และบางทีก็ตัด socket ทิ้ง
 *      ★★ จังหวะที่คนสลับกลับมาคือจังหวะที่เขาคาดหวังว่าจะเห็นของล่าสุด
 */
export function useRefreshLoop(
  reload: () => void,
  health: ChannelHealth,
  { live = 30_000, down = 5_000 }: { live?: number; down?: number } = {},
): void {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    const every = health === 'live' ? live : down
    const id = window.setInterval(() => reloadRef.current(), every)

    const onWake = () => {
      if (document.visibilityState === 'visible') reloadRef.current()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [health, live, down])
}

/**
 * แปลงสถานะดิบของ channel เป็นคำตอบว่า "พึ่งได้ไหม"
 *
 * ★★ ของเดิมเรียก .subscribe() เปล่า ๆ ทุกที่ — ไม่มีใครรู้เลยว่ามันติดไหม
 *    ★ CHANNEL_ERROR กับ TIMED_OUT เกิดขึ้นได้จริงและเงียบสนิท
 *      ★★ ซึ่งแปลว่าหน้าจอค้างอยู่กับข้อมูลเก่าโดยที่ไม่มีอะไรบอกใคร
 */
export function healthOf(status: string): ChannelHealth {
  if (status === 'SUBSCRIBED') return 'live'
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'failed'
  return 'connecting'
}
