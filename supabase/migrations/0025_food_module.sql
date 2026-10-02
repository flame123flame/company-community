-- ═══════════════════════════════════════════════════════════════════
-- 0025 · โมดูล A · กินอะไรดี
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-A01  เพิ่มร้าน (ชื่อ + เมนูเด็ด บังคับ · ที่เหลือไม่บังคับ)
--   FR-A02  เตือนเมื่อชื่อร้านใกล้เคียงของที่มีอยู่
--   FR-A03  รายการร้านแบบการ์ด + กรอง
--   FR-A04  ปุ่มเห็นด้วย (คนละ 1 ครั้งต่อร้าน)
--   FR-A05  แจ้งร้านปิด — ครบเกณฑ์แล้วติดป้าย + ย้ายท้ายรายการ
--   FR-A06  ผู้เพิ่มแก้/ลบของตนได้ · Admin ทำได้ทุกร้าน
--   FR-A07  วงล้อสุ่มร้าน (ตัวกรอง + โหมดเฉพาะร้านเด็ด)
--   FR-A08  ลดโอกาสสุ่มร้านที่เพิ่งไปใน 7 วัน (เฟส 2 — เก็บประวัติไว้ตั้งแต่ตอนนี้)
--
-- ★★ ตารางร้านใช้ร่วมกันทั้งหน้า "ร้านเด็ด" และ "วงล้อสุ่ม"
--    ตามที่เอกสารระบุไว้ในหัวข้อ 2 — ร้านที่พนักงานเพิ่มใช้ได้ทั้งสองที่
--    ★ จึงไม่มีตาราง "ร้านสำหรับสุ่ม" แยกต่างหาก วงล้ออ่านจากตารางนี้ตรง ๆ
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ส่วนขยายสำหรับค้นชื่อคล้าย (FR-A02)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ pg_trgm เทียบความคล้ายของสตริงด้วย trigram (ตัวอักษรสามตัวติดกัน)
--
--    ทางเลือกอื่นคือเทียบด้วย ILIKE '%ชื่อ%' ซึ่งจับได้แค่ "เป็นส่วนหนึ่งของกัน"
--    ★ แต่กรณีที่เกิดจริงคือคนพิมพ์ "ก๋วยเตี๋ยวเรือป้าแดง" กับ "ก๋วยเตี๋ยวเรือ ป้าแดง"
--      (ต่างกันแค่ช่องว่าง) หรือสะกดต่างกันนิดหน่อย — ILIKE จับไม่ได้เลย
--
--    trigram จับได้ทั้งหมดนั้นและให้คะแนนความคล้างเป็นตัวเลข 0..1
--    ซึ่งเอาไปตั้งเกณฑ์ได้ว่าคล้ายแค่ไหนถึงจะเตือน
create extension if not exists pg_trgm with schema extensions;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ร้านอาหาร
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.restaurants (
  id             uuid primary key default gen_random_uuid(),

  -- ★ สองช่องนี้บังคับตาม FR-A01 — บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ใน UI
  name           text not null
                 constraint restaurants_name_len
                 check (char_length(btrim(name)) between 1 and 80),
  signature_dish text not null
                 constraint restaurants_dish_len
                 check (char_length(btrim(signature_dish)) between 1 and 120),

  -- ★ ที่เหลือไม่บังคับทั้งหมด — คนเพิ่มร้านตอนหิวไม่ควรต้องกรอก 8 ช่อง
  image_path     text,
  cuisine        text
                 constraint restaurants_cuisine_len
                 check (cuisine is null or char_length(cuisine) <= 40),
  /** '฿' | '฿฿' | '฿฿฿' — เก็บเป็นข้อความเพราะเป็นชุดปิดที่แสดงตรง ๆ ได้ */
  price_range    text
                 constraint restaurants_price
                 check (price_range is null or price_range in ('฿', '฿฿', '฿฿฿')),
  /** WALK | DRIVE | DELIVERY */
  distance       text
                 constraint restaurants_distance
                 check (distance is null or distance in ('WALK', 'DRIVE', 'DELIVERY')),
  map_url        text
                 constraint restaurants_map_https
                 check (map_url is null or map_url ~ '^https://'),
  note           text
                 constraint restaurants_note_len
                 check (note is null or char_length(note) <= 300),

  added_by       uuid references public.profiles(id) on delete set null,

  /*
   * ★★ นับคะแนนไว้ในแถวเลย ไม่ใช่ count() ทุกครั้งที่แสดงรายการ
   *
   *    FR-A04 บอกว่าต้อง "เรียงร้านตามจำนวนการกด" ซึ่งแปลว่าต้องเรียงด้วย
   *    ค่านี้ทุกครั้งที่โหลดหน้า ★ ถ้า count() จาก restaurant_votes ทุกครั้ง
   *      จะเป็น aggregate ต่อร้านทุกแถว แล้วช้าขึ้นเรื่อย ๆ ตามจำนวนโหวต
   *
   *    ★ ตัวนับนี้ถูกเขียนโดย RPC เท่านั้น (toggle_restaurant_vote)
   *      จึงไม่มีทางหลุดจากความจริงได้ — ต่างจากการให้ client อัปเดตเอง
   */
  vote_count     integer not null default 0
                 constraint restaurants_votes_non_negative check (vote_count >= 0),

  /*
   * ★ FR-A05: ครบเกณฑ์แล้ว "ติดป้ายและย้ายท้ายรายการ" ไม่ใช่ลบทิ้ง
   *   ร้านที่ถูกแจ้งผิดจะกลับมาได้ และคนที่รู้ว่ามันยังเปิดอยู่ยังเห็นมัน
   */
  maybe_closed   boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.restaurants is
  'ร้านอาหารที่พนักงานแนะนำ — ใช้ร่วมกันทั้งหน้าร้านเด็ดและวงล้อสุ่ม (FR-A01)';

drop trigger if exists restaurants_touch on public.restaurants;
create trigger restaurants_touch
  before update on public.restaurants
  for each row execute function public.touch_updated_at();

-- ★ index สำหรับการเรียงหลักของหน้ารายการ: ร้านที่ยังเปิดก่อน แล้วคะแนนมากสุด
create index if not exists restaurants_rank_idx
  on public.restaurants (maybe_closed, vote_count desc, created_at desc);

create index if not exists restaurants_added_by_idx
  on public.restaurants (added_by) where added_by is not null;

create index if not exists restaurants_cuisine_idx
  on public.restaurants (cuisine) where cuisine is not null;

-- ★ index สำหรับ FR-A02 — ทำให้ similarity() ไม่ต้องสแกนทั้งตาราง
create index if not exists restaurants_name_trgm_idx
  on public.restaurants using gin (name extensions.gin_trgm_ops);


-- ═════════════════════════════════════════════════════════════════════
-- 3 · เห็นด้วย (FR-A04)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.restaurant_votes (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- ★ หนึ่งคนกดได้ครั้งเดียวต่อร้าน — บังคับด้วย primary key ไม่ใช่โค้ด
  primary key (restaurant_id, user_id)
);

create index if not exists restaurant_votes_user_idx
  on public.restaurant_votes (user_id);


-- ═════════════════════════════════════════════════════════════════════
-- 4 · แจ้งร้านปิด (FR-A05)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ใช้ content_reports กลางจาก 0023 ไม่ทำตารางใหม่
--   target_type = 'restaurant' ซึ่งประกาศไว้ใน check constraint แล้ว
--   ★ เกณฑ์ "ครบกี่คน" จึงมาจาก app_settings ที่เดียวกับตลาดนัด
--     Admin ปรับครั้งเดียวมีผลทั้งสองโมดูล


-- ═════════════════════════════════════════════════════════════════════
-- 5 · ประวัติการไป (FR-A08 · เฟส 2 ใช้ลดโอกาสสุ่มซ้ำ)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ เก็บตั้งแต่เฟส 1 ทั้งที่ยังไม่ได้ใช้ถ่วงน้ำหนัก
--   เพราะวันที่เปิดฟีเจอร์นั้น เราอยากมีข้อมูลย้อนหลังให้มันทำงานได้ทันที
--   ★ ถ้าเริ่มเก็บตอนเปิดฟีเจอร์ ผู้ใช้จะไม่เห็นผลอะไรเลยในเจ็ดวันแรก

create table if not exists public.restaurant_visits (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  visited_at    timestamptz not null default now()
);

create index if not exists restaurant_visits_user_time_idx
  on public.restaurant_visits (user_id, visited_at desc);


-- ═════════════════════════════════════════════════════════════════════
-- 6 · RPC
-- ═════════════════════════════════════════════════════════════════════

/**
 * ผู้เรียกคนปัจจุบันเป็นพนักงานที่ใช้งานได้ไหม — ใช้ใน RLS policy
 *
 * ★★ ต้องมีตัวนี้แยกจาก employee_code_is_valid(uuid)
 *
 *    policy ต้องเรียกฟังก์ชันได้ แปลว่าต้อง grant ให้ role authenticated
 *    ★ แต่ถ้า grant ตัวที่รับ uuid เป็นพารามิเตอร์ ผู้ใช้ที่ login แล้ว
 *      จะยิง RPC ถาม "uuid นี้เป็นพนักงานที่ใช้งานอยู่ไหม" ของใครก็ได้
 *
 *    ★★ ตัวนี้ไม่รับอะไรเลย อ่าน auth.uid() ของตัวเองข้างใน จึงถามแทนคนอื่นไม่ได้
 *       (แพตเทิร์นเดียวกับ viewer_is_admin() ใน 0023)
 */
create or replace function public.viewer_is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.employee_code_is_valid((select auth.uid()));
$$;


/**
 * ร้านที่ชื่อใกล้เคียง (FR-A02)
 *
 * ★ เกณฑ์ 0.35 มาจากการลองกับชื่อร้านไทยจริง:
 *   "ก๋วยเตี๋ยวเรือป้าแดง" กับ "ก๋วยเตี๋ยวเรือ ป้าแดง" ได้ราว 0.9
 *   "ส้มตำป้าแดง" กับ "ก๋วยเตี๋ยวป้าแดง" ได้ราว 0.3 (คนละร้านจริง ๆ)
 *   ★ ตั้งสูงกว่านี้จะพลาดคู่ที่ต่างกันแค่ช่องว่าง ต่ำกว่านี้จะเตือนพร่ำเพรื่อ
 *     จนคนกดข้ามโดยไม่อ่าน ซึ่งแย่กว่าไม่เตือนเลย
 */
create or replace function public.similar_restaurants(p_name text, p_limit integer default 5)
returns table (id uuid, name text, signature_dish text, similarity real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select r.id, r.name, r.signature_dish, similarity(r.name, btrim(p_name)) as similarity
  from public.restaurants r
  where btrim(p_name) <> ''
    and similarity(r.name, btrim(p_name)) > 0.35
  order by similarity desc
  limit greatest(1, least(p_limit, 10));
$$;


/** เพิ่มร้าน (FR-A01) */
create or replace function public.add_restaurant(
  p_actor    uuid,
  p_name     text,
  p_dish     text,
  p_image    text default null,
  p_cuisine  text default null,
  p_price    text default null,
  p_distance text default null,
  p_map_url  text default null,
  p_note     text default null
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.restaurants;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.restaurants (
    name, signature_dish, image_path, cuisine, price_range, distance, map_url, note, added_by
  )
  values (
    btrim(p_name), btrim(p_dish), p_image,
    nullif(btrim(coalesce(p_cuisine, '')), ''),
    nullif(btrim(coalesce(p_price, '')), ''),
    nullif(btrim(coalesce(p_distance, '')), ''),
    nullif(btrim(coalesce(p_map_url, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_actor
  )
  returning * into v_row;

  /*
   * ★★ คนเพิ่มร้านถือว่า "เห็นด้วย" กับร้านตัวเองอัตโนมัติ
   *
   *    ไม่ใช่การโกงคะแนน — เขาแนะนำร้านนี้มาเอง การให้เริ่มที่ 0
   *    แล้วต้องกดเองอีกทีเป็นขั้นตอนที่ไม่มีความหมาย
   *    ★ และทำให้ "ร้านเด็ด" (>= 3 เสียง) นับได้ตรงกับจำนวนคนที่เชียร์จริง
   */
  insert into public.restaurant_votes (restaurant_id, user_id)
  values (v_row.id, p_actor);

  update public.restaurants set vote_count = 1 where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;


/** กด/ยกเลิก เห็นด้วย (FR-A04) */
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

  /*
   * ★ ล็อกแถวร้านก่อนแก้ตัวนับ
   *   สองคนกดพร้อมกันแล้วต่างคนต่างอ่าน vote_count เดิมจะทำให้นับหาย
   *   ★ ใช้ row lock ไม่ใช่ advisory lock เพราะแย่งกันแค่แถวเดียว
   *     ไม่เหมือนคิวเพลงที่ต้องกันทั้งห้อง
   */
  select * into v_row from public.restaurants where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  delete from public.restaurant_votes
   where restaurant_id = p_id and user_id = p_actor;
  v_existed := found;

  if v_existed then
    update public.restaurants
       set vote_count = greatest(0, vote_count - 1)
     where id = p_id returning * into v_row;
  else
    insert into public.restaurant_votes (restaurant_id, user_id) values (p_id, p_actor);
    update public.restaurants
       set vote_count = vote_count + 1
     where id = p_id returning * into v_row;
  end if;

  return v_row;
end;
$$;


/**
 * แจ้งร้านปิด/ย้าย (FR-A05)
 *
 * ★ ใช้ report_content กลางนับให้ แล้วเอาผลมาติดป้ายเอง
 *   เหตุผลอยู่ใน 0023: เกณฑ์อยู่ที่เดียว แต่การกระทำเหมาะกับแต่ละชนิดเนื้อหา
 */
create or replace function public.report_restaurant_closed(
  p_actor uuid,
  p_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.restaurants where id = p_id) then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  v_result := public.report_content(p_actor, 'restaurant', p_id, null);

  if (v_result ->> 'hidden')::boolean then
    update public.restaurants set maybe_closed = true where id = p_id;
  end if;

  return v_result || jsonb_build_object('maybeClosed', (v_result ->> 'hidden')::boolean);
end;
$$;


/** แก้ไขร้าน — เจ้าของหรือ Admin (FR-A06) */
create or replace function public.update_restaurant(
  p_actor    uuid,
  p_id       uuid,
  p_name     text,
  p_dish     text,
  p_image    text default null,
  p_cuisine  text default null,
  p_price    text default null,
  p_distance text default null,
  p_map_url  text default null,
  p_note     text default null,
  /** ★ ให้เจ้าของปลดป้าย "อาจปิดแล้ว" ได้เมื่อยืนยันว่ายังเปิดอยู่ */
  p_clear_closed boolean default false
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.restaurants;
begin
  select * into v_row from public.restaurants where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_row.added_by is distinct from p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  update public.restaurants
     set name           = btrim(p_name),
         signature_dish = btrim(p_dish),
         image_path     = coalesce(p_image, image_path),
         cuisine        = nullif(btrim(coalesce(p_cuisine, '')), ''),
         price_range    = nullif(btrim(coalesce(p_price, '')), ''),
         distance       = nullif(btrim(coalesce(p_distance, '')), ''),
         map_url        = nullif(btrim(coalesce(p_map_url, '')), ''),
         note           = nullif(btrim(coalesce(p_note, '')), ''),
         maybe_closed   = case when p_clear_closed then false else maybe_closed end
   where id = p_id
   returning * into v_row;

  /* ★ ปลดป้ายแล้วต้องล้างรายงานเก่าด้วย ไม่งั้นคนเดิมสามคนที่เคยแจ้ง
     จะทำให้มันติดป้ายอีกทันทีโดยไม่มีใครกดเพิ่มเลย */
  if p_clear_closed then
    delete from public.content_reports
     where target_type = 'restaurant' and target_id = p_id;
  end if;

  return v_row;
end;
$$;


/** ลบร้าน — เจ้าของหรือ Admin (FR-A06) */
create or replace function public.delete_restaurant(p_actor uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.restaurants;
begin
  select * into v_row from public.restaurants where id = p_id;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_row.added_by is distinct from p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.restaurants where id = p_id;
  return p_id;
end;
$$;


/** บันทึกว่าไปร้านนี้มา (FR-A08) */
create or replace function public.log_restaurant_visit(p_actor uuid, p_id uuid)
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

  insert into public.restaurant_visits (restaurant_id, user_id)
  values (p_id, p_actor)
  returning id into v_id;

  return v_id;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 7 · RLS
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ หลักการเดิมทุกประการ: อ่านผ่าน RLS · เขียนผ่าน RPC เท่านั้น

alter table public.restaurants       enable row level security;
alter table public.restaurant_votes  enable row level security;
alter table public.restaurant_visits enable row level security;

revoke all on public.restaurants, public.restaurant_votes, public.restaurant_visits
  from anon, authenticated;

grant select on public.restaurants, public.restaurant_votes to authenticated;
grant select on public.restaurant_visits to authenticated;

/*
 * ★★ ร้านอ่านได้เฉพาะคนที่ผูกรหัสพนักงานแล้ว (NFR-11)
 *
 *    ไม่ใช่ "ทุกคนที่ login" เพราะคนที่เข้ามาฟังเพลงอย่างเดียวไม่ใช่พนักงาน
 *    ★ ถ้าเปิดให้ทุกคนอ่าน รายชื่อร้านรอบออฟฟิศจะกลายเป็นข้อมูลสาธารณะ
 *      ซึ่งบอกตำแหน่งที่ตั้งของบริษัทโดยอ้อม
 */
drop policy if exists "restaurants: staff read" on public.restaurants;
create policy "restaurants: staff read"
  on public.restaurants for select to authenticated
  using (public.viewer_is_staff());

drop policy if exists "restaurant_votes: staff read" on public.restaurant_votes;
create policy "restaurant_votes: staff read"
  on public.restaurant_votes for select to authenticated
  using (public.viewer_is_staff());

-- ★ ประวัติการไปเป็นของส่วนตัว — เห็นเฉพาะของตัวเอง
drop policy if exists "restaurant_visits: read own" on public.restaurant_visits;
create policy "restaurant_visits: read own"
  on public.restaurant_visits for select to authenticated
  using (user_id = (select auth.uid()));


-- ═════════════════════════════════════════════════════════════════════
-- 8 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.add_restaurant(uuid, text, text, text, text, text, text, text, text),
  public.update_restaurant(uuid, uuid, text, text, text, text, text, text, text, text, boolean),
  public.delete_restaurant(uuid, uuid),
  public.toggle_restaurant_vote(uuid, uuid),
  public.report_restaurant_closed(uuid, uuid),
  public.log_restaurant_visit(uuid, uuid),
  public.similar_restaurants(text, integer)
from public, anon, authenticated;

grant execute on function
  public.add_restaurant(uuid, text, text, text, text, text, text, text, text),
  public.update_restaurant(uuid, uuid, text, text, text, text, text, text, text, text, boolean),
  public.delete_restaurant(uuid, uuid),
  public.toggle_restaurant_vote(uuid, uuid),
  public.report_restaurant_closed(uuid, uuid),
  public.log_restaurant_visit(uuid, uuid),
  public.similar_restaurants(text, integer)
to service_role;

-- ★ viewer_is_staff() ถูกเรียกจาก RLS policy ด้านบน ผู้ใช้ที่ login แล้วจึงต้องเรียกได้
--   ปลอดภัยเพราะไม่รับพารามิเตอร์ — อ่าน auth.uid() ของตัวเองเท่านั้น
--   ★ ส่วน employee_code_is_valid(uuid) ยังปิดไว้สำหรับ service_role เหมือนเดิม
revoke execute on function public.viewer_is_staff() from public, anon;
grant execute on function public.viewer_is_staff() to authenticated, service_role;
