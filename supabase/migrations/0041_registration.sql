-- ═════════════════════════════════════════════════════════════════════
-- 0041 · ระบบสมัครสมาชิกเต็มรูปแบบ
--
-- ★★★ เดิมเข้าระบบด้วย username ช่องเดียว ไม่มีรหัสผ่าน (ดู 0017)
--     แล้วค่อยไปผูกรหัสพนักงานที่ /office/link เป็นขั้นที่สอง
--
--     ★ ของใหม่รวมสองขั้นเป็นฟอร์มเดียว และเก็บข้อมูลพนักงานครบชุด
--       ★★ คนสมัครกรอกครั้งเดียวจบ ไม่ใช่กรอกชื่อ แล้วเด้งไปกรอกรหัสอีกหน้า
--
-- ★★★ บัญชีเดิมที่ไม่มีรหัสผ่านต้องเข้าได้เหมือนเดิม
--
--     ★ ถ้าบังคับรหัสผ่านย้อนหลัง คนที่สมัครไปแล้วทั้งหมดจะเข้าไม่ได้ทันที
--       ★★ รวมถึงบัญชี Admin ซึ่งเป็นคนเดียวที่แก้สถานการณ์นั้นได้
--          — ระบบจะล็อกตัวเองออกจากตัวเองอย่างถาวร
--     ★ คอลัมน์ใหม่จึงเป็น nullable ทั้งหมด และ "มีรหัสผ่านหรือยัง" เป็น
--       คุณสมบัติของ auth.users ไม่ใช่เงื่อนไขบังคับของ profiles
--
-- ★★ รหัสผ่านไม่ได้เก็บที่นี่ — ใช้ของ Supabase Auth ตรง ๆ
--    ★ 0017 เสนอให้เพิ่มคอลัมน์ pin_hash เอง แต่ GoTrue มีที่เก็บรหัสผ่าน
--      พร้อมการ hash และการจำกัดอัตราการลองอยู่แล้ว
--      ★★ การเขียน hash เองคือการรับผิดชอบเรื่อง crypto โดยไม่จำเป็น
-- ═════════════════════════════════════════════════════════════════════

/* ── 1. ข้อมูลพนักงานเพิ่มเติม ──────────────────────────────────── */

alter table public.profiles
  add column if not exists prefix            text,
  add column if not exists first_name        text,
  add column if not exists last_name         text,
  add column if not exists phone             text,
  add column if not exists company           text,
  add column if not exists position_title    text,
  add column if not exists purpose           text,
  add column if not exists terms_accepted_at timestamptz;

/*
 * ★ ความยาวคุมที่ฐานข้อมูล ไม่ใช่แค่ที่ฟอร์ม
 *   ★★ ฟอร์มกันคนพิมพ์ยาวเกิน แต่กัน API ที่ถูกเรียกตรงไม่ได้
 */
do $$
begin
  alter table public.profiles
    add constraint profiles_prefix_len     check (prefix is null or char_length(prefix) <= 20),
    add constraint profiles_first_name_len check (first_name is null or char_length(first_name) between 1 and 60),
    add constraint profiles_last_name_len  check (last_name is null or char_length(last_name) between 1 and 60),
    add constraint profiles_company_len    check (company is null or char_length(company) <= 80),
    add constraint profiles_position_len   check (position_title is null or char_length(position_title) <= 80),
    add constraint profiles_purpose_len    check (purpose is null or char_length(purpose) <= 500);
exception
  when duplicate_object then null;
end $$;

/*
 * ★★ เบอร์โทรเก็บเป็นตัวเลขล้วน ตัดขีดและวงเล็บทิ้งตั้งแต่ตอนเขียน
 *    ★ "081-234-5678" กับ "0812345678" เป็นเบอร์เดียวกัน แต่ถ้าเก็บดิบ ๆ
 *      การค้นหาจะเจอแค่แบบที่พิมพ์ตรงกันเป๊ะ
 */
do $$
begin
  alter table public.profiles
    add constraint profiles_phone_digits check (phone is null or phone ~ '^[0-9]{8,15}$');
exception
  when duplicate_object then null;
end $$;

/* ── 2. สมัครสมาชิก ─────────────────────────────────────────────── */

/**
 * เขียนข้อมูลพนักงานทั้งชุด + ผูกรหัสพนักงาน ในคำสั่งเดียว
 *
 * ★★★ ต้องอยู่ใน transaction เดียวกับการยึดรหัสพนักงาน
 *
 *     ★ ถ้าแยกเป็นสองคำสั่งจาก API แล้วคำสั่งที่สองล้ม จะได้บัญชีที่ยึด
 *       รหัสพนักงานไปแล้วแต่ไม่มีชื่อ-นามสกุล
 *       ★★ รหัสนั้นจะใช้ไม่ได้อีกตลอดกาล เพราะ claimed_by ไม่ว่างแล้ว
 *          และเจ้าตัวก็สมัครใหม่ไม่ได้ — ต้องให้ Admin เข้าไปแก้มือ
 *
 * ★ เรียกต่อจาก claim_employee_code ไม่ได้เขียนทับตรรกะนั้น
 *   ★★ กฎเรื่อง "รหัสไม่มี / ถูกใช้แล้ว / ถูกปิด" อยู่ที่เดียวเหมือนเดิม
 *      วันที่กฎเปลี่ยน ทั้งสองทางเข้าจะเปลี่ยนตามพร้อมกัน
 */
create or replace function public.register_employee(
  p_actor     uuid,
  p_code      text,
  p_prefix    text,
  p_first     text,
  p_last      text,
  p_phone     text default null,
  p_company   text default null,
  p_dept      text default null,
  p_position  text default null,
  p_purpose   text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
  v_phone   text;
  v_profile public.profiles;
begin
  if p_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if btrim(coalesce(p_first, '')) = '' or btrim(coalesce(p_last, '')) = '' then
    raise exception 'VALIDATION_FAILED: name';
  end if;

  /* ★ ชื่อที่แสดงประกอบจากคำนำหน้า+ชื่อ+นามสกุล — ไม่ให้กรอกซ้ำอีกช่อง */
  v_display := btrim(
    coalesce(btrim(p_prefix), '') || btrim(p_first) || ' ' || btrim(p_last)
  );

  /* ★ ตัดทุกอย่างที่ไม่ใช่ตัวเลขออกจากเบอร์โทร */
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');

  /* ★★ ยึดรหัสพนักงานก่อน — ถ้าล้มตรงนี้ ทั้ง transaction ถูกยกเลิก
     ★ จึงไม่มีทางได้โปรไฟล์ที่กรอกครบแต่ไม่มีรหัส หรือกลับกัน */
  v_profile := public.claim_employee_code(
    p_actor, p_code, v_display, null, nullif(btrim(coalesce(p_dept, '')), '')
  );

  update public.profiles
     set prefix            = nullif(btrim(coalesce(p_prefix, '')), ''),
         first_name        = btrim(p_first),
         last_name         = btrim(p_last),
         phone             = v_phone,
         company           = nullif(btrim(coalesce(p_company, '')), ''),
         position_title    = nullif(btrim(coalesce(p_position, '')), ''),
         purpose           = nullif(btrim(coalesce(p_purpose, '')), ''),
         terms_accepted_at = now(),
         is_guest          = false,
         updated_at        = now()
   where id = p_actor
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.register_employee(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.register_employee(uuid, text, text, text, text, text, text, text, text, text) to service_role;

/* ── 3. รายชื่อผู้ใช้สำหรับหน้า Admin ───────────────────────────── */

/**
 * ★★ คืนข้อมูลพนักงานครบชุดให้ Admin เห็น
 *    ★ หน้าเดิมแสดงแค่ชื่อ รหัส ฝ่าย ซึ่งไม่พอสำหรับการตรวจว่าใครเป็นใคร
 *      ตอนมีคนสมัครเข้ามาพร้อมกันหลายคน
 *
 * ★ ยังเป็น SECURITY DEFINER + ตรวจ is_admin เองเหมือน RPC อื่นในระบบ
 *   ★★ ข้อมูลชุดนี้มีเบอร์โทรและเหตุผลการขอใช้งาน ซึ่งคนทั่วไปไม่ควรเห็น
 */
create or replace function public.admin_user_list(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      p.id,
      p.username,
      p.display_name,
      p.prefix,
      p.first_name,
      p.last_name,
      p.phone,
      p.company,
      p.department,
      p.position_title,
      p.purpose,
      p.employee_code,
      p.account_status,
      p.is_admin,
      p.terms_accepted_at,
      p.created_at,
      /* ★ บอกว่าบัญชีนี้ตั้งรหัสผ่านแล้วหรือยัง — Admin จะได้รู้ว่าใคร
         ยังเป็นบัญชีรุ่นเก่าที่เข้าด้วย username เปล่า ๆ อยู่ */
      (u.encrypted_password is not null and u.encrypted_password <> '') as has_password
    from public.profiles p
    left join auth.users u on u.id = p.id
  ) x;

  return v_out;
end;
$$;

revoke all on function public.admin_user_list(uuid) from public;
grant execute on function public.admin_user_list(uuid) to service_role;

/**
 * Admin แก้ข้อมูลพนักงานของคนอื่น
 *
 * ★ มีไว้สำหรับกรณีกรอกผิดตอนสมัคร หรือย้ายฝ่าย
 *   ★★ ไม่ให้แก้ username และ employee_code จากที่นี่ — สองอันนั้นเป็น
 *      ตัวตนที่ของอื่นอ้างถึงอยู่ การแก้ต้องผ่านเส้นทางของมันเอง
 */
create or replace function public.admin_update_profile(
  p_actor    uuid,
  p_target   uuid,
  p_prefix   text,
  p_first    text,
  p_last     text,
  p_phone    text,
  p_company  text,
  p_dept     text,
  p_position text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_row   public.profiles;
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if btrim(coalesce(p_first, '')) = '' or btrim(coalesce(p_last, '')) = '' then
    raise exception 'VALIDATION_FAILED: name';
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');

  update public.profiles
     set prefix         = nullif(btrim(coalesce(p_prefix, '')), ''),
         first_name     = btrim(p_first),
         last_name      = btrim(p_last),
         display_name   = btrim(coalesce(btrim(p_prefix), '') || btrim(p_first) || ' ' || btrim(p_last)),
         phone          = v_phone,
         company        = nullif(btrim(coalesce(p_company, '')), ''),
         department     = nullif(btrim(coalesce(p_dept, '')), ''),
         position_title = nullif(btrim(coalesce(p_position, '')), ''),
         updated_at     = now()
   where id = p_target
  returning * into v_row;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'ADMIN_UPDATE_PROFILE', 'profile', p_target::text, jsonb_build_object('name', v_row.display_name));

  return v_row;
end;
$$;

revoke all on function public.admin_update_profile(uuid, uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_profile(uuid, uuid, text, text, text, text, text, text, text) to service_role;

/* ── 4. บัญชีนี้ตั้งรหัสผ่านไว้หรือยัง ──────────────────────────── */

/**
 * ★★★ ต้องถามฐานข้อมูลตรง ๆ — Admin API ของ GoTrue ไม่บอกเรื่องนี้
 *
 *     ★ มันคืน identities ที่มี provider 'email' ทั้งบัญชีที่ตั้งรหัสผ่านแล้ว
 *       และบัญชีที่เกิดจาก magiclink ล้วน ๆ ★★ จึงแยกสองอย่างนี้ไม่ได้
 *       จาก API และถ้าเดาผิดจะกลายเป็น "ข้ามรหัสผ่านได้ด้วยการไม่กรอก"
 *
 * ★ คืนแค่ boolean ไม่คืนตัว hash ★★ ค่าที่คืนออกไปนอกฐานข้อมูลต้องเป็น
 *   คำตอบของคำถาม ไม่ใช่ข้อมูลดิบให้เอาไปคิดต่อเอง
 */
create or replace function public.user_has_password(p_user uuid)
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  select coalesce(
    (select encrypted_password is not null and encrypted_password <> ''
       from auth.users where id = p_user),
    false
  );
$$;

revoke all on function public.user_has_password(uuid) from public;
grant execute on function public.user_has_password(uuid) to service_role;
