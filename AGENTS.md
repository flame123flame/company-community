<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ภาษา: ทำไทยอย่างเดียวก่อน

**ระหว่างพัฒนา ให้เขียนข้อความใหม่เป็นภาษาไทยอย่างเดียว ไม่ต้องแปลอีก 15 ภาษา**

เจ้าของระบบสั่งไว้เมื่อ 1 ต.ค. 2026 เหตุผลคือการแปลครบ 16 ภาษาทุกครั้งที่เพิ่ม
ปุ่มหนึ่งปุ่ม ทำให้การพัฒนาช้าลงมาก โดยที่ระบบยังไม่เสร็จและข้อความยังเปลี่ยนได้อีก

## แปลว่าให้ทำแบบนี้

- กุญแจใหม่ → เติมใน `lib/i18n/office-dict/th.ts` (หรือ `lib/i18n/dict/th.ts`) เท่านั้น
- อีก 15 ไฟล์ **ไม่ต้องแตะ** — ปล่อยให้ตกไปอังกฤษ/ไทยตาม fallback ที่มีอยู่แล้ว
- `npx tsc` จะฟ้องว่าภาษาอื่นขาดกุญแจ เพราะ `OfficeDict` เป็น `Record` เต็ม
  → แก้โดยเติมกุญแจเดียวกันในอีก 15 ไฟล์ **ด้วยข้อความไทยชุดเดิม** แล้วค่อยแปลทีหลัง
  (เร็วกว่าแปลจริง 15 รอบมาก และไม่ทำให้คอมไพล์ล้ม)
- `scripts/office-dict-check.mjs` ยังต้องผ่าน — มันตรวจว่ากุญแจครบและตัวแปร `{n}`
  ตรงกัน ซึ่งยังจำเป็นแม้ข้อความจะยังไม่ได้แปล
- ข้อความไทยที่ **มองเห็นบนจอ** ให้ห่อด้วย `<Untranslated>` จาก `lib/i18n/office`
  → มันติด `lang="th"` ให้ ซึ่งเป็นคำอธิบายที่ตรงความจริง (โปรแกรมอ่านหน้าจอ
  จะได้ไม่ออกเสียงภาษาไทยด้วยกฎภาษาเยอรมัน) และทำให้ `scripts/i18n-test.ts`
  ไม่ฟ้องว่า "ข้อความไทยหลุด" ซึ่งเป็นการฟ้องของที่ตั้งใจให้เป็นแบบนั้น
  **ป้ายหายเองวันที่แปลเสร็จ** เพราะมันเช็คจากตัวอักษรจริง ไม่ใช่รายชื่อกุญแจ
  → `aria-label`/`title` ห่อไม่ได้ (เป็นแอตทริบิวต์) แต่ด่านก็ไม่ได้ตรวจ

## วันที่ระบบเสร็จ 100%

เจ้าของจะสั่งให้แปลเอง ตอนนั้นค่อยไล่แปลทีเดียวทั้งหมด — โครงพร้อมแล้ว
(`lib/i18n/office-dict/*.ts` 16 ไฟล์ · `lib/i18n/dict/*.ts` 16 ไฟล์ ·
`scripts/office-dict-check.mjs` ตรวจความครบ · `scripts/i18n-test.ts` ตรวจบนหน้าจริง)

**ห้ามแปลล่วงหน้าเอง** ถ้าเจ้าของยังไม่สั่ง
