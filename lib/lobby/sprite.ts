import { HAIRS, PANTS, SHIRTS, SKINS, appearanceKey, type Appearance } from './appearance'

/**
 * โรงงานสไปรท์ตัวละคร
 *
 * ★★★ ทำไมสร้างเป็น "แผ่นสไปรท์" ทีเดียว แทนที่จะวาดใหม่ทุกเฟรม
 *
 *     ถ้าวาดสดทุกเฟรม: 10 คน × 60fps = วาดพิกเซลอาร์ต 600 ครั้งต่อวินาที
 *     ซึ่งกินซีพียูฟรี ๆ ทั้งที่ภาพซ้ำกันอยู่แค่ 16 แบบต่อคน
 *
 *     ★ วาดครบทุกท่าลงแผ่นเดียวครั้งเดียว แล้วให้ CSS เลื่อน background-position
 *       เอา — หลังจากนั้นการเดินไม่ใช้ JS เลยสักบรรทัด เบราว์เซอร์จัดการเอง
 *       และแผ่นเดียวกันใช้ซ้ำได้ทุกคนที่แต่งตัวเหมือนกัน
 *
 * ★★ ทำไมเก็บแคชด้วย key ที่เป็นสตริง
 *
 *    คนส่วนใหญ่ในลอบบี้จะหน้าตาไม่ซ้ำกัน แต่ "ตัวเราเอง" ถูก render ซ้ำ
 *    ทุกครั้งที่ขยับ ★ ถ้าไม่แคช ทุกก้าวเดินจะสร้าง canvas ใหม่ทั้งใบ
 */

export const SPRITE_W = 32
export const SPRITE_H = 48
/** ลง · ซ้าย · ขวา · ขึ้น */
export const DIRS = 4
export const FRAMES = 4

const cache = new Map<string, string>()

/** เข้มขึ้น/อ่อนลงจากสีเดิม — ใช้ทำเงาและไฮไลต์โดยไม่ต้องกำหนดสีเองทุกจุด */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(((n >> 16) & 255) + amount)
  const g = clamp(((n >> 8) & 255) + amount)
  const b = clamp((n & 255) + amount)
  return `rgb(${r},${g},${b})`
}

type Ctx = CanvasRenderingContext2D

/**
 * ★ หยิบค่าจากจานสีแบบวนรอบ ไม่ใช่ arr[i] ตรง ๆ
 *   index ที่เกินช่วงจะได้ undefined ซึ่งกลายเป็นสี "undefined" บน canvas
 *   แล้วทุกอย่างที่วาดหลังจากนั้นหายไปเงียบ ๆ โดยไม่มี error ให้เห็นเลย
 */
function at(list: readonly string[], index: number): string {
  return list[((index % list.length) + list.length) % list.length] ?? list[0] ?? '#000'
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/**
 * วาดตัวละครหนึ่งท่า
 *
 * ★ จุดอ้างอิงคือ "เท้า" ที่ขอบล่างของกรอบ ไม่ใช่กลางตัว
 *   เพราะการเรียงว่าใครอยู่หน้าใครบนแผนที่มุมบนต้องเรียงตามเท้า
 *   ถ้าอ้างจากกลางตัว คนตัวสูงจะดูเหมือนยืนอยู่หลังคนตัวเตี้ยเสมอ
 */
function drawPose(ctx: Ctx, a: Appearance, dir: number, frame: number) {
  const skin = at(SKINS, a.skin)
  const skinDark = shade(skin, -34)
  const hair = at(HAIRS, a.hairColor)
  const hairDark = shade(hair, -30)
  const shirt = at(SHIRTS, a.shirt)
  const shirtDark = shade(shirt, -28)
  const pants = at(PANTS, a.pants)
  const pantsDark = shade(pants, -22)
  const shoe = '#2a2320'

  // ★ ท่า 0 และ 2 คือยืน ท่า 1/3 คือก้าวซ้าย/ก้าวขวา
  //   การให้ยืนคั่นกลางทุกก้าวทำให้จังหวะเดินดูเป็นธรรมชาติกว่าสลับซ้ายขวารวด
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0
  const bob = step !== 0 ? 1 : 0

  const back = dir === 3
  const side = dir === 1 || dir === 2
  // วาดด้านขวาเสมอ แล้วพลิกทั้งภาพเอาตอนเป็นทิศซ้าย
  const top = 4 + bob

  /* ── เงาใต้เท้า ─────────────────────────────────────────────── */
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(16, 45, 8, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  /* ── ขา ─────────────────────────────────────────────────────── */
  if (side) {
    px(ctx, 13, 34, 7, 8, step >= 0 ? pants : pantsDark)
    px(ctx, 13, 42, 8, 3, shoe)
    if (step !== 0) {
      px(ctx, 13 - step * 3, 34, 6, 8, pantsDark)
      px(ctx, 13 - step * 4, 42, 7, 3, shoe)
    }
  } else {
    px(ctx, 11, 34, 5, 8 + (step > 0 ? -1 : 0), pants)
    px(ctx, 17, 34, 5, 8 + (step < 0 ? -1 : 0), pantsDark)
    px(ctx, 11, 42 + (step > 0 ? -1 : 0), 5, 3, shoe)
    px(ctx, 17, 42 + (step < 0 ? -1 : 0), 5, 3, shoe)
  }

  /* ── ลำตัว ──────────────────────────────────────────────────── */
  const bodyTop = top + 14
  if (side) {
    /*
     * ★ ลำตัวด้านข้างต้องกว้างใกล้เคียงหัว ไม่ใช่บางเป็นแผ่น
     *   ตอนแรกทำไว้ 9 พิกเซลเทียบกับหัว 11 ซึ่งพอเดินไปทางข้างแล้ว
     *   ตัวละครดูเหมือนกระดาษที่ถูกหันข้าง ไม่ใช่คนคนเดียวกับตอนหันหน้า
     */
    px(ctx, 11, bodyTop, 11, 16, shirt)
    px(ctx, 11, bodyTop, 2, 16, shirtDark)
    // แขนข้างเดียว แกว่งสวนขา
    px(ctx, 13 + step * 2, bodyTop + 3, 5, 10, shirtDark)
    px(ctx, 13 + step * 2, bodyTop + 12, 5, 3, skin)
  } else {
    px(ctx, 10, bodyTop, 13, 16, shirt)
    px(ctx, 10, bodyTop, 3, 16, shirtDark)
    px(ctx, 7, bodyTop + 2, 4, 11, shirt)
    px(ctx, 22, bodyTop + 2, 4, 11, shirt)
    px(ctx, 7, bodyTop + 12 + step, 4, 3, skin)
    px(ctx, 22, bodyTop + 12 - step, 4, 3, skin)
    if (!back) {
      // คอเสื้อ
      px(ctx, 14, bodyTop, 5, 2, shirtDark)
    }
  }

  /* ── หัว ────────────────────────────────────────────────────── */
  const headY = top
  if (side) {
    px(ctx, 11, headY, 11, 13, skin)
    px(ctx, 11, headY, 3, 13, skinDark)
    px(ctx, 11, headY + 12, 11, 2, skinDark)
  } else {
    px(ctx, 10, headY, 13, 14, skin)
    px(ctx, 10, headY, 2, 14, skinDark)
    px(ctx, 10, headY + 13, 13, 2, skinDark)
  }

  /* ── ทรงผม ──────────────────────────────────────────────────── */
  /*
   * ★★ ผมต้องวาด "ก่อน" หน้า ไม่ใช่ทับหน้า
   *
   *    ตอนแรกวาดผมทีหลัง ปอยผมข้างแก้มของบางทรงเลยไปพาดตรงระดับตาพอดี
   *    ★ ที่ขนาด 32 พิกเซล มันไม่ได้ดูเหมือนผม — มันดูเหมือนใส่หน้ากากโจร
   *      (เห็นชัดมากตอนหันข้าง ซึ่งเป็นท่าที่เห็นบ่อยที่สุดเวลาเดิน)
   *    สลับลำดับแล้วตากับปากอยู่บนสุดเสมอ ทุกทรงผมจึงใช้ได้หมดโดยไม่ต้องแก้ทีละทรง
   */
  drawHair(ctx, a.hair, hair, hairDark, headY, { side, back })

  /* ── หน้าตา ─────────────────────────────────────────────────── */
  if (!back) {
    const eye = '#1d1512'
    if (side) {
      px(ctx, 18, headY + 6, 2, 2, eye)
      px(ctx, 17, headY + 10, 3, 1, shade(skin, -60))
    } else {
      px(ctx, 13, headY + 6, 2, 2, eye)
      px(ctx, 18, headY + 6, 2, 2, eye)
      px(ctx, 15, headY + 10, 3, 1, shade(skin, -55))
    }
    if (a.glasses) {
      const rim = '#2b2b33'
      if (side) {
        px(ctx, 17, headY + 5, 5, 1, rim)
        px(ctx, 17, headY + 8, 5, 1, rim)
        px(ctx, 21, headY + 5, 1, 4, rim)
      } else {
        px(ctx, 12, headY + 5, 4, 1, rim)
        px(ctx, 12, headY + 8, 4, 1, rim)
        px(ctx, 12, headY + 5, 1, 4, rim)
        px(ctx, 17, headY + 5, 4, 1, rim)
        px(ctx, 17, headY + 8, 4, 1, rim)
        px(ctx, 20, headY + 5, 1, 4, rim)
        px(ctx, 16, headY + 6, 1, 1, rim)
      }
    }
  }
}

function drawHair(
  ctx: Ctx,
  style: number,
  hair: string,
  hairDark: string,
  y: number,
  view: { side: boolean; back: boolean },
) {
  const { side, back } = view
  const left = side ? 11 : 10
  const width = side ? 11 : 13

  switch (style) {
    case 0: // สั้น
      px(ctx, left, y - 1, width, 5, hair)
      px(ctx, left, y + 4, 3, 3, hairDark)
      if (!side) px(ctx, 20, y + 4, 3, 3, hairDark)
      break

    case 1: // ยาว
      px(ctx, left, y - 1, width, 6, hair)
      px(ctx, left - 1, y + 2, 3, 16, hairDark)
      if (!side) px(ctx, 21, y + 2, 3, 16, hairDark)
      if (back) px(ctx, left, y + 4, width, 14, hair)
      break

    case 2: // มวยผม
      px(ctx, left, y - 1, width, 5, hair)
      px(ctx, left, y + 4, 2, 3, hairDark)
      px(ctx, side ? 10 : 14, y - 6, 6, 5, hair)
      px(ctx, side ? 10 : 14, y - 6, 6, 2, shade(hair, 22))
      break

    case 3: // หยิก
      px(ctx, left - 1, y - 3, width + 2, 7, hair)
      px(ctx, left - 2, y, 3, 6, hair)
      px(ctx, left + width - 1, y, 3, 6, hair)
      px(ctx, left, y - 4, 4, 3, shade(hair, 16))
      break

    case 4: // ตั้ง
      px(ctx, left, y + 1, width, 3, hair)
      for (let i = 0; i < width; i += 3) {
        px(ctx, left + i, y - 4, 2, 6, i % 6 === 0 ? hair : hairDark)
      }
      break

    case 5: // ซอย
      px(ctx, left, y - 2, width, 6, hair)
      px(ctx, left + 1, y + 4, 3, 4, hairDark)
      px(ctx, left + width - 5, y + 4, 4, 3, hairDark)
      break

    case 6: // บ๊อบ
      px(ctx, left - 1, y - 2, width + 2, 7, hair)
      px(ctx, left - 1, y + 4, 3, 8, hairDark)
      if (!side) px(ctx, 21, y + 4, 3, 8, hairDark)
      break

    default: // ล้าน — ★ ต้องมี ไม่ใช่เรื่องตลก คนจริงก็หัวล้าน
      px(ctx, left + 1, y - 1, width - 2, 2, shade(hair, 40))
      break
  }
}

/*
 * ★★★ ไม่มี document ตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์ — ต้องกันไว้ที่นี่
 *
 *     อาการที่เจอบน production: /lobby ตอบ 500 ด้วย
 *       ReferenceError: document is not defined
 *     ★ Lobby เรียก spriteSheet() ใน useMemo ซึ่ง React รันตอน SSR ด้วย
 *       ★★ "use client" แปลว่า "ทำงานบนเบราว์เซอร์ได้" ไม่ได้แปลว่า
 *          "ไม่ถูกเรนเดอร์บนเซิร์ฟเวอร์" — คอมโพเนนต์ฝั่งไคลเอนต์ยังถูก
 *          เรนเดอร์รอบแรกบนเซิร์ฟเวอร์เสมอเพื่อทำ HTML ชุดแรก
 *
 *     ★ คืนสตริงว่างแทนการโยน error ★★ ฝั่งเบราว์เซอร์จะคำนวณสไปรท์จริง
 *       ตอน hydrate แล้ววาดทับเอง — ผู้ใช้ไม่เห็นความต่าง แต่ได้หน้าเว็บ
 *       แทนที่จะได้ 500
 *
 * ★ แก้ที่ sprite.ts ไม่ใช่ที่ Lobby.tsx เพราะทุกคนที่เรียกฟังก์ชันนี้
 *   เจอปัญหาเดียวกันหมด (AvatarStudio ก็เรียก) — กันที่ต้นทางครั้งเดียวจบ
 */
const noDom = typeof document === 'undefined'

/**
 * แผ่นสไปรท์ทั้งใบของหน้าตาหนึ่งแบบ (4 ทิศ × 4 ท่า)
 *
 * ★ คืนเป็น data URL ไม่ใช่ canvas เพื่อให้เอาไปใส่ CSS background ได้ตรง ๆ
 *   ซึ่งแปลว่าตัวละครหนึ่งตัว = <div> หนึ่งอัน ไม่ใช่ canvas หนึ่งใบต่อคน
 */
export function spriteSheet(a: Appearance): string {
  if (noDom) return ''

  const key = appearanceKey(a)
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W * FRAMES
  canvas.height = SPRITE_H * DIRS
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false

  for (let dir = 0; dir < DIRS; dir++) {
    for (let frame = 0; frame < FRAMES; frame++) {
      ctx.save()
      ctx.translate(frame * SPRITE_W, dir * SPRITE_H)
      // ★ ทิศซ้ายคือทิศขวาที่พลิกกระจก — วาดชุดเดียวใช้ได้สองทิศ
      if (dir === 1) {
        ctx.translate(SPRITE_W, 0)
        ctx.scale(-1, 1)
      }
      ctx.beginPath()
      ctx.rect(0, 0, SPRITE_W, SPRITE_H)
      ctx.clip()
      drawPose(ctx, a, dir, frame)
      ctx.restore()
    }
  }

  const url = canvas.toDataURL()
  cache.set(key, url)
  return url
}

/** รูปหน้าตรงใบเดียว ไว้โชว์ในหน้าแต่งตัวและในรายชื่อ */
export function portrait(a: Appearance, scale = 3): string {
  if (noDom) return ''

  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W * scale
  canvas.height = SPRITE_H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false
  ctx.scale(scale, scale)
  drawPose(ctx, a, 0, 0)
  return canvas.toDataURL()
}

/* ══ อวาตาร์สติกเกอร์ ═══════════════════════════════════════════════ */

const stickerCache = new Map<string, string>()

/**
 * ตัวละครท่าต่าง ๆ พร้อมของประกอบ — ใช้เป็นสติกเกอร์ในแชท
 *
 * ★★ ใช้ drawPose ตัวเดิม ไม่วาดท่าใหม่ทั้งชุด
 *
 *    ท่าเฉพาะกิจแปดท่าแปลว่างานวาดพิกเซลแปดชุดที่ต้องดูแลต่อไปตลอด
 *    และต้องแก้ทุกครั้งที่เพิ่มทรงผมใหม่
 *
 *    ★ ท่ายืน/เดินที่มีอยู่แล้ว + "ของประกอบ" รอบตัว (หัวใจ · Zzz · โน้ตดนตรี)
 *      สื่ออารมณ์ได้ครบโดยที่ตัวละครยังเป็นคนเดิมเป๊ะทุกท่า
 *      ซึ่งสำคัญกว่าความหลากหลายของท่า — คนต้องจำได้ว่านี่คือตัวเรา
 */
export function avatarSticker(a: Appearance, pose: string, scale = 3): string {
  if (noDom) return ''

  const key = `${appearanceKey(a)}|${pose}|${scale}`
  const hit = stickerCache.get(key)
  if (hit) return hit

  const W = 64
  const H = 56
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false
  ctx.scale(scale, scale)

  // ★ ทิศกับเฟรมเลือกตามอารมณ์ ให้ท่าทางเข้ากับของประกอบ
  const look: Record<string, [number, number]> = {
    hi: [2, 1],
    love: [0, 0],
    lol: [0, 2],
    ok: [0, 0],
    sleep: [1, 0],
    dance: [2, 3],
    thanks: [3, 0],
    sad: [0, 0],
  }
  const [dir, frame] = look[pose] ?? [0, 0]

  ctx.save()
  ctx.translate((W - SPRITE_W) / 2, H - SPRITE_H)
  ctx.beginPath()
  ctx.rect(0, 0, SPRITE_W, SPRITE_H)
  ctx.clip()
  if (dir === 1) {
    ctx.translate(SPRITE_W, 0)
    ctx.scale(-1, 1)
  }
  drawPose(ctx, a, dir, frame)
  ctx.restore()

  drawProp(ctx, pose, W)

  const url = canvas.toDataURL()
  stickerCache.set(key, url)
  return url
}

/** ของประกอบรอบตัว — วาดด้วยรูปทรงง่าย ๆ ให้เข้ากับงานพิกเซล */
function drawProp(ctx: Ctx, pose: string, W: number) {
  const heart = (x: number, y: number, s: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y + s, s, s)
    ctx.fillRect(x + s * 2, y + s, s, s)
    ctx.fillRect(x, y, s, s)
    ctx.fillRect(x + s * 2, y, s, s)
    ctx.fillRect(x + s, y + s, s, s)
    ctx.fillRect(x + s, y + s * 2, s, s)
    ctx.fillRect(x + s * 0.5, y + s * 2, s, s)
    ctx.fillRect(x + s * 1.5, y + s * 2, s, s)
    ctx.fillRect(x + s, y + s * 3, s, s)
  }

  switch (pose) {
    case 'love':
      heart(6, 6, 3, '#ff4d6d')
      heart(W - 16, 12, 2, '#ff8fab')
      break
    case 'lol':
      for (const [x, y, r] of [[8, 14, 2], [W - 12, 18, 2], [12, 6, 1.5]] as const) {
        ctx.fillStyle = '#7fd0ff'
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * 1.4, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'sleep': {
      ctx.fillStyle = '#c9d6ff'
      ctx.font = 'bold 9px system-ui'
      ctx.fillText('z', W - 20, 16)
      ctx.font = 'bold 12px system-ui'
      ctx.fillText('Z', W - 14, 9)
      break
    }
    case 'dance':
      for (const [x, y, s] of [[8, 10, 6], [W - 14, 16, 5]] as const) {
        ctx.fillStyle = '#ffd166'
        ctx.fillRect(x + s * 0.6, y, 2, s)
        ctx.beginPath()
        ctx.ellipse(x + s * 0.4, y + s, s * 0.45, s * 0.35, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'hi':
      ctx.fillStyle = '#ffd166'
      ctx.fillRect(W - 18, 8, 10, 3)
      ctx.fillRect(W - 15, 5, 3, 9)
      break
    case 'ok':
      ctx.strokeStyle = '#3ddc84'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(8, 14)
      ctx.lineTo(13, 19)
      ctx.lineTo(22, 8)
      ctx.stroke()
      break
    case 'thanks':
      heart(W - 16, 8, 2, '#ffb3c6')
      break
    case 'sad':
      ctx.fillStyle = '#7fd0ff'
      ctx.fillRect(W / 2 + 4, 24, 2, 5)
      break
  }
}
