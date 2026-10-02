-- ═════════════════════════════════════════════════════════════════════
-- 0038 · แชทออฟฟิศ — แชทเดี่ยวและแชทกลุ่ม
--
-- ★★★ ชื่อตารางขึ้นต้นด้วย office_ ทุกตัว
--
--     ห้องเพลงมีตาราง chat_messages ของตัวเองอยู่แล้ว (แชทในห้องฟังเพลง)
--     ★ ถ้าตั้งชื่อซ้ำ ไม่ใช่แค่ migration ล้ม — ที่แย่กว่าคือถ้ามันไม่ล้ม
--       แล้วโค้ดสองระบบไปเขียนตารางเดียวกันโดยไม่มีใครรู้
--     ★★ เงื่อนไขของเจ้าของระบบคือ "ของเดิมทำงานเหมือนเดิมทุกอย่าง"
--        การแตะตารางของห้องเพลงจึงเป็นสิ่งที่ห้ามทำโดยสิ้นเชิง
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.office_chat_rooms (
  id         uuid primary key default gen_random_uuid(),

  kind       text not null default 'DM'
             constraint office_chat_rooms_kind check (kind in ('DM', 'GROUP')),

  /** ชื่อห้อง — แชทเดี่ยวไม่มีชื่อ ใช้ชื่อของอีกฝ่ายแทนตอนแสดงผล */
  title      text
             constraint office_chat_rooms_title_len
             check (title is null or char_length(btrim(title)) between 1 and 60),

  created_by uuid not null references public.profiles(id) on delete cascade,

  /*
   * ★★ กุญแจคู่สนทนาของแชทเดี่ยว — เรียงสองไอดีจากน้อยไปมากแล้วต่อกัน
   *
   *    ★ ถ้าไม่มีคอลัมน์นี้ A ทักหา B แล้ว B ทักหา A จะได้ห้องคนละห้อง
   *      แล้วข้อความจะกระจายอยู่สองที่โดยที่ทั้งคู่คิดว่าอีกฝ่ายไม่ตอบ
   *    ★★ unique index บนคอลัมน์นี้ทำให้ "หนึ่งคู่มีได้ห้องเดียว" เป็นกฎของ
   *       ฐานข้อมูล ไม่ใช่ข้อตกลงที่โค้ดต้องจำ
   */
  pair_key   text,

  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.office_chat_rooms is
  'ห้องแชทของระบบออฟฟิศ — คนละตารางกับแชทในห้องฟังเพลงโดยสิ้นเชิง';

create unique index if not exists office_chat_rooms_pair_idx
  on public.office_chat_rooms (pair_key)
  where pair_key is not null;

create index if not exists office_chat_rooms_recent_idx
  on public.office_chat_rooms (last_message_at desc);


create table if not exists public.office_chat_members (
  room_id      uuid not null references public.office_chat_rooms(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,

  /*
   * ★★ เก็บ "อ่านถึงเมื่อไหร่" ไม่ใช่ "อ่านข้อความไหนบ้าง"
   *
   *    แบบหลังต้องเขียนหนึ่งแถวต่อข้อความต่อคน ★ ห้องกลุ่ม 20 คนคุยกัน
   *    วันละ 200 ข้อความ = 4,000 แถวต่อวันต่อห้อง เพื่อตอบคำถามเดียว
   *    ★ เวลาอ่านล่าสุดตอบคำถามเดียวกันด้วยแถวเดียวที่อัปเดตทับไปเรื่อย ๆ
   */
  last_read_at timestamptz not null default 'epoch',
  muted        boolean not null default false,
  joined_at    timestamptz not null default now(),

  primary key (room_id, user_id)
);

create index if not exists office_chat_members_user_idx
  on public.office_chat_members (user_id);


create table if not exists public.office_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.office_chat_rooms(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,

  text       text not null
             constraint office_chat_messages_len
             check (char_length(btrim(text)) between 1 and 2000),

  /** ★ ข้อความที่ถูกลบยังอยู่ในตาราง เพื่อไม่ให้ลำดับการสนทนาขาดหาย */
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists office_chat_messages_room_idx
  on public.office_chat_messages (room_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════
-- RLS — เห็นเฉพาะห้องที่ตัวเองเป็นสมาชิก
--
-- ★★★ ไม่มีข้อยกเว้นให้ Admin เหมือนกับ debts และ listing_messages
--     บทสนทนาส่วนตัวของพนักงานไม่ใช่ข้อมูลที่ผู้ดูแลระบบควรอ่านได้
--     ★ ถ้าวันหนึ่งมีเหตุต้องตรวจสอบจริง ต้องเป็นกระบวนการที่มีคนรับรู้
--       ไม่ใช่สิทธิ์ที่เปิดค้างไว้เงียบ ๆ ในโค้ด
-- ═════════════════════════════════════════════════════════════════════

alter table public.office_chat_rooms    enable row level security;
alter table public.office_chat_members  enable row level security;
alter table public.office_chat_messages enable row level security;

drop policy if exists office_chat_rooms_read on public.office_chat_rooms;
create policy office_chat_rooms_read on public.office_chat_rooms
  for select using (
    exists (
      select 1 from public.office_chat_members m
      where m.room_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists office_chat_members_read on public.office_chat_members;
create policy office_chat_members_read on public.office_chat_members
  for select using (
    exists (
      select 1 from public.office_chat_members me
      where me.room_id = office_chat_members.room_id and me.user_id = auth.uid()
    )
  );

drop policy if exists office_chat_messages_read on public.office_chat_messages;
create policy office_chat_messages_read on public.office_chat_messages
  for select using (
    exists (
      select 1 from public.office_chat_members m
      where m.room_id = office_chat_messages.room_id and m.user_id = auth.uid()
    )
  );


-- ═════════════════════════════════════════════════════════════════════
-- RPC
-- ═════════════════════════════════════════════════════════════════════

/**
 * เปิดแชทเดี่ยวกับอีกคน — มีอยู่แล้วก็คืนห้องเดิม
 *
 * ★ idempotent โดยสมบูรณ์ กดกี่ครั้งก็ได้ห้องเดียวกัน
 *   ★★ ใช้ on conflict กับ unique index ของ pair_key แทนการ select ก่อน insert
 *      ★ เพราะสองคนกดพร้อมกันจะผ่าน select ทั้งคู่แล้วสร้างสองห้อง
 *        การให้ฐานข้อมูลตัดสินคือทางเดียวที่ไม่มีช่องว่างระหว่างเช็กกับเขียน
 */
create or replace function public.open_office_dm(p_actor uuid, p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text;
  v_room uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_actor = p_other then
    raise exception 'VALIDATION_FAILED: cannot chat with yourself';
  end if;

  if not public.employee_code_is_valid(p_other) then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  v_key := least(p_actor::text, p_other::text) || ':' || greatest(p_actor::text, p_other::text);

  insert into public.office_chat_rooms (kind, created_by, pair_key)
  values ('DM', p_actor, v_key)
  on conflict (pair_key) do update set pair_key = excluded.pair_key
  returning id into v_room;

  insert into public.office_chat_members (room_id, user_id)
  values (v_room, p_actor), (v_room, p_other)
  on conflict do nothing;

  return v_room;
end;
$$;


/** สร้างห้องกลุ่ม */
create or replace function public.create_office_group(
  p_actor   uuid,
  p_title   text,
  p_members uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
  v_id   uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'VALIDATION_FAILED: title';
  end if;

  if coalesce(array_length(p_members, 1), 0) < 1 then
    raise exception 'VALIDATION_FAILED: need members';
  end if;

  insert into public.office_chat_rooms (kind, title, created_by)
  values ('GROUP', btrim(p_title), p_actor)
  returning id into v_room;

  insert into public.office_chat_members (room_id, user_id) values (v_room, p_actor);

  /* ★ เติมเฉพาะคนที่ยังมีรหัสพนักงานใช้ได้ — คนที่ลาออกไม่ถูกดึงเข้ากลุ่มใหม่ */
  foreach v_id in array p_members loop
    if v_id <> p_actor and public.employee_code_is_valid(v_id) then
      insert into public.office_chat_members (room_id, user_id)
      values (v_room, v_id)
      on conflict do nothing;
    end if;
  end loop;

  return v_room;
end;
$$;


/** ส่งข้อความ */
create or replace function public.send_office_chat(
  p_actor uuid,
  p_room  uuid,
  p_text  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_title text;
  v_row   record;
  v_name  text;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.office_chat_members
    where room_id = p_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if btrim(coalesce(p_text, '')) = '' or char_length(btrim(p_text)) > 2000 then
    raise exception 'VALIDATION_FAILED: text';
  end if;

  insert into public.office_chat_messages (room_id, sender_id, text)
  values (p_room, p_actor, btrim(p_text))
  returning id into v_id;

  update public.office_chat_rooms set last_message_at = now() where id = p_room;

  /* ★ คนส่งถือว่าอ่านข้อความของตัวเองแล้วเสมอ */
  update public.office_chat_members
  set last_read_at = now()
  where room_id = p_room and user_id = p_actor;

  select coalesce(r.title, p.nickname, p.display_name)
  into v_title
  from public.office_chat_rooms r
  join public.profiles p on p.id = p_actor
  where r.id = p_room;

  select coalesce(nickname, display_name) into v_name from public.profiles where id = p_actor;

  /*
   * ★★ แจ้งเตือนเฉพาะคนที่ไม่ได้ปิดเสียงห้องนี้
   *    ★ และไม่แจ้งคนส่งเอง ซึ่งเป็นข้อผิดพลาดที่เจอบ่อยในระบบแชท
   */
  for v_row in
    select m.user_id
    from public.office_chat_members m
    where m.room_id = p_room and m.user_id <> p_actor and not m.muted
  loop
    perform public.notify(
      v_row.user_id,
      'chatMessage',
      'notify.type.chatMessage',
      jsonb_build_object('name', v_name, 'room', v_title),
      '/office/chat'
    );
  end loop;

  return v_id;
end;
$$;


/** ทำเครื่องหมายว่าอ่านถึงตอนนี้แล้ว */
create or replace function public.read_office_chat(p_actor uuid, p_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.office_chat_members
  set last_read_at = now()
  where room_id = p_room and user_id = p_actor;
$$;


/** เปิด/ปิดเสียงแจ้งเตือนของห้อง */
create or replace function public.mute_office_chat(p_actor uuid, p_room uuid, p_muted boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.office_chat_members
  set muted = p_muted
  where room_id = p_room and user_id = p_actor;
$$;


/** ออกจากห้องกลุ่ม — ห้องเดี่ยวออกไม่ได้ */
create or replace function public.leave_office_group(p_actor uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.office_chat_rooms where id = p_room and kind = 'GROUP'
  ) then
    raise exception 'VALIDATION_FAILED: not a group';
  end if;

  delete from public.office_chat_members where room_id = p_room and user_id = p_actor;
end;
$$;


/**
 * รายการห้องแชทของฉัน พร้อมข้อความล่าสุดและจำนวนที่ยังไม่อ่าน
 *
 * ★★ คืนก้อนเดียวจบ ไม่ให้หน้าเว็บยิงทีละห้อง
 *    ★ หน้ารายการแชทที่ยิง N+1 request จะกระพริบทีละแถวตอนเปิด
 *      ซึ่งเป็นอาการที่คนอ่านว่า "แอปช้า" ทันที
 */
create or replace function public.my_office_chats(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(x order by x.last_message_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      r.id,
      r.kind,
      r.last_message_at,
      me.muted,
      /* ★ แชทเดี่ยวใช้ชื่ออีกฝ่าย ส่วนกลุ่มใช้ชื่อห้อง */
      coalesce(
        r.title,
        (
          select coalesce(p.nickname, p.display_name)
          from public.office_chat_members om
          join public.profiles p on p.id = om.user_id
          where om.room_id = r.id and om.user_id <> p_actor
          limit 1
        ),
        '—'
      ) as title,
      (
        select coalesce(p.avatar_url, '')
        from public.office_chat_members om
        join public.profiles p on p.id = om.user_id
        where om.room_id = r.id and om.user_id <> p_actor
        limit 1
      ) as avatar,
      (select count(*) from public.office_chat_members om where om.room_id = r.id) as members,
      (
        select msg.text
        from public.office_chat_messages msg
        where msg.room_id = r.id and msg.deleted_at is null
        order by msg.created_at desc
        limit 1
      ) as last_text,
      (
        select count(*)
        from public.office_chat_messages msg
        where msg.room_id = r.id
          and msg.sender_id <> p_actor
          and msg.created_at > me.last_read_at
      ) as unread
    from public.office_chat_members me
    join public.office_chat_rooms r on r.id = me.room_id
    where me.user_id = p_actor
  ) x;

  return v_out;
end;
$$;


revoke all on function public.open_office_dm(uuid, uuid)                 from public;
revoke all on function public.create_office_group(uuid, text, uuid[])    from public;
revoke all on function public.send_office_chat(uuid, uuid, text)         from public;
revoke all on function public.read_office_chat(uuid, uuid)               from public;
revoke all on function public.mute_office_chat(uuid, uuid, boolean)      from public;
revoke all on function public.leave_office_group(uuid, uuid)             from public;
revoke all on function public.my_office_chats(uuid)                      from public;

grant execute on function public.open_office_dm(uuid, uuid)              to service_role;
grant execute on function public.create_office_group(uuid, text, uuid[]) to service_role;
grant execute on function public.send_office_chat(uuid, uuid, text)      to service_role;
grant execute on function public.read_office_chat(uuid, uuid)            to service_role;
grant execute on function public.mute_office_chat(uuid, uuid, boolean)   to service_role;
grant execute on function public.leave_office_group(uuid, uuid)          to service_role;
grant execute on function public.my_office_chats(uuid)                   to service_role;


-- ═════════════════════════════════════════════════════════════════════
-- Realtime
-- ═════════════════════════════════════════════════════════════════════

do $$
begin
  begin
    alter publication supabase_realtime add table public.office_chat_messages;
  exception
    when duplicate_object then null;
    when others then raise notice 'office_chat_messages: %', sqlerrm;
  end;

  begin
    alter publication supabase_realtime add table public.office_chat_rooms;
  exception
    when duplicate_object then null;
    when others then raise notice 'office_chat_rooms: %', sqlerrm;
  end;
end $$;

alter table public.office_chat_rooms replica identity full;
