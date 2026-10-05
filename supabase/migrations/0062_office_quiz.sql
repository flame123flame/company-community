-- ============================================================================
--  0062 · ควิซออฟฟิศ — ผู้จัดตั้งคำถาม ทุกคนตอบพร้อมกันจากมือถือ คะแนนสด
-- ============================================================================
--  ★★★ เฉลยต้องไม่หลุดถึงเครื่องผู้เล่นก่อนเวลา
--      ★ office_quiz_questions (มีช่อง correct) กับ office_quiz_answers ไม่มี policy อ่านเลย
--        ผู้เล่นเห็นแค่ office_quiz_rooms (คำถามข้อปัจจุบันแบบไม่มีเฉลย ผ่าน API) และ office_quiz_players
--      ★★ ตอบ · เฉลย · ข้อต่อไป ทำใน RPC ที่ฐานข้อมูล — เวลาเริ่มข้อและเวลาตอบใช้ now()
--         ของ Postgres เรือนเดียว คะแนนความเร็วจึงยุติธรรมไม่ขึ้นกับนาฬิกาเครื่องใคร
--  ★ คะแนน: ตอบถูก = 500–1000 (ยิ่งเร็วยิ่งมาก) · ตอบผิด/ไม่ตอบ = 0
--    คะแนนเข้ากระดานตอน "เฉลย" ไม่ใช่ตอนตอบ — ไม่งั้นตัวเลขที่ขยับบอกใบ้ว่าตอบถูก
--
--  รันซ้ำได้ — วางใน SQL Editor ได้ทั้งไฟล์
-- ============================================================================

-- ── 0 · เก็บกวาดจากการรันรุ่นแรกที่ล้มกลางทาง (5 ต.ค. 2026) ─────────────────
--  ★★ รุ่นแรกตั้งชื่อ quiz_* ซึ่งชนกับเกมทายเพลงของห้องฟังเพลง (0020: quiz_next ·
--     quiz_answer) — ฐานข้อมูลปฏิเสธที่ quiz_next แต่ของก่อนหน้านั้นอาจถูกสร้างไปแล้ว
--  ★ ลบเฉพาะของที่ "รุ่นแรกของไฟล์นี้" สร้าง: ตาราง 4 ตัวนี้กับฟังก์ชันสองตัวตามลายเซ็นเป๊ะ
--    ★★ ห้ามแตะ quiz_games · quiz_rounds · quiz_scores · quiz_answer(uuid,uuid,text) ·
--       quiz_next(uuid,uuid) ของเกมทายเพลง
drop function if exists public.quiz_answer(uuid, uuid, integer);
drop function if exists public.quiz_reveal(uuid, uuid);
drop table if exists public.quiz_answers cascade;
drop table if exists public.quiz_players cascade;
drop table if exists public.quiz_questions cascade;
drop table if exists public.quiz_rooms cascade;

create table if not exists public.office_quiz_rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  host_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  status        text not null default 'LOBBY'
                constraint office_quiz_rooms_status check (status in ('LOBBY', 'QUESTION', 'REVEAL', 'DONE')),
  q_index       integer not null default -1,
  q_count       integer not null default 0,
  q_started_at  timestamptz,
  answered      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists office_quiz_rooms_open_idx on public.office_quiz_rooms (status, created_at desc);

create table if not exists public.office_quiz_questions (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.office_quiz_rooms(id) on delete cascade,
  idx       integer not null,
  body      text not null check (char_length(btrim(body)) between 1 and 200),
  choices   jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 4),
  correct   integer not null check (correct between 0 and 3),
  seconds   integer not null default 20 check (seconds in (10, 20, 30)),
  unique (room_id, idx)
);

create table if not exists public.office_quiz_players (
  room_id   uuid not null references public.office_quiz_rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  score     integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.office_quiz_answers (
  room_id     uuid not null references public.office_quiz_rooms(id) on delete cascade,
  idx         integer not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  choice      integer not null check (choice between 0 and 3),
  points      integer not null default 0,
  answered_at timestamptz not null default now(),
  primary key (room_id, idx, user_id)
);

-- ── RLS: อ่านได้เฉพาะห้องกับรายชื่อผู้เล่น · คำถาม/คำตอบอ่านผ่าน service role เท่านั้น ──
alter table public.office_quiz_rooms     enable row level security;
alter table public.office_quiz_questions enable row level security;
alter table public.office_quiz_players   enable row level security;
alter table public.office_quiz_answers   enable row level security;

drop policy if exists office_quiz_rooms_read on public.office_quiz_rooms;
create policy office_quiz_rooms_read on public.office_quiz_rooms for select using (public.viewer_is_staff());
drop policy if exists office_quiz_players_read on public.office_quiz_players;
create policy office_quiz_players_read on public.office_quiz_players for select using (public.viewer_is_staff());
/* ★ office_quiz_questions · office_quiz_answers จงใจไม่มี policy — ไม่มีใครอ่านตรงได้นอกจาก service role */

drop trigger if exists office_quiz_rooms_touch on public.office_quiz_rooms;
create trigger office_quiz_rooms_touch before update on public.office_quiz_rooms
  for each row execute function public.touch_updated_at();


-- ═════════════════════════════════════════════════════════════════════
-- RPC
-- ═════════════════════════════════════════════════════════════════════

/** ตอบข้อปัจจุบัน — ตอบได้ครั้งเดียว ภายในเวลา (เผื่อเน็ตช้า 1.5 วินาที) */
create or replace function public.office_quiz_answer(p_actor uuid, p_room uuid, p_choice integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.office_quiz_rooms;
  v_q       public.office_quiz_questions;
  v_elapsed double precision;
  v_points  integer := 0;
  v_rows    integer;
begin
  select * into v_room from public.office_quiz_rooms where id = p_room;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'QUESTION' then return jsonb_build_object('accepted', false, 'reason', 'CLOSED'); end if;
  if not exists (select 1 from public.office_quiz_players where room_id = p_room and user_id = p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_q from public.office_quiz_questions where room_id = p_room and idx = v_room.q_index;
  if p_choice < 0 or p_choice >= jsonb_array_length(v_q.choices) then raise exception 'VALIDATION_FAILED'; end if;

  v_elapsed := extract(epoch from (now() - v_room.q_started_at));
  if v_elapsed > v_q.seconds + 1.5 then return jsonb_build_object('accepted', false, 'reason', 'LATE'); end if;

  if p_choice = v_q.correct then
    v_points := greatest(500, least(1000, round(1000 - 500 * greatest(v_elapsed, 0) / v_q.seconds)::integer));
  end if;

  insert into public.office_quiz_answers (room_id, idx, user_id, choice, points)
  values (p_room, v_room.q_index, p_actor, p_choice, v_points)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update public.office_quiz_rooms set answered = answered + 1 where id = p_room;
  end if;
  return jsonb_build_object('accepted', v_rows > 0);
end;
$$;

/**
 * เฉลย — ผู้จัดกดได้ทุกเมื่อ · คนอื่นเรียกได้เมื่อหมดเวลาแล้วเท่านั้น
 * ★ ผู้จัดปิดแท็บกลางคันแล้วห้องจะไม่ค้าง — เครื่องผู้เล่นเรียกเฉลยแทนได้เมื่อหมดเวลา
 * ★ เรียกซ้ำไม่มีผล (เปลี่ยนสถานะเฉพาะจาก QUESTION) คะแนนจึงไม่ถูกบวกซ้ำ
 */
create or replace function public.office_quiz_reveal(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.office_quiz_rooms;
  v_secs integer;
  v_rows integer;
begin
  select * into v_room from public.office_quiz_rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'QUESTION' then return; end if;

  select seconds into v_secs from public.office_quiz_questions where room_id = p_room and idx = v_room.q_index;
  if v_room.host_id <> p_actor and now() < v_room.q_started_at + make_interval(secs => v_secs) then
    raise exception 'FORBIDDEN';
  end if;

  update public.office_quiz_rooms set status = 'REVEAL' where id = p_room and status = 'QUESTION';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return; end if;

  update public.office_quiz_players p
     set score = p.score + a.points
    from public.office_quiz_answers a
   where a.room_id = p_room and a.idx = v_room.q_index
     and p.room_id = p_room and p.user_id = a.user_id;
end;
$$;

/** ข้อต่อไป (หรือจบเมื่อหมดข้อ) — ผู้จัดเท่านั้น */
create or replace function public.office_quiz_next(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.office_quiz_rooms;
begin
  select * into v_room from public.office_quiz_rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> p_actor then raise exception 'FORBIDDEN'; end if;
  if v_room.status not in ('LOBBY', 'REVEAL') then return; end if;

  if v_room.q_index + 1 >= v_room.q_count then
    update public.office_quiz_rooms set status = 'DONE' where id = p_room;
  else
    update public.office_quiz_rooms
       set status = 'QUESTION', q_index = q_index + 1, q_started_at = now(), answered = 0
     where id = p_room;
  end if;
end;
$$;

revoke all on function public.office_quiz_answer(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.office_quiz_reveal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.office_quiz_next(uuid, uuid) from public, anon, authenticated;
grant execute on function public.office_quiz_answer(uuid, uuid, integer) to service_role;
grant execute on function public.office_quiz_reveal(uuid, uuid) to service_role;
grant execute on function public.office_quiz_next(uuid, uuid) to service_role;


-- ── Realtime: ห้องกับรายชื่อผู้เล่น (สัญญาณให้เครื่องผู้เล่นดึงสถานะใหม่) ──
alter table public.office_quiz_rooms   replica identity full;
alter table public.office_quiz_players replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.office_quiz_rooms;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.office_quiz_players;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
