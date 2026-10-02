-- ===========================================================================
-- 0054 · แก้ policy ที่ถามตารางตัวเอง — ทำให้ Realtime ของห้องแข่งเงียบ
-- ===========================================================================
--
-- ★★★ อาการ: เจ้าของห้องไม่เห็นคนที่เข้ามา แม้รอ 12 วินาที
--     ★ ทั้งที่ 0053 ใส่ policy อ่านไว้แล้ว (บทเรียนจาก 0052)
--
--     ★★ สาเหตุ: policy ของ typing_players เขียนว่า
--          using ( exists (select 1 from typing_players me where …) )
--        ★★★ มันถามตารางเดียวกับที่ตัวเองคุมอยู่
--            → subquery นั้นก็ถูก RLS ตัวเดียวกันคุมอีกชั้น
--            → Postgres ตอบว่าไม่มีแถว (หรือฟ้อง infinite recursion)
--            ★ ผลคือไม่มีใครอ่านแถวไหนได้เลย และ Realtime ไม่ส่งอะไรออกมา
--
--     ★★ 0052 สอนว่า "ตารางที่ถูกฟังต้องมี policy" — บทเรียนรอบนี้ต่อยอด:
--        "policy นั้นต้องไม่ถามตารางที่มันคุมอยู่"
--
-- ★★ ทางแก้: ย้ายคำถามไปอยู่ในฟังก์ชัน security definer
--    ★ ข้างในฟังก์ชันไม่ถูก RLS คุม การวนจึงขาดตรงนั้น
--      ★★ และฟังก์ชันตรวจเงื่อนไขเดิมเป๊ะ — ไม่ได้เปิดกว้างขึ้นเพื่อเลี่ยงปัญหา

create or replace function public.is_in_typing_room(p_room uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.typing_players
     where room_id = p_room and user_id = p_user
  );
$$;

revoke all on function public.is_in_typing_room(uuid, uuid) from public, anon;
grant execute on function public.is_in_typing_room(uuid, uuid) to authenticated, service_role;


-- ★ ผู้เล่น: อ่านได้ทุกแถวในห้องที่ตัวเองอยู่
--   ★★ "ทุกแถว" ไม่ใช่ "แถวตัวเอง" — อ่านได้แค่ตัวเองจะเห็นแค่ตัวเองวิ่ง
--      ซึ่งทำให้มันไม่ใช่การแข่ง
drop policy if exists typing_players_read on public.typing_players;
create policy typing_players_read on public.typing_players
  for select using (
    public.is_in_typing_room(typing_players.room_id, (select auth.uid()))
  );


-- ★ ห้อง: ห้องที่ยังรออยู่ทุกคนเห็น · ห้องที่เริ่มแล้วเห็นเฉพาะคนในห้อง
--   ★ ของเดิมก็ข้ามตารางไปถาม typing_players ซึ่งตอนนั้นยังอ่านไม่ได้
--     ★★ พอ policy ของ typing_players พัง policy ของ typing_rooms ก็พังตาม
drop policy if exists typing_rooms_read on public.typing_rooms;
create policy typing_rooms_read on public.typing_rooms
  for select using (
    status = 'WAITING'
    or public.is_in_typing_room(typing_rooms.id, (select auth.uid()))
  );
