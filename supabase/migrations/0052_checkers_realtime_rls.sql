-- ===========================================================================
-- 0052 · ให้ผู้เล่นอ่านแถวเกมของตัวเองได้ — ไม่งั้น Realtime ส่งอะไรไม่ได้เลย
-- ===========================================================================
--
-- ★★★ บั๊กที่เจอจากการทดสอบสองเบราว์เซอร์จริง
--
--     อาการ: ฝั่งที่เดินเห็นหมากขยับ แต่ "อีกฝั่งไม่เห็นจนกว่าจะรีโหลด"
--     ★ ทั้งที่ 0051 ใส่ checkers_games เข้า publication supabase_realtime แล้ว
--
--     ★★ สาเหตุ: 0051 เปิด RLS แล้วไม่ใส่ policy เลย โดยเทียบเคียงจาก
--        ตารางอื่นในโมดูลออฟฟิศที่เขียนผ่าน RPC อย่างเดียว
--        ★ แต่ตารางพวกนั้น "ไม่ได้ถูกฟังผ่าน Realtime" — ของที่ถูกฟัง
--          (office_chat_messages · listing_messages · debts …) มี policy
--          อ่านทุกตัว
--        ★★★ Realtime ส่ง event ในนามของผู้ใช้ที่ subscribe ไม่ใช่ service role
--            RLS default-deny จึงกรองทุกแถวทิ้งก่อนถึงเบราว์เซอร์
--            ★ ไม่มี error ไม่มีอะไรฟ้อง — มันแค่เงียบ
--            ★★ ซึ่งเป็นเหตุผลที่เทสต์สองเบราว์เซอร์จำเป็น:
--               เทสต์แท็บเดียวผ่านฉลุย เพราะฝั่งที่เดินได้กระดานใหม่
--               จากคำตอบของ API ไม่ได้รอ Realtime
--
-- ★★ เปิดเฉพาะ "อ่าน" และเฉพาะเกมที่ตัวเองเล่น
--    ★ การเขียนยังผ่าน RPC ทางเดียวเหมือนเดิม — policy นี้ไม่เปิดช่องเขียน

drop policy if exists checkers_games_read on public.checkers_games;
create policy checkers_games_read on public.checkers_games
  for select using (
    bottom_id = (select auth.uid()) or top_id = (select auth.uid())
  );

-- ★ ประวัติตาเดินก็ต้องอ่านได้ ถ้าอ่านเกมนั้นได้
drop policy if exists checkers_moves_read on public.checkers_moves;
create policy checkers_moves_read on public.checkers_moves
  for select using (
    exists (
      select 1 from public.checkers_games g
      where g.id = checkers_moves.game_id
        and (g.bottom_id = (select auth.uid()) or g.top_id = (select auth.uid()))
    )
  );

/*
 * ★ คำท้า: อ่านได้ทั้งคนท้าและคนถูกท้า
 *   ★★ หน้าเมนูเกมอ่านผ่าน API (service role) อยู่แล้ว แต่ใส่ไว้ให้ครบ
 *      เผื่อวันที่อยากฟังคำท้าผ่าน Realtime โดยไม่ต้องกลับมาไล่หาสาเหตุใหม่
 */
drop policy if exists game_challenges_read on public.game_challenges;
create policy game_challenges_read on public.game_challenges
  for select using (
    from_id = (select auth.uid()) or to_id = (select auth.uid())
  );
