/**
 * ด่านตรวจ 16 ภาษา — ★ ของที่ตาคนเดียวตรวจไม่ไหว
 *
 *   การแปลครบ 16 ภาษาไม่ได้แปลว่าหน้ามันใช้ได้ 16 ภาษา ★ สามอย่างที่พังเงียบ ๆ
 *   และไม่มีใครรู้จนกว่าจะมีคนภาษานั้นเข้ามาบ่น:
 *
 *     1. ★★ ข้อความไทยโผล่กลางหน้าที่แปลแล้ว — คนเขียนโค้ดใหม่ใส่ตัวหนังสือ
 *        ตรง ๆ ลงใน JSX แทนที่จะเรียก t() ซึ่งดูไม่ออกเลยถ้าเปิดดูเป็นภาษาไทย
 *
 *     2. ★★ ชื่อกุญแจโผล่แทนข้อความ (room.actions.skip) — เพิ่มกุญแจใหม่แล้ว
 *        ลืมแปล ภาษาสำรองก็ไม่มี จึงตกมาที่ชื่อกุญแจซึ่งไม่มีความหมายกับใคร
 *
 *     3. ★★★ หน้าอาหรับกลับด้านไม่ครบ — คลาสที่เขียนซ้าย-ขวาตรง ๆ (ml-/right-)
 *        ไม่สลับตาม dir="rtl" ★ ผลคือของไปกองผิดฝั่งทีละชิ้น ซึ่งแต่ละชิ้น
 *          ดูเหมือนความผิดเล็ก ๆ แต่รวมกันแล้วหน้าอ่านไม่รู้เรื่อง
 *
 *   ★ ข้อ 1 กับ 2 ตรวจด้วยเครื่องได้เด็ดขาด (มี/ไม่มี) ส่วนข้อ 3 ตรวจได้ว่า
 *     "กลับด้านแล้วจริง" กับ "ไม่ล้นแนวนอน" — ที่เหลือต้องดูภาพ จึงถ่ายไว้ให้
 *
 * ★★ อ่านรายชื่อภาษาจาก LOCALES ตัวจริง ไม่ก๊อปมาไว้ในไฟล์นี้
 *    วันที่ใครเพิ่มภาษาที่ 17 ด่านนี้จะตรวจภาษานั้นให้เองทันทีโดยไม่ต้องแก้อะไร
 *
 *   npm run test:i18n
 *   APP_URL=https://... npm run test:i18n
 */
import { chromium, type Page } from 'playwright-core'
import { LOCALES, LOCALE_COOKIE, isRtl, type Locale } from '../lib/i18n/config'
import { th as officeTh } from '../lib/i18n/office-dict/th'
import { th } from '../lib/i18n/dict/th'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = process.env.SHOT_DIR ?? '/tmp/mr-i18n'
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY

/** ภาษาที่ลากไปดูหน้าหลังบ้านด้วย — ★ ไม่ใช่ทั้ง 16 เพราะแต่ละภาษาต้องสมัคร+เข้าห้องใหม่
 *  ar = ภาษาเดียวที่กลับด้าน · de = คำยาวที่สุด · lo = ไฟล์แปลใหญ่ที่สุด (ข้อความยาวสุด) */
const DEEP: Locale[] = ['ar', 'de', 'lo']

/**
 * ★ รายชื่อกุญแจจริง — ดึงจากดิกชันนารีต้นฉบับ ไม่ได้เขียนซ้ำไว้ที่นี่
 *
 * ★★ รวมกุญแจของโมดูลออฟฟิศเข้ามาด้วย ★ สองโมดูลมี provider คนละตัว
 *    แต่ความผิดแบบ "กุญแจหลุดมาแทนข้อความ" เป็นเรื่องเดียวกัน
 *    ★★ ถ้าเอาแต่ของห้องเพลงมาเทียบ กุญแจออฟฟิศที่หลุดจะผ่านด่านไปเงียบ ๆ
 */
const DICT_KEYS = [...Object.keys(th), ...Object.keys(officeTh)]

const WIDE = { width: 1280, height: 900 }
const NARROW = { width: 390, height: 844 }

let pass = 0
let fail = 0
const ok = (m: string) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m: string, d = '') => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? `\n      ${d}` : ''}`) }
const check = (c: boolean, m: string, d = '') => (c ? ok(m) : bad(m, d))

const headers = {
  apikey: SECRET ?? '',
  Authorization: `Bearer ${SECRET ?? ''}`,
  'Content-Type': 'application/json',
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * ตัวหนังสือไทยที่หลุดออกมาบนหน้าภาษาอื่น
 *
 * ★ ข้ามของที่ติดป้าย lang= ไว้เอง — ป้ายในเมนูภาษาเขียนด้วยภาษานั้นเองตั้งใจ
 *   ★★ แต่ต้องไม่นับ <html lang> เป็นป้ายนั้น ไม่งั้นทุกตัวอักษรบนหน้าถูกยกเว้นหมด
 *
 * ★★★ ข้าม dir="auto" ด้วย — นั่นคือเครื่องหมายว่า "ของผู้ใช้ ไม่ใช่ของเรา"
 *
 *     ชื่อห้องที่คนไทยตั้ง กับชื่อเพลงไทยจาก YouTube เป็นภาษาไทยอยู่แล้ว
 *     และต้องเป็นภาษาไทยต่อไปไม่ว่าคนอ่านจะเลือกภาษาอะไร ★ มันไม่ใช่
 *       ข้อความที่ลืมแปล — การนับมันเป็นความผิดคือการตรวจที่ร้องหมาป่าทุกรอบ
 *
 *     ★★ เส้นแบ่งนี้จึงไม่ใช่กติกาของด่าน แต่เป็นกติกาของหน้าเว็บเอง:
 *        ของผู้ใช้ต้องติด dir="auto" อยู่แล้วเพื่อให้ทิศของมันถูก (ดู i18n/config.ts)
 *        ★ ด่านนี้แค่อาศัยเครื่องหมายเดียวกันนั้น — ใครลืมติด จะเจอสองเรื่องพร้อมกัน
 */
async function thaiLeak(p: Page) {
  return p.evaluate(() => {
    const THAI = /[฀-๿]/
    // ★ ตัดก้อนที่ fill() กั้นทิศไว้ทิ้งก่อน — นั่นคือค่าจากตัวแปร ไม่ใช่คำแปล
    const ISOLATED = /⁨[^⁩]*⁩/g
    /*
     * ★★★ ฿ อยู่ในบล็อกยูนิโคดของไทย แต่ไม่ใช่ตัวหนังสือไทย
     *
     *     ★ มันคือเครื่องหมายสกุลเงิน อยู่หมวดเดียวกับ $ และ €
     *       ★★ เงินในระบบนี้เป็นบาททุกบาท ไม่ว่าใครอ่าน — การแปลงเป็น
     *          สกุลอื่นคือการบอกตัวเลขที่ไม่มีใครรับจริง (ดู formatBaht)
     *     ★ ถ้าไม่ตัดออก ด่านจะฟ้องทุกหน้าที่มีเงิน 30 ครั้งต่อรอบ
     *       ★★ ด่านที่ฟ้องของที่ถูกอยู่แล้ว คือด่านที่คนเลิกอ่านผลของมัน
     */
    const BAHT = /฿/g
    const out: string[] = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const text = (node.nodeValue ?? '').replace(ISOLATED, '').replace(BAHT, '').trim()
      if (!text || !THAI.test(text)) continue
      const el = node.parentElement
      if (!el) continue
      if (el.closest('[dir="auto"]')) continue
      const tagged = el.closest('[lang]')
      if (tagged && tagged !== document.documentElement) continue
      if (!el.getClientRects().length) continue
      out.push(text.slice(0, 50))
    }
    return [...new Set(out)].slice(0, 4)
  })
}

/**
 * ชื่อกุญแจที่หลุดมาแทนข้อความ
 *
 * ★ makeTranslator() คืนชื่อกุญแจเมื่อหาไม่เจอทั้งในภาษานั้นและภาษาสำรอง
 *   เช่น "room.actions.skip" ซึ่งไม่มีความหมายกับผู้ใช้คนไหนเลย
 *
 * ★★★ เทียบกับรายชื่อกุญแจจริง ไม่ใช่เดาจากรูปแบบ "a.b.c"
 *
 *     ตอนแรกเขียนเป็น regex จับอะไรที่หน้าตาเหมือนกุญแจ ★ แล้วมันไปจับ
 *       ชื่อช่อง YouTube กับชื่อเพลงบางอันที่บังเอิญมีจุดคั่นไม่มีเว้นวรรค
 *       — ล้มเป็นครั้งคราวตามว่ารอบนั้นสุ่มเพลงอะไรมา
 *
 *     ★★ ด่านที่ล้มไม่ซ้ำเดิมคือด่านที่คนเลิกเชื่อ แล้วสุดท้ายก็เลิกรัน
 *        การถือรายชื่อกุญแจจริงมาเทียบทำให้ไม่มีทางจับผิดตัวได้เลย
 */
async function keyLeak(p: Page, keys: string[]) {
  return p.evaluate((known: string[]) => {
    const set = new Set(known)
    const out: string[] = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const text = (node.nodeValue ?? '').trim()
      if (!text || !set.has(text)) continue
      if (!node.parentElement?.getClientRects().length) continue
      out.push(text)
    }
    return [...new Set(out)].slice(0, 4)
  }, keys)
}

/**
 * หน้าเลื่อนซ้ายขวาได้หรือไม่ — ★ เกณฑ์เดียวกับ mobile-test
 *   ใช้กับทุกภาษาเพราะความยาวข้อความคือสาเหตุอันดับหนึ่งของการล้น:
 *   ปุ่มที่พอดีกับ "ข้าม" ในภาษาไทย ไม่พอดีกับ "Überspringen" ในเยอรมัน
 */
async function overflow(p: Page) {
  return p.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const guilty: string[] = []
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0) return
      if (getComputedStyle(el).position === 'fixed') return
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return
      }
      if (r.right > vw + 1 || r.left < -1) {
        const cls = String(el.className).split(' ').slice(0, 2).join('.')
        guilty.push(`${el.tagName.toLowerCase()}.${cls} [${Math.round(r.left)}→${Math.round(r.right)}]`)
      }
    })
    return {
      px: document.documentElement.scrollWidth - vw,
      vw,
      guilty: [...new Set(guilty)].slice(0, 3),
    }
  })
}

/** เปิดหน้าด้วยภาษาที่กำหนด — ★ ผ่าน cookie เพราะ server อ่านจาก cookie ตัวเดียว */
/*
 * ★★ เพดานเวลาสูงกว่าค่าเริ่มต้นมาก เพราะด่านนี้รันกับ Supabase จริง
 *    ★ เคยล้มกลางคันตอนรอบที่ 13 จาก 16 ภาษา เพราะคำขอหนึ่งใช้ 26 วินาที
 *      (read ETIMEDOUT ฝั่งเครือข่าย ไม่ใช่โค้ดช้า)
 *      ★★ ด่านที่ล้มเพราะเน็ตสะดุด คือด่านที่คนเลิกเชื่อผลของมัน
 */
const NAV_TIMEOUT = 90_000

async function openAs(p: Page, locale: Locale, path = '/') {
  await p.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: APP },
  ])
  await p.goto(`${APP}${path}`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })
}

/** ตรวจชุดเดียวกันทุกที่: ป้ายภาษา ทิศทาง ไทยหลุด กุญแจหลุด ไม่ล้น */
async function audit(p: Page, locale: Locale, where: string) {
  const html = await p.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }))
  const want = isRtl(locale) ? 'rtl' : 'ltr'
  check(html.lang === locale, `${where} · <html lang> = ${locale}`, `ได้ "${html.lang}"`)
  check(html.dir === want, `${where} · <html dir> = ${want}`, `ได้ "${html.dir}"`)

  if (locale !== 'th') {
    const leak = await thaiLeak(p)
    check(leak.length === 0, `${where} · ไม่มีข้อความไทยหลุด`, leak.join(' · '))
  }

  const keys = await keyLeak(p, DICT_KEYS)
  check(keys.length === 0, `${where} · ไม่มีชื่อกุญแจหลุดมาแทนข้อความ`, keys.join(' · '))

  const o = await overflow(p)
  check(o.px <= 0, `${where} · ไม่ล้นแนวนอน (${o.vw}px)`, `ล้น ${o.px}px · ${o.guilty.join(' · ')}`)
}

/**
 * ★★★ ด่านจริงของ RTL: ปุ่มภาษาต้องย้ายฝั่งเอง
 *
 *     มันวางด้วย end-3 ซึ่งแปลว่า "ปลายบรรทัด" ★ ถ้าวันไหนใครแก้กลับเป็น right-3
 *       ค่านี้จะไม่ขยับตอนเป็นอาหรับ — เป็นการตรวจว่าท่อ RTL ทั้งเส้นยังต่อกันอยู่
 *       ตั้งแต่ cookie → dir บน <html> → คลาส logical → ตำแหน่งจริงบนจอ
 */
/**
 * ★★★ เลือกปุ่มภาษาด้วยเมนูข้างใน ไม่ใช่ .first()
 *
 *     ★ หน้าเข้าใช้งานมีปุ่มเมนูสองอันแล้ว (ธีมกับภาษา) ★★ .first() จึง
 *       ไปโดนปุ่มธีม แล้วด่านนับตัวเลือกได้ 3 แทนที่จะเป็น 16 ทั้ง 16 ภาษา
 *     ★ ผูกกับ "เมนูนี้มีกี่ตัวเลือก" ไม่ได้เพราะต้องกดก่อนถึงจะนับได้
 *       ★★ จึงผูกกับ aria-label ของเมนู ซึ่งเป็นของที่คอมโพเนนต์นั้นมีอยู่แล้ว
 */
function langButton(p: Page) {
  return p
    .locator('button[aria-haspopup="menu"]')
    .filter({ has: p.locator('svg, span') })
    .nth(1)
}

async function langButtonSide(p: Page, locale: Locale) {
  const btn = langButton(p)
  if (!(await btn.count())) return bad(`${locale} · หาปุ่มเปลี่ยนภาษาไม่เจอ`)
  const box = await btn.boundingBox()
  const vw = await p.evaluate(() => document.documentElement.clientWidth)
  if (!box) return bad(`${locale} · ปุ่มเปลี่ยนภาษามองไม่เห็น`)
  const mid = box.x + box.width / 2
  if (isRtl(locale)) {
    check(mid < vw / 2, `${locale} · ปุ่มภาษาย้ายไปฝั่งซ้ายตามทิศอาหรับ`, `อยู่ที่ x=${Math.round(mid)} ของ ${vw}px`)
  } else {
    check(mid > vw / 2, `${locale} · ปุ่มภาษาอยู่ฝั่งขวาตามปกติ`, `อยู่ที่ x=${Math.round(mid)} ของ ${vw}px`)
  }
}

/**
 * สมัครบัญชีใหม่ผ่านฟอร์มจริง แล้วคืนชื่อผู้ใช้ไว้ให้ลบทีหลัง
 *
 * ★★★ เคยสมัครด้วยการกรอกแค่ชื่อผู้ใช้ที่หน้าแรก — ท่านั้นไม่มีอีกแล้ว
 *
 *     ★ ตอนเปิดให้ทุกคนสมัครได้ (0043) รหัสผ่านกลายเป็นข้อบังคับของทุกบัญชี
 *       และเส้นทางสมัครแบบไม่มีรหัสผ่านถูกถอดออกทั้งเส้น
 *     ★★ ด่านนี้จึงล้มที่ `waitForSelector('#create')` โดยที่สาเหตุจริง
 *        อยู่ก่อนหน้านั้นหนึ่งก้าว — ฟอร์มไม่ได้ส่งสำเร็จเลยตั้งแต่แรก
 *     ★ ใช้ฟอร์มเดียวกับที่คนจริงใช้ จึงพังพร้อมกับของจริงเสมอ ไม่พังคนละเวลา
 */
async function signUp(p: Page, locale: Locale, tag: string) {
  const username = `i18n${tag}${process.hrtime.bigint() % 100000n}`
  await openAs(p, locale, '/register')
  await p.locator('input[autocomplete="username"]').fill(username)
  const pw = p.locator('input[autocomplete="new-password"]')
  await pw.nth(0).fill('I18nTest123!')
  await pw.nth(1).fill('I18nTest123!')
  /*
   * ★★★ จับจาก data-field ไม่ใช่จาก maxlength
   *
   *     ★ ของเดิมใช้ input[maxlength="40"] ★★ ซึ่งผูกกับกฎการตรวจ ไม่ใช่
   *       กับตัวช่อง — พอเพดานชื่อเล่นถูกแก้เป็น 30 ให้ตรงกับ CHECK
   *       ในฐานข้อมูล ตัวจับก็ตายทันที
   *       ★ ด่านล้มด้วย "locator.fill timeout" ซึ่งอ่านไม่ออกเลยว่าสาเหตุคืออะไร
   *     ★★ data-field เป็นชื่อของช่อง ซึ่งเป็นความหมาย ไม่ใช่รายละเอียดการตรวจ
   */
  await p.locator('[data-field="nickname"] input').fill(`ทดสอบ ${locale}`)
  await p.locator('select').first().selectOption({ index: 1 })
  await p.locator('input[type="checkbox"]').first().check()
  await p.locator('form button[type="submit"]').first().click()
  /* ★ พอร์ทัล /office ถูกยุบ — สมัครเสร็จแล้วไปหน้าแรกของเว็บแทน */
  await p.waitForURL((u) => new URL(u).pathname === '/', { timeout: NAV_TIMEOUT })
  return username
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const cleanup: string[] = []

  try {
    /* ── ด่านที่หนึ่ง: หน้าเข้าใช้งาน ทั้ง 16 ภาษา ──────────────────────
     *
     * ★★ หน้านี้ก่อนอื่นเลย เพราะเป็นหน้าเดียวที่คนยังไม่สมัครได้เห็น
     *    ★ คนที่เปิดมาแล้วอ่านไม่ออกจะติดอยู่ตรงนี้ ถ้าปุ่มเปลี่ยนภาษาพัง
     *      เขาไม่มีทางไปต่อได้เลย — นี่คือจุดที่พังแล้วเสียคนทั้งคน
     */
    console.log(`\n\x1b[1mหน้าเข้าใช้งาน · ${LOCALES.length} ภาษา\x1b[0m`)
    for (const locale of LOCALES) {
      console.log(`\n  \x1b[2m${locale}\x1b[0m`)
      for (const [size, vp] of [['กว้าง', WIDE], ['แคบ', NARROW]] as const) {
        const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 })
        const p = await ctx.newPage()
        p.setDefaultTimeout(NAV_TIMEOUT)
        await openAs(p, locale, '/')
        await audit(p, locale, `${locale}/${size}`)
        if (size === 'กว้าง') {
          await langButtonSide(p, locale)

          // ★ กางเมนูด้วย — 16 แถวสองคอลัมน์คือที่ที่ล้นง่ายที่สุดในหน้านี้
          await langButton(p).click()
          await p.waitForSelector('[role="menu"]')
          await sleep(350)
          const rows = await p.locator('[role="menuitemradio"]').count()
          check(rows === LOCALES.length, `${locale} · เมนูมีครบ ${LOCALES.length} ภาษา`, `เจอ ${rows}`)
          const o = await overflow(p)
          check(o.px <= 0, `${locale} · เมนูภาษากางแล้วไม่ล้น`, `ล้น ${o.px}px · ${o.guilty.join(' · ')}`)
          await p.screenshot({ path: `${SHOTS}/signin-${locale}.png`, fullPage: true })
        }
        await ctx.close()
      }
    }

    /* ── ด่านที่สอง: หลังสมัคร — หน้าแรกและหน้าห้อง ────────────────────
     *
     * ★ ต้องมีกุญแจ Supabase เพราะต้องสมัครจริงและลบทิ้งจริง
     *   ★★ ไม่มีกุญแจก็ยังได้ผลของด่านที่หนึ่งครบ — ข้ามไปเฉย ๆ ดีกว่าล้มทั้งด่าน
     */
    if (!SUPABASE || !SECRET) {
      console.log('\n  \x1b[33m—\x1b[0m ข้ามหน้าหลังสมัคร (ไม่มี NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)')
    } else {
      for (const locale of DEEP) {
        console.log(`\n\x1b[1mหลังสมัคร · ${locale}\x1b[0m`)
        const ctx = await browser.newContext({ viewport: WIDE, deviceScaleFactor: 1 })
        const p = await ctx.newPage()
        p.setDefaultTimeout(NAV_TIMEOUT)

        // ★ ชื่อผู้ใช้ต่างกันทุกภาษา ไม่งั้นรอบที่สองจะชนกับรอบแรกที่ยังไม่ถูกลบ
        cleanup.push(await signUp(p, locale, locale))
        /* ★ สมัครเสร็จจะอยู่ที่พอร์ทัลออฟฟิศ — ด่านนี้ตรวจหน้าแรกของห้องเพลง */
        await openAs(p, locale, '/')
        await sleep(800)

        await audit(p, locale, `${locale}/หน้าแรก`)
        await p.screenshot({ path: `${SHOTS}/home-${locale}.png`, fullPage: true })

        // ★ แถบบนคือที่ที่คำยาวชนกันแน่นที่สุด — บีบเป็นมือถือแล้วตรวจอีกรอบ
        await p.setViewportSize(NARROW)
        await sleep(400)
        await audit(p, locale, `${locale}/หน้าแรกแคบ`)
        await p.setViewportSize(WIDE)

        /* ── หน้าห้อง ──
         * ★★ กล่องสร้างห้องอยู่ที่ /music ไม่ใช่หน้าแรกอีกแล้ว
         *    ★ หน้าแรกถูกยกใหม่เป็นหน้าแนะนำระบบ แล้วของที่ต้องกดจริง
         *      ย้ายไปหน้าของห้องเพลงโดยเฉพาะ — ด่านนี้เคยค้างที่ #create
         *      ซึ่งไม่มีอยู่บนหน้าแรกอีกต่อไป
         */
        await openAs(p, locale, '/music')
        await p.waitForSelector('#create', { timeout: NAV_TIMEOUT })
        await audit(p, locale, `${locale}/ห้องเพลง`)

        // ★ ปุ่มสร้างห้องกดไม่ได้จนกว่าจะมีชื่อห้อง — ตั้งใจให้เป็นอย่างนั้น
        await p.locator('#create input').first().fill(`ห้อง ${locale}`)
        await p.locator('#create button[type="submit"]').first().click()
        /*
         * ★★★ มีกล่องยืนยันคั่นก่อนสร้างห้องจริงแล้ว
         *
         *     ★ ไม่กดยืนยัน = ไม่มีคำขอออกไปเลยสักอัน ★★ ด่านจะค้างที่
         *       waitForURL จนหมดเวลา แล้วรายงานว่า "fill timeout"
         *       ซึ่งอ่านไม่ออกว่าสาเหตุคืออะไร
         *     ★ จับจาก role="alertdialog" + .cfm-ok ไม่ใช่จากข้อความบนปุ่ม
         *       ★★ ข้อความเปลี่ยนตามภาษา และด่านนี้รันทั้ง 16 ภาษา
         */
        await p.locator('[role="alertdialog"] .cfm-ok').click({ timeout: NAV_TIMEOUT })
        await p.waitForURL(/\/room\/[A-Za-z0-9]+/, { timeout: NAV_TIMEOUT })
        await sleep(3_000)
        await audit(p, locale, `${locale}/หน้าห้อง`)
        await p.screenshot({ path: `${SHOTS}/room-${locale}.png`, fullPage: true })

        await p.setViewportSize(NARROW)
        await sleep(600)
        await audit(p, locale, `${locale}/หน้าห้องแคบ`)
        await p.screenshot({ path: `${SHOTS}/room-${locale}-narrow.png`, fullPage: true })

        // ── ลอบบี้ ──
        // ★ หน้านี้วาดด้วย canvas เป็นหลัก แต่ปุ่มที่ลอยทับอยู่เป็น HTML ปกติ
        //   ซึ่งต้องย้ายฝั่งตาม dir เหมือนที่อื่น
        await p.setViewportSize(WIDE)
        await openAs(p, locale, '/lobby')
        await sleep(2_000)
        await audit(p, locale, `${locale}/ลอบบี้`)
        await p.screenshot({ path: `${SHOTS}/lobby-${locale}.png` })

        await ctx.close()
      }

      /* ── ด่านที่สาม: โมดูลออฟฟิศ ทั้ง 16 ภาษา ────────────────────────
       *
       * ★★★ ภาษาเดียวบัญชีเดียว แต่วน 16 ภาษาบนบัญชีนั้น
       *
       *     ★ ภาษามาจาก cookie ไม่ได้ผูกกับบัญชี ★★ จึงไม่ต้องสมัคร 16 ครั้ง
       *       เหมือนด่านห้องเพลงที่ต้องสร้างห้องจริงต่างหากในแต่ละภาษา
       *     ★ ได้ความครอบคลุมเท่าเดิมด้วยเวลาหนึ่งในสิบหก
       *
       * ★★ หน้าที่เลือกมาคือหน้าที่มีของที่พังได้ต่างกัน:
       *    ★ พอร์ทัล = ป้ายสรุปที่มีตัวเลขแทรกในประโยค
       *    ★ แชท = คำว่า "กำลังพิมพ์" ที่มีทั้งแบบ 1 · 2 · หลายคน
       *    ★ ยอดค้าง/สร้างรายการ = ตัวเลขเงินกับ ฿ ซึ่งไม่แปลแต่จัดรูปตามภาษา
       *    ★ สุ่มทีม = ชื่อทีมที่มาจากกุญแจเดียวคั่นด้วย ·
       *    ★ สมัครสมาชิก = หน้าเดียวที่อยู่นอก /office แต่ใช้ดิกชันนารีออฟฟิศ
       */
      console.log(`\n\x1b[1mโมดูลออฟฟิศ · ${LOCALES.length} ภาษา\x1b[0m`)
      {
        const ctx = await browser.newContext({ viewport: WIDE, deviceScaleFactor: 1 })
        const p = await ctx.newPage()
        p.setDefaultTimeout(NAV_TIMEOUT)
        cleanup.push(await signUp(p, 'th', 'off'))

        const OFFICE_PAGES: [string, string][] = [
          ['พอร์ทัล', '/office'],
          ['แชท', '/office/chat'],
          ['ยอดค้าง', '/office/wallet/owed'],
          ['สร้างรายการ', '/office/wallet/create'],
          ['ตลาดนัด', '/office/market'],
          ['สุ่มทีม', '/office/fun/team'],
          ['โปรไฟล์', '/office/profile'],
        ]

        for (const locale of LOCALES) {
          console.log(`\n  \x1b[2m${locale}\x1b[0m`)
          for (const [label, path] of OFFICE_PAGES) {
            await openAs(p, locale, path)
            await sleep(1_200)
            await audit(p, locale, `${locale}/${label}`)
          }
          if (locale === 'ar' || locale === 'th') {
            await p.screenshot({ path: `${SHOTS}/office-${locale}.png`, fullPage: true })
          }
        }

        /* ★ หน้าสมัครต้องออกจากระบบก่อน ไม่งั้นมันเด้งไป /office */
        await ctx.clearCookies()
        for (const locale of LOCALES) {
          await openAs(p, locale, '/register')
          await sleep(900)
          await audit(p, locale, `${locale}/สมัครสมาชิก`)
        }
        await ctx.close()
      }
    }
  } catch (error) {
    bad('ล้มกลางคัน', error instanceof Error ? error.message : String(error))
  } finally {
    /* ★ ลบคนที่สมัครไว้ทุกคน — ห้องและสมาชิกตามไปด้วยผ่าน cascade */
    if (SUPABASE && SECRET) {
      for (const username of cleanup) {
        const rows = (await fetch(
          `${SUPABASE}/rest/v1/profiles?username=eq.${username}&select=id`,
          { headers },
        ).then((r) => r.json())) as { id: string }[]
        for (const row of rows) {
          await fetch(`${SUPABASE}/auth/v1/admin/users/${row.id}`, { method: 'DELETE', headers })
        }
      }
    }
    await browser.close()
  }

  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}`)
  console.log(`  ภาพ: ${SHOTS}/\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
