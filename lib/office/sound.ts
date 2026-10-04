'use client'

/**
 * เสียงประกอบการสุ่ม (FR-X05 · หัวข้อ 4.1)
 *
 * ★★★ สังเคราะห์ด้วย Web Audio ไม่ใช่ไฟล์เสียง
 *
 *     ไฟล์ mp3 สามไฟล์ = คำขอเพิ่มสามครั้ง + หลายร้อย KB ที่ต้องโหลดก่อน
 *     เสียงแรกจะดัง ★ ซึ่งแปลว่าเสียงติ๊กของการหมุนครั้งแรกมาไม่ทันเสมอ
 *
 *     ★ เสียงพวกนี้เป็นเสียงสังเคราะห์ง่าย ๆ อยู่แล้ว (ติ๊ก = คลิกสั้น ๆ
 *       กลองรัว = noise burst) การสังเคราะห์จึงได้ผลเหมือนกันโดยไม่มีไฟล์เลย
 *
 * ★★ AudioContext ต้องสร้างหลังผู้ใช้กดอะไรสักอย่าง
 *    เบราว์เซอร์บล็อกเสียงอัตโนมัติ — สร้างตอน import จะได้ context ที่
 *    ถูก suspend ค้างตลอดไป ★ จึงสร้าง lazy ตอนเล่นเสียงครั้งแรก
 *    ซึ่งเกิดจากการกดปุ่ม "หมุน" พอดี
 */

let ctx: AudioContext | null = null
let muted = false

/* ★ ไม่เปลี่ยนตามชื่อแบรนด์ — เป็นกุญแจที่เก็บไว้ในเครื่องผู้ใช้แล้ว
   ★★ เปลี่ยนแล้วค่าที่เขาตั้งไว้จะถูกมองว่าไม่มี แล้วรีเซ็ตเงียบ ๆ ทุกคน */
const MUTE_KEY = 'frameroom:office:muted'

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false
  if (muted) return true
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    /* Safari โหมดส่วนตัวเขียนไม่ได้ — จำข้ามครั้งไม่ได้เท่านั้น */
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (isMuted()) return null

  try {
    ctx ??= new AudioContext()
    /* ★ กลับมาจาก suspend ถ้าเบราว์เซอร์พักไว้ตอนสลับแท็บ */
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** เสียงติ๊กตอนผ่านแต่ละช่อง — สั้นและแหลม */
export function playTick(): void {
  const ac = audio()
  if (!ac) return

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'square'
  osc.frequency.value = 1400
  /* ★ 25ms เท่านั้น — ยาวกว่านี้เสียงจะทับกันตอนวงล้อหมุนเร็ว
     แล้วกลายเป็นเสียงหึ่งแทนเสียงติ๊กเป็นจังหวะ */
  gain.gain.setValueAtTime(0.06, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.025)

  osc.connect(gain).connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + 0.03)
}

/** กลองรัวก่อนเปิดผล */
export function playDrumroll(durationMs = 700): void {
  const ac = audio()
  if (!ac) return

  const seconds = durationMs / 1000
  const frames = Math.floor(ac.sampleRate * seconds)
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)

  /* ★ noise ที่ถูก modulate ด้วยคลื่นเร็ว = เสียงกลองรัว
     ค่อย ๆ ดังขึ้นเพื่อสร้างความคาดหวังก่อนเปิดผล */
  for (let i = 0; i < frames; i++) {
    const t = i / frames
    const roll = Math.abs(Math.sin(i * 0.08))
    data[i] = (Math.random() * 2 - 1) * roll * 0.25 * (0.3 + t * 0.7)
  }

  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900

  src.buffer = buffer
  src.connect(filter).connect(ac.destination)
  src.start()
}

/** เสียงฉลองตอนได้ผล — อาร์เพจจิโอขึ้นสามตัว */
export function playCelebrate(): void {
  const ac = audio()
  if (!ac) return

  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const at = ac.currentTime + i * 0.09

    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.14, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)

    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + 0.5)
  })
}

/**
 * เสียงแพ้ — สามโน้ตไล่ลงแบบ "วา–วา–วาาา" แล้วโน้ตสุดท้ายเอื้อนลง
 *
 * ★ ตลกนิด ๆ ไม่ใช่เศร้าจริงจัง — เกมในออฟฟิศ แพ้แล้วต้องยิ้มได้
 */
export function playSad(): void {
  const ac = audio()
  if (!ac) return

  const notes = [392.0, 369.99, 349.23, 329.63] // G4 F#4 F4 E4
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const at = ac.currentTime + i * 0.32
    const last = i === notes.length - 1
    const len = last ? 0.9 : 0.28

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, at)
    /* ★ โน้ตสุดท้ายสั่นและหย่อนลง — ตัวที่ทำให้ฟังออกว่า "แพ้" */
    if (last) {
      const lfo = ac.createOscillator()
      const depth = ac.createGain()
      lfo.frequency.value = 6
      depth.gain.value = 6
      lfo.connect(depth).connect(osc.frequency)
      lfo.start(at)
      lfo.stop(at + len)
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, at + len)
    }
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len)

    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + len + 0.05)
  })
}

/**
 * สั่นสั้น ๆ ตอนเปิดผล
 *
 * ★ iOS ไม่รองรับ navigator.vibrate เลย และจะไม่รองรับในอนาคตอันใกล้
 *   ★ ไม่ต้องทำ fallback อะไร — การสั่นเป็นของเสริม ไม่ใช่ของที่ขาดไม่ได้
 *     (เอกสารเขียนว่า "บนอุปกรณ์ที่รองรับ" ไว้แล้ว)
 */
export function vibrate(pattern: number | number[] = 40): void {
  if (isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* บางเบราว์เซอร์โยนเมื่อเรียกนอก user gesture */
  }
}
