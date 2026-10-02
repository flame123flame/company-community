-- ===========================================================================
-- 0055 · เก็บงานที่เหลือของสองเกม
--        หมดเวลา 3 ครั้งถึงแพ้ · เริ่มอัตโนมัติ · แข่งอีกรอบ · กระดานอันดับ
-- ===========================================================================

-- ═════════════════════════════════════════════════════════════════════
-- 1 · หมดเวลาครบ 3 ครั้งถือว่าแพ้ (ข้อกำหนด 2.4)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ของเดิมผมทำให้หมดเวลาครั้งเดียวแพ้เลย ซึ่ง "เข้มกว่า" ที่สั่ง
--    ★ ฟังดูเหมือนเรื่องเล็ก แต่มันเปลี่ยนเกม: คนที่เน็ตหลุดสิบวินาที
--      แพ้ทันทีโดยไม่มีโอกาสกลับมา
--      ★★ สามครั้งคือการบอกว่า "ระบบรู้ว่าชีวิตจริงมีเรื่องแทรก"

alter table public.checkers_games
  add column if not exists bottom_timeouts smallint not null default 0,
  add column if not exists top_timeouts    smallint not null default 0;

comment on column public.checkers_games.bottom_timeouts is
  'ฝ่ายล่างปล่อยหมดเวลาไปกี่ครั้ง — ครบ 3 ครั้งถือว่าแพ้ (ข้อกำหนด 2.4)';


-- ═════════════════════════════════════════════════════════════════════
-- 2 · หมดเวลา: นับครั้ง แล้วค่อยตัดสิน
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.checkers_end(
  p_actor  uuid,
  p_game   uuid,
  p_action text   -- RESIGN | OFFER_DRAW | ACCEPT_DRAW | TIMEOUT
)
returns public.checkers_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g     public.checkers_games;
  v_count smallint;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_g from public.checkers_games where id = p_game for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;
  if v_g.bottom_id <> p_actor and v_g.top_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;
  if v_g.status <> 'PLAYING' then
    raise exception 'VALIDATION_FAILED';
  end if;

  if p_action = 'RESIGN' then
    update public.checkers_games
       set status = 'FINISHED',
           end_reason = 'RESIGN',
           /* ★ ผู้ชนะคืออีกฝ่าย ไม่ใช่คนที่กด */
           winner_id = case when v_g.bottom_id = p_actor then v_g.top_id else v_g.bottom_id end,
           version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'OFFER_DRAW' then
    update public.checkers_games
       set draw_offer_by = p_actor, version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'ACCEPT_DRAW' then
    /* ★★ รับเสมอได้เฉพาะเมื่ออีกฝ่ายเป็นคนขอ */
    if v_g.draw_offer_by is null or v_g.draw_offer_by = p_actor then
      raise exception 'FORBIDDEN';
    end if;
    update public.checkers_games
       set status = 'FINISHED', end_reason = 'DRAW', winner_id = null,
           draw_offer_by = null, version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'TIMEOUT' then
    /*
     * ★★★ นับครั้งก่อน แล้วค่อยตัดสิน — ครบ 3 ครั้งถึงแพ้
     *
     *     ★ ฝ่ายที่ "ถึงตา" เป็นฝ่ายที่โดนนับ ไม่ใช่คนที่กดรายงาน
     *       ★★ ใครกดก็ได้ เพราะคนที่หมดเวลามักปิดแอปไปแล้ว
     *     ★★ ยังไม่ครบ 3 → ข้ามตาให้อีกฝ่ายเดินต่อ ไม่ใช่ค้างอยู่ที่เดิม
     *        ★ ถ้าไม่ข้ามตา เกมจะติดอยู่ตรงนั้นตลอดไปเมื่อคนหนึ่งหายไป
     */
    v_count := case when v_g.turn = 'BOTTOM' then v_g.bottom_timeouts else v_g.top_timeouts end;
    v_count := v_count + 1;

    if v_count >= 3 then
      update public.checkers_games
         set status = 'FINISHED', end_reason = 'TIMEOUT',
             winner_id = case when v_g.turn = 'BOTTOM' then v_g.top_id else v_g.bottom_id end,
             bottom_timeouts = case when v_g.turn = 'BOTTOM' then v_count else bottom_timeouts end,
             top_timeouts    = case when v_g.turn = 'TOP'    then v_count else top_timeouts end,
             version = v_g.version + 1
       where id = p_game returning * into v_g;
    else
      update public.checkers_games
         set turn = case when v_g.turn = 'BOTTOM' then 'TOP' else 'BOTTOM' end,
             bottom_timeouts = case when v_g.turn = 'BOTTOM' then v_count else bottom_timeouts end,
             top_timeouts    = case when v_g.turn = 'TOP'    then v_count else top_timeouts end,
             version = v_g.version + 1
       where id = p_game returning * into v_g;
    end if;

  else
    raise exception 'VALIDATION_FAILED';
  end if;

  return v_g;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ท้าคนเดิมอีกครั้ง (ข้อกำหนด 2.5)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ สลับฝั่งให้ด้วย — คนที่เพิ่งเป็นฝ่ายล่าง (เดินก่อน) รอบนี้เป็นฝ่ายบน
--   ★★ ไม่สลับแปลว่าคนเดิมได้เปรียบการเดินก่อนทุกเกม

create or replace function public.checkers_rematch(
  p_actor uuid,
  p_game  uuid,
  p_board jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.checkers_games;
  v_new uuid;
begin
  select * into v_old from public.checkers_games where id = p_game;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;
  if v_old.bottom_id <> p_actor and v_old.top_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;
  if v_old.status <> 'FINISHED' then
    raise exception 'VALIDATION_FAILED';
  end if;

  insert into public.checkers_games (bottom_id, top_id, board, force_capture)
  values (v_old.top_id, v_old.bottom_id, p_board, v_old.force_capture)
  returning id into v_new;

  return v_new;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · กระดานอันดับหมากฮอสรายเดือน (ข้อกำหนด 2.5)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ คำนวณจาก checkers_games ตรง ๆ ไม่สร้างตารางสถิติแยก
--    ★ ตารางสถิติแยกคือค่าที่ต้องดูแลให้ตรงกับความจริงตลอดไป
--      ★★ ซึ่งเป็นบั๊กแบบเดียวกับตัวนับหัวใจที่เพิ่งซ่อมไปใน 0048
--    ★ เกมในออฟฟิศมีหลักร้อยต่อเดือน การนับสดไม่ใช่ปัญหา

create or replace function public.checkers_leaderboard(p_since timestamptz)
returns table (
  user_id uuid,
  wins    bigint,
  losses  bigint,
  draws   bigint
)
language sql
security definer
stable
set search_path = public
as $$
  with played as (
    select bottom_id as uid, winner_id, end_reason from public.checkers_games
     where status = 'FINISHED' and created_at >= p_since
    union all
    select top_id as uid, winner_id, end_reason from public.checkers_games
     where status = 'FINISHED' and created_at >= p_since
  )
  select
    uid as user_id,
    count(*) filter (where winner_id = uid)                          as wins,
    count(*) filter (where winner_id is not null and winner_id <> uid) as losses,
    count(*) filter (where end_reason = 'DRAW')                      as draws
  from played
  group by uid
  order by wins desc, draws desc;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · ห้องแข่งพิมพ์ดีด: เริ่มอัตโนมัติ + แข่งอีกรอบ (ข้อกำหนด 3.1 · 3.5)
-- ═════════════════════════════════════════════════════════════════════

/**
 * เริ่มแข่ง
 *
 * ★★★ ของเดิมให้เฉพาะเจ้าของห้องกดได้ ★ ถ้าเจ้าของห้องปิดแอปไป
 *     ห้องจะค้างอยู่ตลอดไปและทุกคนในนั้นติดอยู่
 *     ★★ ข้อกำหนด 3.1 เขียนว่า "เจ้าของห้องกดเริ่ม หรือเริ่มอัตโนมัติ
 *        เมื่อครบ/รอครบ 30 วินาที" — ตัวหลังคือทางออกของกรณีนั้นพอดี
 *
 * ★ p_force = true ใช้เมื่อหมดเวลารอ — ใครในห้องก็สั่งได้
 *   ★★ ตรวจเวลาที่นี่ ไม่เชื่อ client ว่า "ครบ 30 วิแล้ว"
 */
/*
 * ★★★ ต้องถอนตัวเก่าทิ้งก่อน — ไม่ใช่ create or replace เฉย ๆ
 *
 *     ของเดิมรับ 3 พารามิเตอร์ ตัวใหม่รับ 4 โดยตัวที่ 4 มีค่าเริ่มต้น
 *     ★ Postgres ถือว่าลายเซ็นต่างกัน = คนละฟังก์ชัน จึงได้สองตัวซ้อนกัน
 *       ★★ แล้วการเรียกด้วย 3 อาร์กิวเมนต์จะกำกวม — ตรงกับทั้งตัวเก่า
 *          และตัวใหม่ที่เติมค่าเริ่มต้นให้ ★★★ Postgres ปฏิเสธด้วย
 *          "function is not unique" ซึ่งเป็น error ที่ชี้ไปที่จุดเรียก
 *          ไม่ใช่จุดที่ผิดจริง
 */
drop function if exists public.typing_start(uuid, uuid, integer);

create or replace function public.typing_start(
  p_actor uuid,
  p_room  uuid,
  p_delay integer,
  p_force boolean default false
)
returns public.typing_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.typing_rooms;
  v_n    integer;
begin
  select * into v_room from public.typing_rooms where id = p_room for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;
  if v_room.status <> 'WAITING' then
    raise exception 'VALIDATION_FAILED';
  end if;

  if not p_force and v_room.owner_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  if p_force then
    /* ★ ต้องอยู่ในห้องจริง และห้องต้องรอมาแล้วอย่างน้อย 30 วินาที */
    if not public.is_in_typing_room(p_room, p_actor) then
      raise exception 'FORBIDDEN';
    end if;
    if v_room.created_at > now() - interval '30 seconds' then
      raise exception 'VALIDATION_FAILED';
    end if;
  end if;

  /* ★ คนเดียวในห้องไม่ใช่การแข่ง — ปล่อยให้รอต่อ */
  select count(*) into v_n from public.typing_players where room_id = p_room;
  if v_n < 2 then
    raise exception 'VALIDATION_FAILED';
  end if;

  update public.typing_rooms
     set status = 'COUNTDOWN',
         started_at = now() + make_interval(secs => greatest(1, p_delay))
   where id = p_room
  returning * into v_room;

  return v_room;
end;
$$;


/**
 * แข่งอีกรอบในห้องเดิม ข้อความใหม่
 *
 * ★★ ล้างความคืบหน้าของทุกคน ไม่ใช่สร้างห้องใหม่
 *    ★ ข้อกำหนดเขียนว่า "ห้องเดิม ข้อความใหม่" — คนที่อยู่ในห้องไม่ต้อง
 *      ส่งรหัสหากันใหม่
 */
create or replace function public.typing_rematch(
  p_actor uuid,
  p_room  uuid,
  p_text  text
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
  if not public.is_in_typing_room(p_room, p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  update public.typing_players
     set progress = 0, wpm = 0, accuracy = 100, finished_at = null
   where room_id = p_room;

  update public.typing_rooms
     set status = 'WAITING', started_at = null, text_body = p_text,
         created_at = now()
   where id = p_room
  returning * into v_room;

  return v_room;
end;
$$;


revoke all on function
  public.checkers_rematch(uuid, uuid, jsonb),
  public.checkers_leaderboard(timestamptz),
  public.typing_start(uuid, uuid, integer, boolean),
  public.typing_rematch(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.checkers_rematch(uuid, uuid, jsonb),
  public.checkers_leaderboard(timestamptz),
  public.typing_start(uuid, uuid, integer, boolean),
  public.typing_rematch(uuid, uuid, text)
  to service_role;
