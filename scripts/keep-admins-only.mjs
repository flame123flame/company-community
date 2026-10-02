/**
 * ลบบัญชีผู้ใช้ทั้งหมด เหลือไว้แค่ Admin — โดยไม่ทำให้ห้องฟังเพลงหายไป
 *
 * ใช้:
 *   node scripts/keep-admins-only.mjs         → บอกว่าจะทำอะไร ไม่แตะอะไรเลย
 *   node scripts/keep-admins-only.mjs --yes   → ทำจริง (ต้องพิมพ์ยืนยันอีกชั้น)
 *
 * ★★★ ย้ายของก่อน แล้วค่อยลบคน
 *
 *     ★ คอลัมน์ owner_id · user_id · host_id ของห้องฟังเพลงเป็น
 *       `on delete cascade` ★★ ลบเจ้าของบัญชีตรง ๆ = ห้อง สมาชิก และ
 *       คิวเพลงหายตามไปทั้งหมดโดยไม่มีอะไรเตือน
 *       ★ วัดแล้วก่อนเขียนสคริปต์นี้: ห้องทั้ง 8 ห้องเป็นของบัญชีที่จะลบ
 *         พร้อมสมาชิก 22 แถว และเพลงในคิว 104 เพลง
 *
 *     ★★ จึงโอนความเป็นเจ้าของมาที่ Admin ก่อน แล้วค่อยลบ
 *        ★ ห้องยังอยู่ เปิดฟังได้ และ Admin เป็นคนดูแลแทน
 *
 * ★★ รหัสพนักงานของคนที่ถูกลบต้องถูกคืนให้ว่าง
 *    ★ ไม่งั้นรหัสนั้นใช้สมัครใหม่ไม่ได้ตลอดกาล เพราะ claimed_by ชี้ไปหา
 *      บัญชีที่ไม่มีอยู่แล้ว ★★ ซึ่งเป็นสถานะที่ไม่มีหน้าไหนในระบบแก้ได้
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

/* ★ กันยิงผิดโปรเจกต์ — เหมือน reset-office-data.mjs */
if (URL_.includes('vackilhpblpkfzonlodl')) {
  console.error('✗ หยุด — URL ชี้ไปโปรเจกต์เก่าซึ่งเป็นของอีกแอป ห้ามแตะ')
  process.exit(1)
}

const APPLY = process.argv.includes('--yes')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })
const n = (v) => new Intl.NumberFormat('en').format(v ?? 0)

/* ══ 1. ใครอยู่ ใครไป ═══════════════════════════════════════════════════ */

const { data: all, error: listError } = await db
  .from('profiles')
  .select('id, username, display_name, is_admin, employee_code')

if (listError) {
  console.error('✗ อ่านรายชื่อไม่ได้:', listError.message)
  process.exit(1)
}

const admins = all.filter((p) => p.is_admin)
const doomed = all.filter((p) => !p.is_admin)

if (admins.length === 0) {
  /* ★★ ไม่มี Admin = ลบทุกคนแล้วไม่เหลือใครแก้ได้ — หยุดทันที */
  console.error('✗ หยุด — ไม่มีบัญชี Admin เลย ถ้าลบต่อจะไม่เหลือใครเข้าระบบได้')
  process.exit(1)
}

const keeper = admins[0]
const doomedIds = doomed.map((p) => p.id)

console.log('\n  โปรเจกต์:', URL_)
console.log('  โหมด:', APPLY ? '★ ทำจริง' : 'บอกว่าจะทำอะไร (ยังไม่แตะอะไร)')
console.log(`\n  เก็บไว้ ${admins.length} บัญชี (Admin):`)
for (const a of admins) console.log(`    ${String(a.username).padEnd(16)} ${a.employee_code ?? '—'}`)
console.log(`\n  จะลบ ${doomed.length} บัญชี`)
console.log(`    ${doomed.map((p) => p.username ?? '(ไม่มีชื่อ)').join(' · ')}`)

if (doomed.length === 0) {
  console.log('\n  ไม่มีอะไรต้องลบ\n')
  process.exit(0)
}

/* ══ 2. ของที่ต้องย้ายก่อน ══════════════════════════════════════════════ */

const inDoomed = `(${doomedIds.join(',')})`

const { count: roomCount } = await db
  .from('rooms')
  .select('id', { count: 'exact', head: true })
  .in('owner_id', doomedIds)

const { count: queueCount } = await db
  .from('queue_items')
  .select('id', { count: 'exact', head: true })
  .in('added_by', doomedIds)

const { data: codes } = await db
  .from('employee_codes')
  .select('code')
  .in('claimed_by', doomedIds)

console.log('\n  ── จะย้ายมาเป็นของ', keeper.username, '──')
console.log(`    ห้องฟังเพลง            ${n(roomCount)} ห้อง`)
console.log(`    เพลงในคิว              ${n(queueCount)} เพลง`)
console.log(`\n  ── จะคืนให้ว่าง ──`)
console.log(`    รหัสพนักงาน            ${n(codes?.length ?? 0)} ตัว`)

if (!APPLY) {
  console.log('\n  ยังไม่ได้ทำอะไรเลย')
  console.log('  ถ้าถูกต้องแล้ว สั่งอีกครั้งด้วย:  node scripts/keep-admins-only.mjs --yes\n')
  process.exit(0)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
console.log('\n  ★ ลบแล้วกู้คืนไม่ได้')
const answer = await rl.question('  พิมพ์ "ลบ" เพื่อยืนยัน: ')
rl.close()

if (answer.trim() !== 'ลบ') {
  console.log('\n  ยกเลิก ไม่ได้ทำอะไรเลย\n')
  process.exit(0)
}

/* ══ 3. ย้ายของ ═════════════════════════════════════════════════════════ */

console.log('\n  ── ย้ายของ ──')

{
  const { data, error } = await db
    .from('rooms')
    .update({ owner_id: keeper.id })
    .in('owner_id', doomedIds)
    .select('id')
  console.log(`    ห้องฟังเพลง    ${error ? '✗ ' + error.message : 'ย้าย ' + n(data?.length ?? 0) + ' ห้อง'}`)
}

{
  const { data, error } = await db
    .from('queue_items')
    .update({ added_by: keeper.id })
    .in('added_by', doomedIds)
    .select('id')
  console.log(`    เพลงในคิว      ${error ? '✗ ' + error.message : 'ย้าย ' + n(data?.length ?? 0) + ' เพลง'}`)
}

/*
 * ★★ Admin ต้องเป็นสมาชิกของห้องที่เพิ่งรับมา
 *    ★ สมาชิกเดิมทั้งหมดถูกลบไปพร้อมบัญชี ★★ ห้องที่ไม่มีสมาชิกเลย
 *      จะไม่โผล่ในรายการห้องและเจ้าของเองก็เข้าไม่ได้
 */
{
  const { data: rooms } = await db.from('rooms').select('id').eq('owner_id', keeper.id)
  const rows = (rooms ?? []).map((r) => ({ room_id: r.id, user_id: keeper.id }))
  if (rows.length > 0) {
    const { error } = await db.from('room_members').upsert(rows, { onConflict: 'room_id,user_id' })
    console.log(`    สมาชิกห้อง     ${error ? '✗ ' + error.message : 'ใส่ ' + keeper.username + ' เข้า ' + n(rows.length) + ' ห้อง'}`)
  }
}

/* ══ 4. คืนรหัสพนักงาน ══════════════════════════════════════════════════ */

{
  const { data, error } = await db
    .from('employee_codes')
    .update({ claimed_by: null, claimed_at: null })
    .in('claimed_by', doomedIds)
    .select('code')
  console.log(`    รหัสพนักงาน    ${error ? '✗ ' + error.message : 'คืน ' + n(data?.length ?? 0) + ' ตัวให้ว่าง'}`)
}

/* ══ 5. ลบบัญชี ═════════════════════════════════════════════════════════ */

console.log('\n  ── ลบบัญชี ──')
let done = 0
let failed = 0

for (const p of doomed) {
  /*
   * ★ ลบที่ auth.users — profiles หายตามด้วย cascade
   *   ★★ ลบที่ profiles อย่างเดียวจะเหลือ auth user ที่ไม่มีโปรไฟล์
   *      แล้วชื่อผู้ใช้นั้นถูกจองไว้ตลอดกาลโดยที่ไม่มีใครเห็นมัน
   */
  const { error } = await db.auth.admin.deleteUser(p.id)
  if (error) {
    failed += 1
    console.log(`    ✗ ${p.username ?? p.id}: ${error.message}`)
  } else {
    done += 1
  }
}

console.log(`\n    ลบสำเร็จ ${n(done)} บัญชี${failed ? ` · ล้มเหลว ${n(failed)}` : ''}`)
console.log(`\n  เสร็จแล้ว — เหลือ Admin ${admins.length} บัญชี และห้องฟังเพลงยังอยู่ครบ\n`)
