-- ═══════════════════════════════════════════════════════════════════
-- 0033 · เฟส 2 · แชทตลาดนัด + คำค้นแจ้งเตือน
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-D08  แชทระหว่างผู้ซื้อกับผู้ขายภายในระบบ
--   FR-D09  ตั้งคำค้นแจ้งเตือนเมื่อมีสินค้าที่ตามหาลงประกาศ
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ห้องแชทต่อประกาศ (FR-D08)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ หนึ่งห้อง = หนึ่งประกาศ + หนึ่งผู้ซื้อ
--
--     ประกาศหนึ่งชิ้นมีคนสนใจหลายคน ★ ถ้าใช้ห้องเดียวต่อประกาศ
--     ผู้ซื้อทุกคนจะเห็นข้อความของกันและกัน — ซึ่งเป็นเรื่องส่วนตัว
--     (การต่อรองราคา เบอร์โทร เวลานัดรับ)
--
--     ★★ ผู้ขายเห็นทุกห้องของประกาศตัวเอง ผู้ซื้อเห็นเฉพาะห้องของตัวเอง
--        เหมือนกล่องข้อความของร้านค้าออนไลน์ทั่วไป

create table if not exists public.listing_threads (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id   uuid not null references public.profiles(id) on delete cascade,

  /** ★ อัปเดตทุกครั้งที่มีข้อความใหม่ — ใช้เรียงกล่องข้อความ */
  last_message_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  unique (listing_id, buyer_id)
);

create index if not exists listing_threads_listing_idx
  on public.listing_threads (listing_id, last_message_at desc);
create index if not exists listing_threads_buyer_idx
  on public.listing_threads (buyer_id, last_message_at desc);


create table if not exists public.listing_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.listing_threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,

  text       text not null
             constraint listing_messages_len
             check (char_length(btrim(text)) between 1 and 500),

  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists listing_messages_thread_idx
  on public.listing_messages (thread_id, created_at);

/* ★ นับข้อความที่ยังไม่อ่าน — partial index เพราะส่วนใหญ่อ่านแล้ว */
create index if not exists listing_messages_unread_idx
  on public.listing_messages (thread_id)
  where read_at is null;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · คำค้นแจ้งเตือน (FR-D09)
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.search_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,

  /*
   * ★ เก็บเป็นตัวพิมพ์เล็กเสมอ — เทียบแบบไม่สนตัวพิมพ์ใหญ่เล็ก
   *   (ภาษาไทยไม่มีเรื่องนี้ แต่คนพิมพ์ iPhone กับ iphone ต่างกัน)
   */
  keyword    text not null
             constraint search_alerts_len
             check (char_length(btrim(keyword)) between 2 and 40),

  created_at timestamptz not null default now(),

  -- ★ คนเดียวตั้งคำเดิมซ้ำไม่ได้
  unique (user_id, keyword)
);

create index if not exists search_alerts_keyword_idx on public.search_alerts (keyword);


-- ═════════════════════════════════════════════════════════════════════
-- 3 · แจ้งเตือนเมื่อมีประกาศตรงคำค้น (FR-D09)
-- ═════════════════════════════════════════════════════════════════════

/**
 * ★★★ ใช้ trigger ไม่ใช่ให้ API เรียกเอง
 *
 *     ประกาศถูกสร้างผ่าน create_listing ที่เดียวก็จริง ★ แต่วันหนึ่งอาจมี
 *     ทางอื่น (นำเข้าข้อมูล · แก้ชื่อประกาศแล้วเพิ่งตรงคำค้น)
 *     trigger รับประกันว่าทุกทางที่แถวเกิดขึ้น การแจ้งเตือนจะเกิดตาม
 *
 * ★★ ไม่แจ้งเจ้าของประกาศเอง — เขารู้อยู่แล้วว่าเพิ่งลงอะไร
 */
create or replace function public.notify_search_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  /* ★ ประกาศที่ถูกซ่อนไม่ต้องแจ้ง — มันไม่ควรถูกเห็นตั้งแต่แรก */
  if new.hidden then return new; end if;

  for v_row in
    select distinct a.user_id
    from public.search_alerts a
    where a.user_id <> new.seller_id
      and position(a.keyword in lower(new.title)) > 0
  loop
    perform public.notify(
      v_row.user_id,
      'marketAlert',
      'notify.type.marketAlert',
      jsonb_build_object('title', new.title),
      '/office/market'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists listings_notify_alerts on public.listings;
create trigger listings_notify_alerts
  after insert on public.listings
  for each row execute function public.notify_search_alerts();


/** เพิ่ม/ลบคำค้น */
create or replace function public.set_search_alert(
  p_actor   uuid,
  p_keyword text,
  p_on      boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(btrim(coalesce(p_keyword, '')));
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_on then
    /* ★ เพดาน 20 คำต่อคน — คนที่ตั้ง 200 คำจะได้แจ้งเตือนทุกประกาศ
       ซึ่งเท่ากับไม่ได้กรองอะไรเลย และกลายเป็นสแปมของตัวเอง */
    if (select count(*) from public.search_alerts where user_id = p_actor) >= 20 then
      raise exception 'QUEUE_FULL';
    end if;

    insert into public.search_alerts (user_id, keyword)
    values (p_actor, v_key)
    on conflict (user_id, keyword) do nothing;
  else
    delete from public.search_alerts where user_id = p_actor and keyword = v_key;
  end if;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · แชท (FR-D08)
-- ═════════════════════════════════════════════════════════════════════

/**
 * ส่งข้อความ — สร้างห้องให้อัตโนมัติถ้ายังไม่มี
 *
 * ★★ ผู้ซื้อเป็นคนเปิดห้องเสมอ ผู้ขายตอบในห้องที่มีอยู่แล้วเท่านั้น
 *
 *    ★ ถ้าผู้ขายเปิดห้องหาใครก็ได้ มันจะกลายเป็นช่องทางส่งข้อความหาคนทั้งบริษัท
 *      โดยอ้างว่าเป็นเรื่องซื้อขาย — ซึ่งเป็นสแปมที่ปิดกั้นยาก
 */
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

  /* แจ้งอีกฝ่าย */
  v_target := case when p_actor = v_listing.seller_id then p_buyer else v_listing.seller_id end;
  perform public.notify(
    v_target, 'marketMessage', 'notify.type.marketMessage',
    jsonb_build_object('title', v_listing.title),
    '/office/market/mine'
  );

  return v_id;
end;
$$;


/** กดอ่านข้อความในห้อง */
create or replace function public.read_listing_thread(p_actor uuid, p_thread uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  /* ★ อ่านได้เฉพาะคนในห้อง — และทำเครื่องหมายเฉพาะข้อความ "ของอีกฝ่าย" */
  update public.listing_messages m
     set read_at = now()
   where m.thread_id = p_thread
     and m.read_at is null
     and m.sender_id <> p_actor
     and exists (
       select 1 from public.listing_threads t
       join public.listings l on l.id = t.listing_id
       where t.id = p_thread and (t.buyer_id = p_actor or l.seller_id = p_actor)
     );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · RLS
-- ═════════════════════════════════════════════════════════════════════

alter table public.listing_threads  enable row level security;
alter table public.listing_messages enable row level security;
alter table public.search_alerts    enable row level security;

revoke all on public.listing_threads, public.listing_messages, public.search_alerts
  from anon, authenticated;
grant select on public.listing_threads, public.listing_messages, public.search_alerts
  to authenticated;

/*
 * ★★ ห้องแชทเห็นได้เฉพาะผู้ซื้อของห้องนั้นกับผู้ขายของประกาศ
 *    ★ ไม่มีข้อยกเว้นให้ Admin — ข้อความส่วนตัวระหว่างพนักงานสองคน
 *      ไม่ใช่สิ่งที่ผู้ดูแลระบบควรอ่านได้ (หลักการเดียวกับ debts ใน 0026)
 */
drop policy if exists "listing_threads: parties read" on public.listing_threads;
create policy "listing_threads: parties read"
  on public.listing_threads for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = listing_threads.listing_id and l.seller_id = (select auth.uid())
    )
  );

drop policy if exists "listing_messages: parties read" on public.listing_messages;
create policy "listing_messages: parties read"
  on public.listing_messages for select to authenticated
  using (
    exists (
      select 1 from public.listing_threads t
      join public.listings l on l.id = t.listing_id
      where t.id = listing_messages.thread_id
        and (t.buyer_id = (select auth.uid()) or l.seller_id = (select auth.uid()))
    )
  );

drop policy if exists "search_alerts: read own" on public.search_alerts;
create policy "search_alerts: read own"
  on public.search_alerts for select to authenticated
  using (user_id = (select auth.uid()));


-- ═════════════════════════════════════════════════════════════════════
-- 6 · Realtime
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ แชทต้องเด้งทันที ไม่งั้นต้องกดรีเฟรชถึงจะเห็นคำตอบ
alter table public.listing_messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'listing_messages'
  ) then
    alter publication supabase_realtime add table public.listing_messages;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 7 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.send_listing_message(uuid, uuid, uuid, text),
  public.read_listing_thread(uuid, uuid),
  public.set_search_alert(uuid, text, boolean)
from public, anon, authenticated;

grant execute on function
  public.send_listing_message(uuid, uuid, uuid, text),
  public.read_listing_thread(uuid, uuid),
  public.set_search_alert(uuid, text, boolean)
to service_role;
