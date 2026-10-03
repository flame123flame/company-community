-- ===========================================================================
-- 0056 · รูปของร้าน — คนละอย่างกับรูปที่แนบมากับรีวิว
-- ===========================================================================
--
-- ★★★ ทำไมไม่ใช้ restaurant_review_photos ที่มีอยู่แล้ว
--
--     รูปในรีวิวตอบว่า "ครั้งที่ฉันไปกิน จานนั้นหน้าตาแบบนี้"
--       ★ มันผูกกับรีวิวหนึ่งใบของคนหนึ่งคน ★★ ลบรีวิวแล้วรูปหายตามไปด้วย
--         ซึ่งถูกต้องสำหรับรูปของรีวิว
--     รูปของร้านตอบว่า "ร้านนี้หน้าตาแบบนี้"
--       ★ มันเป็นของร้าน ไม่ใช่ของใครคนใดคนหนึ่ง และต้องอยู่ต่อแม้คนที่
--         อัปโหลดจะลบรีวิวตัวเองทิ้ง หรือลาออกไปแล้ว
--
--     ★★★ ที่ผ่านมารูปหน้าปกของการ์ดร้านถูกดึงมาจาก "รูปรีวิวที่ใหม่ที่สุด"
--         ★ แปลว่าหน้าปกของร้านเปลี่ยนเองทุกครั้งที่มีคนรีวิวใหม่
--           และหายไปเลยถ้าคนนั้นลบรีวิว
--           ★★ ร้านที่ไม่มีใครรีวิวจึงไม่มีรูปตลอดกาล แม้จะมีคนอยากใส่ให้

-- ★★★ ไม่มี begin;/commit; โดยตั้งใจ
--
--     ★ ตัวรันไฟล์ SQL ของโปรเจกต์นี้ยิงทีละคำสั่งนอกทรานแซกชัน
--       ★★ begin; ที่บรรทัดแรกจึงไม่ได้ป้องกันอะไรเลย — มันแค่ทำให้คนอ่าน
--          คิดว่าปลอดภัย ซึ่งอันตรายกว่าไม่มี
--     ★ บทเรียนจาก 0051: ไฟล์ล้มกลางคัน ตารางที่สร้างไปแล้วค้างอยู่
--       แล้ว create table if not exists ก็ข้ามมันตลอดกาล

-- ═════════════════════════════════════════════════════════════════════
-- 1 · ตาราง
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.restaurant_photos (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- ★ คนอัปโหลด — ใช้ตัดสินสิทธิ์ลบ ★★ set null เมื่อคนลาออก รูปยังอยู่
  added_by      uuid references public.profiles(id) on delete set null,
  path          text not null
                constraint restaurant_photos_path_len
                check (char_length(path) between 1 and 400),
  -- ★ ลำดับที่ผู้ใช้จัดเอง — รูปแรกคือหน้าปก
  sort          smallint not null default 0,
  created_at    timestamptz not null default now()
);

comment on table public.restaurant_photos is
  'รูปของร้าน (ไม่เกิน 10 รูป/ร้าน) — ต่างจาก restaurant_review_photos ที่ผูกกับรีวิว';

create index if not exists restaurant_photos_shop_idx
  on public.restaurant_photos (restaurant_id, sort, created_at);

alter table public.restaurant_photos enable row level security;

-- ★ ไม่มี policy โดยตั้งใจ — เขียนผ่าน RPC ที่เป็น security definer เท่านั้น
--   ★★ กฎเดียวกับ restaurant_reviews ใน 0049


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ที่เก็บไฟล์
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ แยก bucket จาก 'reviews' เพราะอายุของไฟล์ต่างกัน
--   ★★ รูปรีวิวหายไปพร้อมรีวิว ส่วนรูปร้านอยู่จนกว่าร้านจะถูกลบ
--      ★ ปนกันแล้ววันที่ต้องเก็บกวาดไฟล์กำพร้า จะแยกไม่ออกว่าอันไหนของใคร

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurants',
  'restaurants',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · เพิ่มรูป
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ เพดาน 10 รูปตรวจที่นี่ ไม่ใช่เชื่อฝั่งหน้าเว็บ
--
--     ★ route ใช้ service role ซึ่งข้าม RLS ได้ ★★ ด่านสุดท้ายจึงต้อง
--       อยู่ในฟังก์ชันนี้ กฎเดียวกับ 10 รูปต่อรีวิวใน 0049
--     ★ นับของเดิมในตารางด้วย ไม่ใช่นับแค่ที่ส่งมารอบนี้
--       ★★ ไม่งั้นยิงทีละ 10 รูปสิบรอบก็ได้ 100 รูป

create or replace function public.add_restaurant_photos(
  p_actor  uuid,
  p_shop   uuid,
  p_paths  text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_have integer;
  v_add  integer;
  v_next smallint;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.restaurants where id = p_shop) then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  v_add := coalesce(array_length(p_paths, 1), 0);
  if v_add = 0 then
    return 0;
  end if;

  /* ★ ล็อกแถวร้านไว้ก่อนนับ — สองคนกดพร้อมกันจะได้ไม่ผ่านด่านทั้งคู่
       ★★ เป็นบั๊กแบบเดียวกับตัวนับที่เคยซ่อมไปใน 0048 */
  perform 1 from public.restaurants where id = p_shop for update;

  select count(*) into v_have
    from public.restaurant_photos where restaurant_id = p_shop;

  if v_have + v_add > 10 then
    raise exception 'VALIDATION_FAILED';
  end if;

  select coalesce(max(sort), -1) + 1 into v_next
    from public.restaurant_photos where restaurant_id = p_shop;

  insert into public.restaurant_photos (restaurant_id, added_by, path, sort)
  select p_shop, p_actor, path, (v_next + ord - 1)::smallint
    from unnest(p_paths) with ordinality as t(path, ord);

  return v_add;
end;
$$;

revoke all on function public.add_restaurant_photos(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.add_restaurant_photos(uuid, uuid, text[]) to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · ลบรูป
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ คนที่อัปโหลด · เจ้าของร้านที่เพิ่มเข้าระบบ · หรือแอดมิน
--   ★★ กว้างกว่ารีวิว (ซึ่งเจ้าของอย่างเดียว) เพราะรูปเป็นของร้าน
--      ไม่ใช่ความเห็นส่วนตัว — คนที่ดูแลร้านนั้นควรเอารูปที่ผิดออกได้

create or replace function public.delete_restaurant_photo(
  p_actor uuid,
  p_photo uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.restaurant_photos;
  v_owner uuid;
begin
  select * into v_row from public.restaurant_photos where id = p_photo;
  if not found then
    return false;
  end if;

  select added_by into v_owner from public.restaurants where id = v_row.restaurant_id;

  if v_row.added_by is distinct from p_actor
     and v_owner is distinct from p_actor
     and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.restaurant_photos where id = p_photo;
  return true;
end;
$$;

revoke all on function public.delete_restaurant_photo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_restaurant_photo(uuid, uuid) to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · แก้พิกัดร้านหลังสร้างแล้ว
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ set_restaurant_latlng มีอยู่แล้วตั้งแต่ 0050 แต่ถูกเรียกที่เดียว
--     คือตอนสร้างร้าน
--
--     ★ แปลว่าร้านที่ปักหมุดผิด หรือร้านเก่าที่สร้างก่อนมีแผนที่
--       แก้พิกัดไม่ได้เลยตลอดกาล ★★ และระยะทางของมันจะว่างไปตลอด
--     ★ ฟังก์ชันนี้ไม่ต้องแก้อะไร — แค่ต้องมีทางเรียกจากหน้าเว็บ
--       ซึ่งเพิ่มใน route ของเฟสนี้

comment on function public.set_restaurant_latlng(uuid, uuid, numeric, numeric) is
  'ตั้งพิกัดร้านแล้วคิดระยะทางใหม่ — เรียกได้ทั้งตอนสร้างและตอนแก้ไข';
