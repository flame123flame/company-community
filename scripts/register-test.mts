/**
 * ชุดทดสอบหน้าสมัครสมาชิก
 *
 * รันด้วย:  npm run test:register
 *
 * ★★★ ทดสอบบนเบราว์เซอร์จริง ไม่ใช่เรียกฟังก์ชันตรวจตรง ๆ
 *
 *     ★ บั๊กที่ใหญ่ที่สุดของหน้านี้ไม่ได้อยู่ในตรรกะการตรวจ —
 *       ตรรกะถูกต้องมาตลอด แต่ `required` ของเบราว์เซอร์บล็อกการส่งฟอร์ม
 *       ก่อน onSubmit ของเราจะทำงาน ★★ ข้อความแดงจึงไม่มีวันขึ้น
 *       ★ unit test ของฟังก์ชันตรวจจะผ่านหมดโดยไม่เจออะไรเลย
 *
 * ★★ เก็บกวาดบัญชีทดสอบทุกครั้ง — ไม่งั้นรันสิบรอบได้ผู้ใช้ปลอมสิบคน
 */
import { chromium, type Page } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const APP = 'http://localhost:3000'
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

let pass = 0, fail = 0
const check = (ok: boolean, name: string, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}

const b = await chromium.launch({ executablePath: CHROME, headless: true })

async function open(): Promise<Page> {
  const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage()
  p.setDefaultTimeout(40_000)
  await p.goto(`${APP}/register`, { waitUntil: 'networkidle' })
  return p
}

/* ── 1 · ปุ่มกดได้เสมอ และกดแล้วขึ้นแดง ─────────────────────── */
console.log('\n\x1b[1mฟอร์มเปล่า: ปุ่มต้องกดได้ และกดแล้วต้องบอกว่าขาดอะไร\x1b[0m')
{
  const p = await open()
  const btn = p.locator('form button[type="submit"]')
  check(await btn.isEnabled(), 'ปุ่มสมัครกดได้ตั้งแต่ฟอร์มยังเปล่า')
  await btn.click()
  await p.waitForTimeout(900)
  const alerts = await p.locator('[role="alert"]').count()
  check(alerts >= 4, 'กดแล้วขึ้นข้อความแดงหลายช่อง', `${alerts} ข้อความ`)
  const url = new URL(p.url()).pathname
  check(url === '/register', 'ยังอยู่หน้าเดิม ไม่ส่งข้อมูลไป', url)
  await p.close()
}

/* ── 2 · กติกาชื่อผู้ใช้ ──────────────────────────────────────── */
console.log('\n\x1b[1mชื่อผู้ใช้\x1b[0m')
const cases: [string, boolean, string][] = [
  ['ab', false, 'สั้นกว่า 3 ตัว'],
  ['abc', true, '3 ตัวพอดี ไม่มีตัวเลข'],
  ['my-name', true, 'มีขีดกลาง'],
  ['My.Name', true, 'ตัวพิมพ์ใหญ่'],
  ['a_b.c-9', true, 'ครบทุกอักขระที่อนุญาต'],
  ['สมชาย', false, 'ภาษาไทย (ล็อกอินรับไม่ได้)'],
  ['my name', false, 'มีช่องว่าง'],
]
{
  const p = await open()
  for (const [value, want, label] of cases) {
    await p.locator('input[autocomplete="username"]').fill(value)
    await p.locator('input[autocomplete="username"]').blur()
    await p.waitForTimeout(350)
    const bad = await p.locator('[data-field="username"] [role="alert"]').count()
    check((bad === 0) === want, `${JSON.stringify(value)} — ${label}`, want ? 'ต้องผ่าน' : 'ต้องไม่ผ่าน')
  }
  await p.close()
}

/* ── 3 · เพดานที่เคยผ่านหน้าเว็บแล้วตายที่ฐานข้อมูล ───────────── */
console.log('\n\x1b[1mช่องที่เคยผ่านหน้าเว็บแล้วไปตายที่ฐานข้อมูล\x1b[0m')
{
  const p = await open()
  const nick = p.locator('[data-field="nickname"] input')
  await nick.fill('ก'.repeat(40))
  check((await nick.inputValue()).length === 30, 'ชื่อเล่นพิมพ์ได้ไม่เกิน 30 ตัว', `${(await nick.inputValue()).length} ตัว`)

  const phone = p.locator('[data-field="phone"] input')
  await phone.fill('0812')
  await phone.blur()
  await p.waitForTimeout(350)
  check((await p.locator('[data-field="phone"] [role="alert"]').count()) > 0, 'เบอร์ 4 หลักถูกเตือน')
  await phone.fill('0812345678')
  await phone.blur()
  await p.waitForTimeout(350)
  check((await p.locator('[data-field="phone"] [role="alert"]').count()) === 0, 'เบอร์ 10 หลักผ่าน')
  await p.close()
}

/* ── 4 · สมัครจริงด้วยชื่อที่เพิ่งอนุญาต ──────────────────────── */
console.log('\n\x1b[1mสมัครจริงด้วยชื่อที่มีขีดกลาง ไม่มีตัวเลข\x1b[0m')
const UNAME = `tst-reg.${process.pid % 1000}`
{
  const p = await open()
  await p.locator('input[autocomplete="username"]').fill(UNAME)
  await p.locator('input[autocomplete="new-password"]').nth(0).fill('RegTest123!')
  await p.locator('input[autocomplete="new-password"]').nth(1).fill('RegTest123!')
  await p.locator('[data-field="nickname"] input').fill('ทดสอบสมัคร')
  await p.locator('select').first().selectOption({ index: 1 })
  await p.locator('input[type="checkbox"]').first().check()
  await p.locator('form button[type="submit"]').click()
  await p.waitForTimeout(12_000)
  const path = new URL(p.url()).pathname
  check(path === '/', 'สมัครสำเร็จแล้วเด้งเข้าหน้าแรก', path)
  const { data } = await db.from('profiles').select('username, nickname').eq('username', UNAME).maybeSingle()
  check(Boolean(data), 'มีแถวในฐานข้อมูล', data ? `${data.username} · ${data.nickname}` : 'ไม่พบ')
  if (data) {
    const { data: au } = await db.auth.admin.listUsers()
    const hit = au.users.find((u) => u.email === `${UNAME}@frameroom.invalid`)
    if (hit) await db.auth.admin.deleteUser(hit.id)
    console.log('  เก็บกวาดบัญชีทดสอบแล้ว')
  }
  await p.close()
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
await b.close()
