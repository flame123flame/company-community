-- ===========================================================================
-- 0057 · เมนูเด็ดหลายรายการ + ราคาต่อเมนู
-- ===========================================================================
--
-- ★★★ ทำไมต้องเป็นตาราง ไม่ใช่ jsonb ในคอลัมน์เดิม
--
--     ★ เมนูมีฟิลด์ของตัวเอง (ชื่อ · ราคา · ลำดับ) และต้องค้นหาได้
--       ★★ jsonb ค้นหาข้ามร้านไม่ได้โดยไม่เขียน query พิเศษทุกครั้ง
--     ★ และวันที่อยากรู้ว่า "เมนูไหนในออฟฟิศแพงสุด" ตารางตอบได้ด้วย
--       คำสั่งเดียว ส่วน jsonb ต้องกางทุกแถวออกมาก่อน
--
-- ★★★ signature_dish ของเดิมยังอยู่ และยังเป็น not null
--
--     ★ ถอดทิ้งไม่ได้ — add_restaurant · similar_restaurants · หน้าสร้างบิล
--       และหน้ารายการร้านอ่านมันอยู่
--     ★★ แต่มันจะไม่ใช่ "แหล่งความจริงที่สอง" เพราะ RPC เป็นคนเขียนมัน
--        จากเมนูรายการแรกเสมอ ★ มีผู้เขียนคนเดียว จึงไม่มีทางเพี้ยนจากกัน
--        ★★ กฎเดียวกับตัวนับหัวใจที่ซ่อมไปใน 0048 — ค่าที่คำนวณได้
--           ต้องมีผู้ดูแลคนเดียว ไม่ใช่ข้อตกลงว่าทุกคนจะอัปเดตให้ตรง

-- ★ ไม่มี begin;/commit; — ตัวรันยิงทีละคำสั่งนอกทรานแซกชัน (ดูเหตุผลใน 0056)

-- ═════════════════════════════════════════════════════════════════════
-- 1 · ตาราง
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.restaurant_dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null
                constraint restaurant_dishes_name_len
                check (char_length(btrim(name)) between 1 and 120),
  /*
   * ★ ราคาไม่บังคับ — ตามที่สั่ง
   *   ★★ เก็บเป็นสตางค์เหมือนทั้งระบบ ไม่ใช่ทศนิยม
   *      ★ numeric กับ float ของเงินเคยทำให้ยอดหารเพี้ยนมาแล้ว —
   *        ทั้งโมดูลกระเป๋าเงินใช้สตางค์ด้วยเหตุผลนี้
   */
  price_satang  integer
                constraint restaurant_dishes_price_range
                check (price_satang is null or (price_satang >= 0 and price_satang <= 10000000)),
  sort          smallint not null default 0,
  created_at    timestamptz not null default now()
);

comment on table public.restaurant_dishes is
  'เมนูเด็ดของร้าน — หลายรายการต่อร้าน ราคาไม่บังคับ (0057)';

create index if not exists restaurant_dishes_shop_idx
  on public.restaurant_dishes (restaurant_id, sort, created_at);

alter table public.restaurant_dishes enable row level security;
-- ★ ไม่มี policy โดยตั้งใจ — เขียนผ่าน RPC security definer เท่านั้น


-- ═════════════════════════════════════════════════════════════════════
-- 2 · เขียนทับเมนูทั้งชุด
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ แทนที่ทั้งชุด ไม่ใช่เพิ่มทีละรายการ
--
--     ★ หน้าเว็บส่ง "รายการเมนูทั้งหมดหลังแก้" มาเสมอ เพราะผู้ใช้ลบและ
--       สลับลำดับได้ในฟอร์มเดียว ★★ การส่งเฉพาะส่วนต่างแปลว่าหน้าเว็บ
--       ต้องคำนวณว่าอะไรเพิ่ม/ลบ/ย้าย ซึ่งเป็นงานที่ผิดได้ง่ายและไม่มีใครตรวจ
--     ★ วิธีเดียวกับที่ upsert_restaurant_review ทำกับรูป (0049)
--
-- ★★ อัปเดต signature_dish ให้ตรงกับเมนูรายการแรกในคำสั่งเดียวกัน
--    ★ คนละทรานแซกชันแปลว่ามีช่วงเวลาที่การ์ดโชว์เมนูเก่า

create or replace function public.set_restaurant_dishes(
  p_actor uuid,
  p_shop  uuid,
  /** [{"name":"ข้าวมันไก่","price":60}, …] — price เป็นบาท ไม่บังคับ */
  p_dishes jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_first text;
  v_count integer;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select added_by into v_owner from public.restaurants where id = p_shop for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  /* ★ สิทธิ์เดียวกับการแก้ร้าน — เจ้าของหรือแอดมิน */
  if v_owner is distinct from p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  v_count := coalesce(jsonb_array_length(p_dishes), 0);
  if v_count = 0 then
    raise exception 'VALIDATION_FAILED';
  end if;
  /* ★ เพดานเดียวกับรูป — ฟอร์มที่ยาวไม่จำกัดคือฟอร์มที่กรอกไม่จบ */
  if v_count > 20 then
    raise exception 'VALIDATION_FAILED';
  end if;

  delete from public.restaurant_dishes where restaurant_id = p_shop;

  insert into public.restaurant_dishes (restaurant_id, name, price_satang, sort)
  select
    p_shop,
    btrim(d.value ->> 'name'),
    /*
     * ★ บาท → สตางค์ ปัดที่ฐานข้อมูล ไม่ใช่ฝั่งหน้าเว็บ
     *   ★★ ปัดสองที่ด้วยวิธีต่างกัน คือยอดที่ไม่ตรงกันในวันที่มีเศษ
     */
    case
      when d.value ->> 'price' is null or btrim(d.value ->> 'price') = '' then null
      else round((d.value ->> 'price')::numeric * 100)::integer
    end,
    (d.ord - 1)::smallint
  from jsonb_array_elements(p_dishes) with ordinality as d(value, ord)
  where btrim(coalesce(d.value ->> 'name', '')) <> '';

  /*
   * ★★ ซิงก์ signature_dish จากเมนูรายการแรก
   *    ★ คอลัมน์นั้นเป็น not null และมีโค้ดเก่าอ่านอยู่หลายที่
   *      ★★ ให้ RPC ตัวนี้เป็นผู้เขียนคนเดียว จึงไม่มีทางเพี้ยนจากตาราง
   */
  select name into v_first
    from public.restaurant_dishes
   where restaurant_id = p_shop
   order by sort, created_at
   limit 1;

  if v_first is not null then
    update public.restaurants set signature_dish = v_first where id = p_shop;
  end if;

  return (select count(*)::integer from public.restaurant_dishes where restaurant_id = p_shop);
end;
$$;

revoke all on function public.set_restaurant_dishes(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_restaurant_dishes(uuid, uuid, jsonb) to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ย้ายของเดิมเข้ามา
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ร้านที่มีอยู่แล้วทุกร้านได้เมนูหนึ่งรายการจาก signature_dish เดิม
--    ★ ไม่ย้ายแปลว่าร้านเก่าทั้งหมดจะมีรายการเมนูว่างเปล่า ทั้งที่ข้อมูล
--      อยู่ในคอลัมน์เดิมอยู่แล้ว
--    ★★ where not exists กันไม่ให้ซ้ำเมื่อไฟล์ถูกรันซ้ำ

insert into public.restaurant_dishes (restaurant_id, name, price_satang, sort)
select r.id, r.signature_dish, null, 0
  from public.restaurants r
 where btrim(coalesce(r.signature_dish, '')) <> ''
   and not exists (
     select 1 from public.restaurant_dishes d where d.restaurant_id = r.id
   );
