-- ===========================================================================
-- 0050 · พิกัดร้าน · ระยะทางจากออฟฟิศ · เวลาเปิด-ปิด
-- ===========================================================================
--
-- ★★★ ข้อกำหนดห้ามใช้ Google API ที่ต้องมีกุญแจ (Distance Matrix · Directions ·
--     Places · Maps JavaScript) ★ ระยะทางจึงคำนวณเองด้วย Haversine
--     และแผนที่ใช้ Leaflet + OpenStreetMap ซึ่งไม่ต้องมีกุญแจ
--     ★★ ที่ยังใช้ได้คือ "ลิงก์" ของ Google Maps ซึ่งเป็นแค่ URL

begin;

-- ═════════════════════════════════════════════════════════════════════
-- 1 · พิกัดและเวลาทำการของร้าน
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ทุกคอลัมน์ nullable และไม่มี default ที่สื่อความหมาย
--    ข้อกำหนด: "ร้านที่ยังไม่มีพิกัด ให้ซ่อนส่วนนี้ ห้ามแสดง error"
--    ★ ร้านเก่าทั้งหมดจะเป็น null ซึ่งต้องเป็นสถานะที่ถูกต้อง ไม่ใช่ข้อมูลเสีย

alter table public.restaurants
  add column if not exists lat numeric(9,6)
      constraint restaurants_lat_range check (lat is null or (lat between -90 and 90)),
  add column if not exists lng numeric(9,6)
      constraint restaurants_lng_range check (lng is null or (lng between -180 and 180)),

  /*
   * ★★★ เก็บผลระยะทางที่คำนวณแล้ว ไม่ใช่คำนวณสดทุกครั้งที่โหลดหน้า
   *
   *     ข้อกำหนดบอกตรง ๆ ว่า "คำนวณตอนบันทึกพิกัดร้านแล้วเก็บไว้
   *     ถ้าพิกัดออฟฟิศเปลี่ยนให้คำนวณใหม่ทุกร้าน"
   *     ★ และตัวเลือกเรียง "ใกล้ที่สุด" ต้องเรียงด้วยค่านี้ ซึ่งถ้าไม่เก็บ
   *       จะเรียงในฐานข้อมูลไม่ได้เลย ต้องดึงทุกแถวมาคำนวณก่อนเสมอ
   */
  add column if not exists travel_meters  integer
      constraint restaurants_travel_m check (travel_meters is null or travel_meters >= 0),
  add column if not exists travel_minutes integer
      constraint restaurants_travel_min check (travel_minutes is null or travel_minutes >= 1),
  add column if not exists travel_mode    text
      constraint restaurants_travel_mode
      check (travel_mode is null or travel_mode in ('walking', 'driving')),

  /*
   * เวลาเปิด-ปิด — ไม่บังคับ กรอกแยกรายวันได้
   *
   * ★ เก็บเป็น jsonb ไม่ใช่ 14 คอลัมน์
   *   รูปแบบ: {"mon":["09:00","18:00"], "sun":null, …}  null = ปิดทั้งวัน
   *   ★★ ไม่มี query ไหนกรองด้วย "วันอังคารเปิดกี่โมง" — มันถูกอ่านทั้งก้อน
   *      เพื่อตอบคำถามเดียวคือ "ตอนนี้เปิดอยู่ไหม" ซึ่งคำนวณฝั่งหน้าเว็บ
   */
  add column if not exists open_hours jsonb;

comment on column public.restaurants.travel_meters is
  'ระยะตามถนน = Haversine × 1.3 — คำนวณตอนบันทึกพิกัด ไม่ใช่ตอนอ่าน';

-- ★ index สำหรับการเรียง "ใกล้ที่สุด" — ร้านที่ไม่มีพิกัดไม่ต้องอยู่ใน index
create index if not exists restaurants_travel_idx
  on public.restaurants (travel_meters) where travel_meters is not null;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · พิกัดออฟฟิศ
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ใส่ใน app_settings ซึ่งเป็น key-value ที่มีอยู่แล้ว ไม่สร้างตารางใหม่
--   ★★ เหตุผลเดียวกับที่ 0023 เขียนไว้: ค่าตั้งจะเพิ่มขึ้นเรื่อย ๆ
--      ถ้าแยกคอลัมน์ การเพิ่มค่าตั้งหนึ่งตัว = migration หนึ่งไฟล์ทุกครั้ง
--
-- ★★ ค่าเริ่มต้นเป็น null ไม่ใช่พิกัดสมมติ
--    ★ พิกัดที่ผิดแต่ดูเหมือนถูก อันตรายกว่าไม่มีพิกัด — ระยะทางทุกร้าน
--      จะถูกคำนวณจากจุดที่ไม่ใช่ออฟฟิศ แล้วไม่มีอะไรบอกว่ามันผิด
insert into public.app_settings (key, value) values
  ('office_latlng', 'null'::jsonb)
on conflict (key) do nothing;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · คำนวณระยะทางในฐานข้อมูล
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ มีสองที่ที่ต้องคำนวณ: ตอนบันทึกร้านทีละแห่ง (TypeScript) และตอน
--    พิกัดออฟฟิศเปลี่ยนแล้วต้องคิดใหม่ทั้งตาราง (ที่นี่)
--    ★ สูตรเดียวกันอยู่สองภาษา ซึ่งเป็นการทำซ้ำที่ยอมรับได้
--      เพราะทางเลือกคือดึงร้านทุกแถวออกมาคำนวณใน Node แล้วเขียนกลับทีละแถว

create or replace function public.recompute_restaurant_travel()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office jsonb;
  v_lat    numeric;
  v_lng    numeric;
  v_n      integer;
begin
  select value into v_office from public.app_settings where key = 'office_latlng';

  if v_office is null or jsonb_typeof(v_office) <> 'object' then
    /* ★ ยังไม่ได้ตั้งพิกัดออฟฟิศ = ล้างผลเก่าทิ้ง ไม่ใช่ปล่อยค้าง
         ★★ ค่าที่คำนวณจากพิกัดออฟฟิศเก่าที่ถูกลบไปแล้ว คือตัวเลขที่ผิด
            ซึ่งแย่กว่าการไม่มีตัวเลข */
    update public.restaurants
       set travel_meters = null, travel_minutes = null, travel_mode = null
     where travel_meters is not null;
    return 0;
  end if;

  v_lat := (v_office ->> 'lat')::numeric;
  v_lng := (v_office ->> 'lng')::numeric;

  with calc as (
    select
      id,
      /* Haversine (เมตร) × 1.3 ชดเชยถนนที่ไม่ตรง — ตามข้อกำหนด */
      round(
        2 * 6371000 * asin(sqrt(
          power(sin(radians(lat - v_lat) / 2), 2) +
          cos(radians(v_lat)) * cos(radians(lat)) *
          power(sin(radians(lng - v_lng) / 2), 2)
        )) * 1.3
      )::integer as m
    from public.restaurants
    where lat is not null and lng is not null
  )
  update public.restaurants r
     set travel_meters  = c.m,
         travel_mode    = case when c.m <= 800 then 'walking' else 'driving' end,
         /* ★ ปัดขึ้นและขั้นต่ำ 1 นาที — "0 นาที" ไม่ใช่คำตอบที่มีความหมาย */
         travel_minutes = greatest(1, ceil(c.m::numeric / case when c.m <= 800 then 80 else 400 end)::integer)
    from calc c
   where r.id = c.id;

  get diagnostics v_n = row_count;

  /* ★ ร้านที่ถูกลบพิกัดออกต้องถูกล้างผลด้วย ไม่ใช่เหลือค่าเก่าค้าง */
  update public.restaurants
     set travel_meters = null, travel_minutes = null, travel_mode = null
   where (lat is null or lng is null) and travel_meters is not null;

  return v_n;
end;
$$;


/**
 * ตั้งพิกัดออฟฟิศ แล้วคำนวณระยะทางใหม่ทั้งตารางทันที
 *
 * ★★ สองอย่างนี้ต้องอยู่ใน transaction เดียว
 *    ★ ถ้าแยกกัน จะมีช่วงเวลาที่พิกัดออฟฟิศใหม่แล้วแต่ระยะทางยังเป็นของเก่า
 *      ซึ่งหน้าเว็บจะแสดง "เดิน 3 นาที" ไปยังที่ที่อยู่คนละฝั่งเมือง
 */
create or replace function public.set_office_latlng(
  p_actor uuid,
  p_lat   numeric,
  p_lng   numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_lat is null or p_lng is null then
    update public.app_settings
       set value = 'null'::jsonb, updated_at = now(), updated_by = p_actor
     where key = 'office_latlng';
  else
    if abs(p_lat) > 90 or abs(p_lng) > 180 then
      raise exception 'VALIDATION_FAILED';
    end if;
    update public.app_settings
       set value = jsonb_build_object('lat', p_lat, 'lng', p_lng),
           updated_at = now(), updated_by = p_actor
     where key = 'office_latlng';
  end if;

  return public.recompute_restaurant_travel();
end;
$$;


/**
 * ตั้งพิกัดของร้านหนึ่งแห่ง แล้วคำนวณระยะทางของแถวนั้นทันที
 *
 * ★★ แยกเป็น RPC ของตัวเอง ไม่ยัดเพิ่มเข้า add_restaurant ที่มีอยู่
 *    ★ การเปลี่ยนลายเซ็นฟังก์ชันที่ของเดิมเรียกอยู่ แปลว่าต้องแก้ทุกที่
 *      ที่เรียกมันพร้อมกันเป๊ะ ๆ ★★ ฟังก์ชันใหม่ที่ทำอย่างเดียวจบ
 *      ไม่ทำให้เส้นทางเดิมเสี่ยงอะไรเลย
 *
 * ★ ใครก็ตั้งพิกัดร้านได้เหมือนที่ใครก็เพิ่มร้านได้ — ไม่ใช่สิทธิ์ Admin
 *   (ต่างจากพิกัดออฟฟิศ ซึ่งผิดแล้วกระทบระยะทางของทุกร้าน)
 */
create or replace function public.set_restaurant_latlng(
  p_actor uuid,
  p_id    uuid,
  p_lat   numeric,
  p_lng   numeric
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office jsonb;
  v_lat    numeric;
  v_lng    numeric;
  v_m      integer;
  v_row    public.restaurants;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_lat is not null and (abs(p_lat) > 90 or abs(p_lng) > 180) then
    raise exception 'VALIDATION_FAILED';
  end if;

  select value into v_office from public.app_settings where key = 'office_latlng';

  if p_lat is null or p_lng is null then
    v_m := null;
  elsif v_office is null or jsonb_typeof(v_office) <> 'object' then
    /* ★ ร้านมีพิกัดแล้วแต่ออฟฟิศยังไม่มี = เก็บพิกัดไว้ แต่ยังบอกระยะไม่ได้
         ★★ ไม่ใช่ปฏิเสธการบันทึก — พิกัดร้านมีประโยชน์ของมันเอง
            (ป้าย "รีวิวที่ร้าน") และจะถูกคิดระยะให้เองตอน admin ตั้งออฟฟิศ */
    v_m := null;
  else
    v_lat := (v_office ->> 'lat')::numeric;
    v_lng := (v_office ->> 'lng')::numeric;
    v_m := round(
      2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_lat) / 2), 2) +
        cos(radians(v_lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - v_lng) / 2), 2)
      )) * 1.3
    )::integer;
  end if;

  update public.restaurants
     set lat = p_lat,
         lng = p_lng,
         travel_meters  = v_m,
         travel_mode    = case when v_m is null then null
                               when v_m <= 800 then 'walking' else 'driving' end,
         travel_minutes = case when v_m is null then null
                               else greatest(1, ceil(v_m::numeric / case when v_m <= 800 then 80 else 400 end)::integer)
                          end
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  return v_row;
end;
$$;


revoke all on function
  public.recompute_restaurant_travel(),
  public.set_office_latlng(uuid, numeric, numeric),
  public.set_restaurant_latlng(uuid, uuid, numeric, numeric)
  from public, anon, authenticated;

grant execute on function
  public.recompute_restaurant_travel(),
  public.set_office_latlng(uuid, numeric, numeric),
  public.set_restaurant_latlng(uuid, uuid, numeric, numeric)
  to service_role;

commit;
