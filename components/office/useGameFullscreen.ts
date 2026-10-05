'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * โหมดเต็มจอของเกม
 *
 * ★★ สองชั้น: ขอเต็มจอจริงจากเบราว์เซอร์ (requestFullscreen) + คลาส .game-fs ที่ปูทับทั้งหน้าเสมอ
 *    ★ iPhone (Safari) ไม่รองรับเต็มจอระดับ element — คลาสอย่างเดียวก็ยังได้เกมเต็มหน้าจอ
 *    ★ กด Esc ออกจากเต็มจอจริง → ฟัง fullscreenchange แล้วปิดคลาสตามให้ตรงกัน
 */
export function useGameFullscreen(ref: RefObject<HTMLElement | null>) {
  const [fs, setFs] = useState(false)

  const toggle = useCallback(() => {
    const el = ref.current
    if (!fs) {
      setFs(true)
      void el?.requestFullscreen?.().catch(() => undefined)
    } else {
      setFs(false)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [fs, ref])

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFs(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  /* ★ เต็มจอแบบคลาส: ล็อกการเลื่อนหน้า · Esc ปิดได้ด้วย */
  useEffect(() => {
    if (!fs) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fs])

  return [fs, toggle] as const
}
