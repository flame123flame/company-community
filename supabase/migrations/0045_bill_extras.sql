-- ===========================================================================
-- 0045 · ค่าส่ง · ส่วนลด · ปัดเศษ · กลุ่มคนที่หารด้วยบ่อย
-- ===========================================================================
--
-- ★★★ ทุกคอลัมน์มี default — บิลเก่าทุกใบยังอ่านได้เหมือนเดิม
--
--     ★ ตอนรัน migration นี้มีบิลจริงอยู่แล้ว 23 ใบ และหนี้ 139 แถว
--       ★★ ข้อกำหนดของงานระบุชัดว่า "ห้ามทำข้อมูลบิล/หนี้ที่มีอยู่เสียหาย"
--     ★ default 0 / false ทำให้บิลเก่ามีค่าที่ถูกต้องโดยไม่ต้องเขียนทับอะไร
--       ★★ ไม่ใช่ null ซึ่งจะบังคับให้ทุกจุดที่อ่านต้องเช็ค null ตลอดไป

alter table public.expense_bills
  add column if not exists delivery_fee numeric(12,2) not null default 0
    constraint expense_bills_delivery_nonneg check (delivery_fee >= 0),
  add column if not exists discount numeric(12,2) not null default 0
    constraint expense_bills_discount_nonneg check (discount >= 0),
  /*
   * ★ เก็บว่า "บิลใบนี้ปัดเศษไหม" ไม่ได้เก็บแค่ผลลัพธ์
   *   ★★ ยอดต่อคนอยู่ใน debts.amount อยู่แล้ว ★ แต่ตอนเปิดบิลเก่ามาดู
   *      หรือทำซ้ำ ต้องรู้ว่าตอนนั้นเลือกแบบไหน ไม่ใช่เดาจากตัวเลข
   */
  add column if not exists rounded boolean not null default false;

comment on column public.expense_bills.delivery_fee is
  'ค่าส่ง — หารเท่ากันทุกคน รวมอยู่ใน total_amount แล้ว';
comment on column public.expense_bills.discount is
  'ส่วนลด — หักตามสัดส่วนของแต่ละคน หักออกจาก total_amount แล้ว';


-- ---------------------------------------------------------------------------
-- กลุ่มคนที่หารด้วยบ่อย
-- ---------------------------------------------------------------------------
-- ★★★ ระบบเสนอให้บันทึกเอง ไม่ได้ให้ผู้ใช้ไปสร้างกลุ่มเอง
--
--     ★ ข้อกำหนดระบุว่า "หลังบันทึกบิลที่มีคนชุดเดิมซ้ำ 3 ครั้ง ให้ถามว่า
--       บันทึกเป็นกลุ่มไหม" ★★ ซึ่งถูก — คนไม่เข้าหน้าตั้งค่าไปสร้างกลุ่ม
--       ล่วงหน้า เขาแค่หารค่าข้าวกับคนกลุ่มเดิมทุกวันโดยไม่รู้ตัว
--     ★ ตารางนี้จึงถูกเขียนจาก "ปุ่มยืนยันบนหน้าสร้างบิล" เป็นหลัก
--
-- ★★ member_ids เป็น uuid[] ไม่ใช่ตารางลูก
--    ★ กลุ่มคือ "ภาพถ่าย ณ ตอนบันทึก" เหมือน name_sets ของโมดูลสุ่ม —
--      ★★ คนลาออกไปแล้ว กลุ่มเก่าควรยังเปิดดูได้ว่าตอนนั้นมีใครบ้าง
--    ★ และไม่มีหน้าไหนต้องถามว่า "คนนี้อยู่กี่กลุ่ม" ซึ่งเป็นคำถามเดียว
--      ที่ตารางลูกจะตอบได้เร็วกว่า
create table if not exists public.split_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,

  name       text not null
             constraint split_groups_name_len
             check (char_length(btrim(name)) between 1 and 40),

  member_ids uuid[] not null
             constraint split_groups_members_len
             check (array_length(member_ids, 1) between 1 and 50),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.split_groups is
  'กลุ่มคนที่หารค่าข้าวด้วยบ่อย — ระบบเสนอให้บันทึกหลังใช้ชุดเดิมซ้ำหลายครั้ง';

create index if not exists split_groups_owner_idx
  on public.split_groups (owner_id, created_at desc);

/*
 * ★ กลุ่มเป็นของส่วนตัวของคนสร้าง ไม่ใช่ของทั้งบริษัท
 *   ★★ "แก๊งข้าวเที่ยง" ของแต่ละคนไม่เหมือนกัน และการเห็นกลุ่มของคนอื่น
 *      ก็คือการเห็นว่าใครกินข้าวกับใครบ่อย ซึ่งไม่ใช่เรื่องของเรา
 */
alter table public.split_groups enable row level security;

drop policy if exists split_groups_own on public.split_groups;
create policy split_groups_own on public.split_groups
  for select using (owner_id = auth.uid());

/* ★ เขียนผ่าน route ที่ใช้ service role เท่านั้น — ไม่มี policy insert/update/delete */
