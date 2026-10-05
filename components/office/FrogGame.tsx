'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { D, FROG, LEVEL, SIZE, makeTrack, posAt, runAround, type Ball, type Level, type Track } from '@/lib/games/frog'
import { ModeCard } from './CheckersIntro'
import { CheckersResult } from './CheckersBoard'
import { FunGuide } from './FunGuide'
import { useGameFullscreen } from './useGameFullscreen'

/* ★ สีบอลจาก token ของธีม (canvas อ่าน CSS variable ตรงไม่ได้ — แปลงผ่าน element ชั่วคราว) */
const COLOR_VARS = ['var(--color-accent)', 'var(--color-link)', 'var(--ck-gold)', 'var(--quiz-green)', 'rgb(var(--aurora-2))', 'var(--color-warn)']
type RGB = [number, number, number]
const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]
const mix = (a: RGB, b: RGB, t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(',')})`

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


/**
 * สีฉากทั้งหมดผสมจาก token ของธีม (เขียว = --quiz-green · ทอง = --ck-gold · ฟ้า = --color-link …)
 * ★ ไม่มีสีตายตัวในเกม — เปลี่ยนสีแบรนด์ที่ globals.css แล้วฉากเปลี่ยนตาม
 */
function rgba(c: RGB, a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`
}
function makePal() {
  const el = document.createElement('span')
  document.body.appendChild(el)
  const read = (v: string): RGB => {
    el.style.color = v
    const m = getComputedStyle(el).color.match(/[\d.]+/g) ?? ['128', '128', '128']
    return [Number(m[0]), Number(m[1]), Number(m[2])]
  }
  const G = read('var(--quiz-green)')
  const Au = read('var(--ck-gold)')
  const AuD = read('var(--ck-gold-deep)')
  const A = read('var(--color-accent)')
  const Li = read('var(--color-link)')
  const K = read('var(--ck-shade)')
  const W = read('var(--ck-shine)')
  el.remove()
  const lerp = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as RGB
  return {
    grassHi: mix(G,W,0.35),
    grassLo: mix(G,K,0.3),
    flower: mix(Au,W,0.05),
    track: mix(G,K,0.45),
    tunnel: mix(G,K,0.7),
    petal: mix(Li,K,0.6),
    goldHi: mix(Au,W,0.4),
    goldLo: mix(AuD,K,0.05),
    pitCore: mix(K,K,0),
    pit: mix(A,K,0.85),
    leafLo: mix(G,K,0.35),
    leafHi: mix(G,W,0.25),
    stoneHi: mix(Li,K,0.45),
    stoneLo: mix(Li,K,0.72),
    stoneRim: mix(Li,K,0.82),
    stoneIn: mix(Li,K,0.62),
    skin: mix(G,W,0.15),
    skinDark: mix(G,K,0.35),
    leg: mix(AuD,K,0.25),
    legDark: mix(AuD,K,0.5),
    bodyHi: mix(G,W,0.4),
    outline: mix(G,K,0.5),
    shellHi: mix(Au,W,0.25),
    shellLo: mix(Au,AuD,0.5),
    shellRim: mix(AuD,K,0.1),
    mouth: mix(A,K,0.55),
    headHi: mix(G,W,0.45),
    pupil: mix(Li,K,0.75),
    white: mix(W,W,0),
    rgbGK: lerp(G, K, 0.6),
    rgbW: W,
    rgbK: K,
    rgbA: A,
    rgbAD: lerp(A, K, 0.35),
  }
}
type Pal = ReturnType<typeof makePal>

const BEST_KEY = 'frog:best'
const readBest = () => {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}
const writeBest = (n: number) => {
  try {
    window.localStorage.setItem(BEST_KEY, String(n))
  } catch {
    /* ไม่จำก็ได้ */
  }
}

/* สุ่มแบบคงที่ — ตำแหน่งหญ้า/ใบไม้เหมือนเดิมทุกครั้ง */
function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

/**
 * บอลลาย — ทรงกลมมันวาว + ลวดลายประจำสีที่ "หมุนตามการกลิ้ง" (roll = ระยะทาง / รัศมี)
 * ลาย: คลื่น · เกลียว · ซิกแซก · โค้งคู่ · ดาว · วงแหวน — แยกสีได้ด้วยลายด้วย (คนตาบอดสีก็เล่นได้)
 */
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB, kind: number, roll: number, alpha = 1) {
  if (r <= 0.05) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(x + r * 0.15, y + r * 0.35, r * 0.95, r * 0.75, 0, 0, Math.PI * 2)
  ctx.fill()
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  g.addColorStop(0, mix(col, WHITE, 0.5))
  g.addColorStop(0.5, mix(col, WHITE, 0.05))
  g.addColorStop(1, mix(col, BLACK, 0.35))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  /* ลาย — ตัดให้อยู่ในวงบอล */
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.96, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(x, y)
  ctx.rotate(roll)
  ctx.strokeStyle = mix(col, BLACK, 0.3)
  ctx.globalAlpha = alpha * 0.55
  ctx.lineWidth = r * 0.16
  ctx.lineCap = 'round'
  ctx.beginPath()
  const k = r
  switch (kind % 6) {
    case 0:
      ctx.moveTo(-k, -k * 0.2)
      ctx.bezierCurveTo(-k * 0.4, -k * 0.8, k * 0.2, k * 0.5, k, -k * 0.1)
      break
    case 1:
      for (let t = 0; t < 9; t += 0.3) ctx.lineTo(Math.cos(t) * t * k * 0.09, Math.sin(t) * t * k * 0.09)
      break
    case 2:
      ctx.moveTo(-k, -k * 0.3)
      for (let i = 0; i < 6; i++) ctx.lineTo(-k + (i + 1) * k * 0.36, i % 2 ? -k * 0.3 : k * 0.3)
      break
    case 3:
      ctx.arc(0, k * 1.2, k * 1.1, Math.PI * 1.15, Math.PI * 1.85)
      ctx.moveTo(-k * 0.9, -k * 0.6)
      ctx.arc(0, -k * 1.6, k * 1.1, Math.PI * 0.2, Math.PI * 0.8)
      break
    case 4:
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
        ctx.lineTo(Math.cos(a) * k * 0.6, Math.sin(a) * k * 0.6)
      }
      ctx.closePath()
      break
    default:
      ctx.arc(0, 0, k * 0.5, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.restore()
  /* ไฮไลต์ */
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

type Fly = { x: number; y: number; vx: number; vy: number; color: number }
type Spark = { x: number; y: number; vx: number; vy: number; color: number; life: number; max: number; size: number }
type Txt = { x: number; y: number; text: string; t: number; big?: boolean }
type Ring = { x: number; y: number; color: number; t: number }

/**
 * กบพ่นบอล — โซ่บอลกลิ้งตามรางเกลียวเข้าหาหลุม กบกลางจอหมุนเล็งแล้วพ่นบอลแทรกเข้าโซ่
 * สีเดียวกัน 3 ลูกขึ้นไปติดกันแตก · ช่องว่างที่ปลายสองฝั่งสีเดียวกันจะดูดกลับมาชนกันเป็นคอมโบ
 *
 * ★ วาดด้วย canvas ทั้งหมด — กบ (ตัวละครของเราเอง) ตาตามทิศเล็ง กะพริบตา ปากอมบอลลูกถัดไป
 *   หลังมีอัญมณีสีลูกสำรอง · บอลมีลายหมุนตามการกลิ้ง · หลุมขอบทองเรืองแดงเมื่อใกล้แพ้
 * ★ สถานะเกมอยู่ใน ref — React state ใช้แค่แถบคะแนนกับป๊อปอัปจบเกม
 */
export function FrogGame() {
  const ot = useOt()
  const [level, setLevel] = useState<Level | null>(null)
  const [hud, setHud] = useState({ score: 0, best: 0, left: 0, danger: 0 })
  const [status, setStatus] = useState<'PLAY' | 'WIN' | 'LOSE'>('PLAY')
  const [round, setRound] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fsRef = useRef<HTMLDivElement | null>(null)
  const [fs, toggleFs] = useGameFullscreen(fsRef)

  const g = useRef({
    track: null as Track | null,
    colors: [] as RGB[],
    pal: null as Pal | null,
    chain: [] as Ball[],
    toSpawn: 0,
    nextId: 1,
    cur: 0,
    next: 1,
    fly: [] as Fly[],
    aim: -Math.PI / 2,
    sparks: [] as Spark[],
    rings: [] as Ring[],
    texts: [] as Txt[],
    score: 0,
    combo: 0,
    rush: true,
    over: false,
    lost: false,
    level: 'MEDIUM' as Level,
    recoil: 0,
    blink: 3,
    time: 0,
    shake: 0,
  })

  const start = useCallback((lv: Level) => {
    const s = g.current
    s.track = makeTrack()
    s.colors = resolveColors()
    s.pal = makePal()
    s.chain = []
    s.toSpawn = LEVEL[lv].balls
    s.nextId = 1
    s.fly = []
    s.sparks = []
    s.rings = []
    s.texts = []
    s.score = 0
    s.combo = 0
    s.rush = true
    s.over = false
    s.lost = false
    s.level = lv
    s.cur = Math.floor(Math.random() * LEVEL[lv].colors)
    s.next = Math.floor(Math.random() * LEVEL[lv].colors)
    setHud({ score: 0, best: readBest(), left: LEVEL[lv].balls, danger: 0 })
    setStatus('PLAY')
    setRound((r) => r + 1)
    setLevel(lv)
  }, [])

  const shoot = useCallback(() => {
    const s = g.current
    if (s.over || s.fly.length >= 2) return
    const sp = 95
    s.fly.push({ x: FROG.x + Math.cos(s.aim) * 9, y: FROG.y + Math.sin(s.aim) * 9, vx: Math.cos(s.aim) * sp, vy: Math.sin(s.aim) * sp, color: s.cur })
    s.recoil = 1
    const present = [...new Set(s.chain.map((b) => b.color))]
    s.cur = s.next
    s.next = present.length ? present[Math.floor(Math.random() * present.length)]! : s.cur
  }, [])

  const swap = useCallback(() => {
    const s = g.current
    ;[s.cur, s.next] = [s.next, s.cur]
  }, [])

  const aimAt = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * SIZE
    const y = ((e.clientY - rect.top) / rect.height) * SIZE
    g.current.aim = Math.atan2(y - FROG.y, x - FROG.x)
  }

  useEffect(() => {
    if (!level) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (!document.querySelector('.game-fs')) wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientWidth * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    /* ฉากหลังคงที่: หญ้า ดอกไม้ ใบไม้มุมจอ — สุ่มครั้งเดียว */
    const rnd = seeded(7)
    const tufts = Array.from({ length: 70 }, () => ({ x: rnd() * SIZE, y: rnd() * SIZE, r: 0.8 + rnd() * 1.2, a: rnd() * 6 }))
    const flowers = Array.from({ length: 14 }, () => ({ x: rnd() * SIZE, y: rnd() * SIZE, r: 0.6 + rnd() * 0.5 }))
    const leaves = [
      { x: -2, y: -2, a: 0.8, s: 1.3 },
      { x: 102, y: -2, a: 2.4, s: 1.1 },
      { x: -3, y: 102, a: -0.9, s: 1.0 },
      { x: 103, y: 60, a: 3.4, s: 0.9 },
    ]

    const burst = (x: number, y: number, color: number) => {
      const s = g.current
      if (reduce) return
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 10 + Math.random() * 22
        s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, life: 0, max: 0.4 + Math.random() * 0.4, size: 0.4 + Math.random() * 0.6 })
      }
      s.rings.push({ x, y, color, t: 0 })
    }

    /** ลองแตกรอบลูกที่ i — คืนจำนวนที่แตก */
    const resolve = (i: number, fromPull: boolean) => {
      const s = g.current
      const tr = s.track!
      const [a, b] = runAround(s.chain, i)
      const n = b - a + 1
      if (n < 3) {
        if (!fromPull) s.combo = 0
        return 0
      }
      s.combo = fromPull ? s.combo + 1 : Math.max(1, s.combo + (s.combo ? 0 : 1))
      const removed = s.chain.splice(a, n)
      for (const r of removed) {
        const p = posAt(tr, r.s)
        burst(p.x, p.y, r.color)
      }
      const mid = posAt(tr, removed[Math.floor(n / 2)]!.s)
      const gain = n * 10 * Math.max(1, s.combo) + (n > 3 ? (n - 3) * 15 : 0)
      s.score += gain
      s.texts.push({ x: mid.x, y: mid.y, text: `+${gain}`, t: 0 })
      if (s.combo >= 2) {
        s.texts.push({ x: SIZE / 2, y: 30, text: `COMBO ×${s.combo}`, t: 0, big: true })
        s.shake = 0.3
      }
      setHud((h) => ({ ...h, score: s.score }))
      return n
    }

    const frame = (now: number) => {
      const s = g.current
      const tr = s.track
      const P = s.pal
      if (!tr || !P) return
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      s.time += dt
      s.recoil = Math.max(0, s.recoil - dt * 5)
      s.blink -= dt
      if (s.blink < -0.12) s.blink = 2 + Math.random() * 3
      s.shake = Math.max(0, s.shake - dt)

      const chain = s.chain
      const L = tr.total

      /* ── เกิดบอลใหม่ที่ปากอุโมงค์ ── */
      if (!s.over && s.toSpawn > 0 && (chain.length === 0 || chain[0]!.s >= 0)) {
        const pres = LEVEL[s.level].colors
        /* ★ บอลติดกันสีเดียวกันได้ไม่เกิน 2 — ไม่งั้นโซ่ที่เพิ่งเกิดแตกเองทันที */
        let c = Math.floor(Math.random() * pres)
        if (chain[0] && chain[1] && chain[0].color === chain[1].color && c === chain[0].color) c = (c + 1) % pres
        chain.unshift({ id: s.nextId++, color: c, s: chain.length ? chain[0]!.s - D : 0, grow: 1, check: false })
        s.toSpawn--
      }

      /* ── ความเร็ว: ช่วงแรกพุ่งเข้า (rush) แล้วช้าลง · ใกล้หลุมช้าลงอีกนิดให้มีลุ้น ── */
      const head = chain.length ? chain[chain.length - 1]!.s : 0
      if (s.rush && head > L * 0.3) s.rush = false
      let v = s.rush ? 34 : LEVEL[s.level].speed
      if (!s.rush && head > L * 0.85) v *= 0.7
      if (s.lost) v = 70

      /* ── ช่องว่างที่ปลายสองฝั่งสีเดียวกัน: ดึงโซ่หน้ากลับมาชน ── */
      for (let i = 0; i < chain.length - 1; i++) {
        const gap = chain[i + 1]!.s - chain[i]!.s
        if (gap > D * 1.05 && chain[i]!.color === chain[i + 1]!.color && !s.lost) {
          let e = i + 1
          while (e < chain.length - 1 && chain[e + 1]!.s - chain[e]!.s <= D * 1.05) e++
          const back = Math.min(gap - D, 60 * dt)
          for (let k = i + 1; k <= e; k++) chain[k]!.s -= back
          if (chain[i + 1]!.s - chain[i]!.s <= D * 1.02) {
            chain[i + 1]!.s = chain[i]!.s + D
            resolve(i, true)
            break
          }
        }
      }

      /* ── ดันจากท้าย: ลูกท้ายเดินหน้า แล้วดันลูกข้างหน้าที่ชิดกันไปด้วย ── */
      if (chain.length && !s.over) chain[0]!.s += v * dt
      if (s.lost) for (const b of chain) b.s += v * dt
      for (let i = 1; i < chain.length; i++) {
        const want = chain[i - 1]!.s + (D * (chain[i - 1]!.grow + chain[i]!.grow)) / 2
        if (chain[i]!.s < want) chain[i]!.s = want
      }
      /* บอลที่เพิ่งแทรก: ค่อย ๆ ขยายเต็มขนาด แล้วค่อยตรวจแตก */
      for (let i = 0; i < chain.length; i++) {
        const b = chain[i]!
        if (b.grow < 1) {
          b.grow = Math.min(1, b.grow + dt * 7)
          if (b.grow === 1 && b.check) {
            b.check = false
            resolve(i, false)
            break
          }
        }
      }

      /* ── แพ้: หัวโซ่ถึงหลุม → ทั้งโซ่ไหลลงหลุม ── */
      if (!s.lost && !s.over && chain.length && chain[chain.length - 1]!.s >= L) {
        s.lost = true
        s.over = true
        s.shake = 0.6
        if (s.score > readBest()) writeBest(s.score)
        window.setTimeout(() => setStatus('LOSE'), 1800)
      }
      if (s.lost) s.chain = chain.filter((b) => b.s < L + D)
      /* ── ชนะ: ไม่มีบอลเหลือและเกิดครบแล้ว ── */
      if (!s.over && s.toSpawn === 0 && chain.length === 0) {
        s.over = true
        s.score += 1000
        s.texts.push({ x: SIZE / 2, y: 30, text: 'CLEAR! +1000', t: 0, big: true })
        if (s.score > readBest()) writeBest(s.score)
        setHud((h) => ({ ...h, score: s.score }))
        window.setTimeout(() => setStatus('WIN'), 1400)
      }

      /* ── บอลที่พ่นออกไป: ชนโซ่ → แทรก ── */
      s.fly = s.fly.filter((f) => {
        const steps = 4
        for (let st = 0; st < steps; st++) {
          f.x += (f.vx * dt) / steps
          f.y += (f.vy * dt) / steps
          for (let i = 0; i < s.chain.length; i++) {
            const b = s.chain[i]!
            if (b.s < 0) continue
            const p = posAt(tr, b.s)
            if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < (D * 0.95) ** 2) {
              /* ★ แทรกหน้าหรือหลังลูกที่ชน — ดูว่าจุดชนอยู่ฝั่งไหนตามทิศราง */
              const ahead = (f.x - p.x) * Math.cos(p.a) + (f.y - p.y) * Math.sin(p.a) > 0
              const at = ahead ? i + 1 : i
              s.chain.splice(at, 0, { id: s.nextId++, color: f.color, s: ahead ? b.s + D * 0.5 : b.s - D * 0.5, grow: 0.15, check: true })
              return false
            }
          }
        }
        return f.x > -8 && f.x < SIZE + 8 && f.y > -8 && f.y < SIZE + 8
      })

      s.sparks = s.sparks.filter((p) => {
        p.life += dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= 0.94
        p.vy *= 0.94
        return p.life < p.max
      })
      s.rings = s.rings.filter((r) => (r.t += dt) < 0.4)
      s.texts = s.texts.filter((t) => (t.t += dt) < (t.big ? 1.3 : 0.9))

      /* ── วาด ─────────────────────────────────────────────── */
      const sc = canvas.width / SIZE
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const jx = s.shake ? (Math.random() - 0.5) * s.shake * 2 : 0
      const jy = s.shake ? (Math.random() - 0.5) * s.shake * 2 : 0
      ctx.setTransform(sc, 0, 0, sc, jx * sc, jy * sc)

      /* สนามหญ้า */
      const bg = ctx.createRadialGradient(50, 50, 5, 50, 50, 75)
      bg.addColorStop(0, P.grassHi)
      bg.addColorStop(1, P.grassLo)
      ctx.fillStyle = bg
      ctx.fillRect(-5, -5, 110, 110)
      for (const t of tufts) {
        ctx.strokeStyle = rgba(P.rgbGK,0.35)
        ctx.lineWidth = 0.35
        ctx.beginPath()
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(t.x + k * 0.5, t.y)
          ctx.lineTo(t.x + k * 0.9 + Math.sin(t.a) * 0.3, t.y - t.r)
        }
        ctx.stroke()
      }
      for (const f of flowers) {
        ctx.fillStyle = rgba(P.rgbW,0.75)
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2
          ctx.beginPath()
          ctx.arc(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r, f.r * 0.6, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = P.flower
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      /* ร่องราง: ขอบเข้ม + พื้นราง + เส้นแสง */
      const path = new Path2D()
      tr.pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)))
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = rgba(P.rgbGK,0.55)
      ctx.lineWidth = D + 3
      ctx.stroke(path)
      ctx.strokeStyle = P.track
      ctx.lineWidth = D + 1.4
      ctx.stroke(path)
      const danger = chain.length ? Math.max(0, (chain[chain.length - 1]!.s / L - 0.7) / 0.3) : 0
      if (danger > 0) {
        ctx.strokeStyle = rgba(P.rgbA,danger * (0.25 + 0.2 * Math.sin(s.time * 8)))
        ctx.lineWidth = D + 1.4
        ctx.stroke(path)
      }

      /* อุโมงค์ทางเข้า */
      const p0 = tr.pts[0]!
      ctx.fillStyle = P.tunnel
      ctx.beginPath()
      ctx.arc(p0.x, p0.y, D * 0.75, 0, Math.PI * 2)
      ctx.fill()

      /* หลุมปลายราง: กลีบหิน · ขอบทอง · ดอกไม้ · เรืองแดงเมื่อใกล้แพ้ */
      const pe = tr.pts[tr.pts.length - 1]!
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2
        ctx.fillStyle = P.petal
        ctx.beginPath()
        ctx.ellipse(pe.x + Math.cos(a) * 5.4, pe.y + Math.sin(a) * 5.4, 2.2, 1.5, a, 0, Math.PI * 2)
        ctx.fill()
      }
      const ring = ctx.createLinearGradient(pe.x - 5, pe.y - 5, pe.x + 5, pe.y + 5)
      ring.addColorStop(0, P.goldHi)
      ring.addColorStop(1, P.goldLo)
      ctx.fillStyle = ring
      ctx.beginPath()
      ctx.arc(pe.x, pe.y, 5, 0, Math.PI * 2)
      ctx.fill()
      const pit = ctx.createRadialGradient(pe.x, pe.y, 0.5, pe.x, pe.y, 4)
      pit.addColorStop(0, P.pitCore)
      pit.addColorStop(1, danger > 0 ? rgba(P.rgbAD,0.6 + danger * 0.4) : P.pit)
      ctx.fillStyle = pit
      ctx.beginPath()
      ctx.arc(pe.x, pe.y, 4, 0, Math.PI * 2)
      ctx.fill()

      /* โซ่บอล — ลายหมุนตามระยะที่กลิ้ง */
      for (const b of s.chain) {
        if (b.s < -D) continue
        const p = posAt(tr, b.s)
        const fade = b.s > L ? Math.max(0, 1 - (b.s - L) / D) : 1
        drawBall(ctx, p.x, p.y, (D / 2) * b.grow * fade, s.colors[b.color]!, b.color, b.s / (D / 2), fade)
      }

      /* บอลที่บิน */
      for (const f of s.fly) drawBall(ctx, f.x, f.y, D / 2, s.colors[f.color]!, f.color, s.time * 12)

      /* ประกาย + วงคลื่น */
      for (const r of s.rings) {
        const k = r.t / 0.4
        ctx.strokeStyle = mix(s.colors[r.color]!, WHITE, 0.4)
        ctx.globalAlpha = 1 - k
        ctx.lineWidth = 0.8 * (1 - k)
        ctx.beginPath()
        ctx.arc(r.x, r.y, D * 0.5 + k * D, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (const p of s.sparks) {
        ctx.globalAlpha = 1 - p.life / p.max
        ctx.fillStyle = mix(s.colors[p.color]!, WHITE, 0.4)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      /* เส้นเล็งจาง ๆ */
      if (!s.over) {
        ctx.setLineDash([1.2, 1.6])
        ctx.strokeStyle = rgba(P.rgbW,0.35)
        ctx.lineWidth = 0.4
        ctx.beginPath()
        ctx.moveTo(FROG.x + Math.cos(s.aim) * 12, FROG.y + Math.sin(s.aim) * 12)
        ctx.lineTo(FROG.x + Math.cos(s.aim) * 60, FROG.y + Math.sin(s.aim) * 60)
        ctx.stroke()
        ctx.setLineDash([])
      }

      drawFrog(ctx, s, P, reduce)

      /* ใบไม้มุมจอ — ไหวเบา ๆ */
      for (const lf of leaves) {
        ctx.save()
        ctx.translate(lf.x, lf.y)
        ctx.rotate(lf.a + (reduce ? 0 : Math.sin(s.time * 1.2 + lf.a) * 0.04))
        ctx.scale(lf.s, lf.s)
        const lg = ctx.createLinearGradient(0, -4, 16, 4)
        lg.addColorStop(0, P.leafLo)
        lg.addColorStop(1, P.leafHi)
        ctx.fillStyle = lg
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(9, -7, 18, 0)
        ctx.quadraticCurveTo(9, 7, 0, 0)
        ctx.fill()
        ctx.strokeStyle = rgba(P.rgbGK,0.6)
        ctx.lineWidth = 0.35
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(17, 0)
        for (let k = 3; k < 16; k += 3) {
          ctx.moveTo(k, 0)
          ctx.lineTo(k + 2, -2.5)
          ctx.moveTo(k, 0)
          ctx.lineTo(k + 2, 2.5)
        }
        ctx.stroke()
        ctx.restore()
      }

      /* ตัวเลขคะแนน + คอมโบ */
      for (const t of s.texts) {
        const life = t.big ? 1.3 : 0.9
        const k = t.t / life
        ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
        ctx.textAlign = 'center'
        ctx.font = `900 ${t.big ? 7 * Math.min(1.15, 0.6 + k * 3) : 3.6}px system-ui, sans-serif`
        ctx.lineWidth = t.big ? 1.1 : 0.7
        ctx.strokeStyle = rgba(P.rgbGK,0.7)
        ctx.strokeText(t.text, t.x, t.y - k * (t.big ? 4 : 8))
        ctx.fillStyle = t.big ? P.goldHi : P.white
        ctx.fillText(t.text, t.x, t.y - k * (t.big ? 4 : 8))
        ctx.globalAlpha = 1
      }

      /* แถบสถานะ — อัปเดตไม่บ่อย */
      if (Math.floor(s.time * 4) !== Math.floor((s.time - dt) * 4)) {
        setHud((h) => ({ ...h, left: s.toSpawn + s.chain.length, danger: Math.round(danger * 100) }))
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onKey = (e: KeyboardEvent) => {
      const s = g.current
      if (e.key === 'ArrowLeft') s.aim -= 0.08
      else if (e.key === 'ArrowRight') s.aim += 0.08
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

  if (!level) {
    return (
      <div className="py-2">
        <FunGuide id="frog" art="frog" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="fg-demo relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[28px]" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2
              return (
                <span
                  key={i}
                  className={cn('bb-ball fg-orbit absolute', `bb-c${i % 5}`)}
                  style={{ left: `${(44 + Math.cos(a) * 38).toFixed(2)}%`, top: `${(44 + Math.sin(a) * 38).toFixed(2)}%`, '--dl': `${i * 0.1}s` } as CSSProperties}
                />
              )
            })}
            <span className="fg-frog absolute">🐸</span>
          </div>
          <div>
            <p className="text-sm leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.fg.pitch')}</Untranslated>
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['EASY', 'MEDIUM', 'HARD'] as Level[]).map((lv) => (
                <ModeCard
                  key={lv}
                  tone={lv === 'MEDIUM' ? 'primary' : 'plain'}
                  title={ot(`game.checkers.level.${lv}` as 'game.checkers.level.EASY')}
                  detail={ot('game.fg.levelDetail', { colors: LEVEL[lv].colors, balls: LEVEL[lv].balls })}
                  icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9a3 3 0 0 1 3-3"
                  onClick={() => start(lv)}
                />
              ))}
            </div>
            <p className="mt-4 whitespace-pre-line rounded-2xl bg-surface/70 px-4 py-3 text-xs leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.fg.controls')}</Untranslated>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={fsRef} className={cn(fs && 'game-fs')}>
    <div ref={wrapRef} className="mx-auto w-full scroll-mt-20 py-2" style={{ maxWidth: fs ? 'min(100%, calc(100dvh - 210px))' : 'min(640px, calc(100dvh - 260px))' }}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="bb-hud rounded-2xl px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold text-ink-faint">
            <Untranslated>{ot('game.bb.score')}</Untranslated>
          </p>
          <p key={hud.score} className="bb-score text-2xl font-black tabular-nums text-ink">{hud.score.toLocaleString()}</p>
        </div>
        <div className="bb-hud rounded-2xl px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold text-ink-faint">
            <Untranslated>{ot('game.fg.left')}</Untranslated>
          </p>
          <p className="text-2xl font-black tabular-nums text-ink">{hud.left}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div className={cn('h-full rounded-full transition-[width] duration-300', hud.danger > 0 ? 'bg-accent' : 'bg-[var(--quiz-green)]')} style={{ width: `${Math.max(4, hud.danger)}%` }} />
          </div>
        </div>
        <div className="bb-hud rounded-2xl px-3 py-2 text-center">
          <p className="text-[10.5px] font-bold text-ink-faint">
            <Untranslated>{ot('game.bb.best')}</Untranslated>
          </p>
          <p className="text-2xl font-black tabular-nums text-ink">{Math.max(hud.best, hud.score).toLocaleString()}</p>
        </div>
      </div>

      <div className={cn('fg-stage relative overflow-hidden rounded-[28px]', hud.danger > 60 && 'fg-danger')}>
        <canvas
          ref={canvasRef}
          className="block aspect-square w-full touch-none select-none"
          role="img"
          aria-label={ot('game.fg.canvasLabel')}
          tabIndex={0}
          onPointerMove={(e) => aimAt(e)}
          onPointerDown={(e) => {
            aimAt(e)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={(e) => {
            aimAt(e)
            if (e.button === 2) swap()
            else shoot()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
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
          title={ot(status === 'WIN' ? 'game.fg.cleared' : 'game.fg.gameOver')}
          lines={ot(status === 'WIN' ? 'game.fg.winLines' : 'game.fg.loseLines')}
          sub={ot(hud.score > 0 && hud.score >= hud.best ? 'game.bb.newBest' : status === 'WIN' ? 'game.checkers.winSub' : 'game.fg.loseSub')}
          piece={() => <span className="relative grid size-full place-items-center text-6xl">🐸</span>}
          stats={
            <div className="ckr-rise mt-4 flex flex-wrap justify-center gap-2" style={{ '--d': '1.25s' } as CSSProperties}>
              <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink">
                <Untranslated>{ot('game.bb.statScore', { n: hud.score.toLocaleString() })}</Untranslated>
              </span>
              <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink">
                <Untranslated>{ot('game.bb.statBest', { n: Math.max(hud.best, hud.score).toLocaleString() })}</Untranslated>
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

/**
 * กบ — ตัวละครของเราเอง วาดมองจากด้านบน หันหน้าตามทิศเล็ง
 * ฐานหิน · ขาหลังขาหน้ามีนิ้ว · หลังสีเหลืองมีอัญมณีสีลูกสำรอง · ตาโตกะพริบ · ปากอมบอลลูกปัจจุบัน
 */
function drawFrog(
  ctx: CanvasRenderingContext2D,
  s: { aim: number; cur: number; next: number; colors: RGB[]; recoil: number; blink: number; time: number },
  P: Pal,
  reduce: boolean,
) {
  const { x, y } = FROG
  /* ฐานหิน */
  ctx.save()
  ctx.fillStyle = rgba(P.rgbK,0.3)
  ctx.beginPath()
  ctx.arc(x + 0.6, y + 1.2, 15.5, 0, Math.PI * 2)
  ctx.fill()
  const stone = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 15)
  stone.addColorStop(0, P.stoneHi)
  stone.addColorStop(1, P.stoneLo)
  ctx.fillStyle = stone
  ctx.beginPath()
  ctx.arc(x, y, 15, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.stoneRim
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.fillStyle = P.stoneIn
  ctx.beginPath()
  ctx.arc(x, y, 12.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.translate(x, y)
  ctx.rotate(s.aim + Math.PI / 2)
  const breathe = reduce ? 1 : 1 + Math.sin(s.time * 3) * 0.015
  ctx.scale(breathe, breathe)
  const kick = s.recoil * 1.2

  const skin = P.skin
  const skinDark = P.skinDark
  const leg = P.leg
  const legDark = P.legDark
  const foot = (fx: number, fy: number, rot: number) => {
    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(rot)
    ctx.fillStyle = leg
    for (const dx of [-1.3, 0, 1.3]) {
      ctx.beginPath()
      ctx.ellipse(dx, -1.4, 0.65, 1.3, dx * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  /* ขาหลัง */
  for (const side of [-1, 1]) {
    ctx.fillStyle = leg
    ctx.strokeStyle = legDark
    ctx.lineWidth = 0.4
    ctx.beginPath()
    ctx.ellipse(side * 7.5, 5.5 + kick * 0.3, 3, 5.5, side * -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    foot(side * 9.6, 10 + kick * 0.3, side * 0.5 + Math.PI)
  }
  /* ขาหน้า */
  for (const side of [-1, 1]) {
    ctx.fillStyle = leg
    ctx.beginPath()
    ctx.ellipse(side * 7.8, -3.5, 1.8, 3.6, side * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    foot(side * 9.4, -6.3, side * -0.4)
  }
  /* ลำตัว */
  const body = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10)
  body.addColorStop(0, P.bodyHi)
  body.addColorStop(1, skinDark)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 1.5, 7.6, 8.8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.outline
  ctx.lineWidth = 0.45
  ctx.stroke()
  /* กระดองเหลืองบนหลัง + อัญมณีสีลูกสำรอง */
  const shell = ctx.createLinearGradient(0, -2, 0, 10)
  shell.addColorStop(0, P.shellHi)
  shell.addColorStop(1, P.shellLo)
  ctx.fillStyle = shell
  ctx.beginPath()
  ctx.moveTo(-5.6, -1.5)
  ctx.quadraticCurveTo(0, -4, 5.6, -1.5)
  ctx.lineTo(2.4, 9.6)
  ctx.quadraticCurveTo(0, 10.8, -2.4, 9.6)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = P.shellRim
  ctx.lineWidth = 0.4
  ctx.stroke()
  drawBall(ctx, 0, 2.6, 2.1, s.colors[s.next] ?? [200, 50, 50], s.next, 0)
  /* หัว */
  const head = ctx.createRadialGradient(-1.5, -7.5, 0.5, 0, -6, 7)
  head.addColorStop(0, P.headHi)
  head.addColorStop(1, skin)
  ctx.fillStyle = head
  ctx.beginPath()
  ctx.ellipse(0, -6.4, 6.4, 4.4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = P.skinDark
  ctx.lineWidth = 0.4
  ctx.stroke()
  /* ปาก + บอลที่อมไว้ (ถอยเข้าไปตอนพ่น) */
  ctx.fillStyle = P.mouth
  ctx.beginPath()
  ctx.ellipse(0, -9.2, 3.6, 2.2, 0, 0, Math.PI * 2)
  ctx.fill()
  drawBall(ctx, 0, -10.2 + kick, D / 2 * (1 - s.recoil * 0.6), s.colors[s.cur] ?? [50, 120, 220], s.cur, 0)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.ellipse(0, -7.4, 4.8, 1.4, 0, 0, Math.PI)
  ctx.fill()
  /* ตา — กะพริบ */
  for (const side of [-1, 1]) {
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(side * 3.4, -6.2, 2.6, 0, Math.PI * 2)
    ctx.fill()
    if (s.blink > 0) {
      ctx.fillStyle = P.white
      ctx.beginPath()
      ctx.arc(side * 3.4, -6.6, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = P.pupil
      ctx.beginPath()
      ctx.arc(side * 3.3, -7.3, 1.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = P.white
      ctx.beginPath()
      ctx.arc(side * 3.0, -7.7, 0.35, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = P.outline
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(side * 3.4 - 1.6, -6.6)
      ctx.lineTo(side * 3.4 + 1.6, -6.6)
      ctx.stroke()
    }
  }
  ctx.restore()
}
