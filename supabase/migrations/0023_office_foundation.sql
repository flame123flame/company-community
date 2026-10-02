-- ═══════════════════════════════════════════════════════════════════
-- 0023 · ส่วนกลางของระบบกิจกรรมออฟฟิศ
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-X02  รหัสพนักงาน + สมัคร/ผูกบัญชี
--   FR-X04  แจ้งเตือนในระบบ
--   FR-X08  กลไกรายงานเนื้อหากลาง
--   FR-X09  ค่าตั้งระบบ + สิทธิ์ Admin
--   NFR-05  audit log ของรายการเงิน
--
-- ★★★ ไฟล์นี้ "เพิ่มของใหม่" ล้วน ไม่แตะตารางหรือฟังก์ชันเดิมของห้องเพลง
--
--     คอลัมน์ที่เพิ่มใน profiles เป็น nullable หรือมี default ทั้งหมด
--     แถวเดิมจึงยังถูกต้องโดยไม่ต้อง backfill และโค้ดเดิมที่ select
--     เฉพาะคอลัมน์ที่มันรู้จักก็ไม่เห็นความเปลี่ยนแปลงเลย
--
-- ★★ ตัวตนยังเป็น auth.users ชุดเดิม
--
--    ผู้ใช้เดิมที่เข้าด้วย username ไม่ต้องสมัครใหม่ — เมื่อจะใช้โมดูลออฟฟิศ
--    ค่อยผูกรหัสพนักงาน + อีเมลจริง + รหัสผ่านเข้ากับ user id เดิม
--    ประวัติเพลง ห้อง และแชททั้งหมดจึงยังเป็นของคนเดิมทุกแถว
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · รหัสพนักงาน
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ เก็บ "รหัสอย่างเดียว" ตามที่เอกสารกำหนด ไม่มีชื่อหรือข้อมูลบุคคล
--
--    ชื่อ ชื่อเล่น ฝ่าย พนักงานกรอกเองตอนสมัคร ตารางนี้จึงไม่ใช่ข้อมูล
--    ส่วนบุคคลตาม PDPA และ Admin ที่นำเข้า CSV ไม่ต้องถือรายชื่อพนักงาน
--    ทั้งบริษัทไว้ในระบบนี้ — ลดของที่ต้องปกป้องลงเหลือน้อยที่สุด

create table if not exists public.employee_codes (
  -- ★ เก็บเป็นตัวพิมพ์ใหญ่เสมอ (normalize ที่ RPC) จะได้ไม่มี 'a001' กับ 'A001'
  --   เป็นคนละรหัสกัน ซึ่งเป็นกับดักเดียวกับที่ 0017 เลี่ยงไว้ตอนทำ username
  code        text primary key
              constraint employee_codes_format
              check (code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),

  -- ACTIVE = ยังเป็นพนักงาน · RESIGNED = ลาออกแล้ว (บัญชีถูกระงับอัตโนมัติ)
  status      text not null default 'ACTIVE'
              constraint employee_codes_status
              check (status in ('ACTIVE', 'RESIGNED')),

  /*
   * ★ 1 รหัส = 1 บัญชี บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่เช็คในโค้ด
   *   unique index ด้านล่างเป็นตัวกันจริงตอนสองคนยิงสมัครพร้อมกัน
   *   ด้วยรหัสเดียวกัน — โค้ดที่ "เช็คก่อนแล้วค่อยเขียน" กันกรณีนี้ไม่ได้
   */
  claimed_by  uuid references public.profiles(id) on delete set null,
  claimed_at  timestamptz,

  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);

comment on table public.employee_codes is
  'รายชื่อรหัสพนักงานที่มีสิทธิ์สมัคร — เก็บเฉพาะรหัส ไม่มีข้อมูลบุคคล (FR-X02)';

-- ★★ หนึ่งคนถือรหัสพนักงานได้ใบเดียว และหนึ่งรหัสมีเจ้าของได้คนเดียว
--    partial เพราะรหัสที่ยังไม่มีคนใช้เป็น null ซึ่งต้องซ้ำกันได้
create unique index if not exists employee_codes_claimed_by_key
  on public.employee_codes (claimed_by)
  where claimed_by is not null;

create index if not exists employee_codes_status_idx
  on public.employee_codes (status);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ส่วนขยายของ profiles
-- ═════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists department     text,
  add column if not exists employee_code  text,
  add column if not exists is_admin       boolean not null default false,
  add column if not exists account_status text not null default 'ACTIVE',
  -- ★ QR รับเงิน (FR-B03/FR-X06) — เก็บ path ใน private bucket ไม่ใช่ public URL
  --   เหตุผลอยู่ที่ NFR-07: รูปนี้ต้องเห็นเฉพาะคู่ที่มีรายการเงินกันจริง
  add column if not exists payment_qr_path text;

alter table public.profiles drop constraint if exists profiles_department_len;
alter table public.profiles
  add constraint profiles_department_len
  check (department is null or char_length(department) between 1 and 60);

alter table public.profiles drop constraint if exists profiles_account_status;
alter table public.profiles
  add constraint profiles_account_status
  check (account_status in ('ACTIVE', 'SUSPENDED'));

comment on column public.profiles.employee_code is
  'รหัสพนักงานที่ผูกไว้ — null = ยังใช้ได้แค่ห้องเพลง ยังเข้าโมดูลออฟฟิศไม่ได้';
comment on column public.profiles.account_status is
  'SUSPENDED = ถูกระงับ (Admin สั่ง หรือรหัสพนักงานเปลี่ยนเป็นลาออก)';

/*
 * ★ ไม่ผูก foreign key จาก profiles.employee_code ไป employee_codes.code
 *
 *   ความจริงของ "ใครถือรหัสไหน" อยู่ที่ employee_codes.claimed_by ซึ่งมี
 *   unique index คุมอยู่แล้ว คอลัมน์นี้เป็นสำเนาไว้อ่านเร็วโดยไม่ต้อง join
 *   ทุกครั้งที่แสดงโปรไฟล์
 *
 *   ★ ถ้าผูก FK แล้ว Admin ลบรหัสทิ้ง จะลบไม่ได้จนกว่าจะไปแก้ profiles ก่อน
 *     ซึ่งทำให้หน้า Admin พังในแบบที่อธิบายให้ผู้ใช้เข้าใจยาก
 *     ทั้งสองคอลัมน์ถูกเขียนพร้อมกันในทรานแซกชันเดียวเสมอ (ดู claim_employee_code)
 */
create index if not exists profiles_employee_code_idx
  on public.profiles (employee_code)
  where employee_code is not null;

create index if not exists profiles_admin_idx
  on public.profiles (id) where is_admin;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · แจ้งเตือนในระบบ (FR-X04)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ในระบบเท่านั้น ไม่มีอีเมล — ตรงตามเอกสาร
--    ไม่มี SMTP ให้ตั้ง ไม่มี bounce ให้ตาม และไม่มีข้อมูลรั่วออกนอกระบบ

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,

  -- ชนิดของแจ้งเตือน — ตรงกับสวิตช์ในหน้าตั้งค่า (ดู notification_prefs)
  type       text not null
             constraint notifications_type_len check (char_length(type) between 1 and 40),

  /*
   * ★ เก็บ "คีย์ข้อความ" ไม่ใช่ข้อความสำเร็จรูป
   *   ระบบรองรับไทย/อังกฤษ (NFR-09) ถ้าเก็บข้อความไทยไว้ตอนสร้าง
   *   คนที่สลับเป็นอังกฤษจะเห็นแจ้งเตือนเก่าเป็นไทยค้างตลอดไป
   *   ★ เก็บคีย์ + ตัวแปร แล้วแปลตอนแสดงผล = สลับภาษาแล้วเปลี่ยนย้อนหลังทั้งหมด
   */
  title_key  text not null,
  params     jsonb not null default '{}'::jsonb,

  /** ลิงก์ปลายทางเมื่อกดแจ้งเตือน เช่น '/wallet/owed' */
  link       text,

  read_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'แจ้งเตือนในระบบ — เก็บคีย์ข้อความ ไม่ใช่ข้อความสำเร็จรูป เพื่อให้สลับภาษาได้ย้อนหลัง';

-- ★ query เดียวที่เกิดจริง: "แจ้งเตือนของฉัน เรียงใหม่สุดก่อน"
create index if not exists notifications_user_time_idx
  on public.notifications (user_id, created_at desc);

-- ★ ตัวเลขบนกระดิ่ง — partial index ทำให้นับเฉพาะที่ยังไม่อ่านได้เร็วมาก
--   และ index เล็กเพราะคนส่วนใหญ่อ่านแจ้งเตือนหมดแล้ว
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;


create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type    text not null,
  enabled boolean not null default true,
  primary key (user_id, type)
);

comment on table public.notification_prefs is
  'สวิตช์เปิด/ปิดแจ้งเตือนรายประเภท — ★ ไม่มีแถว = เปิด (ค่าเริ่มต้นคือได้รับ)';


-- ═════════════════════════════════════════════════════════════════════
-- 4 · กลไกรายงานเนื้อหากลาง (FR-X08)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ตารางเดียวใช้ได้กับทุกอย่างที่รายงานได้ (ร้าน FR-A05 · ประกาศ FR-D10)
--
--    ทางเลือกอื่นคือใส่คอลัมน์ report_count ลงในทุกตารางที่รายงานได้
--    ซึ่งทำให้ "ใครรายงานไปแล้วบ้าง" หายไป แล้วกันคนเดิมกดซ้ำไม่ได้
--    และเพิ่มของที่รายงานได้ทีไรต้อง migrate ตารางนั้นใหม่ทุกครั้ง

create table if not exists public.content_reports (
  -- 'restaurant' | 'listing' — ★ ไม่ใช้ FK เพราะชี้ได้หลายตาราง
  target_type text not null
              constraint content_reports_type
              check (target_type in ('restaurant', 'listing')),
  target_id   uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text
              constraint content_reports_reason_len
              check (reason is null or char_length(reason) <= 200),
  created_at  timestamptz not null default now(),

  -- ★ หนึ่งคนรายงานสิ่งเดียวได้ครั้งเดียว — ไม่งั้นคนเดียวกดสามครั้งซ่อนได้เอง
  primary key (target_type, target_id, reporter_id)
);

create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);


-- ═════════════════════════════════════════════════════════════════════
-- 5 · ค่าตั้งระบบ (FR-X09)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ key-value ไม่ใช่คอลัมน์ละค่า — เหตุผลเดียวกับ appearance ใน 0019
--   ค่าตั้งจะเพิ่มขึ้นเรื่อย ๆ และไม่เคยถูก query แบบมีเงื่อนไข
--   ถ้าแยกคอลัมน์ การเพิ่มค่าตั้งหนึ่งตัว = migration หนึ่งไฟล์ทุกครั้ง

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.app_settings (key, value) values
  ('report_threshold',    '3'::jsonb),      -- FR-X08 · กี่คนรายงานถึงซ่อน
  ('no_repeat_days',      '7'::jsonb),      -- FR-A08 · ไม่สุ่มร้านที่เพิ่งไป
  ('reminder_days',       '[1,3,7]'::jsonb),-- FR-B05 · รอบทวงอัตโนมัติ
  ('lottery_next_draw',   'null'::jsonb),   -- FR-C11 · วันออกรางวัลงวดถัดไป
  ('sticker_max_per_room','60'::jsonb)      -- ★ ของเดิมจาก 0018 ย้ายมาตั้งที่นี่ได้
on conflict (key) do nothing;


-- ═════════════════════════════════════════════════════════════════════
-- 6 · Audit log (NFR-05)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ บังคับเฉพาะ "การแก้ไขรายการเงิน" ตามที่ NFR-05 ระบุ
--   ไม่ log ทุกอย่างในระบบ เพราะ log ที่ไม่มีใครอ่านคือค่าใช้จ่ายเปล่า
--   และทำให้ log ที่สำคัญจริงหาไม่เจอ

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_target_idx
  on public.audit_log (target_type, target_id, created_at desc);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════
-- 7 · Helper
-- ═════════════════════════════════════════════════════════════════════

/**
 * ผู้ใช้คนนี้เป็น Admin ไหม
 *
 * ★ ต้องเป็น SECURITY DEFINER ด้วยเหตุผลเดียวกับ is_room_member ใน 0004
 *   policy ของ profiles จะเรียกตัวนี้ ถ้าไม่ใช่ definer จะวนเรียกตัวเองไม่จบ
 */
create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin and p.account_status = 'ACTIVE'
     from public.profiles p where p.id = p_user),
    false
  );
$$;

/** ผู้เรียกคนปัจจุบันเป็น Admin ไหม — ใช้ใน RLS policy */
create or replace function public.viewer_is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin((select auth.uid()));
$$;

/** อ่านค่าตั้งระบบพร้อมค่าสำรอง — ทุก RPC ที่ต้องใช้ค่าตั้งเรียกผ่านตัวนี้ */
create or replace function public.setting(p_key text, p_fallback jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value from public.app_settings s where s.key = p_key), p_fallback);
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 8 · ผูกรหัสพนักงาน (FR-X02)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ ทำไมต้องเป็น RPC ทรานแซกชันเดียว ไม่ใช่ UPDATE สองคำสั่งจาก API
--
--     ต้องเขียนสองที่พร้อมกัน: employee_codes.claimed_by และ profiles
--     ถ้าแยกคำสั่งแล้วคำสั่งที่สองล้ม จะได้รหัสที่ "ถูกจองแล้วแต่ไม่มีเจ้าของ"
--     ซึ่งกู้คืนไม่ได้เลยนอกจาก Admin เข้าไปแก้ฐานข้อมูลเอง
--
--     ★ และการ claim ต้องกันสองคนที่ยิงพร้อมกันด้วยรหัสเดียวกันได้จริง
--       `where claimed_by is null` ใน UPDATE + unique index เป็นตัวกัน
--       ไม่ใช่การ SELECT ตรวจก่อนแล้วค่อยเขียน ซึ่งมีช่องว่างตรงกลางเสมอ

create or replace function public.claim_employee_code(
  p_actor        uuid,
  p_code         text,
  p_display_name text,
  p_nickname     text default null,
  p_department   text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_row     public.employee_codes;
  v_profile public.profiles;
begin
  if p_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_profile from public.profiles where id = p_actor;
  if not found then
    raise exception 'UNAUTHORIZED';
  end if;

  -- ★ ผูกซ้ำด้วยรหัสเดิม = ไม่ต้องทำอะไร (idempotent)
  --   เกิดจริงเมื่อผู้ใช้กดปุ่มสองครั้งหรือ request ถูกส่งซ้ำ
  if v_profile.employee_code = v_code then
    return v_profile;
  end if;

  if v_profile.employee_code is not null then
    raise exception 'ALREADY_LINKED';
  end if;

  select * into v_row from public.employee_codes where code = v_code;

  -- ★★ ไม่มีรหัสนี้ กับ รหัสถูกใช้ไปแล้ว ต้องตอบ error คนละตัว
  --    เพื่อให้ผู้ใช้รู้ว่าควรไปถาม Admin หรือควรตรวจว่าตัวเองเคยสมัครแล้ว
  --    (ไม่ใช่ข้อมูลที่เป็นความลับ — คนกรอกต้องถือรหัสนั้นอยู่แล้วจึงจะถามถึงได้)
  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;

  if v_row.status <> 'ACTIVE' then
    raise exception 'CODE_INACTIVE';
  end if;

  if v_row.claimed_by is not null then
    raise exception 'CODE_TAKEN';
  end if;

  /*
   * ★★ `where claimed_by is null` คือด่านจริง ไม่ใช่ if ข้างบน
   *    if ข้างบนมีไว้ให้ได้ error message ที่ถูกต้อง แต่ระหว่างที่ตรวจเสร็จ
   *    กับตอนเขียน มีช่องว่างที่คนอื่นแทรกได้เสมอ — เงื่อนไขใน UPDATE ปิดช่องนั้น
   */
  update public.employee_codes
     set claimed_by = p_actor, claimed_at = now()
   where code = v_code and claimed_by is null;

  if not found then
    raise exception 'CODE_TAKEN';
  end if;

  update public.profiles
     set employee_code = v_code,
         display_name  = coalesce(nullif(btrim(p_display_name), ''), display_name),
         nickname      = coalesce(nullif(btrim(p_nickname), ''), nickname),
         department    = nullif(btrim(p_department), '')
   where id = p_actor
   returning * into v_profile;

  return v_profile;
end;
$$;


/**
 * เปลี่ยนสถานะรหัสพนักงาน — ลาออกแล้วระงับบัญชีที่ผูกไว้อัตโนมัติ (FR-X02)
 *
 * ★ ทำในฟังก์ชันเดียวไม่ใช่ trigger เพราะการระงับบัญชีเป็นผลที่ Admin
 *   ตั้งใจให้เกิด ไม่ใช่ผลข้างเคียงที่ซ่อนอยู่ — คนอ่านโค้ดหน้า Admin
 *   ต้องเห็นได้จากตรงนี้ว่ากดปุ่มนี้แล้วเกิดอะไรขึ้นบ้าง
 */
create or replace function public.set_employee_code_status(
  p_actor uuid,
  p_code  text,
  p_status text
)
returns public.employee_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row  public.employee_codes;
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('ACTIVE', 'RESIGNED') then
    raise exception 'VALIDATION_FAILED: unknown status %', p_status;
  end if;

  update public.employee_codes
     set status = p_status
   where code = v_code
   returning * into v_row;

  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;

  if v_row.claimed_by is not null then
    update public.profiles
       set account_status = case when p_status = 'RESIGNED' then 'SUSPENDED' else 'ACTIVE' end
     where id = v_row.claimed_by;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'employee_code.status', 'employee_code', v_code,
          jsonb_build_object('status', p_status));

  return v_row;
end;
$$;


/** Admin ระงับ/คืนสถานะบัญชี (FR-X09) */
create or replace function public.set_account_status(
  p_actor  uuid,
  p_target uuid,
  p_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'VALIDATION_FAILED: unknown status %', p_status;
  end if;

  -- ★ Admin ระงับตัวเองไม่ได้ — ถ้าเป็น Admin คนเดียวจะไม่เหลือใครปลดล็อกให้
  if p_target = p_actor then
    raise exception 'VALIDATION_FAILED: cannot suspend yourself';
  end if;

  update public.profiles set account_status = p_status
   where id = p_target returning * into v_row;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'account.status', 'profile', p_target::text,
          jsonb_build_object('status', p_status));

  return v_row;
end;
$$;


/** Admin มอบ/ถอนสิทธิ์ Admin */
create or replace function public.set_admin_role(
  p_actor  uuid,
  p_target uuid,
  p_admin  boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.profiles;
  v_count integer;
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★★ ห้ามถอนสิทธิ์ Admin คนสุดท้าย
   *    ระบบที่ไม่มี Admin เหลือเลยคือระบบที่กู้คืนไม่ได้จากในแอป —
   *    ต้องเข้าไปแก้ฐานข้อมูลตรง ๆ ซึ่งคนที่ดูแลระบบอาจทำไม่เป็น
   */
  if not p_admin then
    select count(*) into v_count
    from public.profiles where is_admin and account_status = 'ACTIVE' and id <> p_target;
    if v_count = 0 then
      raise exception 'VALIDATION_FAILED: last admin';
    end if;
  end if;

  update public.profiles set is_admin = p_admin
   where id = p_target returning * into v_row;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'account.admin', 'profile', p_target::text,
          jsonb_build_object('is_admin', p_admin));

  return v_row;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 9 · แจ้งเตือน (FR-X04)
-- ═════════════════════════════════════════════════════════════════════

/**
 * ส่งแจ้งเตือนหนึ่งใบ — เคารพสวิตช์ของผู้รับ
 *
 * ★ ทุกโมดูลเรียกตัวนี้ตัวเดียว ห้าม insert เข้า notifications ตรง ๆ
 *   ไม่งั้นสวิตช์ปิดแจ้งเตือนในหน้าตั้งค่าจะไม่มีผลกับบางที่ แล้วผู้ใช้จะ
 *   เจออาการ "ปิดแล้วแต่ยังเด้ง" ซึ่งไล่หาสาเหตุยากมาก
 */
create or replace function public.notify(
  p_user      uuid,
  p_type      text,
  p_title_key text,
  p_params    jsonb default '{}'::jsonb,
  p_link      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user is null then return null; end if;

  -- ★ ไม่มีแถวใน prefs = เปิด (coalesce ให้ true) ผู้ใช้ใหม่จึงได้รับทุกอย่าง
  --   โดยไม่ต้อง seed แถวตอนสมัคร
  if not coalesce(
       (select enabled from public.notification_prefs
         where user_id = p_user and type = p_type),
       true) then
    return null;
  end if;

  -- ★ ไม่ส่งให้บัญชีที่ถูกระงับ — เขาเข้ามาอ่านไม่ได้อยู่แล้ว
  if not exists (
    select 1 from public.profiles where id = p_user and account_status = 'ACTIVE'
  ) then
    return null;
  end if;

  insert into public.notifications (user_id, type, title_key, params, link)
  values (p_user, p_type, p_title_key, coalesce(p_params, '{}'::jsonb), p_link)
  returning id into v_id;

  return v_id;
end;
$$;


/** อ่านแล้ว — ไม่ส่ง id มา = อ่านทั้งหมด */
create or replace function public.mark_notifications_read(
  p_actor uuid,
  p_ids   uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = p_actor
     and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


/** เปิด/ปิดแจ้งเตือนรายประเภท */
create or replace function public.set_notification_pref(
  p_actor   uuid,
  p_type    text,
  p_enabled boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_prefs (user_id, type, enabled)
  values (p_actor, p_type, p_enabled)
  on conflict (user_id, type) do update set enabled = excluded.enabled;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 10 · รายงานเนื้อหา (FR-X08)
-- ═════════════════════════════════════════════════════════════════════

/**
 * รายงานเนื้อหา แล้วบอกกลับว่าครบเกณฑ์ซ่อนหรือยัง
 *
 * ★ ฟังก์ชันนี้ "ไม่" ซ่อนเนื้อหาเอง เพราะแต่ละตารางซ่อนคนละวิธี
 *   (ร้าน = ติดป้ายแล้วย้ายท้ายรายการ · ประกาศ = ซ่อนจากรายการ)
 *   ★ คืนจำนวนกับผลการตัดสินมาให้ แล้วฝั่งที่เรียกเป็นคนลงมือ
 *     เกณฑ์จึงอยู่ที่เดียวแต่การกระทำยังเหมาะกับแต่ละชนิดเนื้อหา
 */
create or replace function public.report_content(
  p_actor       uuid,
  p_target_type text,
  p_target_id   uuid,
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count     integer;
  v_threshold integer := greatest(1, (public.setting('report_threshold', '3'::jsonb))::integer);
begin
  if p_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- ★ กดซ้ำไม่พัง และไม่เพิ่มจำนวน (primary key กันไว้อยู่แล้ว)
  insert into public.content_reports (target_type, target_id, reporter_id, reason)
  values (p_target_type, p_target_id, p_actor, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict do nothing;

  select count(*) into v_count
  from public.content_reports
  where target_type = p_target_type and target_id = p_target_id;

  return jsonb_build_object(
    'reports',   v_count,
    'threshold', v_threshold,
    'hidden',    v_count >= v_threshold
  );
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 11 · Row Level Security
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ หลักการเดียวกับ 0005 ทุกประการ: client อ่านผ่าน RLS · เขียนผ่าน RPC
--   ตารางไหนไม่มี policy เขียน = ปฏิเสธการเขียนทั้งหมด (default deny)

alter table public.employee_codes     enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.content_reports    enable row level security;
alter table public.app_settings       enable row level security;
alter table public.audit_log          enable row level security;

revoke all on public.employee_codes, public.notifications, public.notification_prefs,
              public.content_reports, public.app_settings, public.audit_log
  from anon, authenticated;

grant select on public.notifications, public.notification_prefs, public.app_settings
  to authenticated;

/*
 * ★★★ employee_codes ไม่มี policy อ่านสำหรับผู้ใช้ทั่วไป และต้องไม่มี
 *
 *     ถ้าอ่านได้ ใครก็ดึงรายการรหัสพนักงานทั้งบริษัทไปได้ แล้วเอาไปสมัคร
 *     สวมรอยคนที่ยังไม่เคยสมัคร — ซึ่งทำลายด่านเข้าระบบทั้งด่าน
 *     ★ การตรวจว่า "รหัสนี้ใช้ได้ไหม" ทำฝั่ง server ผ่าน RPC เท่านั้น
 *       และมี rate limit 5 ครั้ง/15 นาทีกันการไล่เดา (FR-X02)
 */
drop policy if exists "employee_codes: admin read" on public.employee_codes;
create policy "employee_codes: admin read"
  on public.employee_codes for select to authenticated
  using (public.viewer_is_admin());

drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notification_prefs: read own" on public.notification_prefs;
create policy "notification_prefs: read own"
  on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

-- ★ ค่าตั้งระบบอ่านได้ทุกคน — ไม่ใช่ความลับ และหน้าเว็บต้องใช้แสดงผล
--   (เช่น "รายงานอีก 2 คนจะถูกซ่อน") การซ่อนมันทำให้ UI โกหกผู้ใช้
drop policy if exists "app_settings: read all" on public.app_settings;
create policy "app_settings: read all"
  on public.app_settings for select to authenticated
  using (true);

-- ★ content_reports และ audit_log ไม่มี policy เลย = ไม่มีใครอ่านได้นอกจาก
--   service_role ★ ตั้งใจ: "ใครรายงานใคร" และ log การเงินไม่ควรเปิดให้ client


-- ═════════════════════════════════════════════════════════════════════
-- 12 · ตรวจสอบตัวเอง — ต้องไม่มี policy ที่เปิดกว้างเกินไป
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ด่านเดียวกับที่ 0005 วางไว้ แต่ยกเว้น app_settings ที่ตั้งใจให้อ่านได้ทุกคน
--   (เป็นค่าตั้งสาธารณะ ไม่มีข้อมูลของใครอยู่ในนั้น)
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ')
  into v_bad
  from pg_policies
  where schemaname = 'public'
    and tablename <> 'app_settings'
    and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');

  if v_bad is not null then
    raise exception 'พบ RLS policy ที่เปิดกว้างเกินไป (USING true): %', v_bad;
  end if;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 13 · Realtime
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ กระดิ่งต้องเด้งทันทีที่มีแจ้งเตือนใหม่ (FR-X04) — RLS กรองให้เอง
--   คนอื่นจึงไม่มีทางได้รับ payload ของแจ้งเตือนที่ไม่ใช่ของตัวเอง
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 14 · Grants — เหตุผลเต็มอยู่ใน 0004
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ทุกฟังก์ชันที่รับ p_actor เป็นพารามิเตอร์ = ผู้เรียก "บอกเองได้ว่าเป็นใคร"
--   ปลอดภัยเฉพาะเมื่อผู้เรียกคือ Route Handler ของเราที่อ่าน actor จาก session

revoke execute on function
  public.claim_employee_code(uuid, text, text, text, text),
  public.set_employee_code_status(uuid, text, text),
  public.set_account_status(uuid, uuid, text),
  public.set_admin_role(uuid, uuid, boolean),
  public.notify(uuid, text, text, jsonb, text),
  public.mark_notifications_read(uuid, uuid[]),
  public.set_notification_pref(uuid, text, boolean),
  public.report_content(uuid, text, uuid, text),
  public.is_admin(uuid),
  public.setting(text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.claim_employee_code(uuid, text, text, text, text),
  public.set_employee_code_status(uuid, text, text),
  public.set_account_status(uuid, uuid, text),
  public.set_admin_role(uuid, uuid, boolean),
  public.notify(uuid, text, text, jsonb, text),
  public.mark_notifications_read(uuid, uuid[]),
  public.set_notification_pref(uuid, text, boolean),
  public.report_content(uuid, text, uuid, text),
  public.is_admin(uuid),
  public.setting(text, jsonb)
to service_role;

-- ★ viewer_is_admin ถูกเรียกจาก RLS policy ของ employee_codes
--   ผู้ใช้ที่ login แล้วจึงต้องเรียกได้ — ปลอดภัยเพราะอ่าน auth.uid() ของตัวเอง
--   ไม่รับ actor จากภายนอกเลย
revoke execute on function public.viewer_is_admin() from public, anon;
grant execute on function public.viewer_is_admin() to authenticated, service_role;
