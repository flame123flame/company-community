-- ═══════════════════════════════════════════════════════════════════
-- 0032 · เฟส 2 · สายการแข่งขัน + สถิติ + ถ่วงฝีมือ
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-C08  สุ่มคู่แข่งขัน สร้างสายน็อกเอาต์ และบันทึกผลแข่ง
--   FR-C09  ถ่วงฝีมือจากสถิติชนะ-แพ้เดิม
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ทัวร์นาเมนต์
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.tournaments (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,

  name       text not null default 'การแข่งขัน'
             constraint tournaments_name_len
             check (char_length(btrim(name)) between 1 and 60),

  /** OPEN = ยังแข่งอยู่ · DONE = มีแชมป์แล้ว */
  status     text not null default 'OPEN'
             constraint tournaments_status check (status in ('OPEN', 'DONE')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tournaments_touch on public.tournaments;
create trigger tournaments_touch
  before update on public.tournaments
  for each row execute function public.touch_updated_at();

create index if not exists tournaments_owner_idx
  on public.tournaments (owner_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ทีมในทัวร์นาเมนต์
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.tournament_teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,

  name          text not null,
  color         text not null default '#ff0033',

  /*
   * ★★ เก็บสมาชิกเป็น jsonb ภาพถ่าย ไม่ใช่ FK ไป profiles
   *
   *    เหตุผลเดียวกับ name_sets ใน 0028: ทีมรับได้ทั้งคนในระบบและชื่อที่พิมพ์เอง
   *    ★ และผลการแข่งเป็นประวัติศาสตร์ — คนลาออกไปแล้วผลเก่าต้องยังอ่านได้
   *
   *    ★★ แต่สถิติชนะ-แพ้ (FR-C09) ต้องนับรายคน จึงต้องมี id ใน jsonb ด้วย
   *       คนที่พิมพ์ชื่อเองจะไม่มี id และไม่ถูกนับ — ซึ่งถูกต้อง
   *       เพราะเราไม่มีทางรู้ว่า "สมชาย" ที่พิมพ์วันนี้คือคนเดิมกับเมื่อวาน
   */
  members       jsonb not null default '[]'::jsonb
                constraint tournament_teams_members_array
                check (jsonb_typeof(members) = 'array'),

  /** ลำดับในสาย — ใช้วางตำแหน่งเริ่มต้น */
  seed          integer not null default 0,

  created_at    timestamptz not null default now()
);

create index if not exists tournament_teams_tournament_idx
  on public.tournament_teams (tournament_id, seed);


-- ═════════════════════════════════════════════════════════════════════
-- 3 · คู่แข่งขัน
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,

  /** รอบที่ 0 = รอบแรก · เพิ่มขึ้นไปจนถึงรอบชิง */
  round         integer not null,
  /** ตำแหน่งในรอบนั้น เริ่มจาก 0 */
  slot          integer not null,

  /*
   * ★ null ได้ทั้งคู่ — คู่ในรอบถัดไปถูกสร้างไว้ล่วงหน้าตั้งแต่ต้น
   *   แล้วค่อยเติมผู้ชนะเข้ามา ★ ทำแบบนี้เพื่อให้ผังทั้งสายวาดได้
   *   ตั้งแต่ยังไม่มีใครแข่ง — ซึ่งเป็นสิ่งที่คนอยากเห็นก่อนเริ่ม
   */
  team_a        uuid references public.tournament_teams(id) on delete set null,
  team_b        uuid references public.tournament_teams(id) on delete set null,

  winner        uuid references public.tournament_teams(id) on delete set null,
  score_a       integer constraint tournament_matches_score_a check (score_a is null or score_a >= 0),
  score_b       integer constraint tournament_matches_score_b check (score_b is null or score_b >= 0),

  played_at     timestamptz,
  created_at    timestamptz not null default now(),

  unique (tournament_id, round, slot)
);

create index if not exists tournament_matches_bracket_idx
  on public.tournament_matches (tournament_id, round, slot);


-- ═════════════════════════════════════════════════════════════════════
-- 4 · สร้างสาย (FR-C08)
-- ═════════════════════════════════════════════════════════════════════

/**
 * สร้างทัวร์นาเมนต์พร้อมสายน็อกเอาต์
 *
 * p_teams: [{name, color, members:[{id?,label}]}, …] เรียงตามลำดับที่สุ่มมาแล้ว
 *
 * ★★★ การสุ่มคู่เกิดฝั่ง client แล้วส่งลำดับมา ไม่ได้สุ่มที่นี่
 *
 *     หลักการเดียวกับ FR-X05 ทั้งระบบ: ผลถูกสุ่มก่อนเริ่มแอนิเมชันเสมอ
 *     ★ ถ้า server สุ่มลำดับให้ แอนิเมชัน "ลูกบอลหล่นจากโถ" จะแสดงผล
 *       ที่ยังไม่รู้ไม่ได้ — ต้องรอ round trip ก่อนถึงจะเริ่มเล่นได้
 *
 * ★★ ไบ (bye) เมื่อจำนวนทีมไม่ใช่กำลังสองของ 2
 *
 *    8 ทีม → ลงตัวพอดี · 6 ทีม → รอบแรกมี 2 คู่ อีก 2 ทีมผ่านเข้ารอบเลย
 *    ★ คู่ที่มีทีมเดียว (team_b เป็น null) ถือว่าทีมนั้นชนะทันที
 *      ฟังก์ชันนี้จึงเติม winner ให้เลยตั้งแต่สร้าง — ไม่ต้องให้คนกด
 */
create or replace function public.create_tournament(
  p_actor uuid,
  p_name  text,
  p_teams jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_count   integer;
  v_rounds  integer;
  v_slots   integer;
  v_team    jsonb;
  v_i       integer := 0;
  v_ids     uuid[] := '{}';
  v_tid     uuid;
  v_r       integer;
  v_s       integer;
  v_a       uuid;
  v_b       uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  v_count := jsonb_array_length(coalesce(p_teams, '[]'::jsonb));
  if v_count < 2 then
    raise exception 'VALIDATION_FAILED: need at least 2 teams';
  end if;
  if v_count > 32 then
    raise exception 'VALIDATION_FAILED: at most 32 teams';
  end if;

  insert into public.tournaments (owner_id, name)
  values (p_actor, coalesce(nullif(btrim(p_name), ''), 'การแข่งขัน'))
  returning id into v_id;

  /* สร้างทีมตามลำดับที่ส่งมา */
  for v_team in select * from jsonb_array_elements(p_teams) loop
    insert into public.tournament_teams (tournament_id, name, color, members, seed)
    values (
      v_id,
      coalesce(nullif(btrim(v_team ->> 'name'), ''), 'ทีม ' || (v_i + 1)),
      coalesce(nullif(v_team ->> 'color', ''), '#ff0033'),
      coalesce(v_team -> 'members', '[]'::jsonb),
      v_i
    )
    returning id into v_tid;

    v_ids := array_append(v_ids, v_tid);
    v_i := v_i + 1;
  end loop;

  /*
   * ★ จำนวนรอบ = ceil(log2(จำนวนทีม))
   *   ขนาดสาย = 2^รอบ ซึ่งมากกว่าหรือเท่ากับจำนวนทีมเสมอ
   */
  v_rounds := ceil(log(2, v_count::numeric))::integer;
  v_slots  := power(2, v_rounds)::integer;

  /* ── รอบแรก ─────────────────────────────────────────────────── */
  for v_s in 0 .. (v_slots / 2 - 1) loop
    v_a := case when v_s * 2 < v_count then v_ids[v_s * 2 + 1] else null end;
    v_b := case when v_s * 2 + 1 < v_count then v_ids[v_s * 2 + 2] else null end;

    insert into public.tournament_matches (tournament_id, round, slot, team_a, team_b, winner)
    values (
      v_id, 0, v_s, v_a, v_b,
      /* ★ ไบ: มีทีมเดียวในคู่ → ชนะทันที ไม่ต้องรอใครกด */
      case when v_a is not null and v_b is null then v_a
           when v_b is not null and v_a is null then v_b
           else null end
    );
  end loop;

  /* ── รอบถัดไป สร้างช่องว่างไว้ล่วงหน้า ──────────────────────── */
  for v_r in 1 .. v_rounds - 1 loop
    for v_s in 0 .. (power(2, v_rounds - v_r)::integer / 2 - 1) loop
      insert into public.tournament_matches (tournament_id, round, slot)
      values (v_id, v_r, v_s);
    end loop;
  end loop;

  /* ★ เลื่อนทีมที่ได้ไบขึ้นรอบถัดไปทันที ไม่งั้นผังจะดูเหมือนค้าง */
  perform public.advance_tournament_byes(v_id);

  return v_id;
end;
$$;


/**
 * เลื่อนผู้ชนะที่รู้ผลแล้วขึ้นรอบถัดไป
 *
 * ★ แยกเป็นฟังก์ชันเพราะถูกเรียกสองที่: ตอนสร้างสาย (สำหรับไบ)
 *   และตอนบันทึกผลแต่ละนัด ★ ถ้าเขียนซ้ำสองที่ วันที่แก้กติกาการเลื่อน
 *   จะมีที่หนึ่งที่ลืมแก้
 */
create or replace function public.advance_tournament_byes(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
  v_next_round integer;
  v_next_slot  integer;
  v_is_a       boolean;
begin
  for v_m in
    select round, slot, winner from public.tournament_matches
    where tournament_id = p_id and winner is not null
    order by round, slot
  loop
    v_next_round := v_m.round + 1;
    v_next_slot  := v_m.slot / 2;
    /* ★ คู่เลขคู่ไปช่อง A · เลขคี่ไปช่อง B — กติกามาตรฐานของสายน็อกเอาต์ */
    v_is_a := (v_m.slot % 2) = 0;

    if v_is_a then
      update public.tournament_matches
         set team_a = v_m.winner
       where tournament_id = p_id and round = v_next_round and slot = v_next_slot
         and team_a is distinct from v_m.winner;
    else
      update public.tournament_matches
         set team_b = v_m.winner
       where tournament_id = p_id and round = v_next_round and slot = v_next_slot
         and team_b is distinct from v_m.winner;
    end if;
  end loop;

  /*
   * ★★ หลังเลื่อนแล้ว อาจมีคู่ใหม่ที่เป็นไบอีก (อีกฝั่งยังว่าง
   *    และคู่ที่จะป้อนมาไม่มีทีมเลย) — เติม winner ให้ด้วย
   *    ★ ไม่งั้นสายที่มีไบหลายชั้นจะค้างกลางทาง
   */
  update public.tournament_matches m
     set winner = coalesce(m.team_a, m.team_b)
   where m.tournament_id = p_id
     and m.winner is null
     and (m.team_a is null) <> (m.team_b is null)
     and not exists (
       select 1 from public.tournament_matches prev
       where prev.tournament_id = p_id
         and prev.round = m.round - 1
         and prev.slot / 2 = m.slot
         and prev.winner is null
         and (prev.team_a is not null or prev.team_b is not null)
     );
end;
$$;


/** บันทึกผลนัดหนึ่ง แล้วเลื่อนผู้ชนะขึ้นรอบถัดไป (FR-C08) */
create or replace function public.record_match_result(
  p_actor   uuid,
  p_match   uuid,
  p_winner  uuid,
  p_score_a integer default null,
  p_score_b integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.tournament_matches;
  v_t public.tournaments;
begin
  select * into v_m from public.tournament_matches where id = p_match for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  select * into v_t from public.tournaments where id = v_m.tournament_id;

  /* ★ เฉพาะคนสร้างทัวร์นาเมนต์ — ไม่งั้นใครก็แก้ผลแข่งของคนอื่นได้ */
  if v_t.owner_id <> p_actor and not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_winner is distinct from v_m.team_a and p_winner is distinct from v_m.team_b then
    raise exception 'VALIDATION_FAILED: winner must be one of the two teams';
  end if;

  update public.tournament_matches
     set winner = p_winner, score_a = p_score_a, score_b = p_score_b, played_at = now()
   where id = p_match;

  perform public.advance_tournament_byes(v_m.tournament_id);

  /* ★ รอบสุดท้ายมีผู้ชนะ = จบทัวร์นาเมนต์ */
  update public.tournaments t
     set status = 'DONE'
   where t.id = v_m.tournament_id
     and not exists (
       select 1 from public.tournament_matches mm
       where mm.tournament_id = t.id and mm.winner is null
         and (mm.team_a is not null or mm.team_b is not null)
     );
end;
$$;


/** ลบทัวร์นาเมนต์ */
create or replace function public.delete_tournament(p_actor uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tournaments
   where id = p_id and (owner_id = p_actor or public.is_admin(p_actor));
  if not found then
    raise exception 'FORBIDDEN';
  end if;
  return p_id;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · สถิติชนะ-แพ้ (FR-C09)
-- ═════════════════════════════════════════════════════════════════════

/**
 * สถิติรายคนจากผลการแข่งทั้งหมด
 *
 * ★★★ นับจาก tournament_matches ตรง ๆ ไม่เก็บตัวนับแยก
 *
 *     ตัวนับแยกเร็วกว่าก็จริง ★ แต่มันหลุดจากความจริงได้ทุกครั้งที่
 *     มีคนแก้ผลแข่งย้อนหลังหรือลบทัวร์นาเมนต์ทิ้ง
 *     ★★ จำนวนนัดของออฟฟิศหนึ่งแห่งมีหลักร้อย ไม่ใช่หลักล้าน —
 *        การนับสดทุกครั้งถูกต้องเสมอและเร็วพออยู่แล้ว
 *
 * ★ นับเฉพาะคนที่มี id ใน members (คนในระบบ)
 *   ชื่อที่พิมพ์เองไม่ถูกนับ เพราะไม่มีทางรู้ว่าเป็นคนเดิมข้ามทัวร์นาเมนต์
 */
create or replace function public.player_stats()
returns table (user_id uuid, wins integer, losses integer, matches integer)
language sql
stable
security definer
set search_path = public
as $$
  with played as (
    select m.winner, m.team_a, m.team_b
    from public.tournament_matches m
    where m.winner is not null
      and m.team_a is not null
      and m.team_b is not null      -- ★ ไม่นับไบ ไม่ใช่การแข่งจริง
  ),
  participants as (
    select (mem ->> 'id')::uuid as uid,
           (t.id = p.winner)     as won
    from played p
    join public.tournament_teams t on t.id in (p.team_a, p.team_b)
    cross join lateral jsonb_array_elements(t.members) as mem
    where mem ? 'id' and (mem ->> 'id') ~ '^[0-9a-f-]{36}$'
  )
  select uid as user_id,
         count(*) filter (where won)::integer      as wins,
         count(*) filter (where not won)::integer  as losses,
         count(*)::integer                         as matches
  from participants
  where uid is not null
  group by uid;
$$;


/**
 * ถ่วงฝีมือ (FR-C09) — คืน "คะแนนฝีมือ" รายคนให้ client เอาไปจัดทีม
 *
 * ★★ คืนคะแนนดิบ ไม่ใช่ทีมที่จัดแล้ว
 *
 *    ★ การจัดทีมทั้งหมดอยู่ฝั่ง client (lib/office/teams.ts) ซึ่งทดสอบ
 *      ด้วยสถิติได้และไม่ต้องรอ network — ย้ายมาฝั่ง server จะเสียทั้งสองอย่าง
 *
 * ★ คนที่ยังไม่เคยแข่งได้ 0.5 (กลาง ๆ) ไม่ใช่ 0
 *   ★ ถ้าให้ 0 คนใหม่จะถูกมองว่าอ่อนที่สุดเสมอ แล้วถูกกองรวมกันในทีมเดียว
 */
create or replace function public.player_skill()
returns table (user_id uuid, skill numeric, matches integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id,
         /* อัตราชนะ — ยิ่งแข่งมากยิ่งเชื่อถือได้ แต่สูตรนี้ไม่ถ่วงความเชื่อมั่น
            เพราะจำนวนนัดของออฟฟิศน้อยเกินกว่าจะมีความหมาย */
         round(s.wins::numeric / greatest(s.matches, 1), 3) as skill,
         s.matches
  from public.player_stats() s;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 6 · RLS
-- ═════════════════════════════════════════════════════════════════════

alter table public.tournaments        enable row level security;
alter table public.tournament_teams   enable row level security;
alter table public.tournament_matches enable row level security;

revoke all on public.tournaments, public.tournament_teams, public.tournament_matches
  from anon, authenticated;
grant select on public.tournaments, public.tournament_teams, public.tournament_matches
  to authenticated;

/*
 * ★ ทัวร์นาเมนต์อ่านได้ทุกคนในบริษัท ต่างจากชุดรายชื่อที่เป็นของส่วนตัว
 *   ★ เพราะผลการแข่งเป็นเรื่องที่คนอยากอวดและอยากดู — การซ่อนไว้
 *     ทำให้ฟีเจอร์นี้ไม่มีความหมาย (ไม่มีใครดูสายที่ตัวเองสร้างคนเดียว)
 */
drop policy if exists "tournaments: staff read" on public.tournaments;
create policy "tournaments: staff read"
  on public.tournaments for select to authenticated
  using (public.viewer_is_staff());

drop policy if exists "tournament_teams: staff read" on public.tournament_teams;
create policy "tournament_teams: staff read"
  on public.tournament_teams for select to authenticated
  using (public.viewer_is_staff());

drop policy if exists "tournament_matches: staff read" on public.tournament_matches;
create policy "tournament_matches: staff read"
  on public.tournament_matches for select to authenticated
  using (public.viewer_is_staff());


-- ═════════════════════════════════════════════════════════════════════
-- 7 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.create_tournament(uuid, text, jsonb),
  public.advance_tournament_byes(uuid),
  public.record_match_result(uuid, uuid, uuid, integer, integer),
  public.delete_tournament(uuid, uuid),
  public.player_stats(),
  public.player_skill()
from public, anon, authenticated;

grant execute on function
  public.create_tournament(uuid, text, jsonb),
  public.advance_tournament_byes(uuid),
  public.record_match_result(uuid, uuid, uuid, integer, integer),
  public.delete_tournament(uuid, uuid),
  public.player_stats(),
  public.player_skill()
to service_role;
