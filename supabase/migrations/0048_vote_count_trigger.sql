-- ═════════════════════════════════════════════════════════════════════
-- 0048 · ตัวนับคะแนนร้านต้องตรงกับความจริงเสมอ
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ อาการที่ผู้ใช้เห็น: การ์ดร้านบางใบขึ้นหัวใจแดง แต่ตัวเลขเป็น 0
--
--     หัวใจแดงมาจาก "มีแถวของฉันใน restaurant_votes"
--     ตัวเลขมาจาก   "restaurants.vote_count"
--     ★ สองค่านี้มาจากคนละที่ จึงเพี้ยนจากกันได้
--
--     ต้นเหตุ: scripts/seed-demo.mjs เขียนลง restaurant_votes ตรง ๆ
--     ★ 0025 เขียนคอมเมนต์ไว้ว่า "ตัวนับนี้ถูกเขียนโดย RPC เท่านั้น
--       จึงไม่มีทางหลุดจากความจริงได้" — ซึ่งเป็นจริงก็ต่อเมื่อ
--       ทุกคนที่เขียนตารางโหวตยอมผ่าน RPC
--       ★★ ข้อตกลงที่บังคับไม่ได้ ไม่ใช่ข้อตกลง มันคือความหวัง
--
--     ★★ ทางแก้ที่ถูกคือย้ายหน้าที่นับเข้าไปอยู่กับตารางที่ถูกนับ
--        trigger ทำงานกับ "ทุกเส้นทางที่เขียนข้อมูล" — RPC · seed · แก้มือ
--        ใน SQL editor · import ชุดใหญ่ ★ ไม่มีใครลืมได้อีก เพราะไม่มีอะไรให้จำ

begin;

-- ── 1 · trigger ที่ดูแลตัวนับ ──────────────────────────────────────
create or replace function public.sync_restaurant_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.restaurants
       set vote_count = vote_count + 1
     where id = new.restaurant_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.restaurants
       set vote_count = greatest(0, vote_count - 1)
     where id = old.restaurant_id;
    return old;
  else
    /* ★ ย้ายโหวตข้ามร้าน — ไม่มีเส้นทางไหนทำตอนนี้ แต่ถ้ามีวันหนึ่ง
         ตัวนับต้องขยับทั้งสองฝั่ง ไม่ใช่ฝั่งเดียว */
    if new.restaurant_id is distinct from old.restaurant_id then
      update public.restaurants set vote_count = greatest(0, vote_count - 1)
       where id = old.restaurant_id;
      update public.restaurants set vote_count = vote_count + 1
       where id = new.restaurant_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists restaurant_votes_sync on public.restaurant_votes;
create trigger restaurant_votes_sync
  after insert or update or delete on public.restaurant_votes
  for each row execute function public.sync_restaurant_vote_count();


-- ── 2 · RPC เลิกบวกเลขเอง ─────────────────────────────────────────
--
-- ★★ ถ้าปล่อยให้ RPC บวกเองต่อไป ทุกการกดหัวใจจะนับสองครั้ง
--    (ครั้งหนึ่งจาก RPC อีกครั้งจาก trigger)
--    ★ การเพิ่ม trigger จึง "ต้อง" มาคู่กับการถอดเลขคณิตออกจาก RPC เสมอ
--      แยกกันทำเมื่อไหร่ ได้บั๊กที่หนักกว่าเดิมทันที
create or replace function public.toggle_restaurant_vote(
  p_actor uuid,
  p_id    uuid
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.restaurants;
  v_existed boolean;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ ยังล็อกแถวร้านอยู่ — สองคนกดพร้อมกันต้องเข้าคิวกัน ไม่ใช่ทับกัน */
  select * into v_row from public.restaurants where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  delete from public.restaurant_votes
   where restaurant_id = p_id and user_id = p_actor;
  v_existed := found;

  if not v_existed then
    insert into public.restaurant_votes (restaurant_id, user_id) values (p_id, p_actor);
  end if;

  /* ★ อ่านแถวใหม่หลัง trigger ทำงานแล้ว — ไม่ใช่ใช้ v_row ที่อ่านไว้ก่อนหน้า
       ★★ v_row ถูกอ่านตอนล็อก ซึ่งเป็น "ก่อน" ตัวนับขยับ
          คืนค่านั้นไปจะทำให้หน้าจอเห็นเลขเก่าหนึ่งก้าวเสมอ */
  select * into v_row from public.restaurants where id = p_id;
  return v_row;
end;
$$;


-- ── 3 · ซ่อมข้อมูลที่เพี้ยนไปแล้ว ─────────────────────────────────
--
-- ★ คำนวณใหม่จากของจริงทั้งตาราง ไม่ใช่เดาว่าแถวไหนเสีย
--   ★★ เขียนให้รันซ้ำได้ — ถ้ารันอีกสิบรอบผลต้องเท่าเดิม
--      migration ที่รันซ้ำไม่ได้ คือ migration ที่ไม่มีใครกล้ารันตอนมีปัญหา
update public.restaurants r
   set vote_count = coalesce(v.n, 0)
  from (
    select id,
           (select count(*) from public.restaurant_votes rv where rv.restaurant_id = id) as n
      from public.restaurants
  ) v
 where r.id = v.id
   and r.vote_count is distinct from coalesce(v.n, 0);

commit;
