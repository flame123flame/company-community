import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth:{persistSession:false} })

/* ★ ให้สิทธิ์ผู้ดูแลกับบัญชีเดียว — อีกบัญชีไว้ดูมุมของพนักงานทั่วไป */
const { error } = await db.from('profiles').update({ is_admin: true }).eq('username', 'awaboss')
console.log(error ? '✗ ' + error.message : 'ตั้ง awaboss เป็นผู้ดูแลแล้ว')

/* ★ เก็บกวาดบัญชีทดสอบที่ค้างจากรอบก่อน */
const { data } = await db.from('profiles').select('id, username, is_admin')
let n = 0
for (const p of data) if (/^(lng|run|walk|fnd|mth|i18n|op|pp)\w*$/.test(p.username ?? '') && !p.is_admin) { await db.auth.admin.deleteUser(p.id); n++ }
console.log(`ลบบัญชีทดสอบที่ค้าง ${n} บัญชี\n`)

const { data: now } = await db.from('profiles').select('username, nickname, is_admin, account_status').order('username')
for (const p of now) console.log(`  ${(p.username??'').padEnd(12)} ${(p.nickname??'—').padEnd(12)} ${p.is_admin ? 'ผู้ดูแล' : 'พนักงาน'}  ${p.account_status}`)
