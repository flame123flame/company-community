-- ═════════════════════════════════════════════════════════════════════
-- 0035 · ห้องสุ่มกลุ่ม (FR-A09)
--
-- "สุ่มพร้อมกันหลายคน เห็นผลเดียวกันแบบเรียลไทม์"
--
-- ★★★ ผลลัพธ์ต้องถูกตัดสินที่ฐานข้อมูล ไม่ใช่ที่เบราว์เซอร์
--
--     FR-X05 บอกว่าผลต้องถูกสุ่มก่อนแอนิเมชัน — ในห้องกลุ่มข้อนี้ยิ่งสำคัญ
--     ★ ถ้าให้แต่ละเครื่องสุ่มเอง ทุกเครื่องจะได้ผลต่างกันแล้วทะเลาะกัน
--     ★ ถ้าให้เครื่องเจ้าของห้องสุ่มแล้วส่งผลให้คนอื่น เจ้าของห้องแก้ผลได้
--       (เปิด devtools ส่งผลที่ตัวเองอยากได้) — คนอื่นพิสูจน์ไม่ได้ว่าไม่โกง
--     ★★ ตัดสินใน SQL = ทุกคนได้ผลเดียวกัน และไม่มีใครเลือกผลได้
--        เจ้าของห้องแค่ "กดสุ่ม" ไม่ได้ "กำหนดผล"
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.draw_rooms (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles(id) on delete cascade,

  title      text not null
             constraint draw_rooms_title_len check (char_length(btrim(title)) between 1 and 80),

  /*
   * ตัวเลือกในวงล้อ — เก็บเป็น jsonb array ของ {id, label}
   *
   * ★ ไม่อ้างอิงตาราง restaurants ด้วย FK แม้ส่วนใหญ่จะสุ่มร้านอาหาร
   *   เพราะห้องเดียวกันอาจสุ่มชื่อคน (FR-C01) หรือหัวข้ออะไรก็ได้
   *   ★ และถ้าร้านถูกลบทีหลัง ประวัติห้องที่สุ่มไปแล้วต้องไม่เปลี่ยนความหมาย
   */
  options    jsonb not null
             constraint draw_rooms_options_shape
             check (jsonb_typeof(options) = 'array'
                    and jsonb_array_length(options) between 2 and 100),

  status     text not null default 'OPEN'
             constraint draw_rooms_status check (status in ('OPEN', 'SPINNING', 'DONE')),

  /** ผลที่ตัดสินแล้ว — null จนกว่าจะกดสุ่ม */
  winner_id    text,
  winner_label text,

  /*
   * ★ เวลาที่เริ่มหมุน ใช้ให้ทุกเครื่องหมุนพร้อมกัน
   *   คนที่เปิดหน้าช้ากว่า 1 วินาทีจะหมุนสั้นลง 1 วินาทีแล้วมาหยุดพร้อมกัน
   *   ★ ไม่ใช่ให้ทุกคนหมุนครบเวลาเต็มนับจากตอนที่ตัวเองได้รับ —
   *     แบบนั้นผลจะโผล่ไม่พร้อมกันแล้วคนที่เร็วกว่าจะสปอยล์ให้คนอื่น
   */
  spun_at    timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.draw_rooms is
  'ห้องสุ่มพร้อมกันหลายคน — ผลถูกตัดสินใน SQL ไม่ใช่ที่เครื่องเจ้าของห้อง (FR-A09)';

create index if not exists draw_rooms_open_idx
  on public.draw_rooms (created_at desc)
  where status <> 'DONE';


create table if not exists public.draw_room_members (
  room_id   uuid not null references public.draw_rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

comment on table public.draw_room_members is
  'คนที่อยู่ในห้องสุ่ม — ใช้แสดงว่า "ใครอยู่ในห้องนี้" ระหว่างรอ';


-- ═════════════════════════════════════════════════════════════════════
-- RLS — ห้องสุ่มเป็นกิจกรรมเปิด พนักงานทุกคนเข้าร่วมได้
-- ═════════════════════════════════════════════════════════════════════

alter table public.draw_rooms        enable row level security;
alter table public.draw_room_members enable row level security;

drop policy if exists draw_rooms_read on public.draw_rooms;
create policy draw_rooms_read on public.draw_rooms
  for select using (public.viewer_is_staff());

drop policy if exists draw_members_read on public.draw_room_members;
create policy draw_members_read on public.draw_room_members
  for select using (public.viewer_is_staff());

/*
 * ★ ไม่มี policy insert/update/delete เลย — ทุกการเปลี่ยนแปลงผ่าน RPC
 *   ★★ สำคัญที่สุดคือห้ามให้ client เขียน winner_id ได้โดยตรง
 *      ถ้ามี policy update ให้เจ้าของห้อง เจ้าของห้องจะกำหนดผลเองได้ทันที
 *      ซึ่งทำลายเหตุผลทั้งหมดของการตัดสินผลในฐานข้อมูล
 */


-- ═════════════════════════════════════════════════════════════════════
-- RPC
-- ═════════════════════════════════════════════════════════════════════

/** สร้างห้อง แล้วเจ้าของห้องเข้าร่วมเองทันที */
create or replace function public.create_draw_room(
  p_actor   uuid,
  p_title   text,
  p_options jsonb
)
returns public.draw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.draw_rooms;
  v_open integer;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★ กันห้องค้าง: คนเดียวเปิดห้องที่ยังไม่สุ่มได้ทีละ 3 ห้อง
   *   ไม่ใช่ rate limit ต่อเวลา เพราะห้องที่เปิดแล้วทิ้งไว้เป็นขยะถาวร
   *   ไม่ใช่ภาระชั่วคราว — จำกัดที่ "จำนวนค้าง" จึงตรงปัญหากว่า
   */
  select count(*) into v_open
  from public.draw_rooms
  where host_id = p_actor and status = 'OPEN';

  if v_open >= 3 then
    raise exception 'VALIDATION_FAILED: too many open rooms';
  end if;

  insert into public.draw_rooms (host_id, title, options)
  values (p_actor, btrim(p_title), p_options)
  returning * into v_room;

  insert into public.draw_room_members (room_id, user_id)
  values (v_room.id, p_actor);

  return v_room;
end;
$$;


/** เข้าร่วมห้อง */
create or replace function public.join_draw_room(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.draw_rooms where id = p_room) then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  /* ★ เข้าห้องที่สุ่มแล้วได้ — เข้ามาดูผลย้อนหลังไม่ใช่เรื่องผิด */
  insert into public.draw_room_members (room_id, user_id)
  values (p_room, p_actor)
  on conflict (room_id, user_id) do nothing;
end;
$$;


/** ออกจากห้อง */
create or replace function public.leave_draw_room(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.draw_room_members
  where room_id = p_room and user_id = p_actor;
end;
$$;


/**
 * กดสุ่ม — เจ้าของห้องเท่านั้น
 *
 * ★★ ตัดสินผลที่นี่ครั้งเดียว แล้วล็อกไว้
 *
 *    ใช้ update … where status = 'OPEN' เป็นด่าน ★ ไม่ใช่ if แล้ว update
 *    เพราะถ้าเจ้าของห้องกดสองครั้งรัว ๆ (หรือเน็ตช้าแล้วกดซ้ำ)
 *    สองคำสั่งจะอ่าน status = 'OPEN' พร้อมกันแล้วสุ่มทับกัน —
 *    ★★ คนที่เห็นผลแรกจะเห็นผลเปลี่ยนกลางอากาศ ซึ่งคือฝันร้ายของฟีเจอร์นี้
 *       เงื่อนไขใน where ทำให้คำสั่งที่สองแพ้และไม่เปลี่ยนอะไร
 */
create or replace function public.spin_draw_room(p_actor uuid, p_room uuid)
returns public.draw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.draw_rooms;
  v_count  integer;
  v_pick   jsonb;
begin
  select * into v_room from public.draw_rooms where id = p_room;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_room.host_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  if v_room.status <> 'OPEN' then
    /* ★ ไม่ raise — คืนห้องตามสภาพจริง ให้หน้าเว็บวาดผลที่มีอยู่ต่อได้เลย */
    return v_room;
  end if;

  v_count := jsonb_array_length(v_room.options);

  /*
   * ★ random() ของ Postgres ใช้ได้ที่นี่ — ต่างจากฝั่งเบราว์เซอร์ที่ต้องใช้ CSPRNG
   *   เพราะความเสี่ยงที่ FR-X05 ป้องกันคือ "คนคาดเดาผลล่วงหน้าได้"
   *   ★ ผู้ใช้เข้าถึง seed ของเซิร์ฟเวอร์ไม่ได้อยู่แล้ว และผลถูกเปิดทันที
   *     ไม่มีช่วงที่รู้ผลแล้วยังเดิมพันได้
   */
  v_pick := v_room.options -> floor(random() * v_count)::integer;

  update public.draw_rooms
  set status       = 'SPINNING',
      winner_id    = coalesce(v_pick ->> 'id', v_pick ->> 'label'),
      winner_label = coalesce(v_pick ->> 'label', v_pick ->> 'id'),
      spun_at      = now()
  where id = p_room and status = 'OPEN'
  returning * into v_room;

  if v_room.id is null then
    /* แพ้การแข่ง — อ่านผลที่คนแรกตัดสินไว้ */
    select * into v_room from public.draw_rooms where id = p_room;
  end if;

  return v_room;
end;
$$;


/**
 * ปิดห้อง — เปลี่ยน SPINNING → DONE หลังแอนิเมชันจบ
 *
 * ★ ใครก็เรียกได้ ไม่จำกัดเจ้าของห้อง
 *   เพราะถ้าเจ้าของห้องปิดแท็บกลางทาง ห้องจะค้างที่ SPINNING ตลอดไป
 *   ★ เรียกซ้ำไม่มีผลเสีย และไม่มีอะไรให้โกงเพราะผลถูกล็อกไปแล้ว
 */
create or replace function public.finish_draw_room(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  update public.draw_rooms
  set status = 'DONE'
  where id = p_room and status = 'SPINNING';
end;
$$;


/** ลบห้อง — เจ้าของห้องหรือ Admin */
create or replace function public.delete_draw_room(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  select host_id into v_host from public.draw_rooms where id = p_room;
  if v_host is null then return; end if;

  if v_host <> p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.draw_rooms where id = p_room;
end;
$$;


revoke all on function public.create_draw_room(uuid, text, jsonb) from public;
revoke all on function public.join_draw_room(uuid, uuid)          from public;
revoke all on function public.leave_draw_room(uuid, uuid)         from public;
revoke all on function public.spin_draw_room(uuid, uuid)          from public;
revoke all on function public.finish_draw_room(uuid, uuid)        from public;
revoke all on function public.delete_draw_room(uuid, uuid)        from public;

grant execute on function public.create_draw_room(uuid, text, jsonb) to service_role;
grant execute on function public.join_draw_room(uuid, uuid)          to service_role;
grant execute on function public.leave_draw_room(uuid, uuid)         to service_role;
grant execute on function public.spin_draw_room(uuid, uuid)          to service_role;
grant execute on function public.finish_draw_room(uuid, uuid)        to service_role;
grant execute on function public.delete_draw_room(uuid, uuid)        to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- Realtime — หัวใจของฟีเจอร์นี้
-- ═════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'draw_rooms'
  ) then
    alter publication supabase_realtime add table public.draw_rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'draw_room_members'
  ) then
    alter publication supabase_realtime add table public.draw_room_members;
  end if;
end $$;

/*
 * ★ Realtime ส่งเฉพาะคอลัมน์ที่เปลี่ยนถ้าไม่ตั้ง replica identity full
 *   หน้าเว็บต้องรู้ทั้ง status + winner + spun_at พร้อมกันในอีเวนต์เดียว
 *   ★ ไม่งั้นต้องยิง fetch ตามทุกครั้งที่มีอีเวนต์ ซึ่งช้ากว่าและเห็นผลไม่พร้อมกัน
 */
alter table public.draw_rooms        replica identity full;
alter table public.draw_room_members replica identity full;
