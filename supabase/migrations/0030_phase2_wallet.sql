-- ═══════════════════════════════════════════════════════════════════
-- 0030 · เฟส 2 · หักลบยอด · สรุปค่าข้าว · ผูกบิลกับร้าน
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-B08  หักลบยอดค้างระหว่างสองคน แล้วเหลือยอดสุทธิรายการเดียว
--   FR-B09  สรุปค่าข้าวรายเดือน/รายปี แยกตามร้านและประเภท
--   FR-A08  ลดโอกาสสุ่มร้านที่เพิ่งไปภายใน N วัน
--   FR-C12  กระดานเลขยอดฮิตประจำงวด
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ผูกบิลกับร้าน (FR-B09 "แยกตามร้าน")
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ FR-B09 ขอให้สรุป "แยกตามร้าน" แต่ 0026 ไม่ได้เก็บว่าบิลไหนคือร้านไหน
--
--     เก็บแค่ title ซึ่งเป็นข้อความอิสระ — "ข้าวเที่ยง" กับ "ข้าวเที่ยงร้านป้าแดง"
--     ★ จัดกลุ่มด้วยข้อความไม่ได้เลย คนพิมพ์คนละแบบทุกครั้ง
--
--     ★★ เชื่อมกับ restaurants ของโมดูล A แทน — ร้านเดียวกันจึงรวมกันได้จริง
--        nullable เพราะบิลที่ไม่ได้มาจากร้านในระบบ (กาแฟข้างออฟฟิศ) ต้องยังสร้างได้

alter table public.expense_bills
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null;

comment on column public.expense_bills.restaurant_id is
  'ร้านที่บิลนี้มาจาก — null = ไม่ได้ระบุ (FR-B09 ใช้จัดกลุ่มในหน้าสรุป)';

create index if not exists expense_bills_restaurant_idx
  on public.expense_bills (restaurant_id) where restaurant_id is not null;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · หักลบยอดระหว่างสองคน (FR-B08)
-- ═════════════════════════════════════════════════════════════════════

/**
 * หักลบหนี้ที่ค้างกันไปมาระหว่างสองคน เหลือยอดสุทธิรายการเดียว
 *
 * ★★★ ทำไมคนเดียวกดได้โดยไม่ต้องขออีกฝ่าย
 *
 *     การหักลบเป็นการคำนวณที่ "ไม่มีใครเสียเปรียบ" —
 *     A ค้าง B 100 · B ค้าง A 60 → A ค้าง B 40 ซึ่งเท่ากันทุกประการ
 *     ★ ต่างจากการยกเลิกหนี้ (cancel_debt) ที่ฝ่ายหนึ่งเสียเงินจริง
 *       จึงต้องเป็นเจ้าหนี้เท่านั้นที่กดได้
 *
 * ★★ หักเฉพาะ PENDING ไม่แตะ PAID_PENDING
 *
 *    PAID_PENDING แปลว่า "โอนไปแล้ว รอเจ้าหนี้ยืนยัน" — ถ้าเอามาหักลบด้วย
 *    ★ สัญญาณ "ฉันโอนแล้วนะ" จะหายไป แล้วคนที่โอนจริงต้องโอนซ้ำ
 *      ซึ่งเป็นความเสียหายที่แก้กลับยากมากเพราะเงินออกจากบัญชีไปแล้ว
 */
create or replace function public.net_debts_between(
  p_actor uuid,
  p_other uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i_owe    numeric(12,2);
  v_owed     numeric(12,2);
  v_net      numeric(12,2);
  v_closed   integer;
  v_new_id   uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_actor = p_other then
    raise exception 'VALIDATION_FAILED: cannot net with yourself';
  end if;

  /*
   * ★ ล็อกทุกแถวที่เกี่ยวข้องก่อนคำนวณ
   *   ถ้าไม่ล็อก มีคนสร้างหนี้ใหม่ระหว่างที่เราคำนวณกับตอนเขียน
   *   แล้วหนี้ใบนั้นจะถูกปิดไปด้วยทั้งที่ไม่ได้อยู่ในยอดสุทธิ
   */
  perform 1 from public.debts
   where status = 'PENDING'
     and ((creditor_id = p_actor and debtor_id = p_other)
       or (creditor_id = p_other and debtor_id = p_actor))
   for update;

  select coalesce(sum(amount), 0) into v_i_owe
  from public.debts
  where status = 'PENDING' and debtor_id = p_actor and creditor_id = p_other;

  select coalesce(sum(amount), 0) into v_owed
  from public.debts
  where status = 'PENDING' and creditor_id = p_actor and debtor_id = p_other;

  if v_i_owe = 0 and v_owed = 0 then
    raise exception 'VALIDATION_FAILED: nothing to net';
  end if;

  /*
   * ★★ ต้องมีหนี้ "ทั้งสองทาง" ถึงจะหักลบมีความหมาย
   *    ถ้ามีทางเดียว การหักลบคือการยุบหลายใบให้เหลือใบเดียว
   *    ★ ซึ่งทำให้รายละเอียดว่าหนี้ก้อนไหนมาจากอะไรหายไป
   *      โดยที่ยอดรวมไม่ได้ลดลงเลย — ไม่คุ้มที่จะทำ
   */
  if v_i_owe = 0 or v_owed = 0 then
    raise exception 'VALIDATION_FAILED: needs debts in both directions';
  end if;

  update public.debts
     set status = 'SETTLED', confirmed_at = now()
   where status = 'PENDING'
     and ((creditor_id = p_actor and debtor_id = p_other)
       or (creditor_id = p_other and debtor_id = p_actor));
  get diagnostics v_closed = row_count;

  v_net := v_owed - v_i_owe;

  if v_net <> 0 then
    insert into public.debts (creditor_id, debtor_id, amount, description)
    values (
      case when v_net > 0 then p_actor else p_other end,
      case when v_net > 0 then p_other else p_actor end,
      abs(v_net),
      'ยอดสุทธิหลังหักลบ'
    )
    returning id into v_new_id;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'debt.net', 'profile', p_other::text,
          jsonb_build_object('closed', v_closed, 'net', v_net));

  /* ★ แจ้งอีกฝ่ายเสมอ — เขาเห็นยอดเปลี่ยนโดยไม่ได้ทำอะไรเอง ต้องรู้ว่าทำไม */
  perform public.notify(
    p_other, 'debtCreated', 'notify.type.debtNetted',
    jsonb_build_object('closed', v_closed), '/office/wallet/owed'
  );

  return jsonb_build_object(
    'closed', v_closed,
    'net', abs(v_net),
    'direction', case when v_net > 0 then 'THEY_OWE_ME'
                      when v_net < 0 then 'I_OWE_THEM'
                      else 'EVEN' end,
    'newDebtId', v_new_id
  );
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · สรุปค่าข้าว (FR-B09)
-- ═════════════════════════════════════════════════════════════════════

/**
 * สรุปการใช้จ่ายของผู้ใช้คนเดียวในช่วงเวลาหนึ่ง
 *
 * ★★★ "ค่าใช้จ่ายของฉัน" คืออะไรกันแน่ — ต้องนิยามให้ชัดก่อนคำนวณ
 *
 *     มีสองแบบที่ต่างกันมาก:
 *       ก) เงินที่ฉันจ่ายออกไปจริง (บิลที่ฉันจ่ายก่อน)
 *       ข) ส่วนที่เป็นของฉันจริง ๆ (หนี้ที่ฉันค้าง + ส่วนของฉันในบิลที่ฉันจ่าย)
 *
 *     ★ (ก) ทำให้คนที่ชอบจ่ายก่อนดูเหมือนใช้เงินเยอะมาก ทั้งที่เก็บคืนหมดแล้ว
 *       (ข) คือ "ค่าข้าวของฉัน" ตามที่คนเข้าใจจริง ๆ — เลือกแบบนี้
 *
 *     ★★ ส่วนของฉันในบิลที่ฉันจ่าย = ยอดบิล ลบ ผลรวมหนี้ที่แตกออกไป
 *        ซึ่งตรงกับที่ create_expense_bill คำนวณไว้ตอนสร้างพอดี
 */
create or replace function public.my_expense_summary(
  p_actor uuid,
  p_from  date,
  p_to    date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_my_share  numeric(12,2);
  v_owed_out  numeric(12,2);
  v_total     numeric(12,2);
begin
  /* ส่วนของฉันในบิลที่ฉันเป็นคนจ่าย */
  select coalesce(sum(b.total_amount - coalesce(d.sum_amount, 0)), 0)
  into v_my_share
  from public.expense_bills b
  left join lateral (
    select sum(amount) as sum_amount from public.debts
    where bill_id = b.id and status <> 'CANCELLED'
  ) d on true
  where b.payer_id = p_actor
    and b.bill_date between p_from and p_to;

  /* หนี้ที่ฉันค้างคนอื่น (ยังไม่ถูกยกเลิก) */
  select coalesce(sum(dd.amount), 0) into v_owed_out
  from public.debts dd
  left join public.expense_bills bb on bb.id = dd.bill_id
  where dd.debtor_id = p_actor
    and dd.status <> 'CANCELLED'
    and coalesce(bb.bill_date, dd.created_at::date) between p_from and p_to;

  v_total := v_my_share + v_owed_out;

  return jsonb_build_object(
    'total', v_total,
    'myShare', v_my_share,
    'owedOut', v_owed_out,

    /* แยกตามประเภท */
    'byCategory', coalesce((
      select jsonb_object_agg(cat, amt) from (
        select b.category as cat, sum(b.total_amount - coalesce(d.sum_amount, 0)) as amt
        from public.expense_bills b
        left join lateral (
          select sum(amount) as sum_amount from public.debts
          where bill_id = b.id and status <> 'CANCELLED'
        ) d on true
        where b.payer_id = p_actor and b.bill_date between p_from and p_to
        group by b.category
      ) t
    ), '{}'::jsonb),

    /* ★ แยกตามร้าน — ใช้ restaurant_id ที่เพิ่งเพิ่ม ไม่ใช่ title */
    'byRestaurant', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'amount', amt) order by amt desc)
      from (
        select coalesce(r.name, 'ไม่ระบุร้าน') as name,
               sum(b.total_amount - coalesce(d.sum_amount, 0)) as amt
        from public.expense_bills b
        left join public.restaurants r on r.id = b.restaurant_id
        left join lateral (
          select sum(amount) as sum_amount from public.debts
          where bill_id = b.id and status <> 'CANCELLED'
        ) d on true
        where b.payer_id = p_actor and b.bill_date between p_from and p_to
        group by coalesce(r.name, 'ไม่ระบุร้าน')
        limit 5
      ) t
    ), '[]'::jsonb),

    /* รายวัน — ใช้วาดกราฟ */
    'byDay', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'amount', amt) order by d)
      from (
        select b.bill_date as d, sum(b.total_amount - coalesce(x.sum_amount, 0)) as amt
        from public.expense_bills b
        left join lateral (
          select sum(amount) as sum_amount from public.debts
          where bill_id = b.id and status <> 'CANCELLED'
        ) x on true
        where b.payer_id = p_actor and b.bill_date between p_from and p_to
        group by b.bill_date
      ) t
    ), '[]'::jsonb)
  );
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · ลดโอกาสสุ่มร้านที่เพิ่งไป (FR-A08)
-- ═════════════════════════════════════════════════════════════════════

/**
 * ร้านที่ผู้ใช้เพิ่งไปภายใน N วัน — ฝั่ง client เอาไปลดน้ำหนักในวงล้อ
 *
 * ★★ คืน "รายชื่อร้านที่เพิ่งไป" ไม่ใช่ "ผลการสุ่มที่ถ่วงน้ำหนักแล้ว"
 *
 *    ★ การสุ่มต้องเกิดฝั่ง client เท่านั้น (หลักการของ FR-X05) —
 *      ถ้า server สุ่มให้ ห้องสุ่มกลุ่มในอนาคตจะต้องเขียนใหม่ทั้งหมด
 *      เพราะ client ต้องรู้ผลก่อนเริ่มแอนิเมชันเสมอ
 */
create or replace function public.recent_restaurant_visits(p_actor uuid)
returns table (restaurant_id uuid, last_visit timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.restaurant_id, max(v.visited_at) as last_visit
  from public.restaurant_visits v
  where v.user_id = p_actor
    and v.visited_at > now() - make_interval(
      days => greatest(0, (public.setting('no_repeat_days', '7'::jsonb))::integer)
    )
  group by v.restaurant_id;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · กระดานเลขยอดฮิต (FR-C12)
-- ═════════════════════════════════════════════════════════════════════

/**
 * เลขที่ถูกบันทึกมากที่สุดของงวดปัจจุบัน
 *
 * ★★★ คืนเฉพาะ "เลข + จำนวนครั้ง" ไม่บอกว่าใครบันทึก
 *
 *     ตาราง lottery_picks มี RLS ที่ให้อ่านได้เฉพาะของตัวเอง —
 *     ★ ฟังก์ชันนี้เป็น SECURITY DEFINER จึงข้าม RLS ได้ ซึ่งอันตราย
 *       ถ้าเผลอคืน user_id ออกไป
 *
 *     ★★ จึง group by number อย่างเดียวและไม่มีคอลัมน์ user ใน returns
 *        ใครที่จะแก้ฟังก์ชันนี้ในอนาคต อ่านย่อหน้านี้ก่อน
 */
create or replace function public.lottery_leaderboard(p_limit integer default 10)
returns table (number text, picks integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.number, count(*)::integer as picks
  from public.lottery_picks p
  where p.draw_date is not null
    and p.draw_date = nullif(public.setting('lottery_next_draw', 'null'::jsonb) #>> '{}', '')::date
  group by p.number
  order by picks desc, p.number
  limit greatest(1, least(p_limit, 50));
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 6 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.net_debts_between(uuid, uuid),
  public.my_expense_summary(uuid, date, date),
  public.recent_restaurant_visits(uuid),
  public.lottery_leaderboard(integer)
from public, anon, authenticated;

grant execute on function
  public.net_debts_between(uuid, uuid),
  public.my_expense_summary(uuid, date, date),
  public.recent_restaurant_visits(uuid),
  public.lottery_leaderboard(integer)
to service_role;
