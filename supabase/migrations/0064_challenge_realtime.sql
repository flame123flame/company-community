-- ===========================================================================
-- 0064 · เพื่อนท้ามาแล้วต้องรู้ทันที — ไม่ใช่รอรอบดึงข้อมูลถัดไป
-- ===========================================================================
--
-- ★★★ อาการที่เจอ: เพื่อนกดท้า แล้วอีกฝ่ายไม่เห็นอะไรเลยนานถึง 20 วินาที
--
--     ★ หน้าลอบบี้ดึงคำท้าใหม่ทุก 20 วินาที ★★ ซึ่งเป็นตัวเลขที่ผมเลือกไว้
--       ตอนทำหมากฮอสออนไลน์ โดยให้เหตุผลว่า "คำท้าเข้ามานาน ๆ ครั้ง
--       ไม่ต้องเปิด channel ค้าง"
--       ★★★ เหตุผลนั้นผิด เพราะมันคิดจากต้นทุนของระบบ ไม่ใช่จากสิ่งที่
--           เกิดขึ้นจริงตอนใช้งาน: สองคนนั่งคุยกันแล้วคนหนึ่งกดท้า
--           อีกคนจ้องจออยู่ ★ ยี่สิบวินาทีในสถานการณ์นั้นคือ "มันพัง"
--
-- ★★ แก้สองชั้น เพราะสองชั้นแก้ปัญหาต่างกัน
--
--    ★ ชั้นที่ 1 · Realtime บนตารางคำท้า — สำหรับคนที่เปิดหน้าเกมอยู่
--      ★★ เห็นทันทีที่อีกฝ่ายกด ไม่ต้องรอ ไม่ต้องรีโหลด
--    ★ ชั้นที่ 2 · แจ้งเตือนในกระดิ่ง — สำหรับคนที่ไม่ได้เปิดหน้าเกม
--      ★★ Realtime ช่วยได้เฉพาะคนที่ "อยู่หน้านั้น" ★ ถ้าเพื่อนท้าตอนเรา
--         อยู่หน้าสั่งอาหาร ไม่มี subscription ไหนบนโลกจะบอกเราได้
--         นอกจากของที่ตามเราไปทุกหน้า ซึ่งคือกระดิ่ง


-- ═════════════════════════════════════════════════════════════════════
-- 1 · เปิด Realtime ให้ตารางคำท้า
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ policy อ่านมีแล้วตั้งแต่ 0052 (game_challenges_read: เห็นได้ทั้งคนท้า
--    และคนถูกท้า) ★ ตอนนั้นผมใส่ไว้ "เผื่อวันที่อยากฟังผ่าน Realtime"
--    ★★ วันนั้นคือวันนี้ และดีที่ใส่ไว้ — ไม่งั้นจะเสียเวลาไล่หาสาเหตุ
--       แบบเดียวกับที่ 0052 เล่าไว้: Realtime เงียบสนิทโดยไม่มี error
--
-- ★ ขาดแค่การใส่ตารางเข้า publication ซึ่ง 0051 ใส่ให้แต่ checkers_games

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.game_challenges;
    exception when duplicate_object then null;
    end;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ส่งคำท้าแล้วแจ้งเตือนด้วย
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ ชนิดของตัวเอง 'gameChallenge' ไม่ยืมชนิดอื่นมาใช้
--
--     ★ บทเรียนจาก 0059: สามเรื่องเคยถูกส่งด้วยชนิด debtCreated ที่ยืมมา
--       แปลว่าคนที่ปิดสวิตช์หนึ่งอัน เงียบไปสี่เรื่องที่เขาไม่ได้สั่งให้เงียบ
--
-- ★★ ความเงียบของ notify() เป็นเรื่องที่ตั้งใจ — ปิดสวิตช์แล้วคืน null
--    ★ คำท้ายังถูกสร้างปกติ เพียงแต่ไม่มีแจ้งเตือน ★★ คนที่ปิดแจ้งเตือนเกม
--      ไม่ได้แปลว่าห้ามใครท้าเขา เขาแค่ไม่อยากให้กระดิ่งดัง

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
  v_id   uuid;
  v_name text;
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
   *    ★★ และเพราะคืนก่อนถึงบรรทัด notify() ด้านล่าง การกดซ้ำจึงไม่ส่ง
   *       แจ้งเตือนซ้ำด้วย — ซึ่งเป็นเหตุผลเดิมของการใช้ใบเดิม
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

  /* ★ ชื่อที่คนอื่นเห็น = ชื่อเล่นถ้ามี ไม่ใช่ display_name ดิบ
       ★★ กฎเดียวกับที่ route ใช้ตอนประกอบรายชื่อผู้เล่น */
  select coalesce(nullif(nickname, ''), display_name) into v_name
    from public.profiles where id = p_actor;

  perform public.notify(
    p_to,
    'gameChallenge',
    'notify.type.gameChallenge',
    jsonb_build_object('name', coalesce(v_name, ''), 'game', p_game),
    /* ★ ชื่อเกมตรงกับโฟลเดอร์ route อยู่แล้ว — ไม่ต้องมีตารางแปลงอีกชุด */
    '/office/fun/' || p_game
  );

  return v_id;
end;
$$;


revoke all on function public.challenge_create(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.challenge_create(uuid, text, uuid)
  to service_role;
