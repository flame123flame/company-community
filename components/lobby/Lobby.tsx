'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLobbyPresence, type Walker } from '@/hooks/useLobbyPresence'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { type Appearance } from '@/lib/lobby/appearance'
import { paintWorld } from '@/lib/lobby/draw'
import { SPRITE_H, SPRITE_W, spriteSheet } from '@/lib/lobby/sprite'
import { TILE, blockedAt, buildWorld, zoneAt, type RoomRow } from '@/lib/lobby/world'
import { AvatarStudio } from './AvatarStudio'
import { useT } from '@/lib/i18n/client'
import { Untranslated } from '@/lib/i18n/office'

/**
 * ลอบบี้ — ออฟฟิศที่เดินเข้าไปฟังเพลงห้องไหนก็ได้
 *
 * ★★★ ทำไมต้องมี ทั้งที่มีรายชื่อห้องเป็นลิสต์อยู่แล้ว
 *
 *     ลิสต์ตอบคำถาม "มีห้องอะไรบ้าง" ได้ดีกว่าแผนที่ทุกประตู
 *     แต่มันตอบไม่ได้เลยว่า "ตอนนี้ใครอยู่ไหน" และ "ฉันอยู่ตรงไหนในภาพรวม"
 *
 *     ★ สิ่งที่แผนที่ให้แล้วลิสต์ให้ไม่ได้คือ **ความรู้สึกว่ามีคนอยู่จริง**
 *       เห็นตัวละครเดินไปเดินมา เห็นสามคนนั่งอยู่ในโซนเดียวกัน
 *       นั่นคือข้อมูลที่ทำให้คนตัดสินใจเดินตามเข้าไป ซึ่งตัวเลข "3 คน"
 *       ในลิสต์สื่อไม่ได้เท่า
 *
 * ★★★ งานศิลป์ทั้งหมดวาดเองด้วยโค้ด
 *
 *     สไตล์พิกเซลออฟฟิศแบบนี้เป็นงานมีลิขสิทธิ์แทบทั้งหมด รวมถึงของ Gather เอง
 *     ★ ที่นี่จึงสร้างทุกอย่างจาก canvas: พื้น กำแพงกระจก โต๊ะ จอ เก้าอี้
 *       ต้นไม้ โซฟา และตัวละครทุกตัว — ไม่มีไฟล์ภาพจากที่อื่นเลยแม้แต่ไฟล์เดียว
 */

const SPEED = 190
const REFRESH_MS = 20_000
const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'])
/** ★ 4 ท่าเดินต่อวินาทีครึ่ง — เร็วกว่านี้ขาจะสั่น ช้ากว่านี้เหมือนเดินบนน้ำแข็ง */
const STEP_MS = 140

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function Lobby({
  me,
}: {
  me: {
    userId: string
    displayName: string
    avatarUrl: string | null
    appearance: Appearance
  }
}) {
  const t = useT()
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [look, setLook] = useState<Appearance>(me.appearance)
  const [studioOpen, setStudioOpen] = useState(false)

  /**
   * ★ แผนที่ถูกสร้างใหม่เฉพาะตอนรายชื่อห้องเปลี่ยนจริง ๆ
   *   ไม่ใช่ทุกครั้งที่ fetch สำเร็จ — ถ้าสร้างใหม่ทุก 20 วินาที ตัวละคร
   *   จะโดนเด้งออกจากกำแพงและ canvas จะถูกวาดใหม่ทั้งใบโดยไม่จำเป็น
   */
  // ★ เรียงก่อนทำกุญแจ — ลำดับที่ API ส่งมาสลับได้ แต่ "ชุดห้อง" ต่างหากที่สำคัญ
  const mapKey = rooms.map((r) => r.code).sort().join(',')
  const world = useMemo(() => buildWorld(rooms), [mapKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const identity = useMemo(
    () => ({ ...me, appearance: look }),
    [me, look],
  )
  const { walkers, publish, resend } = useLobbyPresence(identity, world.spawn)

  // เปลี่ยนชุดแล้วต้องเห็นบนจอคนอื่นทันที ไม่ใช่รอรอบถัดไปของยามเฝ้าสาย
  useEffect(() => {
    resend()
  }, [look, resend])

  const [pos, setPos] = useState(world.spawn)
  const [facing, setFacing] = useState(0)
  const [frame, setFrame] = useState(0)
  const [here, setHere] = useState<RoomRow | null>(null)
  const [viewport, setViewport] = useState({ width: 1200, height: 700 })
  const [dark, setDark] = useState(true)

  const posRef = useRef(pos)
  const keys = useRef(new Set<string>())
  const target = useRef<{ x: number; y: number } | null>(null)
  const hereRef = useRef<RoomRow | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef(world)
  const placed = useRef(false)

  useEffect(() => {
    hereRef.current = here
  }, [here])

  /* ── วางตัวเมื่อแผนที่จริงมาถึง ─────────────────────────────────── */
  useEffect(() => {
    worldRef.current = world

    /*
     * ★★★ แผนที่ใบแรกเป็นของปลอม
     *
     *     หน้านี้ render ก่อนที่รายชื่อห้องจะมาถึง แผนที่ตอนนั้นจึงมีโซนเดียว
     *     และ "จุดเกิด" ที่คำนวณจากมันไม่ตรงกับแผนที่จริงที่ตามมาทีหลัง
     *
     *     ★ อาการที่เห็นคือเกิดกลางห้องใครก็ไม่รู้ พร้อมปุ่ม "เข้าห้อง"
     *       ขึ้นมาเองตั้งแต่ยังไม่ได้เดินไปไหน ซึ่งทำให้ทั้งฟีเจอร์เสียความหมาย
     *
     *     ย้ายครั้งเดียวตอนแผนที่จริงมาถึงเท่านั้น — ห้ามย้ายทุกครั้งที่
     *     รายชื่อห้องเปลี่ยน ไม่งั้นมีคนเปิดห้องใหม่ทีไรทุกคนโดนดีดกลับจุดเกิด
     */
    if (!placed.current && world.zones.length > 0) {
      placed.current = true
      posRef.current = world.spawn
      setPos(world.spawn)
      return
    }

    // ยืนซ้อนกำแพงที่เพิ่งงอกมา = เดินไปไหนไม่ได้เลยและดูเหมือนเว็บค้าง
    if (blockedAt(world, posRef.current.x, posRef.current.y)) {
      posRef.current = world.spawn
      setPos(world.spawn)
    }
  }, [world])

  /* ── รายชื่อห้อง ───────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await apiFetch<{ rooms: RoomRow[] }>('/api/rooms/list')
        if (!cancelled) setRooms(data.rooms)
      } catch {
        /* ลอบบี้ว่างชั่วคราว — รอบหน้าลองใหม่ */
      }
    }
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    tick()
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  /* ── ธีม ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme !== 'light')
    read()
    // ★ ธีมถูกสลับโดยปุ่มบนหัวเว็บ ซึ่งแก้ attribute บน <html> ตรง ๆ
    //   ไม่มี event ให้ฟัง จึงต้องเฝ้า attribute เอง
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  /* ── วาดออฟฟิศ ─────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    /*
     * ★ วาดที่ความละเอียดเท่าโลกพอดี ไม่คูณ devicePixelRatio
     *   งานพิกเซลอาร์ตต้องการให้หนึ่งพิกเซลในภาพเป็นบล็อกคมชัด
     *   การอัปสเกลด้วย image-rendering: pixelated ให้ผลที่ถูกต้องกว่า
     *   และประหยัดหน่วยความจำกว่าการวาดที่ 2 เท่าแล้วย่อ
     */
    canvas.width = world.width
    canvas.height = world.height
    const ctx = canvas.getContext('2d')
    if (ctx) paintWorld(ctx, world, dark)
  }, [world, dark])

  /* ── ขนาดจอ ───────────────────────────────────────────────────── */
  useEffect(() => {
    const measure = () => {
      const box = stageRef.current?.getBoundingClientRect()
      if (box) setViewport({ width: box.width, height: box.height })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  /* ── คีย์บอร์ด ─────────────────────────────────────────────────── */
  const enterHere = useCallback(() => {
    const room = hereRef.current
    if (room) router.push(`/room/${room.code}`)
  }, [router])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      // ★ ไม่ขโมยปุ่มตอนกำลังพิมพ์อยู่ในช่องอื่น (เช่นหน้าต่างแต่งตัว)
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (event.key === 'Enter') {
        enterHere()
        return
      }
      const key = event.key.toLowerCase()
      if (MOVE_KEYS.has(key)) {
        // ★ กันหน้าเลื่อนตามลูกศร — ไม่งั้นเดินไปจอก็เลื่อนตามไปด้วย
        event.preventDefault()
        keys.current.add(key)
        target.current = null
      }
    }
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    const blur = () => keys.current.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    // ★ สลับแท็บกลางทางแล้วปุ่มค้าง — ตัวละครจะเดินชนกำแพงตลอดกาล
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [enterHere])

  /* ── ลูปเดิน ───────────────────────────────────────────────────── */
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let stepClock = 0
    let dir = 0
    let walkFrame = 0

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05) // ★ เพดาน 50ms กันกระโดดตอนสลับแท็บกลับมา
      last = now
      const map = worldRef.current

      let dx = 0
      let dy = 0
      const held = keys.current
      if (held.has('arrowleft') || held.has('a')) dx -= 1
      if (held.has('arrowright') || held.has('d')) dx += 1
      if (held.has('arrowup') || held.has('w')) dy -= 1
      if (held.has('arrowdown') || held.has('s')) dy += 1

      const aim = target.current
      if (dx === 0 && dy === 0 && aim) {
        const toX = aim.x - posRef.current.x
        const toY = aim.y - posRef.current.y
        const dist = Math.hypot(toX, toY)
        if (dist < 5) target.current = null
        else {
          dx = toX / dist
          dy = toY / dist
        }
      }

      const moving = dx !== 0 || dy !== 0
      if (moving) {
        // ★ ทำให้ความยาวเป็น 1 ก่อนคูณความเร็ว
        //   ไม่งั้นเดินทแยงจะเร็วกว่าเดินตรง 1.41 เท่า ซึ่งรู้สึกได้ทันที
        const len = Math.hypot(dx, dy) || 1
        const stepX = (dx / len) * SPEED * dt
        const stepY = (dy / len) * SPEED * dt

        /*
         * ★★ แยกแกน X กับ Y ออกจากกัน ไม่เช็คพร้อมกันทีเดียว
         *
         *    ถ้าเช็ครวม การเดินเฉียงเข้าหากำแพงจะหยุดสนิททั้งที่ยังเลื่อน
         *    ไปตามแนวกำแพงได้ — ความรู้สึก "ติดหนึบ" ที่ทำให้เกมเดินแล้วหงุดหงิด
         *    ★ แยกแกนแล้วตัวละครจะไถลไปตามกำแพงเองโดยไม่ต้องบังคับให้พอดี
         */
        const next = { ...posRef.current }
        if (!blockedAt(map, next.x + stepX, next.y)) next.x += stepX
        if (!blockedAt(map, next.x, next.y + stepY)) next.y += stepY

        next.x = clamp(next.x, 16, map.width - 16)
        next.y = clamp(next.y, 20, map.height - 8)

        // หันหน้าตามแกนที่ขยับมากกว่า
        if (Math.abs(dx) > Math.abs(dy)) dir = dx < 0 ? 1 : 2
        else if (dy !== 0) dir = dy < 0 ? 3 : 0

        posRef.current = next
        setPos(next)

        stepClock += dt * 1000
        if (stepClock > STEP_MS) {
          stepClock = 0
          walkFrame = (walkFrame + 1) % 4
          setFrame(walkFrame)
        }
      } else if (walkFrame !== 0) {
        walkFrame = 0
        stepClock = 0
        setFrame(0)
      }

      setFacing(dir)
      publish(posRef.current.x, posRef.current.y, dir, moving)

      const zone = zoneAt(map, posRef.current.x, posRef.current.y)
      if ((zone?.code ?? null) !== (hereRef.current?.code ?? null)) {
        setHere(zone ? { ...zone } : null)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [publish])

  /* ── กล้อง ─────────────────────────────────────────────────────── */
  /**
   * ★★ ซูมเป็นจำนวนเต็มเท่านั้น
   *
   *    1.5 เท่าจะทำให้พิกเซลต้นฉบับบางเม็ดกว้าง 1 บางเม็ดกว้าง 2
   *    ลายเส้นทั้งภาพจะดูสั่นและไม่เท่ากัน ★ ซึ่งเป็นอาการที่แก้ไม่ได้เลย
   *      นอกจากกลับไปใช้จำนวนเต็ม
   *
   *    จอเล็กจึงได้ 1 เท่า (เห็นห้องเต็มห้องพอดี) จอใหญ่ได้ 2 เท่า
   */
  const zoom = viewport.width >= 1024 ? 2 : 1
  const viewW = viewport.width / zoom
  const viewH = viewport.height / zoom
  const camX = clamp(pos.x - viewW / 2, 0, Math.max(0, world.width - viewW))
  const camY = clamp(pos.y - viewH / 2, 0, Math.max(0, world.height - viewH))

  /**
   * ★ ออฟฟิศเล็กกว่าจอเมื่อไหร่ ให้วางไว้กลางจอ
   *   ตอนมีห้องอยู่ห้องสองห้อง แผนที่จะสั้นกว่าความสูงของจอ แล้วครึ่งล่าง
   *   กลายเป็นพื้นที่ว่างสีพื้นหลัง ซึ่งดูเหมือนหน้าเว็บโหลดไม่เสร็จ
   */
  const offX = Math.max(0, (viewW - world.width) / 2)
  const offY = Math.max(0, (viewH - world.height) / 2)

  /*
   * ★★ ภาพตัวละครวาดด้วย canvas ซึ่งมีแค่ในเบราว์เซอร์ — server ได้ '' เสมอ
   *    ★ ถ้าคำนวณตอน hydrate เลย React เจอค่าไม่ตรงกับ HTML แล้ว "ไม่ซ่อมให้"
   *      ผลคือตัวเราและรูปบนปุ่มแต่งตัวว่างเปล่าตลอดไป (เห็นจากภาพจริง)
   *    ★ รอ hydrate เสร็จก่อนค่อยวาด — รอบแรกตรงกับ server รอบถัดไปได้ภาพจริง
   */
  const hydrated = useHydrated()
  const sheet = useMemo(() => (hydrated ? spriteSheet(look) : ''), [hydrated, look])

  /**
   * ★ เรียงตาม y ก่อนวาด — คนที่ยืนล่างกว่าต้องบังคนที่ยืนบนกว่า
   *   ถ้าไม่เรียง ลำดับจะเป็นไปตามที่ Supabase ส่งมา ซึ่งสลับไปมาได้ทุกวินาที
   *   แล้วตัวละครสองคนที่ยืนใกล้กันจะกะพริบสลับหน้าหลังกันตลอดเวลา
   */
  const crowd = useMemo(() => [...walkers].sort((a, b) => a.y - b.y), [walkers])

  return (
    <div
      ref={stageRef}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('[data-ui]')) return
        // แตะพื้น = เดินไปตรงนั้น (ทางเดียวที่ใช้ได้บนมือถือ)
        const box = event.currentTarget.getBoundingClientRect()
        // ★ ต้องหารด้วย zoom ก่อนบวกกล้อง ไม่งั้นจะเดินไปไม่ตรงจุดที่แตะ
        target.current = {
          x: (event.clientX - box.left) / zoom + camX - offX,
          y: (event.clientY - box.top) / zoom + camY - offY,
        }
        keys.current.clear()
      }}
      className="relative h-[calc(100dvh-var(--spacing-header))] w-full touch-none overflow-hidden bg-page"
    >
      <div
        className="absolute will-change-transform"
        style={{
          width: world.width,
          height: world.height,
          // ★ scale ก่อน translate — CSS อ่านขวาไปซ้าย จุด p จึงกลายเป็น (p − cam) × zoom
          transform: `scale(${zoom}) translate3d(${offX - camX}px, ${offY - camY}px, 0)`,
          transformOrigin: '0 0',
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full"
          // ★ ห้ามให้เบราว์เซอร์เกลี่ยพิกเซล ไม่งั้นงานพิกเซลอาร์ตจะเบลอเป็นวุ้น
          style={{ imageRendering: 'pixelated' }}
        />

        {/* ── ป้ายชื่อโซน ─────────────────────────────────────── */}
        {world.zones.map((zone) => {
          const inside = walkers.filter(
            (w) =>
              w.x / TILE >= zone.tx &&
              w.x / TILE < zone.tx + zone.tw &&
              w.y / TILE >= zone.ty &&
              w.y / TILE < zone.ty + zone.th,
          ).length
          const active = here?.code === zone.code

          return (
            <div
              key={zone.code}
              className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center"
              style={{
                left: (zone.tx + zone.tw / 2) * TILE,
                top: zone.ty * TILE - 30,
                width: zone.tw * TILE,
              }}
            >
              <span
                dir="auto"
                className={cn(
                  'max-w-full truncate rounded-md px-2 py-[3px] text-[10px] font-semibold shadow-sm',
                  active
                    ? 'bg-accent text-accent-ink'
                    : 'bg-page/85 text-ink backdrop-blur-sm',
                )}
              >
                {zone.name}
              </span>
              <span className="mt-[2px] rounded px-1 text-[8px] text-ink-faint">
                {inside > 0
                  ? t('lobby.inRoom', { n: inside })
                  : zone.nowPlaying
                    ? t('lobby.roomPlaying')
                    : t('lobby.roomIdle')}
              </span>
            </div>
          )
        })}

        {/* ── คนอื่น ───────────────────────────────────────────── */}
        {crowd.map((walker) => (
          <Character key={walker.userId} walker={walker} />
        ))}

        {/* ── ตัวเรา ───────────────────────────────────────────── */}
        <div
          className="absolute will-change-transform"
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${pos.x - SPRITE_W / 2}px, ${pos.y - SPRITE_H}px, 0)`,
            width: SPRITE_W,
            height: SPRITE_H,
            zIndex: Math.round(pos.y),
          }}
        >
          <div
            className="size-full"
            style={{
              backgroundImage: `url(${sheet})`,
              backgroundPosition: `-${frame * SPRITE_W}px -${facing * SPRITE_H}px`,
              imageRendering: 'pixelated',
            }}
          />
          <p dir="auto" className="absolute left-1/2 top-[-11px] max-w-[90px] -translate-x-1/2 truncate rounded bg-accent px-1 text-[8px] font-semibold text-accent-ink">
            {me.displayName}
          </p>
        </div>
      </div>

      {/* ── แถบบอกวิธีเล่น ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
        <div className="flex max-w-[calc(100%-7.5rem)] flex-col items-center gap-1.5 sm:max-w-none">
          <p className="lobby-chip flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-ink-soft">
            <svg viewBox="0 0 24 24" className="hidden size-4 shrink-0 text-accent sm:block" fill="currentColor" aria-hidden="true">
              <path d="M10 3h4v4h-4zM4 9h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM7 17h10v3H7z" />
            </svg>
            <span className="hidden sm:inline">{t('lobby.hintDesktop')}</span>
            <span className="sm:hidden">{t('lobby.hintMobile')}</span>
          </p>
          {/* ★ ตัวเลขคนเดินอยู่ตอนนี้ — บอกว่าที่นี่มีชีวิต ไม่ใช่แผนที่ว่าง ๆ */}
          <p className="lobby-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-ink">
            <span className="music-live" aria-hidden="true" />
            <Untranslated>{t('lobby.people', { n: crowd.length + 1 })}</Untranslated>
          </p>
        </div>
      </div>

      {/* ── ปุ่มกลับ / แต่งตัว ───────────────────────────────────── */}
      <div data-ui className="absolute start-3 top-3 flex flex-col gap-2">
        <Link
          href="/"
          aria-label={t('common.backHome')}
          className="lobby-chip grid size-11 place-items-center rounded-full text-ink-soft transition-[color,transform] hover:-translate-x-0.5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
          </svg>
        </Link>
      </div>

      <div data-ui className="absolute end-3 top-3">
        <button
          type="button"
          onClick={() => setStudioOpen(true)}
          className={cn(
            'lobby-chip flex min-h-11 items-center gap-2 rounded-full py-1.5 ps-1.5 pe-3.5',
            'text-xs font-semibold text-ink transition-transform hover:-translate-y-0.5',
          )}
        >
          <span
            className="lobby-ava size-8 shrink-0 overflow-hidden rounded-full bg-surface"
            style={{
              backgroundImage: `url(${sheet})`,
              backgroundPosition: `-2px -6px`,
              imageRendering: 'pixelated',
            }}
          />
          {t('lobby.dressUp')}
        </button>
      </div>

      {/* ── ปุ่มเข้าห้องตอนยืนอยู่ในโซน ──────────────────────────── */}
      {here ? (
        <div data-ui className="absolute inset-x-0 bottom-6 flex justify-center px-4">
          <button
            type="button"
            onClick={enterHere}
            className={cn(
              'join-cta lobby-enter flex max-w-[92vw] items-center gap-3 rounded-full py-2.5 ps-3 pe-5',
              'text-accent-ink transition-transform active:scale-[0.98]',
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ck-shine)_22%,transparent)]">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <path d="M10 17l5-5-5-5v10zM4 4h2v16H4z" />
              </svg>
            </span>
            <span className="min-w-0 text-start">
              <span className="block truncate text-sm font-bold">{t('lobby.enterRoom', { name: here.name })}</span>
              <span dir="auto" className="block truncate text-[11px] opacity-80">
                {here.nowPlaying ? here.nowPlaying.title : t('lobby.nothingPlaying')}
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {studioOpen ? (
        <AvatarStudio
          value={look}
          onChange={setLook}
          onClose={() => setStudioOpen(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * ตัวละครของคนอื่น
 *
 * ★ transition สั้น ๆ เกลี่ยช่องว่างระหว่างข้อความที่ส่งทุก 150ms
 *   ถ้าไม่มี ตัวละครคนอื่นจะกระตุกเป็นขั้น ๆ เหมือนภาพนิ่งต่อกัน
 */
function Character({ walker }: { walker: Walker }) {
  const hydrated = useHydrated()
  const sheet = useMemo(() => (hydrated ? spriteSheet(walker.appearance) : ''), [hydrated, walker.appearance])
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!walker.moving) return
    // ★ ขาขยับฝั่งคนดูเอง ไม่ได้ส่งเลขเฟรมมาทางเน็ต
    //   ส่งเฟรมมาด้วยคือการยิงข้อความเพิ่มอีก 7 ครั้งต่อวินาทีต่อคน
    //   เพื่อข้อมูลที่ฝั่งนี้คำนวณเองได้จาก "กำลังเดินอยู่ไหม" อย่างเดียว
    const timer = setInterval(() => setFrame((f) => (f + 1) % 4), STEP_MS)
    return () => clearInterval(timer)
  }, [walker.moving])

  // ★ ตอนหยุดเดินไม่ต้อง setState กลับไปเป็น 0 — แค่ "วาด" เป็นท่ายืน
  //   การ setState ใน effect เพื่อค่าที่คำนวณตอน render ได้ คือ render รอบที่สอง
  //   ที่ไม่มีใครได้อะไรเพิ่ม
  const shown = walker.moving ? frame : 0

  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${walker.x - SPRITE_W / 2}px, ${walker.y - SPRITE_H}px, 0)`,
        transition: 'transform 160ms linear',
        width: SPRITE_W,
        height: SPRITE_H,
        zIndex: Math.round(walker.y),
      }}
    >
      <div
        className="size-full"
        style={{
          backgroundImage: `url(${sheet})`,
          backgroundPosition: `-${shown * SPRITE_W}px -${(walker.dir ?? 0) * SPRITE_H}px`,
          imageRendering: 'pixelated',
        }}
      />
      <p dir="auto" className="absolute left-1/2 top-[-11px] max-w-[80px] -translate-x-1/2 truncate rounded bg-page/90 px-1 text-[8px] font-medium text-ink">
        {walker.displayName}
      </p>
    </div>
  )
}

const noopSubscribe = () => () => {}
/** true หลัง hydrate เสร็จ — server และรอบ hydrate ได้ false ตรงกันเสมอ */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}
