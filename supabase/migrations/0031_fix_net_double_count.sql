-- ═══════════════════════════════════════════════════════════════════
-- 0031 · แก้บั๊ก: ยอดสุทธิหลังหักลบถูกนับเป็นค่าใช้จ่ายซ้ำ
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ บั๊กที่เจอตอนทดสอบ 0030
--
--     ลำดับที่ทำให้เกิด:
--       1. U2 ค้าง frma 500 (จากบิลจริง)  → นับเป็นค่าใช้จ่ายของ U2 = 500
--       2. frma ค้าง U2 300 (จากบิลจริง)
--       3. หักลบ → ปิดทั้งคู่ สร้างหนี้ใหม่ "U2 ค้าง frma 200"
--       4. ★ my_expense_summary นับหนี้ทุกใบที่ไม่ใช่ CANCELLED
--          จึงนับทั้ง 500 (SETTLED) และ 200 (PENDING) = 700
--
--     ★★ แต่ U2 ใช้จ่ายจริงแค่ 500 — ยอดสุทธิคือการ "รวมยอดเดิม"
--        ไม่ใช่รายจ่ายใหม่ การนับซ้ำทำให้สรุปค่าข้าวสูงกว่าความจริง
--
--     ★ นี่คือบั๊กประเภทที่อันตรายที่สุดของระบบการเงิน: ตัวเลขผิดแต่ดูสมเหตุสมผล
--       ไม่มี error ไม่มีอะไรพัง คนอ่านแค่เชื่อตัวเลขที่ผิดไปเรื่อย ๆ
--
-- ★★ ทางแก้: ทำเครื่องหมายว่าหนี้ใบไหนเป็น "ยอดสุทธิ" แล้วไม่นับในสรุป
--
--    ★ ไม่ใช้วิธีดูจาก description = 'ยอดสุทธิหลังหักลบ' เพราะข้อความ
--      เปลี่ยนได้ทุกเมื่อ (เช่นวันที่แปลเป็นอังกฤษ) แล้วบั๊กจะกลับมาเงียบ ๆ
-- ───────────────────────────────────────────────────────────────────


alter table public.debts
  add column if not exists is_settlement boolean not null default false;

comment on column public.debts.is_settlement is
  'true = หนี้ที่เกิดจากการหักลบยอด ไม่ใช่รายจ่ายใหม่ — ห้ามนับในสรุปค่าข้าว (0031)';

/* ★ ซ่อมข้อมูลที่สร้างไปแล้วด้วย 0030 ก่อนมีคอลัมน์นี้ */
update public.debts
   set is_settlement = true
 where bill_id is null
   and description = 'ยอดสุทธิหลังหักลบ';


-- ═════════════════════════════════════════════════════════════════════
-- หักลบยอด — ติดธงให้หนี้ที่สร้างใหม่
-- ═════════════════════════════════════════════════════════════════════

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
    insert into public.debts (creditor_id, debtor_id, amount, description, is_settlement)
    values (
      case when v_net > 0 then p_actor else p_other end,
      case when v_net > 0 then p_other else p_actor end,
      abs(v_net),
      'ยอดสุทธิหลังหักลบ',
      /* ★★ ธงนี้คือสิ่งที่กันการนับซ้ำในสรุปค่าข้าว — ห้ามลืมเมื่อแก้ฟังก์ชันนี้ */
      true
    )
    returning id into v_new_id;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'debt.net', 'profile', p_other::text,
          jsonb_build_object('closed', v_closed, 'net', v_net));

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
-- สรุปค่าข้าว — ไม่นับหนี้ที่เป็นยอดสุทธิ
-- ═════════════════════════════════════════════════════════════════════

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
  select coalesce(sum(b.total_amount - coalesce(d.sum_amount, 0)), 0)
  into v_my_share
  from public.expense_bills b
  left join lateral (
    select sum(amount) as sum_amount from public.debts
    where bill_id = b.id and status <> 'CANCELLED'
  ) d on true
  where b.payer_id = p_actor
    and b.bill_date between p_from and p_to;

  /* ★★ and not is_settlement — จุดที่แก้บั๊กนับซ้ำ */
  select coalesce(sum(dd.amount), 0) into v_owed_out
  from public.debts dd
  left join public.expense_bills bb on bb.id = dd.bill_id
  where dd.debtor_id = p_actor
    and dd.status <> 'CANCELLED'
    and not dd.is_settlement
    and coalesce(bb.bill_date, dd.created_at::date) between p_from and p_to;

  v_total := v_my_share + v_owed_out;

  return jsonb_build_object(
    'total', v_total,
    'myShare', v_my_share,
    'owedOut', v_owed_out,

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

revoke execute on function
  public.net_debts_between(uuid, uuid),
  public.my_expense_summary(uuid, date, date)
from public, anon, authenticated;
grant execute on function
  public.net_debts_between(uuid, uuid),
  public.my_expense_summary(uuid, date, date)
to service_role;
