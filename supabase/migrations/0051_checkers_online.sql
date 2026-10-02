-- ===========================================================================
-- 0051 · หมากฮอสออนไลน์ — คำท้า · เกม · ตาเดิน
-- ===========================================================================
--
-- ★★★ กติกาอยู่ใน TypeScript ไม่ใช่ใน SQL — และนั่นถูกแล้ว
--
--     ข้อกำหนด 2.4 สั่งว่า "ตรวจสอบความถูกต้องของตาเดินที่ฝั่ง server ด้วย
--     ห้ามเชื่อข้อมูลจากฝั่ง client อย่างเดียว"
--     ★ "ฝั่ง server" ของโปรเจกต์นี้คือ route ของ Next.js ซึ่งรันบนเครื่อง
--       เรา ไม่ใช่บนเบราว์เซอร์ผู้ใช้ ★★ มันเรียก lib/games/checkers
--       ตัวเดียวกับที่หน้าจอเรียก — กติกาจึงไม่มีทางต่างกัน
--     ★★★ เขียนกติกาซ้ำใน plpgsql จะได้กติกาชุดที่สองที่ต้องดูแลให้ตรงกัน
--         ตลอดไป ซึ่งเป็นต้นตอของบั๊ก "หน้าจอบอกเดินได้ แต่ server ปฏิเสธ"
--
--     ★★ หน้าที่ของ RPC ที่นี่คือสิ่งที่ TypeScript ทำไม่ได้:
--        ล็อกแถว · ตรวจว่าเป็นตาของคนที่เรียกจริง · กันสองคนเดินพร้อมกัน

-- ───────────────────────────────────────────────────────────────────────────
-- ★★★ ล้างของค้างจากการรันที่ล้มกลางคันก่อน
--
--     รอบแรกไฟล์นี้ล้มที่ `create index ... (to_id …)` ด้วย
--     "column to_id does not exist" ★ ทั้งที่ CREATE TABLE ข้างบนประกาศไว้
--
--     ★★ สาเหตุ: ตัวรัน SQL ยิงทีละคำสั่งโดยไม่ได้อยู่ใน transaction เดียว
--        `begin;` ที่เขียนไว้จึงไม่ได้ปกป้องอะไร ★ ของที่ผ่านไปแล้วค้างอยู่
--        แล้ว `create table if not exists` รอบถัดไปก็ "ข้าม" ตารางพิการนั้น
--        ★★★ จึงล้มซ้ำที่เดิมตลอดไป โดยที่ข้อความ error ชี้ไปผิดที่
--
--     ★★ ปลอดภัยที่จะ drop: ทั้งสามตารางเป็นของใหม่ในไฟล์นี้ และตรวจแล้วว่า
--        game_challenges มี 0 แถว ส่วนอีกสองตารางยังไม่ถูกสร้างเลย
--     ★ ทำให้ไฟล์นี้รันซ้ำได้เสมอ — migration ที่รันซ้ำไม่ได้ คือ migration
--       ที่ไม่มีใครกล้ารันตอนมีปัญหา
-- ───────────────────────────────────────────────────────────────────────────
drop table if exists public.checkers_moves cascade;
drop table if exists public.checkers_games cascade;
drop table if exists public.game_challenges cascade;


-- ═════════════════════════════════════════════════════════════════════
-- 1 · คำท้า
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.game_challenges (
  id         uuid primary key default gen_random_uuid(),
  game       text not null
             constraint game_challenges_game check (game in ('checkers', 'typing')),
  from_id    uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'PENDING'
             constraint game_challenges_status
             check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  game_id    uuid,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  constraint game_challenges_not_self check (from_id <> to_id)
);

comment on table public.game_challenges is
  'คำท้าเล่นเกม — ท้าตัวเองไม่ได้ (บังคับที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่มใน UI)';
comment on column public.game_challenges.game_id is
  'เกมที่เกิดขึ้นเมื่อรับคำท้า';
comment on column public.game_challenges.expires_at is
  'เก็บ "หมดอายุเมื่อไหร่" ไม่ใช่ "สร้างเมื่อไหร่แล้วคำนวณเอาตอนอ่าน" — เก็บเวลาสร้างแล้ววันที่เปลี่ยนอายุจาก 10 เป็น 15 นาที จะมีที่ที่ลืมแก้เสมอ';

create index if not exists game_challenges_to_idx
  on public.game_challenges (to_id, status, created_at desc);
create index if not exists game_challenges_from_idx
  on public.game_challenges (from_id, status, created_at desc);

alter table public.game_challenges enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · เกม
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.checkers_games (
  id            uuid primary key default gen_random_uuid(),
  bottom_id     uuid not null references public.profiles(id) on delete cascade,
  top_id        uuid not null references public.profiles(id) on delete cascade,
  board         jsonb not null,
  turn          text not null default 'BOTTOM'
                constraint checkers_games_turn check (turn in ('BOTTOM', 'TOP')),
  quiet_plies   integer not null default 0,
  version       integer not null default 0,
  status        text not null default 'PLAYING'
                constraint checkers_games_status check (status in ('PLAYING', 'FINISHED')),
  winner_id     uuid references public.profiles(id) on delete set null,
  end_reason    text
                constraint checkers_games_reason
                check (end_reason is null or end_reason in ('WIN', 'DRAW', 'RESIGN', 'TIMEOUT')),
  force_capture boolean not null default true,
  last_from     smallint,
  last_to       smallint,
  draw_offer_by uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint checkers_games_two_players check (bottom_id <> top_id)
);

comment on column public.checkers_games.bottom_id is
  'ฝ่ายล่าง = คนที่ท้า และเป็นฝ่ายเดินก่อน';
comment on column public.checkers_games.board is
  'array ยาว 64 รูปแบบเดียวกับ lib/games/checkers เป๊ะ — ทุกการแปลงคือที่ที่ bug ซ่อนได้';
comment on column public.checkers_games.quiet_plies is
  'กี่ตาแล้วที่ไม่มีการกิน — ใช้ตัดสินเสมอ';
comment on column public.checkers_games.version is
  'กันสองคนเดินพร้อมกัน: ทุกตาต้องบอกว่าเห็นกระดานเวอร์ชันไหน ไม่ตรง = ปฏิเสธ ไม่ใช่เขียนทับ';
comment on column public.checkers_games.winner_id is
  'null ตอนยังเล่นอยู่ หรือเมื่อเสมอ';
comment on column public.checkers_games.draw_offer_by is
  'ใครขอเสมออยู่ — null = ไม่มีใครขอ';

create index if not exists checkers_games_players_idx
  on public.checkers_games (bottom_id, status, updated_at desc);
create index if not exists checkers_games_top_idx
  on public.checkers_games (top_id, status, updated_at desc);

drop trigger if exists checkers_games_touch on public.checkers_games;
create trigger checkers_games_touch
  before update on public.checkers_games
  for each row execute function public.touch_updated_at();

alter table public.checkers_games enable row level security;

/*
 * ★★ เปิด Realtime ให้ตารางนี้ — หน้าเกมฟัง postgres_changes แถวเดียว
 *    ★ ไม่ใช้ presence เพราะสิ่งที่ต้องรู้คือ "กระดานเปลี่ยนไหม"
 *      ไม่ใช่ "ใครออนไลน์อยู่"
 */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.checkers_games;
    exception when duplicate_object then null;
    end;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ประวัติตาเดิน
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ เก็บไว้เพื่อให้ "กลับเข้ามาแล้วเล่นต่อ" เห็นตาล่าสุดของอีกฝ่าย
--   และเพื่อสืบย้อนเวลามีคนแย้งว่าตาไหนผิดกติกา

create table if not exists public.checkers_moves (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.checkers_games(id) on delete cascade,
  ply        integer not null,
  actor_id   uuid not null references public.profiles(id) on delete cascade,
  from_sq    smallint not null,
  to_sq      smallint not null,
  captured   smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (game_id, ply)
);

comment on table public.checkers_moves is
  'ประวัติตาเดิน — ให้ "กลับเข้ามาแล้วเล่นต่อ" เห็นตาล่าสุด และสืบย้อนได้เวลามีคนแย้ง';
comment on column public.checkers_moves.captured is
  'ช่องที่ถูกกินในตานี้';

create index if not exists checkers_moves_game_idx
  on public.checkers_moves (game_id, ply);

alter table public.checkers_moves enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · RPC
-- ═════════════════════════════════════════════════════════════════════

/** ส่งคำท้า — คืน id ของคำท้า */
create or replace function public.challenge_create(
  p_actor uuid,
  p_game  text,
  p_to    uuid
)
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
  if p_actor = p_to then
    raise exception 'VALIDATION_FAILED';
  end if;

  /*
   * ★★ ท้าคนเดิมซ้ำระหว่างที่ใบเก่ายังไม่หมดอายุ = ใช้ใบเดิม
   *    ★ ไม่งั้นคนกดรัว ๆ จะสร้างคำท้าสิบใบ แล้วอีกฝ่ายเห็นแจ้งเตือนสิบครั้ง
   */
  select id into v_id
    from public.game_challenges
   where game = p_game and from_id = p_actor and to_id = p_to
     and status = 'PENDING' and expires_at > now()
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.game_challenges (game, from_id, to_id)
  values (p_game, p_actor, p_to)
  returning id into v_id;

  return v_id;
end;
$$;


/**
 * รับคำท้า → สร้างเกม
 *
 * ★★ ทำสองอย่างในฟังก์ชันเดียวเพราะมันต้องสำเร็จหรือล้มพร้อมกัน
 *    ★ ถ้าแยก จะมีช่วงที่คำท้าถูกรับแล้วแต่ยังไม่มีเกม — ผู้เล่นจะเห็น
 *      "รับแล้ว" แต่กดเข้าเกมไม่ได้ และไม่มีทางกลับไปรับใหม่
 */
create or replace function public.challenge_accept(
  p_actor uuid,
  p_id    uuid,
  p_board jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ch   public.game_challenges;
  v_game uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_ch from public.game_challenges where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  /* ★ รับได้เฉพาะคนที่ถูกท้า และเฉพาะใบที่ยังไม่หมดอายุ */
  if v_ch.to_id <> p_actor or v_ch.status <> 'PENDING' then
    raise exception 'FORBIDDEN';
  end if;
  if v_ch.expires_at <= now() then
    update public.game_challenges set status = 'EXPIRED' where id = p_id;
    raise exception 'VALIDATION_FAILED';
  end if;

  /* ★ คนท้าเป็นฝ่ายล่างและเดินก่อน — ตรงกับที่ UI วาด */
  insert into public.checkers_games (bottom_id, top_id, board)
  values (v_ch.from_id, v_ch.to_id, p_board)
  returning id into v_game;

  update public.game_challenges
     set status = 'ACCEPTED', game_id = v_game
   where id = p_id;

  return v_game;
end;
$$;


/**
 * บันทึกตาเดินที่ "route ตรวจกติกามาแล้ว"
 *
 * ★★★ ฟังก์ชันนี้ไม่ตรวจกติกาหมากฮอสเลย และตั้งใจให้เป็นแบบนั้น
 *     ★ กติกาอยู่ใน lib/games/checkers ซึ่ง route เรียกก่อนมาถึงตรงนี้
 *       ★★ สิ่งที่ตรวจที่นี่คือสิ่งที่ TypeScript ตรวจแทนไม่ได้:
 *          เป็นตาของคนนี้จริงไหม · มีใครแทรกเข้ามาก่อนไหม · เกมจบไปหรือยัง
 *
 * ★ p_version = เวอร์ชันที่ผู้เล่นเห็นตอนตัดสินใจเดิน
 *   ★★ ไม่ตรง = มีตาอื่นเข้ามาก่อน → ปฏิเสธ ไม่ใช่เขียนทับ
 */
create or replace function public.checkers_play(
  p_actor    uuid,
  p_game     uuid,
  p_version  integer,
  p_from     smallint,
  p_to       smallint,
  p_captured smallint[],
  p_board    jsonb,
  p_turn     text,
  p_quiet    integer,
  p_status   text,
  p_winner   uuid,
  p_reason   text
)
returns public.checkers_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g   public.checkers_games;
  v_ply integer;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_g from public.checkers_games where id = p_game for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_g.status <> 'PLAYING' then
    raise exception 'VALIDATION_FAILED';
  end if;

  /* ★ เป็นผู้เล่นในเกมนี้จริงไหม และเป็นตาของเขาไหม */
  if (v_g.turn = 'BOTTOM' and v_g.bottom_id <> p_actor)
     or (v_g.turn = 'TOP' and v_g.top_id <> p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★★ กันสองคนเดินพร้อมกัน — เวอร์ชันต้องตรงกับที่ผู้เล่นเห็น */
  if v_g.version <> p_version then
    raise exception 'VALIDATION_FAILED';
  end if;

  v_ply := v_g.version + 1;

  insert into public.checkers_moves (game_id, ply, actor_id, from_sq, to_sq, captured)
  values (p_game, v_ply, p_actor, p_from, p_to, coalesce(p_captured, '{}'));

  update public.checkers_games
     set board = p_board,
         turn = p_turn,
         quiet_plies = p_quiet,
         version = v_ply,
         last_from = p_from,
         last_to = p_to,
         status = p_status,
         winner_id = p_winner,
         end_reason = p_reason,
         /* ★ มีคนเดินแล้ว คำขอเสมอที่ค้างอยู่ถือว่าตกไป
              ★★ ไม่ล้างทิ้ง = ฝ่ายตรงข้ามกดรับเสมอได้ทีหลังทั้งที่เกมเดินต่อไปแล้ว */
         draw_offer_by = null
   where id = p_game
  returning * into v_g;

  return v_g;
end;
$$;


/** ยอมแพ้ · ขอเสมอ · รับเสมอ · หมดเวลา */
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
  v_g public.checkers_games;
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
    /* ★★ รับเสมอได้เฉพาะเมื่ออีกฝ่ายเป็นคนขอ
         ★ ไม่เช็คแบบนี้ คนเดียวกันจะขอแล้วรับเองได้ในสองคลิก */
    if v_g.draw_offer_by is null or v_g.draw_offer_by = p_actor then
      raise exception 'FORBIDDEN';
    end if;
    update public.checkers_games
       set status = 'FINISHED', end_reason = 'DRAW', winner_id = null,
           draw_offer_by = null, version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'TIMEOUT' then
    /*
     * ★★ หมดเวลา: ฝ่ายที่ "ถึงตา" เป็นฝ่ายแพ้ ไม่ใช่คนที่กดรายงาน
     *    ★ ใครก็กดได้ เพราะคนที่หมดเวลามักเป็นคนที่ปิดแอปไปแล้ว
     *      ★★ เงื่อนไขจริงคือเวลา ซึ่งตรวจที่ route ก่อนเรียกมา
     */
    update public.checkers_games
       set status = 'FINISHED', end_reason = 'TIMEOUT',
           winner_id = case when v_g.turn = 'BOTTOM' then v_g.top_id else v_g.bottom_id end,
           version = v_g.version + 1
     where id = p_game returning * into v_g;

  else
    raise exception 'VALIDATION_FAILED';
  end if;

  return v_g;
end;
$$;


revoke all on function
  public.challenge_create(uuid, text, uuid),
  public.challenge_accept(uuid, uuid, jsonb),
  public.checkers_play(uuid, uuid, integer, smallint, smallint, smallint[], jsonb, text, integer, text, uuid, text),
  public.checkers_end(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.challenge_create(uuid, text, uuid),
  public.challenge_accept(uuid, uuid, jsonb),
  public.checkers_play(uuid, uuid, integer, smallint, smallint, smallint[], jsonb, text, integer, text, uuid, text),
  public.checkers_end(uuid, uuid, text)
  to service_role;

