-- ═════════════════════════════════════════════════════════════════════
-- 0040 · แชทเต็มระบบ — โปรไฟล์กลุ่ม · ไฟล์ · ตอบกลับ · แก้ไข · ปักหมุด
--
-- ★★★ ลงโครงให้ครบทีเดียว แล้วค่อยต่อหน้าจอทีละส่วน
--
--     ฟีเจอร์ที่ขอมา (รูป · ไฟล์ · เสียง · ตอบกลับ · แก้ไข · ปักหมุด ·
--     mention · ค้นหา · ซ่อน/ปักหมุดแชท) ★ เกือบทั้งหมดต้องการคอลัมน์ใหม่
--     ในตารางเดียวกัน
--     ★★ ถ้าเพิ่มทีละฟีเจอร์จะได้ migration สิบไฟล์ที่ alter ตารางเดิมซ้ำ ๆ
--        ซึ่งรันช้าและพลาดง่าย — ลงครั้งเดียวจบแล้วค่อยเปิดใช้ทีละอย่างดีกว่า
-- ═════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1 · ห้อง: รูปกลุ่ม · ข้อความที่ปักหมุด
-- ─────────────────────────────────────────────────────────────────────

alter table public.office_chat_rooms
  add column if not exists avatar_path       text,
  add column if not exists pinned_message_id uuid,
  add column if not exists updated_at        timestamptz not null default now();


-- ─────────────────────────────────────────────────────────────────────
-- 2 · สมาชิก: บทบาท · ปักหมุดแชท · ซ่อนแชท · ทำเป็นยังไม่อ่าน
-- ─────────────────────────────────────────────────────────────────────

alter table public.office_chat_members
  add column if not exists role     text not null default 'MEMBER'
           constraint office_chat_members_role check (role in ('OWNER', 'MEMBER')),
  /* ★ ปักหมุดแชทไว้บนสุดของรายการ — ของใครของมัน ไม่ใช่ของทั้งห้อง */
  add column if not exists pinned   boolean not null default false,
  /* ★ ซ่อนแชท = หายจากรายการจนกว่าจะมีข้อความใหม่ ไม่ใช่ลบทิ้ง */
  add column if not exists hidden   boolean not null default false,
  /* ★★ ทำเป็น "ยังไม่อ่าน" ทั้งที่อ่านไปแล้ว — ใช้เป็นที่คั่นว่า "เดี๋ยวกลับมาตอบ"
     ★ เก็บเป็นธงแยก ไม่ใช่ย้อน last_read_at กลับไป เพราะการย้อนเวลาอ่าน
       จะทำให้จำนวนที่ยังไม่อ่านผิดไปจากความจริง */
  add column if not exists forced_unread boolean not null default false;

/* ★ ผู้สร้างห้องเป็นเจ้าของห้องย้อนหลังให้ด้วย */
update public.office_chat_members m
set role = 'OWNER'
from public.office_chat_rooms r
where r.id = m.room_id and r.created_by = m.user_id and m.role <> 'OWNER';


-- ─────────────────────────────────────────────────────────────────────
-- 3 · ข้อความ: ชนิด · ไฟล์แนบ · ตอบกลับ · แก้ไข · mention
-- ─────────────────────────────────────────────────────────────────────

alter table public.office_chat_messages
  add column if not exists kind text not null default 'TEXT'
           constraint office_chat_messages_kind
           check (kind in ('TEXT', 'IMAGE', 'FILE', 'AUDIO', 'STICKER', 'SYSTEM')),
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size integer,
  add column if not exists mime      text,
  /* ★ ตอบกลับชี้ไปข้อความเดิม — ลบข้อความต้นทางแล้วให้เหลือ null
     ★★ ไม่ใช่ cascade delete เพราะข้อความที่ตอบกลับไปยังมีความหมายของตัวเอง */
  add column if not exists reply_to  uuid references public.office_chat_messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  /* ★ รายชื่อคนที่ถูก mention — เก็บเป็น array เพราะอ่านพร้อมข้อความเสมอ
     และไม่มี query ไหนที่ต้องหา "ข้อความทั้งหมดที่ mention คนนี้" ข้ามห้อง */
  add column if not exists mentions  uuid[] not null default '{}';

/* ★★ ข้อความรูป/ไฟล์ไม่มีข้อความก็ได้ — ผ่อนข้อบังคับความยาวเดิม */
alter table public.office_chat_messages
  drop constraint if exists office_chat_messages_len;

alter table public.office_chat_messages
  add constraint office_chat_messages_len
  check (
    (kind = 'TEXT' and char_length(btrim(text)) between 1 and 2000)
    or (kind <> 'TEXT' and char_length(text) <= 2000)
  );

/* ★ ค้นหาข้อความด้วย trigram — pg_trgm ติดมาแล้วตั้งแต่ 0025 */
create index if not exists office_chat_messages_text_idx
  on public.office_chat_messages using gin (text gin_trgm_ops);

alter table public.office_chat_rooms
  drop constraint if exists office_chat_rooms_pinned_fk;

alter table public.office_chat_rooms
  add constraint office_chat_rooms_pinned_fk
  foreign key (pinned_message_id) references public.office_chat_messages(id) on delete set null;


-- ─────────────────────────────────────────────────────────────────────
-- 4 · ที่เก็บไฟล์แชท
--
-- ★★★ เป็น bucket ส่วนตัว ไม่ใช่สาธารณะ
--     รูปในแชทส่วนตัวคือของส่วนตัว ★ ต่างจากรูปสินค้าในตลาดนัดที่ทุกคน
--     ในบริษัทเห็นได้อยู่แล้ว — อันนั้นเป็น public ได้ อันนี้ไม่ได้
--     ★★ หน้าเว็บจึงต้องขอ signed URL ทุกครั้ง เหมือนสลิปกับ QR รับเงิน
-- ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  20971520,  -- 20 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
    'video/mp4', 'video/webm',
    'application/pdf',
    'application/zip',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · RPC
-- ═════════════════════════════════════════════════════════════════════

/** แก้โปรไฟล์กลุ่ม — ชื่อและรูป */
create or replace function public.update_office_group(
  p_actor  uuid,
  p_room   uuid,
  p_title  text default null,
  p_avatar text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * ★★ ใครก็ได้ในกลุ่มแก้ชื่อ/รูปได้ ไม่ใช่เฉพาะเจ้าของ
   *
   *    ★ กลุ่มออฟฟิศไม่ใช่ชุมชนสาธารณะที่ต้องกันคนก่อกวน — ทุกคนในกลุ่ม
   *      รู้จักกันหมดและมีชื่อจริงติดอยู่
   *    ★★ การบังคับให้รอเจ้าของกลุ่มมาแก้ชื่อที่พิมพ์ผิดคือความยุ่งยาก
   *       ที่ไม่ได้ป้องกันอะไรเลย
   */
  if not exists (
    select 1 from public.office_chat_members
    where room_id = p_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.office_chat_rooms where id = p_room and kind = 'GROUP') then
    raise exception 'VALIDATION_FAILED: not a group';
  end if;

  update public.office_chat_rooms
  set title      = case
                     when p_title is null then title
                     when btrim(p_title) = '' then title
                     else btrim(p_title)
                   end,
      avatar_path = coalesce(p_avatar, avatar_path),
      updated_at  = now()
  where id = p_room;
end;
$$;


/** เพิ่มสมาชิกเข้ากลุ่ม */
create or replace function public.add_office_members(
  p_actor   uuid,
  p_room    uuid,
  p_members uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count integer := 0;
  v_name  text;
begin
  if not exists (
    select 1 from public.office_chat_members where room_id = p_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.office_chat_rooms where id = p_room and kind = 'GROUP') then
    raise exception 'VALIDATION_FAILED: not a group';
  end if;

  foreach v_id in array p_members loop
    if public.employee_code_is_valid(v_id)
       and not exists (
         select 1 from public.office_chat_members where room_id = p_room and user_id = v_id
       )
    then
      insert into public.office_chat_members (room_id, user_id) values (p_room, v_id);
      v_count := v_count + 1;

      /*
       * ★★ บันทึกเป็นข้อความระบบในห้อง ไม่ใช่เงียบ ๆ
       *    ★ คนในกลุ่มต้องเห็นว่าใครถูกเพิ่มเข้ามาเมื่อไหร่ — ไม่งั้นจู่ ๆ
       *      มีคนใหม่อ่านบทสนทนาย้อนหลังได้โดยไม่มีใครรู้
       */
      select coalesce(nickname, display_name) into v_name from public.profiles where id = v_id;
      insert into public.office_chat_messages (room_id, sender_id, text, kind)
      values (p_room, p_actor, v_name || ' เข้าร่วมกลุ่มแล้ว', 'SYSTEM');
    end if;
  end loop;

  if v_count > 0 then
    update public.office_chat_rooms set last_message_at = now() where id = p_room;
  end if;

  return v_count;
end;
$$;


/** เอาสมาชิกออกจากกลุ่ม */
create or replace function public.remove_office_member(
  p_actor  uuid,
  p_room   uuid,
  p_member uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  /* ★ เอาคนอื่นออกได้เฉพาะเจ้าของกลุ่ม — ต่างจากการแก้ชื่อที่ใครก็ทำได้
       ★★ เพราะการเอาคนออกเป็นสิ่งที่ย้อนกลับไม่ได้ด้วยตัวคนนั้นเอง */
  if not exists (
    select 1 from public.office_chat_members
    where room_id = p_room and user_id = p_actor and role = 'OWNER'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_member = p_actor then
    raise exception 'VALIDATION_FAILED: use leave instead';
  end if;

  delete from public.office_chat_members where room_id = p_room and user_id = p_member;

  select coalesce(nickname, display_name) into v_name from public.profiles where id = p_member;
  insert into public.office_chat_messages (room_id, sender_id, text, kind)
  values (p_room, p_actor, v_name || ' ออกจากกลุ่มแล้ว', 'SYSTEM');

  update public.office_chat_rooms set last_message_at = now() where id = p_room;
end;
$$;


/** ส่งข้อความ — รองรับไฟล์ ตอบกลับ และ mention */
create or replace function public.send_office_chat_v2(
  p_actor     uuid,
  p_room      uuid,
  p_text      text,
  p_kind      text default 'TEXT',
  p_file_path text default null,
  p_file_name text default null,
  p_file_size integer default null,
  p_mime      text default null,
  p_reply_to  uuid default null,
  p_mentions  uuid[] default '{}'
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
    select 1 from public.office_chat_members where room_id = p_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_kind = 'TEXT' and btrim(coalesce(p_text, '')) = '' then
    raise exception 'VALIDATION_FAILED: text';
  end if;

  if p_kind <> 'TEXT' and p_kind <> 'STICKER' and p_file_path is null then
    raise exception 'VALIDATION_FAILED: file';
  end if;

  insert into public.office_chat_messages
    (room_id, sender_id, text, kind, file_path, file_name, file_size, mime, reply_to, mentions)
  values
    (p_room, p_actor, coalesce(btrim(p_text), ''), p_kind, p_file_path, p_file_name,
     p_file_size, p_mime, p_reply_to, coalesce(p_mentions, '{}'))
  returning id into v_id;

  update public.office_chat_rooms set last_message_at = now() where id = p_room;

  update public.office_chat_members
  set last_read_at = now(), forced_unread = false
  where room_id = p_room and user_id = p_actor;

  /* ★ ห้องที่ถูกซ่อนไว้กลับขึ้นมาเมื่อมีข้อความใหม่ */
  update public.office_chat_members
  set hidden = false
  where room_id = p_room and hidden;

  select coalesce(r.title, p.nickname, p.display_name)
  into v_title
  from public.office_chat_rooms r
  join public.profiles p on p.id = p_actor
  where r.id = p_room;

  select coalesce(nickname, display_name) into v_name from public.profiles where id = p_actor;

  /*
   * ★★ คนที่ถูก mention ได้แจ้งเตือนเสมอ แม้ปิดเสียงห้องไว้
   *    ★ การปิดเสียงหมายถึง "ไม่ต้องเตือนทุกข้อความ" ไม่ได้แปลว่า
   *      "ห้ามเตือนแม้จะเรียกชื่อฉันตรง ๆ"
   */
  for v_row in
    select m.user_id
    from public.office_chat_members m
    where m.room_id = p_room
      and m.user_id <> p_actor
      and (not m.muted or m.user_id = any(coalesce(p_mentions, '{}')))
  loop
    perform public.notify(
      v_row.user_id,
      'chatMessage',
      case when v_row.user_id = any(coalesce(p_mentions, '{}'))
           then 'notify.type.chatMention'
           else 'notify.type.chatMessage' end,
      jsonb_build_object('name', v_name, 'room', v_title),
      '/office/chat'
    );
  end loop;

  return v_id;
end;
$$;


/** แก้ไขข้อความของตัวเอง */
create or replace function public.edit_office_chat(p_actor uuid, p_msg uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if btrim(coalesce(p_text, '')) = '' or char_length(btrim(p_text)) > 2000 then
    raise exception 'VALIDATION_FAILED: text';
  end if;

  /* ★ แก้ได้เฉพาะข้อความตัวอักษรของตัวเอง — ไฟล์ที่ส่งไปแล้วแก้เนื้อไม่ได้ */
  update public.office_chat_messages
  set text = btrim(p_text), edited_at = now()
  where id = p_msg and sender_id = p_actor and kind = 'TEXT' and deleted_at is null;

  if not found then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;


/** ลบข้อความของตัวเอง — ยกเลิกการส่ง */
create or replace function public.delete_office_chat(p_actor uuid, p_msg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.office_chat_messages
  set deleted_at = now()
  where id = p_msg and sender_id = p_actor and deleted_at is null;

  if not found then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;


/** ปักหมุดข้อความในห้อง — ปักซ้ำที่เดิมคือถอดหมุด */
create or replace function public.pin_office_message(p_actor uuid, p_room uuid, p_msg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid;
begin
  if not exists (
    select 1 from public.office_chat_members where room_id = p_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select pinned_message_id into v_current from public.office_chat_rooms where id = p_room;

  update public.office_chat_rooms
  set pinned_message_id = case when v_current is not distinct from p_msg then null else p_msg end,
      updated_at = now()
  where id = p_room;
end;
$$;


/** ตั้งค่าของแชทรายคน — ปักหมุด · ซ่อน · ทำเป็นยังไม่อ่าน · ปิดเสียง */
create or replace function public.set_office_chat_pref(
  p_actor  uuid,
  p_room   uuid,
  p_field  text,
  p_value  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_field not in ('pinned', 'hidden', 'muted', 'forced_unread') then
    raise exception 'VALIDATION_FAILED: field';
  end if;

  update public.office_chat_members
  set pinned        = case when p_field = 'pinned' then p_value else pinned end,
      hidden        = case when p_field = 'hidden' then p_value else hidden end,
      muted         = case when p_field = 'muted' then p_value else muted end,
      forced_unread = case when p_field = 'forced_unread' then p_value else forced_unread end
  where room_id = p_room and user_id = p_actor;
end;
$$;


/**
 * ค้นหาข้อความในห้องที่ฉันอยู่
 *
 * ★ จำกัดที่ห้องของตัวเองเสมอ — ฟังก์ชันนี้เป็น security definer
 *   ถ้าลืมกรองจะกลายเป็นช่องอ่านแชทคนอื่นทั้งบริษัทด้วยคำค้นเดียว
 */
create or replace function public.search_office_chat(
  p_actor uuid,
  p_query text,
  p_room  uuid default null
)
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

  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      msg.id,
      msg.room_id,
      msg.text,
      msg.created_at,
      coalesce(p.nickname, p.display_name) as sender,
      coalesce(
        r.title,
        (select coalesce(p2.nickname, p2.display_name)
         from public.office_chat_members om
         join public.profiles p2 on p2.id = om.user_id
         where om.room_id = r.id and om.user_id <> p_actor
         limit 1),
        '—'
      ) as room_title
    from public.office_chat_messages msg
    join public.office_chat_members me on me.room_id = msg.room_id and me.user_id = p_actor
    join public.office_chat_rooms r on r.id = msg.room_id
    join public.profiles p on p.id = msg.sender_id
    where msg.deleted_at is null
      and msg.kind in ('TEXT', 'FILE', 'IMAGE')
      and msg.text ilike '%' || btrim(p_query) || '%'
      and (p_room is null or msg.room_id = p_room)
    limit 50
  ) x;

  return v_out;
end;
$$;


revoke all on function public.update_office_group(uuid, uuid, text, text)   from public;
revoke all on function public.add_office_members(uuid, uuid, uuid[])        from public;
revoke all on function public.remove_office_member(uuid, uuid, uuid)        from public;
revoke all on function public.send_office_chat_v2(uuid, uuid, text, text, text, text, integer, text, uuid, uuid[]) from public;
revoke all on function public.edit_office_chat(uuid, uuid, text)            from public;
revoke all on function public.delete_office_chat(uuid, uuid)                from public;
revoke all on function public.pin_office_message(uuid, uuid, uuid)          from public;
revoke all on function public.set_office_chat_pref(uuid, uuid, text, boolean) from public;
revoke all on function public.search_office_chat(uuid, text, uuid)          from public;

grant execute on function public.update_office_group(uuid, uuid, text, text)   to service_role;
grant execute on function public.add_office_members(uuid, uuid, uuid[])        to service_role;
grant execute on function public.remove_office_member(uuid, uuid, uuid)        to service_role;
grant execute on function public.send_office_chat_v2(uuid, uuid, text, text, text, text, integer, text, uuid, uuid[]) to service_role;
grant execute on function public.edit_office_chat(uuid, uuid, text)            to service_role;
grant execute on function public.delete_office_chat(uuid, uuid)                to service_role;
grant execute on function public.pin_office_message(uuid, uuid, uuid)          to service_role;
grant execute on function public.set_office_chat_pref(uuid, uuid, text, boolean) to service_role;
grant execute on function public.search_office_chat(uuid, text, uuid)          to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 6 · รายการห้อง เวอร์ชันที่รู้จักหมุด ซ่อน และยังไม่อ่านแบบบังคับ
-- ─────────────────────────────────────────────────────────────────────

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

  select coalesce(jsonb_agg(x order by x.pinned desc, x.last_message_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      r.id,
      r.kind,
      r.last_message_at,
      r.avatar_path,
      me.muted,
      me.pinned,
      me.role,
      coalesce(
        r.title,
        (select coalesce(p.nickname, p.display_name)
         from public.office_chat_members om
         join public.profiles p on p.id = om.user_id
         where om.room_id = r.id and om.user_id <> p_actor
         limit 1),
        '—'
      ) as title,
      (select coalesce(p.avatar_url, '')
       from public.office_chat_members om
       join public.profiles p on p.id = om.user_id
       where om.room_id = r.id and om.user_id <> p_actor
       limit 1) as avatar,
      (select count(*) from public.office_chat_members om where om.room_id = r.id) as members,
      (select case
                when msg.kind = 'IMAGE' then '[รูปภาพ]'
                when msg.kind = 'FILE'  then '[ไฟล์] ' || coalesce(msg.file_name, '')
                when msg.kind = 'AUDIO' then '[ข้อความเสียง]'
                when msg.kind = 'STICKER' then msg.text
                else msg.text
              end
       from public.office_chat_messages msg
       where msg.room_id = r.id and msg.deleted_at is null
       order by msg.created_at desc
       limit 1) as last_text,
      /* ★ ทำเป็นยังไม่อ่านด้วยมือ = นับเป็นอย่างน้อยหนึ่ง */
      greatest(
        (select count(*)
         from public.office_chat_messages msg
         where msg.room_id = r.id
           and msg.sender_id <> p_actor
           and msg.created_at > me.last_read_at),
        case when me.forced_unread then 1 else 0 end
      ) as unread
    from public.office_chat_members me
    join public.office_chat_rooms r on r.id = me.room_id
    where me.user_id = p_actor and not me.hidden
  ) x;

  return v_out;
end;
$$;

revoke all on function public.my_office_chats(uuid) from public;
grant execute on function public.my_office_chats(uuid) to service_role;
