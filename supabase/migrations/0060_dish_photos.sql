-- ============================================================================
--  0060 · รูปของเมนูเด็ดแต่ละรายการ
-- ============================================================================
--  ★ เมนูละ 1 รูป ไม่บังคับ · ไฟล์อยู่ใน bucket restaurants (public) โฟลเดอร์ dishes/
--  ★★ อัปรูปตอนเลือกในฟอร์มทันที (ยังไม่ต้องมีร้าน) แล้ว path ถูกส่งมากับรายการเมนู
--     ตอนกดบันทึก — ร้านใหม่กับร้านที่แก้ไขจึงใช้ทางเดียวกัน
--  ★ set_restaurant_dishes ลบแล้วใส่ใหม่ทั้งชุดเหมือนเดิม (0057) เพิ่มแค่คอลัมน์รูป
--
--  รันซ้ำได้ — วางใน SQL Editor ได้ทั้งไฟล์ · ไม่แตะข้อมูลเมนูเดิม (รูปเป็น null)
-- ============================================================================

alter table public.restaurant_dishes
  add column if not exists photo_path text;

do $$
begin
  alter table public.restaurant_dishes
    add constraint restaurant_dishes_photo_path
    check (photo_path is null or photo_path ~ '^dishes/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
exception when duplicate_object then null;
end
$$;

create or replace function public.set_restaurant_dishes(
  p_actor uuid,
  p_shop  uuid,
  /** [{"name":"ข้าวมันไก่","price":60,"photo":"dishes/…"}, …] — price เป็นบาท · photo ไม่บังคับ */
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

  insert into public.restaurant_dishes (restaurant_id, name, price_satang, sort, photo_path)
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
    (d.ord - 1)::smallint,
    /*
     * ★★ รูปของเมนู (0060) — รับเฉพาะ path ในโฟลเดอร์ dishes/ ของ bucket restaurants
     *    ★ ค่าหน้าตาไม่ตรง = ไม่มีรูป (ไม่ใช่ error) — ฟอร์มเก่าที่ไม่ส่งรูปก็ยังบันทึกได้
     */
    case
      when (d.value ->> 'photo') ~ '^dishes/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
        then d.value ->> 'photo'
      else null
    end
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
