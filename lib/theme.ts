/**
 * โทนสีของเว็บ — สว่าง / มืด / ตามเครื่อง
 *
 * ★★ ทำไมต้องมีสคริปต์ใน <head> ไม่ใช่ตั้งค่าใน useEffect
 *
 *    useEffect ทำงาน "หลัง" เบราว์เซอร์วาดหน้าแรกไปแล้ว คนที่เลือกโหมดสว่าง
 *    จะโดนจอดำสาดหน้าหนึ่งเฟรมก่อนแล้วค่อยกระพริบเป็นสีขาว — อาการนี้มีชื่อ
 *    ว่า FOUC และมันน่ารำคาญที่สุดตอนกลางคืน ซึ่งเป็นเวลาที่คนใช้แอปนี้จริง
 *
 *    ★ สคริปต์ที่ฝังตรง ๆ ใน <head> รันก่อน <body> ถูกวาด จึงไม่มีเฟรมผิดสีเลย
 *      ราคาคือโค้ดก้อนนี้ต้องเป็น string ที่อ่านยากหน่อย — คุ้มกว่ามาก
 *
 * ★★ เก็บ "ความตั้งใจ" ไม่ใช่ "ผลลัพธ์"
 *
 *    localStorage เก็บ system/light/dark ส่วน data-theme บน <html> เก็บแค่
 *    light/dark — แยกกันเพราะคนที่เลือก "ตามเครื่อง" แล้วสลับโหมดที่ระบบ
 *    ต้องเห็นเว็บเปลี่ยนตามทันทีโดยไม่ต้องมาเลือกใหม่
 */

export type ThemePref = 'system' | 'light' | 'dark'
export type Resolved = 'light' | 'dark'

/* ★ ไม่เปลี่ยนตามชื่อแบรนด์ — เป็นกุญแจที่เก็บไว้ในเครื่องผู้ใช้แล้ว
   ★★ เปลี่ยนแล้วค่าที่เขาตั้งไว้จะถูกมองว่าไม่มี แล้วรีเซ็ตเงียบ ๆ ทุกคน */
export const THEME_KEY = 'frameroom:theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * ★ สคริปต์นี้ถูกแปะลง <head> ตรง ๆ จึงต้อง:
 *   • ไม่พึ่ง import อะไรเลย (มันรันก่อน bundle ใด ๆ โหลด)
 *   • ห่อ try/catch ทั้งก้อน — localStorage โยนได้ในโหมดส่วนตัวของ Safari
 *     และถ้ามันโยนที่นี่ หน้าเว็บจะค้างเป็นจอขาวทั้งหน้า ไม่ใช่แค่สีเพี้ยน
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p!=='light'&&window.matchMedia('${DARK_QUERY}').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`

export function readPref(): ThemePref {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function systemTheme(): Resolved {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(pref: ThemePref): Resolved {
  return pref === 'system' ? systemTheme() : pref
}

/* ── ร้านเก็บสถานะเล็ก ๆ ────────────────────────────────────────────────
 *
 * ★ ไม่ใช้ Context เพราะปุ่มสลับโทนอยู่ในแถบบน ส่วนคนอ่านค่าก็มีแค่ปุ่มนั้น
 *   การห่อทั้งแอปด้วย Provider เพื่อค่าเดียวที่คอมโพเนนต์เดียวใช้ คือการ
 *   จ่ายค่า re-render ทั้งต้นไม้ให้กับสิ่งที่ CSS จัดการให้อยู่แล้ว
 *
 *   ★ ตัวที่เปลี่ยนหน้าตาเว็บจริง ๆ คือ attribute บน <html> ไม่ใช่ React
 *     React แค่ต้องรู้ว่าตอนนี้เลือกอะไรอยู่เพื่อวาดเครื่องหมายถูกในเมนู
 */

const listeners = new Set<() => void>()
let cached: ThemePref = 'system'
let hydrated = false
let mediaBound = false

function emit() {
  for (const fn of listeners) fn()
}

/** ใส่ค่าลง <html> + จำไว้ใน localStorage */
export function setTheme(pref: ThemePref) {
  cached = pref
  hydrated = true
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    // เขียนไม่ได้ก็ยังเปลี่ยนสีให้ได้ในรอบนี้ แค่จำข้ามครั้งไม่ได้
  }
  document.documentElement.dataset.theme = resolveTheme(pref)
  emit()
}

export function subscribeTheme(fn: () => void) {
  listeners.add(fn)

  /**
   * ★ ฟังการสลับโหมดของระบบไว้เสมอ ไม่ใช่เฉพาะตอนเลือก "ตามเครื่อง"
   *   ผู้ใช้อาจเลือก dark ไว้ แล้วภายหลังกลับมาเลือก system — ถ้าเพิ่งมาผูก
   *   ตอนนั้นจะพลาดการเปลี่ยนที่เกิดขึ้นระหว่างนั้นไป
   */
  if (!mediaBound && typeof window !== 'undefined') {
    mediaBound = true
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (readPref() !== 'system') return
      document.documentElement.dataset.theme = systemTheme()
      emit()
    })
  }

  return () => {
    listeners.delete(fn)
  }
}

export function getThemeSnapshot(): ThemePref {
  // ★ อ่าน localStorage ครั้งเดียวแล้วแคช — useSyncExternalStore เรียก
  //   getSnapshot ทุก render และต้องได้ค่าที่ === เดิม ไม่งั้น React วนไม่จบ
  if (!hydrated) {
    cached = readPref()
    hydrated = true
  }
  return cached
}

export const getThemeServerSnapshot = (): ThemePref => 'system'
