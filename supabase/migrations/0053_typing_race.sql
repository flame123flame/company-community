-- ===========================================================================
-- 0053 · แข่งพิมพ์ดีดออนไลน์ — ห้อง · ผู้เล่น · สถิติ
-- ===========================================================================
--
-- ★★★ ใส่ policy "อ่าน" ตั้งแต่แรก ไม่รอให้เทสต์จับ
--
--     0051 เปิด RLS แล้วไม่ใส่ policy โดยเทียบจากตารางที่เขียนผ่าน RPC
--     อย่างเดียว ★ ผลคือ Realtime ส่งอะไรไม่ได้เลย และมันเงียบสนิท
--     ★★ กฎที่ได้มา: ตารางไหนถูกฟังผ่าน Realtime ตารางนั้นต้องมี policy
--        select เสมอ เพราะ Realtime ส่ง event ในนามของผู้ใช้ที่ subscribe
--        ไม่ใช่ service role
--
-- ★★ การเขียนยังผ่าน RPC ทางเดียวเหมือนทุกตารางในโมดูลออฟฟิศ

drop table if exists public.typing_results cascade;
drop table if exists public.typing_players cascade;
drop table if exists public.typing_rooms cascade;


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ห้องแข่ง
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.typing_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  lang       text not null default 'th'
             constraint typing_rooms_lang check (lang in ('th', 'en')),
  length     text not null default 'medium'
             constraint typing_rooms_length check (length in ('short', 'medium')),
  text_body  text not null,
  status     text not null default 'WAITING'
             constraint typing_rooms_status
             check (status in ('WAITING', 'COUNTDOWN', 'RACING', 'FINISHED')),
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.typing_rooms.code is
  'รหัสห้องสำหรับชวนเพื่อน — ใช้แทนการส่ง uuid ยาว ๆ';
comment on column public.typing_rooms.text_body is
  'ข้อความที่ทุกคนในห้องต้องพิมพ์ — เก็บไว้ที่ห้อง ไม่ให้แต่ละเครื่องสุ่มเอง ไม่งั้นการแข่งไม่มีความหมาย';
comment on column public.typing_rooms.started_at is
  'เวลาที่นับถอยหลังจบและเริ่มพิมพ์จริง — ทุกเครื่องคิด WPM จากเวลานี้ตัวเดียวกัน';

create index if not exists typing_rooms_open_idx
  on public.typing_rooms (status, created_at desc) where status = 'WAITING';

drop trigger if exists typing_rooms_touch on public.typing_rooms;
create trigger typing_rooms_touch
  before update on public.typing_rooms
  for each row execute function public.touch_updated_at();

alter table public.typing_rooms enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ผู้เล่นในห้อง
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.typing_players (
  room_id     uuid not null references public.typing_rooms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  progress    integer not null default 0,
  wpm         integer not null default 0,
  accuracy    numeric(5,1) not null default 100,
  finished_at timestamptz,
  joined_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

comment on column public.typing_players.progress is
  'พิมพ์ถูกต่อเนื่องจากต้นกี่ตัวอักษร — ใช้วาดแถบความคืบหน้า';

create index if not exists typing_players_room_idx
  on public.typing_players (room_id, progress desc);

alter table public.typing_players enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · สถิติรายครั้ง (กระดานอันดับ)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ แยกจาก typing_players เพราะห้องถูกลบได้ แต่สถิติต้องอยู่
--   ★★ และกระดานอันดับต้องรวมผลจาก "ฝึกคนเดียว" ด้วย ซึ่งไม่มีห้อง

create table if not exists public.typing_results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  room_id    uuid references public.typing_rooms(id) on delete set null,
  lang       text not null constraint typing_results_lang check (lang in ('th', 'en')),
  wpm        integer not null constraint typing_results_wpm check (wpm >= 0),
  accuracy   numeric(5,1) not null,
  elapsed_ms integer not null,
  created_at timestamptz not null default now()
);

comment on table public.typing_results is
  'ผลการพิมพ์แต่ละครั้ง — เฉพาะผลที่ผ่านด่านความสมเหตุสมผล (WPM ≤ 250) เท่านั้นที่ถูกบันทึก';

create index if not exists typing_results_board_idx
  on public.typing_results (lang, created_at desc, wpm desc);
create index if not exists typing_results_user_idx
  on public.typing_results (user_id, lang, created_at desc);

alter table public.typing_results enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · Realtime + policy อ่าน
-- ═════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.typing_rooms;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.typing_players;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ★ ห้องที่กำลังรออยู่ ทุกคนเห็นได้ (ใช้สำหรับ "แข่งด่วน")
--   ส่วนห้องที่เริ่มแล้ว เห็นเฉพาะคนที่อยู่ในห้อง
drop policy if exists typing_rooms_read on public.typing_rooms;
create policy typing_rooms_read on public.typing_rooms
  for select using (
    status = 'WAITING'
    or exists (
      select 1 from public.typing_players p
      where p.room_id = typing_rooms.id and p.user_id = (select auth.uid())
    )
  );

/*
 * ★★★ แถบความคืบหน้าของทุกคนในห้องต้องอ่านได้ — นี่คือหัวใจของเกม
 *     ★ ถ้าอ่านได้แค่แถวตัวเอง จะเห็นแค่ตัวเองวิ่ง ไม่เห็นคนอื่น
 *       ซึ่งทำให้มันไม่ใช่การแข่ง
 */
drop policy if exists typing_players_read on public.typing_players;
create policy typing_players_read on public.typing_players
  for select using (
    exists (
      select 1 from public.typing_players me
      where me.room_id = typing_players.room_id and me.user_id = (select auth.uid())
    )
  );

-- ★ กระดานอันดับทุกคนดูได้
drop policy if exists typing_results_read on public.typing_results;
create policy typing_results_read on public.typing_results
  for select using (true);


-- ═════════════════════════════════════════════════════════════════════
-- 5 · RPC
-- ═════════════════════════════════════════════════════════════════════

/**
 * สร้างห้อง หรือเข้าห้องที่มีคนรออยู่ ("แข่งด่วน")
 *
 * ★★ ทำสองอย่างในฟังก์ชันเดียว เพราะ "แข่งด่วน" คือ "หาห้องรอ ถ้าไม่มีก็สร้าง"
 *    ★ แยกเป็นสองคำขอจะมีช่องว่างให้สองคนสร้างห้องพร้อมกันแล้วรอกันคนละห้อง
 */
create or replace function public.typing_join(
  p_actor uuid,
  p_code  text,     -- null = แข่งด่วน (หาห้องรอ)
  p_lang  text,
  p_len   text,
  p_text  text,     -- ใช้เมื่อต้องสร้างห้องใหม่
  p_newcode text
)
returns public.typing_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.typing_rooms;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_code is not null then
    select * into v_room from public.typing_rooms where code = upper(btrim(p_code)) for update;
    if not found then
      raise exception 'QUEUE_ITEM_NOT_FOUND';
    end if;
    /* ★ เข้าห้องที่เริ่มแข่งไปแล้วไม่ได้ — จะได้เปรียบ/เสียเปรียบเวลาทันที */
    if v_room.status <> 'WAITING' then
      raise exception 'VALIDATION_FAILED';
    end if;
  else
    /*
     * ★ หาห้องที่ยังรออยู่ ภาษาเดียวกัน และยังไม่เต็ม
     *   ★★ ล็อกแถวตอนเลือก เพื่อไม่ให้สองคนแย่งที่สุดท้ายพร้อมกัน
     */
    select r.* into v_room
      from public.typing_rooms r
     where r.status = 'WAITING' and r.lang = p_lang
       and (select count(*) from public.typing_players p where p.room_id = r.id) < 6
       and r.created_at > now() - interval '5 minutes'
     order by r.created_at
     limit 1
       for update skip locked;

    if not found then
      insert into public.typing_rooms (code, owner_id, lang, length, text_body)
      values (p_newcode, p_actor, p_lang, p_len, p_text)
      returning * into v_room;
    end if;
  end if;

  /* ★ เข้าห้องซ้ำไม่สร้างแถวใหม่ — คนที่รีโหลดหน้าต้องกลับเข้าที่เดิม */
  insert into public.typing_players (room_id, user_id)
  values (v_room.id, p_actor)
  on conflict (room_id, user_id) do nothing;

  return v_room;
end;
$$;


/** เจ้าของห้องกดเริ่ม — ตั้งเวลาเริ่มจริงไว้ข้างหน้าเพื่อให้นับถอยหลังพร้อมกัน */
create or replace function public.typing_start(
  p_actor uuid,
  p_room  uuid,
  p_delay integer   -- วินาทีของการนับถอยหลัง
)
returns public.typing_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.typing_rooms;
begin
  select * into v_room from public.typing_rooms where id = p_room for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;
  if v_room.owner_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;
  if v_room.status <> 'WAITING' then
    raise exception 'VALIDATION_FAILED';
  end if;

  /*
   * ★★★ started_at อยู่ "ในอนาคต" ไม่ใช่ now()
   *     ★ ทุกเครื่องนับถอยหลังจากเวลาเดียวกัน แล้วเริ่มพิมพ์พร้อมกันจริง
   *       ★★ ถ้าใช้ now() เครื่องที่ได้รับ event ช้ากว่าจะเริ่มช้ากว่า
   *          แล้ว WPM ของมันจะต่ำกว่าความจริงโดยไม่ใช่ความผิดของคนพิมพ์
   */
  update public.typing_rooms
     set status = 'COUNTDOWN',
         started_at = now() + make_interval(secs => greatest(1, p_delay))
   where id = p_room
  returning * into v_room;

  return v_room;
end;
$$;


/** รายงานความคืบหน้าระหว่างพิมพ์ */
create or replace function public.typing_progress(
  p_actor uuid,
  p_room  uuid,
  p_chars integer,
  p_wpm   integer,
  p_acc   numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.typing_players
     set progress = greatest(progress, p_chars),
         wpm = p_wpm,
         accuracy = p_acc
   where room_id = p_room and user_id = p_actor and finished_at is null;
  return found;
end;
$$;


/**
 * พิมพ์จบ — บันทึกผลและปิดห้องถ้าทุกคนจบแล้ว
 *
 * ★★ p_credible ถูกตัดสินที่ route ด้วย lib/games/typing (เลขเดียวกันทั้งสองฝั่ง)
 *    ★ ผลที่ไม่น่าเชื่อถือยังขึ้นในห้อง แต่ไม่ถูกบันทึกลงกระดานอันดับ
 *      ★★ ตัดออกจากห้องด้วยจะทำให้คนที่เน็ตกระตุกหายไปจากผลการแข่ง
 *         ทั้งที่เขาพิมพ์จริง
 */
create or replace function public.typing_finish(
  p_actor    uuid,
  p_room     uuid,
  p_wpm      integer,
  p_acc      numeric,
  p_elapsed  integer,
  p_credible boolean
)
returns public.typing_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.typing_rooms;
  v_left integer;
begin
  select * into v_room from public.typing_rooms where id = p_room for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  update public.typing_players
     set wpm = p_wpm, accuracy = p_acc, finished_at = coalesce(finished_at, now()),
         progress = greatest(progress, 0)
   where room_id = p_room and user_id = p_actor;

  if p_credible then
    insert into public.typing_results (user_id, room_id, lang, wpm, accuracy, elapsed_ms)
    values (p_actor, p_room, v_room.lang, p_wpm, p_acc, p_elapsed);
  end if;

  select count(*) into v_left
    from public.typing_players
   where room_id = p_room and finished_at is null;

  /* ★ ทุกคนจบแล้ว → ปิดห้อง (คนที่ออกกลางคันถูกลบแถวไปแล้ว จึงไม่ค้าง) */
  if v_left = 0 then
    update public.typing_rooms set status = 'FINISHED' where id = p_room
    returning * into v_room;
  end if;

  return v_room;
end;
$$;


/** ออกจากห้อง — ★ ห้องต้องเล่นต่อได้ถ้ายังมีคนอื่นอยู่ (ตามข้อกำหนด) */
create or replace function public.typing_leave(
  p_actor uuid,
  p_room  uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
begin
  delete from public.typing_players where room_id = p_room and user_id = p_actor;

  select count(*) into v_left from public.typing_players where room_id = p_room;
  if v_left = 0 then
    delete from public.typing_rooms where id = p_room;
  end if;

  return true;
end;
$$;


/** บันทึกผลจากโหมดฝึกคนเดียว — ไม่มีห้อง */
create or replace function public.typing_solo_result(
  p_actor    uuid,
  p_lang     text,
  p_wpm      integer,
  p_acc      numeric,
  p_elapsed  integer,
  p_credible boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;
  if not p_credible then
    return false;
  end if;

  insert into public.typing_results (user_id, room_id, lang, wpm, accuracy, elapsed_ms)
  values (p_actor, null, p_lang, p_wpm, p_acc, p_elapsed);
  return true;
end;
$$;


revoke all on function
  public.typing_join(uuid, text, text, text, text, text),
  public.typing_start(uuid, uuid, integer),
  public.typing_progress(uuid, uuid, integer, integer, numeric),
  public.typing_finish(uuid, uuid, integer, numeric, integer, boolean),
  public.typing_leave(uuid, uuid),
  public.typing_solo_result(uuid, text, integer, numeric, integer, boolean)
  from public, anon, authenticated;

grant execute on function
  public.typing_join(uuid, text, text, text, text, text),
  public.typing_start(uuid, uuid, integer),
  public.typing_progress(uuid, uuid, integer, integer, numeric),
  public.typing_finish(uuid, uuid, integer, numeric, integer, boolean),
  public.typing_leave(uuid, uuid),
  public.typing_solo_result(uuid, text, integer, numeric, integer, boolean)
  to service_role;
