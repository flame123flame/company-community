-- ===========================================================================
-- 0067 · ซ่อมหมวดค่าใช้จ่าย — ผมเดาชื่อ constraint แล้วเดาผิด
-- ===========================================================================
--
-- ★★★ อาการ: หมวดใหม่ (TRANSPORT · SUPPLIES · FUN) ถูกปฏิเสธทั้งที่
--     0065 เขียนไว้ว่าเพิ่มแล้ว
--
--     ★ 0065 สั่ง drop constraint if exists expense_bills_category_check
--       ★★ แต่ชื่อจริงที่ 0026 ตั้งไว้คือ expense_bills_category (ไม่มี _check)
--          ★ `if exists` จึงไม่เจอ แล้วผ่านไปเงียบ ๆ ไม่มี error ให้เห็น
--     ★★★ ผลคือตอนนี้มีสอง constraint ซ้อนกันบนคอลัมน์เดียว
--          · expense_bills_category        → ของเดิม 3 หมวด
--          · expense_bills_category_check  → ของใหม่ 6 หมวด
--          ★ แถวต้องผ่านทั้งคู่ จึงเท่ากับยังมีแค่ 3 หมวดเหมือนเดิม
--            ★★ COFFEE ผ่าน (อยู่ในทั้งสอง) แต่ TRANSPORT ไม่ผ่าน
--
-- ★★ นี่คือความผิดพลาดแบบเดียวกับ 0065/0066 ซ้ำรอบที่สอง:
--    เดาชื่อของที่มีอยู่แล้ว แทนที่จะไปอ่านของจริงก่อน
--    ★ ครั้งนี้ `if exists` ทำให้มันเงียบ ซึ่งแย่กว่า error เพราะไม่มีสัญญาณเลย
--      ★★ ไฟล์นี้จึงลบ "ทั้งสองชื่อ" ทิ้ง แล้วสร้างใหม่ชื่อเดียวตามของเดิม

alter table public.expense_bills
  drop constraint if exists expense_bills_category;

alter table public.expense_bills
  drop constraint if exists expense_bills_category_check;

/* ★ ใช้ชื่อเดิมของ 0026 — โปรเจกต์นี้ตั้งชื่อ constraint เองทุกตัว
     ★★ ปล่อยให้ Postgres ตั้งชื่อเอง แปลว่าครั้งหน้าก็ต้องมาเดาอีก */
alter table public.expense_bills
  add constraint expense_bills_category
  check (category in ('FOOD', 'COFFEE', 'TRANSPORT', 'SUPPLIES', 'FUN', 'OTHER'));

comment on column public.expense_bills.category is
  'หมวดค่าใช้จ่าย — เพิ่มสามหมวดใน 0065/0067 ตอนเปิดให้บันทึกค่าใช้จ่ายของตัวเอง';
