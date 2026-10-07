'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRealtimeAuth } from '@/lib/supabase/realtime'
import { MAX_MS } from '@/lib/office/draw'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { RandomWheel, type WheelItem } from './RandomWheel'

type Room = {
  id: string
  title: string
  options: WheelItem[]
  status: 'OPEN' | 'SPINNING' | 'DONE'
  winnerId: string | null
  winnerLabel: string | null
  spunAt: string | null
  isHost: boolean
  hostName: string
}
type Member = { id: string; name: string; avatarUrl: string | null; isMe: boolean }

/**
 * ห้องสุ่มกลุ่ม (FR-A09)
 *
 * ★★ ผลมาจากเซิร์ฟเวอร์ วงล้อแค่เล่นแอนิเมชันไปหยุดที่ผลนั้น
 *    หน้านี้จึงไม่มีการสุ่มอะไรเลย — ไม่มีทางที่สองเครื่องจะเห็นผลต่างกัน
 */
export function DrawRoom({ roomId }: { roomId: string }) {
  /* ★ Realtime พร้อมเมื่อ socket รู้จักผู้ใช้แล้วเท่านั้น */
  const realtimeReady = useRealtimeAuth()
  const ot = useOt()
  const confirm = useConfirm()
  const router = useRouter()
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /*
   * ★ คนที่เพิ่งเปิดหน้าทีหลังไม่ต้องดูแอนิเมชันย้อนหลัง
   *   ถ้าสุ่มไปนานกว่าเวลาหมุนสูงสุดแล้ว ให้เห็นผลเลย
   *   ★ เทียบตอน mount ครั้งเดียว ไม่ใช่ทุก render — ไม่งั้นระหว่างหมุน
   *     ค่าจะพลิกเป็น true กลางทางแล้วแอนิเมชันหายไปคาตา
   */
  const lateRef = useRef<boolean | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ room: Room | null; members: Member[] }>(
        `/api/office/draw/rooms/${roomId}`,
      )
      if (!d.room) {
        setMissing(true)
        return
      }
      if (lateRef.current === null) {
        lateRef.current =
          d.room.status === 'DONE' ||
          (d.room.spunAt !== null && Date.now() - new Date(d.room.spunAt).getTime() > MAX_MS)
      }
      setRoom(d.room)
      setMembers(d.members)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [roomId])

  /* เข้าห้องแล้วโหลดสภาพห้อง */
  useEffect(() => {
    void (async () => {
      try {
        await apiFetch(`/api/office/draw/rooms/${roomId}`, { method: 'POST', body: { action: 'join' } })
      } catch {
        /* เข้าไม่ได้ก็ยังดูได้ */
      }
      await load()
    })()
  }, [roomId, load])

  /*
   * ── ถามซ้ำเป็นจังหวะ — หลักประกันว่าทุกคนได้ผลแน่ ๆ ───────────
   *
   * ★★★ Realtime เป็น "ทางเร็ว" ไม่ใช่ "ทางเดียว"
   *
   *     ตอนทดสอบสามเบราว์เซอร์พบว่าเจ้าของห้องได้ผลถูก แต่อีกสองเครื่อง
   *     ค้างอยู่ที่ "รอกดสุ่ม" เพราะตารางไม่ได้อยู่ใน publication จริง —
   *     subscribe สำเร็จแต่ไม่มี event เข้ามาสักตัว
   *
   *     ★ ฟีเจอร์ที่พังทั้งอันเมื่อ Realtime ไม่มา = ฟีเจอร์ที่ผูกชีวิตไว้กับ
   *       สิ่งที่อยู่นอกโค้ดเรา (publication · websocket · เน็ตของผู้ใช้)
   *     ★★ ถามซ้ำทุก 2.5 วินาทีจึงไม่ใช่ของซ้ำซ้อน แต่เป็นพื้นที่รับประกัน
   *        ผลลัพธ์ยังตัดสินที่ฐานข้อมูลเหมือนเดิม ทุกเครื่องจึงได้ผลเดียวกัน
   *        ต่างกันแค่ "รู้ช้ากว่ากันไม่เกิน 2.5 วินาที" ซึ่งมองไม่ออกด้วยตา
   *
   * ★ หยุดถามเมื่อห้องจบแล้ว หรือแท็บถูกซ่อน — ไม่ยิงทิ้งไว้ข้ามคืน
   */
  useEffect(() => {
    if (room?.status === 'DONE') return

    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const id = window.setInterval(tick, 2500)
    document.addEventListener('visibilitychange', tick)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [room?.status, load])

  /* ── Realtime: ทางเร็วเมื่อใช้ได้ ───────────────────────────── */
  useEffect(() => {
    /* ★ รอ socket รู้จักผู้ใช้ก่อน — เปิดก่อน RLS จะกรองทุกแถวทิ้งเงียบ ๆ */
    if (!realtimeReady) return
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`draw-room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draw_rooms', filter: `id=eq.${roomId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draw_room_members', filter: `room_id=eq.${roomId}` },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, load, realtimeReady])

  async function act(action: 'spin' | 'leave' | 'finish') {
    // ★ ยืนยันเฉพาะออกจากห้อง — หมุน/จบรอบคือตัวเกมเอง ไม่ต้องถาม
    if (action === 'leave' && !(await confirm({ kind: 'leave', subject: room?.title }))) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/office/draw/rooms/${roomId}`, { method: 'POST', body: { action } })
      if (action === 'leave') {
        router.push('/office/fun/room')
        return
      }
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="text-sm text-ink-soft">{ot('room.notFound')}</p>
        <Button variant="secondary" className="mt-3" onClick={() => router.push('/office/fun/room')}>
          {ot('room.back')}
        </Button>
      </div>
    )
  }

  if (!room) {
    return <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
  }

  /*
   * ★★ ชวนเพื่อน = ส่งลิงก์ห้องนี้
   *    ★ มือถือใช้แผ่นแชร์ของระบบ (ส่งเข้า LINE ได้ตรง ๆ) · คอมคัดลอกลิงก์
   */
  async function invite() {
    if (!room) return
    const url = window.location.href
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: room.title, text: ot('room.inviteText', { title: room.title }), url })
        return
      } catch {
        /* ปิดแผ่นแชร์ = ไม่ทำอะไรต่อ */
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.prompt(ot('room.inviteCopy'), url)
    }
  }

  const late = lateRef.current === true
  const showResultOnly = late && room.winnerLabel !== null

  return (
    <div className="max-w-2xl py-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/office/fun/room')}>
          ‹ {ot('room.back')}
        </Button>
        {/* ★ ชื่อห้องมาจากคนเปิดห้อง — ของผู้ใช้ ต้องมี dir="auto" เหมือนชื่อประกาศ */}
        <h2 dir="auto" className="min-w-0 flex-1 truncate text-lg font-bold text-ink">
          {room.title}
        </h2>
      </div>

      {/* ── ชวนเพื่อน ─────────────────────────────────────────── */}
      {room.status === 'OPEN' ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-3">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-soft">
            <Untranslated>{ot('room.inviteHint')}</Untranslated>
          </p>
          <button
            type="button"
            onClick={() => void invite()}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
            <Untranslated>{copied ? ot('room.inviteCopied') : ot('room.inviteCopy')}</Untranslated>
          </button>
        </div>
      ) : null}

      {/* ── คนในห้อง ──────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-3">
        <p className="text-xs text-ink-soft">{ot('room.members', { n: members.length })}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span
              key={m.id}
              className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink"
              title={m.name}
            >
              {m.isMe ? `${m.name} (${ot('room.you')})` : m.name}
            </span>
          ))}
        </div>
      </div>

      {/* ── วงล้อ ─────────────────────────────────────────────── */}
      <div className="mt-5">
        {showResultOnly ? (
          <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-6 text-center">
            <p className="text-xs text-ink-faint">{ot('room.late')}</p>
            <p className="mt-2 text-2xl font-bold text-ink">{room.winnerLabel}</p>
          </div>
        ) : (
          <RandomWheel
            items={room.options}
            forcedWinnerId={room.winnerId}
            /* ★ spun_at เป็น token ของรอบสุ่ม — ทุกเครื่องได้ค่าเดียวกัน */
            autoSpinToken={room.status === 'OPEN' ? null : room.spunAt}
            hideSpinButton
            onResult={() => {
              /* ★ ใครถึงเส้นชัยก่อนก็ปิดห้องได้ ไม่ต้องรอเจ้าของห้อง */
              if (room.status === 'SPINNING') void act('finish')
            }}
          />
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── ปุ่ม ──────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {room.status === 'OPEN' ? (
          room.isHost ? (
            <Button variant="primary" loading={busy} onClick={() => void act('spin')}>
              {ot('room.spin')}
            </Button>
          ) : (
            <p className="text-sm text-ink-soft">{ot('room.waitHost', { name: room.hostName })}</p>
          )
        ) : null}

        <Button variant="ghost" size="sm" onClick={() => void act('leave')}>
          {ot('room.leave')}
        </Button>
      </div>
    </div>
  )
}
