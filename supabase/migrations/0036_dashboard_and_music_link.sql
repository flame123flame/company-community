-- ═════════════════════════════════════════════════════════════════════
-- 0036 · แดชบอร์ดการใช้งาน (FR-X10) + เชื่อมห้องเพลง (FR-X11)
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- FR-X10 · สถิติการใช้งานสำหรับ Admin
--
-- ★★ คืนก้อน jsonb ก้อนเดียว ไม่ใช่ view หลายอันให้หน้าเว็บยิงทีละอัน
--
--    แดชบอร์ดต้องแสดงเลข ~15 ตัวจาก 10 ตาราง ★ ถ้าแยกเป็น endpoint
--    ต่อโมดูล หน้าเดียวจะยิง 5 request แล้วเลขจะโผล่ทีละใบ
--    ซึ่งดูเหมือนหน้าค้าง — และ round-trip 5 รอบแพงกว่า query เดียวชัดเจน
--
-- ★ ทุกตัวเลขเป็น "นับ" ไม่มีข้อมูลรายคน — แดชบอร์ดไม่ควรเป็นเครื่องมือ
--   สอดส่องว่าใครใช้อะไรบ้าง (หัวข้อความเป็นส่วนตัวใน NFR)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.office_usage_stats(p_actor uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_out   jsonb;
begin
  if not public.is_admin(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  /* ★ จำกัดช่วงไว้ 1–365 วัน กัน query ที่กวาดทั้งตารางโดยไม่ตั้งใจ */
  v_since := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));

  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),

    /* ── คน ─────────────────────────────────────────────────── */
    'people', jsonb_build_object(
      'linked',     (select count(*) from public.profiles where employee_code is not null),
      'suspended',  (select count(*) from public.profiles where account_status = 'SUSPENDED'),
      'admins',     (select count(*) from public.profiles where is_admin),
      'codesTotal', (select count(*) from public.employee_codes),
      'codesFree',  (select count(*) from public.employee_codes
                     where status = 'ACTIVE' and claimed_by is null),
      /* ★ "ใช้งานจริง" นับจากคนที่มีความเคลื่อนไหวในช่วงนี้ ไม่ใช่คนที่ผูกรหัสแล้ว
         เพราะคนที่ผูกรหัสวันแรกแล้วไม่กลับมาอีกไม่ควรถูกนับเป็นผู้ใช้ */
      'active',     (select count(distinct user_id) from (
                       select user_id from public.restaurant_votes where created_at >= v_since
                       union select payer_id   from public.expense_bills where created_at >= v_since
                       union select debtor_id  from public.debts         where created_at >= v_since
                       union select seller_id  from public.listings      where created_at >= v_since
                       union select user_id    from public.lottery_picks where created_at >= v_since
                     ) t)
    ),

    /* ── โมดูล A · อาหาร ────────────────────────────────────── */
    'food', jsonb_build_object(
      'restaurants', (select count(*) from public.restaurants where not maybe_closed),
      'closed',      (select count(*) from public.restaurants where maybe_closed),
      'votes',       (select count(*) from public.restaurant_votes where created_at >= v_since),
      'visits',      (select count(*) from public.restaurant_visits where visited_at >= v_since),
      'top',         (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                        select r.name, count(v.*) as votes
                        from public.restaurants r
                        join public.restaurant_votes v on v.restaurant_id = r.id
                        where v.created_at >= v_since
                        group by r.id, r.name
                        order by count(v.*) desc, r.name
                        limit 5
                      ) x)
    ),

    /* ── โมดูล B · กระเป๋าเงิน ──────────────────────────────── */
    'wallet', jsonb_build_object(
      'bills',        (select count(*) from public.expense_bills where created_at >= v_since),
      'billTotal',    (select coalesce(sum(total_amount), 0) from public.expense_bills
                       where created_at >= v_since),
      /* ★ "ค้าง" คือ PENDING + PAID_PENDING — PAID_PENDING ยังไม่จบเพราะ
         ผู้รับยังไม่ยืนยันว่าเงินเข้า (ดูเหตุผลใน 0026) */
      'debtsOpen',    (select count(*) from public.debts
                       where status in ('PENDING', 'PAID_PENDING')),
      'debtsOpenSum', (select coalesce(sum(amount), 0) from public.debts
                       where status in ('PENDING', 'PAID_PENDING')),
      'debtsDone',    (select count(*) from public.debts
                       where status = 'SETTLED' and created_at >= v_since),
      /* ★ ไม่มีคอลัมน์กำหนดชำระในระบบนี้ — "ค้างนาน" วัดจากอายุรายการ
         เกณฑ์ 7 วันตรงกับรอบเตือนอัตโนมัติสุดท้ายใน send_due_reminders */
      'stale',        (select count(*) from public.debts
                       where status = 'PENDING'
                         and created_at::date <= current_date - 7)
    ),

    /* ── โมดูล C · สุ่มและเกม ───────────────────────────────── */
    'fun', jsonb_build_object(
      'nameSets',    (select count(*) from public.name_sets),
      'lottery',     (select count(*) from public.lottery_picks where created_at >= v_since),
      'tournaments', (select count(*) from public.tournaments where created_at >= v_since),
      'matchesDone', (select count(*) from public.tournament_matches m
                      join public.tournaments t on t.id = m.tournament_id
                      where m.winner is not null and t.created_at >= v_since)
    ),

    /* ── โมดูล D · ตลาดนัด ──────────────────────────────────── */
    'market', jsonb_build_object(
      'listings',  (select count(*) from public.listings where created_at >= v_since),
      'available', (select count(*) from public.listings
                    where status = 'AVAILABLE' and not hidden),
      'sold',      (select count(*) from public.listings
                    where status = 'SOLD' and created_at >= v_since),
      'hidden',    (select count(*) from public.listings where hidden),
      'threads',   (select count(*) from public.listing_threads where created_at >= v_since),
      'messages',  (select count(*) from public.listing_messages where created_at >= v_since),
      'alerts',    (select count(*) from public.search_alerts)
    ),

    /* ── ส่วนกลาง ───────────────────────────────────────────── */
    'shared', jsonb_build_object(
      'notifications', (select count(*) from public.notifications where created_at >= v_since),
      'unread',        (select count(*) from public.notifications where read_at is null),
      /*
       * ★ content_reports ไม่มีคอลัมน์สถานะ — ระบบนี้ไม่มีคิว "รอตรวจ"
       *   ★ จึงรายงานสิ่งที่วัดได้จริง: จำนวนรายงาน · จำนวนสิ่งที่ถูกซ่อนไปแล้ว
       *     ★★ ไม่ปลอมเลข "รอตรวจ" ขึ้นมาจากรายงานทั้งหมด เพราะ Admin จะเข้าใจว่า
       *        มีงานค้างต้องทำทั้งที่ระบบซ่อนอัตโนมัติไปแล้ว
       */
      'reportsTotal',  (select count(*) from public.content_reports where created_at >= v_since),
      'reportedItems', (select count(distinct (target_type, target_id)) from public.content_reports),
      'hiddenItems',   (select count(*) from public.listings where hidden)
    ),

    /* ── กราฟความเคลื่อนไหวรายวัน ───────────────────────────── */
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'n', d.n) order by d.day), '[]'::jsonb)
      from (
        select date_trunc('day', ts)::date as day, count(*) as n
        from (
          select created_at as ts from public.restaurant_votes where created_at >= v_since
          union all select created_at from public.expense_bills  where created_at >= v_since
          union all select created_at from public.listings       where created_at >= v_since
          union all select created_at from public.lottery_picks  where created_at >= v_since
          union all select created_at from public.listing_messages where created_at >= v_since
        ) all_events
        group by 1
      ) d
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.office_usage_stats(uuid, integer) from public;
grant execute on function public.office_usage_stats(uuid, integer) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- FR-X11 · ห้องเพลงของฉันกำลังเล่นอะไร
--
-- ★★★ คืนเฉพาะห้องที่ผู้ใช้เป็นสมาชิกอยู่แล้ว
--
--     ความน่าจะเป็นที่จะทำพลาดตรงนี้สูงมาก: "โชว์ห้องที่กำลังเล่นทั้งบริษัท"
--     ฟังดูเป็นฟีเจอร์ที่ดีกว่า ★ แต่รหัสห้อง 6 หลักคือกุญแจเข้าห้อง —
--     ถ้าโชว์รหัสห้องของทุกคน ระบบห้องที่ต้องรู้รหัสจึงจะเข้าได้ก็ไม่เหลือความหมาย
--     ★★ และถ้าโชว์ชื่อห้องโดยไม่โชว์รหัส การ์ดก็กดเข้าไม่ได้ = ไร้ประโยชน์
--        ★ จำกัดที่ห้องของตัวเองจึงเป็นทางเดียวที่ทั้งมีประโยชน์และไม่รั่ว
--
-- ★ ไม่แตะตารางของห้องเพลงเลย — อ่านอย่างเดียว ไม่มี trigger ไม่มีคอลัมน์เพิ่ม
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.my_music_rooms(p_actor uuid, p_limit integer default 4)
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

  select coalesce(jsonb_agg(x order by x.playing desc, x.last_seen_at desc), '[]'::jsonb)
  into v_out
  from (
    select
      r.code,
      r.name,
      ps.is_playing                                    as playing,
      q.title                                          as track,
      q.thumbnail_url                                  as thumb,
      m.last_seen_at,
      /* ★ "คนฟังอยู่" = เห็นตัวใน 2 นาที ไม่ใช่จำนวนสมาชิกทั้งหมด
         สมาชิกคือคนที่เคยเข้า ซึ่งสะสมขึ้นเรื่อย ๆ และไม่บอกอะไรเลย */
      (select count(*) from public.room_members rm
       where rm.room_id = r.id and rm.last_seen_at > now() - interval '2 minutes') as listeners
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    left join public.playback_states ps on ps.room_id = r.id
    left join public.queue_items q on q.id = ps.queue_item_id
    where m.user_id = p_actor
    order by ps.is_playing desc nulls last, m.last_seen_at desc
    limit greatest(1, least(coalesce(p_limit, 4), 10))
  ) x;

  return v_out;
end;
$$;

revoke all on function public.my_music_rooms(uuid, integer) from public;
grant execute on function public.my_music_rooms(uuid, integer) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- การ์ดสรุปหน้าแรก (หัวข้อ 8.1) — ยอดค้าง · ประกาศใหม่ · ร้านยอดนิยม
--
-- ★ รวมเป็น RPC เดียวด้วยเหตุผลเดียวกับแดชบอร์ด: หน้าแรกต้องขึ้นครบทีเดียว
--   ★ และทุกตัวเลขเป็นของ "ผู้เรียก" เท่านั้น ไม่ใช่ของทั้งบริษัท
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.office_home_summary(p_actor uuid)
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

  select jsonb_build_object(
    /* ฉันต้องจ่ายเท่าไหร่ · มีใครต้องจ่ายฉันเท่าไหร่ */
    /* ★ ใช้ creditor_id / debtor_id ตรง ๆ ไม่ต้อง join บิล
       เพราะหนี้ที่เกิดจากการหักลบ (is_settlement) ไม่มี bill_id */
    'iOwe', (select coalesce(sum(amount), 0) from public.debts
             where debtor_id = p_actor and status in ('PENDING', 'PAID_PENDING')),
    'owedToMe', (select coalesce(sum(amount), 0) from public.debts
                 where creditor_id = p_actor and status in ('PENDING', 'PAID_PENDING')),
    /* ★ รายการที่ผู้จ่ายกด "โอนแล้ว" แต่ฉันยังไม่ยืนยัน — งานที่ฉันต้องทำ */
    'toConfirm', (select count(*) from public.debts
                  where creditor_id = p_actor and status = 'PAID_PENDING'),
    'stale', (select count(*) from public.debts
              where debtor_id = p_actor and status = 'PENDING'
                and created_at::date <= current_date - 7),

    /* ประกาศใหม่ 7 วัน (ไม่นับของตัวเอง) */
    'newListings', (select count(*) from public.listings
                    where created_at >= now() - interval '7 days'
                      and not hidden and status = 'AVAILABLE'
                      and seller_id <> p_actor),

    /* ร้านที่โหวตมากสุดใน 7 วัน — คำตอบของ "เที่ยงนี้กินอะไร" */
    'topRestaurant', (select r.name
                      from public.restaurants r
                      join public.restaurant_votes v on v.restaurant_id = r.id
                      where v.created_at >= now() - interval '7 days' and not r.maybe_closed
                      group by r.id, r.name
                      order by count(v.*) desc, r.name
                      limit 1),

    'unread', (select count(*) from public.notifications
               where user_id = p_actor and read_at is null),

    /* ★ ข้อความที่ยังไม่อ่านในตลาดนัด — นับจากห้องที่ฉันเป็นคู่สนทนาเท่านั้น */
    'unreadChat', (select count(*)
                   from public.listing_messages msg
                   join public.listing_threads th on th.id = msg.thread_id
                   join public.listings l on l.id = th.listing_id
                   where msg.read_at is null and msg.sender_id <> p_actor
                     and (th.buyer_id = p_actor or l.seller_id = p_actor))
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.office_home_summary(uuid) from public;
grant execute on function public.office_home_summary(uuid) to service_role;
