'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  DANGER_ROW,
  HEIGHT,
  LEVEL,
  R,
  ROW_H,
  SHOOTER,
  WIDTH,
  addRow,
  cellXY,
  cluster,
  floating,
  get,
  hits,
  lowestRow,
  newBoard,
  palette,
  rowLen,
  snapCell,
  trace,
  type Board,
  type Level,
} from '@/lib/games/bubble'
import { ModeCard } from './CheckersIntro'
import { CheckersResult } from './CheckersBoard'
import { FunGuide } from './FunGuide'
import { useGameFullscreen } from './useGameFullscreen'

/*
 * ★ สีบอลมาจาก token ของธีม — canvas อ่าน CSS variable ตรง ๆ ไม่ได้
 *   จึงให้เบราว์เซอร์แปลงเป็น rgb ผ่าน element ชั่วคราวตอนเริ่มเกม
 */
const COLOR_VARS = [
  'var(--color-accent)',
  'var(--color-link)',
  'var(--ck-gold)',
  'var(--quiz-green)',
  'rgb(var(--aurora-2))',
  'var(--color-warn)',
]

type RGB = [number, number, number]
type Pop = { x: number; y: number; color: number; t: number; delay: number }
type Fall = { x: number; y: number; vx: number; vy: number; color: number; spin: number }
type Spark = { x: number; y: number; vx: number; vy: number; color: number; life: number; max: number; size: number }
type Ring = { x: number; y: number; color: number; t: number }
type Text = { x: number; y: number; text: string; t: number; big?: boolean }
type Fly = { x: number; y: number; vx: number; vy: number; color: number }

const SPEED = 30
const BEST_KEY = 'bubble:best'

function readBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}
function writeBest(n: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(n))
  } catch {
    /* เก็บไม่ได้ก็แค่ไม่จำสถิติ */
  }
}

function resolveColors(): RGB[] {
  const el = document.createElement('span')
  document.body.appendChild(el)
  const out = COLOR_VARS.map((v) => {
    el.style.color = v
    const m = getComputedStyle(el).color.match(/[\d.]+/g) ?? ['200', '200', '200']
    return [Number(m[0]), Number(m[1]), Number(m[2])] as RGB
  })
  el.remove()
  return out
}

const mix = (a: RGB, b: RGB, t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(',')})`
const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

/** บอลมันวาว — ไล่เฉดทรงกลม · ขอบเข้ม · ไฮไลต์วงรี · แสงสะท้อนจุดเล็ก */
function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, col: RGB, alpha = 1) {
  if (rad <= 0.01) return
  ctx.save()
  ctx.globalAlpha = alpha
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad)
  g.addColorStop(0, mix(col, WHITE, 0.55))
  g.addColorStop(0.45, mix(col, WHITE, 0.08))
  g.addColorStop(0.85, mix(col, BLACK, 0.18))
  g.addColorStop(1, mix(col, BLACK, 0.4))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, rad * 0.96, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(x - rad * 0.32, y - rad * 0.42, rad * 0.34, rad * 0.2, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(x + rad * 0.35, y + rad * 0.32, rad * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * ยิงบอลสี — เล็งแล้วยิงบอลให้ติดกับสีเดียวกัน 3 ลูกขึ้นไปเพื่อแตก บอลที่ไม่ต่อเพดานจะร่วงตาม
 *
 * ★ วาดด้วย canvas ทั้งหมด (บอลมันวาว · เศษประกาย · คลื่นวงแหวน · ตัวเลขคะแนนลอย · คอมโบ)
 * ★ สถานะเกมอยู่ใน ref — วงวาดอ่าน/เขียนเองทุกเฟรม · state ของ React ใช้แค่แถบคะแนนกับป๊อปอัปจบเกม
 * ★ เล็ง: ลาก/ชี้ · ยิง: ปล่อยนิ้ว/คลิก · แป้นพิมพ์: ← → เล็ง, Space ยิง, S สลับลูก
 */
export function BubbleGame() {
  const ot = useOt()
  const [level, setLevel] = useState<Level | null>(null)
  const [hud, setHud] = useState({ score: 0, best: 0, shots: 0, combo: 0 })
  const [status, setStatus] = useState<'PLAY' | 'WIN' | 'LOSE'>('PLAY')
  const [round, setRound] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fsRef = useRef<HTMLDivElement | null>(null)
  const [fs, toggleFs] = useGameFullscreen(fsRef)

  const g = useRef({
    board: null as Board | null,
    colors: [] as RGB[],
    cur: 0,
    next: 1,
    fly: null as Fly | null,
    angle: Math.PI / 2,
    aiming: false,
    offsetY: 0,
    pops: [] as Pop[],
    falls: [] as Fall[],
    sparks: [] as Spark[],
    rings: [] as Ring[],
    texts: [] as Text[],
    shots: 0,
    score: 0,
    combo: 0,
    level: 'MEDIUM' as Level,
    over: false,
    shake: 0,
    time: 0,
  })

  const start = useCallback((lv: Level) => {
    const s = g.current
    s.board = newBoard(lv)
    s.colors = resolveColors()
    const pal = palette(s.board)
    s.cur = pal[Math.floor(Math.random() * pal.length)]!
    s.next = pal[Math.floor(Math.random() * pal.length)]!
    s.fly = null
    s.angle = Math.PI / 2
    s.offsetY = -6
    s.pops = []
    s.falls = []
    s.sparks = []
    s.rings = []
    s.texts = []
    s.shots = 0
    s.score = 0
    s.combo = 0
    s.level = lv
    s.over = false
    setHud({ score: 0, best: readBest(), shots: 0, combo: 0 })
    setStatus('PLAY')
    setRound((r) => r + 1)
    setLevel(lv)
  }, [])

  /* ── ยิง / ตำแหน่งเล็ง ─────────────────────────────────────── */
  const shoot = useCallback(() => {
    const s = g.current
    if (!s.board || s.fly || s.over) return
    s.fly = { x: SHOOTER.x, y: SHOOTER.y, vx: Math.cos(s.angle) * SPEED, vy: -Math.sin(s.angle) * SPEED, color: s.cur }
    const pal = palette(s.board)
    s.cur = pal.includes(s.next) ? s.next : pal[Math.floor(Math.random() * pal.length)] ?? s.next
    s.next = pal[Math.floor(Math.random() * pal.length)] ?? s.cur
  }, [])

  const swap = useCallback(() => {
    const s = g.current
    if (s.fly) return
    ;[s.cur, s.next] = [s.next, s.cur]
  }, [])

  const toLogical = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT }
  }
  const aimAt = (p: { x: number; y: number }) => {
    const a = Math.atan2(SHOOTER.y - p.y, p.x - SHOOTER.x)
    g.current.angle = Math.min(Math.PI - 0.13, Math.max(0.13, a < 0 ? (p.x < SHOOTER.x ? Math.PI - 0.13 : 0.13) : a))
  }

  /* ── วงวาด ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!level) return
    const canvas = canvasRef.current
    if (!canvas) return
    /* ★ เริ่มเกมแล้วเลื่อนให้กระดานทั้งหมดอยู่ในจอ — ไม่ต้องหาเลื่อนเอง */
    if (!document.querySelector('.game-fs')) wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(((w * HEIGHT) / WIDTH) * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const burst = (x: number, y: number, color: number, n = 12) => {
      const s = g.current
      if (reduce) return
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 4 + Math.random() * 9
        s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, color, life: 0, max: 0.5 + Math.random() * 0.4, size: 0.12 + Math.random() * 0.2 })
      }
      s.rings.push({ x, y, color, t: 0 })
    }

    const land = (x: number, y: number, color: number) => {
      const s = g.current
      const b = s.board!
      const cell = snapCell(b, x, y)
      b.grid[cell.r]![cell.c] = color
      const group = cluster(b, cell)
      let popped = 0
      let dropped = 0
      if (group.length >= 3) {
        s.combo += 1
        group.forEach((p, i) => {
          const xy = cellXY(b, p.r, p.c)
          s.pops.push({ x: xy.x, y: xy.y, color, t: 0, delay: i * 0.045 })
          b.grid[p.r]![p.c] = -1
        })
        popped = group.length
        for (const f of floating(b)) {
          const xy = cellXY(b, f.r, f.c)
          s.falls.push({ x: xy.x, y: xy.y, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4, color: b.grid[f.r]![f.c]!, spin: 0 })
          b.grid[f.r]![f.c] = -1
          dropped++
        }
        const gain = (popped * 10 + dropped * 20) * s.combo
        s.score += gain
        const at = cellXY(b, cell.r, cell.c)
        s.texts.push({ x: at.x, y: at.y, text: `+${gain}`, t: 0 })
        if (s.combo >= 2) s.texts.push({ x: WIDTH / 2, y: HEIGHT * 0.45, text: `COMBO ×${s.combo}`, t: 0, big: true })
        if (dropped >= 3) s.shake = 0.35
      } else {
        s.combo = 0
        s.shots += 1
        if (s.shots >= LEVEL[s.level].dropEvery) {
          s.shots = 0
          s.board = addRow(b, palette(b))
          s.offsetY = -ROW_H
          s.shake = 0.25
        }
      }

      const board = s.board!
      if (palette(board).length === 0) {
        s.over = true
        s.score += 500
        s.texts.push({ x: WIDTH / 2, y: HEIGHT * 0.4, text: 'ALL CLEAR +500', t: 0, big: true })
        finish('WIN')
      } else if (lowestRow(board) >= DANGER_ROW) {
        s.over = true
        finish('LOSE')
      } else {
        const pal = palette(board)
        if (!pal.includes(s.cur)) s.cur = pal[Math.floor(Math.random() * pal.length)]!
        if (!pal.includes(s.next)) s.next = pal[Math.floor(Math.random() * pal.length)]!
      }
      setHud({ score: s.score, best: Math.max(readBest(), s.score), shots: s.shots, combo: s.combo })
    }

    const finish = (st: 'WIN' | 'LOSE') => {
      const s = g.current
      if (s.score > readBest()) writeBest(s.score)
      window.setTimeout(() => setStatus(st), 1100)
    }

    const frame = (now: number) => {
      const s = g.current
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      s.time += dt
      const b = s.board
      if (!b) return

      /* ── อัปเดต ── */
      if (s.offsetY < 0) s.offsetY = Math.min(0, s.offsetY + dt * 9)
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt)
      if (s.fly) {
        const f = s.fly
        const steps = Math.ceil((SPEED * dt) / 0.25)
        for (let i = 0; i < steps && s.fly; i++) {
          f.x += (f.vx * dt) / steps
          f.y += (f.vy * dt) / steps
          if (f.x < R) {
            f.x = 2 * R - f.x
            f.vx = -f.vx
          } else if (f.x > WIDTH - R) {
            f.x = 2 * (WIDTH - R) - f.x
            f.vx = -f.vx
          }
          if (hits(b, f.x, f.y)) {
            s.fly = null
            land(f.x, f.y, f.color)
          }
        }
      }
      s.pops = s.pops.filter((p) => {
        const before = p.t
        p.t += dt
        if (before < p.delay && p.t >= p.delay) burst(p.x, p.y, p.color)
        return p.t < p.delay + 0.25
      })
      s.falls = s.falls.filter((f) => {
        f.vy += 45 * dt
        f.x += f.vx * dt
        f.y += f.vy * dt
        f.spin += dt * 6
        if (f.y > HEIGHT + 2) {
          burst(f.x, HEIGHT - 0.5, f.color, 6)
          return false
        }
        return true
      })
      s.sparks = s.sparks.filter((p) => {
        p.life += dt
        p.vy += 22 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        return p.life < p.max
      })
      s.rings = s.rings.filter((r) => (r.t += dt) < 0.45)
      s.texts = s.texts.filter((t) => (t.t += dt) < (t.big ? 1.3 : 0.9))

      /* ── วาด ── */
      const scale = canvas.width / WIDTH
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const sx = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 0.8 : 0
      const sy = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 0.8 : 0
      ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale)

      /* เส้นอันตราย */
      const dangerY = R + DANGER_ROW * ROW_H - R
      const close = lowestRow(b) >= DANGER_ROW - 2
      ctx.save()
      ctx.setLineDash([0.5, 0.4])
      ctx.lineWidth = 0.08
      ctx.strokeStyle = close ? `rgba(255,59,48,${0.5 + 0.4 * Math.sin(s.time * 8)})` : 'rgba(255,255,255,0.18)'
      ctx.beginPath()
      ctx.moveTo(0.3, dangerY)
      ctx.lineTo(WIDTH - 0.3, dangerY)
      ctx.stroke()
      ctx.restore()

      /* บอลบนกระดาน — ลอยขึ้นลงเบา ๆ คนละจังหวะ */
      for (let r = 0; r < b.grid.length; r++) {
        for (let c = 0; c < rowLen(b, r); c++) {
          const v = get(b, r, c)
          if (v < 0) continue
          const p = cellXY(b, r, c)
          const bob = reduce ? 0 : Math.sin(s.time * 2 + r * 0.9 + c * 0.7) * 0.03
          drawBubble(ctx, p.x, p.y + s.offsetY + bob, R, s.colors[v]!)
        }
      }

      /* บอลที่กำลังแตก — ขยายแล้วหาย */
      for (const p of s.pops) {
        const k = Math.max(0, p.t - p.delay) / 0.25
        drawBubble(ctx, p.x, p.y, R * (1 + k * 0.5), s.colors[p.color]!, 1 - k)
      }
      for (const r of s.rings) {
        const k = r.t / 0.45
        ctx.strokeStyle = mix(s.colors[r.color]!, WHITE, 0.4)
        ctx.globalAlpha = 1 - k
        ctx.lineWidth = 0.18 * (1 - k)
        ctx.beginPath()
        ctx.arc(r.x, r.y, R * (1 + k * 1.6), 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      for (const f of s.falls) drawBubble(ctx, f.x, f.y, R, s.colors[f.color]!, Math.max(0.3, 1 - f.y / (HEIGHT * 1.6)))
      for (const p of s.sparks) {
        ctx.globalAlpha = 1 - p.life / p.max
        ctx.fillStyle = mix(s.colors[p.color]!, WHITE, 0.35)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      /* เส้นเล็ง — จุดวิ่งตามทาง สะท้อนผนัง และวงเงาตรงจุดที่จะติด */
      if (!s.fly && !s.over) {
        const tr = trace(b, s.angle)
        const col = s.colors[s.cur]!
        const phase = (s.time * 3) % 1
        for (let i = 0; i < tr.path.length; i += 4) {
          const k = (i / 4 + phase) % 1
          const p = tr.path[i]!
          ctx.globalAlpha = 0.25 + 0.55 * (1 - i / tr.path.length)
          ctx.fillStyle = mix(col, WHITE, 0.3)
          ctx.beginPath()
          ctx.arc(p.x, p.y, 0.12 + 0.06 * Math.sin(k * Math.PI), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        const cell = snapCell(b, tr.end.x, tr.end.y)
        const at = cellXY(b, cell.r, cell.c)
        ctx.setLineDash([0.3, 0.25])
        ctx.lineWidth = 0.1
        ctx.strokeStyle = mix(col, WHITE, 0.2)
        ctx.beginPath()
        ctx.arc(at.x, at.y, R * 0.92, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      /* บอลที่บิน + หางแสง */
      if (s.fly) {
        const f = s.fly
        const col = s.colors[f.color]!
        for (let i = 1; i <= 5; i++) drawBubble(ctx, f.x - (f.vx / SPEED) * i * 0.5, f.y - (f.vy / SPEED) * i * 0.5, R * (1 - i * 0.12), col, 0.22 - i * 0.03)
        drawBubble(ctx, f.x, f.y, R, col)
      }

      /* ปืนยิง: ฐานโค้ง · ลำกล้องหมุนตามมุม · บอลลูกปัจจุบัน · ลูกถัดไป */
      ctx.save()
      ctx.translate(SHOOTER.x, SHOOTER.y)
      ctx.rotate(-s.angle + Math.PI / 2)
      const barrel = ctx.createLinearGradient(-0.6, 0, 0.6, 0)
      barrel.addColorStop(0, 'rgba(255,255,255,0.15)')
      barrel.addColorStop(0.5, 'rgba(255,255,255,0.55)')
      barrel.addColorStop(1, 'rgba(255,255,255,0.15)')
      ctx.fillStyle = barrel
      ctx.beginPath()
      ctx.roundRect(-0.55, -2.6, 1.1, 2.4, 0.4)
      ctx.fill()
      ctx.restore()
      const base = ctx.createRadialGradient(SHOOTER.x, SHOOTER.y + 0.5, 0.2, SHOOTER.x, SHOOTER.y + 0.5, 2.2)
      base.addColorStop(0, 'rgba(255,255,255,0.35)')
      base.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = base
      ctx.beginPath()
      ctx.arc(SHOOTER.x, SHOOTER.y + 0.5, 2.2, Math.PI, 0)
      ctx.fill()
      if (!s.fly) {
        const pulse = reduce ? 1 : 1 + Math.sin(s.time * 5) * 0.04
        drawBubble(ctx, SHOOTER.x, SHOOTER.y, R * pulse, s.colors[s.cur]!)
      }
      drawBubble(ctx, SHOOTER.x - 4.2, SHOOTER.y + 0.6, R * 0.72, s.colors[s.next]!)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '700 0.75px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('⇄', SHOOTER.x - 2.6, SHOOTER.y + 0.85)

      /* คะแนนลอย + คอมโบ */
      for (const t of s.texts) {
        const life = t.big ? 1.3 : 0.9
        const k = t.t / life
        ctx.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2
        ctx.textAlign = 'center'
        if (t.big) {
          const sc = k < 0.2 ? 0.6 + (k / 0.2) * 0.6 : 1.2 - Math.min(0.2, (k - 0.2) * 0.4)
          ctx.font = `900 ${1.9 * sc}px system-ui, sans-serif`
          ctx.lineWidth = 0.25
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'
          ctx.strokeText(t.text, t.x, t.y - k * 1.5)
          const grad = ctx.createLinearGradient(t.x - 5, 0, t.x + 5, 0)
          grad.addColorStop(0, mix(s.colors[2]!, WHITE, 0.2))
          grad.addColorStop(1, mix(s.colors[0]!, WHITE, 0.1))
          ctx.fillStyle = grad
          ctx.fillText(t.text, t.x, t.y - k * 1.5)
        } else {
          ctx.font = '900 1.05px system-ui, sans-serif'
          ctx.lineWidth = 0.18
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'
          ctx.strokeText(t.text, t.x, t.y - k * 2.5)
          ctx.fillStyle = '#fff'
          ctx.fillText(t.text, t.x, t.y - k * 2.5)
        }
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onKey = (e: KeyboardEvent) => {
      const s = g.current
      if (e.key === 'ArrowLeft') s.angle = Math.min(Math.PI - 0.13, s.angle + 0.05)
      else if (e.key === 'ArrowRight') s.angle = Math.max(0.13, s.angle - 0.05)
      else if (e.key === ' ' || e.key === 'Enter') shoot()
      else if (e.key === 's' || e.key === 'S') swap()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', onKey)
    }
  }, [level, round, shoot, swap])

  /* ── หน้าเลือกระดับ ───────────────────────────────────────── */
  if (!level) {
    return (
      <div className="py-2">
        <FunGuide id="bubble" art="bubble" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="bb-stage bb-demo relative mx-auto aspect-[4/5] w-full max-w-[340px] overflow-hidden rounded-[28px]" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
              <span
                key={i}
                className={cn('bb-ball absolute', `bb-c${i % 6}`)}
                style={{ left: `${8 + (i % 6) * 14 + (Math.floor(i / 6) % 2) * 7}%`, top: `${8 + Math.floor(i / 6) * 11}%`, '--dl': `${(i % 7) * 0.2}s` } as CSSProperties}
              />
            ))}
            <span className="bb-ball bb-c0 bb-shot absolute" />
            <span className="bb-cannon absolute" />
          </div>
          <div>
            <p className="text-sm leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.bb.pitch')}</Untranslated>
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['EASY', 'MEDIUM', 'HARD'] as Level[]).map((lv) => (
                <ModeCard
                  key={lv}
                  tone={lv === 'MEDIUM' ? 'primary' : 'plain'}
                  title={ot(`game.checkers.level.${lv}` as 'game.checkers.level.EASY')}
                  detail={ot('game.bb.levelDetail', { colors: LEVEL[lv].colors, every: LEVEL[lv].dropEvery })}
                  icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9a3 3 0 0 1 3-3"
                  onClick={() => start(lv)}
                />
              ))}
            </div>
            <p className="mt-4 whitespace-pre-line rounded-2xl bg-surface/70 px-4 py-3 text-xs leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.bb.controls')}</Untranslated>
            </p>
          </div>
        </div>
      </div>
    )
  }

  const left = LEVEL[level].dropEvery - hud.shots
  return (
    /*
     * ★★ กว้างตามความสูงจอ ไม่ใช่แค่เพดาน 520px — บนจอคอมแนวนอน กระดานสูงเกินจอ ปืนยิงหลุดขอบล่าง
     *    เผื่อแถบคะแนน + ปุ่มด้านล่าง (~260px) แล้วคิดความกว้างจากอัตราส่วนกระดาน
     */
    <div ref={fsRef} className={cn(fs && 'game-fs')}>
    <div ref={wrapRef} className="mx-auto w-full scroll-mt-20 py-2" style={{ maxWidth: fs ? `min(100%, calc((100dvh - 200px) * ${WIDTH} / ${HEIGHT}))` : `min(520px, calc((100dvh - 250px) * ${WIDTH} / ${HEIGHT}))` }}>
      {/* แถบคะแนน */}
      <div className="mx-auto mb-3 grid grid-cols-3 gap-2">
        <div className="bb-hud rounded-2xl px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold text-ink-faint">
            <Untranslated>{ot('game.bb.score')}</Untranslated>
          </p>
          <p key={hud.score} className="bb-score text-2xl font-black tabular-nums text-ink">{hud.score.toLocaleString()}</p>
        </div>
        <div className="bb-hud rounded-2xl px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold text-ink-faint">
            <Untranslated>{ot('game.bb.drop')}</Untranslated>
          </p>
          <div className="mt-1.5 flex justify-center gap-1" aria-label={ot('game.bb.dropIn', { n: left })}>
            {Array.from({ length: LEVEL[level].dropEvery }, (_, i) => (
              <span key={i} className={cn('size-2.5 rounded-full', i < left ? 'bb-pip-on' : 'bb-pip-off', left <= 2 && i < left && 'bb-pip-warn')} />
            ))}
          </div>
        </div>
        <div className="bb-hud rounded-2xl px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold text-ink-faint">
            <Untranslated>{ot('game.bb.best')}</Untranslated>
          </p>
          <p className="text-2xl font-black tabular-nums text-ink">{hud.best.toLocaleString()}</p>
        </div>
      </div>

      <div className="bb-stage relative mx-auto overflow-hidden rounded-[28px] p-2">
        <canvas
          ref={canvasRef}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          role="img"
          aria-label={ot('game.bb.canvasLabel')}
          tabIndex={0}
          onPointerDown={(e) => {
            const p = toLogical(e)
            /* แตะลูกถัดไป (มุมซ้ายล่าง) = สลับลูก */
            if (Math.hypot(p.x - (SHOOTER.x - 4.2), p.y - (SHOOTER.y + 0.6)) < 1.6) {
              swap()
              return
            }
            g.current.aiming = true
            aimAt(p)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || g.current.aiming) aimAt(toLogical(e))
          }}
          onPointerUp={(e) => {
            if (!g.current.aiming) return
            g.current.aiming = false
            aimAt(toLogical(e))
            shoot()
          }}
        />
      </div>

      <div className="mx-auto mt-4 grid grid-cols-4 gap-2">
        <button type="button" onClick={swap} className="mk-ctl flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
          <span aria-hidden="true" className="text-lg leading-none">⇄</span>
          <Untranslated>{ot('game.bb.swap')}</Untranslated>
        </button>
        <button type="button" onClick={toggleFs} aria-pressed={fs} className="mk-ctl mk-ctl-main flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
          <span aria-hidden="true" className="text-lg leading-none">{fs ? '✕' : '⛶'}</span>
          <Untranslated>{ot(fs ? 'game.fs.exit' : 'game.fs.enter')}</Untranslated>
        </button>
        <button type="button" onClick={() => start(level)} className="mk-ctl flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
          <span aria-hidden="true" className="text-lg leading-none">🔄</span>
          <Untranslated>{ot('game.checkers.restart')}</Untranslated>
        </button>
        <button type="button" onClick={() => setLevel(null)} className="mk-ctl flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
          <span aria-hidden="true" className="text-lg leading-none">🏠</span>
          <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
        </button>
      </div>

      {status !== 'PLAY' ? (
        <CheckersResult
          key={round}
          tone={status === 'WIN' ? 'win' : 'lose'}
          seed={hud.score}
          title={ot(status === 'WIN' ? 'game.bb.cleared' : 'game.bb.gameOver')}
          lines={ot(status === 'WIN' ? 'game.bb.winLines' : 'game.bb.loseLines')}
          sub={ot(hud.score >= hud.best && hud.score > 0 ? 'game.bb.newBest' : status === 'WIN' ? 'game.checkers.winSub' : 'game.bb.loseSub')}
          piece={() => <span className="bb-ball bb-c0 relative block !w-full" />}
          stats={
            <div className="ckr-rise mt-4 flex flex-wrap justify-center gap-2" style={{ '--d': '1.25s' } as CSSProperties}>
              <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink">
                <Untranslated>{ot('game.bb.statScore', { n: hud.score.toLocaleString() })}</Untranslated>
              </span>
              <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink">
                <Untranslated>{ot('game.bb.statBest', { n: hud.best.toLocaleString() })}</Untranslated>
              </span>
            </div>
          }
        >
          <Button variant="primary" className="min-h-12 text-base" onClick={() => start(level)}>
            <Untranslated>{status === 'LOSE' ? ot('game.checkers.revenge') : ot('game.checkers.again')}</Untranslated>
          </Button>
          <Button variant="secondary" className="min-h-11" onClick={() => setLevel(null)}>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
        </CheckersResult>
      ) : null}
    </div>
    </div>
  )
}

