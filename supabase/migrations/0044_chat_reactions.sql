-- ===========================================================================
-- 0044 · อิโมจิความรู้สึกบนข้อความแชทออฟฟิศ + รู้ว่าคู่สนทนาเป็นใคร
-- ===========================================================================
--
-- ★★★ ทำไมไม่ใช้ตาราง chat_reactions ของห้องเพลงที่มีอยู่แล้ว (0016)
--
--     ตารางนั้น message_id อ้างถึง public.chat_messages ด้วย foreign key
--     ★ ข้อความแชทออฟฟิศอยู่ในตาราง office_chat_messages คนละตารางกัน
--       ★★ foreign key ชี้ได้ตารางเดียว จะยัดสองที่ลงคอลัมน์เดียวไม่ได้
--          นอกจากจะถอด FK ออก — ซึ่งแปลว่าเปิดทางให้มีแถวที่ชี้ไปข้อความ
--          ที่ถูกลบไปแล้วค้างอยู่ตลอดไป
--     ★ และข้อความห้องเพลงถูกกวาดทิ้งทุก 24 ชั่วโมงด้วย cron ส่วนข้อความ
--       ออฟฟิศเก็บถาวร ★★ สองอายุขัยนี้อยู่ตารางเดียวกันไม่ได้
--
--     ★★ แยกตารางจึงถูกแล้ว ไม่ใช่การทำซ้ำ — รูปร่างเหมือนกันโดยบังเอิญ
--        แต่ของที่มันอ้างถึงและกฎการลบคนละชุดกันทั้งหมด

create table if not exists public.office_chat_reactions (
  message_id uuid not null
             references public.office_chat_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null
             constraint office_chat_reactions_emoji_len
             check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  -- ★ คนเดียวกดอีโมจิเดิมซ้ำไม่ได้ — กดซ้ำ = ถอน ซึ่งเป็นการลบแถว
  --   ★★ pk สามคอลัมน์ทำให้ "กดซ้ำไม่พัง" เป็นเรื่องของฐานข้อมูล
  --      ไม่ใช่เรื่องที่โค้ดต้องเช็คก่อน insert (ซึ่งคือ race condition คลาสสิก)
  primary key (message_id, user_id, emoji)
);

comment on table public.office_chat_reactions is
  'อิโมจิความรู้สึกบนข้อความแชทออฟฟิศ — กดซ้ำคือถอน';

-- ★ index สำหรับดึงอิโมจิของข้อความทั้งห้องในคำขอเดียว
--   ★★ pk ขึ้นต้นด้วย message_id อยู่แล้ว จึงใช้ pk ได้เลยสำหรับ `in (...)`
--      ไม่ต้องสร้าง index เพิ่ม

alter table public.office_chat_reactions enable row level security;

-- ★ ไม่มี policy โดยตั้งใจ — RLS เป็น default-deny
--   ทางเดียวที่เขียนได้คือผ่าน RPC security definer ข้างล่าง
--   ★★ เหตุผลเดียวกับทุกตารางของโมดูลออฟฟิศ: route ใช้ service role
--      ซึ่งข้าม RLS อยู่แล้ว การตรวจสิทธิ์จริงจึงต้องอยู่ใน RPC


-- ---------------------------------------------------------------------------
-- กด/ถอนอิโมจิ
-- ---------------------------------------------------------------------------
-- ★★ ตรวจสองชั้น: เป็นพนักงานที่ใช้งานได้ · และอยู่ในห้องนั้นจริง
--    ★ ชั้นแรกกันคนที่ถูกระงับบัญชี ★★ ชั้นสองกันคนที่เดา id ข้อความถูก
--      แต่ไม่ได้อยู่ในห้อง — ซึ่งเป็นช่องเดียวที่เหลือเมื่อ route ใช้ service role
create or replace function public.toggle_office_reaction(
  p_actor uuid,
  p_msg   uuid,
  p_emoji text,
  p_on    boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ ข้อความที่ถูกลบแล้วกดอิโมจิไม่ได้ — ฟองนั้นไม่มีเนื้อหาให้รู้สึกกับอะไร */
  select room_id into v_room
  from public.office_chat_messages
  where id = p_msg and deleted_at is null;

  /*
   * ★★ "ไม่มีข้อความนี้" กับ "มีแต่ไม่ใช่ห้องของคุณ" คืนรหัสเดียวกัน
   *    ★ แยกรหัสจะกลายเป็นเครื่องมือให้คนเดา id ไปเรื่อย ๆ แล้วรู้ได้ว่า
   *      id ไหนมีอยู่จริง ★★ ซึ่งบอกได้ว่ามีคนคุยกันกี่ข้อความในบริษัท
   *    ★ FORBIDDEN เป็นรหัสที่ delete_office_chat ใช้ในกรณีเดียวกันอยู่แล้ว
   */
  if v_room is null or not exists (
    select 1 from public.office_chat_members
    where room_id = v_room and user_id = p_actor
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_on then
    insert into public.office_chat_reactions (message_id, user_id, emoji)
    values (p_msg, p_actor, p_emoji)
    on conflict do nothing;
  else
    delete from public.office_chat_reactions
    where message_id = p_msg and user_id = p_actor and emoji = p_emoji;
  end if;

  return p_on;
end;
$$;

revoke all on function public.toggle_office_reaction(uuid, uuid, text, boolean) from public;
grant execute on function public.toggle_office_reaction(uuid, uuid, text, boolean) to service_role;


-- ---------------------------------------------------------------------------
-- รายการห้อง — เพิ่ม peer_id
-- ---------------------------------------------------------------------------
-- ★★★ เมนูแชทบนแถบบนต้องบอกได้ว่า "คนนี้ออนไลน์อยู่ไหม"
--
--     ★ สถานะออนไลน์มาจาก Realtime presence ซึ่งใช้ userId เป็นคีย์
--       ★★ แต่รายการห้องเดิมคืนมาแค่ชื่อกับรูป ไม่มี id ของคู่สนทนา
--          จึงไม่มีทางจับคู่กับ presence ได้เลย
--     ★ หน้าเว็บจะไปดึง /api/office/people มาจับคู่ด้วยชื่อก็ได้ ★★ แต่ชื่อ
--       ซ้ำกันได้ และการจับคู่ด้วยชื่อจะพังเงียบ ๆ วันที่มีคนชื่อเดียวกันสองคน
--
-- ★ ส่วนที่เหลือของฟังก์ชันคัดลอกมาจาก 0040 ทั้งดุ้น ไม่แก้อะไร
--   ★★ Postgres ไม่มี "เพิ่มคอลัมน์ในผลลัพธ์" ต้องเขียนใหม่ทั้งตัว
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
      /* ★ คู่สนทนาของห้องส่วนตัว — ห้องกลุ่มจะได้ id ของใครคนหนึ่งเหมือนกัน
         ★★ แต่หน้าเว็บใช้ค่านี้เฉพาะเมื่อ kind = 'DM' จึงไม่หลงไปโชว์
            จุดออนไลน์ของคนสุ่ม ๆ บนรูปกลุ่ม */
      (select om.user_id
       from public.office_chat_members om
       where om.room_id = r.id and om.user_id <> p_actor
       limit 1) as peer_id,
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


-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- ★★ อิโมจิต้องขึ้นทันทีทั้งสองฝ่าย ไม่ใช่รอให้อีกฝ่ายรีเฟรช
--    ★ การกดอิโมจิเป็นการ "ตอบ" ที่เบาที่สุดที่มี — ถ้าคนกดไม่เห็นผลที่ฝั่ง
--      ตัวเองเดี๋ยวนั้น เขาจะกดซ้ำ แล้วกลายเป็นถอนตัวเองโดยไม่รู้
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'office_chat_reactions'
  ) then
    alter publication supabase_realtime add table public.office_chat_reactions;
  end if;
end
$$;

-- ★ replica identity full — payload ของ DELETE ต้องมีข้อมูลครบ
--   ★★ ตารางนี้ pk ครอบสามคอลัมน์ที่เราต้องใช้พอดี แต่ตั้ง full ไว้
--      เพื่อให้เหมือนกับ chat_reactions ของห้องเพลง — ความต่างเล็ก ๆ
--      ระหว่างสองตารางที่หน้าตาเหมือนกันคือสิ่งที่ทำให้คนอ่านโค้ดสับสน
alter table public.office_chat_reactions replica identity full;
