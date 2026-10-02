-- ═════════════════════════════════════════════════════════════════════
-- 0043 · เปิดให้ใครก็สมัครได้ — ไม่ต้องมีรหัสพนักงาน
--
-- ★★★ รหัสพนักงานเคยเป็นด่านของ "ทุกอย่าง" ในโมดูลออฟฟิศ
--
--     employee_code_is_valid() ถูกเรียกใน RPC 42 จุด — แชท · บิล · ตลาดนัด ·
--     สุ่มเกม ทุกตัวขึ้นต้นด้วยการถามมัน
--     ★ ถ้าเลิกบังคับรหัสแต่ไม่แก้ฟังก์ชันนี้ คนที่สมัครใหม่จะเข้าเว็บได้
--       แต่กดอะไรไม่ได้เลยสักปุ่ม — ทุกคำสั่งตอบ FORBIDDEN
--       ★★ ซึ่งเป็นอาการที่หาสาเหตุยากมาก เพราะหน้าเว็บโหลดได้ปกติ
--
-- ★★ แก้ที่รากเดียว ไม่ไล่แก้ 42 จุด
--    ★ สร้าง can_use_office() เป็นกฎจริงอันใหม่ แล้วให้ชื่อเดิมเรียกต่อ
--      ★★ ชื่อเดิมยังใช้ได้ทุกที่โดยไม่ต้องแตะ migration เก่าสักไฟล์
--         และโค้ดใหม่เรียกชื่อที่ตรงความหมายได้
--    ★ ถ้าเปลี่ยนความหมายของชื่อเดิมเฉย ๆ จะเหลือฟังก์ชันชื่อ
--      "รหัสพนักงานถูกต้องไหม" ที่ตอบ true ให้คนไม่มีรหัส — อ่านแล้วเข้าใจผิดแน่
-- ═════════════════════════════════════════════════════════════════════

/**
 * ใช้ระบบออฟฟิศได้ไหม
 *
 * ★ เงื่อนไขเดียวคือบัญชียังไม่ถูกระงับ
 *   ★★ รหัสพนักงานกลายเป็นข้อมูลประกอบ ไม่ใช่ใบผ่าน — ใครมีก็เก็บไว้
 *      ใครไม่มีก็ใช้งานได้เหมือนกัน
 */
create or replace function public.can_use_office(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.account_status = 'ACTIVE'
  );
$$;

revoke all on function public.can_use_office(uuid) from public;
grant execute on function public.can_use_office(uuid) to service_role;

/*
 * ★★ ชื่อเดิมกลายเป็นตัวส่งต่อ — RPC เก่าทั้ง 42 จุดใช้ได้ทันทีโดยไม่ต้องแก้
 *    ★ วันที่อยากกลับไปบังคับรหัสพนักงาน แก้ที่ can_use_office() ที่เดียว
 */
create or replace function public.employee_code_is_valid(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.can_use_office(p_user);
$$;

/* ── สมัครแบบเปิด ──────────────────────────────────────────────── */

/**
 * เขียนโปรไฟล์ของคนที่สมัครใหม่ — ไม่ยุ่งกับรหัสพนักงานเลย
 *
 * ★★ ชื่อเล่นเป็นทั้งชื่อเล่นและชื่อที่แสดง
 *    ★ ระบบนี้ใช้กันในออฟฟิศเดียว คนเรียกกันด้วยชื่อเล่นอยู่แล้ว
 *      ★★ การบังคับกรอกชื่อ-นามสกุลจริงเพิ่มสองช่องเพื่อข้อมูลที่
 *         ไม่มีหน้าไหนเอาไปแสดง
 *
 * ★ ยังเก็บ first_name/last_name ไว้เป็นคอลัมน์ (Admin กรอกให้ทีหลังได้)
 *   แต่ไม่บังคับตอนสมัคร
 */
create or replace function public.register_open(
  p_actor    uuid,
  p_nickname text,
  p_phone    text default null,
  p_company  text default null,
  p_dept     text default null,
  p_position text default null,
  p_purpose  text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick  text := btrim(coalesce(p_nickname, ''));
  v_phone text;
  v_row   public.profiles;
begin
  if p_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if v_nick = '' then
    raise exception 'VALIDATION_FAILED: nickname';
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');

  update public.profiles
     set nickname          = v_nick,
         display_name      = v_nick,
         phone             = v_phone,
         company           = nullif(btrim(coalesce(p_company, '')), ''),
         department        = nullif(btrim(coalesce(p_dept, '')), ''),
         position_title    = nullif(btrim(coalesce(p_position, '')), ''),
         purpose           = nullif(btrim(coalesce(p_purpose, '')), ''),
         terms_accepted_at = now(),
         password_set_at   = now(),
         is_guest          = false,
         updated_at        = now()
   where id = p_actor
  returning * into v_row;

  if not found then
    raise exception 'UNAUTHORIZED';
  end if;

  return v_row;
end;
$$;

revoke all on function public.register_open(uuid, text, text, text, text, text, text) from public;
grant execute on function public.register_open(uuid, text, text, text, text, text, text) to service_role;
