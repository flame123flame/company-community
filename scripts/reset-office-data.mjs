/**
 * ล้างข้อมูลทดสอบของ "ระบบกิจกรรมออฟฟิศ" อย่างเดียว ก่อนเปิดใช้จริง
 *
 * ใช้:
 *   node scripts/reset-office-data.mjs         → นับให้ดูเฉย ๆ ไม่ลบอะไร
 *   node scripts/reset-office-data.mjs --yes   → ลบจริง (ต้องพิมพ์ยืนยันอีกชั้น)
 *
 * ★★★ ทำไมต้องเขียนตัวใหม่ ทั้งที่มี scripts/reset-data.mjs อยู่แล้ว
 *
 *     ตัวเดิมล้างตารางของ "ห้องฟังเพลง" (rooms · queue_items · chat_messages …)
 *     พร้อมลบ auth.users ทั้งหมด ★ ซึ่งตรงข้ามกับสิ่งที่ต้องการที่นี่เป๊ะ ๆ
 *     ★★ ข้อกำหนดของงานนี้คือ "ของเดิมต้องทำงานได้เหมือนเดิมทุกอย่าง"
 *        การรันตัวเดิมเพื่อล้างข้อมูลออฟฟิศจะพังห้องเพลงทั้งระบบและลบบัญชีทุกคน
 *
 *     ★ ไฟล์นี้จึงระบุตารางของออฟฟิศไว้ชัด ๆ และ ★★ ไม่แตะ auth.users
 *       ไม่แตะ profiles ไม่แตะตารางห้องเพลงแม้แต่ตารางเดียว
 *
 * ★★ ไม่ลบ employee_codes และ app_settings
 *    ★ รหัสพนักงานคือของจริงที่ผู้ดูแลใส่ไว้ ไม่ใช่ข้อมูลทดสอบ — ลบแล้ว
 *      พนักงานผูกรหัสไม่ได้ทั้งบริษัทในวันเปิดใช้
 *    ★ app_settings คือค่าตั้งของระบบ (รอบทวง · เกณฑ์ซ่อน) ไม่ใช่ข้อมูลผู้ใช้
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

function loadEnv() {
  let raw = ''
  for (const f of ['.env.local', '.env']) {
    try {
      raw = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      break
    } catch {
      /* ไฟล์ถัดไป */
    }
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !KEY) {
  console.error('✗ ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SECRET_KEY ใน .env.local')
  process.exit(1)
}

/*
 * ★★★ กันยิงผิดโปรเจกต์
 *
 *     โปรเจกต์เก่า vackilhpblpkfzonlodl เป็นของอีกแอปที่ห้ามแตะเด็ดขาด
 *     ★ สคริปต์ลบข้อมูลที่ไม่ตรวจว่ากำลังคุยกับฐานไหนคือสคริปต์ที่รอวันพลาด
 */
const FORBIDDEN = 'vackilhpblpkfzonlodl'
if (URL_.includes(FORBIDDEN)) {
  console.error(`✗ หยุด — URL ชี้ไปโปรเจกต์เก่า (${FORBIDDEN}) ซึ่งเป็นของอีกแอป ห้ามแตะ`)
  process.exit(1)
}

const APPLY = process.argv.includes('--yes')

const db = createClient(URL_, KEY, { auth: { persistSession: false } })

/**
 * ตารางของออฟฟิศ เรียงจาก "ลูก" ไป "แม่"
 *
 * ★ ลบเองทีละชั้นแม้จะมี cascade อยู่แล้ว — ไม่งั้นตัวเลขที่รายงานจะโกหก
 *   เพราะแถวลูกหายไปพร้อมแม่ตั้งแต่ก่อนถึงคิวของมัน
 */
const TABLES = [
  /* แชทออฟฟิศ */
  'office_chat_messages',
  'office_chat_members',
  'office_chat_rooms',
  /* ตลาดนัด */
  'listing_messages',
  'listing_threads',
  'listing_reservations',
  'listing_images',
  'listings',
  'search_alerts',
  /* กระเป๋าเงิน */
  'debts',
  'expense_bills',
  /* สุ่มและเกม */
  'tournament_matches',
  'tournament_teams',
  'tournaments',
  'draw_room_members',
  'draw_rooms',
  'lottery_picks',
  'name_sets',
  /* กินอะไรดี */
  'restaurant_visits',
  'restaurant_votes',
  'restaurants',
  /* ทั่วไป */
  'content_reports',
  'notifications',
  'audit_log',
]

/** ถังไฟล์ของโมดูลออฟฟิศเท่านั้น — avatars/chat-images/stickers เป็นของห้องเพลง */
const BUCKETS = ['listings', 'chat-files', 'receipts', 'slips', 'payment-qr']

/** ไม่แตะ — แสดงให้เห็นว่าตั้งใจเว้น ไม่ใช่ลืม */
const KEPT = [
  ['employee_codes', 'รหัสพนักงานของจริง ลบแล้วผูกรหัสไม่ได้ทั้งบริษัท'],
  ['profiles', 'บัญชีผู้ใช้ ใช้ร่วมกับห้องฟังเพลง'],
  ['app_settings', 'ค่าตั้งของระบบ ไม่ใช่ข้อมูลผู้ใช้'],
  ['notification_prefs', 'ค่าตั้งการแจ้งเตือนรายคน'],
]

const n = (v) => new Intl.NumberFormat('en').format(v ?? 0)

async function countRows(table) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) return { count: null, error: error.message }
  return { count: count ?? 0 }
}

async function countFiles(bucket) {
  let total = 0
  const walk = async (prefix) => {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error || !data) return
    for (const item of data) {
      /* ★ โฟลเดอร์ใน Supabase Storage ไม่มี id — ใช้ตรงนี้แยกไฟล์ออกจากโฟลเดอร์ */
      if (item.id) total += 1
      else await walk(prefix ? `${prefix}/${item.name}` : item.name)
    }
  }
  await walk('')
  return total
}

async function emptyBucket(bucket) {
  let removed = 0
  const walk = async (prefix) => {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error || !data) return
    const files = []
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) files.push(path)
      else await walk(path)
    }
    /* ★ ลบทีละ 100 — ส่งพันไฟล์ในคำขอเดียวโดนปฏิเสธทั้งก้อน */
    for (let i = 0; i < files.length; i += 100) {
      const chunk = files.slice(i, i + 100)
      const { error: rmError } = await db.storage.from(bucket).remove(chunk)
      if (!rmError) removed += chunk.length
    }
  }
  await walk('')
  return removed
}

/* ══ 1. รายงานก่อนเสมอ ═══════════════════════════════════════════════════ */

console.log('\n  โปรเจกต์:', URL_)
console.log('  ขอบเขต: เฉพาะโมดูลออฟฟิศ — ห้องฟังเพลงและบัญชีผู้ใช้ไม่ถูกแตะ')
console.log('  โหมด:', APPLY ? '★ ลบจริง' : 'นับให้ดูเฉย ๆ (ยังไม่ลบ)')

console.log('\n  ── ตารางที่จะล้าง ──')
let totalRows = 0
for (const table of TABLES) {
  const { count, error } = await countRows(table)
  if (!error) totalRows += count
  console.log(`    ${table.padEnd(24)} ${error ? '— ' + error : n(count) + ' แถว'}`)
}

console.log('\n  ── ไฟล์ที่จะลบ ──')
let totalFiles = 0
for (const bucket of BUCKETS) {
  const c = await countFiles(bucket)
  totalFiles += c
  console.log(`    ${bucket.padEnd(24)} ${n(c)} ไฟล์`)
}

console.log('\n  ── ไม่แตะ ──')
for (const [table, why] of KEPT) {
  const { count, error } = await countRows(table)
  console.log(`    ${table.padEnd(24)} ${error ? '—' : n(count).padStart(5)} — ${why}`)
}

console.log(`\n  รวมที่จะลบ: ${n(totalRows)} แถว · ${n(totalFiles)} ไฟล์`)

if (!APPLY) {
  console.log('\n  ยังไม่ได้ลบอะไรเลย')
  console.log('  ถ้าตัวเลขข้างบนถูกต้องแล้ว สั่งอีกครั้งด้วย:  node scripts/reset-office-data.mjs --yes\n')
  process.exit(0)
}

/* ══ 2. ถามยืนยันด้วยการพิมพ์ ═══════════════════════════════════════════
 * ★★ ให้พิมพ์ "ลบ" ไม่ใช่กด y — y เป็นนิสัย มือกดไปก่อนตาอ่านเสมอ
 */
const rl = createInterface({ input: process.stdin, output: process.stdout })
console.log('\n  ★ ลบแล้วกู้คืนไม่ได้ — Supabase ไม่มีถังขยะให้ undelete')
const answer = await rl.question('  พิมพ์ "ลบ" เพื่อยืนยัน: ')
rl.close()

if (answer.trim() !== 'ลบ') {
  console.log('\n  ยกเลิก ไม่ได้ลบอะไรเลย\n')
  process.exit(0)
}

/* ══ 3. ลบจริง ══════════════════════════════════════════════════════════ */

console.log('\n  ── กำลังลบ ──')
for (const table of TABLES) {
  const before = await countRows(table)
  if (before.error) {
    console.log(`    ${table.padEnd(24)} ข้าม — ${before.error}`)
    continue
  }
  /*
   * ★★★ ห้ามเดาชื่อคอลัมน์ — อ่านจากแถวจริงแทน
   *
   *     ★ เดารอบแรกว่าทุกตารางมี id → ล้มห้าตาราง (ตารางเชื่อมใช้ primary key
   *       แบบคู่) ★ เดารอบสองว่าทุกตารางมี created_at → ล้มอีกสามตาราง
   *       ★★ การเดาครั้งที่สามก็จะล้มอีกแบบหนึ่ง เพราะปัญหาไม่ใช่ว่าเดาผิดคอลัมน์
   *          แต่เป็นการเดาเอง ทั้งที่ถามได้
   *
   *     ★ ดึงมาหนึ่งแถวแล้วใช้ชื่อคอลัมน์แรกของมัน — ตารางว่างก็ไม่ต้องลบอยู่แล้ว
   *       ★★ ใช้ได้กับทุกตารางโดยไม่ต้องรู้โครงสร้างล่วงหน้า และไม่พังเงียบ ๆ
   *          วันที่มีคนเพิ่มตารางใหม่ที่หน้าตาไม่เหมือนใคร
   */
  const { data: sample } = await db.from(table).select('*').limit(1)
  const col = sample?.[0] ? Object.keys(sample[0])[0] : null
  if (!col) {
    console.log(`    ${table.padEnd(24)} 0 → 0`)
    continue
  }

  const { error } = await db.from(table).delete().not(col, 'is', null)
  const after = await countRows(table)
  console.log(
    `    ${table.padEnd(24)} ${error ? '✗ ' + error.message : `${n(before.count)} → ${n(after.count ?? 0)}`}`,
  )
}

console.log('\n  ── กำลังลบไฟล์ ──')
for (const bucket of BUCKETS) {
  const removed = await emptyBucket(bucket)
  console.log(`    ${bucket.padEnd(24)} ลบ ${n(removed)} ไฟล์`)
}

/*
 * ══ 4. ล้างคอลัมน์ที่ชี้ไปหาไฟล์ที่เพิ่งลบ ══════════════════════════════
 *
 * ★★★ ลบไฟล์แล้วปล่อย path ไว้ = ลิงก์เสียที่ไม่มีใครรู้ว่าเสีย
 *
 *     ★ อาการที่เจอจริงหลังรันรอบแรก: หน้าจ่ายเงินค้างที่ "กำลังโหลด…"
 *       ตลอดกาล เพราะ profiles.payment_qr_path ยังชี้ไปหาไฟล์ที่ถูกลบ
 *       ★★ แล้ว createSignedUrl ล้ม → ทั้ง endpoint ตอบ 500
 *
 *     ★ ตารางที่เก็บ path ส่วนใหญ่ถูกลบทั้งแถวอยู่แล้ว (debts · expense_bills)
 *       ★★ แต่ profiles ไม่ถูกลบโดยตั้งใจ — คอลัมน์ของมันจึงต้องล้างเอง
 *          ไม่งั้นข้อมูลที่ "ตั้งใจเก็บไว้" กลายเป็นข้อมูลเสีย
 */
console.log('\n  ── ล้างคอลัมน์ที่ชี้ไปหาไฟล์ ──')
{
  const { data, error } = await db
    .from('profiles')
    .update({ payment_qr_path: null })
    .not('payment_qr_path', 'is', null)
    .select('id')

  console.log(
    `    profiles.payment_qr_path ${error ? '✗ ' + error.message : 'ล้าง ' + n(data?.length ?? 0) + ' แถว'}`,
  )
}

console.log('\n  เสร็จแล้ว — ห้องฟังเพลงและบัญชีผู้ใช้ยังอยู่ครบ\n')
