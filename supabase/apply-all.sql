-- ============================================================================
--  FRAME ROOM · ฐานข้อมูลทั้งหมดในไฟล์เดียว  (migration 0001–0022)
-- ============================================================================
--  วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
--
--  ★★ รันซ้ำได้เสมอ — ไม่ว่าฐานข้อมูลจะว่างเปล่าหรือลง migration ไปแล้วบางส่วน
--
--     ไฟล์นี้ถูกแปลงให้ idempotent อัตโนมัติจาก supabase/migrations/:
--       create table / index   →  if not exists
--       create type            →  ห่อ DO block จับ duplicate_object
--       add constraint         →  ห่อ DO block
--       create trigger/policy  →  drop if exists ก่อนเสมอ
--       create function        →  create or replace อยู่แล้ว
--
--     จึงใช้เป็น "ไฟล์เดียวที่รันแล้วจบ" ได้ ไม่ต้องจำว่าเคยรันถึงไหน
--
--  ทั้งไฟล์อยู่ในทรานแซกชันเดียว — ถ้าพังตรงไหน rollback ทั้งหมด
--  ไม่เหลือ schema ครึ่ง ๆ กลาง ๆ
-- ============================================================================

begin;



-- ══════════════════════════════════════════════════════════════════════
-- 0001_extensions_enums.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0001 · Extensions & Enums
-- ============================================================================
-- รันก่อนทุกไฟล์ เพราะตารางใน 0002 อ้างถึง type เหล่านี้
-- ============================================================================

-- gen_random_uuid() มีใน core ตั้งแต่ Postgres 13 แต่ประกาศไว้ให้ชัดเจน
-- เผื่อกรณี restore ลง instance ที่ยังไม่ได้เปิด
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------------
-- บทบาทของผู้ใช้ในห้อง
-- ---------------------------------------------------------------------------
--   OWNER  — ผู้สร้างห้อง คุมทุกอย่าง
--   MEMBER — สมาชิกที่เข้าร่วมแล้ว เพิ่มเพลงได้
--   GUEST  — เข้ามาฟัง สิทธิ์เพิ่มเพลงขึ้นกับ rooms.allow_guest_add
--
-- ใช้ enum ไม่ใช่ text เพราะเป็นชุดปิดที่เปลี่ยนแทบไม่ได้
-- และได้การตรวจสอบจาก Postgres ฟรี ๆ (text ต้องเขียน check constraint เอง)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.member_role as enum ('OWNER', 'MEMBER', 'GUEST');
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- สถานะของเพลงในคิว
-- ---------------------------------------------------------------------------
--   WAITING — รอเล่น
--   PLAYING — กำลังเล่นอยู่ (ห้องละไม่เกิน 1 แถว — บังคับด้วย unique index ใน 0003)
--   PLAYED  — เล่นจบแล้วตามปกติ
--   SKIPPED — ถูกข้าม (คนกด Skip หรือวิดีโอเล่นไม่ได้)
--   REMOVED — ถูกลบออกจากคิวก่อนได้เล่น
--
-- ★ REMOVED เป็น soft delete โดยตั้งใจ ไม่ใช่ DELETE จริง เหตุผล 3 ข้อ:
--   1. Supabase Realtime ส่ง payload ของ DELETE มาแค่ primary key
--      ถ้าจะให้ส่งข้อมูลเต็มต้องตั้ง REPLICA IDENTITY FULL ซึ่งทำให้ WAL บวม
--      ทุกตารางทั้งระบบ — แลกไม่คุ้ม
--   2. position ที่เคยใช้ไปแล้วต้องไม่ถูกนำกลับมาใช้ซ้ำ
--      (unique constraint ใน 0003 พึ่งข้อนี้)
--   3. เก็บประวัติไว้ดูได้ว่าใครลบเพลงใคร
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.queue_status as enum (
  'WAITING', 'PLAYING', 'PLAYED', 'SKIPPED', 'REMOVED'
);
exception when duplicate_object then null;
end $$;


-- ══════════════════════════════════════════════════════════════════════
-- 0002_tables.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0002 · Tables & Triggers
-- ============================================================================
-- Index / constraint ที่ไม่ใช่ PK-FK อยู่ใน 0003 เพื่อให้ไฟล์นี้อ่านเป็น
-- "รูปร่างของข้อมูล" ล้วน ๆ
-- ============================================================================


-- ---------------------------------------------------------------------------
-- helper: อัปเดต updated_at อัตโนมัติ
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ===========================================================================
-- profiles — ข้อมูลผู้ใช้ที่เราเป็นเจ้าของ (auth.users เป็นของ Supabase)
-- ===========================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'Listener'
                constraint profiles_display_name_len
                check (char_length(display_name) between 1 and 40),
  avatar_url    text
                constraint profiles_avatar_https
                check (avatar_url is null or avatar_url ~ '^https://'),
  -- true = ผู้ใช้ anonymous (ยังไม่ผูก email/OAuth)
  -- เก็บไว้เพื่อให้ UI แยกแสดงได้ และเพื่ออนาคตที่จะ upgrade guest → สมาชิกจริง
  is_guest      boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'ข้อมูลผู้ใช้ฝั่งแอป 1:1 กับ auth.users สร้างอัตโนมัติด้วย trigger';


-- ---------------------------------------------------------------------------
-- สร้าง profile ทุกครั้งที่มี auth user ใหม่ (รวม anonymous sign-in)
-- ---------------------------------------------------------------------------
-- ★ ทำไมต้องเป็น trigger ไม่ใช่ให้ Route Handler insert เอง:
--   anonymous sign-in เกิดขึ้นฝั่ง client ผ่าน GoTrue โดยตรง ไม่ผ่าน server เรา
--   ถ้ารอ server มา insert จะมีช่วงที่ auth.uid() มีอยู่แต่ profile ยังไม่มี
--   แล้ว foreign key ของ room_members / queue_items จะพังเป็นครั้งคราว
--   (race ที่ reproduce ยากมาก) — trigger ปิดช่องนี้ในทรานแซกชันเดียวกับการสมัคร
--
-- ★ ไม่ใช้ new.is_anonymous เพราะเป็นคอลัมน์ที่เพิ่งมีใน GoTrue รุ่นใหม่
--   เช็คจาก email/phone เป็น null แทน ซึ่งเป็นจริงกับ anonymous เสมอ
--   และพอ user ผูก email ภายหลัง เราอัปเดต is_guest เองใน Route Handler
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      'Listener ' || upper(left(replace(new.id::text, '-', ''), 4))
    ),
    new.email is null and new.phone is null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===========================================================================
-- rooms
-- ===========================================================================
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),

  -- Crockford Base32 (0-9 A-Z ตัด I L O U) 6 หลัก = 32^6 ≈ 1.07e9
  -- ตัวชุดนี้ normalize ได้: ผู้ใช้พิมพ์ O → 0, พิมพ์ I/L → 1 ได้ไม่กำกวม
  code        text not null
              constraint rooms_code_format
              check (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$'),

  name        text not null default 'Music Room'
              constraint rooms_name_len
              check (char_length(name) between 1 and 60),

  owner_id    uuid not null references public.profiles(id) on delete cascade,

  -- ─── Permission configuration ───────────────────────────────────────────
  -- เก็บเป็นคอลัมน์ในห้อง ไม่ hardcode ในโค้ด เพื่อให้เปลี่ยนนโยบายภายหลัง
  -- ได้โดยไม่ต้อง migrate และให้แต่ละห้องตั้งค่าต่างกันได้
  is_locked             boolean not null default false,  -- ปิดรับเพลงใหม่ชั่วคราว
  allow_guest_add       boolean not null default true,   -- GUEST เพิ่มเพลงได้ไหม
  allow_member_skip     boolean not null default false,  -- MEMBER กด Skip ได้ไหม
  allow_member_control  boolean not null default false,  -- MEMBER กด Play/Pause/Seek ได้ไหม

  max_queue_size  integer not null default 200
                  constraint rooms_max_queue_range
                  check (max_queue_size between 1 and 1000),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch
  before update on public.rooms
  for each row execute function public.touch_updated_at();


-- ===========================================================================
-- room_members
-- ===========================================================================
create table if not exists public.room_members (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          public.member_role not null default 'GUEST',
  joined_at     timestamptz not null default now(),
  -- ใช้ตัดสิน "leader" ตอนต้องเลือกว่าใครรายงานเพลงจบ เมื่อ OWNER ไม่อยู่
  last_seen_at  timestamptz not null default now(),

  constraint room_members_unique_membership unique (room_id, user_id)
);

comment on column public.room_members.last_seen_at is
  'อัปเดตเป็นระยะจาก presence ไม่ใช่ทุก request — ใช้เลือก leader เท่านั้น';


-- ===========================================================================
-- queue_items
-- ===========================================================================
create table if not exists public.queue_items (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,

  -- YouTube video id เป็น 11 ตัวอักษร base64url เสมอ
  -- ตรวจที่ระดับ DB ด้วย เพราะค่านี้ถูกส่งต่อไปที่ IFrame Player โดยตรง
  video_id       text not null
                 constraint queue_items_video_id_format
                 check (video_id ~ '^[A-Za-z0-9_-]{11}$'),

  title          text not null
                 constraint queue_items_title_len
                 check (char_length(title) between 1 and 300),
  channel_title  text
                 constraint queue_items_channel_len
                 check (channel_title is null or char_length(channel_title) <= 200),
  thumbnail_url  text
                 constraint queue_items_thumb_https
                 check (thumbnail_url is null or thumbnail_url ~ '^https://'),

  -- วินาที · เพดาน 10 ชั่วโมง กัน live stream / วิดีโอยาวผิดปกติเข้าคิว
  duration       integer not null
                 constraint queue_items_duration_range
                 check (duration > 0 and duration <= 36000),

  -- ★ เพิ่มขึ้นเรื่อย ๆ ต่อห้อง ไม่เคยใช้ซ้ำแม้เพลงจะถูกลบ
  --   ทำให้ unique (room_id, position) ครอบทุกแถวได้ (ดู 0003)
  position       bigint not null,

  status         public.queue_status not null default 'WAITING',
  added_by       uuid references public.profiles(id) on delete set null,

  -- เวลาที่เพลงนี้เริ่ม/จบจริง ใช้ทำ history และ debug การซิงก์
  started_at     timestamptz,
  ended_at       timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists queue_items_touch on public.queue_items;
create trigger queue_items_touch
  before update on public.queue_items
  for each row execute function public.touch_updated_at();


-- ===========================================================================
-- playback_states — หัวใจของการซิงก์ · 1 แถวต่อ 1 ห้อง
-- ===========================================================================
-- ความหมายของแต่ละ field (ทั้งระบบพึ่งนิยามนี้):
--
--   is_playing = true   →  position(t) = current_position + (t - started_at)
--   is_playing = false  →  position(t) = current_position
--
--   started_at ★ ไม่ใช่ "เวลาที่เพลงเริ่ม" แต่คือ "anchor ล่าสุด"
--     • เริ่มเพลงใหม่ : current_position = 0, started_at = now()
--     • กด Pause     : current_position = position(now()), is_playing = false
--     • กด Play ต่อ  : started_at = now()  (current_position คงเดิม)
--     • Seek ไป S    : current_position = S, started_at = now()
--
--   ออกแบบแบบนี้เพราะทำให้ play / pause / resume / seek ใช้สูตรเดียวกันทั้งหมด
--   ไม่ต้องแยกเคสในโค้ดฝั่ง client เลย
-- ===========================================================================
create table if not exists public.playback_states (
  room_id           uuid primary key references public.rooms(id) on delete cascade,

  -- null = ไม่มีเพลงเล่นอยู่ (คิวหมด หรือห้องเพิ่งสร้าง)
  queue_item_id     uuid references public.queue_items(id) on delete set null,
  video_id          text
                    constraint playback_video_id_format
                    check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),

  is_playing        boolean not null default false,
  started_at        timestamptz,
  paused_at         timestamptz,

  current_position  integer not null default 0
                    constraint playback_position_non_negative
                    check (current_position >= 0),

  -- ★ เพิ่มขึ้นทุกครั้งที่เขียน — client ทิ้ง realtime payload ที่ version ต่ำกว่า
  --   ที่ถืออยู่ ทำให้ event ที่มาช้า/ซ้ำ/ผิดลำดับทำลาย state ไม่ได้
  version           bigint not null default 0,

  updated_at        timestamptz not null default now(),

  -- กำลังเล่นอยู่ต้องมี anchor และต้องรู้ว่าเล่นเพลงไหน — ไม่มีก็คำนวณตำแหน่งไม่ได้
  constraint playback_playing_needs_anchor
  check (
    not is_playing
    or (started_at is not null and queue_item_id is not null and video_id is not null)
  )
);

drop trigger if exists playback_states_touch on public.playback_states;
create trigger playback_states_touch
  before update on public.playback_states
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ══════════════════════════════════════════════════════════════════════
-- 0003_indexes_constraints.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0003 · Indexes & Constraints
-- ============================================================================
-- แยกจาก 0002 เพราะ index หลายตัวที่นี่ไม่ใช่แค่เรื่องความเร็ว
-- แต่เป็น "กฎของระบบ" ที่บังคับที่ระดับฐานข้อมูล — ถ้าโค้ดพลาด DB จะปฏิเสธ
-- ============================================================================


-- ===========================================================================
-- rooms
-- ===========================================================================

-- lookup ด้วย code ตอน join — เป็น query ที่เกิดทุกครั้งที่มีคนเข้าห้อง
create unique index if not exists rooms_code_key on public.rooms (code);

create index if not exists rooms_owner_idx on public.rooms (owner_id);


-- ===========================================================================
-- room_members
-- ===========================================================================

-- "ฉันอยู่ในห้องนี้ไหม" — RLS ทุก policy เรียกผ่าน is_room_member()
-- ซึ่ง query ด้วย (room_id, user_id) จึงต้องมี index ตรงชุดนี้
-- unique constraint จาก 0002 สร้าง index (room_id, user_id) ให้อยู่แล้ว

-- "ฉันอยู่ห้องไหนบ้าง" — ใช้ใน policy ของ profiles
create index if not exists room_members_user_idx on public.room_members (user_id);

-- ★ กฎ: หนึ่งห้องมี OWNER ได้คนเดียว
create unique index if not exists room_members_single_owner_idx
  on public.room_members (room_id)
  where role = 'OWNER';


-- ===========================================================================
-- queue_items — index 4 ตัวนี้คือจุดที่ความถูกต้องของคิวเกิดขึ้นจริง
-- ===========================================================================

-- ★★ กฎที่ 1: position ห้ามซ้ำในห้องเดียวกัน — ตลอดกาล
--
-- นี่คือ "ตัวกันชนสุดท้าย" ของ race condition ตอนเพิ่มเพลง
-- enqueue_track() ถือ advisory lock อยู่แล้วจึงไม่ควรชนกัน
-- แต่ถ้าวันหนึ่งมีใครเขียนโค้ด insert ตรง ๆ โดยลืม lock
-- เราอยากให้มันพังเสียงดัง (unique violation) มากกว่าได้ position ซ้ำเงียบ ๆ
-- แล้วคิวเรียงผิดโดยไม่มีใครรู้
--
-- ครอบทุกแถวรวม PLAYED/REMOVED ได้เพราะ position เป็น monotonic ไม่ใช้ซ้ำ
do $$ begin
  alter table public.queue_items
  add constraint queue_items_position_unique unique (room_id, position);
exception when duplicate_table or duplicate_object then null;
end $$;


-- ★★ กฎที่ 2: หนึ่งห้องมีเพลงที่ PLAYING ได้ไม่เกิน 1 เพลง
--
-- ปิดช่องของ race ตอนเปลี่ยนเพลง: ถ้าสองทรานแซกชันพยายามตั้งเพลงเป็น PLAYING
-- พร้อมกัน ตัวที่สองจะถูก DB ปฏิเสธ แม้ logic ใน advance_queue() จะพลาด
create unique index if not exists queue_items_one_playing_idx
  on public.queue_items (room_id)
  where status = 'PLAYING';


-- ★★ กฎที่ 3: เพลงเดิมอยู่ในคิวซ้ำไม่ได้ (เฉพาะที่ยังไม่เล่น)
--
-- เล่นจบแล้ว (PLAYED) เพิ่มซ้ำได้ — คนอยากฟังซ้ำเป็นเรื่องปกติ
-- เปลี่ยนนโยบายเป็น "อนุญาตให้ซ้ำ" ทำได้ด้วยการ drop index ตัวนี้ตัวเดียว
create unique index if not exists queue_items_no_dup_pending_idx
  on public.queue_items (room_id, video_id)
  where status in ('WAITING', 'PLAYING');


-- ★ query ที่ร้อนที่สุดในระบบ: "เพลง WAITING ถัดไปของห้องนี้คือเพลงไหน"
--   ถูกเรียกทุกครั้งที่เพลงจบและทุกครั้งที่มีคนกด Skip
--   partial index ทำให้ index เล็กมาก (ไม่รวมประวัติที่เล่นไปแล้ว)
--   และ order by position asc limit 1 กลายเป็นการอ่านแถวแรกของ index ตรง ๆ
create index if not exists queue_items_next_waiting_idx
  on public.queue_items (room_id, position)
  where status = 'WAITING';


-- แสดงคิวทั้งหมดรวมประวัติ (หน้าห้อง + การ resync)
create index if not exists queue_items_room_position_idx
  on public.queue_items (room_id, position desc);


-- หา "เพลงที่ฉันเพิ่ม" เพื่อเช็คสิทธิ์ตอนกดลบ
create index if not exists queue_items_added_by_idx
  on public.queue_items (added_by)
  where added_by is not null;


-- ===========================================================================
-- playback_states
-- ===========================================================================

-- ใช้โดย janitor ที่ตามเก็บห้องที่เพลงควรจบไปแล้วแต่ไม่มีใครรายงาน
-- partial index เพราะห้องส่วนใหญ่ในระบบจะไม่ได้เล่นอยู่
create index if not exists playback_states_playing_idx
  on public.playback_states (started_at)
  where is_playing;


-- ══════════════════════════════════════════════════════════════════════
-- 0004_functions_rpc.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0004 · Functions & RPC
-- ============================================================================
-- ★ ไฟล์นี้คือที่ที่ความถูกต้องของคิวและการซิงก์เกิดขึ้นจริง
--
-- หลักการ 3 ข้อที่ทุกฟังก์ชันในนี้ยึด:
--
--   1. mutation ของห้องเดียวกัน "เข้าคิวทีละตัว" ด้วย pg_advisory_xact_lock
--      ที่ใช้ key เดียวกันทั้งไฟล์ → enqueue / advance / remove / clear
--      ไม่มีทางทำงานทับกันได้เลย
--
--   2. การเปลี่ยนเพลงเป็น compare-and-swap เสมอ — ยิงซ้ำกี่ครั้งได้ผลเดียว
--      (idempotent) เพราะผู้ฟัง 50 คนจะได้ event ENDED พร้อมกัน
--
--   3. ตรวจสิทธิ์ในฟังก์ชันเอง ไม่พึ่งว่า caller ตรวจมาแล้ว
--      เพราะฟังก์ชันเหล่านี้เป็น SECURITY DEFINER = มีอำนาจเต็ม
-- ============================================================================


-- ===========================================================================
-- ส่วนที่ 1 · Helper
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- key ของ advisory lock ต่อห้อง
-- ---------------------------------------------------------------------------
-- ★ ทุกฟังก์ชันที่แก้คิว/playback ต้องเรียกตัวนี้เป็นบรรทัดแรก
--   ถ้าใช้ key คนละสูตรกัน lock จะไม่กันกันเอง — จึงรวมไว้ที่เดียว
--
-- advisory lock เป็น lock ระดับ session/transaction ที่เราตั้งความหมายเอง
-- ไม่ได้ผูกกับแถวไหน จึงกันได้แม้แต่กรณีที่ยังไม่มีแถวอยู่เลย
-- (เช่น INSERT เพลงแรกของห้อง ซึ่ง row lock ช่วยไม่ได้)
-- ---------------------------------------------------------------------------
create or replace function public.room_lock_key(p_room_id uuid)
returns bigint
language sql
immutable
as $$
  select hashtextextended(p_room_id::text, 42);
$$;


-- ---------------------------------------------------------------------------
-- สุ่ม room code ด้วย CSPRNG
-- ---------------------------------------------------------------------------
-- ใช้ gen_random_bytes ไม่ใช่ random() เพราะ random() เดาต่อได้เมื่อรู้ seed
-- ซึ่งเปิดทางให้เดารหัสห้องที่เพิ่งถูกสร้าง
--
-- 256 หารด้วย 32 ลงตัว → `% 32` ไม่เกิด modulo bias
-- ---------------------------------------------------------------------------
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  k_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := gen_random_bytes(6);
  v_code text := '';
  i integer;
begin
  for i in 0..5 loop
    v_code := v_code || substr(k_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;


-- ---------------------------------------------------------------------------
-- ผู้ใช้ปัจจุบันอยู่ในห้องนี้ไหม / มี role อะไร
-- ---------------------------------------------------------------------------
-- ★ ต้องเป็น SECURITY DEFINER ไม่งั้น policy ของ room_members จะเรียกตัวเองวนไม่จบ
--   (policy → is_room_member → SELECT room_members → policy → ...)
--   SECURITY DEFINER ทำให้ query ข้างในไม่ถูก RLS ตรวจอีกรอบ
--
-- ★ set search_path = '' แล้วเขียนชื่อเต็มทุกตัว
--   กันการโจมตีแบบสร้างตารางชื่อเดียวกันใน schema ที่ตัวเองควบคุม
--   แล้วดัน search_path ให้ฟังก์ชันสิทธิ์สูงไปอ่านตารางปลอมแทน
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.my_room_role(p_room_id uuid)
returns public.member_role
language sql
security definer
stable
set search_path = ''
as $$
  select role
  from public.room_members
  where room_id = p_room_id
    and user_id = (select auth.uid());
$$;


-- ---------------------------------------------------------------------------
-- Permission matrix — รวมไว้ที่เดียว
-- ---------------------------------------------------------------------------
-- เปลี่ยนนโยบายสิทธิ์ทั้งระบบ = แก้แค่ 4 ฟังก์ชันนี้
-- ไม่ต้องไล่แก้ตาม RPC แต่ละตัว และไม่ต้องแก้โค้ด TypeScript
-- ---------------------------------------------------------------------------
create or replace function public.perm_can_add(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select case
    when p_room.is_locked then false          -- ห้องปิดรับเพลง = ไม่มีใครเพิ่มได้ แม้แต่ OWNER
    when p_role = 'OWNER'  then true
    when p_role = 'MEMBER' then true
    when p_role = 'GUEST'  then p_room.allow_guest_add
    else false
  end;
$$;

create or replace function public.perm_can_skip(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select case
    when p_role = 'OWNER'  then true
    when p_role = 'MEMBER' then p_room.allow_member_skip
    else false                                 -- GUEST ข้ามเพลงไม่ได้
  end;
$$;

create or replace function public.perm_can_control(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select case
    when p_role = 'OWNER'  then true
    when p_role = 'MEMBER' then p_room.allow_member_control
    else false
  end;
$$;

create or replace function public.perm_can_manage(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select p_role = 'OWNER' and p_room.id is not null;
$$;


-- ---------------------------------------------------------------------------
-- ตำแหน่งเพลงปัจจุบัน ณ เวลานี้ (วินาที) คำนวณจากนาฬิกา server
-- ---------------------------------------------------------------------------
-- สูตรเดียวกับที่ client ใช้เป๊ะ ๆ — ถ้าสองที่คำนวณไม่ตรงกัน การซิงก์จะเพี้ยน
-- แบบหาสาเหตุยาก จึงเขียนไว้ทั้งสองฝั่งโดยอ้างอิงนิยามเดียวกันใน 0002
-- ---------------------------------------------------------------------------
create or replace function public.playback_position_now(p_pb public.playback_states)
returns numeric
language sql
stable
as $$
  select case
    when p_pb.is_playing and p_pb.started_at is not null
      then p_pb.current_position + extract(epoch from (now() - p_pb.started_at))
    else p_pb.current_position::numeric
  end;
$$;


-- ===========================================================================
-- ส่วนที่ 2 · Room
-- ===========================================================================

create or replace function public.create_room(
  p_owner uuid,
  p_name  text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_attempt integer := 0;
begin
  if p_owner is null or not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'UNAUTHORIZED';
  end if;

  -- retry เมื่อ code ชน — โอกาสชนที่ 1.07e9 combination แทบเป็นศูนย์
  -- แต่ "แทบ" ไม่ใช่ "ไม่" จึงต้องมี loop ไม่ใช่ปล่อยให้ผู้ใช้เจอ error
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.rooms (code, name, owner_id)
      values (
        public.generate_room_code(),
        coalesce(nullif(trim(p_name), ''), 'Music Room'),
        p_owner
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'DATABASE_ERROR: room code collision after % attempts', v_attempt;
      end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, p_owner, 'OWNER');

  -- ★ สร้างแถว playback ว่างพร้อมห้องเสมอ
  --   ทำให้ฟังก์ชันอื่นสมมติได้ตลอดว่าแถวนี้มีอยู่ ไม่ต้อง upsert ให้ซับซ้อน
  --   และไม่มีช่วงเวลาที่ห้องมีอยู่แต่ playback ยังไม่มี
  insert into public.playback_states (room_id) values (v_room.id);

  return v_room;
end;
$$;


create or replace function public.join_room(
  p_code text,
  p_user uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_room from public.rooms where code = upper(p_code);
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- เข้าห้องซ้ำได้ไม่จำกัด (refresh หน้า / เปิดหลาย tab) จึงต้อง idempotent
  -- ★ do update ไม่ใช่ do nothing เพราะต้องอัปเดต last_seen_at
  --   แต่ห้ามแตะ role เด็ดขาด ไม่งั้น OWNER ที่กลับเข้าห้องจะถูกลดเป็น MEMBER
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, p_user, 'MEMBER')
  on conflict (room_id, user_id)
  do update set last_seen_at = now();

  return v_room;
end;
$$;


create or replace function public.touch_member(
  p_room_id uuid,
  p_user    uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = p_user;
$$;


-- ===========================================================================
-- ส่วนที่ 3 · Queue
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- enqueue_track — เพิ่มเพลงเข้าคิวแบบปลอดภัยจาก race condition
-- ---------------------------------------------------------------------------
-- สถานการณ์ที่ต้องรองรับ: A, B, C กด Add พร้อมกันในเสี้ยววินาทีเดียวกัน
--
-- ★ ทำไม max(position) + 1 ตรงนี้ถึงปลอดภัย ทั้งที่เป็นรูปแบบที่ห้ามทำจาก client
--
--   จาก client:  อ่าน max → (ช่องว่างที่ใครก็แทรกได้) → เขียน
--                A อ่านได้ 5, B อ่านได้ 5, ทั้งคู่เขียน 6 → ซ้ำ
--
--   ในนี้:       ถือ advisory lock ของห้องอยู่ → ทรานแซกชันของห้องเดียวกัน
--                เข้ามาได้ทีละตัว ช่องว่างนั้นจึงไม่มีอยู่
--                A เข้า (lock) อ่าน 5 เขียน 6 ปล่อย → B เข้า อ่าน 6 เขียน 7
--
--   และถ้าวันหนึ่ง lock พลาดจริง ๆ unique (room_id, position) จะ reject ให้อีกชั้น
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_track(
  p_room_id  uuid,
  p_actor    uuid,
  p_video_id text,
  p_title    text,
  p_channel  text,
  p_thumb    text,
  p_duration integer
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room        public.rooms;
  v_role        public.member_role;
  v_item        public.queue_items;
  v_position    bigint;
  v_waiting     integer;
  v_has_playing boolean;
begin
  -- ★ บรรทัดแรกเสมอ — ทุกอย่างหลังจากนี้เป็นของห้องนี้คนเดียว
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';              -- ไม่ได้อยู่ในห้องนี้
  end if;

  if v_room.is_locked then
    raise exception 'QUEUE_LOCKED';
  end if;

  if not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select count(*) into v_waiting
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  if v_waiting >= v_room.max_queue_size then
    raise exception 'QUEUE_FULL';
  end if;

  -- เช็คซ้ำก่อน insert เพื่อให้ได้ error code ที่ถูกต้อง
  -- (ถ้าปล่อยให้ index เป็นคนจับ จะแยกไม่ออกว่าชนเพราะ video ซ้ำหรือ position ซ้ำ)
  if exists (
    select 1 from public.queue_items
    where room_id = p_room_id
      and video_id = p_video_id
      and status in ('WAITING', 'PLAYING')
  ) then
    raise exception 'DUPLICATE_IN_QUEUE';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.queue_items
  where room_id = p_room_id;

  insert into public.queue_items (
    room_id, video_id, title, channel_title, thumbnail_url,
    duration, position, status, added_by
  )
  values (
    p_room_id, p_video_id, left(p_title, 300), left(p_channel, 200), p_thumb,
    p_duration, v_position, 'WAITING', p_actor
  )
  returning * into v_item;

  -- ถ้าห้องเงียบอยู่ ให้เพลงนี้เริ่มเล่นทันทีในทรานแซกชันเดียวกัน
  -- ★ ทำในนี้ ไม่ใช่ให้ client ยิง API ตัวที่สองตามมา
  --   เพราะระหว่างสอง request นั้นจะมีช่วงที่ "มีเพลงในคิวแต่ไม่มีอะไรเล่น"
  --   ซึ่งถ้าคนอื่นเพิ่มเพลงแทรกพอดี ลำดับจะสลับแบบคาดเดาไม่ได้
  select exists (
    select 1 from public.queue_items
    where room_id = p_room_id and status = 'PLAYING'
  ) into v_has_playing;

  if not v_has_playing then
    update public.queue_items
    set status = 'PLAYING', started_at = now()
    where id = v_item.id
    returning * into v_item;

    update public.playback_states
    set queue_item_id    = v_item.id,
        video_id         = v_item.video_id,
        is_playing       = true,
        started_at       = now(),
        paused_at        = null,
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id;
  end if;

  return v_item;
end;
$$;


-- ---------------------------------------------------------------------------
-- advance_queue — เปลี่ยนไปเพลงถัดไป (เพลงจบเอง หรือถูกข้าม)
-- ---------------------------------------------------------------------------
-- ★★ นี่คือฟังก์ชันที่สำคัญที่สุดในระบบ
--
-- ปัญหา: ผู้ฟัง 50 คนได้ event ENDED จาก YouTube player พร้อมกัน
--        ถ้าทุกคนเปลี่ยนเพลงได้ เพลงจะถูกข้ามรวดเดียว 50 เพลง
--
-- ทางแก้: compare-and-swap ด้วย p_expected_id
--        client บอกมาว่า "ฉันเห็นว่าเพลงที่เล่นอยู่คือ X"
--        ถ้าตอนที่ request มาถึง เพลงปัจจุบันไม่ใช่ X แล้ว
--        แปลว่ามีคนเปลี่ยนไปก่อนหน้าเสี้ยววินาที → ไม่ทำอะไร คืนสถานะปัจจุบันกลับไป
--
--        คนแรกที่มาถึงชนะ อีก 49 คนได้ผลลัพธ์เดียวกันโดยไม่มี error
--        และ client ทั้ง 50 เครื่องจบลงด้วย state เดียวกันเสมอ
--
-- p_actor = null หมายถึง "ระบบเป็นคนเรียก" (janitor ใน 0007)
-- ใช้ได้เฉพาะ reason = 'ENDED' และเรียกได้จาก service_role เท่านั้น
-- ---------------------------------------------------------------------------
create or replace function public.advance_queue(
  p_room_id     uuid,
  p_actor       uuid,
  p_expected_id uuid,
  p_reason      text
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb      public.playback_states;
  v_room    public.rooms;
  v_role    public.member_role;
  v_current public.queue_items;
  v_next    public.queue_items;
  v_elapsed numeric;
begin
  if p_reason not in ('ENDED', 'SKIPPED') then
    raise exception 'VALIDATION_FAILED: unknown reason %', p_reason;
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ตรวจสิทธิ์
  if p_actor is not null then
    select role into v_role
    from public.room_members
    where room_id = p_room_id and user_id = p_actor;

    if v_role is null then
      raise exception 'FORBIDDEN';
    end if;

    -- การข้ามเพลงเป็นการกระทำที่กระทบทุกคนในห้อง จึงต้องมีสิทธิ์
    -- ส่วนการรายงานว่าเพลงจบ สมาชิกทุกคนทำได้ (แต่มีด่านตรวจเวลาด้านล่าง)
    if p_reason = 'SKIPPED' and not public.perm_can_skip(v_role, v_room) then
      raise exception 'FORBIDDEN';
    end if;
  elsif p_reason <> 'ENDED' then
    raise exception 'FORBIDDEN';               -- ระบบข้ามเพลงเองไม่ได้
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ★★ Compare-and-swap
  -- เงื่อนไขนี้คือทั้งหมดที่กันการเปลี่ยนเพลงซ้ำซ้อน
  -- return เฉย ๆ ไม่ raise เพราะ "มีคนทำไปก่อนแล้ว" ไม่ใช่ความผิดพลาด
  if v_pb.queue_item_id is distinct from p_expected_id then
    return v_pb;
  end if;

  if p_expected_id is not null then
    select * into v_current from public.queue_items where id = p_expected_id for update;
  end if;

  -- ★ ด่านกันการยิง /next รัว ๆ เพื่อข้ามเพลงของคนอื่น
  --   เพลงจบจริงต้องเล่นไปแล้วเกือบครบความยาว เผื่อ 5 วินาทีให้ buffer/โฆษณา
  --   (ถ้าอยากข้ามก่อนเวลาต้องใช้ SKIPPED ซึ่งเช็คสิทธิ์ไปแล้วข้างบน)
  if p_reason = 'ENDED' and v_current.id is not null then
    v_elapsed := public.playback_position_now(v_pb);
    if v_elapsed < v_current.duration - 5 then
      raise exception 'PREMATURE_END';
    end if;
  end if;

  -- ปิดเพลงเดิม
  if v_current.id is not null then
    update public.queue_items
    set status   = case when p_reason = 'SKIPPED' then 'SKIPPED'::public.queue_status
                        else 'PLAYED'::public.queue_status end,
        ended_at = now()
    where id = v_current.id;
  end if;

  -- หาเพลงถัดไป — ใช้ queue_items_next_waiting_idx อ่านแถวแรกของ index ตรง ๆ
  select * into v_next
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING'
  order by position asc
  limit 1
  for update skip locked;

  if v_next.id is not null then
    update public.queue_items
    set status = 'PLAYING', started_at = now()
    where id = v_next.id;

    update public.playback_states
    set queue_item_id    = v_next.id,
        video_id         = v_next.video_id,
        is_playing       = true,
        started_at       = now(),
        paused_at        = null,
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  else
    -- คิวหมด — หยุดนิ่ง ไม่ใช่ error
    update public.playback_states
    set queue_item_id    = null,
        video_id         = null,
        is_playing       = false,
        started_at       = null,
        paused_at        = now(),
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ---------------------------------------------------------------------------
-- set_playback — Play / Pause / Seek
-- ---------------------------------------------------------------------------
create or replace function public.set_playback(
  p_room_id  uuid,
  p_actor    uuid,
  p_action   text,
  p_position integer default null
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb       public.playback_states;
  v_room     public.rooms;
  v_role     public.member_role;
  v_item     public.queue_items;
  v_target   integer;
begin
  if p_action not in ('PLAY', 'PAUSE', 'SEEK') then
    raise exception 'VALIDATION_FAILED: unknown action %', p_action;
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null or not public.perm_can_control(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;

  if v_pb.queue_item_id is null then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ไม่มีเพลงให้ควบคุม
  end if;

  select * into v_item from public.queue_items where id = v_pb.queue_item_id;

  if p_action = 'PLAY' then
    if v_pb.is_playing then
      return v_pb;                             -- อยู่ในสถานะที่ขอแล้ว → idempotent
    end if;
    update public.playback_states
    set is_playing = true,
        started_at = now(),                    -- anchor ใหม่ current_position คงเดิม
        paused_at  = null,
        version    = version + 1
    where room_id = p_room_id
    returning * into v_pb;

  elsif p_action = 'PAUSE' then
    if not v_pb.is_playing then
      return v_pb;
    end if;
    update public.playback_states
    set is_playing       = false,
        -- freeze ตำแหน่ง ณ วินาทีนี้ไว้ ไม่งั้นพอ resume จะกระโดด
        current_position = least(
          floor(public.playback_position_now(v_pb))::integer,
          v_item.duration
        ),
        paused_at        = now(),
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;

  else -- SEEK
    if p_position is null or p_position < 0 then
      raise exception 'VALIDATION_FAILED: position required for SEEK';
    end if;

    v_target := least(p_position, v_item.duration);

    update public.playback_states
    set current_position = v_target,
        -- ถ้ากำลังเล่นอยู่ต้องรีเซ็ต anchor ด้วย ไม่งั้นสูตรจะนับเวลาซ้ำ
        started_at       = case when is_playing then now() else started_at end,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ---------------------------------------------------------------------------
-- remove_queue_item — ลบเพลงที่ยังไม่ได้เล่น
-- ---------------------------------------------------------------------------
create or replace function public.remove_queue_item(
  p_room_id uuid,
  p_actor   uuid,
  p_item_id uuid
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_role public.member_role;
  v_item public.queue_items;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_item
  from public.queue_items
  where id = p_item_id and room_id = p_room_id     -- ★ ผูก room_id ด้วยเสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  -- ★ ลบเพลงที่กำลังเล่นอยู่ไม่ได้ ต้องใช้ Skip
  --   ถ้าปล่อยให้ลบได้ playback_states จะชี้ไปที่เพลงที่ถูกลบ
  --   แล้วต้องมี logic กู้สถานะเพิ่มอีกชุด — กันไว้ตั้งแต่ต้นง่ายกว่า
  if v_item.status <> 'WAITING' then
    raise exception 'FORBIDDEN';
  end if;

  -- เจ้าของห้องลบได้ทุกเพลง คนอื่นลบได้เฉพาะเพลงที่ตัวเองเพิ่ม
  if not public.perm_can_manage(v_role, v_room) and v_item.added_by is distinct from p_actor then
    raise exception 'FORBIDDEN';
  end if;

  update public.queue_items
  set status = 'REMOVED', ended_at = now()
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;


-- ---------------------------------------------------------------------------
-- clear_queue — ล้างเพลงที่รออยู่ทั้งหมด (เพลงที่กำลังเล่นไม่ถูกแตะ)
-- ---------------------------------------------------------------------------
create or replace function public.clear_queue(
  p_room_id uuid,
  p_actor   uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_role    public.member_role;
  v_removed integer;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null or not public.perm_can_manage(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  update public.queue_items
  set status = 'REMOVED', ended_at = now()
  where room_id = p_room_id and status = 'WAITING';

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;


-- ===========================================================================
-- ส่วนที่ 4 · Grants
-- ===========================================================================
-- ★★★ ส่วนนี้สำคัญไม่แพ้ตัวฟังก์ชันเอง
--
-- Postgres ให้สิทธิ์ EXECUTE กับ PUBLIC โดยอัตโนมัติเมื่อสร้างฟังก์ชัน
-- ถ้าไม่ revoke ผู้ใช้ที่ถือ anon key จะเรียก RPC เหล่านี้ตรง ๆ ผ่าน PostgREST ได้
-- เช่น supabase.rpc('enqueue_track', { p_actor: '<uuid ของคนอื่น>' , ... })
--
-- ฟังก์ชันพวกนี้เป็น SECURITY DEFINER และรับ p_actor เป็นพารามิเตอร์
-- ซึ่งแปลว่าผู้เรียก "บอกเองได้ว่าตัวเองเป็นใคร" — ปลอดภัยเฉพาะเมื่อผู้เรียก
-- คือ Route Handler ของเราที่อ่าน actor จาก session จริงเท่านั้น
--
-- จึงต้องปิดประตูให้เหลือทางเดียว: service_role
-- ===========================================================================

revoke execute on function
  public.create_room(uuid, text),
  public.join_room(text, uuid),
  public.touch_member(uuid, uuid),
  public.enqueue_track(uuid, uuid, text, text, text, text, integer),
  public.advance_queue(uuid, uuid, uuid, text),
  public.set_playback(uuid, uuid, text, integer),
  public.remove_queue_item(uuid, uuid, uuid),
  public.clear_queue(uuid, uuid),
  public.generate_room_code()
from public, anon, authenticated;

grant execute on function
  public.create_room(uuid, text),
  public.join_room(text, uuid),
  public.touch_member(uuid, uuid),
  public.enqueue_track(uuid, uuid, text, text, text, text, integer),
  public.advance_queue(uuid, uuid, uuid, text),
  public.set_playback(uuid, uuid, text, integer),
  public.remove_queue_item(uuid, uuid, uuid),
  public.clear_queue(uuid, uuid),
  public.generate_room_code()
to service_role;


-- helper ที่ RLS policy ต้องใช้ — ผู้ใช้ที่ login แล้วต้องเรียกได้
-- ปลอดภัยเพราะอ่าน auth.uid() ของตัวเอง ไม่รับ actor จากภายนอก
revoke execute on function
  public.is_room_member(uuid),
  public.my_room_role(uuid)
from public, anon;

grant execute on function
  public.is_room_member(uuid),
  public.my_room_role(uuid)
to authenticated, service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0005_rls_policies.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0005 · Row Level Security
-- ============================================================================
-- แนวคิดหลัก: **Client อ่านผ่าน RLS / เขียนผ่าน Route Handler เท่านั้น**
--
-- ทุกตารางเปิด RLS แต่ "ไม่มี policy สำหรับ INSERT / UPDATE / DELETE เลย"
-- ซึ่งใน Postgres แปลว่าปฏิเสธทั้งหมด (default deny)
--
-- ผลลัพธ์: ต่อให้ anon key รั่วออกไปทั้งก้อน หรือเว็บโดน XSS
-- ผู้โจมตีก็ยังแก้ฐานข้อมูลไม่ได้แม้แต่แถวเดียว ทำได้มากสุดคืออ่านข้อมูลของ
-- ห้องที่ตัวเองเป็นสมาชิกอยู่แล้ว
--
-- RLS ที่นี่จึงทำหน้าที่ 2 อย่างพร้อมกัน:
--   1. กรองสิทธิ์การอ่าน
--   2. ★ เป็นตัวกรองของ Supabase Realtime ไปในตัว
--      Realtime บังคับ RLS ต่อ subscriber ทุกคน แปลว่าคนที่ไม่ใช่สมาชิกห้อง
--      จะไม่ได้รับ payload ของห้องนั้นเลย ไม่ต้องเขียน logic กรองเพิ่มฝั่ง client
-- ============================================================================


alter table public.profiles            enable row level security;
alter table public.rooms               enable row level security;
alter table public.room_members        enable row level security;
alter table public.queue_items         enable row level security;
alter table public.playback_states     enable row level security;


-- ---------------------------------------------------------------------------
-- ล้างสิทธิ์ระดับตารางก่อน แล้วค่อยให้เท่าที่จำเป็น
-- ---------------------------------------------------------------------------
-- ★ RLS ทำงานก็ต่อเมื่อ role นั้นมีสิทธิ์ระดับตารางก่อน
--   ถ้าไม่ revoke ไว้ INSERT/UPDATE/DELETE จะ "ถูกอนุญาตระดับตาราง" แล้วไปตกที่
--   RLS อีกชั้น ซึ่งก็ปฏิเสธอยู่ดี — แต่การปิดสองชั้นทำให้ความตั้งใจชัดเจน
--   และกันกรณีที่มีใครเผลอเพิ่ม policy หลวม ๆ ในอนาคต
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.rooms, public.room_members,
              public.queue_items, public.playback_states
  from anon, authenticated;

-- anon = ยังไม่ได้ sign in แม้แต่แบบ anonymous → อ่านอะไรไม่ได้เลย
-- ทุกคนต้องผ่าน supabase.auth.signInAnonymously() ก่อนเสมอ
grant select on public.profiles, public.rooms, public.room_members,
                public.queue_items, public.playback_states
  to authenticated;

-- ผู้ใช้แก้ชื่อเล่น/รูปตัวเองได้โดยตรง ไม่ต้องผ่าน API
-- (เป็นข้อมูลของตัวเอง ไม่กระทบใคร และไม่มีเงื่อนไขสิทธิ์ที่ซับซ้อน)
grant update (display_name, avatar_url) on public.profiles to authenticated;


-- ===========================================================================
-- profiles
-- ===========================================================================

-- เห็น profile ของตัวเอง และของคนที่อยู่ห้องเดียวกัน (ต้องแสดงว่าใครเพิ่มเพลง)
-- ★ ไม่ใช่ทุกคนในระบบ — ไม่มีเหตุผลที่ผู้ใช้ห้อง A ต้องเห็นรายชื่อคนในห้อง B
drop policy if exists "profiles: read self or co-member" on public.profiles;
create policy "profiles: read self or co-member"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.room_members me
    join public.room_members them on them.room_id = me.room_id
    where me.user_id = (select auth.uid())
      and them.user_id = public.profiles.id
  )
);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));


-- ===========================================================================
-- rooms
-- ===========================================================================

-- ★ ไม่มี policy แบบ "ค้นห้องด้วย code ได้" โดยเจตนา
--   การเข้าห้องทำผ่าน POST /api/rooms/[code]/join ที่ใช้ service role
--   ถ้าเปิดให้ client query ด้วย code ได้ จะกลายเป็นช่องให้ยิงเดารหัสห้องรัว ๆ
--   โดยไม่ผ่าน rate limit ของเรา
drop policy if exists "rooms: members read" on public.rooms;
create policy "rooms: members read"
on public.rooms for select to authenticated
using (public.is_room_member(id));


-- ===========================================================================
-- room_members
-- ===========================================================================

drop policy if exists "room_members: members read" on public.room_members;
create policy "room_members: members read"
on public.room_members for select to authenticated
using (public.is_room_member(room_id));


-- ===========================================================================
-- queue_items
-- ===========================================================================

-- policy เดียวนี้คุมทั้งการอ่านคิว และการรับ realtime event ของคิว
drop policy if exists "queue_items: members read" on public.queue_items;
create policy "queue_items: members read"
on public.queue_items for select to authenticated
using (public.is_room_member(room_id));


-- ===========================================================================
-- playback_states
-- ===========================================================================

drop policy if exists "playback_states: members read" on public.playback_states;
create policy "playback_states: members read"
on public.playback_states for select to authenticated
using (public.is_room_member(room_id));


-- ===========================================================================
-- ตรวจสอบตัวเอง: ต้องไม่มี policy ไหนที่เป็น USING (true)
-- ===========================================================================
-- รันตอน migrate เพื่อกันคนเผลอเพิ่ม policy หลวมในอนาคต
-- ถ้ามีเมื่อไหร่ migration จะล้มทันที ไม่ปล่อยผ่านขึ้น production
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ')
  into v_bad
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');

  if v_bad is not null then
    raise exception 'พบ RLS policy ที่เปิดกว้างเกินไป (USING true): %', v_bad;
  end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- 0006_realtime_publication.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0006 · Realtime Publication
-- ============================================================================
-- Supabase Realtime อ่านจาก WAL ผ่าน publication ชื่อ supabase_realtime
-- ตารางที่ไม่ได้อยู่ใน publication จะไม่ส่ง event ออกมาเลย
-- ============================================================================

-- ปลอดภัยเมื่อรันซ้ำ: ถ้า publication ยังไม่มีให้สร้างเปล่า ๆ ก่อน
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

do $$
begin
  -- queue_items: เพิ่มเพลง / ลบเพลง / เปลี่ยนสถานะ
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_items'
  ) then
    alter publication supabase_realtime add table public.queue_items;
  end if;

  -- playback_states: เปลี่ยนเพลง / play / pause / seek — ทุก event ของ player
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playback_states'
  ) then
    alter publication supabase_realtime add table public.playback_states;
  end if;

  -- rooms: เปลี่ยนชื่อห้อง / ล็อกคิว / เปลี่ยนสิทธิ์
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  -- room_members: คนเข้า/ออกห้องแบบถาวร
  -- (สถานะออนไลน์ "ตอนนี้" ใช้ presence ไม่ใช่ตารางนี้ — presence เป็นของชั่วคราว
  --  ที่เขียนลง DB ไม่ได้เพราะจะเกิด write ถี่มากและค้างเมื่อ tab ถูกปิดกะทันหัน)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- ★ ตั้งใจไม่ใช้ REPLICA IDENTITY FULL
-- ---------------------------------------------------------------------------
-- FULL จะทำให้ WAL บรรจุค่าเดิมของ "ทุกคอลัมน์" ในทุก UPDATE/DELETE
-- ซึ่งทำให้ปริมาณ WAL และ bandwidth ของ Realtime บวมขึ้นมากตลอดเวลา
--
-- เราไม่ต้องการมันเพราะ:
--   • การลบเพลงเป็น soft delete (status = 'REMOVED') จึงเป็น UPDATE
--     ซึ่งส่งค่าใหม่ครบอยู่แล้ว
--   • ไม่มี logic ไหนฝั่ง client ที่ต้องรู้ "ค่าเก่า" ของแถว
--     เพราะ state ทั้งหมดคำนวณจากค่าใหม่ + version เท่านั้น
--
-- ค่า default (REPLICA IDENTITY DEFAULT = primary key) จึงเพียงพอ
-- ---------------------------------------------------------------------------


-- ══════════════════════════════════════════════════════════════════════
-- 0007_cache_ratelimit.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0007 · YouTube Cache · Rate Limit · Janitor
-- ============================================================================
-- ตารางในไฟล์นี้ไม่มีเจ้าของเป็นผู้ใช้คนไหน — เป็นโครงสร้างพื้นฐานของ server
-- จึงเปิด RLS แล้วไม่ให้ policy ใด ๆ เลย (เข้าถึงได้เฉพาะ service_role)
-- ============================================================================


-- ===========================================================================
-- youtube_search_cache
-- ===========================================================================
-- ★ นี่คือมาตรการที่สำคัญที่สุดเรื่อง quota
--
--   search.list = 100 units จาก quota เริ่มต้น 10,000/วัน
--   → ค้นหาได้แค่ ~98 ครั้งต่อวัน "ทั้งระบบ" ถ้าไม่ cache
--
--   cache ตัวนี้ใช้ร่วมกันทุกห้องทุกผู้ใช้ — คนที่ค้น "bohemian rhapsody"
--   เป็นคนที่ 2 ของวันไม่เสีย quota เลย
-- ===========================================================================
create table if not exists public.youtube_search_cache (
  -- คำค้นที่ normalize แล้ว: lowercase + trim + ยุบ whitespace ติดกัน
  -- ทำให้ "  Bohemian   RHAPSODY " กับ "bohemian rhapsody" ใช้ cache ร่วมกัน
  query_key   text not null,
  -- ผลหน้าถัด ๆ ไปของคำค้นเดียวกันต้องแยก cache (pageToken ต่างกัน)
  -- ใช้ '' แทน null เพื่อให้เป็นส่วนหนึ่งของ primary key ได้
  page_token  text not null default '',
  results     jsonb not null,
  fetched_at  timestamptz not null default now(),

  primary key (query_key, page_token)
);

-- ใช้กวาด cache เก่าทิ้ง
create index if not exists youtube_search_cache_fetched_idx
  on public.youtube_search_cache (fetched_at);


-- ===========================================================================
-- youtube_videos — metadata ราย video
-- ===========================================================================
-- videos.list ราคา 1 unit ต่อครั้ง (ได้สูงสุด 50 id) ถูกกว่า search 100 เท่า
--
-- ใช้ 2 ทาง:
--   1. เติม duration + สถานะ embed ให้ผลค้นหา (search.list ไม่คืน duration มา)
--   2. เวลาผู้ใช้วางลิงก์ YouTube ตรง ๆ → ดึงจาก cache ก่อน ถ้ามีก็ไม่เสีย quota เลย
-- ===========================================================================
create table if not exists public.youtube_videos (
  video_id      text primary key
                constraint youtube_videos_id_format
                check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title         text not null,
  channel_title text,
  thumbnail_url text,
  duration      integer not null check (duration >= 0),
  -- false = เจ้าของปิด embed หรือติดข้อจำกัดลิขสิทธิ์ → ห้ามให้เข้าคิว
  embeddable    boolean not null default true,
  -- เก็บไว้เพื่ออธิบายให้ผู้ใช้ว่าทำไมเพลงนี้เพิ่มไม่ได้
  unavailable_reason text,
  fetched_at    timestamptz not null default now()
);

create index if not exists youtube_videos_fetched_idx on public.youtube_videos (fetched_at);


-- ===========================================================================
-- rate_limits — ตัวนับแบบ fixed window
-- ===========================================================================
-- เลือกทำใน Postgres แทนที่จะพึ่ง service ภายนอก (Upstash ฯลฯ) เพราะ:
--   • ไม่เพิ่ม dependency และไม่เพิ่ม secret ที่ต้องดูแล
--   • upsert ของ Postgres เป็น atomic อยู่แล้ว จึงนับถูกต้องแม้มี request พร้อมกัน
--   • เราต่อ Postgres อยู่แล้วทุก request — ไม่มี network hop เพิ่ม
-- ===========================================================================
create table if not exists public.rate_limits (
  bucket_key   text not null,          -- 'search:<user_id>' | 'youtube:quota:2026-09-24'
  window_start timestamptz not null,
  counter      integer not null default 0,
  primary key (bucket_key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);


-- ===========================================================================
-- RLS: เปิดแต่ไม่ให้ policy ใด ๆ = ปฏิเสธทุกอย่างสำหรับ anon/authenticated
-- ===========================================================================
alter table public.youtube_search_cache enable row level security;
alter table public.youtube_videos       enable row level security;
alter table public.rate_limits          enable row level security;

revoke all on public.youtube_search_cache, public.youtube_videos, public.rate_limits
  from anon, authenticated;


-- ===========================================================================
-- consume_rate_limit — นับและตัดสินในคำสั่งเดียว
-- ===========================================================================
-- ★ ทำไมต้องเป็นฟังก์ชันเดียว ไม่ใช่ "อ่านแล้วค่อยเขียน"
--   ถ้าแยกสองขั้นตอน จะมีช่องให้ 10 request พร้อมกันอ่านค่าเดิมได้ทั้งหมด
--   แล้วผ่านด่านไปหมดทุกตัว — ซึ่งทำให้ rate limit ไม่มีความหมาย
--
--   upsert + returning ทำให้การนับกับการตัดสินอยู่ในคำสั่ง atomic เดียวกัน
--
-- p_cost > 1 ใช้กับ quota ของ YouTube ที่ search.list = 100 units
-- ===========================================================================
create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer,
  p_cost           integer default 1
)
returns table (allowed boolean, used integer, limit_value integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  if p_cost > p_limit then
    -- ขอมากกว่าเพดานทั้งหมด — เป็นไปไม่ได้ตั้งแต่ต้น ไม่ต้องไปแตะตัวนับ
    return query select false, 0, p_limit, now();
    return;
  end if;

  -- ปัดเวลาลงเป็นช่วงหน้าต่าง เช่น window 60 วิ → 10:00:00, 10:01:00, ...
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (bucket_key, window_start, counter)
  values (p_bucket, v_window, p_cost)
  on conflict (bucket_key, window_start)
  do update set counter = rl.counter + p_cost
  -- ★ where ตรงนี้คือด่านจริง: ถ้าเกินเพดานแล้ว UPDATE จะไม่เกิดขึ้น
  --   ตัวนับจึงไม่ถูกบวกเพิ่ม และเราไม่ได้แถวกลับมา
  where rl.counter + p_cost <= p_limit
  returning rl.counter into v_count;

  if v_count is null then
    select rl.counter into v_count
    from public.rate_limits rl
    where rl.bucket_key = p_bucket and rl.window_start = v_window;

    return query select
      false,
      coalesce(v_count, 0),
      p_limit,
      v_window + make_interval(secs => p_window_seconds);
    return;
  end if;

  return query select
    true,
    v_count,
    p_limit,
    v_window + make_interval(secs => p_window_seconds);
end;
$$;


-- ===========================================================================
-- reconcile_stale_playback — janitor
-- ===========================================================================
-- ปัญหาที่แก้: เพลงจบแล้วแต่ไม่มีใครรายงาน
--
--   • ทุกคนปิด tab พร้อมกันกลางเพลง
--   • คนสุดท้ายในห้องเน็ตหลุด
--   • ทุก client ได้ ENDED แต่ request หายระหว่างทาง
--
-- ถ้าไม่มีตัวนี้ ห้องจะค้างอยู่ที่เพลงเดิมตลอดไป และคนที่เข้ามาใหม่จะเห็นเพลงที่
-- "เล่นอยู่" มาแล้ว 3 ชั่วโมง
--
-- เรียกจาก Vercel Cron ทุก 1 นาที (ตั้งใน Phase 7)
-- ★ ไม่ใช่การ polling เพื่อ sync — ไม่มี client เกี่ยวข้อง เป็นงานบ้านฝั่ง server ล้วน
-- ===========================================================================
create or replace function public.reconcile_stale_playback(
  p_grace_seconds integer default 20
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     record;
  v_advanced integer := 0;
begin
  for v_row in
    select pb.room_id, pb.queue_item_id
    from public.playback_states pb
    join public.queue_items qi on qi.id = pb.queue_item_id
    where pb.is_playing
      and pb.started_at is not null
      and now() > pb.started_at
                  + make_interval(secs =>
                      greatest(qi.duration - pb.current_position, 0) + p_grace_seconds
                    )
  loop
    -- p_actor = null → เรียกในฐานะระบบ (advance_queue อนุญาตเฉพาะ reason ENDED)
    -- CAS ข้างในยังทำงานปกติ ถ้ามี client ชิงเปลี่ยนไปก่อนก็จะกลายเป็น no-op
    perform public.advance_queue(v_row.room_id, null, v_row.queue_item_id, 'ENDED');
    v_advanced := v_advanced + 1;
  end loop;

  return v_advanced;
end;
$$;


-- ===========================================================================
-- prune_ephemeral — ลบข้อมูลชั่วคราวที่หมดอายุ
-- ===========================================================================
create or replace function public.prune_ephemeral(
  p_search_cache_hours integer default 24,
  p_video_cache_days   integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  delete from public.youtube_search_cache
  where fetched_at < now() - make_interval(hours => p_search_cache_hours);
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.youtube_videos
  where fetched_at < now() - make_interval(days => p_video_cache_days);
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- เก็บ 2 วันพอ — หน้าต่างที่ยาวที่สุดที่เราใช้คือ quota รายวัน
  delete from public.rate_limits
  where window_start < now() - interval '2 days';
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end;
$$;


-- ===========================================================================
-- Grants — server เท่านั้น เหมือนใน 0004
-- ===========================================================================
revoke execute on function
  public.consume_rate_limit(text, integer, integer, integer),
  public.reconcile_stale_playback(integer),
  public.prune_ephemeral(integer, integer),
  public.playback_position_now(public.playback_states),
  public.room_lock_key(uuid),
  public.perm_can_add(public.member_role, public.rooms),
  public.perm_can_skip(public.member_role, public.rooms),
  public.perm_can_control(public.member_role, public.rooms),
  public.perm_can_manage(public.member_role, public.rooms)
from public, anon, authenticated;

grant execute on function
  public.consume_rate_limit(text, integer, integer, integer),
  public.reconcile_stale_playback(integer),
  public.prune_ephemeral(integer, integer),
  public.playback_position_now(public.playback_states),
  public.room_lock_key(uuid),
  public.perm_can_add(public.member_role, public.rooms),
  public.perm_can_skip(public.member_role, public.rooms),
  public.perm_can_control(public.member_role, public.rooms),
  public.perm_can_manage(public.member_role, public.rooms)
to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0008_server_time.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0008 · นาฬิกาอ้างอิงของระบบ
-- ============================================================================
-- ★ ทำไมต้องมีฟังก์ชันนี้ ทั้งที่ Node ก็มี Date.now()
--
--   `started_at` ของทุกเพลงเขียนด้วย now() ของ **Postgres**
--   ถ้า /api/time ตอบด้วยเวลาของ **Node บน Vercel** เราจะเอาเวลาจากนาฬิกา
--   สองเรือนมาลบกัน ซึ่งผิดตั้งแต่ตั้งโจทย์
--
--   ปกติทั้งสองเครื่อง sync NTP อยู่แล้ว ต่างกันไม่กี่มิลลิวินาที
--   แต่ "ปกติ" ไม่ใช่ "เสมอ" — เครื่องที่นาฬิกาเพี้ยนไปครึ่งวินาที
--   จะทำให้ทุกคนในห้องฟังเหลื่อมกันโดยที่ไม่มีใครหาสาเหตุเจอ
--   เพราะโค้ดทุกบรรทัดดู "ถูก" หมด
--
--   ค่าใช้จ่ายของการตัดปัญหานี้ทิ้งคือ query ที่ถูกที่สุดเท่าที่จะเป็นไปได้
--   หนึ่งครั้งตอนเปิดห้องและตอน reconnect — คุ้มมาก
-- ============================================================================

create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated, service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0009_play_queue_item.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0009 · กระโดดไปเล่นเพลงที่เลือกในคิว
-- ============================================================================
-- พฤติกรรมแบบ playlist ของ YouTube: กดเพลงไหนในรายการก็เล่นเพลงนั้นทันที
--
-- ★ ทำไมต้องเป็น RPC ไม่ใช่ UPDATE หลายคำสั่งจาก Route Handler
--
--   การกระโดดต้องแก้ 3 อย่างพร้อมกัน:
--     1. เพลงที่เล่นอยู่ → SKIPPED
--     2. เพลงเป้าหมาย   → PLAYING
--     3. playback_states → ชี้ไปเพลงใหม่ + รีเซ็ต anchor
--
--   ถ้าทำแยกกันผ่าน PostgREST จะไม่มีทรานแซกชันครอบ
--   สองคนกดคนละเพลงพร้อมกันจะได้สถานะพังกลางทาง เช่นไม่มีเพลงไหนเป็น PLAYING เลย
--   หรือ playback ชี้ไปเพลงที่ยัง WAITING อยู่
--
--   (ถ้าโชคดี partial unique index queue_items_one_playing_idx จะช่วยจับได้
--    แต่การหวังให้ข้อผิดพลาดถูกจับโดยบังเอิญ ไม่ใช่การออกแบบ)
-- ============================================================================

create or replace function public.play_queue_item(
  p_room_id uuid,
  p_actor   uuid,
  p_item_id uuid
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_role    public.member_role;
  v_pb      public.playback_states;
  v_target  public.queue_items;
begin
  -- key เดียวกับ enqueue_track / advance_queue → กันกันเองได้ทุกคู่
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  -- ★ ใช้เกณฑ์เดียวกับการข้ามเพลง
  --   การกระโดดเปลี่ยนสิ่งที่ "ทุกคนในห้อง" ได้ยิน ไม่ต่างจากกด Skip
  --   จึงไม่ควรใช้เกณฑ์ที่หลวมกว่ากัน
  if v_role is null or not public.perm_can_skip(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_target
  from public.queue_items
  where id = p_item_id and room_id = p_room_id   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;

  -- กดเพลงที่กำลังเล่นอยู่ → ไม่ต้องทำอะไร (idempotent)
  if v_pb.queue_item_id = p_item_id then
    return v_pb;
  end if;

  if v_target.status <> 'WAITING' then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- เล่นจบ/ถูกลบไปแล้ว
  end if;

  -- ★ เพลงที่ถูกข้ามไปตอนกระโดด ไม่ถูกลบทิ้ง
  --   เพลงที่อยู่ก่อนหน้าเป้าหมายยังเป็น WAITING อยู่เหมือนเดิม
  --   พอเพลงที่เลือกจบ คิวจะเดินต่อจากเพลงที่ position น้อยที่สุดที่ยังรออยู่
  --   = "ดึงเพลงขึ้นมาเล่นก่อน" ไม่ใช่ "ทิ้งทุกอย่างที่ค้างไว้"
  if v_pb.queue_item_id is not null then
    update public.queue_items
    set status = 'SKIPPED', ended_at = now()
    where id = v_pb.queue_item_id;
  end if;

  update public.queue_items
  set status = 'PLAYING', started_at = now()
  where id = p_item_id;

  update public.playback_states
  set queue_item_id    = p_item_id,
      video_id         = v_target.video_id,
      is_playing       = true,
      started_at       = now(),
      paused_at        = null,
      current_position = 0,
      version          = version + 1
  where room_id = p_room_id
  returning * into v_pb;

  return v_pb;
end;
$$;

-- เหตุผลของ grant ชุดนี้อยู่ใน 0004 — โดยย่อ: ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
-- ผู้เรียกจึง "บอกเองได้ว่าตัวเองเป็นใคร" ปลอดภัยเฉพาะเมื่อผู้เรียกคือ server เรา
revoke execute on function public.play_queue_item(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.play_queue_item(uuid, uuid, uuid)
  to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0010_ownership_handover.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0010 · ยกตำแหน่งเจ้าของห้องเมื่อเจ้าของเดิมหายไปนาน
-- ============================================================================
-- ★ ปัญหาที่แก้ (เจอจากการใช้งานจริง)
--
--   perm_can_skip / perm_can_control ให้สิทธิ์ MEMBER ตาม allow_member_skip
--   และ allow_member_control ซึ่ง **ค่าเริ่มต้นเป็น false ทั้งคู่**
--
--   พอเจ้าของห้องปิดจอไป ห้องที่ยังมีคนฟังอยู่ 4 คนจะค้างทันที —
--   กดหยุดไม่ได้ กดข้ามไม่ได้ เพลงที่เล่นไม่ได้ก็ต้องทนฟังจนจบ
--   ไม่มีทางแก้จากในแอปเลยนอกจากสร้างห้องใหม่ทั้งหมด
--
-- ★★ ทำไมต้องพึ่ง last_seen_at ไม่ใช่ presence
--
--    presence ของ Realtime เป็นข้อมูลฝั่ง client ที่ browser ประกาศเอง
--    server มองไม่เห็นและตรวจสอบไม่ได้ ถ้าเอามาตัดสิน "สิทธิ์"
--    คนที่แก้ payload เป็นก็ประกาศได้ว่าเจ้าของห้องหายไปแล้ว
--
--    last_seen_at อยู่ในฐานข้อมูล เขียนโดย server เท่านั้น จากคำขอที่ผ่าน
--    การยืนยันตัวตนมาแล้ว — จึงเป็นหลักฐานเดียวที่เชื่อถือได้ว่าใครยังอยู่
--
--    ★ คอลัมน์นี้มีมาตั้งแต่ 0002 พร้อมคอมเมนต์ว่าจะใช้ตอนเจ้าของไม่อยู่
--      แต่ไม่เคยมีใครเขียนค่าลงไปเลยนอกจากตอนกดเข้าห้องครั้งแรก
--      ไฟล์นี้จึงทำให้มัน "เดิน" จริงเป็นครั้งแรก
-- ============================================================================


-- ---------------------------------------------------------------------------
-- room_heartbeat — ต่ออายุตัวเอง + โอนตำแหน่งถ้าถึงเวลา
-- ---------------------------------------------------------------------------
-- ★ ทำไมรวมสองเรื่องไว้ในฟังก์ชันเดียว
--
--   ถูกเรียกจาก GET /api/rooms/[code] ซึ่งเป็น request ที่เกิดบ่อยที่สุด
--   (เปิดห้อง · reconnect · กลับมาที่ tab · ตาข่ายกันพลาดทุก 45 วิ)
--   แยกเป็นสอง RPC = เพิ่ม round trip ให้ทุกครั้งที่มีคนเปิดห้องดู
--
--   และสองเรื่องนี้ต้องเกิดตามลำดับในทรานแซกชันเดียวกันด้วย:
--   ต้องต่ออายุตัวเองก่อน ไม่งั้นคนที่กำลังเรียกอยู่จะถูกนับว่า "ไม่อยู่"
--   แล้วกลายเป็นผู้สืบทอดที่ไม่มีสิทธิ์ตามเกณฑ์ของตัวเอง
--
-- คืนค่า: user_id ของเจ้าของห้อง ณ ตอนจบ (อาจเป็นคนเดิมหรือคนใหม่)
-- ---------------------------------------------------------------------------
create or replace function public.room_heartbeat(
  p_room_id            uuid,
  p_actor              uuid,
  -- เจ้าของเงียบเกินเท่านี้ถือว่าออกจากห้องแล้ว
  -- ★ 5 นาที ไม่ใช่ 1 นาที เพราะ heartbeat เดินเฉพาะแท็บที่เปิดดูอยู่
  --   คนที่สลับไปตอบแชทแป๊บหนึ่งต้องไม่เสียตำแหน่ง
  p_owner_away_seconds integer default 300,
  -- ผู้สืบทอดต้องเพิ่งเคลื่อนไหวภายในเท่านี้ (heartbeat เดินทุก 45 วิ)
  p_active_seconds     integer default 150
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.rooms;
  v_owner public.room_members;
  v_next  public.room_members;
begin
  -- ── 1 · ต่ออายุตัวเอง (และยืนยันไปในตัวว่าเป็นสมาชิกจริง) ────────────
  update public.room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = p_actor;

  if not found then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ── 2 · ทางลัด: เจ้าของยังเคลื่อนไหวอยู่ → จบเลย ไม่ต้องแตะ lock ──────
  --    เป็นเส้นทางที่เกิดแทบทุกครั้ง จึงต้องถูกที่สุด
  select * into v_owner
  from public.room_members
  where room_id = p_room_id and role = 'OWNER';

  if found and v_owner.last_seen_at > now() - make_interval(secs => p_owner_away_seconds) then
    return v_owner.user_id;
  end if;

  -- ── 3 · ถึงตรงนี้แปลว่าน่าจะต้องโอน — เข้าคิวก่อน ────────────────────
  -- key เดียวกับทุกฟังก์ชันที่แก้ห้อง (ดู 0004) จึงกันกันเองได้ทุกคู่
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  -- ★ อ่านซ้ำหลังถือ lock เสมอ
  --   ระหว่างที่รอคิว อาจมีคนอื่นโอนไปแล้ว หรือเจ้าของเพิ่งกลับมาพอดี
  --   ถ้าเชื่อค่าที่อ่านก่อน lock จะโอนซ้ำหรือโอนทั้งที่ไม่ควรโอน
  select * into v_owner
  from public.room_members
  where room_id = p_room_id and role = 'OWNER'
  for update;

  if found and v_owner.last_seen_at > now() - make_interval(secs => p_owner_away_seconds) then
    return v_owner.user_id;
  end if;

  -- ── 4 · เลือกผู้สืบทอด ───────────────────────────────────────────────
  -- เกณฑ์: ยังเคลื่อนไหวอยู่ + เข้าห้องก่อนใครเพื่อน
  --
  -- ★ ต้องเป็นเกณฑ์ที่ให้คำตอบเดียวกันเสมอไม่ว่าใครเป็นคนเรียก
  --   จึงตัดสินด้วย user_id เมื่อ joined_at เท่ากัน (เช่นสองคนเข้าพร้อมกัน)
  select * into v_next
  from public.room_members
  where room_id = p_room_id
    and role <> 'OWNER'
    and last_seen_at > now() - make_interval(secs => p_active_seconds)
  order by joined_at asc, user_id asc
  limit 1
  for update;

  if not found then
    -- ห้องร้างจริง ๆ ไม่มีใครรับช่วงต่อ — ปล่อยไว้อย่างนั้น
    -- ★ ไม่ทำให้ห้อง "ไม่มีเจ้าของ" เพราะสถานะนั้นไม่มีใครดูแลคิวได้เลย
    return coalesce(v_owner.user_id, v_room.owner_id);
  end if;

  -- ── 5 · โอน ──────────────────────────────────────────────────────────
  -- ★ ต้องปลดคนเดิมก่อนตั้งคนใหม่
  --   room_members_single_owner_idx (0003) เป็น unique partial index
  --   ที่ตรวจทุกคำสั่ง ไม่ใช่ตอน commit — สลับลำดับแล้วจะชนทันที
  if v_owner.id is not null then
    update public.room_members set role = 'MEMBER' where id = v_owner.id;
  end if;

  update public.room_members set role = 'OWNER' where id = v_next.id;

  -- rooms.owner_id ต้องตามไปด้วย เพราะ UI ใช้ค่านี้ตัดสินว่าใครคือเจ้าของ
  -- และ resolveLeaderId() ฝั่ง client ก็อ่านจากตรงนี้
  update public.rooms set owner_id = v_next.user_id where id = p_room_id;

  return v_next.user_id;
end;
$$;


-- เหตุผลของ grant ชุดนี้อยู่ใน 0004 — ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
-- ผู้เรียกจึง "บอกเองได้ว่าตัวเองเป็นใคร" ปลอดภัยเฉพาะเมื่อผู้เรียกคือ server เรา
revoke execute on function public.room_heartbeat(uuid, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.room_heartbeat(uuid, uuid, integer, integer)
  to service_role;


-- ---------------------------------------------------------------------------
-- ★★ ให้ทุกคนที่อยู่ในระบบตอนนี้ได้เวลาตั้งหลักหนึ่งรอบ
-- ---------------------------------------------------------------------------
-- ก่อนไฟล์นี้ last_seen_at ถูกเขียนแค่ตอนกดเข้าห้องครั้งแรกเท่านั้น
-- ห้องที่เปิดมาตั้งแต่เมื่อวานจึงมีค่าเก่าค้างอยู่ทั้งห้อง รวมทั้งเจ้าของที่
-- กำลังนั่งฟังอยู่จริง ๆ
--
-- ถ้าไม่รีเซ็ต พอ deploy เสร็จ heartbeat ตัวแรกที่วิ่งเข้ามาจะเห็นว่า
-- "เจ้าของเงียบมา 12 ชั่วโมง" แล้วยึดตำแหน่งไปจากคนที่ยังอยู่ทันที
--
-- ตั้งเป็น now() ทั้งหมดเท่ากับให้เวลาตั้งหลัก 5 นาที ซึ่งนานพอให้แท็บที่
-- เปิดอยู่จริงส่ง heartbeat รอบแรกเข้ามา (เดินทุก 45 วิ)
-- ---------------------------------------------------------------------------
update public.room_members set last_seen_at = now();


-- ══════════════════════════════════════════════════════════════════════
-- 0011_transfer_ownership.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0011 · โอนตำแหน่งเจ้าของห้องด้วยมือ
-- ============================================================================
-- 0010 โอนให้อัตโนมัติเมื่อเจ้าของหายไป 5 นาที — ครอบคลุมกรณี "หายไปแล้ว"
-- ไฟล์นี้ครอบคลุมกรณี "กำลังจะไป": เจ้าของเลือกเองว่าจะยกให้ใครก่อนออกจากห้อง
--
-- ★ ทำไมต้องมีทั้งสองแบบ
--
--   อัตโนมัติ = ตาข่ายกันห้องค้าง ทำงานตอนไม่มีใครทันตั้งตัว
--               แต่ต้องรอ 5 นาที และเลือกให้ไม่ได้
--
--   ด้วยมือ   = เจตนาชัดเจน เกิดทันที และเจ้าของเลือกคนที่ไว้ใจได้เอง
--
--   สองอันนี้ใช้เส้นทางเดียวกันตอนเขียนข้อมูล (ปลดคนเดิม → ตั้งคนใหม่ →
--   อัปเดต rooms.owner_id) ต่างกันแค่เงื่อนไขว่าใครมีสิทธิ์สั่ง
-- ============================================================================

create or replace function public.transfer_ownership(
  p_room_id uuid,
  p_actor   uuid,
  p_target  uuid
)
returns public.room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.rooms;
  v_actor  public.room_members;
  v_target public.room_members;
begin
  -- key เดียวกับ room_heartbeat และทุกฟังก์ชันที่แก้ห้อง (ดู 0004)
  -- ★ จำเป็นจริง: ถ้าเจ้าของกดโอนพอดีกับจังหวะที่ heartbeat กำลังโอนอัตโนมัติ
  --   สองทางนี้จะเขียนทับกันจนเหลือ OWNER สองคนหรือศูนย์คน
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_actor
  from public.room_members
  where room_id = p_room_id and user_id = p_actor
  for update;

  -- ★ ตรวจ role จากฐานข้อมูล ไม่ใช่เชื่อว่า caller ตรวจมาแล้ว
  --   (ฟังก์ชันนี้เป็น SECURITY DEFINER — มีอำนาจเต็ม)
  if not found or v_actor.role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  -- โอนให้ตัวเอง = ไม่ต้องทำอะไร ไม่ใช่ความผิดพลาด
  if p_target = p_actor then
    return v_actor;
  end if;

  select * into v_target
  from public.room_members
  where room_id = p_room_id and user_id = p_target   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- ★ ปลดคนเดิมก่อนตั้งคนใหม่เสมอ
  --   room_members_single_owner_idx (0003) เป็น unique partial index
  --   ที่ตรวจทุกคำสั่ง ไม่ใช่ตอน commit — สลับลำดับแล้วชนทันที
  update public.room_members set role = 'MEMBER' where id = v_actor.id;

  update public.room_members
  set role = 'OWNER',
      -- ★ ต่ออายุให้คนที่เพิ่งรับตำแหน่ง
      --   ไม่งั้นถ้า last_seen_at ของเขาเก่ากว่า 5 นาทีอยู่แล้ว
      --   heartbeat ตัวถัดไปจะโอนต่อทันทีเป็นทอด ๆ
      last_seen_at = now()
  where id = v_target.id
  returning * into v_target;

  update public.rooms set owner_id = p_target where id = p_room_id;

  return v_target;
end;
$$;


-- เหตุผลของ grant ชุดนี้อยู่ใน 0004 — ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
-- ผู้เรียกจึง "บอกเองได้ว่าตัวเองเป็นใคร" ปลอดภัยเฉพาะเมื่อผู้เรียกคือ server เรา
revoke execute on function public.transfer_ownership(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.transfer_ownership(uuid, uuid, uuid)
  to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0012_open_permissions.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 0012 · เปิดสิทธิ์ให้ทุกคนในห้องทำได้เท่ากัน
-- ============================================================================
-- ★ เปลี่ยนนโยบาย ไม่ใช่เปลี่ยนกลไก
--
--   ดีไซน์เดิม (ข้อตัดสินใจ #2 ใน ARCHITECTURE.md) ให้ OWNER คุม play/pause/skip
--   คนเดียว โดยมี allow_member_skip / allow_member_control ไว้เปิดทีหลัง
--
--   ใช้งานจริงแล้วพบว่าแนวคิดนั้นไม่เข้ากับสิ่งที่ห้องนี้เป็น:
--   ห้องฟังเพลงด้วยกันกับเพื่อน ไม่ใช่เวทีที่มีคนคุมคนเดียว
--   การต้องรอเจ้าของห้องกดข้ามเพลงที่ไม่มีใครอยากฟังคือความรำคาญ ไม่ใช่ความปลอดภัย
--
-- ★★ เส้นแบ่งที่ยังอยู่ (และต้องอยู่ต่อไป)
--
--   "ทุกคน" ในที่นี้แปลว่า **ทุกคนที่อยู่ในห้องนี้** เท่านั้น
--   ไม่ใช่ทุกคนบนอินเทอร์เน็ต
--
--   RPC ทุกตัวยังเช็ค `v_role is null → FORBIDDEN` เป็นด่านแรกเหมือนเดิม
--   คนที่ไม่ได้กดเข้าห้องยังทำอะไรไม่ได้สักอย่าง — ไฟล์นี้ไม่ได้แตะตรงนั้น
--
--   และ RLS ยังปฏิเสธการเขียนตรงจาก client ทุกกรณีเหมือนเดิม
--   ทุกการกระทำยังต้องผ่าน Route Handler ที่ยืนยันตัวตนแล้ว
--
-- ★ กลับไปแบบเดิมยังไง
--   แก้แค่ 4 ฟังก์ชันในไฟล์นี้ให้กลับไปอ่าน p_room.allow_* เหมือน 0004
--   คอลัมน์ allow_member_skip / allow_member_control / allow_guest_add
--   ยังอยู่ครบในตาราง rooms ไม่ได้ถูกลบ — ตั้งใจเก็บไว้ให้ย้อนกลับได้
-- ============================================================================


-- ---------------------------------------------------------------------------
-- เพิ่มเพลง — ทุกคนในห้อง (ยกเว้นห้องถูกล็อก)
-- ---------------------------------------------------------------------------
-- ★ is_locked ยังทำงานเหมือนเดิม เพราะเป็น "สถานะของห้อง" ไม่ใช่ "สิทธิ์ของคน"
--   เจ้าของห้องที่อยากหยุดรับเพลงชั่วคราวยังทำได้อยู่
create or replace function public.perm_can_add(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select not p_room.is_locked;
$$;


-- ---------------------------------------------------------------------------
-- ข้ามเพลง — ทุกคนในห้อง
-- ---------------------------------------------------------------------------
-- ★ ด่านกันการยิง /next รัว ๆ ใน advance_queue ยังอยู่ (PREMATURE_END)
--   นั่นเป็นการตรวจ "เวลา" ไม่ใช่ "สิทธิ์" — คนละเรื่องกัน และยังจำเป็น
create or replace function public.perm_can_skip(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select p_role is not null and p_room.id is not null;
$$;


-- ---------------------------------------------------------------------------
-- เล่น / หยุด / เลื่อนตำแหน่ง — ทุกคนในห้อง
-- ---------------------------------------------------------------------------
create or replace function public.perm_can_control(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select p_role is not null and p_room.id is not null;
$$;


-- ---------------------------------------------------------------------------
-- ล้างคิว / ลบเพลงของคนอื่น — ทุกคนในห้อง
-- ---------------------------------------------------------------------------
-- ★ ข้อนี้กระทบแรงที่สุดในชุดนี้: ใครก็กดล้างคิวทั้งห้องได้
--   ยังปลอดภัยในแง่ที่ว่าเป็นคนในห้องเท่านั้น และเพลงที่กำลังเล่นไม่ถูกแตะ
--   (remove_queue_item ยังปฏิเสธเพลงที่ status <> 'WAITING' เหมือนเดิม)
create or replace function public.perm_can_manage(p_role public.member_role, p_room public.rooms)
returns boolean language sql immutable as $$
  select p_role is not null and p_room.id is not null;
$$;


-- ---------------------------------------------------------------------------
-- ให้ห้องที่มีอยู่แล้วสอดคล้องกับนโยบายใหม่
-- ---------------------------------------------------------------------------
-- ฟังก์ชันด้านบนไม่ได้อ่านคอลัมน์พวกนี้แล้ว แต่ตั้งให้ตรงกันไว้
-- เผื่อวันหนึ่งเปลี่ยนใจกลับไปอ่านมันอีก จะได้ไม่เจอค่าที่ขัดกับสิ่งที่ผู้ใช้เห็น
update public.rooms
set allow_guest_add      = true,
    allow_member_skip    = true,
    allow_member_control = true
where not (allow_guest_add and allow_member_skip and allow_member_control);

alter table public.rooms alter column allow_member_skip    set default true;
alter table public.rooms alter column allow_member_control set default true;


-- ══════════════════════════════════════════════════════════════════════
-- 0013_reorder_queue.sql
-- ══════════════════════════════════════════════════════════════════════

-- ===========================================================================
-- 0013 · ลากสลับลำดับคิวเพลง
-- ===========================================================================
--
-- ★★ ทำไมต้องเขียน position ใหม่ทั้งคิว ไม่ใช่แค่แถวที่ลาก
--
--    วิธีที่คนทำกันคือแทรกค่ากลาง ๆ (เช่น 5 กับ 6 → 5.5) เพื่อให้แก้แถวเดียว
--    แต่ตารางนี้ position เป็น bigint และมี unique (room_id, position) คุมอยู่
--    ซึ่งจงใจทำไว้ตั้งแต่ 0003 เพื่อให้ลำดับคิว "ไม่มีทางซ้ำได้เลย"
--
--    ★ การเปลี่ยนเป็น numeric เพื่อรองรับค่ากลาง = ยอมให้ลำดับคิวกลายเป็น
--      ทศนิยมที่หารกันไปเรื่อย ๆ และสุดท้ายจะชนขีดความละเอียดของ float
--      หลังลากไปมาไม่กี่ร้อยครั้ง — เขียนใหม่ทั้งคิวแพงกว่านิดเดียว
--      (คิวห้องฟังเพลงมีหลักสิบแถว ไม่ใช่หลักแสน) แต่ถูกต้องตลอดไป
--
-- ★★ ทำไมค่าใหม่ต้องเริ่มจาก max(position) ของทั้งห้อง ไม่ใช่ 1
--
--    unique (room_id, position) ครอบ "ทุกแถวรวมที่เล่นจบไปแล้ว" เพราะ
--    position เป็น monotonic ไม่เคยใช้ซ้ำ (ดูคอมเมนต์ใน 0003)
--
--    ถ้าเขียนทับด้วย 1,2,3 จะไปชนกับเพลงที่เล่นจบไปแล้วซึ่งถือเลขพวกนั้นอยู่
--    ★ เริ่มจาก max+1 ทำให้ค่าใหม่ทุกตัวสูงกว่าทุกแถวที่มีอยู่ — ไม่มีทางชน
--      และคุณสมบัติ "ไม่ใช้เลขซ้ำ" ยังคงอยู่ครบ
--
--    ผลข้างเคียงที่ตั้งใจ: เพลงที่กำลังเล่น (PLAYING) ถือเลขเก่าซึ่งต่ำกว่า
--    ทุกเพลงในคิวเสมอ advance_queue ที่ใช้ order by position asc จึงยังถูกต้อง
--
-- ★ ปัญหา unique violation ระหว่างอัปเดต
--   update ทีละแถวจะชนกันเองกลางทาง (แถวที่ 2 อยากได้เลขของแถวที่ 1)
--   ★ แก้ด้วยการเขียนทุกแถวใน statement เดียวและไปยังช่วงเลขที่ว่างทั้งช่วง
--     — ไม่มีจังหวะไหนเลยที่ค่าใหม่ทับค่าเก่าของแถวอื่น
-- ---------------------------------------------------------------------------

create or replace function public.reorder_queue_item(
  p_room_id  uuid,
  p_actor    uuid,
  p_item_id  uuid,
  -- ย้ายไปต่อ "หลัง" เพลงนี้ · null = ขึ้นไปเป็นเพลงแรกของคิว
  p_after_id uuid default null
)
returns setof public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room  public.rooms;
  v_role  public.member_role;
  v_item  public.queue_items;
  v_ids   uuid[];
  v_old   uuid[];
  v_at    integer;
  v_base  bigint;
begin
  -- ★ บรรทัดแรกเสมอ เหมือน RPC ตัวอื่นที่แตะคิว
  --   สองคนลากพร้อมกันจะถูกจัดคิวให้ทำทีละคน แล้วคนที่สองจะเห็นผลของคนแรก
  --   ก่อนคำนวณลำดับของตัวเอง — ไม่ใช่คำนวณจากภาพเก่าแล้วเขียนทับ
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  -- ★ ใช้เกณฑ์เดียวกับการเพิ่มเพลง
  --   การจัดลำดับคิวเป็นการกระทำระดับเดียวกับการเพิ่มเพลง ไม่ใช่ระดับเจ้าของห้อง
  --   และเกณฑ์นี้เคารพ is_locked ให้ด้วย — ห้องที่ปิดรับเพลงย่อมไม่ควรสลับคิวได้
  if v_role is null or not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_item
  from public.queue_items
  where id = p_item_id and room_id = p_room_id   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  -- ★ ย้ายได้เฉพาะเพลงที่ยังไม่ได้เล่น
  --   เพลงที่กำลังเล่นอยู่ไม่ใช่ "ลำดับในคิว" แต่เป็นสถานะของห้อง ณ ตอนนี้
  --   การลากมันไปไว้กลางคิวไม่มีความหมายที่แปลเป็นการกระทำได้
  if v_item.status <> 'WAITING' then
    raise exception 'FORBIDDEN';
  end if;

  if p_after_id = p_item_id then
    raise exception 'VALIDATION_FAILED: cannot place an item after itself';
  end if;

  select array_agg(id order by position) into v_ids
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  v_old := v_ids;
  v_ids := array_remove(v_ids, p_item_id);

  if p_after_id is null then
    v_at := 1;
  else
    v_at := array_position(v_ids, p_after_id);
    if v_at is null then
      -- หมุดที่อ้างถึงถูกลบ/เล่นไปแล้วระหว่างที่ผู้ใช้ลากอยู่
      raise exception 'QUEUE_ITEM_NOT_FOUND';
    end if;
    v_at := v_at + 1;
  end if;

  v_ids := v_ids[1:v_at - 1] || p_item_id || v_ids[v_at:];

  -- ★ ลำดับไม่เปลี่ยน → ไม่ต้องเขียนอะไรเลย
  --   ปล่อยให้เขียนทับจะยิง realtime ให้ทุกเครื่องโดยไม่มีอะไรต่างกัน
  --   ซึ่งเกิดบ่อยมากเพราะการ "ลากแล้ววางที่เดิม" คือความผิดพลาดปกติของนิ้ว
  if v_ids = v_old then
    return query
      select * from public.queue_items
      where room_id = p_room_id and status = 'WAITING'
      order by position;
    return;
  end if;

  select coalesce(max(position), 0) into v_base
  from public.queue_items
  where room_id = p_room_id;

  update public.queue_items q
  -- updated_at มี trigger touch_updated_at ตั้งให้อยู่แล้ว (0002) ไม่ต้องเขียนเอง
  set position = v_base + t.rn
  from (
    select id, ordinality as rn
    from unnest(v_ids) with ordinality as u(id, ordinality)
  ) t
  where q.id = t.id and q.room_id = p_room_id;

  return query
    select * from public.queue_items
    where room_id = p_room_id and status = 'WAITING'
    order by position;
end;
$$;

-- ★ เหตุผลเดียวกับ RPC ตัวอื่น: ฟังก์ชันรับ p_actor เป็นพารามิเตอร์
--   ถ้าไม่ revoke คนที่ถือ anon key จะเรียกโดยใส่ user id ของคนอื่นได้
revoke execute on function public.reorder_queue_item(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reorder_queue_item(uuid, uuid, uuid, uuid)
  to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0014_skip_permission.sql
-- ══════════════════════════════════════════════════════════════════════

-- ===========================================================================
-- 0014 · สิทธิ์ "ลัดคิว" — เจ้าของห้องเท่านั้น และมอบให้คนอื่นได้
-- ===========================================================================
--
-- ★★ กลับทิศจาก 0012 เฉพาะเรื่องเดียว
--
--    0012 เปิดทุกอย่างให้ทุกคนเท่ากัน ซึ่งยังเป็นนโยบายหลักอยู่:
--    เพิ่มเพลง · หยุด/เล่น · ลบเพลง · ล้างคิว · สลับลำดับ — ทุกคนทำได้หมด
--
--    ★ สิ่งเดียวที่ดึงกลับมาคือ "การเปลี่ยนเพลงที่กำลังเล่นอยู่ให้เป็นเพลงอื่น"
--      คือกดเพลงในคิวเพื่อลัดขึ้นมาเล่น และการกดข้าม
--
--    เหตุผลที่สองอย่างนี้ต่างจากที่เหลือ: มันทำลายสิ่งที่ทุกคนกำลังฟังอยู่
--    ทันทีและกู้คืนไม่ได้ ส่วนการเพิ่มเพลงหรือสลับลำดับกระทบแค่ "อนาคต"
--    ซึ่งแก้กลับได้ก่อนถึงคิวจริง
--
-- ★★ ทำไมเป็นสิทธิ์รายคน ไม่ใช่สวิตช์เปิด/ปิดทั้งห้อง
--
--    rooms.allow_member_skip ที่มีอยู่แล้วเป็นสวิตช์ทั้งห้อง ซึ่งตอบโจทย์
--    "ให้ทุกคน" กับ "ไม่ให้ใครเลย" แต่ตอบ "ให้เฉพาะคนนี้" ไม่ได้
--    ซึ่งเป็นสิ่งที่เจ้าของห้องอยากทำจริง — มอบให้เพื่อนที่คุมเพลงเป็น
--    โดยไม่ต้องเปิดให้คนทั้งห้อง
--
--    ★ เก็บ allow_member_skip ไว้ไม่แตะ เพื่อไม่ให้ต้องย้อนแก้ของเดิม
--      แต่เส้นทางตัดสินใจเส้นเดียวที่ใช้จริงตั้งแต่นี้คือ member_can_skip()
-- ---------------------------------------------------------------------------

alter table public.room_members
  add column if not exists can_skip boolean not null default false;

comment on column public.room_members.can_skip is
  'เจ้าของห้องมอบสิทธิ์ลัดคิว/ข้ามเพลงให้คนนี้หรือยัง (OWNER มีเสมอโดยไม่สนคอลัมน์นี้)';


-- ---------------------------------------------------------------------------
-- member_can_skip — ด่านเดียวที่ตัดสินเรื่องนี้
-- ---------------------------------------------------------------------------
-- ★ รับ room_id + user id ไม่ใช่ role + room เหมือน perm_can_* ตัวอื่น
--   เพราะคำตอบขึ้นกับ "แถวของคนคนนั้น" ไม่ใช่แค่บทบาทของเขา
--   perm_can_skip() เดิมยังอยู่เพื่อไม่ให้ของเก่าพัง แต่ไม่มีใครเรียกแล้ว
create or replace function public.member_can_skip(p_room_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.role = 'OWNER' or m.can_skip
     from public.room_members m
     where m.room_id = p_room_id and m.user_id = p_actor),
    false                                   -- ไม่ได้อยู่ในห้อง = ไม่ได้
  );
$$;


-- ---------------------------------------------------------------------------
-- set_member_skip — เจ้าของห้องมอบ/ถอนสิทธิ์
-- ---------------------------------------------------------------------------
create or replace function public.set_member_skip(
  p_room_id uuid,
  p_actor   uuid,
  p_target  uuid,
  p_allow   boolean
)
returns public.room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  public.room_members;
  v_target public.room_members;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  -- ★ อ่าน "หลัง" จับล็อกเสมอ
  --   ตำแหน่งเจ้าของห้องโอนได้ (0010/0011) การอ่านก่อนล็อกจึงอาจได้ภาพที่
  --   ล้าสมัยไปแล้วหนึ่งจังหวะ แล้วเรายอมให้อดีตเจ้าของแจกสิทธิ์ได้
  select * into v_actor
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_actor.user_id is null or v_actor.role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_target
  from public.room_members
  where room_id = p_room_id and user_id = p_target
  for update;

  if not found then
    raise exception 'FORBIDDEN';              -- ไม่ได้อยู่ในห้องนี้
  end if;

  -- ★ เจ้าของห้องมีสิทธิ์นี้อยู่แล้วโดยบทบาท การถอนของตัวเองจึงไม่มีความหมาย
  --   ปล่อยให้ทำได้จะกลายเป็นสถานะที่ค่าในคอลัมน์ขัดกับสิ่งที่ระบบยอมให้ทำจริง
  if v_target.role = 'OWNER' then
    raise exception 'VALIDATION_FAILED: owner always has this permission';
  end if;

  update public.room_members
  set can_skip = p_allow
  where room_id = p_room_id and user_id = p_target
  returning * into v_target;

  return v_target;
end;
$$;


-- ---------------------------------------------------------------------------
-- play_queue_item — เปลี่ยนด่านสิทธิ์มาใช้ member_can_skip
-- ---------------------------------------------------------------------------
-- ★ เนื้อในเหมือน 0009 ทุกบรรทัด ต่างแค่บรรทัดเช็คสิทธิ์
--   ที่ต้องเขียนใหม่ทั้งก้อนเพราะ plpgsql ไม่มีทางแก้เฉพาะบางบรรทัดได้
create or replace function public.play_queue_item(
  p_room_id uuid,
  p_actor   uuid,
  p_item_id uuid
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room    public.rooms;
  v_role    public.member_role;
  v_pb      public.playback_states;
  v_target  public.queue_items;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  -- ★★ ด่านใหม่: เจ้าของห้อง หรือคนที่เจ้าของห้องมอบสิทธิ์ให้เท่านั้น
  if v_role is null or not public.member_can_skip(p_room_id, p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_target
  from public.queue_items
  where id = p_item_id and room_id = p_room_id   -- ★ ผูก room_id เสมอ กัน IDOR
  for update;

  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;

  -- กดเพลงที่กำลังเล่นอยู่ → ไม่ต้องทำอะไร (idempotent)
  if v_pb.queue_item_id = p_item_id then
    return v_pb;
  end if;

  if v_target.status <> 'WAITING' then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- เล่นจบ/ถูกลบไปแล้ว
  end if;

  -- เพลงที่ถูกข้ามไปตอนกระโดด ไม่ถูกลบทิ้ง (เหตุผลเต็มอยู่ใน 0009)
  if v_pb.queue_item_id is not null then
    update public.queue_items
    set status = 'SKIPPED', ended_at = now()
    where id = v_pb.queue_item_id;
  end if;

  update public.queue_items
  set status = 'PLAYING', started_at = now()
  where id = p_item_id;

  update public.playback_states
  set queue_item_id    = p_item_id,
      video_id         = v_target.video_id,
      is_playing       = true,
      started_at       = now(),
      paused_at        = null,
      current_position = 0,
      version          = version + 1
  where room_id = p_room_id
  returning * into v_pb;

  return v_pb;
end;
$$;


-- ---------------------------------------------------------------------------
-- advance_queue — เฉพาะ SKIPPED ที่ต้องมีสิทธิ์ · ENDED ทุกคนรายงานได้เหมือนเดิม
-- ---------------------------------------------------------------------------
-- ★★ ห้ามเผลอเอาสิทธิ์ไปครอบ ENDED ด้วย
--
--    ENDED คือ "เพลงเล่นจบแล้ว" ซึ่งเครื่องของใครก็ได้เป็นคนรายงาน —
--    ตัวที่รายงานคือ leader ที่ถูกเลือกจากคนที่เปิดหน้าอยู่ ถ้าเผลอบังคับสิทธิ์
--    ตรงนี้ด้วย ห้องที่เจ้าของห้องปิดแท็บไปจะค้างอยู่ที่เพลงเดิมตลอดกาล
--
--    ด่านของ ENDED เป็นคนละชนิด: ต้องเล่นไปเกือบครบความยาวจริง (PREMATURE_END)
create or replace function public.advance_queue(
  p_room_id     uuid,
  p_actor       uuid,
  p_expected_id uuid,
  p_reason      text
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb      public.playback_states;
  v_room    public.rooms;
  v_role    public.member_role;
  v_current public.queue_items;
  v_next    public.queue_items;
  v_elapsed numeric;
begin
  if p_reason not in ('ENDED', 'SKIPPED') then
    raise exception 'VALIDATION_FAILED: unknown reason %', p_reason;
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ตรวจสิทธิ์
  if p_actor is not null then
    select role into v_role
    from public.room_members
    where room_id = p_room_id and user_id = p_actor;

    if v_role is null then
      raise exception 'FORBIDDEN';
    end if;

    if p_reason = 'SKIPPED' and not public.member_can_skip(p_room_id, p_actor) then
      raise exception 'FORBIDDEN';
    end if;
  elsif p_reason <> 'ENDED' then
    raise exception 'FORBIDDEN';               -- ระบบข้ามเพลงเองไม่ได้
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- ★★ Compare-and-swap — เงื่อนไขนี้คือทั้งหมดที่กันการเปลี่ยนเพลงซ้ำซ้อน
  if v_pb.queue_item_id is distinct from p_expected_id then
    return v_pb;
  end if;

  if p_expected_id is not null then
    select * into v_current from public.queue_items where id = p_expected_id for update;
  end if;

  -- ด่านกันการยิง /next รัว ๆ เพื่อข้ามเพลงของคนอื่น
  if p_reason = 'ENDED' and v_current.id is not null then
    v_elapsed := public.playback_position_now(v_pb);
    if v_elapsed < v_current.duration - 5 then
      raise exception 'PREMATURE_END';
    end if;
  end if;

  if v_current.id is not null then
    update public.queue_items
    set status   = case when p_reason = 'SKIPPED' then 'SKIPPED'::public.queue_status
                        else 'PLAYED'::public.queue_status end,
        ended_at = now()
    where id = v_current.id;
  end if;

  select * into v_next
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING'
  order by position asc
  limit 1
  for update skip locked;

  if v_next.id is not null then
    update public.queue_items
    set status = 'PLAYING', started_at = now()
    where id = v_next.id;

    update public.playback_states
    set queue_item_id    = v_next.id,
        video_id         = v_next.video_id,
        is_playing       = true,
        started_at       = now(),
        paused_at        = null,
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  else
    update public.playback_states
    set queue_item_id    = null,
        video_id         = null,
        is_playing       = false,
        started_at       = null,
        paused_at        = now(),
        current_position = 0,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ---------------------------------------------------------------------------
-- ★ เจ้าของห้องปัจจุบันของทุกห้อง ไม่ต้องทำอะไร — role = 'OWNER' ชนะอยู่แล้ว
--   ส่วนคนอื่นเริ่มจากไม่มีสิทธิ์ ซึ่งคือสิ่งที่ผู้ใช้ขอพอดี
-- ---------------------------------------------------------------------------

revoke execute on function public.set_member_skip(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_member_skip(uuid, uuid, uuid, boolean)
  to service_role;

-- ★ member_can_skip อ่านอย่างเดียวและไม่รับ p_actor ที่เชื่อถือไม่ได้มาใช้เขียน
--   แต่ก็ไม่มีเหตุให้ client เรียกเอง — ปิดไว้ให้เหมือนตัวอื่นในไฟล์นี้
revoke execute on function public.member_can_skip(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.member_can_skip(uuid, uuid)
  to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0015_profile_nickname.sql
-- ══════════════════════════════════════════════════════════════════════

-- ===========================================================================
-- 0015 · ฉายา + รูปโปรไฟล์
-- ===========================================================================
--
-- ★★ ทำไมไม่ทำระบบ username/password
--
--    ผู้ใช้ขอ "ตัวตนที่จำได้" ไม่ได้ขอ "บัญชี" — สองอย่างนี้ต่างกันมาก
--
--    ★ ตัวตนที่จำได้มีอยู่แล้วตั้งแต่ต้น: Supabase anonymous sign-in ให้ auth
--      user จริงที่อยู่ใน localStorage ข้ามการปิดเปิดเบราว์เซอร์ได้อยู่แล้ว
--      สิ่งที่ขาดคือ "ของที่ผูกกับตัวตนนั้น" — รูปกับฉายา
--
--    การเพิ่ม password เข้ามาแปลว่าต้องมี: หน้าสมัคร · หน้าเข้าสู่ระบบ ·
--    ลืมรหัสผ่าน · ส่งอีเมล · เก็บ hash · และที่แย่ที่สุดคือ "ประตูที่ผู้ใช้
--    ต้องผ่านก่อนฟังเพลงกับเพื่อน" ซึ่งเป็นสิ่งที่ผู้ใช้บอกเองว่าไม่ต้องการ
--    ("ทำง่ายๆ ก่อนเข้าใช้ระบบ ไม่ต้องให้กรอกยาก")
--
--    ★ ถ้าวันหนึ่งอยากได้บัญชีจริง linkIdentity() ผูก email/Google เข้ากับ
--      user เดิมได้โดย id ไม่เปลี่ยน — ประวัติทุกอย่างยังเป็นของคนเดิม
--      เราจึงไม่ได้ปิดทางนั้น แค่ยังไม่เดินไป
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists nickname text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_nickname_len'
  ) then
    alter table public.profiles
      add constraint profiles_nickname_len
      check (nickname is null or char_length(nickname) between 1 and 30);
  end if;
end
$$;

comment on column public.profiles.nickname is
  'ฉายา — ข้อความรองใต้ชื่อ ไม่ใช้ระบุตัวตนและไม่ต้องไม่ซ้ำ';


-- ---------------------------------------------------------------------------
-- ★★ RLS: ยอมให้แก้ nickname ของตัวเองได้ด้วย
-- ---------------------------------------------------------------------------
-- policy "profiles: update own" ที่มีอยู่คุมที่ "แถวไหน" ไม่ได้คุม "คอลัมน์ไหน"
-- คอลัมน์ใหม่จึงถูกครอบโดยอัตโนมัติ ไม่ต้องแก้ policy
--
-- ★ แต่ต้องยืนยันว่ามัน "ไม่ได้" เปิดอะไรเกินตั้งใจ:
--   คอลัมน์ที่อ่อนไหวในตารางนี้คือ id (FK ไป auth.users) กับ is_guest
--   ทั้งคู่ไม่ได้ถูกแก้จาก client ที่ไหนเลย และ policy จำกัดไว้ที่แถวของตัวเอง
--   อยู่แล้ว — การเปลี่ยน is_guest ของตัวเองไม่ให้สิทธิ์อะไรเพิ่ม เพราะไม่มี
--   RPC ตัวไหนตัดสินใจจากค่านั้น (ใช้แค่แสดงผล)


-- ---------------------------------------------------------------------------
-- ★ ไม่แตะ handle_new_user
-- ---------------------------------------------------------------------------
-- trigger เดิมสร้าง profile พร้อม display_name จาก metadata ตอน sign-in
-- ฉายากับรูปเป็นของที่ผู้ใช้ตั้งทีหลังเสมอ จึงเริ่มจาก null ถูกต้องแล้ว


-- ══════════════════════════════════════════════════════════════════════
-- 0016_control_permission_and_chat.sql
-- ══════════════════════════════════════════════════════════════════════

-- ===========================================================================
-- 0016 · หยุด/เล่นต้องมีสิทธิ์ + แชทอยู่ต่อหลังรีเฟรช
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ส่วนที่ 1 · set_playback ใช้ด่านสิทธิ์เดียวกับการลัดคิว
-- ---------------------------------------------------------------------------
-- ★★ ทำไมรวมเป็นสิทธิ์เดียว ไม่แยก "ลัดคิว" กับ "หยุด/เล่น"
--
--    ทั้งสองอย่างเปลี่ยนสิ่งที่ทุกคนในห้องได้ยิน ณ วินาทีนั้นทันที และย้อนไม่ได้
--    คนที่กดหยุดเพลงกลางวงได้ ก็ก่อกวนได้ไม่ต่างจากคนที่ลัดคิวได้
--
--    ★ สิทธิ์สองใบที่ต้องแจกแยกกันแต่มีผลเหมือนกัน คือภาระของเจ้าของห้อง
--      โดยไม่ได้อะไรกลับมา — ถ้าวันหนึ่งพบว่าต้องแยกจริง ค่อยแตกทีหลังได้
--      เพราะด่านอยู่ที่ member_can_skip() ที่เดียว
create or replace function public.set_playback(
  p_room_id  uuid,
  p_actor    uuid,
  p_action   text,
  p_position integer default null
)
returns public.playback_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb       public.playback_states;
  v_room     public.rooms;
  v_role     public.member_role;
  v_item     public.queue_items;
  v_target   integer;
begin
  if p_action not in ('PLAY', 'PAUSE', 'SEEK') then
    raise exception 'VALIDATION_FAILED: unknown action %', p_action;
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null or not public.member_can_skip(p_room_id, p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id for update;

  if v_pb.queue_item_id is null then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ไม่มีเพลงให้ควบคุม
  end if;

  select * into v_item from public.queue_items where id = v_pb.queue_item_id;

  if p_action = 'PLAY' then
    if v_pb.is_playing then
      return v_pb;                             -- อยู่ในสถานะที่ขอแล้ว → idempotent
    end if;
    update public.playback_states
    set is_playing = true,
        started_at = now(),                    -- anchor ใหม่ current_position คงเดิม
        paused_at  = null,
        version    = version + 1
    where room_id = p_room_id
    returning * into v_pb;

  elsif p_action = 'PAUSE' then
    if not v_pb.is_playing then
      return v_pb;
    end if;
    update public.playback_states
    set is_playing       = false,
        -- freeze ตำแหน่ง ณ วินาทีนี้ไว้ ไม่งั้นพอ resume จะกระโดด
        current_position = least(
          floor(public.playback_position_now(v_pb))::integer,
          v_item.duration
        ),
        paused_at        = now(),
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;

  else -- SEEK
    if p_position is null or p_position < 0 then
      raise exception 'VALIDATION_FAILED: position required for SEEK';
    end if;

    v_target := least(p_position, v_item.duration);

    update public.playback_states
    set current_position = v_target,
        started_at       = case when is_playing then now() else started_at end,
        version          = version + 1
    where room_id = p_room_id
    returning * into v_pb;
  end if;

  return v_pb;
end;
$$;


-- ===========================================================================
-- ส่วนที่ 2 · แชทเก็บลงฐานข้อมูล
-- ===========================================================================
--
-- ★★★ นี่คือการกลับคำตัดสินใจเดิม อ่านให้ครบก่อนแก้ต่อ
--
--     เดิมแชทวิ่งผ่าน Realtime broadcast ล้วน ไม่แตะฐานข้อมูล ด้วยเหตุผลว่า
--     "ไม่มีใครกลับมาอ่านแชทของห้องเมื่อวาน"
--
--     ข้อนั้นยังจริง แต่ที่พลาดคือกรณีที่ใกล้กว่านั้นมาก: **การรีเฟรชหน้า**
--     ผู้ใช้ที่กด F5 หรือเน็ตหลุดแล้วโหลดใหม่ เสียบทสนทนาทั้งหมดที่เพิ่งคุยไป
--     เมื่อสิบวินาทีก่อน ซึ่งไม่ใช่ "แชทเมื่อวาน" แต่คือแชทที่กำลังคุยกันอยู่
--
--     ★ ผลพลอยได้ที่สำคัญกว่าที่คิด: broadcast ไม่มีการยืนยันตัวตนระดับข้อความ
--       ใครที่อยู่ในห้องและเขียน JS เป็น ส่งข้อความในชื่อคนอื่นได้
--       พอย้ายมาเขียนผ่าน RPC ฝั่ง server เป็นคนใส่ user_id เอง
--       — ช่องโหว่นั้นหายไปเลยโดยไม่ต้องทำอะไรเพิ่ม
--
--     ราคาที่จ่าย: ตาราง + RLS + index + การกวาดของเก่า ซึ่งคือสิ่งที่
--     คอมเมนต์เดิมบอกว่าไม่อยากจ่าย — ตอนนี้จ่ายแล้วเพราะเหตุผลเปลี่ยน
-- ---------------------------------------------------------------------------

create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  text         text not null default ''
               constraint chat_messages_text_len check (char_length(text) <= 300),
  image_url    text
               constraint chat_messages_image_https
               check (image_url is null or image_url ~ '^https://'),
  image_width  integer,
  image_height integer,
  /**
   * ★ เก็บ mentions เป็น jsonb ไม่ใช่ตารางแยก
   *   มันคือ "เจตนาของผู้ส่ง ณ ตอนส่ง" ไม่ใช่ความสัมพันธ์ที่ต้อง query ย้อน
   *   ไม่มีที่ไหนถามว่า "ข้อความไหนบ้างที่ @ คนนี้" — มีแต่อ่านพร้อมข้อความ
   */
  mentions     jsonb not null default '[]'::jsonb,
  /** สำเนาของข้อความที่ตอบกลับ — เก็บไว้เพราะต้นฉบับอาจถูกลบไปแล้ว */
  reply_to     jsonb,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.chat_messages is
  'ข้อความแชทในห้อง — อายุสั้น กวาดทิ้งด้วย cron หลัง 24 ชั่วโมง';

-- ★ index เดียวที่ต้องมีจริง: ดึงข้อความล่าสุดของห้องหนึ่ง
--   ทุกการอ่านในระบบเป็นรูปแบบนี้หมด (bootstrap + resync)
create index if not exists chat_messages_room_time_idx
  on public.chat_messages (room_id, created_at desc);

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null
             constraint chat_reactions_emoji_len check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  -- ★ คนเดียวกดอีโมจิเดิมซ้ำไม่ได้ — กดซ้ำ = ถอน ซึ่งเป็นการลบแถว
  primary key (message_id, user_id, emoji)
);


-- ---------------------------------------------------------------------------
-- RLS — อ่านได้เฉพาะคนในห้อง เขียนผ่าน RPC เท่านั้น
-- ---------------------------------------------------------------------------
alter table public.chat_messages  enable row level security;
alter table public.chat_reactions enable row level security;

drop policy if exists "chat_messages: read in room" on public.chat_messages;
create policy "chat_messages: read in room"
  on public.chat_messages for select
  using (public.is_room_member(room_id));

drop policy if exists "chat_reactions: read in room" on public.chat_reactions;
create policy "chat_reactions: read in room"
  on public.chat_reactions for select
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = chat_reactions.message_id and public.is_room_member(m.room_id)
    )
  );

-- ★ ไม่มี policy สำหรับ insert/update/delete โดยตั้งใจ
--   RLS เป็น default-deny อยู่แล้ว การไม่เขียน policy = ห้ามทุกคนเขียนตรง ๆ
--   ทางเดียวที่เขียนได้คือผ่าน RPC ที่เป็น security definer ซึ่งเราคุมทั้งหมด


-- ---------------------------------------------------------------------------
-- ส่งข้อความ
-- ---------------------------------------------------------------------------
create or replace function public.send_chat_message(
  p_room_id      uuid,
  p_actor        uuid,
  p_text         text,
  p_image_url    text default null,
  p_image_width  integer default null,
  p_image_height integer default null,
  p_mentions     jsonb default '[]'::jsonb,
  p_reply_to     jsonb default null
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.member_role;
  v_row  public.chat_messages;
begin
  -- ★ ไม่ต้องจับ advisory lock — การส่งข้อความไม่แข่งกับใคร
  --   ต่างจากคิวเพลงที่ลำดับต้องไม่ซ้ำ ข้อความสองข้อความที่มาพร้อมกัน
  --   ถูกต้องทั้งคู่ไม่ว่าจะเรียงยังไง การล็อกจะทำให้ห้องที่คุยกันรัว ๆ ช้าลงเปล่า ๆ
  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if coalesce(btrim(p_text), '') = '' and p_image_url is null then
    raise exception 'VALIDATION_FAILED: empty message';
  end if;

  insert into public.chat_messages (
    room_id, user_id, text, image_url, image_width, image_height, mentions, reply_to
  )
  values (
    p_room_id, p_actor, coalesce(p_text, ''), p_image_url, p_image_width, p_image_height,
    coalesce(p_mentions, '[]'::jsonb), p_reply_to
  )
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------------
-- ลบข้อความ — เฉพาะของตัวเอง หรือเจ้าของห้อง
-- ---------------------------------------------------------------------------
create or replace function public.delete_chat_message(
  p_actor      uuid,
  p_message_id uuid
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg  public.chat_messages;
  v_role public.member_role;
begin
  select * into v_msg from public.chat_messages where id = p_message_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ใช้รหัสกลางของระบบ (แปลว่า "ไม่พบสิ่งที่อ้างถึง")
  end if;

  select role into v_role
  from public.room_members
  where room_id = v_msg.room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ เจ้าของห้องลบของคนอื่นได้ด้วย — ต้องมีคนเก็บกวาดได้เมื่อมีคนส่งของไม่ควรส่ง
  if v_msg.user_id <> p_actor and v_role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★ ทำเครื่องหมายว่าลบ ไม่ลบแถวทิ้ง
   *   แถวที่หายไปทำให้บทสนทนาขาดตอนจนคนอ่านย้อนไม่เข้าใจ และข้อความที่
   *   อ้างถึงมันอยู่จะชี้ไปที่ความว่างเปล่า
   *   ★ เนื้อความถูกล้างจริง ๆ ด้วย — "ลบแล้ว" ต้องแปลว่าอ่านไม่ได้อีก
   *     ไม่ใช่แค่ซ่อนจาก UI แล้วยังดึงกลับมาได้จาก API
   */
  update public.chat_messages
  set deleted_at = now(), text = '', image_url = null,
      image_width = null, image_height = null
  where id = p_message_id
  returning * into v_msg;

  return v_msg;
end;
$$;


-- ---------------------------------------------------------------------------
-- กด/ถอนอีโมจิบนข้อความ
-- ---------------------------------------------------------------------------
create or replace function public.toggle_chat_reaction(
  p_actor      uuid,
  p_message_id uuid,
  p_emoji      text,
  p_on         boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  select room_id into v_room from public.chat_messages where id = p_message_id;
  if v_room is null then
    raise exception 'QUEUE_ITEM_NOT_FOUND';   -- ใช้รหัสกลางของระบบ (แปลว่า "ไม่พบสิ่งที่อ้างถึง")
  end if;

  if not exists (
    select 1 from public.room_members where room_id = v_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_on then
    -- ★ on conflict do nothing = กดซ้ำไม่พัง และไม่ต้องเช็คก่อนว่ามีอยู่ไหม
    --   (การเช็คก่อนแล้วค่อย insert คือ race condition คลาสสิก)
    insert into public.chat_reactions (message_id, user_id, emoji)
    values (p_message_id, p_actor, p_emoji)
    on conflict do nothing;
  else
    delete from public.chat_reactions
    where message_id = p_message_id and user_id = p_actor and emoji = p_emoji;
  end if;

  return p_on;
end;
$$;


-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- ★ ต้องเพิ่มเข้า publication เอง ไม่ได้มาเองตอน create table
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'chat_reactions'
  ) then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
end
$$;

-- ★ replica identity full — ต้องมีเพื่อให้ payload ของ DELETE มีข้อมูลครบ
--   ไม่งั้นตอนถอนอีโมจิ ฝั่ง client จะได้แค่ primary key ซึ่งพอสำหรับตารางนี้
--   (pk คือสามคอลัมน์ที่เราต้องใช้พอดี) แต่ chat_messages ต้องการ room_id
--   เพื่อให้ RLS กรองได้ถูกห้อง
alter table public.chat_messages  replica identity full;
alter table public.chat_reactions replica identity full;


revoke execute on function public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb)
  to service_role;

revoke execute on function public.delete_chat_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_chat_message(uuid, uuid) to service_role;

revoke execute on function public.toggle_chat_reaction(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.toggle_chat_reaction(uuid, uuid, text, boolean)
  to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 0017_username.sql
-- ══════════════════════════════════════════════════════════════════════

-- ===========================================================================
-- 0017 · username — ตัวตนที่ข้ามเครื่องได้ ด้วยการกรอกช่องเดียว
-- ===========================================================================
--
-- ★★★ อ่านให้ครบ: นี่ไม่ใช่ระบบยืนยันตัวตน มันคือระบบ "อ้างตัวตน"
--
--     ไม่มีรหัสผ่าน แปลว่าใครก็ตามที่รู้ username ของคุณ พิมพ์ลงไปแล้ว
--     กลายเป็นคุณได้ทันที — ทั้งชื่อ รูป ประวัติ และสิทธิ์ในห้อง
--
--     ★ นี่เป็นข้อแลกเปลี่ยนที่ผู้ใช้เลือกเองโดยรู้ตัว ("ไม่ต้องใส่ password",
--       "กรอกน้อยที่สุด") ไม่ใช่สิ่งที่มองข้ามไป
--
--     เหมาะกับสิ่งที่แอปนี้เป็น: ห้องฟังเพลงกับเพื่อนที่แชร์รหัสกันอยู่แล้ว
--     ไม่มีข้อมูลอ่อนไหวอะไรให้ปกป้อง สิ่งที่แย่ที่สุดที่ทำได้คือแกล้งกันในห้อง
--
--     ★★ วิธีอัปเกรดเมื่อวันนั้นมาถึง (แก้จุดเดียว)
--        เพิ่มคอลัมน์ pin_hash แล้วให้ /api/auth/username ตรวจก่อนออก session
--        โครงที่เหลือ — auth user, profile, session — ไม่ต้องแตะเลยสักบรรทัด
--        เพราะตัวตนผูกกับ auth.users อยู่แล้ว ไม่ได้ผูกกับ username
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      -- ★ อนุญาตแค่ a-z 0-9 _ . และบังคับตัวพิมพ์เล็ก
      --   เก็บเป็นพิมพ์เล็กเสมอตั้งแต่ต้น จะได้ไม่ต้องมี "Frame" กับ "frame"
      --   เป็นคนละคน ซึ่งเป็นกับดักที่คนสับสนที่สุดในระบบที่มีชื่อผู้ใช้
      check (username is null or username ~ '^[a-z0-9._]{3,20}$');
  end if;
end
$$;

-- ★ unique เป็นหัวใจ ไม่ใช่ของตกแต่ง
--   ถ้าซ้ำได้ การ "เข้าใช้ด้วยชื่อนี้" จะไม่รู้ว่าหมายถึงใคร
--   partial เพราะผู้ใช้เก่าที่ยังไม่มี username ต้องอยู่ต่อได้โดยไม่ชนกันเอง
create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

comment on column public.profiles.username is
  'ชื่อผู้ใช้สำหรับเข้าใช้งานข้ามเครื่อง — ไม่มีรหัสผ่านโดยเจตนา (ดู 0017)';


-- ══════════════════════════════════════════════════════════════════════
-- 0018_stickers.sql
-- ══════════════════════════════════════════════════════════════════════

-- ===========================================================================
-- 0018 · สติกเกอร์
-- ===========================================================================
--
-- ★★★ ทำไมไม่เอาชุดสติกเกอร์ของ LINE/Facebook มาใส่
--
--     ทั้งสองเจ้าเป็นงานมีลิขสิทธิ์ การเอามาใช้คือการละเมิด ไม่ว่าจะ
--     "แค่ในกลุ่มเพื่อน" หรือไม่ — และเป็นความเสี่ยงที่ตกกับเจ้าของเว็บ
--
--     ★ จึงออกแบบให้สติกเกอร์มาจากสองทางที่ถูกกฎหมาย 100%:
--
--       1. อีโมจิตัวใหญ่ — ไม่ต้องเก็บอะไรเลย เก็บแค่ตัวอักษรอีโมจิใน text
--          แล้วฝั่ง UI วาดใหญ่ 96px โดยไม่มีฟองข้อความ
--          ★ ไม่มีไฟล์ ไม่มีลิขสิทธิ์ ไม่มีที่เก็บ ใช้ได้ทันทีตั้งแต่วันแรก
--
--       2. สติกเกอร์ของห้องเอง — สมาชิกอัปรูปเข้าชุดของห้องนี้
--          ★ อันนี้แหละที่ทำให้สนุกจริง เพราะกลายเป็นรูปหน้าเพื่อนกันเอง
--            ซึ่งเป็นของที่ไม่มีเจ้าไหนขายได้
--
-- ★★ ทำไมเป็น "ของห้อง" ไม่ใช่ "ของคน"
--
--    สติกเกอร์มีความหมายก็ต่อเมื่อคนในวงเข้าใจตรงกัน — รูปหน้าเพื่อนคนหนึ่ง
--    ตลกเฉพาะในกลุ่มที่รู้จักเขา ชุดที่ผูกกับห้องจึงตรงกับวิธีที่คนใช้จริง
--    และทำให้ขอบเขตการมองเห็นตรงกับ RLS ของห้องพอดีโดยไม่ต้องคิดเพิ่ม
-- ---------------------------------------------------------------------------

-- ★ ธงเดียว ไม่ใช่คอลัมน์ใหม่ทั้งชุด
--   สติกเกอร์คือข้อความชนิดหนึ่ง — ตัวอักษรอีโมจิอยู่ใน text ส่วนรูปอยู่ใน
--   image_url เหมือนเดิมทุกอย่าง ต่างแค่ "วาดใหญ่และไม่มีฟอง"
--   การแยกเป็นตารางใหม่จะทำให้ต้องรวมสองแหล่งตอนอ่านแชททุกครั้งโดยไม่ได้อะไร
alter table public.chat_messages
  add column if not exists is_sticker boolean not null default false;


create table if not exists public.room_stickers (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  url        text not null
             constraint room_stickers_https check (url ~ '^https://'),
  width      integer,
  height     integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.room_stickers is
  'ชุดสติกเกอร์ของห้อง — สมาชิกอัปเข้ามาเอง ใช้ได้เฉพาะในห้องนั้น';

create index if not exists room_stickers_room_idx
  on public.room_stickers (room_id, created_at desc);

alter table public.room_stickers enable row level security;

drop policy if exists "room_stickers: read in room" on public.room_stickers;
create policy "room_stickers: read in room"
  on public.room_stickers for select
  using (public.is_room_member(room_id));

-- ★ ไม่มี policy เขียน — เหมือนทุกตารางในระบบนี้ เขียนผ่าน RPC เท่านั้น


-- ---------------------------------------------------------------------------
-- เพิ่ม/ลบสติกเกอร์ของห้อง
-- ---------------------------------------------------------------------------
create or replace function public.add_room_sticker(
  p_room_id uuid,
  p_actor   uuid,
  p_url     text,
  p_width   integer default null,
  p_height  integer default null
)
returns public.room_stickers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.member_role;
  v_count integer;
  v_row   public.room_stickers;
begin
  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ เพดานต่อห้อง — ไม่ใช่เรื่องพื้นที่เก็บ แต่เป็นเรื่องแผงเลือกที่ใช้ได้จริง
  --   ชุดที่มี 500 ตัวคือชุดที่ไม่มีใครหาอะไรเจอ และเลื่อนหาจนเลิกใช้
  select count(*) into v_count from public.room_stickers where room_id = p_room_id;
  if v_count >= 60 then
    raise exception 'QUEUE_FULL';   -- ใช้รหัสกลางของระบบ (แปลว่า "เต็มแล้ว")
  end if;

  insert into public.room_stickers (room_id, url, width, height, created_by)
  values (p_room_id, p_url, p_width, p_height, p_actor)
  returning * into v_row;

  return v_row;
end;
$$;


create or replace function public.remove_room_sticker(
  p_actor      uuid,
  p_sticker_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sticker public.room_stickers;
  v_role    public.member_role;
begin
  select * into v_sticker from public.room_stickers where id = p_sticker_id;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = v_sticker.room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ คนที่อัปเอง หรือเจ้าของห้อง — ต้องมีคนเก็บกวาดได้เสมอ
  --   สติกเกอร์เป็นของที่ทุกคนในห้องเห็นตลอดเวลา ต่างจากข้อความที่ไหลผ่านไป
  if v_sticker.created_by is distinct from p_actor and v_role <> 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.room_stickers where id = p_sticker_id;
  return p_sticker_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- send_chat_message — รับธงสติกเกอร์เพิ่ม
-- ---------------------------------------------------------------------------
-- ★ เนื้อในเหมือน 0016 ทุกบรรทัด ต่างแค่พารามิเตอร์ใหม่หนึ่งตัว
--   (plpgsql แก้เฉพาะบางบรรทัดไม่ได้ ต้องเขียนใหม่ทั้งก้อน)
create or replace function public.send_chat_message(
  p_room_id      uuid,
  p_actor        uuid,
  p_text         text,
  p_image_url    text default null,
  p_image_width  integer default null,
  p_image_height integer default null,
  p_mentions     jsonb default '[]'::jsonb,
  p_reply_to     jsonb default null,
  p_is_sticker   boolean default false
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.member_role;
  v_row  public.chat_messages;
begin
  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if coalesce(btrim(p_text), '') = '' and p_image_url is null then
    raise exception 'VALIDATION_FAILED: empty message';
  end if;

  insert into public.chat_messages (
    room_id, user_id, text, image_url, image_width, image_height,
    mentions, reply_to, is_sticker
  )
  values (
    p_room_id, p_actor, coalesce(p_text, ''), p_image_url, p_image_width, p_image_height,
    coalesce(p_mentions, '[]'::jsonb), p_reply_to, coalesce(p_is_sticker, false)
  )
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------------
-- Realtime — สติกเกอร์ใหม่ต้องโผล่ที่แผงของทุกคนทันที
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'room_stickers'
  ) then
    alter publication supabase_realtime add table public.room_stickers;
  end if;
end
$$;

-- ★ ต้องมี full เพราะการลบสติกเกอร์เป็น DELETE จริง (ไม่ใช่ soft delete)
--   ถ้าไม่มี payload ของ DELETE จะมีแค่ id ซึ่งไม่มี room_id ให้ RLS กรอง
alter table public.room_stickers replica identity full;


revoke execute on function public.add_room_sticker(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.add_room_sticker(uuid, uuid, text, integer, integer)
  to service_role;

revoke execute on function public.remove_room_sticker(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_room_sticker(uuid, uuid) to service_role;

revoke execute on function
  public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function
  public.send_chat_message(uuid, uuid, text, text, integer, integer, jsonb, jsonb, boolean)
  to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- บันทึกประวัติ migration
-- ══════════════════════════════════════════════════════════════════════
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

insert into supabase_migrations.schema_migrations (version)
values ('0001'), ('0002'), ('0003'), ('0004'), ('0005'), ('0006'), ('0007'), ('0008'), ('0009'), ('0010'), ('0011'), ('0012'), ('0013'), ('0014'), ('0015'), ('0016'), ('0017'), ('0018')
on conflict (version) do nothing;

commit;

-- ══════════════════════════════════════════════════════════════════════
-- ตรวจผล — ตัวเลขที่ควรได้: ตาราง 8 · ฟังก์ชัน 29 · policy 6 · realtime 4
-- ══════════════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables
    where table_schema = 'public') as "ตาราง",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public') as "ฟังก์ชัน",
  (select count(*) from pg_policies where schemaname = 'public') as "rls_policy",
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public') as "realtime",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'room_heartbeat') as "room_heartbeat",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_ownership') as "transfer_ownership",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reorder_queue_item') as "reorder_queue_item",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_member_skip') as "set_member_skip",
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'room_members'
      and column_name = 'can_skip') as "can_skip_column",
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'nickname') as "nickname_column",
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'chat_messages') as "chat_messages_table";

-- ═══════════════════════════════════════════════════════════════════
-- 0019_appearance.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0019 · หน้าตาตัวละครในลอบบี้
--
-- ★★ ทำไมเก็บใน DB ไม่ใช่ localStorage ทั้งที่ presence ส่งให้กันอยู่แล้ว
--
--    ลอบบี้ส่งหน้าตาไปกับ presence อยู่แล้ว คนอื่นจึงเห็นถูกต้องโดยไม่ต้อง
--    แตะฐานข้อมูลเลย — ถ้ามองแค่นั้น localStorage ก็พอ
--
--    ★ แต่ผู้ใช้เคยบอกชัดว่าไม่อยากตั้งค่าตัวตนใหม่ทุกครั้งที่เปิดเครื่อง
--      หน้าตาที่แต่งไว้คือตัวตน ไม่ใช่การตั้งค่าของเครื่อง จึงต้องตามคนไป
--      ไม่ใช่ตามเบราว์เซอร์
--
-- ★★ ทำไม jsonb ไม่ใช่คอลัมน์ละอย่าง
--
--    ชุดตัวเลือก (ทรงผม เสื้อ กางเกง แว่น) จะเพิ่มขึ้นแน่นอน
--    ★ ถ้าแยกคอลัมน์ การเพิ่มตัวเลือกใหม่ = migration ใหม่ทุกครั้ง
--      ในขณะที่ค่าพวกนี้ไม่เคยถูก query แบบมีเงื่อนไขเลยสักครั้ง
--      มันถูกอ่านทั้งก้อนแล้วส่งให้ client วาดอย่างเดียว
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists appearance jsonb;

/*
 * ★ ไม่ตั้ง default และไม่ backfill โดยตั้งใจ
 *   null แปลว่า "ยังไม่เคยแต่งตัว" ซึ่ง client จะสุ่มหน้าตาประจำตัวจาก id ให้
 *   ทำให้คนที่ไม่เคยเข้าหน้าแต่งตัวก็ยังมีหน้าตาไม่ซ้ำใคร และแยกออกได้ว่า
 *   หน้าตานี้ "เลือกเอง" หรือ "ระบบแจกให้"
 */

/**
 * บันทึกหน้าตา
 *
 * ★ เขียนผ่านฟังก์ชันไม่ใช่ update ตรง เพราะ profiles ไม่มี write policy
 *   (ค่าเริ่มต้นคือปฏิเสธทุกอย่าง) และเราไม่อยากเปิด policy ให้ client
 *   เขียนคอลัมน์อื่นของตัวเองได้ไปด้วย เช่น username
 */
create or replace function public.set_appearance(
  p_actor uuid,
  p_appearance jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor is null then
    raise exception 'actor required';
  end if;

  -- ★ กันคนยัด json ก้อนใหญ่เข้ามาเก็บฟรี
  if pg_column_size(p_appearance) > 500 then
    raise exception 'appearance too large';
  end if;

  update public.profiles
     set appearance = p_appearance
   where id = p_actor;
end;
$$;

revoke execute on function public.set_appearance(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_appearance(uuid, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════
-- 0020_room_fun.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0020 · กิจกรรมในห้อง
--
--   1) ขอเพลงถึงเพื่อน   — queue_items.dedicated_to / dedication
--   2) โหวตข้ามเพลง      — skip_votes + toggle_skip_vote
--   3) เกมทายเพลง        — quiz_games / quiz_rounds / quiz_scores
-- ─────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ขอเพลงถึงเพื่อน
-- ═════════════════════════════════════════════════════════════════════

alter table public.queue_items
  add column if not exists dedicated_to uuid references public.profiles(id) on delete set null,
  add column if not exists dedication   text;

alter table public.queue_items
  drop constraint if exists queue_items_dedication_len;
alter table public.queue_items
  add constraint queue_items_dedication_len
  check (dedication is null or char_length(dedication) <= 120);

/**
 * เพิ่มเพลงเข้าคิว (+ ขอถึงใครสักคน)
 *
 * ★ พารามิเตอร์ใหม่มี default ทั้งคู่ ของเดิมที่เรียกด้วย 7 ตัวจึงยังทำงานได้
 *   แต่ ★★ ต้องลบตัว 7 พารามิเตอร์ทิ้งด้วย (อยู่ท้ายไฟล์) ไม่งั้น PostgREST
 *   จะเลือกไม่ถูกว่าจะเรียกตัวไหนแล้วตอบ PGRST203 — บทเรียนจากตอนทำสติกเกอร์
 */
create or replace function public.enqueue_track(
  p_room_id      uuid,
  p_actor        uuid,
  p_video_id     text,
  p_title        text,
  p_channel      text,
  p_thumb        text,
  p_duration     integer,
  p_dedicated_to uuid default null,
  p_dedication   text default null
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room        public.rooms;
  v_role        public.member_role;
  v_item        public.queue_items;
  v_position    bigint;
  v_waiting     integer;
  v_has_playing boolean;
  v_to          uuid := p_dedicated_to;
begin
  -- ★ บรรทัดแรกเสมอ — ทุกอย่างหลังจากนี้เป็นของห้องนี้คนเดียว
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_room.is_locked then
    raise exception 'QUEUE_LOCKED';
  end if;

  if not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★ คนที่ถูกขอให้ ต้องอยู่ในห้องนี้จริง
   *   ไม่งั้นจะขอเพลงถึง uuid อะไรก็ได้ที่ไม่มีใครในห้องเห็น ซึ่งไม่มีประโยชน์
   *   และเปิดช่องให้เดาว่า uuid ไหนมีตัวตนในระบบ
   */
  if v_to is not null and not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = v_to
  ) then
    v_to := null;
  end if;

  select count(*) into v_waiting
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  if v_waiting >= v_room.max_queue_size then
    raise exception 'QUEUE_FULL';
  end if;

  if exists (
    select 1 from public.queue_items
    where room_id = p_room_id
      and video_id = p_video_id
      and status in ('WAITING', 'PLAYING')
  ) then
    raise exception 'DUPLICATE_IN_QUEUE';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.queue_items
  where room_id = p_room_id;

  insert into public.queue_items (
    room_id, video_id, title, channel_title, thumbnail_url,
    duration, position, status, added_by, dedicated_to, dedication
  )
  values (
    p_room_id, p_video_id, left(p_title, 300), left(p_channel, 200), p_thumb,
    p_duration, v_position, 'WAITING', p_actor,
    v_to, nullif(left(coalesce(p_dedication, ''), 120), '')
  )
  returning * into v_item;

  select exists (
    select 1 from public.queue_items
    where room_id = p_room_id and status = 'PLAYING'
  ) into v_has_playing;

  if not v_has_playing then
    update public.queue_items
       set status = 'PLAYING', started_at = now()
     where id = v_item.id
     returning * into v_item;

    update public.playback_states
       set queue_item_id    = v_item.id,
           -- ★★ ห้ามลืมสองบรรทัดนี้ (ดู 0021) — video_id ถูกบังคับโดย
           --    check constraint playback_playing_needs_anchor และเป็นค่าที่
           --    ตัวเล่นใช้จริง ส่วน paused_at ถ้าไม่ล้างจะค้างจากการหยุดครั้งก่อน
           video_id         = v_item.video_id,
           paused_at        = null,
           is_playing       = true,
           started_at       = now(),
           current_position = 0,
           version          = version + 1
     where room_id = p_room_id;
  end if;

  return v_item;
end;
$$;

revoke execute on function public.enqueue_track(uuid, uuid, text, text, text, text, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_track(uuid, uuid, text, text, text, text, integer, uuid, text)
  to service_role;

-- ★ ลบตัวเก่า 7 พารามิเตอร์ ไม่งั้น PostgREST เลือกไม่ถูก (PGRST203)
drop function if exists public.enqueue_track(uuid, uuid, text, text, text, text, integer);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · โหวตข้ามเพลง
-- ═════════════════════════════════════════════════════════════════════

/**
 * ★★★ ทำไมต้องมี ทั้งที่มีระบบให้สิทธิ์ลัดคิวอยู่แล้ว
 *
 *     ระบบสิทธิ์ตอบคำถาม "ใครมีอำนาจ" ซึ่งถูกต้องสำหรับการควบคุมห้อง
 *     แต่มันแก้ปัญหาที่เกิดจริงบ่อยที่สุดไม่ได้เลย: เจ้าของห้องปิดแท็บไปแล้ว
 *     เพลงที่ไม่มีใครอยากฟังจะค้างอยู่อย่างนั้นจนจบเพลง
 *
 *     ★ การโหวตไม่ใช่การแจกอำนาจเพิ่ม แต่เป็น "เสียงส่วนใหญ่ของคนที่อยู่ตอนนี้"
 *       ซึ่งเป็นคนละเรื่องกับสิทธิ์ และอยู่ร่วมกันได้โดยไม่ขัดกัน
 */
create table if not exists public.skip_votes (
  room_id       uuid not null references public.rooms(id) on delete cascade,
  queue_item_id uuid not null references public.queue_items(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (queue_item_id, user_id)
);

create index if not exists skip_votes_room_idx on public.skip_votes (room_id, queue_item_id);

alter table public.skip_votes enable row level security;

drop policy if exists skip_votes_read on public.skip_votes;
create policy skip_votes_read on public.skip_votes
  for select using (public.is_room_member(room_id));
-- ★ ไม่มี policy เขียน — เขียนผ่าน RPC เท่านั้น

/**
 * กดโหวต / ถอนโหวตข้ามเพลงปัจจุบัน
 *
 * ★★ นับจาก "คนที่ยังอยู่จริง" ไม่ใช่จำนวนสมาชิกทั้งหมด
 *
 *    ห้องที่มีคนเคยเข้ามา 20 คนแต่ตอนนี้เหลือ 3 จะไม่มีวันโหวตผ่าน
 *    ถ้าใช้ตัวหารเป็น 20 ★ เกณฑ์จึงต้องอิงคนที่ last_seen_at ยังสด
 *      ซึ่งเป็นตัวเลขเดียวกับที่หน้าห้องแสดงว่า "N คนกำลังฟัง"
 */
create or replace function public.toggle_skip_vote(
  p_room_id uuid,
  p_actor   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pb       public.playback_states;
  v_item     uuid;
  v_existed  boolean;
  v_votes    integer;
  v_live     integer;
  v_needed   integer;
  v_skipped  boolean := false;
  v_owner    uuid;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_pb from public.playback_states where room_id = p_room_id;
  if not found or v_pb.queue_item_id is null then
    raise exception 'NOTHING_PLAYING';
  end if;
  v_item := v_pb.queue_item_id;

  delete from public.skip_votes
   where queue_item_id = v_item and user_id = p_actor;
  v_existed := found;

  if not v_existed then
    insert into public.skip_votes (room_id, queue_item_id, user_id)
    values (p_room_id, v_item, p_actor);
  end if;

  select count(*) into v_votes
  from public.skip_votes where queue_item_id = v_item;

  select count(*) into v_live
  from public.room_members
  where room_id = p_room_id and last_seen_at > now() - interval '5 minutes';

  -- เกินครึ่งของคนที่อยู่ตอนนี้ · อย่างน้อยสองเสียงเสมอ
  -- ★ ขั้นต่ำสองเสียงกันไม่ให้คนที่อยู่คนเดียวในห้องกดข้ามผ่านช่องทางนี้
  --   โดยไม่ต้องมีสิทธิ์ ซึ่งจะกลายเป็นประตูหลังของระบบสิทธิ์ทั้งระบบ
  v_needed := greatest(2, (v_live / 2) + 1);

  if v_votes >= v_needed then
    select owner_id into v_owner from public.rooms where id = p_room_id;
    /*
     * ★ เรียก advance_queue ในนามเจ้าของห้อง
     *   ไม่ใช่เพราะเจ้าของสั่ง แต่เพราะ advance_queue ตรวจ "สิทธิ์ของผู้เรียก"
     *   และเสียงโหวตคืออำนาจคนละชุดที่ฟังก์ชันนั้นไม่รู้จัก
     *   ★ advance_queue ไม่ได้บันทึกว่าใครเป็นคนข้าม การยืมชื่อจึงไม่ทิ้งร่องรอย
     *     ที่ผิดความจริงไว้ในฐานข้อมูลเลย
     */
    perform public.advance_queue(p_room_id, v_owner, v_item, 'SKIPPED');
    delete from public.skip_votes where queue_item_id = v_item;
    v_skipped := true;
  end if;

  return jsonb_build_object(
    'voted',   not v_existed and not v_skipped,
    'votes',   case when v_skipped then 0 else v_votes end,
    'needed',  v_needed,
    'skipped', v_skipped
  );
end;
$$;

revoke execute on function public.toggle_skip_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_skip_vote(uuid, uuid) to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · เกมทายเพลง
-- ═════════════════════════════════════════════════════════════════════

/**
 * ★★★ ทำไมเป็น "ทายจากคำใบ้" ไม่ใช่ "เปิดเพลงแล้วปิดชื่อ"
 *
 *     แบบที่สนุกที่สุดคือเปิดเพลงให้ฟังแล้วบังจอไว้ — แต่ทำไม่ได้
 *     ★ ข้อกำหนดของ YouTube ห้ามบดบังตัวเล่น และการเอาแผ่นทึบไปคลุม iframe
 *       ก็คือการบังโฆษณาไปด้วยโดยปริยาย ซึ่งเป็นข้อห้ามตรง ๆ ของโปรเจกต์นี้
 *
 *     ★ คำใบ้ที่ค่อย ๆ เปิดให้ทีละชั้นสร้างความกดดันแบบเดียวกันได้
 *       โดยไม่ต้องแตะตัวเล่นเลยสักนิด และยังเล่นพร้อมกับเพลงที่เปิดอยู่ได้ด้วย
 */

create table if not exists public.quiz_games (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  host_id       uuid not null references public.profiles(id) on delete cascade,
  total_rounds  integer not null,
  round_idx     integer not null default 0,
  status        text not null default 'PLAYING',
  -- ── ข้อมูลของรอบปัจจุบันที่ "เปิดเผยได้" ────────────────────────
  hint_mask     text,
  hint_initials text,
  hint_channel  text,
  hint_duration integer,
  hint_adder    text,
  round_started_at timestamptz,
  round_ends_at    timestamptz,
  -- ── ผลของรอบที่เพิ่งจบ ──────────────────────────────────────────
  last_answer   text,
  last_cover    text,
  last_winner   text,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create unique index if not exists quiz_games_one_live_idx
  on public.quiz_games (room_id) where status = 'PLAYING';

/**
 * ★★★ ตารางนี้ไม่มี policy อ่าน และห้ามมี
 *   คอลัมน์ answer_key กับ video_id คือเฉลย การเปิดให้อ่านได้แม้แต่แถวเดียว
 *   แปลว่าเปิด devtools แล้วรู้คำตอบทุกข้อตั้งแต่วินาทีแรก
 *   ★ ทุกอย่างที่ client ต้องเห็นถูกคัดลอกไปไว้ใน quiz_games แล้ว
 */
create table if not exists public.quiz_rounds (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.quiz_games(id) on delete cascade,
  idx           integer not null,
  video_id      text not null,
  title         text not null,
  channel_title text,
  thumbnail_url text,
  answer_key    text not null,
  adder_name    text,
  winner_id     uuid references public.profiles(id) on delete set null,
  unique (game_id, idx)
);

create table if not exists public.quiz_scores (
  game_id  uuid not null references public.quiz_games(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  points   integer not null default 0,
  primary key (game_id, user_id)
);

alter table public.quiz_games  enable row level security;
alter table public.quiz_rounds enable row level security;
alter table public.quiz_scores enable row level security;

drop policy if exists quiz_games_read on public.quiz_games;
create policy quiz_games_read on public.quiz_games
  for select using (public.is_room_member(room_id));

drop policy if exists quiz_scores_read on public.quiz_scores;
create policy quiz_scores_read on public.quiz_scores
  for select using (
    exists (
      select 1 from public.quiz_games g
      where g.id = quiz_scores.game_id and public.is_room_member(g.room_id)
    )
  );

-- quiz_rounds: ไม่มี policy = ปฏิเสธทุกอย่าง ★ ตั้งใจ

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลขทิ้ง เพื่อให้เทียบคำตอบแบบใจกว้าง */
create or replace function public.quiz_norm(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^0-9a-z฀-๿]', '', 'g')
$$;

/**
 * ตัดชื่อเพลงให้เหลือแต่เนื้อ ๆ
 *
 * ★ ชื่อคลิปจริงหน้าตาแบบ "ชื่อเพลง - ศิลปิน [Official MV] (Lyrics)"
 *   ถ้าเทียบกับสตริงเต็ม คนตอบถูกก็ยังตอบผิด เพราะไม่มีใครพิมพ์ว่า Official MV
 */
create or replace function public.quiz_clean_title(p_title text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(coalesce(p_title, ''), '[\(\[\{].*?[\)\]\}]', ' ', 'g'),
      '(?i)\y(official|audio|lyrics?|video|mv|version|hd|4k|live|teaser|feat|ft)\y',
      ' ', 'g'
    )
  )
$$;

/** ป้ายปิดชื่อเพลง — เก็บช่องว่างไว้ให้เห็นว่ามีกี่คำ */
create or replace function public.quiz_mask(p_title text)
returns text
language sql
immutable
as $$
  select regexp_replace(public.quiz_clean_title(p_title), '[^ ]', '▢', 'g')
$$;

/** ตัวอักษรแรกของแต่ละคำ — คำใบ้ชั้นที่สอง */
create or replace function public.quiz_initials(p_title text)
returns text
language sql
immutable
as $$
  select string_agg(
    left(w, 1) || repeat('▢', greatest(char_length(w) - 1, 0)),
    ' '
  )
  from regexp_split_to_table(public.quiz_clean_title(p_title), '\s+') as w
  where w <> ''
$$;

/** เดินไปรอบถัดไป (หรือจบเกม) — ใช้ร่วมกันทั้งตอนเริ่มและตอนข้ามรอบ */
create or replace function public.quiz_open_round(p_game_id uuid, p_idx integer)
returns public.quiz_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  public.quiz_games;
  v_round public.quiz_rounds;
begin
  select * into v_round from public.quiz_rounds where game_id = p_game_id and idx = p_idx;

  if not found then
    update public.quiz_games
       set status        = 'ENDED',
           ended_at      = now(),
           round_started_at = null,
           round_ends_at    = null,
           hint_mask     = null,
           hint_initials = null
     where id = p_game_id
     returning * into v_game;
    return v_game;
  end if;

  update public.quiz_games
     set round_idx        = p_idx,
         hint_mask        = public.quiz_mask(v_round.title),
         hint_initials    = public.quiz_initials(v_round.title),
         hint_channel     = v_round.channel_title,
         hint_adder       = v_round.adder_name,
         round_started_at = now(),
         round_ends_at    = now() + interval '35 seconds',
         last_answer      = null,
         last_cover       = null,
         last_winner      = null
   where id = p_game_id
   returning * into v_game;

  return v_game;
end;
$$;

/**
 * เริ่มเกม
 *
 * ★ สุ่มจากเพลงที่ "ห้องนี้เคยฟังจริง" เท่านั้น
 *   เกมทายเพลงที่สุ่มจากคลังเพลงทั้งโลกคือเกมที่ไม่มีใครตอบถูก
 *   ส่วนเกมที่สุ่มจากเพลงที่กลุ่มนี้เปิดกันเองคือเกมที่ทุกคนมีสิทธิ์ลุ้น
 */
create or replace function public.quiz_start(
  p_room_id uuid,
  p_actor   uuid,
  p_rounds  integer default 5
)
returns public.quiz_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game    public.quiz_games;
  v_rounds  integer := least(greatest(coalesce(p_rounds, 5), 3), 10);
  v_have    integer;
  v_idx     integer := 0;
  v_row     record;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- เกมที่ค้างอยู่ให้จบไปก่อน ★ ไม่งั้น unique index จะเด้ง error ที่อ่านไม่รู้เรื่อง
  update public.quiz_games
     set status = 'ENDED', ended_at = now()
   where room_id = p_room_id and status = 'PLAYING';

  select count(distinct video_id) into v_have
  from public.queue_items
  where room_id = p_room_id and status = 'PLAYED';

  if v_have < 3 then
    raise exception 'NOT_ENOUGH_SONGS';
  end if;
  v_rounds := least(v_rounds, v_have);

  insert into public.quiz_games (room_id, host_id, total_rounds)
  values (p_room_id, p_actor, v_rounds)
  returning * into v_game;

  for v_row in
    select distinct on (q.video_id)
           q.video_id, q.title, q.channel_title, q.thumbnail_url,
           coalesce(p.nickname, p.display_name) as adder_name
    from public.queue_items q
    left join public.profiles p on p.id = q.added_by
    where q.room_id = p_room_id and q.status = 'PLAYED'
    order by q.video_id, q.created_at desc
  loop
    insert into public.quiz_rounds (
      game_id, idx, video_id, title, channel_title, thumbnail_url, answer_key, adder_name
    )
    values (
      v_game.id, v_idx, v_row.video_id, v_row.title, v_row.channel_title, v_row.thumbnail_url,
      public.quiz_norm(public.quiz_clean_title(v_row.title)), v_row.adder_name
    );
    v_idx := v_idx + 1;
  end loop;

  /*
   * ★ สุ่มลำดับหลัง insert ไม่ใช่ตอน select
   *   distinct on ต้อง order by video_id เป็นคอลัมน์แรกเสมอ จะแทรก random()
   *   เข้าไปไม่ได้ — ★ สลับเลขรอบทีหลังจึงเป็นวิธีเดียวที่ทำให้ทั้งสุ่มและไม่ซ้ำ
   */
  with shuffled as (
    select id, row_number() over (order by random()) - 1 as new_idx
    from public.quiz_rounds where game_id = v_game.id
  )
  update public.quiz_rounds r
     set idx = s.new_idx - 1000
    from shuffled s
   where r.id = s.id;
  update public.quiz_rounds set idx = idx + 1000 where game_id = v_game.id;

  delete from public.quiz_rounds where game_id = v_game.id and idx >= v_rounds;

  return public.quiz_open_round(v_game.id, 0);
end;
$$;

/**
 * ส่งคำตอบ
 *
 * ★★★ การตัดสินอยู่ที่นี่ที่เดียว ห้ามย้ายไปฝั่ง client เด็ดขาด
 *     ไม่ใช่เพราะกลัวคนโกง (เล่นกันในกลุ่มเพื่อน) แต่เพราะถ้าฝั่ง client
 *     เป็นคนบอกว่า "ฉันตอบถูก" แล้วยิง API มาขอแต้ม ใครก็ยิงเองได้ตรง ๆ
 *     ★ เฉลยไม่เคยออกจากเซิร์ฟเวอร์จนกว่ารอบจะจบ
 */
create or replace function public.quiz_answer(
  p_room_id uuid,
  p_actor   uuid,
  p_guess   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  public.quiz_games;
  v_round public.quiz_rounds;
  v_guess text := public.quiz_norm(p_guess);
  v_name  text;
begin
  select * into v_game
  from public.quiz_games
  where room_id = p_room_id and status = 'PLAYING'
  limit 1;

  if not found or v_game.round_started_at is null then
    return jsonb_build_object('active', false);
  end if;

  -- หมดเวลาแล้ว ยังไม่มีใครตอบถูก
  if now() > v_game.round_ends_at then
    return jsonb_build_object('active', false);
  end if;

  select * into v_round
  from public.quiz_rounds where game_id = v_game.id and idx = v_game.round_idx;

  if not found or v_round.winner_id is not null then
    return jsonb_build_object('active', false);
  end if;

  -- ★ สั้นเกินไปไม่นับ ไม่งั้นพิมพ์ "ก" รัว ๆ ก็ชนคำตอบได้ในที่สุด
  if char_length(v_guess) < 4 or position(v_guess in v_round.answer_key) = 0 then
    return jsonb_build_object('active', true, 'correct', false);
  end if;

  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  -- อ่านซ้ำหลังถือล็อก ★ กันสองคนตอบถูกพร้อมกันแล้วได้แต้มทั้งคู่
  select * into v_round
  from public.quiz_rounds where game_id = v_game.id and idx = v_game.round_idx for update;
  if v_round.winner_id is not null then
    return jsonb_build_object('active', true, 'correct', false);
  end if;

  update public.quiz_rounds set winner_id = p_actor where id = v_round.id;

  insert into public.quiz_scores (game_id, user_id, points)
  values (v_game.id, p_actor, 1)
  on conflict (game_id, user_id) do update set points = quiz_scores.points + 1;

  select coalesce(nickname, display_name) into v_name from public.profiles where id = p_actor;

  update public.quiz_games
     set last_answer   = public.quiz_clean_title(v_round.title),
         last_cover    = v_round.thumbnail_url,
         last_winner   = v_name,
         round_ends_at = now() + interval '6 seconds'
   where id = v_game.id;

  return jsonb_build_object('active', true, 'correct', true, 'answer', public.quiz_clean_title(v_round.title));
end;
$$;

/** ไปรอบถัดไป — เจ้าของเกมกด หรือใครก็ได้กดเมื่อหมดเวลาแล้ว */
create or replace function public.quiz_next(
  p_room_id uuid,
  p_actor   uuid
)
returns public.quiz_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  public.quiz_games;
  v_round public.quiz_rounds;
begin
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_game
  from public.quiz_games where room_id = p_room_id and status = 'PLAYING' limit 1;
  if not found then
    raise exception 'NO_GAME';
  end if;

  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- ★ ระหว่างรอบยังไม่หมดเวลา มีแค่คนเปิดเกมที่ข้ามได้
  --   ไม่งั้นใครกดรัว ๆ ก็ไล่รอบจนจบเกมได้ภายในสองวินาที
  if now() < v_game.round_ends_at and v_game.host_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  -- เฉลยให้ก่อนถ้ายังไม่มีใครตอบถูก
  select * into v_round
  from public.quiz_rounds where game_id = v_game.id and idx = v_game.round_idx;
  if found and v_round.winner_id is null then
    update public.quiz_games
       set last_answer = public.quiz_clean_title(v_round.title),
           last_cover  = v_round.thumbnail_url,
           last_winner = null
     where id = v_game.id;
  end if;

  return public.quiz_open_round(v_game.id, v_game.round_idx + 1);
end;
$$;

/** เลิกเกมกลางคัน */
create or replace function public.quiz_stop(p_room_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quiz_games
     set status = 'ENDED', ended_at = now(), round_started_at = null, round_ends_at = null
   where room_id = p_room_id
     and status = 'PLAYING'
     and (host_id = p_actor
          or exists (select 1 from public.rooms where id = p_room_id and owner_id = p_actor));
end;
$$;

revoke execute on function public.quiz_start(uuid, uuid, integer)  from public, anon, authenticated;
revoke execute on function public.quiz_answer(uuid, uuid, text)    from public, anon, authenticated;
revoke execute on function public.quiz_next(uuid, uuid)            from public, anon, authenticated;
revoke execute on function public.quiz_stop(uuid, uuid)            from public, anon, authenticated;
revoke execute on function public.quiz_open_round(uuid, integer)   from public, anon, authenticated;
grant execute on function public.quiz_start(uuid, uuid, integer)   to service_role;
grant execute on function public.quiz_answer(uuid, uuid, text)     to service_role;
grant execute on function public.quiz_next(uuid, uuid)             to service_role;
grant execute on function public.quiz_stop(uuid, uuid)             to service_role;
grant execute on function public.quiz_open_round(uuid, integer)    to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- Realtime
-- ═════════════════════════════════════════════════════════════════════

alter table public.skip_votes  replica identity full;
alter table public.quiz_games  replica identity full;
alter table public.quiz_scores replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.skip_votes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quiz_games;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quiz_scores;
  exception when duplicate_object then null;
  end;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- 0021_fix_enqueue_playback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0021 · แก้บั๊ก: เพิ่มเพลงเข้าคิวไม่ได้หลังรัน 0020
-- ─────────────────────────────────────────────────────────────────────
--
-- ★★★ อาการ
--
--     กดเพิ่มเพลงในห้องที่ไม่มีเพลงเล่นอยู่ → "เพิ่มเพลงไม่สำเร็จ"
--     ห้องที่มีเพลงเล่นอยู่แล้วเพิ่มได้ปกติ (เพลงถูกต่อท้ายคิวเฉย ๆ)
--
-- ★★★ สาเหตุ
--
--     0020 เขียน enqueue_track ใหม่ทั้งก้อนเพื่อรับฟิลด์ "ขอเพลงถึงเพื่อน"
--     และตอนคัดลอกเนื้อในเดิมมา ★ ทำสองบรรทัดตกไปจาก update playback_states:
--
--         video_id  = v_item.video_id
--         paused_at = null
--
--     ตาราง playback_states มี check constraint ตั้งแต่ 0002:
--
--         not is_playing
--         or (started_at is not null and queue_item_id is not null
--             and video_id is not null)
--
--     ★ พอเพลงแรกของห้องถูกตั้งเป็น PLAYING โดยไม่เขียน video_id
--       constraint จึงไม่ผ่าน → ทรานแซกชันทั้งก้อนถูกยกเลิก → เพิ่มเพลงไม่ได้
--
--     และในห้องที่เคยเล่นเพลงมาก่อน video_id เก่ายังค้างอยู่ constraint จึงผ่าน
--     แต่ ★★ ตัวเล่นจะไปเปิด "เพลงก่อนหน้า" แทนเพลงที่เพิ่งเพิ่ม
--       ซึ่งแย่กว่าพังเสียงดัง เพราะไม่มี error ให้เห็นเลย
--
-- ★★ บทเรียน
--
--    plpgsql แก้เฉพาะบางบรรทัดไม่ได้ ต้องเขียนใหม่ทั้งฟังก์ชันเสมอ
--    การคัดลอกเนื้อในเดิมมาจึงเป็นจุดที่ทำของตกหายได้ง่ายที่สุดในไฟล์ SQL
--    ★ ครั้งต่อไปที่ต้องเพิ่มพารามิเตอร์ให้ฟังก์ชันที่มีอยู่ ต้อง diff กับ
--      ตัวเดิมทีละบรรทัดก่อนรัน ไม่ใช่อ่านผ่านแล้วเชื่อว่าครบ
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.enqueue_track(
  p_room_id      uuid,
  p_actor        uuid,
  p_video_id     text,
  p_title        text,
  p_channel      text,
  p_thumb        text,
  p_duration     integer,
  p_dedicated_to uuid default null,
  p_dedication   text default null
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room        public.rooms;
  v_role        public.member_role;
  v_item        public.queue_items;
  v_position    bigint;
  v_waiting     integer;
  v_has_playing boolean;
  v_to          uuid := p_dedicated_to;
begin
  -- ★ บรรทัดแรกเสมอ — ทุกอย่างหลังจากนี้เป็นของห้องนี้คนเดียว
  perform pg_advisory_xact_lock(public.room_lock_key(p_room_id));

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id and user_id = p_actor;

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_room.is_locked then
    raise exception 'QUEUE_LOCKED';
  end if;

  if not public.perm_can_add(v_role, v_room) then
    raise exception 'FORBIDDEN';
  end if;

  /*
   * ★ คนที่ถูกขอให้ ต้องอยู่ในห้องนี้จริง
   *   ถ้าไม่อยู่ให้ทิ้งเป็น null ไม่ใช่ปฏิเสธทั้ง request — คนขออาจกดตอน
   *   เพื่อนเพิ่งออกจากห้องพอดี ซึ่งไม่ใช่ความผิดของเขา
   */
  if v_to is not null and not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = v_to
  ) then
    v_to := null;
  end if;

  select count(*) into v_waiting
  from public.queue_items
  where room_id = p_room_id and status = 'WAITING';

  if v_waiting >= v_room.max_queue_size then
    raise exception 'QUEUE_FULL';
  end if;

  -- เช็คซ้ำก่อน insert เพื่อให้ได้ error code ที่ถูกต้อง
  if exists (
    select 1 from public.queue_items
    where room_id = p_room_id
      and video_id = p_video_id
      and status in ('WAITING', 'PLAYING')
  ) then
    raise exception 'DUPLICATE_IN_QUEUE';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.queue_items
  where room_id = p_room_id;

  insert into public.queue_items (
    room_id, video_id, title, channel_title, thumbnail_url,
    duration, position, status, added_by, dedicated_to, dedication
  )
  values (
    p_room_id, p_video_id, left(p_title, 300), left(p_channel, 200), p_thumb,
    p_duration, v_position, 'WAITING', p_actor,
    v_to, nullif(left(coalesce(p_dedication, ''), 120), '')
  )
  returning * into v_item;

  -- ถ้าห้องเงียบอยู่ ให้เพลงนี้เริ่มเล่นทันทีในทรานแซกชันเดียวกัน
  select exists (
    select 1 from public.queue_items
    where room_id = p_room_id and status = 'PLAYING'
  ) into v_has_playing;

  if not v_has_playing then
    update public.queue_items
       set status = 'PLAYING', started_at = now()
     where id = v_item.id
     returning * into v_item;

    update public.playback_states
       set queue_item_id    = v_item.id,
           -- ★★ สองบรรทัดนี้คือสิ่งที่หายไปใน 0020
           video_id         = v_item.video_id,   -- constraint บังคับ + ตัวเล่นใช้ค่านี้
           paused_at        = null,              -- ไม่ล้างแล้วเวลาหยุดครั้งก่อนจะค้าง
           is_playing       = true,
           started_at       = now(),
           current_position = 0,
           version          = version + 1
     where room_id = p_room_id;
  end if;

  return v_item;
end;
$$;

revoke execute on function public.enqueue_track(uuid, uuid, text, text, text, text, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_track(uuid, uuid, text, text, text, text, integer, uuid, text)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- ★ ซ่อมห้องที่ค้างอยู่จากบั๊กนี้
-- ─────────────────────────────────────────────────────────────────────
-- ห้องที่เพิ่มเพลงสำเร็จระหว่างที่บั๊กยังอยู่ จะมี playback ที่ queue_item_id
-- ชี้เพลงใหม่แต่ video_id เป็นของเพลงเก่า — ตัวเล่นจึงเปิดผิดเพลง
-- ★ ดึง video_id กลับมาจากแถวคิวที่มันชี้อยู่ ซึ่งเป็นความจริงเสมอ
update public.playback_states pb
   set video_id = q.video_id
  from public.queue_items q
 where q.id = pb.queue_item_id
   and pb.video_id is distinct from q.video_id;

-- ═══════════════════════════════════════════════════════════════════
-- 0022_chat_style.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0022 · ธีมแชท + พื้นหลังแชท
-- ─────────────────────────────────────────────────────────────────────
--
-- ★★ ทำไมเก็บที่ "ห้อง" ไม่ใช่ที่ "คน"
--
--    แบบของ Messenger คือธีมเป็นของบทสนทนา ทุกคนในห้องเห็นเหมือนกัน
--    ซึ่งดูเหมือนแปลกตอนแรก — ทำไมคนอื่นมาเปลี่ยนสีจอเราได้
--
--    ★ แต่นั่นคือเหตุผลที่มันสนุก: การเปลี่ยนธีมกลายเป็นการกระทำร่วมกัน
--      ที่ทุกคนเห็นพร้อมกัน ไม่ใช่การตั้งค่าส่วนตัวที่ไม่มีใครรู้
--      ถ้าเป็นของใครของมัน มันจะเป็นแค่ preference ที่ไม่มีใครเปลี่ยน
--
-- ★★ ทำไมเก็บ "ชื่อธีม" ไม่ใช่ค่าสี
--
--    เก็บ '#00b900' ไว้แปลว่าวันที่เราปรับจานสีให้สวยขึ้น ห้องที่ตั้งไว้แล้ว
--    จะค้างอยู่กับสีเก่าตลอดไป และเราจะแก้โทนสว่าง/มืดให้เข้ากันไม่ได้เลย
--    ★ เก็บชื่อแล้วตีความตอนวาด — เหมือนที่ทำกับหน้าตาตัวละครในลอบบี้ (0019)
-- ─────────────────────────────────────────────────────────────────────

alter table public.rooms
  add column if not exists chat_theme         text,
  add column if not exists chat_wallpaper     text,
  add column if not exists chat_wallpaper_url text;

/*
 * ★★ รูปพื้นหลังที่อัปเอง เก็บคนละคอลัมน์กับลายสำเร็จ
 *
 *    ยัดรวมคอลัมน์เดียวแล้วดูจากว่า "ขึ้นต้นด้วย https ไหม" ก็ทำได้
 *    แต่ทำให้ข้อจำกัดความยาว 24 ตัวอักษรของลายสำเร็จใช้ไม่ได้อีกต่อไป
 *    ★ แยกคอลัมน์แล้วแต่ละอันมีกฎของตัวเองที่ฐานข้อมูลบังคับได้จริง
 *      และสลับกลับไปใช้ลายสำเร็จได้โดยไม่ต้องลบรูปที่อัปไว้
 */
alter table public.rooms drop constraint if exists rooms_chat_wallpaper_https;
alter table public.rooms
  add constraint rooms_chat_wallpaper_https
  check (chat_wallpaper_url is null or chat_wallpaper_url ~ '^https://');

alter table public.rooms drop constraint if exists rooms_chat_theme_len;
alter table public.rooms
  add constraint rooms_chat_theme_len
  check (chat_theme is null or char_length(chat_theme) <= 24);

alter table public.rooms drop constraint if exists rooms_chat_wallpaper_len;
alter table public.rooms
  add constraint rooms_chat_wallpaper_len
  check (chat_wallpaper is null or char_length(chat_wallpaper) <= 24);

/**
 * ตั้งธีม/พื้นหลังของห้อง
 *
 * ★ ใครก็ตามที่อยู่ในห้องเปลี่ยนได้ ไม่ต้องเป็นเจ้าของห้อง
 *   ตรงตามนโยบายของ 0012 — สิ่งที่ "แก้กลับได้ทันที" ไม่ต้องหวงสิทธิ์
 *   (ต่างจากการข้ามเพลงที่ทำลายสิ่งที่ทุกคนกำลังฟังอยู่แล้วกู้ไม่ได้)
 */
create or replace function public.set_chat_style(
  p_room_id       uuid,
  p_actor         uuid,
  p_theme         text,
  p_wallpaper     text,
  p_wallpaper_url text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.rooms
     set chat_theme         = nullif(left(coalesce(p_theme, ''), 24), ''),
         chat_wallpaper     = nullif(left(coalesce(p_wallpaper, ''), 24), ''),
         chat_wallpaper_url = nullif(btrim(coalesce(p_wallpaper_url, '')), '')
   where id = p_room_id
   returning * into v_room;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  return v_room;
end;
$$;

revoke execute on function public.set_chat_style(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_chat_style(uuid, uuid, text, text, text) to service_role;

-- ★ ลบตัวเก่า 4 พารามิเตอร์ถ้าเคยรันไปแล้ว ไม่งั้น PostgREST เลือกไม่ถูก (PGRST203)
--   บทเรียนเดียวกับตอนเพิ่มพารามิเตอร์ให้ enqueue_track
drop function if exists public.set_chat_style(uuid, uuid, text, text);

-- ★ rooms อยู่ใน publication อยู่แล้วตั้งแต่ 0006 — การเปลี่ยนธีมจึงเด้งถึง
--   ทุกเครื่องผ่านเส้นทางเดียวกับการเปลี่ยนชื่อห้อง ไม่ต้องต่อท่อใหม่
