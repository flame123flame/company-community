-- ═════════════════════════════════════════════════════════════════════
-- 0037 · ซ่อม Realtime ของห้องสุ่มกลุ่ม + เครื่องมือตรวจสอบ
--
-- อาการที่เจอตอนทดสอบสามเบราว์เซอร์: เจ้าของห้องกดสุ่มแล้วได้ "สุกี้"
-- แต่อีกสองเครื่องค้างอยู่ที่ "รอเฟรมกดสุ่ม" และวงล้อโชว์ตัวเลือกแรก
-- ★ ตรวจที่ websocket แล้วพบว่า subscribe สำเร็จ (phx_reply ok) แต่ไม่มี
--   event เข้ามาเลยหลังแถวถูกแก้ → แปลว่าตารางไม่ได้อยู่ใน publication จริง
--
-- ★★ DO block ใน 0035 เช็ก pg_publication_tables ก่อนเพิ่ม ซึ่งถ้าอะไรสักอย่าง
--    ทำให้บล็อกนั้นไม่ทำงาน จะไม่มีใครรู้เลยเพราะมันไม่ error
--    ★ รอบนี้จึงเพิ่มแบบดักข้อผิดพลาดแทนการเช็กก่อน (เพิ่มซ้ำได้ ไม่พัง)
--      และทิ้งฟังก์ชันตรวจสอบไว้ให้เรียกดูได้ว่าตารางไหนอยู่ใน publication บ้าง
-- ═════════════════════════════════════════════════════════════════════

do $$
begin
  begin
    alter publication supabase_realtime add table public.draw_rooms;
  exception
    when duplicate_object then null;
    when others then raise notice 'draw_rooms: %', sqlerrm;
  end;

  begin
    alter publication supabase_realtime add table public.draw_room_members;
  exception
    when duplicate_object then null;
    when others then raise notice 'draw_room_members: %', sqlerrm;
  end;

  begin
    alter publication supabase_realtime add table public.listing_messages;
  exception
    when duplicate_object then null;
    when others then raise notice 'listing_messages: %', sqlerrm;
  end;
end $$;

alter table public.draw_rooms        replica identity full;
alter table public.draw_room_members replica identity full;


/**
 * ตารางที่อยู่ใน publication ของ Realtime ตอนนี้
 *
 * ★ มีไว้ให้ตรวจจากภายนอกได้โดยไม่ต้องเปิด SQL editor
 *   ★★ บทเรียนจากบั๊กนี้: สิ่งที่ "น่าจะรันไปแล้ว" ต้องตรวจได้ ไม่ใช่เชื่อ
 *      เพราะ DO block ที่ไม่ทำงานจะเงียบสนิท ไม่มี error ให้เห็น
 */
create or replace function public.realtime_tables()
returns text[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(tablename order by tablename), '{}')
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public';
$$;

revoke all on function public.realtime_tables() from public;
grant execute on function public.realtime_tables() to service_role;
