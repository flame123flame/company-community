-- ===========================================================================
-- 0063 · เรียง 4 ออนไลน์ — ท้าเพื่อนได้เหมือนหมากฮอส
-- ===========================================================================
--
-- ★★★ เดินตามรูปเดียวกับ 0051/0052/0055 ทั้งหมด ไม่คิดโครงใหม่
--
--     ★ กติกาอยู่ใน lib/games/connect4 ที่ TypeScript — route ของ Next.js
--       เรียกตัวเดียวกับที่หน้าจอเรียก ★★ RPC ที่นี่ทำแต่สิ่งที่ TS ทำไม่ได้:
--       ล็อกแถว · ตรวจว่าเป็นตาของคนที่เรียก · กันสองคนหยอดพร้อมกัน
--     ★★ เขียนกติกา "เรียงสี่" ซ้ำใน plpgsql = กติกาชุดที่สองที่ต้องดูแล
--        ให้ตรงกันตลอดไป ซึ่งเป็นต้นตอของ "จอบอกหยอดได้ แต่ server ปฏิเสธ"
--
-- ★★★ สองเรื่องที่ 0051 พลาดไว้ และซ่อมในไฟล์นี้ด้วย
--
--     ★ challenge_accept ไม่เคยตรวจว่าคำท้าใบนั้นเป็นเกมอะไร
--       ★★ วันนี้ไม่เป็นไรเพราะมีเกมเดียวที่ใช้คำท้า ★ แต่พอมีเกมที่สอง
--          คำท้า "เรียง 4" ที่ถูกส่งไปที่ route หมากฮอสจะกลายเป็นเกม
--          หมากฮอสเงียบ ๆ โดยไม่มีใครฟ้อง
--     ★ ตารางคำท้าเป็นของกลางของทุกเกม จึงต้องกรองด้วย game ทุกที่ที่อ่าน
--       ★★ ไม่กรอง = คำท้าเรียง 4 ไปโผล่ในหน้าหมากฮอส กดรับแล้วได้เกมผิดชนิด

-- ───────────────────────────────────────────────────────────────────────────
-- ★★ ล้างของค้างจากการรันที่ล้มกลางคันก่อน — เหตุผลเดียวกับ 0051
--    ★ ตัวรัน SQL ยิงทีละคำสั่งโดยไม่ได้อยู่ใน transaction เดียว
--      `create table if not exists` รอบถัดไปจะ "ข้าม" ตารางพิการนั้นตลอดไป
--    ★ ปลอดภัยเพราะสองตารางนี้เป็นของใหม่ในไฟล์นี้ ไม่มีข้อมูลของใครอยู่
-- ───────────────────────────────────────────────────────────────────────────
drop table if exists public.connect4_moves cascade;
drop table if exists public.connect4_games cascade;


-- ═════════════════════════════════════════════════════════════════════
-- 1 · คำท้าเกมเรียง 4
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ตาราง game_challenges เป็นของกลางอยู่แล้ว เพิ่มแค่ชื่อเกมที่อนุญาต

alter table public.game_challenges
  drop constraint if exists game_challenges_game;

alter table public.game_challenges
  add constraint game_challenges_game
  check (game in ('checkers', 'typing', 'connect4'));


-- ═════════════════════════════════════════════════════════════════════
-- 2 · เกม
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ชื่อฝั่งเป็น red/gold ตามสีเหรียญที่หน้าจอวาด ไม่ใช่ bottom/top
--    ★ เรียง 4 ไม่มี "ฝั่งของกระดาน" — ทั้งสองคนมองกระดานใบเดียวกัน
--      จากทิศเดียวกัน ★★ ยืมคำว่า bottom/top มาใช้จะทำให้คนอ่านโค้ด
--      ไปหาการกลับกระดานที่ไม่มีอยู่ (ซึ่งหมากฮอสมี)

create table if not exists public.connect4_games (
  id            uuid primary key default gen_random_uuid(),
  red_id        uuid not null references public.profiles(id) on delete cascade,
  gold_id       uuid not null references public.profiles(id) on delete cascade,
  board         jsonb not null,
  turn          smallint not null default 1
                constraint connect4_games_turn check (turn in (1, 2)),
  version       integer not null default 0,
  status        text not null default 'PLAYING'
                constraint connect4_games_status check (status in ('PLAYING', 'FINISHED')),
  winner_id     uuid references public.profiles(id) on delete set null,
  end_reason    text
                constraint connect4_games_reason
                check (end_reason is null or end_reason in ('WIN', 'DRAW', 'RESIGN', 'TIMEOUT')),
  last_cell     smallint,
  win_cells     smallint[] not null default '{}',
  draw_offer_by uuid references public.profiles(id) on delete set null,
  red_timeouts  smallint not null default 0,
  gold_timeouts smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint connect4_games_two_players check (red_id <> gold_id)
);

comment on table public.connect4_games is
  'เกมเรียง 4 ออนไลน์หนึ่งเกม — กติกาอยู่ที่ lib/games/connect4 ไม่ใช่ที่นี่';
comment on column public.connect4_games.red_id is
  'ฝ่ายแดง = คนที่ท้า และเป็นฝ่ายหยอดก่อน (ผู้เล่นหมายเลข 1)';
comment on column public.connect4_games.board is
  'array ยาว 42 รูปแบบเดียวกับ lib/games/connect4 เป๊ะ · index = row*7+col แถว 0 อยู่บนสุด';
comment on column public.connect4_games.turn is
  'ตาของผู้เล่นหมายเลข 1 หรือ 2 — เก็บเป็นเลขเดียวกับ Player ใน TypeScript ไม่ต้องแปลง';
comment on column public.connect4_games.version is
  'กันสองคนหยอดพร้อมกัน: ทุกตาต้องบอกว่าเห็นกระดานเวอร์ชันไหน ไม่ตรง = ปฏิเสธ ไม่ใช่เขียนทับ';
comment on column public.connect4_games.last_cell is
  'ช่องที่เหรียญล่าสุดตกลง — หน้าจอใช้เล่นแอนิเมชันหล่น';
comment on column public.connect4_games.win_cells is
  'ช่องของแถวที่ชนะ — คำนวณที่ route ตอนจบเกม เก็บไว้เพื่อให้คนที่เพิ่งเปิดกลับมาเห็นแถวเรืองแสงเหมือนกัน';

create index if not exists connect4_games_red_idx
  on public.connect4_games (red_id, status, updated_at desc);
create index if not exists connect4_games_gold_idx
  on public.connect4_games (gold_id, status, updated_at desc);

drop trigger if exists connect4_games_touch on public.connect4_games;
create trigger connect4_games_touch
  before update on public.connect4_games
  for each row execute function public.touch_updated_at();

alter table public.connect4_games enable row level security;

/*
 * ★★ เปิด Realtime ให้ตารางนี้ — หน้าเกมฟัง postgres_changes แถวเดียว
 *    ★ ครอบ exception ไว้เพราะรันไฟล์นี้ซ้ำต้องไม่ล้ม
 */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.connect4_games;
    exception when duplicate_object then null;
    end;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ประวัติตาหยอด
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.connect4_moves (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.connect4_games(id) on delete cascade,
  ply        integer not null,
  actor_id   uuid not null references public.profiles(id) on delete cascade,
  col        smallint not null constraint connect4_moves_col check (col between 0 and 6),
  cell       smallint not null,
  created_at timestamptz not null default now(),
  unique (game_id, ply)
);

comment on table public.connect4_moves is
  'ประวัติตาหยอด — สืบย้อนได้เวลามีคนแย้งว่าตาไหนผิด และใช้ตรวจว่ากระดานในฐานข้อมูลตรงกับประวัติ';

create index if not exists connect4_moves_game_idx
  on public.connect4_moves (game_id, ply);

alter table public.connect4_moves enable row level security;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · อ่านได้เฉพาะเกมของตัวเอง (บทเรียนจาก 0052)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ ไม่ใส่ policy นี้ = Realtime เงียบสนิทโดยไม่มี error
--
--     ★ Realtime ส่ง event ในนามของผู้ใช้ที่ subscribe ไม่ใช่ service role
--       RLS default-deny จึงกรองทุกแถวทิ้งก่อนถึงเบราว์เซอร์
--       ★★ อาการคือ "ฝั่งที่หยอดเห็นเหรียญตก อีกฝั่งไม่เห็นจนกว่าจะรีโหลด"
--          ซึ่งเทสต์แท็บเดียวจับไม่ได้เลย เพราะฝั่งที่หยอดวาดจากคำตอบของ API
--
-- ★★ เปิดเฉพาะ "อ่าน" — การเขียนยังผ่าน RPC ทางเดียวเหมือนเดิม

drop policy if exists connect4_games_read on public.connect4_games;
create policy connect4_games_read on public.connect4_games
  for select using (
    red_id = (select auth.uid()) or gold_id = (select auth.uid())
  );

drop policy if exists connect4_moves_read on public.connect4_moves;
create policy connect4_moves_read on public.connect4_moves
  for select using (
    exists (
      select 1 from public.connect4_games g
      where g.id = connect4_moves.game_id
        and (g.red_id = (select auth.uid()) or g.gold_id = (select auth.uid()))
    )
  );


-- ═════════════════════════════════════════════════════════════════════
-- 5 · ซ่อมคำท้าให้รู้จักชนิดเกมของตัวเอง
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ ของเดิมรับคำท้าใบไหนก็สร้างเกมหมากฮอส ไม่ว่าใบนั้นจะเป็นเกมอะไร
--
--     ★ ยังไม่เคยพังเพราะหมากฮอสเป็นเกมเดียวที่ใช้ตารางคำท้า
--       ★★ ซึ่งคือคำนิยามของบั๊กที่รออยู่ — มันไม่ได้ถูกกัน มันแค่ยังไม่มี
--          ใครเดินไปเหยียบ

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

  /* ★★ ฟังก์ชันนี้สร้างได้แต่เกมหมากฮอส — ใบอื่นต้องไปเข้าฟังก์ชันของเกมนั้น */
  if v_ch.game <> 'checkers' then
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


-- ═════════════════════════════════════════════════════════════════════
-- 6 · RPC ของเรียง 4
-- ═════════════════════════════════════════════════════════════════════

/**
 * รับคำท้าเรียง 4 → สร้างเกม
 *
 * ★★ แยกจาก challenge_accept แทนที่จะส่ง "ชื่อตาราง" เข้าไปเป็นพารามิเตอร์
 *    ★ ตารางเป้าหมายต่างกัน คอลัมน์ต่างกัน ค่าตั้งต้นต่างกัน
 *      ★★ ฟังก์ชันเดียวที่แตกแขนงตามชื่อเกมจะโตเป็นที่รวมของทุกเกม
 *         แล้วการเพิ่มเกมที่สี่จะต้องกลับมาแก้ของที่ใช้งานอยู่แล้วทุกครั้ง
 */
create or replace function public.connect4_accept(
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

  if v_ch.to_id <> p_actor or v_ch.status <> 'PENDING' then
    raise exception 'FORBIDDEN';
  end if;
  if v_ch.expires_at <= now() then
    update public.game_challenges set status = 'EXPIRED' where id = p_id;
    raise exception 'VALIDATION_FAILED';
  end if;
  if v_ch.game <> 'connect4' then
    raise exception 'VALIDATION_FAILED';
  end if;

  /* ★ คนท้าเป็นฝ่ายแดงและหยอดก่อน — ตรงกับเกมในเครื่องที่แดงเริ่มเสมอ */
  insert into public.connect4_games (red_id, gold_id, board)
  values (v_ch.from_id, v_ch.to_id, p_board)
  returning id into v_game;

  update public.game_challenges
     set status = 'ACCEPTED', game_id = v_game
   where id = p_id;

  return v_game;
end;
$$;


/**
 * บันทึกตาหยอดที่ "route ตรวจกติกามาแล้ว"
 *
 * ★★★ ไม่ตรวจกติกาเรียง 4 เลย และตั้งใจให้เป็นแบบนั้น
 *     ★ สิ่งที่ตรวจที่นี่คือสิ่งที่ TypeScript ตรวจแทนไม่ได้:
 *       เป็นตาของคนนี้จริงไหม · มีใครแทรกเข้ามาก่อนไหม · เกมจบไปหรือยัง
 */
create or replace function public.connect4_play(
  p_actor   uuid,
  p_game    uuid,
  p_version integer,
  p_col     smallint,
  p_cell    smallint,
  p_board   jsonb,
  p_turn    smallint,
  p_status  text,
  p_winner  uuid,
  p_reason  text,
  p_win     smallint[]
)
returns public.connect4_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g   public.connect4_games;
  v_ply integer;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_g from public.connect4_games where id = p_game for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_g.status <> 'PLAYING' then
    raise exception 'VALIDATION_FAILED';
  end if;

  /* ★ เป็นผู้เล่นในเกมนี้จริงไหม และเป็นตาของเขาไหม */
  if (v_g.turn = 1 and v_g.red_id <> p_actor)
     or (v_g.turn = 2 and v_g.gold_id <> p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★★ กันสองคนหยอดพร้อมกัน — เวอร์ชันต้องตรงกับที่ผู้เล่นเห็น */
  if v_g.version <> p_version then
    raise exception 'VALIDATION_FAILED';
  end if;

  v_ply := v_g.version + 1;

  insert into public.connect4_moves (game_id, ply, actor_id, col, cell)
  values (p_game, v_ply, p_actor, p_col, p_cell);

  update public.connect4_games
     set board = p_board,
         turn = p_turn,
         version = v_ply,
         last_cell = p_cell,
         status = p_status,
         winner_id = p_winner,
         end_reason = p_reason,
         win_cells = coalesce(p_win, '{}'),
         /* ★ มีคนหยอดแล้ว คำขอเสมอที่ค้างอยู่ถือว่าตกไป
              ★★ ไม่ล้างทิ้ง = อีกฝ่ายกดรับเสมอได้ทีหลังทั้งที่เกมเดินต่อไปแล้ว */
         draw_offer_by = null
   where id = p_game
  returning * into v_g;

  return v_g;
end;
$$;


/**
 * ยอมแพ้ · ขอเสมอ · รับเสมอ · หมดเวลา
 *
 * ★ หมดเวลาครบ 3 ครั้งถึงแพ้ เหมือนหมากฮอส
 *   ★★ ยังไม่ครบ 3 → ข้ามตาให้อีกฝ่ายหยอดต่อ ไม่ใช่ค้างอยู่ที่เดิม
 *      ★ ไม่ข้ามตา เกมจะติดอยู่ตรงนั้นตลอดไปเมื่อคนหนึ่งหายไป
 */
create or replace function public.connect4_end(
  p_actor  uuid,
  p_game   uuid,
  p_action text   -- RESIGN | OFFER_DRAW | ACCEPT_DRAW | TIMEOUT
)
returns public.connect4_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g     public.connect4_games;
  v_count smallint;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_g from public.connect4_games where id = p_game for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;
  if v_g.red_id <> p_actor and v_g.gold_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;
  if v_g.status <> 'PLAYING' then
    raise exception 'VALIDATION_FAILED';
  end if;

  if p_action = 'RESIGN' then
    update public.connect4_games
       set status = 'FINISHED',
           end_reason = 'RESIGN',
           /* ★ ผู้ชนะคืออีกฝ่าย ไม่ใช่คนที่กด */
           winner_id = case when v_g.red_id = p_actor then v_g.gold_id else v_g.red_id end,
           version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'OFFER_DRAW' then
    update public.connect4_games
       set draw_offer_by = p_actor, version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'ACCEPT_DRAW' then
    /* ★★ รับเสมอได้เฉพาะเมื่ออีกฝ่ายเป็นคนขอ
         ★ ไม่เช็คแบบนี้ คนเดียวกันจะขอแล้วรับเองได้ในสองคลิก */
    if v_g.draw_offer_by is null or v_g.draw_offer_by = p_actor then
      raise exception 'FORBIDDEN';
    end if;
    update public.connect4_games
       set status = 'FINISHED', end_reason = 'DRAW', winner_id = null,
           draw_offer_by = null, version = v_g.version + 1
     where id = p_game returning * into v_g;

  elsif p_action = 'TIMEOUT' then
    /* ★ ฝ่ายที่ "ถึงตา" เป็นฝ่ายที่โดนนับ ไม่ใช่คนที่กดรายงาน
         ★★ ใครกดก็ได้ เพราะคนที่หมดเวลามักปิดแอปไปแล้ว */
    v_count := case when v_g.turn = 1 then v_g.red_timeouts else v_g.gold_timeouts end;
    v_count := v_count + 1;

    if v_count >= 3 then
      update public.connect4_games
         set status = 'FINISHED', end_reason = 'TIMEOUT',
             winner_id = case when v_g.turn = 1 then v_g.gold_id else v_g.red_id end,
             red_timeouts  = case when v_g.turn = 1 then v_count else red_timeouts end,
             gold_timeouts = case when v_g.turn = 2 then v_count else gold_timeouts end,
             version = v_g.version + 1
       where id = p_game returning * into v_g;
    else
      update public.connect4_games
         set turn = case when v_g.turn = 1 then 2 else 1 end,
             red_timeouts  = case when v_g.turn = 1 then v_count else red_timeouts end,
             gold_timeouts = case when v_g.turn = 2 then v_count else gold_timeouts end,
             version = v_g.version + 1
       where id = p_game returning * into v_g;
    end if;

  else
    raise exception 'VALIDATION_FAILED';
  end if;

  return v_g;
end;
$$;


/**
 * ท้าคนเดิมอีกครั้ง
 *
 * ★ สลับสีให้ด้วย — คนที่เพิ่งเป็นฝ่ายแดง (หยอดก่อน) รอบนี้เป็นฝ่ายทอง
 *   ★★ เรียง 4 คนหยอดก่อนได้เปรียบชัดกว่าหมากฮอสมาก (เล่นสมบูรณ์แบบ
 *      คนแรกชนะเสมอ) ★ ไม่สลับแปลว่าคนเดิมได้เปรียบทุกเกม
 */
create or replace function public.connect4_rematch(
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
  v_old public.connect4_games;
  v_new uuid;
begin
  select * into v_old from public.connect4_games where id = p_game;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;
  if v_old.red_id <> p_actor and v_old.gold_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;
  if v_old.status <> 'FINISHED' then
    raise exception 'VALIDATION_FAILED';
  end if;

  insert into public.connect4_games (red_id, gold_id, board)
  values (v_old.gold_id, v_old.red_id, p_board)
  returning id into v_new;

  return v_new;
end;
$$;


/**
 * กระดานอันดับ 30 วันย้อนหลัง
 *
 * ★★ คำนวณจาก connect4_games ตรง ๆ ไม่สร้างตารางสถิติแยก
 *    ★ ตารางสถิติแยกคือค่าที่ต้องดูแลให้ตรงกับความจริงตลอดไป
 */
create or replace function public.connect4_leaderboard(p_since timestamptz)
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
    select red_id as uid, winner_id, end_reason from public.connect4_games
     where status = 'FINISHED' and created_at >= p_since
    union all
    select gold_id as uid, winner_id, end_reason from public.connect4_games
     where status = 'FINISHED' and created_at >= p_since
  )
  select
    uid as user_id,
    count(*) filter (where winner_id = uid)                            as wins,
    count(*) filter (where winner_id is not null and winner_id <> uid) as losses,
    count(*) filter (where end_reason = 'DRAW')                        as draws
  from played
  group by uid
  order by wins desc, draws desc;
$$;


revoke all on function
  public.challenge_accept(uuid, uuid, jsonb),
  public.connect4_accept(uuid, uuid, jsonb),
  public.connect4_play(uuid, uuid, integer, smallint, smallint, jsonb, smallint, text, uuid, text, smallint[]),
  public.connect4_end(uuid, uuid, text),
  public.connect4_rematch(uuid, uuid, jsonb),
  public.connect4_leaderboard(timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.challenge_accept(uuid, uuid, jsonb),
  public.connect4_accept(uuid, uuid, jsonb),
  public.connect4_play(uuid, uuid, integer, smallint, smallint, jsonb, smallint, text, uuid, text, smallint[]),
  public.connect4_end(uuid, uuid, text),
  public.connect4_rematch(uuid, uuid, jsonb),
  public.connect4_leaderboard(timestamptz)
  to service_role;
