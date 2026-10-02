-- ═══════════════════════════════════════════════════════════════════
-- 0028 · โมดูล C · สุ่มและเกม
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-C01  วงล้อสุ่มชื่อ + บันทึกชุดรายชื่อไว้ใช้ซ้ำ
--   FR-C02  ตัวเลือก "ไม่สุ่มซ้ำ"                     (ฝั่ง client)
--   FR-C03  สุ่มทีม กำหนดจำนวนทีม/คนต่อทีม            (ฝั่ง client)
--   FR-C04  แอนิเมชันเปิดชื่อทีละคน + ชื่อ/สีทีมสุ่ม    (ฝั่ง client)
--   FR-C05  กระจายฝ่ายให้ทีมมีคนหลายฝ่ายปนกัน          (ฝั่ง client)
--   FR-C07  สุ่มใหม่ได้ 1 ครั้งต่อรอบ                  (ฝั่ง client)
--   FR-C10  สุ่มเลข 2/3/6 หลัก แบบสล็อต                (ฝั่ง client)
--   FR-C11  นับถอยหลังงวดถัดไป + บันทึกเลขของฉัน
--
-- ★★★ ทำไมตารางน้อยผิดปกติเมื่อเทียบกับโมดูลอื่น
--
--     การสุ่มส่วนใหญ่ในโมดูลนี้เป็น "เหตุการณ์ชั่วคราว" —
--     สุ่มเสร็จ ดูผล แล้วจบ ★ ไม่มีใครกลับมาดูว่าเมื่อวานสุ่มได้ใคร
--
--     ★ สิ่งที่ต้องเก็บจริงมีแค่สองอย่าง: ชุดรายชื่อที่อยากใช้ซ้ำ (C01)
--       และเลขที่ผู้ใช้กดบันทึกไว้เอง (C11) — นอกนั้นอยู่ในหน่วยความจำพอ
--
--     การเก็บผลการสุ่มทุกครั้งลงฐานข้อมูลคือค่าใช้จ่ายที่ไม่มีใครได้ใช้
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ชุดรายชื่อที่บันทึกไว้ (FR-C01)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.name_sets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,

  name       text not null
             constraint name_sets_name_len
             check (char_length(btrim(name)) between 1 and 60),

  /*
   * ★★ เก็บเป็น jsonb array ของ {id?, label}
   *
   *    ชื่อในชุดมีสองแบบปนกันได้: คนในระบบ (มี id) กับชื่อที่พิมพ์เอง (ไม่มี id)
   *    ★ ถ้าแยกเป็นตาราง members ที่มี FK ไป profiles จะรับชื่อที่พิมพ์เอง
   *      ไม่ได้เลย ซึ่ง FR-C01 ระบุว่าต้องรับทั้งสองแบบ
   *
   *    ★ และชุดรายชื่อคือ "ภาพถ่าย ณ ตอนบันทึก" ไม่ใช่ความสัมพันธ์ที่ต้อง
   *      ตามการเปลี่ยนแปลง — คนลาออกไปแล้วชุดเก่าควรยังเปิดดูได้
   */
  members    jsonb not null default '[]'::jsonb
             constraint name_sets_members_array check (jsonb_typeof(members) = 'array'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.name_sets is
  'ชุดรายชื่อที่บันทึกไว้ใช้ซ้ำ เช่น "ทีม IT" — ภาพถ่าย ณ ตอนบันทึก (FR-C01)';

drop trigger if exists name_sets_touch on public.name_sets;
create trigger name_sets_touch
  before update on public.name_sets
  for each row execute function public.touch_updated_at();

create index if not exists name_sets_owner_idx
  on public.name_sets (owner_id, updated_at desc);

-- ★ ชื่อชุดห้ามซ้ำต่อคน — "ทีม IT" สองชุดทำให้เลือกผิดแน่นอน
create unique index if not exists name_sets_owner_name_key
  on public.name_sets (owner_id, lower(btrim(name)));


-- ═════════════════════════════════════════════════════════════════════
-- 2 · เลขที่บันทึกไว้ (FR-C11)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ กฎข้อ 2 ของหัวข้อ 7: "สุ่มเลขเพื่อความบันเทิงเท่านั้น"
--
--     ตารางนี้จึงเก็บได้แค่ "เลขที่ฉันสุ่มได้" กับ "งวดไหน" เท่านั้น
--     ★ ไม่มีคอลัมน์จำนวนเงิน ไม่มีคอลัมน์ผู้รับ ไม่มีสถานะถูก/ไม่ถูก
--       — ไม่ใช่เพราะลืม แต่เพราะการมีคอลัมน์พวกนั้นคือการเปิดทางให้
--       ระบบกลายเป็นโพยหวย ซึ่งเอกสารห้ามไว้ตรง ๆ
--
--     ★★ ใครที่จะเพิ่มคอลัมน์ลงตารางนี้ในอนาคต อ่านย่อหน้านี้ก่อน

create table if not exists public.lottery_picks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,

  /** เลขที่สุ่มได้ — 2, 3 หรือ 6 หลัก */
  number     text not null
             constraint lottery_picks_format check (number ~ '^\d{2}$|^\d{3}$|^\d{6}$'),

  /** งวดที่เลขนี้ผูกอยู่ — วันออกรางวัลตอนที่กดบันทึก */
  draw_date  date,

  created_at timestamptz not null default now()
);

create index if not exists lottery_picks_user_idx
  on public.lottery_picks (user_id, created_at desc);

-- ★ ใช้โดยกระดานเลขยอดฮิต (FR-C12 เฟส 2) — สร้างไว้ตั้งแต่ตอนนี้
--   เพราะ index บนตารางที่ยังว่างสร้างเร็วมาก ต่างจากตอนมีข้อมูลแล้ว
create index if not exists lottery_picks_draw_idx
  on public.lottery_picks (draw_date, number)
  where draw_date is not null;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · RPC
-- ═════════════════════════════════════════════════════════════════════

/** บันทึก/แก้ชุดรายชื่อ (FR-C01) */
create or replace function public.save_name_set(
  p_actor   uuid,
  p_id      uuid,
  p_name    text,
  p_members jsonb
)
returns public.name_sets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.name_sets;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if jsonb_typeof(coalesce(p_members, 'null'::jsonb)) <> 'array' then
    raise exception 'VALIDATION_FAILED: members must be an array';
  end if;

  /* ★ เพดาน 200 ชื่อ — วงล้อที่มี 500 ช่องอ่านไม่ออกและหมุนแล้วไม่มีความหมาย */
  if jsonb_array_length(p_members) > 200 then
    raise exception 'QUEUE_FULL';
  end if;

  if p_id is null then
    insert into public.name_sets (owner_id, name, members)
    values (p_actor, btrim(p_name), p_members)
    returning * into v_row;
  else
    update public.name_sets
       set name = btrim(p_name), members = p_members
     where id = p_id and owner_id = p_actor      -- ★ ผูก owner เสมอ กัน IDOR
     returning * into v_row;

    if not found then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  return v_row;
end;
$$;


/** ลบชุดรายชื่อ */
create or replace function public.delete_name_set(p_actor uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.name_sets where id = p_id and owner_id = p_actor;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  return p_id;
end;
$$;


/** บันทึกเลขที่สุ่มได้ (FR-C11) */
create or replace function public.save_lottery_pick(
  p_actor  uuid,
  p_number text
)
returns public.lottery_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.lottery_picks;
  v_draw date;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ ผูกกับงวดที่ Admin ตั้งไว้ ไม่ใช่วันที่กดบันทึก
     เลขที่บันทึกวันนี้กับเมื่อวานเป็นของงวดเดียวกันถ้ายังไม่ออกรางวัล */
  v_draw := nullif(public.setting('lottery_next_draw', 'null'::jsonb) #>> '{}', '')::date;

  insert into public.lottery_picks (user_id, number, draw_date)
  values (p_actor, p_number, v_draw)
  returning * into v_row;

  return v_row;
end;
$$;


/** ลบเลขที่บันทึกไว้ */
create or replace function public.delete_lottery_pick(p_actor uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.lottery_picks where id = p_id and user_id = p_actor;
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  return p_id;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · RLS
-- ═════════════════════════════════════════════════════════════════════

alter table public.name_sets     enable row level security;
alter table public.lottery_picks enable row level security;

revoke all on public.name_sets, public.lottery_picks from anon, authenticated;
grant select on public.name_sets, public.lottery_picks to authenticated;

-- ★ ชุดรายชื่อเป็นของส่วนตัว — คนอื่นไม่ต้องเห็นว่าใครจัดกลุ่มใครไว้ยังไง
drop policy if exists "name_sets: read own" on public.name_sets;
create policy "name_sets: read own"
  on public.name_sets for select to authenticated
  using (owner_id = (select auth.uid()));

-- ★ เลขที่บันทึกก็เป็นของส่วนตัวเช่นกัน
--   (กระดานเลขยอดฮิตใน FR-C12 จะนับผ่าน RPC ที่คืนเฉพาะตัวเลขรวม
--    ไม่เปิดเผยว่าใครบันทึกเลขอะไร)
drop policy if exists "lottery_picks: read own" on public.lottery_picks;
create policy "lottery_picks: read own"
  on public.lottery_picks for select to authenticated
  using (user_id = (select auth.uid()));


-- ═════════════════════════════════════════════════════════════════════
-- 5 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.save_name_set(uuid, uuid, text, jsonb),
  public.delete_name_set(uuid, uuid),
  public.save_lottery_pick(uuid, text),
  public.delete_lottery_pick(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.save_name_set(uuid, uuid, text, jsonb),
  public.delete_name_set(uuid, uuid),
  public.save_lottery_pick(uuid, text),
  public.delete_lottery_pick(uuid, uuid)
to service_role;
