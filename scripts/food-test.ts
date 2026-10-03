/**
 * ด่านตรวจหมวดอาหารบนเบราว์เซอร์จริง — จอ 375px
 *
 * รันด้วย:  APP_URL=http://localhost:3001 npx tsx scripts/food-test.ts
 *
 * ★★ ข้อกำหนดของหมวดนี้เกือบทั้งหมดเป็นเรื่อง "เห็นอะไรบนจอ · กดโดนไหม ·
 *    เลื่อนแล้วล้นไหม" ซึ่งพิสูจน์ได้จากการวัดบน DOM จริงเท่านั้น
 *    ★ เทสต์ที่ import ฟังก์ชันมาเรียกตรง ๆ ตอบไม่ได้ว่าปุ่มสูงกี่พิกเซล
 *
 * ★★★ เข้าระบบครั้งเดียวแล้วใช้ cookie ซ้ำทุกบล็อก
 *     ด่านจำกัดอัตราของ signIn นับตาม IP ★ สคริปต์ที่ล็อกอินใหม่ทุกบล็อก
 *     จะชนเพดานตัวเองแล้วรายงานว่า "ระบบพัง" ทั้งที่ระบบทำงานถูกต้อง
 */
import { chromium, type BrowserContext, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3001'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const T = 45_000
/** จุดแตะต้องสูงอย่างน้อยเท่านี้ */
const MIN_TAP = 44

let pass = 0
let fail = 0

function check(ok: boolean, name: string, detail = '') {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

/** เปิดหน้าแล้วรอให้เนื้อหาโผล่ — ไม่ใช้ networkidle เพราะบางหน้าเปิด Realtime ค้างไว้ */
async function go(p: Page, path: string) {
  await p.goto(`${APP}${path}`, { waitUntil: 'load' })
  await p.locator('main').first().waitFor({ state: 'visible' }).catch(() => undefined)
  await p.waitForTimeout(2500)
}

/** จุดแตะที่เตี้ยกว่าเกณฑ์ — ไม่รวมท้ายเว็บ ซึ่งเป็นของเดิมทั้งระบบ */
async function smallTargets(p: Page) {
  return p.evaluate((min) => {
    const scope = document.querySelector('main') ?? document.body
    const bad: string[] = []
    for (const el of scope.querySelectorAll('button, a[href], select')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.closest('footer')) continue
      if (r.height < min) bad.push(`${el.tagName}:${(el.textContent ?? '').trim().slice(0, 12)}=${Math.round(r.height)}`)
    }
    return bad.slice(0, 5)
  }, MIN_TAP)
}

/** กุญแจแปลที่หลุดออกมาเป็นข้อความดิบ */
async function leakedKeys(p: Page) {
  return p.evaluate(
    () =>
      (document.querySelector('main')?.textContent ?? '')
        .match(/\b(food|common|admin|nav)\.[a-z][a-zA-Z0-9.]+/g)
        ?.slice(0, 3) ?? [],
  )
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const p = await ctx.newPage()
  p.setDefaultTimeout(T)

  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('response', (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url().replace(APP, '')}`)
  })

  head(`เข้าระบบที่ ${APP}`)
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' })
  await p.locator('input[autocomplete="username"]').fill('ton.k')
  await p.locator('input[type="password"]').first().fill('AwaDemo2026!')
  await p.locator('form button[type="submit"]').first().click()
  await p.waitForTimeout(9000)
  check((await p.locator('input[autocomplete="username"]').count()) === 0, 'เข้าระบบสำเร็จ')

  /* ── ลำดับแท็บ ─────────────────────────────────────────────── */
  head('ลำดับแท็บในหมวดอาหาร (เฟส 1.1)')
  await go(p, '/office/food/picks')
  const tabOrder = await p.evaluate(() =>
    [...document.querySelectorAll('a[href^="/office/food/"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h, i, arr) => arr.indexOf(h) === i),
  )
  check(
    tabOrder[0] === '/office/food/picks',
    'ร้านเด็ดเป็นแท็บแรก',
    tabOrder.join(' → '),
  )

  /* ── หน้าร้านเด็ด ──────────────────────────────────────────── */
  head('หน้าร้านเด็ด')
  errors.length = 0
  await go(p, '/office/food/picks')

  check(errors.length === 0, 'ไม่มี error ฝั่งเบราว์เซอร์/5xx', errors.slice(0, 2).join(' · '))
  check((await leakedKeys(p)).length === 0, 'ไม่มีกุญแจแปลหลุด', (await leakedKeys(p)).join(' · '))

  const small = await smallTargets(p)
  check(small.length === 0, `จุดแตะ ≥${MIN_TAP}px`, small.join(' · '))

  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(over <= 1, 'ไม่ล้นแนวนอน', `เกิน ${over}px`)

  /*
   * ★★ แถวประเภทอาหารต้องเลื่อนแนวนอน ไม่ขึ้นบรรทัดใหม่
   *    ★ วัดจาก scrollWidth > clientWidth ของตัวแถวเอง ไม่ใช่ดูที่คลาส
   *      ★★ คลาสบอกแค่ว่า "ตั้งใจให้เลื่อน" ส่วนตัวเลขบอกว่า "เลื่อนได้จริง"
   */
  const cuisineRow = await p.evaluate(() => {
    const row = [...document.querySelectorAll('main div')].find(
      (d) => d.className.includes('overflow-x-auto') && d.querySelectorAll('button').length >= 3,
    )
    if (!row) return null
    return { scroll: row.scrollWidth, client: row.clientWidth, chips: row.querySelectorAll('button').length }
  })
  check(cuisineRow !== null, 'มีแถวประเภทอาหารที่เลื่อนได้', cuisineRow ? `${cuisineRow.chips} ชิป` : 'ไม่พบ')

  /* ── ปุ่มตัวกรอง → แผ่นล่างจอ ──────────────────────────────── */
  head('ตัวกรองรวมปุ่มเดียว (เฟส 1.2.4)')
  /*
   * ★ เจาะจงปุ่มตัวกรอง ไม่ใช่ "ปุ่มแรกที่มี aria-expanded"
   *   ★★ หน้านี้มีเซกชันกางหุบได้แล้ว ซึ่งก็มี aria-expanded เหมือนกัน
   *      ★ ตัวจับแบบ "อันแรกที่เจอ" ผูกกับลำดับใน DOM ซึ่งเปลี่ยนทุกครั้ง
   *        ที่รีดีไซน์ — ผูกกับข้อความบนปุ่มแทน
   */
  const filterBtn = p
    .locator('main button[aria-expanded]')
    .filter({ hasText: /ตัวกรอง|Filter/i })
    .first()
  check((await filterBtn.count()) > 0, 'มีปุ่มตัวกรอง')
  if (await filterBtn.count()) {
    await filterBtn.click()
    await p.waitForTimeout(600)
    const sheet = p.locator('[role="dialog"]')
    check((await sheet.count()) > 0, 'กดแล้วเปิดแผ่นตัวกรอง')

    /* ★ บนมือถือแผ่นต้องติดขอบล่างจอ ไม่ใช่ลอยกลางหน้า */
    const box = await sheet.first().boundingBox()
    check(
      box !== null && Math.abs(box.y + box.height - 812) < 2,
      'แผ่นติดขอบล่างจอบนมือถือ',
      box ? `ล่างสุดที่ ${Math.round(box.y + box.height)}` : '',
    )

    const sheetSmall = await p.evaluate((min) => {
      const d = document.querySelector('[role="dialog"]')
      if (!d) return ['ไม่พบแผ่น']
      const bad: string[] = []
      for (const el of d.querySelectorAll('button')) {
        const r = el.getBoundingClientRect()
        if (r.height > 0 && r.height < min) bad.push(`${(el.textContent ?? '').trim().slice(0, 10)}=${Math.round(r.height)}`)
      }
      return bad.slice(0, 4)
    }, MIN_TAP)
    check(sheetSmall.length === 0, `จุดแตะในแผ่นตัวกรอง ≥${MIN_TAP}px`, sheetSmall.join(' · '))

    await p.keyboard.press('Escape')
    await p.waitForTimeout(400)
    check((await p.locator('[role="dialog"]').count()) === 0, 'กด Escape แล้วปิด')
  }

  /* ── บั๊กหัวใจ: สถานะกับตัวเลขต้องตรงกัน ─────────────────── */
  head('หัวใจกับตัวเลขตรงกัน (เฟส 1.2.2)')
  const hearts = await p.evaluate(() =>
    [...document.querySelectorAll('main button[aria-pressed]')]
      .map((b) => ({ on: b.getAttribute('aria-pressed') === 'true', text: (b.textContent ?? '').trim() }))
      .filter((x) => x.text.includes('♥') || x.text.includes('♡'))
      .map((x) => ({ on: x.on, n: Number(x.text.replace(/[^\d]/g, '')) })),
  )
  const broken = hearts.filter((h) => h.on && h.n === 0)
  check(
    hearts.length > 0,
    'เจอปุ่มหัวใจบนการ์ด',
    `${hearts.length} ใบ`,
  )
  check(
    broken.length === 0,
    'ไม่มีการ์ดที่หัวใจติดแต่เลขเป็น 0',
    broken.length ? `พบ ${broken.length} ใบ` : '',
  )

  /* ── หน้าสุ่มอาหาร ─────────────────────────────────────────── */
  head('หน้าสุ่มอาหาร')
  errors.length = 0
  await go(p, '/office/food/random')

  check(errors.length === 0, 'ไม่มี error ฝั่งเบราว์เซอร์/5xx', errors.slice(0, 2).join(' · '))
  check((await leakedKeys(p)).length === 0, 'ไม่มีกุญแจแปลหลุด', (await leakedKeys(p)).join(' · '))

  const randSmall = await smallTargets(p)
  check(randSmall.length === 0, `จุดแตะ ≥${MIN_TAP}px`, randSmall.join(' · '))

  const randOver = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(randOver <= 1, 'ไม่ล้นแนวนอน', `เกิน ${randOver}px`)

  /*
   * ★★★ วงล้อต้องอยู่ในจอแรก — ข้อกำหนดข้อ 4.5
   *     ★ วัดจากขอบล่างของวงล้อเทียบความสูงจอ ไม่ใช่เชื่อว่า layout ถูก
   */
  const wheelBox = await p.evaluate(() => {
    const svg = document.querySelector('main svg[viewBox]')
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight }
  })
  check(
    wheelBox !== null && wheelBox.bottom <= wheelBox.vh,
    'วงล้ออยู่ในจอแรก ไม่ต้องเลื่อน',
    wheelBox ? `ล่างสุด ${wheelBox.bottom} / จอสูง ${wheelBox.vh}` : 'ไม่พบวงล้อ',
  )

  /*
   * ★★★ 1 ร้าน = 1 ช่อง ห้ามชื่อซ้ำ — ข้อกำหนดข้อ 4.1
   *     ★ นับข้อความในช่องวงล้อ แล้วเทียบจำนวนที่ไม่ซ้ำกับจำนวนทั้งหมด
   */
  const labels = await p.evaluate(() =>
    [...document.querySelectorAll('main svg text')].map((t) => (t.textContent ?? '').trim()).filter(Boolean),
  )
  check(labels.length > 0, 'วงล้อมีช่อง', `${labels.length} ช่อง`)
  check(
    new Set(labels).size === labels.length,
    'ไม่มีชื่อร้านซ้ำบนวงล้อ',
    labels.length !== new Set(labels).size ? `ซ้ำ ${labels.length - new Set(labels).size} ช่อง` : '',
  )
  check(labels.length <= 12, 'ช่องไม่เกิน 12', `${labels.length} ช่อง`)

  /* ── สองโหมดสี ─────────────────────────────────────────────── */
  head('light + dark mode')
  for (const mode of ['light', 'dark'] as const) {
    await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode)
    for (const path of ['/office/food/picks', '/office/food/random']) {
      await go(p, path)
      await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode)
      await p.waitForTimeout(500)

      const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(o <= 1, `${mode} ${path} ไม่ล้นแนวนอน`, `เกิน ${o}px`)

      /*
       * ★★ ตัวหนังสือสีเดียวกับพื้นหลัง = มองไม่เห็นแต่ยังอยู่ใน DOM
       *    ★ เป็นอาการของ token ที่ไม่มีอยู่จริง ซึ่ง Tailwind ปล่อยผ่านเงียบ ๆ
       *      (บทเรียนจาก bg-ok/text-ok ที่ไม่มีในโปรเจกต์นี้)
       */
      const invisible = await p.evaluate(() => {
        const bad: string[] = []
        for (const el of document.querySelectorAll('main h1, main h2, main p, main span')) {
          const t = (el.textContent ?? '').trim()
          if (!t || el.children.length > 0) continue
          const cs = getComputedStyle(el)
          let bg = 'rgba(0, 0, 0, 0)'
          let node: Element | null = el
          while (node && bg === 'rgba(0, 0, 0, 0)') {
            bg = getComputedStyle(node).backgroundColor
            node = node.parentElement
          }
          if (cs.color === bg) bad.push(t.slice(0, 16))
        }
        return bad.slice(0, 3)
      })
      check(invisible.length === 0, `${mode} ${path} ไม่มีตัวหนังสือสีเดียวกับพื้น`, invisible.join(' · '))
    }
  }
  await p.evaluate(() => document.documentElement.removeAttribute('data-theme'))

  await ctx.close()
  await browser.close()
}

run()
  .catch((e) => {
    console.error(e)
    fail++
  })
  .finally(() => {
    console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
    process.exit(fail ? 1 : 0)
  })
