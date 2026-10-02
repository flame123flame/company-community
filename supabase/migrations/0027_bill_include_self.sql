-- ═══════════════════════════════════════════════════════════════════
-- 0027 · บิลหาร: ติ๊กว่าคนจ่ายร่วมจ่ายด้วยหรือไม่
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ ช่องว่างที่เจอตอนทดสอบ 0026
--
--     create_expense_bill หารยอดด้วย "จำนวนลูกหนี้" เท่านั้น
--     ★ ผลคือคนจ่ายไปก่อนไม่ได้ออกส่วนของตัวเองเลย —
--       จ่าย 100 แล้วเก็บเพื่อน 2 คนคนละ 50 ซึ่งแทบไม่เคยเป็นสิ่งที่คนต้องการ
--
--     เอกสารระบุไว้ชัดในหัวข้อ 8.3.2 ว่าหน้าวิธีหารต้อง
--     "ติ๊กว่าตัวเองร่วมจ่ายด้วยหรือไม่" ซึ่ง 0026 ไม่มีทางแสดงออกได้เลย
--
-- ★★ แก้ด้วยพารามิเตอร์ใหม่ p_include_self
--
--    true  → หารด้วย (ลูกหนี้ + 1) แล้วสร้างหนี้เฉพาะลูกหนี้
--            ส่วนที่เหลือคือส่วนของคนจ่ายเอง ซึ่งไม่ต้องบันทึกเป็นหนี้
--    false → พฤติกรรมเดิมของ 0026 (คนจ่ายออกให้ทั้งหมดแล้วเก็บคืนเต็ม)
--
--    ★ ค่าเริ่มต้นเป็น true เพราะเป็นกรณีที่เกิดบ่อยกว่ามาก
--      คนที่ไปกินข้าวด้วยกันแล้วคนหนึ่งจ่ายก่อน = ทุกคนรวมคนจ่ายหารเท่ากัน
-- ───────────────────────────────────────────────────────────────────

create or replace function public.create_expense_bill(
  p_actor        uuid,
  p_title        text,
  p_total        numeric,
  p_category     text,
  p_date         date,
  p_receipt      text,
  p_split        text,
  p_shares       jsonb,
  p_include_self boolean default true
)
returns public.expense_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill      public.expense_bills;
  v_people    integer;   -- จำนวนคนที่หารกันจริง (รวมคนจ่ายถ้าติ๊กไว้)
  v_debtors   integer;   -- จำนวนคนที่เป็นหนี้
  v_base      numeric(12,2);
  v_remainder integer;   -- เศษเป็นสตางค์
  v_sum       numeric(12,2) := 0;
  v_share     jsonb;
  v_idx       integer := 0;
  v_amount    numeric(12,2);
  v_debtor    uuid;
begin
  if not public.employee_code_is_valid(p_actor) then
    raise exception 'FORBIDDEN';
  end if;

  if p_total is null or p_total <= 0 then
    raise exception 'VALIDATION_FAILED: total must be positive';
  end if;

  v_debtors := jsonb_array_length(coalesce(p_shares, '[]'::jsonb));
  if v_debtors = 0 then
    raise exception 'VALIDATION_FAILED: no participants';
  end if;

  for v_share in select * from jsonb_array_elements(p_shares) loop
    v_debtor := (v_share ->> 'userId')::uuid;
    if not public.employee_code_is_valid(v_debtor) then
      raise exception 'MEMBER_NOT_FOUND';
    end if;
    if v_debtor = p_actor then
      raise exception 'VALIDATION_FAILED: payer cannot owe themselves';
    end if;
  end loop;

  insert into public.expense_bills (
    title, total_amount, category, bill_date, receipt_path, payer_id, split_mode
  )
  values (
    btrim(p_title), p_total, coalesce(p_category, 'FOOD'),
    coalesce(p_date, current_date), p_receipt, p_actor,
    coalesce(p_split, 'EQUAL')
  )
  returning * into v_bill;

  if v_bill.split_mode = 'EQUAL' then
    /* ★★ ตัวหารคือจำนวนคนที่กินจริง ไม่ใช่จำนวนคนที่เป็นหนี้ */
    v_people := v_debtors + case when p_include_self then 1 else 0 end;

    /* ปัดลงก่อนแล้วค่อยแจกเศษ — เหตุผลเต็มอยู่ใน 0026 */
    v_base := floor(p_total * 100 / v_people) / 100;
    v_remainder := round(p_total * 100)::integer - (round(v_base * 100)::integer * v_people);

    /*
     * ★★ เศษตกกับลูกหนี้ก่อน ไม่ใช่คนจ่าย
     *
     *    เศษมีได้มากสุด (v_people - 1) สตางค์ ซึ่งน้อยกว่าจำนวนลูกหนี้
     *    เสมอเมื่อคนจ่ายร่วมด้วย ★ จึงแจกหมดภายในลูกหนี้ได้เสมอ
     *      และคนจ่ายได้ส่วนที่ลงตัวพอดี = ยอดที่เขาต้องรับคืนไม่มีเศษ
     */
    for v_share in select * from jsonb_array_elements(p_shares) loop
      v_amount := v_base + case when v_idx < v_remainder then 0.01 else 0 end;
      insert into public.debts (bill_id, creditor_id, debtor_id, amount, description)
      values (v_bill.id, p_actor, (v_share ->> 'userId')::uuid, v_amount, btrim(p_title));
      v_idx := v_idx + 1;
    end loop;
  else
    for v_share in select * from jsonb_array_elements(p_shares) loop
      v_amount := (v_share ->> 'amount')::numeric(12,2);
      if v_amount is null or v_amount <= 0 then
        raise exception 'VALIDATION_FAILED: each share must be positive';
      end if;
      v_sum := v_sum + v_amount;
      insert into public.debts (bill_id, creditor_id, debtor_id, amount, description)
      values (v_bill.id, p_actor, (v_share ->> 'userId')::uuid, v_amount, btrim(p_title));
    end loop;

    if v_sum > p_total then
      raise exception 'VALIDATION_FAILED: shares exceed total';
    end if;
  end if;

  for v_share in select * from jsonb_array_elements(p_shares) loop
    perform public.notify(
      (v_share ->> 'userId')::uuid,
      'debtCreated',
      'notify.type.debtCreated',
      jsonb_build_object('title', v_bill.title),
      '/office/wallet/owed'
    );
  end loop;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'bill.create', 'expense_bill', v_bill.id::text,
          jsonb_build_object('total', p_total, 'debtors', v_debtors, 'includeSelf', p_include_self));

  return v_bill;
end;
$$;

-- ★★ ลบตัวเก่า 8 พารามิเตอร์ทิ้ง ไม่งั้น PostgREST เลือกไม่ถูก (PGRST203)
--    บทเรียนเดียวกับตอนเพิ่มพารามิเตอร์ให้ enqueue_track ใน 0020
drop function if exists public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb);

revoke execute on function
  public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb, boolean)
from public, anon, authenticated;
grant execute on function
  public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb, boolean)
to service_role;
