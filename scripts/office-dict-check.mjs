/**
 * ตรวจว่าทุกภาษามีกุญแจครบเท่าไทย และไม่มีกุญแจเกิน
 *
 * ★★★ TypeScript จับ "ขาด" ให้แล้วตอนคอมไพล์ แต่จับสามอย่างนี้ไม่ได้
 *
 *     ★ กุญแจซ้ำในไฟล์เดียว — อันหลังทับอันหน้าเงียบ ๆ และ TS ไม่ว่าอะไร
 *     ★ ตัวแปร {n} {name} ที่หายไปตอนแปล — ประโยคจะขาดตัวเลขไปทั้งใบ
 *     ★ ตัวแปรที่พิมพ์ผิดชื่อ — {nn} จะโผล่เป็นตัวหนังสือบนหน้าเว็บ
 *
 *     ★★ สามอย่างนี้ไม่ทำให้คอมไพล์ล้ม และหาด้วยตาไม่เจอใน 779 บรรทัด × 16
 *
 * ใช้: node scripts/office-dict-check.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'

const DIR = new URL('../lib/i18n/office-dict/', import.meta.url)
const KEY = /^\s*['"]([a-zA-Z0-9.]+)['"]:/gm

function parse(file) {
  const src = readFileSync(new URL(file, DIR), 'utf8')
  const body = src.slice(src.indexOf('= {'))
  const keys = []
  for (const m of body.matchAll(KEY)) keys.push(m[1])
  /* ★ ดึงค่าด้วย — ต้องเทียบตัวแปรในประโยค ไม่ใช่แค่ชื่อกุญแจ */
  const vals = {}
  const pair = /['"]([a-zA-Z0-9.]+)['"]:\s*(?:\n\s*)?(['"])((?:\\.|(?!\2)[^\\])*)\2/g
  for (const m of body.matchAll(pair)) vals[m[1]] = m[3]
  return { keys, vals }
}

const th = parse('th.ts')
const thSet = new Set(th.keys)
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'th.ts')
let bad = 0
console.log(`\n  ไทยเป็นต้นฉบับ: ${th.keys.length} กุญแจ\n`)

/* ★ ไทยเองก็ต้องตรวจกุญแจซ้ำ — ต้นฉบับพลาดได้เหมือนกัน */
for (const [name, p] of [['th.ts', th], ...files.map((f) => [f, parse(f)])]) {
  const seen = new Set()
  const dupes = p.keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)))
  const missing = name === 'th.ts' ? [] : th.keys.filter((k) => !seen.has(k))
  const extra = name === 'th.ts' ? [] : p.keys.filter((k) => !thSet.has(k))
  const varBad = name === 'th.ts' ? [] : th.keys.filter(
    (k) => p.vals[k] !== undefined && vars(th.vals[k] ?? '') !== vars(p.vals[k]),
  )

  const problems = []
  if (dupes.length) problems.push(`ซ้ำ ${dupes.length} (${dupes.slice(0, 4).join(', ')})`)
  if (missing.length) problems.push(`ขาด ${missing.length} (${missing.slice(0, 4).join(', ')})`)
  if (extra.length) problems.push(`เกิน ${extra.length} (${extra.slice(0, 4).join(', ')})`)
  if (varBad.length) problems.push(`ตัวแปรไม่ตรง ${varBad.length} (${varBad.slice(0, 4).join(', ')})`)

  if (problems.length) {
    bad += 1
    console.log(`  ✗ ${name.padEnd(8)} ${problems.join(' · ')}`)
  } else {
    console.log(`  ✓ ${name.padEnd(8)} ${p.keys.length} กุญแจ`)
  }
}

console.log(bad ? `\n  ล้ม ${bad} ไฟล์\n` : `\n  ครบทุกไฟล์\n`)
process.exit(bad ? 1 : 0)
