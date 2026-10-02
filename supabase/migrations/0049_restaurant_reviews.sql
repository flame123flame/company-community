-- ===========================================================================
-- 0049 · รีวิวร้าน — ดาว + ข้อความ + รูป + ปักหมุดว่ารีวิวที่ร้าน
-- ===========================================================================
--
-- ★★ ทำไมไม่ใช้ restaurant_votes (หัวใจ) ที่มีอยู่แล้ว
--
--    หัวใจตอบคำถาม "ร้านนี้ควรอยู่ในรายการไหม" — กดได้ครั้งเดียวต่อคน
--    รีวิวตอบคำถาม "ครั้งที่ไปกินมาเป็นยังไง" — ★ คนเดียวรีวิวได้หลายครั้ง
--      เพราะแต่ละครั้งที่ไปกินคือเหตุการณ์คนละอัน
--    ★★ สองอย่างนี้มีกฎ "กี่แถวต่อคน" ตรงข้ามกัน จึงอยู่ตารางเดียวกันไม่ได้

begin;

-- ═════════════════════════════════════════════════════════════════════
-- 1 · รีวิว
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.restaurant_reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,

  -- ★ ดาวบังคับ ข้อความไม่บังคับ — ตามข้อกำหนด
  --   ★★ บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ใน UI เพราะ route ใช้ service role
  --      ซึ่งข้าม RLS ได้ ด่านสุดท้ายจึงต้องเป็น constraint
  rating        smallint not null
                constraint restaurant_reviews_rating
                check (rating between 1 and 5),
  body          text
                constraint restaurant_reviews_body_len
                check (body is null or char_length(body) <= 2000),

  /*
   * ★★ เก็บ "อยู่ใกล้ร้านตอนรีวิวไหม" เป็น boolean ที่คำนวณแล้ว
   *    ไม่ใช่เก็บพิกัดดิบของผู้ใช้ไว้ตลอดกาล
   *
   *    ข้อกำหนดต้องการแค่ป้าย "รีวิวที่ร้าน" ซึ่งเป็นคำตอบใช่/ไม่ใช่
   *    ★ พิกัดดิบของพนักงานคือข้อมูลที่ละเอียดกว่าที่ฟีเจอร์นี้ต้องใช้มาก
   *      ★★ เก็บของที่ไม่ได้ใช้ = รับภาระดูแลมันไปตลอด โดยไม่ได้อะไรกลับมา
   */
  at_shop       boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.restaurant_reviews is
  'รีวิวร้าน — 1 คนรีวิวได้หลายครั้งต่อร้าน (แต่ละครั้งที่ไปกิน)';

-- ★ ดึงรีวิวของร้านเรียงใหม่ไปเก่า คือ query เดียวที่หน้ารายละเอียดใช้
create index if not exists restaurant_reviews_shop_idx
  on public.restaurant_reviews (restaurant_id, created_at desc);

create index if not exists restaurant_reviews_author_idx
  on public.restaurant_reviews (author_id);

drop trigger if exists restaurant_reviews_touch on public.restaurant_reviews;
create trigger restaurant_reviews_touch
  before update on public.restaurant_reviews
  for each row execute function public.touch_updated_at();

alter table public.restaurant_reviews enable row level security;
-- ★ default-deny ไม่มี policy — เขียนผ่าน RPC security definer เท่านั้น
--   (เหตุผลเดียวกับทุกตารางของโมดูลออฟฟิศ)


-- ═════════════════════════════════════════════════════════════════════
-- 2 · รูปในรีวิว
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ แยกตาราง ไม่ใช่คอลัมน์ text[] ในรีวิว
--   ★★ เพราะต้องเรียงรูป ต้องลบทีละใบ และต้องหา "รูปล่าสุดของร้าน"
--      มาทำปกการ์ด ซึ่ง array ทำได้ทั้งหมดแหละ แต่ทำแบบที่ index ช่วยไม่ได้

create table if not exists public.restaurant_review_photos (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.restaurant_reviews(id) on delete cascade,
  /** path ใน storage bucket 'reviews' */
  path       text not null
             constraint restaurant_review_photos_path_len
             check (char_length(path) between 1 and 400),
  sort       smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_review_photos_review_idx
  on public.restaurant_review_photos (review_id, sort, created_at);

alter table public.restaurant_review_photos enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ที่เก็บรูป
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ public bucket เหมือน 'listings' ของตลาดนัด — รูปร้านอาหารไม่ใช่ความลับ
--   และ signed URL ต่อรูปจะทำให้หน้ารายละเอียดต้องยิงคำขอเพิ่มทุกใบ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reviews', 'reviews', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · คะแนนเฉลี่ยอยู่บนแถวร้าน
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ เก็บผลรวมกับจำนวน ไม่ใช่เก็บค่าเฉลี่ย
--
--     ค่าเฉลี่ยอัปเดตทีละก้าวไม่ได้ถ้าไม่รู้จำนวน และการลบรีวิวหนึ่งอัน
--     ★ ต้องถอดคะแนนนั้นออกจากผลรวม ซึ่งต้องรู้ว่ามันเคยให้กี่ดาว
--     ★★ เก็บ sum + count ทำให้ทุกการเปลี่ยนแปลงเป็นบวก/ลบตรง ๆ
--        และหารเมื่อจะแสดงผลเท่านั้น
--
-- ★★ บทเรียนจาก 0048 (ตัวนับหัวใจที่เพี้ยน): ตัวนับต้องถูกดูแลด้วย trigger
--    บนตารางที่ถูกนับ ไม่ใช่ฝากไว้กับผู้เรียกให้จำว่าต้องบวกเอง

alter table public.restaurants
  add column if not exists rating_sum   integer not null default 0,
  add column if not exists rating_count integer not null default 0;

comment on column public.restaurants.rating_sum is
  'ผลรวมดาวทั้งหมด — หารด้วย rating_count เมื่อจะแสดง (ดูแลโดย trigger)';

create or replace function public.sync_restaurant_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.restaurants
       set rating_sum = rating_sum + new.rating,
           rating_count = rating_count + 1
     where id = new.restaurant_id;
    return new;

  elsif tg_op = 'DELETE' then
    update public.restaurants
       set rating_sum = greatest(0, rating_sum - old.rating),
           rating_count = greatest(0, rating_count - 1)
     where id = old.restaurant_id;
    return old;

  else
    /* ★ แก้ดาว — ขยับเฉพาะผลรวม จำนวนเท่าเดิม
         ★★ ถ้าย้ายร้านด้วย (ไม่มีเส้นทางไหนทำตอนนี้) ต้องถอดทั้งก้อน
            จากร้านเก่าแล้วใส่ร้านใหม่ ไม่ใช่ขยับผลต่าง */
    if new.restaurant_id is distinct from old.restaurant_id then
      update public.restaurants
         set rating_sum = greatest(0, rating_sum - old.rating),
             rating_count = greatest(0, rating_count - 1)
       where id = old.restaurant_id;
      update public.restaurants
         set rating_sum = rating_sum + new.rating,
             rating_count = rating_count + 1
       where id = new.restaurant_id;
    elsif new.rating is distinct from old.rating then
      update public.restaurants
         set rating_sum = greatest(0, rating_sum - old.rating + new.rating)
       where id = new.restaurant_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists restaurant_reviews_sync on public.restaurant_reviews;
create trigger restaurant_reviews_sync
  after insert or update or delete on public.restaurant_reviews
  for each row execute function public.sync_restaurant_rating();

-- ★ ซ่อม/ตั้งค่าเริ่มต้นจากของจริง — รันซ้ำได้
update public.restaurants r
   set rating_sum = coalesce(v.s, 0),
       rating_count = coalesce(v.n, 0)
  from (
    select id,
           (select sum(rating)::int from public.restaurant_reviews x where x.restaurant_id = id) as s,
           (select count(*)::int    from public.restaurant_reviews x where x.restaurant_id = id) as n
      from public.restaurants
  ) v
 where r.id = v.id
   and (r.rating_sum is distinct from coalesce(v.s, 0)
     or r.rating_count is distinct from coalesce(v.n, 0));


-- ═════════════════════════════════════════════════════════════════════
-- 5 · เขียน/แก้/ลบรีวิว
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.upsert_restaurant_review(
  p_actor   uuid,
  p_shop    uuid,
  p_review  uuid,      -- null = เขียนใหม่
  p_rating  smallint,
  p_body    text,
  p_at_shop boolean,
  p_photos  text[]     -- path ใน bucket 'reviews' เรียงตามลำดับที่ส่งมา
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'VALIDATION_FAILED';
  end if;

  /* ★★ รับรูปได้ไม่เกิน 10 ใบ — ตรวจที่นี่ด้วย ไม่ใช่เชื่อหน้าเว็บอย่างเดียว
       ★ หน้าเว็บตัดให้ 10 ใบแรกแล้วก็จริง แต่ route ใช้ service role
         ใครยิง API ตรงได้ก็ข้ามด่านนั้นไปทั้งหมด */
  if p_photos is not null and array_length(p_photos, 1) > 10 then
    raise exception 'VALIDATION_FAILED';
  end if;

  if p_review is null then
    insert into public.restaurant_reviews (restaurant_id, author_id, rating, body, at_shop)
    values (p_shop, p_actor, p_rating, nullif(btrim(coalesce(p_body, '')), ''), coalesce(p_at_shop, false))
    returning id into v_id;
  else
    /* ★ แก้ได้เฉพาะรีวิวของตัวเอง — ตรวจใน where ไม่ใช่ if แยก
         ★★ เงื่อนไขอยู่ใน where แปลว่า "ไม่ใช่ของฉัน" กับ "ไม่มีอยู่จริง"
            เดินทางเดียวกัน ซึ่งไม่บอกคนนอกว่า id นั้นมีอยู่หรือเปล่า */
    update public.restaurant_reviews
       set rating = p_rating,
           body = nullif(btrim(coalesce(p_body, '')), ''),
           at_shop = coalesce(p_at_shop, at_shop)
     where id = p_review and author_id = p_actor
    returning id into v_id;

    if v_id is null then
      raise exception 'FORBIDDEN';
    end if;

    /* ★ แทนที่รูปทั้งชุด ไม่ใช่เพิ่มต่อท้าย — หน้าเว็บส่งรายการสุดท้ายมาเสมอ
         ★★ ถ้าเพิ่มต่อท้าย การลบรูปออกตอนแก้ไขจะทำไม่ได้เลย */
    delete from public.restaurant_review_photos where review_id = v_id;
  end if;

  if p_photos is not null then
    insert into public.restaurant_review_photos (review_id, path, sort)
    select v_id, p, (ord - 1)::smallint
      from unnest(p_photos) with ordinality as t(p, ord);
  end if;

  return v_id;
end;
$$;


create or replace function public.delete_restaurant_review(
  p_actor  uuid,
  p_review uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hit boolean;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ เจ้าของรีวิว หรือ Admin — Admin ต้องลบของที่ไม่เหมาะสมได้
       ★★ รูปหายตาม cascade และ rating_sum/count ขยับตาม trigger
          ไม่ต้องเขียนอะไรเพิ่มตรงนี้ */
  delete from public.restaurant_reviews
   where id = p_review
     and (author_id = p_actor or public.is_admin(p_actor));
  v_hit := found;

  return v_hit;
end;
$$;


revoke all on function
  public.upsert_restaurant_review(uuid, uuid, uuid, smallint, text, boolean, text[]),
  public.delete_restaurant_review(uuid, uuid),
  public.sync_restaurant_rating()
  from public, anon, authenticated;

grant execute on function
  public.upsert_restaurant_review(uuid, uuid, uuid, smallint, text, boolean, text[]),
  public.delete_restaurant_review(uuid, uuid)
  to service_role;

commit;
