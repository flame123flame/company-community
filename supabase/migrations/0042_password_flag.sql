-- ═════════════════════════════════════════════════════════════════════
-- 0042 · ซ่อม "บัญชีนี้ตั้งรหัสผ่านไว้หรือยัง"
--
-- ★★★ อาการ: บัญชีรุ่นเก่าทุกบัญชีถูกขอรหัสผ่าน ทั้งที่ไม่เคยตั้ง
--     → ทุกคนที่ใช้อยู่เดิมเข้าระบบไม่ได้พร้อมกัน รวมถึงบัญชี Admin
--
-- ★★★ สาเหตุ: 0041 เดาว่า auth.users.encrypted_password เป็น null
--     สำหรับบัญชีที่เกิดจาก magiclink
--
--     ★ ของจริงไม่ใช่ — GoTrue เขียนค่าลง encrypted_password ให้ทุกบัญชี
--       ไม่ว่าจะเคยตั้งรหัสผ่านหรือไม่
--       ★★ วัดแล้วกับบัญชีจริงทั้ง 20 ตัวในระบบ: ตอบ true หมดทุกตัว
--          รวมถึงบัญชีที่สมัครมาก่อนจะมีระบบรหัสผ่านเสียอีก
--
-- ★★★ บทเรียน: "ไม่มีค่าในคอลัมน์ของระบบอื่น" ไม่เท่ากับ "ผู้ใช้ไม่เคยทำ"
--     ★ คอลัมน์ของ GoTrue เป็นรายละเอียดภายในของมัน ไม่ใช่สัญญากับเรา
--       ★★ ความตั้งใจของผู้ใช้ต้องบันทึกด้วยคอลัมน์ที่เราเขียนเอง
--          เพราะมันคือสิ่งที่เรารู้ และไม่มีใครเปลี่ยนความหมายของมันได้
-- ═════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists password_set_at timestamptz;

/*
 * ★★ เติมย้อนหลังให้คนที่สมัครผ่านฟอร์มใหม่เท่านั้น
 *    ★ terms_accepted_at มีค่าก็ต่อเมื่อผ่าน register_employee ซึ่งเป็น
 *      ทางเดียวที่ตั้งรหัสผ่านได้ ★★ คนที่ไม่มีค่านี้คือบัญชีรุ่นเก่า
 *      ซึ่งต้องเข้าได้โดยไม่ต้องกรอกรหัสผ่านเหมือนเดิม
 */
update public.profiles
   set password_set_at = terms_accepted_at
 where terms_accepted_at is not null
   and password_set_at is null;

/* ── ประทับเวลาตอนสมัคร ─────────────────────────────────────────── */

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

  v_display := btrim(
    coalesce(btrim(p_prefix), '') || btrim(p_first) || ' ' || btrim(p_last)
  );

  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');

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
         /* ★ ตรงนี้คือจุดเดียวที่บอกว่า "คนนี้ตั้งรหัสผ่านไว้จริง" */
         password_set_at   = now(),
         is_guest          = false,
         updated_at        = now()
   where id = p_actor
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.register_employee(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.register_employee(uuid, text, text, text, text, text, text, text, text, text) to service_role;

/* ── ตัวตรวจใหม่: อ่านคอลัมน์ของเราเอง ─────────────────────────── */

create or replace function public.user_has_password(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select password_set_at is not null from public.profiles where id = p_user),
    false
  );
$$;

revoke all on function public.user_has_password(uuid) from public;
grant execute on function public.user_has_password(uuid) to service_role;

/* ── รายชื่อ Admin ใช้คอลัมน์เดียวกัน ──────────────────────────── */

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
      p.id, p.username, p.display_name, p.prefix, p.first_name, p.last_name,
      p.phone, p.company, p.department, p.position_title, p.purpose,
      p.employee_code, p.account_status, p.is_admin, p.terms_accepted_at, p.created_at,
      (p.password_set_at is not null) as has_password
    from public.profiles p
  ) x;

  return v_out;
end;
$$;

revoke all on function public.admin_user_list(uuid) from public;
grant execute on function public.admin_user_list(uuid) to service_role;

/* ── Admin รีเซ็ตรหัสผ่าน = บัญชีนั้นมีรหัสผ่านแล้ว ─────────────── */

/**
 * ★ หลัง Admin ตั้งรหัสชั่วคราวให้ ผู้ใช้ต้องกรอกรหัสนั้นตอนเข้าระบบ
 *   ★★ ถ้าไม่ประทับเวลาไว้ ระบบจะยังคิดว่าบัญชีนี้ไม่มีรหัสผ่าน
 *      แล้วใครก็เข้าได้ด้วยการเว้นช่องว่าง — รหัสที่เพิ่งตั้งจะไร้ความหมาย
 */
create or replace function public.mark_password_set(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set password_set_at = now(), updated_at = now() where id = p_user;
$$;

revoke all on function public.mark_password_set(uuid) from public;
grant execute on function public.mark_password_set(uuid) to service_role;
