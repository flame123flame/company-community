-- ═════════════════════════════════════════════════════════════════════
-- 0039 · ซ่อมการเปิดแชทส่วนตัว
--
-- อาการ: กดชื่อคนเพื่อเปิดแชทส่วนตัวแล้วขึ้น "ระบบขัดข้องชั่วคราว"
-- สาเหตุจริงจากฐานข้อมูล:
--   42P10 there is no unique or exclusion constraint matching the ON CONFLICT
--
-- ★★★ ON CONFLICT ที่ชี้ไป partial unique index ต้องเขียนเงื่อนไขของ index ด้วย
--
--     0038 สร้าง index ไว้เป็น
--       create unique index ... on office_chat_rooms (pair_key)
--       where pair_key is not null
--
--     ★ Postgres จะจับคู่ ON CONFLICT กับ index แบบมีเงื่อนไขได้ก็ต่อเมื่อ
--       คำสั่ง insert บอกเงื่อนไขเดียวกันมาด้วย — ไม่งั้นมันไม่มีทางรู้ว่า
--       เราหมายถึง index ตัวไหน (ตารางหนึ่งมี partial index ซ้อนกันได้หลายตัว)
--     ★★ เขียนเป็น `on conflict (pair_key) where pair_key is not null`
--
-- ★ ไม่แก้ที่ index เพราะเงื่อนไขนั้นถูกแล้ว: ห้องกลุ่มมี pair_key เป็น null
--   และต้องมีได้หลายห้อง ★★ ถ้าเปลี่ยนเป็น unique index ธรรมดาจะดูเหมือน
--   ใช้ได้ (null ไม่ชนกันเอง) แต่เป็นการเปลี่ยนกฎของตารางเพื่อเลี่ยงปัญหา
--   ที่อยู่ในคำสั่ง insert ไม่ใช่ที่ตาราง
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.open_office_dm(p_actor uuid, p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text;
  v_room uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_actor = p_other then
    raise exception 'VALIDATION_FAILED: cannot chat with yourself';
  end if;

  if not public.employee_code_is_valid(p_other) then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  v_key := least(p_actor::text, p_other::text) || ':' || greatest(p_actor::text, p_other::text);

  /*
   * ★ do update ที่เขียนค่าเดิมทับ ไม่ใช่ do nothing
   *   ★★ do nothing จะไม่คืนแถวเมื่อชนกัน แล้ว v_room จะเป็น null
   *      ซึ่งแปลว่า "เปิดแชทกับคนที่เคยคุยแล้ว" จะพังทุกครั้ง
   */
  insert into public.office_chat_rooms (kind, created_by, pair_key)
  values ('DM', p_actor, v_key)
  on conflict (pair_key) where pair_key is not null
  do update set pair_key = excluded.pair_key
  returning id into v_room;

  insert into public.office_chat_members (room_id, user_id)
  values (v_room, p_actor), (v_room, p_other)
  on conflict do nothing;

  return v_room;
end;
$$;

revoke all on function public.open_office_dm(uuid, uuid) from public;
grant execute on function public.open_office_dm(uuid, uuid) to service_role;
