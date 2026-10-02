-- ═════════════════════════════════════════════════════════════════════
-- 0034 · ลิงก์ของแจ้งเตือนข้อความ → หน้ากล่องข้อความ
--
-- ★ 0033 ชี้ไป /office/market/mine เพราะตอนนั้นยังไม่มีหน้าแชท
--   ตอนนี้มี /office/market/chat แล้ว — แจ้งเตือนต้องพาไปที่ห้องแชทตรง ๆ
--   ไม่ใช่หน้า "ของฉัน" ที่ผู้ใช้ต้องมองหาเองว่าข้อความอยู่ไหน
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.send_listing_message(
  p_actor   uuid,
  p_listing uuid,
  p_buyer   uuid,
  p_text    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_thread  uuid;
  v_id      uuid;
  v_target  uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if btrim(coalesce(p_text, '')) = '' or char_length(btrim(p_text)) > 500 then
    raise exception 'VALIDATION_FAILED: text';
  end if;

  select * into v_listing from public.listings where id = p_listing;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  /* ผู้ส่งต้องเป็นผู้ขาย หรือเป็นผู้ซื้อของห้องนั้นเอง */
  if p_actor <> v_listing.seller_id and p_actor <> p_buyer then
    raise exception 'FORBIDDEN';
  end if;

  if p_buyer = v_listing.seller_id then
    raise exception 'VALIDATION_FAILED: cannot chat with yourself';
  end if;

  select id into v_thread
  from public.listing_threads
  where listing_id = p_listing and buyer_id = p_buyer;

  if v_thread is null then
    /* ★ ผู้ขายเปิดห้องใหม่ไม่ได้ — ต้องมีผู้ซื้อทักมาก่อน */
    if p_actor = v_listing.seller_id then
      raise exception 'FORBIDDEN';
    end if;

    insert into public.listing_threads (listing_id, buyer_id)
    values (p_listing, p_buyer)
    returning id into v_thread;
  end if;

  insert into public.listing_messages (thread_id, sender_id, text)
  values (v_thread, p_actor, btrim(p_text))
  returning id into v_id;

  update public.listing_threads set last_message_at = now() where id = v_thread;

  v_target := case when p_actor = v_listing.seller_id then p_buyer else v_listing.seller_id end;
  perform public.notify(
    v_target, 'marketMessage', 'notify.type.marketMessage',
    jsonb_build_object('title', v_listing.title),
    '/office/market/chat'
  );

  return v_id;
end;
$$;

revoke all on function public.send_listing_message(uuid, uuid, uuid, text) from public;
grant execute on function public.send_listing_message(uuid, uuid, uuid, text) to service_role;

/* ★ แจ้งเตือนที่ค้างอยู่ก็ย้ายปลายทางให้ด้วย ไม่ปล่อยให้ลิงก์เก่าพาไปผิดที่ */
update public.notifications
set link = '/office/market/chat'
where type = 'marketMessage' and link = '/office/market/mine';
