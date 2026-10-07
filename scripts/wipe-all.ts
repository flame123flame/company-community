/**
 * ล้างข้อมูลทั้งระบบ เหลือแอดมินหนึ่งคน
 *
 * รันด้วย:  npx tsx scripts/wipe-all.ts --keep awaadmin --yes
 *
 * ★★★ ย้อนกลับไม่ได้ — ต้องใส่ --yes ถึงจะทำงาน
 *
 *     ★ สคริปต์ที่ลบข้อมูลจริงแล้วรันได้ทันทีที่พิมพ์ชื่อไฟล์ คือสคริปต์ที่
 *       วันหนึ่งจะถูกรันโดยไม่ได้ตั้งใจ ★★ ไม่ใส่ --yes = แสดงรายการว่า
 *       จะลบอะไรบ้างแล้วจบ ไม่แตะฐานข้อมูล
 *
 * ★★★ ลบบัญชีใน auth เป็นหลัก ไม่ใช่ลบ profiles
 *
 *     ★ profiles.id อ้างถึง auth.users แบบ cascade ★★ ลบ profiles เฉย ๆ
 *       จะเหลือบัญชีเข้าระบบที่ไม่มีโปรไฟล์ — ล็อกอินได้แต่ระบบไม่รู้จัก
 *       ★ ซึ่งแย่กว่าไม่มีบัญชีเลย เพราะเข้ามาแล้วทุกหน้าพัง
 *
 * ★★ ลบตารางเนื้อหาด้วยมือตามลำดับลูกก่อนแม่
 *    ★ หลายตารางผูกกับผู้ใช้แบบ set null ไม่ใช่ cascade — ลบคนแล้วแถวยังอยู่
 *      ★★ เช่น restaurants.added_by · rooms.owner_id
 *
 * ★ เก็บไว้โดยตั้งใจ: app_settings (พิกัดออฟฟิศและค่าตั้งระบบ)
 *   ★★ มันคือ "การตั้งค่า" ไม่ใช่ "เนื้อหาที่คนสร้าง" — ล้างไปก็ต้องมานั่งตั้งใหม่
 *      โดยไม่ได้อะไรแลกมา
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

const args = process.argv.slice(2)
const KEEP = args[args.indexOf('--keep') + 1]
const GO = args.includes('--yes')

if (!KEEP || KEEP.startsWith('--')) {
  console.error('ต้องระบุ --keep <username> ว่าจะเก็บแอดมินคนไหน')
  process.exit(1)
}

/**
 * ตารางเนื้อหา เรียงลูกก่อนแม่
 *
 * ★ ลำดับสำคัญ — ลบแม่ก่อนจะติด foreign key ของลูกที่ไม่ได้ตั้ง cascade
 *   ★★ และถึงจะตั้ง cascade ไว้ การลบตามลำดับก็ทำให้เห็นจำนวนจริงของแต่ละตาราง
 */
const TABLES = [
  /* ── เกม ───────────────────────────────────────────── */
  'checkers_moves',
  'checkers_games',
  'game_challenges',
  'typing_players',
  'typing_rooms',
  'quiz_scores',
  'quiz_games',
  'tournament_matches',
  'tournaments',
  'draw_members',
  'draw_rooms',
  'lottery_tickets',
  'name_sets',

  /* ── แชท ───────────────────────────────────────────── */
  'chat_reactions',
  'chat_messages',
  'chat_members',
  'chat_rooms',

  /* ── ตลาดนัด ───────────────────────────────────────── */
  'market_messages',
  'market_threads',
  'search_alerts',
  'listing_reports',
  'listing_queue',
  'listings',

  /* ── กระเป๋าเงิน ───────────────────────────────────── */
  'debts',
  'bill_shares',
  'expense_bills',
  'expense_groups',
  'monthly_budgets',

  /* ── ร้านอาหาร ─────────────────────────────────────── */
  'restaurant_review_photos',
  'restaurant_reviews',
  'restaurant_photos',
  'restaurant_dishes',
  'restaurant_votes',
  'restaurants',

  /* ── ห้องฟังเพลง ───────────────────────────────────── */
  'skip_votes',
  'room_stickers',
  'playback_states',
  'queue_items',
  'room_members',
  'rooms',

  /* ── ของผู้ใช้ ─────────────────────────────────────── */
  'notification_prefs',
  'notifications',
  'audit_log',
]

/** ที่เก็บไฟล์ที่ต้องเก็บกวาดด้วย — ไม่งั้นเหลือไฟล์กำพร้ากินโควตา */
const BUCKETS = ['restaurants', 'reviews', 'receipts', 'slips', 'qr', 'listings', 'chat']

async function main() {
  console.log('ฐานข้อมูล:', env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('เก็บแอดมิน:', KEEP)
  console.log(GO ? '\n\x1b[31m*** ลบจริง ***\x1b[0m\n' : '\n(ยังไม่ลบ — ใส่ --yes เพื่อลบจริง)\n')

  const { data: keeper } = await db
    .from('profiles')
    .select('id, username, is_admin')
    .eq('username', KEEP)
    .maybeSingle()

  if (!keeper) {
    console.error(`ไม่พบผู้ใช้ "${KEEP}" — หยุดไว้ก่อน ไม่ลบอะไรทั้งนั้น`)
    process.exit(1)
  }
  if (!keeper.is_admin) {
    /* ★ กันพลาด: เก็บคนที่ไม่ใช่แอดมินไว้ แปลว่าเหลือระบบที่ไม่มีใครดูแลได้ */
    console.error(`"${KEEP}" ไม่ใช่แอดมิน — หยุดไว้ก่อน`)
    process.exit(1)
  }

  /* ── 1 · ลบเนื้อหา ───────────────────────────────────────── */
  console.log('── เนื้อหา ─────────────────────────────')
  for (const t of TABLES) {
    const head = await db.from(t).select('*', { count: 'exact', head: true })
    if (head.error) continue
    const n = head.count ?? 0
    if (n === 0) continue

    if (GO) {
      const { error } = await db.from(t).delete().not('id', 'is', null)
      if (error) {
        /*
         * ★ บางตารางไม่มีคอลัมน์ id — ลองคีย์อื่นที่ตารางพวกนั้นมีจริง
         *   ★★ typing_players · playback_states · notification_prefs
         *      ใช้ user_id/room_id เป็นคีย์ ไม่มีทั้ง id และ created_at
         *   ★ ทั้งสามหายไปเองตอนลบบัญชีผู้ใช้ (cascade) แต่ต้องลองให้ครบ
         *     เผื่อกรณีที่เรียกสคริปต์โดยไม่ลบผู้ใช้
         */
        let done = false
        for (const col of ['created_at', 'user_id', 'room_id']) {
          const retry = await db.from(t).delete().not(col, 'is', null)
          if (!retry.error) {
            done = true
            break
          }
        }
        console.log(`  ${t.padEnd(26)} ${n} → ${done ? 'ลบแล้ว' : 'ข้าม (ไม่มีคีย์ที่ลบได้ — รอ cascade จากการลบผู้ใช้)'}`)
        continue
      }
    }
    console.log(`  ${t.padEnd(26)} ${n}${GO ? ' → ลบแล้ว' : ''}`)
  }

  /* ── 2 · ลบบัญชีผู้ใช้ ────────────────────────────────────── */
  console.log('\n── บัญชีผู้ใช้ ─────────────────────────')
  const { data: au } = await db.auth.admin.listUsers({ perPage: 1000 })
  const users = au?.users ?? []
  const victims = users.filter((u) => u.id !== keeper.id)
  console.log(`  ทั้งหมด ${users.length} · ลบ ${victims.length} · เก็บ 1 (${KEEP})`)

  if (GO) {
    let done = 0
    for (const u of victims) {
      const { error } = await db.auth.admin.deleteUser(u.id)
      if (!error) done++
      else console.log(`  ลบไม่สำเร็จ ${u.email}: ${error.message}`)
    }
    console.log(`  ลบสำเร็จ ${done}/${victims.length}`)
  }

  /* ── 3 · เก็บกวาดไฟล์ ────────────────────────────────────── */
  console.log('\n── ไฟล์ใน storage ──────────────────────')
  for (const b of BUCKETS) {
    const { data: top, error } = await db.storage.from(b).list('', { limit: 1000 })
    if (error) continue

    /* ★ ไล่เข้าโฟลเดอร์ย่อยหนึ่งชั้น — ทุก bucket เก็บเป็น <id>/<file> */
    const paths: string[] = []
    for (const entry of top ?? []) {
      if (entry.id === null) {
        const { data: inner } = await db.storage.from(b).list(entry.name, { limit: 1000 })
        for (const f of inner ?? []) paths.push(`${entry.name}/${f.name}`)
      } else {
        paths.push(entry.name)
      }
    }
    if (paths.length === 0) continue
    if (GO) await db.storage.from(b).remove(paths)
    console.log(`  ${b.padEnd(14)} ${paths.length} ไฟล์${GO ? ' → ลบแล้ว' : ''}`)
  }

  /*
   * ── 4 · รหัสพนักงาน ──────────────────────────────────────
   *
   * ★★★ ไม่ต้องปลดการผูกเอง — foreign key ทำให้แล้ว
   *
   *     ★ employee_codes.claimed_by อ้างถึง profiles แบบ on delete set null
   *       ★★ พอลบบัญชีผู้ใช้ รหัสที่เขาถืออยู่จะว่างเองทันที
   *     ★ ตัวรหัสคือของที่แอดมินออกไว้ล่วงหน้า ไม่ใช่เนื้อหาที่คนสร้าง
   *       ★★ ลบทิ้งแปลว่าต้องมานั่งออกใหม่ทั้งชุดโดยไม่ได้อะไรแลกมา
   *
   * ★★★ เคยเขียนผิดตรงนี้: สั่ง update ช่อง used_by/used_at ซึ่งไม่มีอยู่จริง
   *     ★ ชื่อจริงคือ claimed_by/claimed_at ★★ PostgREST ไม่ฟ้องเพราะสคริปต์
   *       ไม่ได้อ่าน error กลับมา — คำสั่งจึงเงียบและไม่ทำอะไรเลย
   *       ★ ผลลัพธ์ถูกโดยบังเอิญเพราะ FK ทำงานอยู่แล้ว ซึ่งแย่กว่าผิดชัด ๆ
   *         เพราะมันสอนให้เชื่อคำสั่งที่ไม่เคยทำงาน
   */
  console.log('\n── รหัสพนักงาน ─────────────────────────')
  const codes = await db.from('employee_codes').select('*', { count: 'exact', head: true })
  const claimed = await db
    .from('employee_codes')
    .select('*', { count: 'exact', head: true })
    .not('claimed_by', 'is', null)
  if (!codes.error) {
    console.log(`  ${codes.count} รหัส · ยังผูกกับคน ${claimed.count ?? 0} (FK ปลดให้เองตอนลบผู้ใช้)`)
  }

  console.log('\n── เก็บไว้โดยตั้งใจ ────────────────────')
  console.log('  app_settings (พิกัดออฟฟิศและค่าตั้งระบบ)')
  console.log('  employee_codes (ตัวรหัส — ปลดการผูกแล้ว)')
  console.log(`  profiles ของ ${KEEP}`)

  console.log(GO ? '\nเสร็จแล้ว' : '\n(ยังไม่ได้ลบอะไร — ใส่ --yes เพื่อลบจริง)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
