-- ===========================================================================
-- 0066 · ซ่อมความผิดพลาดของ 0065 — สร้างบิลไม่ได้เลยทั้งระบบ
-- ===========================================================================
--
-- ★★★ ผมทำพังเอง ต้องเขียนไว้ให้ครบว่าพังยังไง
--
--     ★ 0065 สั่ง create or replace ตัว 8 พารามิเตอร์ (ของ 0026)
--       ★★ แต่ตัวที่ระบบใช้จริงคือตัว 9 พารามิเตอร์ของ 0027 ซึ่งมี
--          p_include_self เพิ่มมา ★ และ 0027 ลบตัว 8 ทิ้งไปแล้วตอนท้ายไฟล์
--          พร้อมคอมเมนต์เตือนไว้ด้วยว่าอย่าให้มีสองตัว
--     ★★★ create or replace จึงไม่ได้ "แทนที่" อะไร — มัน "สร้างตัวที่ถูกลบ
--          ไปแล้วขึ้นมาใหม่" ★ ผลคือมีสองตัวที่รับพารามิเตอร์เหมือนกันทุกตัว
--          ต่างกันแค่ตัวสุดท้ายที่มีค่าเริ่มต้น
--          ★★ PostgREST เลือกไม่ถูก แล้วตอบ PGRST203 ทุกครั้ง
--             → "สร้างบิล" พังทั้งหมด ไม่ใช่แค่บิลคนเดียว
--
-- ★★ บทเรียนนี้เขียนไว้แล้วสองที่ในโปรเจกต์ (0020 · 0055) และผมก็ยังพลาด
--    ★ สิ่งที่ขาดคือการตรวจว่า "ฟังก์ชันที่กำลังแก้ คือตัวที่ระบบเรียกจริงไหม"
--      ★★ ไม่ใช่การอ่านไฟล์ที่สร้างมันขึ้นมาครั้งแรก
--
-- ★ ไฟล์นี้: ลบตัว 8 ทิ้ง แล้วเอาการแก้ของ 0065 ไปใส่ในตัว 9 ให้ถูกที่

-- ═════════════════════════════════════════════════════════════════════
-- 1 · ลบตัวซ้ำที่ 0065 สร้างขึ้นมาใหม่
-- ═════════════════════════════════════════════════════════════════════

drop function if exists public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ตัวจริง (9 พารามิเตอร์) — เปิดให้บิลไม่มีผู้ร่วมจ่ายได้
-- ═════════════════════════════════════════════════════════════════════

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

  /*
   * ★★★ ศูนย์คนร่วมจ่าย = บิลของตัวเองคนเดียว ซึ่งถูกต้อง
   *
   *     ★ ของเดิม raise ตรงนี้ ★★ นั่นคือบรรทัดเดียวที่ขวาง
   *       "บันทึกค่าใช้จ่ายของตัวเอง" มาตลอด
   *     ★ ลูปข้างล่างวนศูนย์รอบแล้วจบ ไม่มีหนี้ถูกสร้าง ไม่มีใครถูกแจ้งเตือน
   *       ★★ ส่วนของเราคิดจาก ยอดรวม − ผลรวมของคนอื่น อยู่แล้ว
   *          บิลคนเดียวจึงแปลว่า "ส่วนของฉัน = ยอดเต็ม" โดยอัตโนมัติ
   */
  v_debtors := jsonb_array_length(coalesce(p_shares, '[]'::jsonb));

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

  /* ★ หารเท่ากันต้องมีคนหาร — ศูนย์ลูกหนี้ก็ข้ามไปเลย ไม่ใช่หารด้วยศูนย์ */
  if v_bill.split_mode = 'EQUAL' and v_debtors > 0 then
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

  elsif v_bill.split_mode <> 'EQUAL' then
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

  /* แจ้งเตือนทุกคนที่ถูกเพิ่ม (FR-X04) — ศูนย์คนก็ไม่มีใครถูกกวน */
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

-- ★★ ย้ำอีกครั้ง: ต้องเหลือตัวเดียวเท่านั้น
--    ★ สองตัวที่ต่างกันแค่พารามิเตอร์ท้ายที่มีค่าเริ่มต้น = PostgREST เลือกไม่ถูก
drop function if exists public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb);

revoke all on function
  public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function
  public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb, boolean)
  to service_role;
