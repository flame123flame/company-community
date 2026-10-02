-- ═══════════════════════════════════════════════════════════════════
-- 0029 · โมดูล D · ตลาดนัดออฟฟิศ
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-D01  ลงประกาศ (บังคับรูป ชื่อ ราคา · ระบุสภาพได้)
--   FR-D02  ประเภท: ขาย · แจกฟรี · แลกเปลี่ยน · หาซื้อ
--   FR-D03  หมวดหมู่ชุดคงที่ + ค้นหาตามคำหรือหมวด
--   FR-D04  สถานะ: ว่าง · จองแล้ว · ขายแล้ว
--   FR-D05  ปุ่มสนใจ/จองแบบมีคิว — คนก่อนยกเลิกแล้วแจ้งคนถัดไป
--   FR-D06  จุดนัดรับในออฟฟิศ (ตึก ชั้น โต๊ะ)
--   FR-D07  ชำระผ่าน QR ผู้ขาย หรือสร้างรายการค้างจ่ายในโมดูล B
--   FR-D10  รายงานประกาศ ซ่อนเมื่อครบเกณฑ์ + เตือนสินค้าต้องห้าม
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ประกาศ
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles(id) on delete cascade,

  title       text not null
              constraint listings_title_len
              check (char_length(btrim(title)) between 1 and 100),

  /*
   * ★★ ราคาเป็น numeric(12,2) เหมือนโมดูล B ไม่ใช่ integer
   *    เพราะ FR-D07 ให้สร้างรายการค้างจ่ายจากราคานี้ได้โดยตรง
   *    ★ ถ้าชนิดข้อมูลต่างกัน จะมีจุดแปลงที่ปัดเศษเงียบ ๆ อยู่ตรงกลาง
   *
   * ★ 0 ได้ — ประกาศแจกฟรีกับหาซื้อไม่มีราคา แต่ null จะทำให้ต้องเช็ค
   *   null ทุกที่ที่แสดงผล ใช้ 0 แล้วตัดสินจาก kind ง่ายกว่า
   */
  price       numeric(12,2) not null default 0
              constraint listings_price_range check (price >= 0 and price <= 9999999),

  /** SELL | FREE | TRADE | WANTED (FR-D02) */
  kind        text not null default 'SELL'
              constraint listings_kind
              check (kind in ('SELL', 'FREE', 'TRADE', 'WANTED')),

  /*
   * ★★ หมวดหมู่เป็น "ชุดคงที่ที่กำหนดไว้ในระบบ" ตาม FR-D03
   *    บังคับด้วย check constraint ไม่ใช่ตารางอ้างอิง
   *    ★ ตารางอ้างอิงเปิดทางให้ใครเพิ่มหมวดเองได้ ซึ่งจะกลายเป็น
   *      หมวดที่สะกดต่างกันสิบแบบภายในเดือนเดียว
   */
  category    text not null default 'OTHER'
              constraint listings_category
              check (category in (
                'ELECTRONICS', 'FURNITURE', 'CLOTHES', 'BOOKS',
                'SPORTS', 'FOOD', 'PLANT', 'OTHER'
              )),

  /** NEW | GOOD | FLAWED — ไม่บังคับ (ประกาศหาซื้อไม่มีสภาพสินค้า) */
  condition   text
              constraint listings_condition
              check (condition is null or condition in ('NEW', 'GOOD', 'FLAWED')),

  description text
              constraint listings_desc_len
              check (description is null or char_length(description) <= 1000),

  /* ── จุดนัดรับ (FR-D06) ───────────────────────────────────────── */
  meet_building text constraint listings_building_len check (meet_building is null or char_length(meet_building) <= 40),
  meet_floor    text constraint listings_floor_len    check (meet_floor is null or char_length(meet_floor) <= 20),
  meet_desk     text constraint listings_desk_len     check (meet_desk is null or char_length(meet_desk) <= 40),

  /** AVAILABLE | RESERVED | SOLD (FR-D04) */
  status      text not null default 'AVAILABLE'
              constraint listings_status
              check (status in ('AVAILABLE', 'RESERVED', 'SOLD')),

  /*
   * ★ FR-D10: ครบเกณฑ์รายงานแล้ว "ซ่อนอัตโนมัติ" — ต่างจากร้านอาหาร
   *   ที่แค่ติดป้าย เพราะประกาศที่ถูกรายงานมักเป็นของต้องห้ามจริง ๆ
   *   ★ เจ้าของยังเห็นและลบเองได้ (FR-X08) — ด่านอยู่ที่ policy ด้านล่าง
   */
  hidden      boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists listings_touch on public.listings;
create trigger listings_touch
  before update on public.listings
  for each row execute function public.touch_updated_at();

/*
 * ★ index หลักของหน้ารายการ: ของที่ยังไม่ถูกซ่อน · แจกฟรีมาก่อน · ใหม่สุดก่อน
 *   FR-D03 ระบุว่า "ประกาศแจกฟรีแสดงก่อน" — เรียงด้วย kind ไม่ได้ตรง ๆ
 *   เพราะ FREE ไม่ได้มาก่อน SELL ตามตัวอักษร จึงเรียงใน query ด้วย
 *   expression แทน (ดู API)
 */
create index if not exists listings_browse_idx
  on public.listings (hidden, status, created_at desc);

create index if not exists listings_seller_idx
  on public.listings (seller_id, created_at desc);

create index if not exists listings_category_idx
  on public.listings (category) where not hidden;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · รูปประกาศ (FR-D01 — บังคับอย่างน้อย 1 รูป สูงสุด 5)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.listing_images (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  url        text not null
             constraint listing_images_https check (url ~ '^https://'),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists listing_images_listing_idx
  on public.listing_images (listing_id, sort);

/*
 * ★★ bucket นี้เป็น public ต่างจากของโมดูล B
 *
 *    NFR-06 ระบุชัดว่าเฉพาะ "สลิป ใบเสร็จ และ QR รับเงิน" ที่ต้องเป็นส่วนตัว
 *    ★ รูปสินค้าถูกแสดงเป็นตารางหลายสิบใบพร้อมกันในหน้ารายการ —
 *      ถ้าเป็น private ต้องออก signed URL ทีละใบทุกครั้งที่โหลดหน้า
 *      ซึ่งช้าและไม่ได้ปกป้องอะไรเพิ่ม (พนักงานทุกคนเห็นได้อยู่แล้ว)
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listings', 'listings', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · คิวจอง (FR-D05)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ ทำไมต้องมีคิว ไม่ใช่แค่ "ใครกดก่อนได้ก่อน"
--
--     ของชิ้นเดียวมีคนสนใจสามคน คนแรกหายไปเฉย ๆ — ถ้าไม่มีคิว
--     ผู้ขายต้องไล่ทักทีละคนเอง ★ และคนที่ 2-3 ไม่รู้เลยว่าตัวเองยังมีสิทธิ์
--
--     คิวทำให้ "คนก่อนหน้ายกเลิก → แจ้งคนถัดไปอัตโนมัติ" เป็นไปได้
--     ซึ่งเป็นสิ่งที่ FR-D05 ระบุตรง ๆ

create table if not exists public.listing_reservations (
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,

  /*
   * ★ position เพิ่มขึ้นเรื่อย ๆ ไม่ใช้ซ้ำแม้มีคนยกเลิก
   *   หลักการเดียวกับ queue_items.position ใน migration 0002 —
   *   ★ ทำให้ "ใครอยู่คิวไหน" ตัดสินได้จากการเรียงอย่างเดียว
   *     ไม่ต้องเขียนเลขใหม่ทั้งคิวทุกครั้งที่มีคนออก
   */
  position   bigint not null,

  /** ACTIVE | CANCELLED | CHOSEN */
  status     text not null default 'ACTIVE'
             constraint listing_reservations_status
             check (status in ('ACTIVE', 'CANCELLED', 'CHOSEN')),

  created_at timestamptz not null default now(),

  primary key (listing_id, user_id)
);

-- ★ หาคิวถัดไป: คนที่ยัง ACTIVE และ position น้อยสุด
create index if not exists listing_reservations_queue_idx
  on public.listing_reservations (listing_id, position)
  where status = 'ACTIVE';

create index if not exists listing_reservations_user_idx
  on public.listing_reservations (user_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════
-- 4 · RPC
-- ═════════════════════════════════════════════════════════════════════

/** ลงประกาศ (FR-D01) — รูปส่งมาเป็น array ของ URL */
create or replace function public.create_listing(
  p_actor       uuid,
  p_title       text,
  p_price       numeric,
  p_kind        text,
  p_category    text,
  p_condition   text,
  p_description text,
  p_building    text,
  p_floor       text,
  p_desk        text,
  p_images      jsonb
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.listings;
  v_url text;
  v_i   integer := 0;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ FR-D01 บังคับรูป — บังคับที่นี่ไม่ใช่แค่ใน UI
     ประกาศที่ไม่มีรูปคือประกาศที่ไม่มีใครกดเข้าไปดู */
  if jsonb_typeof(coalesce(p_images, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_images) = 0 then
    raise exception 'VALIDATION_FAILED: at least one image required';
  end if;

  if jsonb_array_length(p_images) > 5 then
    raise exception 'VALIDATION_FAILED: at most 5 images';
  end if;

  insert into public.listings (
    seller_id, title, price, kind, category, condition, description,
    meet_building, meet_floor, meet_desk
  )
  values (
    p_actor, btrim(p_title),
    /* ★ แจกฟรีกับหาซื้อบังคับราคา 0 — กันประกาศ "แจกฟรี 500 บาท" */
    case when p_kind in ('FREE', 'WANTED') then 0 else coalesce(p_price, 0) end,
    coalesce(p_kind, 'SELL'), coalesce(p_category, 'OTHER'),
    nullif(btrim(coalesce(p_condition, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_building, '')), ''),
    nullif(btrim(coalesce(p_floor, '')), ''),
    nullif(btrim(coalesce(p_desk, '')), '')
  )
  returning * into v_row;

  for v_url in select jsonb_array_elements_text(p_images) loop
    insert into public.listing_images (listing_id, url, sort)
    values (v_row.id, v_url, v_i);
    v_i := v_i + 1;
  end loop;

  return v_row;
end;
$$;


/**
 * กดสนใจ/จอง — ต่อท้ายคิว (FR-D05)
 *
 * ★ กดซ้ำ = ยกเลิกการจอง (toggle) เหมือนปุ่มเห็นด้วยของร้านอาหาร
 *   ★ และถ้าคนที่ยกเลิกคือคิวแรก ต้องแจ้งคนถัดไปทันที
 */
create or replace function public.toggle_reservation(
  p_actor uuid,
  p_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_row     public.listing_reservations;
  v_was_first boolean := false;
  v_next    uuid;
  v_pos     bigint;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ ล็อกประกาศก่อนแตะคิว — สองคนกดพร้อมกันต้องได้ position คนละเลข */
  select * into v_listing from public.listings where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_listing.seller_id = p_actor then
    raise exception 'VALIDATION_FAILED: cannot reserve your own listing';
  end if;

  if v_listing.status = 'SOLD' then
    raise exception 'VALIDATION_FAILED: already sold';
  end if;

  select * into v_row
  from public.listing_reservations
  where listing_id = p_id and user_id = p_actor;

  if found and v_row.status = 'ACTIVE' then
    /* ── ยกเลิกการจอง ─────────────────────────────────────────── */
    v_was_first := not exists (
      select 1 from public.listing_reservations
      where listing_id = p_id and status = 'ACTIVE' and position < v_row.position
    );

    update public.listing_reservations
       set status = 'CANCELLED'
     where listing_id = p_id and user_id = p_actor;

    /*
     * ★★ แจ้งคนถัดไปเฉพาะตอนที่ "คิวแรก" ยกเลิก
     *    คนกลางคิวยกเลิกไม่กระทบใคร — แจ้งไปก็เป็นการรบกวนเปล่า ๆ
     */
    if v_was_first then
      select user_id into v_next
      from public.listing_reservations
      where listing_id = p_id and status = 'ACTIVE'
      order by position
      limit 1;

      if v_next is not null then
        perform public.notify(
          v_next, 'marketQueueTurn', 'notify.type.marketQueueTurn',
          jsonb_build_object('title', v_listing.title),
          '/office/market/mine'
        );
      end if;
    end if;

    return jsonb_build_object('reserved', false, 'queue', public.reservation_count(p_id));
  end if;

  /* ── เข้าคิว ───────────────────────────────────────────────── */
  select coalesce(max(position), 0) + 1 into v_pos
  from public.listing_reservations where listing_id = p_id;

  insert into public.listing_reservations (listing_id, user_id, position, status)
  values (p_id, p_actor, v_pos, 'ACTIVE')
  on conflict (listing_id, user_id)
  do update set status = 'ACTIVE', position = v_pos;

  perform public.notify(
    v_listing.seller_id, 'marketReserved', 'notify.type.marketReserved',
    jsonb_build_object('title', v_listing.title),
    '/office/market/mine'
  );

  return jsonb_build_object('reserved', true, 'queue', public.reservation_count(p_id));
end;
$$;


/** จำนวนคนในคิวที่ยัง ACTIVE */
create or replace function public.reservation_count(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.listing_reservations
  where listing_id = p_id and status = 'ACTIVE';
$$;


/** ผู้ขายเปลี่ยนสถานะ / เลือกผู้ซื้อจากคิว (FR-D04) */
create or replace function public.set_listing_status(
  p_actor  uuid,
  p_id     uuid,
  p_status text,
  p_buyer  uuid default null
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.listings;
begin
  select * into v_row from public.listings where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_row.seller_id <> p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('AVAILABLE', 'RESERVED', 'SOLD') then
    raise exception 'VALIDATION_FAILED: unknown status';
  end if;

  update public.listings set status = p_status where id = p_id returning * into v_row;

  if p_buyer is not null then
    update public.listing_reservations
       set status = 'CHOSEN'
     where listing_id = p_id and user_id = p_buyer;
  end if;

  return v_row;
end;
$$;


/** ลบประกาศ — เจ้าของหรือ Admin */
create or replace function public.delete_listing(p_actor uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.listings;
begin
  select * into v_row from public.listings where id = p_id;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_row.seller_id <> p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.listings where id = p_id;
  return p_id;
end;
$$;


/** รายงานประกาศ — ครบเกณฑ์แล้วซ่อน (FR-D10) */
create or replace function public.report_listing(p_actor uuid, p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_seller uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select seller_id into v_seller from public.listings where id = p_id;
  if v_seller is null then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  v_result := public.report_content(p_actor, 'listing', p_id, p_reason);

  if (v_result ->> 'hidden')::boolean then
    update public.listings set hidden = true where id = p_id;

    /* ★ FR-X08: เจ้าของต้องรู้ว่าของตัวเองถูกซ่อน ไม่ใช่หายไปเงียบ ๆ */
    perform public.notify(
      v_seller, 'contentHidden', 'notify.type.contentHidden',
      '{}'::jsonb, '/office/market/mine'
    );
  end if;

  return v_result;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · RLS
-- ═════════════════════════════════════════════════════════════════════

alter table public.listings             enable row level security;
alter table public.listing_images       enable row level security;
alter table public.listing_reservations enable row level security;

revoke all on public.listings, public.listing_images, public.listing_reservations
  from anon, authenticated;
grant select on public.listings, public.listing_images, public.listing_reservations
  to authenticated;

/*
 * ★★ ประกาศที่ถูกซ่อนยังมองเห็นได้โดยเจ้าของและ Admin (FR-X08)
 *    "เจ้าของเนื้อหายังเห็นและลบเนื้อหาของตนได้"
 *    ★ ถ้าซ่อนจากเจ้าของด้วย เขาจะลบมันเองไม่ได้เลย แล้วของต้องห้าม
 *      จะค้างอยู่ในฐานข้อมูลตลอดไปจนกว่า Admin จะเข้ามาจัดการ
 */
drop policy if exists "listings: staff read" on public.listings;
create policy "listings: staff read"
  on public.listings for select to authenticated
  using (
    public.viewer_is_staff()
    and (not hidden or seller_id = (select auth.uid()) or public.viewer_is_admin())
  );

drop policy if exists "listing_images: staff read" on public.listing_images;
create policy "listing_images: staff read"
  on public.listing_images for select to authenticated
  using (public.viewer_is_staff());

/*
 * ★★ คิวจองเห็นได้เฉพาะผู้ขายกับคนที่อยู่ในคิวนั้น
 *    ★ ไม่ใช่ทุกคน — "ใครสนใจของชิ้นไหน" เป็นเรื่องส่วนตัวพอสมควร
 *      หน้ารายการแสดงแค่ "จำนวนคนในคิว" ซึ่งมาจาก RPC ไม่ใช่การอ่านตารางนี้
 */
drop policy if exists "listing_reservations: parties read" on public.listing_reservations;
create policy "listing_reservations: parties read"
  on public.listing_reservations for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = listing_reservations.listing_id and l.seller_id = (select auth.uid())
    )
  );


-- ═════════════════════════════════════════════════════════════════════
-- 6 · Realtime
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ สถานะประกาศต้องเปลี่ยนทันทีเมื่อผู้ขายกดขายแล้ว ไม่งั้นคนที่เปิดหน้าค้างไว้
--   จะกดจองของที่ขายไปแล้ว
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 7 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.create_listing(uuid, text, numeric, text, text, text, text, text, text, text, jsonb),
  public.toggle_reservation(uuid, uuid),
  public.set_listing_status(uuid, uuid, text, uuid),
  public.delete_listing(uuid, uuid),
  public.report_listing(uuid, uuid, text),
  public.reservation_count(uuid)
from public, anon, authenticated;

grant execute on function
  public.create_listing(uuid, text, numeric, text, text, text, text, text, text, text, jsonb),
  public.toggle_reservation(uuid, uuid),
  public.set_listing_status(uuid, uuid, text, uuid),
  public.delete_listing(uuid, uuid),
  public.report_listing(uuid, uuid, text),
  public.reservation_count(uuid)
to service_role;
