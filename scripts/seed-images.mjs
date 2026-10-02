/**
 * รูปปกให้ประกาศในตลาดนัดและร้านอาหาร
 *
 * ★★★ ทำไมเป็นปกตัวหนังสือ ไม่ใช่รูปถ่ายจริง
 *
 *     ★ รูปถ่ายของจริงปลอมขึ้นมาไม่ได้ และการไปดึงรูปจากเว็บอื่นมาใส่
 *       ★★ จะทำให้ฐานข้อมูลตัวอย่างผูกกับเซิร์ฟเวอร์ที่เราไม่ได้คุม —
 *          วันที่ลิงก์ตาย ตลาดนัดทั้งหน้าจะกลายเป็นรูปแตก
 *     ★ ปกที่พิมพ์ชื่อของลงไปตรง ๆ ตอบโจทย์ที่แท้จริงของการ seed:
 *       ให้เห็นว่า "หน้าจอที่มีรูปทุกใบ" หน้าตาเป็นยังไง — ระยะห่าง ·
 *       สัดส่วน · ชื่อที่ยาวเกินกรอบ ★★ ซึ่งรูปถ่ายสวย ๆ ก็ไม่ได้บอกดีกว่านี้
 *
 * ★★ อัปขึ้นถัง listings ของเราเอง ไม่ใช่ลิงก์ภายนอก
 *    ★ listing_images.url มี constraint ว่าต้องขึ้นต้นด้วย https:// อยู่แล้ว
 *      และถังนี้เป็น public — URL จึงเปิดได้ตรง ๆ โดยไม่ต้องเซ็น
 *
 * ใช้: node scripts/seed-images.mjs --yes
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
if (URL_.includes('vackilhpblpkfzonlodl')) {
  console.error('✗ หยุด — โปรเจกต์เก่า ห้ามแตะ')
  process.exit(1)
}
const APPLY = process.argv.includes('--yes')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

/*
 * ★ วาดด้วย Python/PIL เพราะ Node ไม่มีตัววาดตัวหนังสือในตัว
 *   ★★ และฟอนต์ไทยของเครื่องต้องใช้จริงเพื่อให้สระบนล่างวางถูกที่ —
 *      ปกที่สระลอยผิดตำแหน่งจะดูปลอมยิ่งกว่าไม่มีรูป
 */
const PY = `
import sys, json, math
from PIL import Image, ImageDraw, ImageFont

# ★★★ ต้องเป็นฟอนต์ที่มีทั้งไทยและละติน ไม่ใช่ฟอนต์ไทยล้วน
#
#     ★ ThonburiUI.ttc เป็นฟอนต์ไทยของ macOS แต่ไม่มีตัวละติน
#       ★★ PIL ไม่เตือนอะไรเลย — มันคืนความกว้างให้ปกติ แล้ววาดเป็นกล่องสี่เหลี่ยม
#          ★ ผลที่เห็นบนจอ: "หนังสือ ▯▯▯▯▯ ▯▯▯▯▯▯▯▯▯▯▯▯"
#     ★ Arial Unicode มีครบทั้งสองชุด จึงต้องมาก่อน
FONTS = ['/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
         '/System/Library/Fonts/Supplemental/Tahoma.ttf',
         '/System/Library/Fonts/Supplemental/ThonburiUI.ttc',
         '/System/Library/Fonts/Helvetica.ttc']

def font(size):
    for f in FONTS:
        try: return ImageFont.truetype(f, size)
        except Exception: pass
    return ImageFont.load_default()

def wrap(draw, text, fnt, maxw):
    # ★ เคารพ \\n ที่ส่งมา แล้วค่อยตัดบรรทัดยาวต่อ
    out = []
    for part in text.split('\\n'):
        out.extend(wrap1(draw, part, fnt, maxw))
    return out[:3]

def wrap1(draw, text, fnt, maxw):
    words, lines, cur = list(text), [], ''
    for ch in words:
        t = cur + ch
        if draw.textlength(t, font=fnt) > maxw and cur:
            lines.append(cur); cur = ch
        else:
            cur = t
    if cur: lines.append(cur)
    return lines

jobs = json.loads(sys.argv[1])
for j in jobs:
    W, H = 900, 675
    a = tuple(j['a']); b = tuple(j['b'])
    img = Image.new('RGB', (W, H), a)
    d = ImageDraw.Draw(img)
    # ★ ไล่สีแนวทแยง — พื้นสีเดียวแบน ๆ อ่านเป็น "รูปหาย" ไม่ใช่ "ปก"
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)))
    # ★ วงกลมจาง ๆ ให้พื้นไม่เรียบจนดูเหมือน error page
    for i, (cx, cy, r) in enumerate([(W*0.82, H*0.22, 190), (W*0.15, H*0.82, 150)]):
        d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=tuple(min(255, c + 16) for c in b))
    f1 = font(58); f2 = font(30)
    lines = wrap(d, j['title'], f1, W - 150)
    y = H / 2 - len(lines) * 36 - 18
    for ln in lines:
        d.text((75, y), ln, font=f1, fill=(255, 255, 255)); y += 74
    if j.get('sub'):
        d.text((75, y + 10), j['sub'], font=f2, fill=(255, 255, 255, 220))
    img.save(j['out'], 'JPEG', quality=86)
print('ok')
`

/** จานสีที่ไม่ซ้ำกันเกินไป — ของแต่ละชิ้นในตารางต้องแยกออกจากกันด้วยตา */
const PALETTE = [
  [[37, 99, 235], [59, 130, 246]],
  [[190, 24, 93], [236, 72, 153]],
  [[5, 150, 105], [16, 185, 129]],
  [[217, 119, 6], [245, 158, 11]],
  [[109, 40, 217], [139, 92, 246]],
  [[190, 18, 60], [244, 63, 94]],
  [[13, 148, 136], [20, 184, 166]],
  [[71, 85, 105], [100, 116, 139]],
]

const money = (n) =>
  n > 0 ? `฿${new Intl.NumberFormat('en').format(n)}` : 'ฟรี'

async function main() {
  console.log(APPLY ? 'โหมด: เขียนจริง' : 'โหมด: ซ้อม')

  const { data: listings } = await db
    .from('listings')
    .select('id, title, price, kind, created_at')
    .order('created_at', { ascending: false })
    .limit(40)

  const { data: already } = await db.from('listing_images').select('listing_id')
  const has = new Set((already ?? []).map((r) => r.listing_id))
  const todo = (listings ?? []).filter((l) => !has.has(l.id))

  console.log(`ประกาศที่ยังไม่มีรูป: ${todo.length} / ${listings?.length ?? 0}`)
  if (!todo.length || !APPLY) return

  const dir = mkdtempSync(join(tmpdir(), 'seedimg-'))

  /*
   * ★★★ หลายรูปต่อประกาศ ไม่ใช่ใบเดียว
   *
   *     ★ ระบบให้ลงได้ 5 ใบ และตอนนี้มีแกลเลอรีให้ดูครบแล้ว ★★ ข้อมูล
   *       ตัวอย่างที่มีใบเดียวทุกประกาศ จะทำให้แกลเลอรีไม่เคยถูกทดสอบเลย
   *     ★ ของจริงก็ไม่เท่ากัน — บางคนถ่ายใบเดียว บางคนถ่ายห้าใบ
   *       ★★ จำนวนที่ต่างกันคือสิ่งที่ทำให้เห็นว่าจุดบอกหน้ารับไหวไหม
   *
   * ★ มุมที่สองเป็นต้นไปเขียนกำกับว่าเป็นรูปอะไร — รูปถ่ายจริงปลอมไม่ได้
   *   แต่ "ด้านหลัง · กล่องและอุปกรณ์" บอกได้ว่าแกลเลอรีมีไว้ทำอะไร
   */
  const ANGLES = ['', 'ด้านหลัง', 'กล่องและอุปกรณ์', 'จุดที่มีตำหนิ', 'ขนาดเทียบมือ']

  const jobs = []
  for (const [i, l] of todo.entries()) {
    /* ★ 1–4 ใบ แบบคงที่ต่อประกาศ — รันซ้ำแล้วได้ผลเหมือนเดิม เทียบภาพได้ */
    const n = 1 + (i % 4)
    for (let k = 0; k < n; k++) {
      jobs.push({
        listing: l,
        k,
        title: k === 0 ? l.title : `${l.title}\n${ANGLES[k]}`,
        sub: k === 0 ? (l.kind === 'WANTED' ? 'ตามหา' : money(Number(l.price))) : ANGLES[k],
        a: PALETTE[(i + k) % PALETTE.length][0],
        b: PALETTE[(i + k) % PALETTE.length][1],
        out: join(dir, `${i}-${k}.jpg`),
      })
    }
  }

  execFileSync(
    'python3',
    ['-c', PY, JSON.stringify(jobs.map(({ title, sub, a, b, out }) => ({ title, sub, a, b, out })))],
    { stdio: 'inherit' },
  )

  const rows = []
  for (const j of jobs) {
    const bytes = readFileSync(j.out)
    const path = `seed/${j.listing.id}-${j.k}.jpg`
    const { error } = await db.storage
      .from('listings')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
    if (error) {
      console.error(`  ✗ อัป ${j.listing.title}:`, error.message)
      continue
    }
    const { data: pub } = db.storage.from('listings').getPublicUrl(path)
    rows.push({ listing_id: j.listing.id, url: pub.publicUrl, sort: j.k })
  }

  const { error } = await db.from('listing_images').insert(rows)
  if (error) console.error('✗ listing_images:', error.message)
  else console.log(`listing_images ← ${rows.length} แถว`)

  /*
   * ★★ ไม่ทำรูปให้ร้านอาหาร ทั้งที่ตาราง restaurants มีคอลัมน์ image_path
   *
   *    ★ /api/office/food/restaurants คืน imagePath ออกมาก็จริง ★★ แต่ไม่มี
   *      คอมโพเนนต์ไหนในหน้าอาหารเอาไปวาดเลยสักที่ (เช็กแล้วด้วย grep)
   *    ★ ใส่ข้อมูลที่ไม่มีหน้าไหนแสดง = ข้อมูลที่ไม่มีใครรู้ว่าถูกหรือผิด
   *      ★★ และทำให้คนอ่านโค้ดวันหลังเข้าใจผิดว่าฟีเจอร์นี้ทำเสร็จแล้ว
   */
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
