-- ===========================================================================
-- 0065 · บันทึกค่าใช้จ่ายของตัวเองคนเดียว + หมวดค่าใช้จ่ายที่กว้างขึ้น
-- ===========================================================================
--
-- ★★★ ปัญหาที่แก้: กระเป๋าเงินบันทึก "ค่าใช้จ่ายของตัวเอง" ไม่ได้เลย
--
--     ★ สร้างบิลได้เฉพาะเมื่อมีคนอื่นร่วมจ่ายอย่างน้อยหนึ่งคน
--       ★★ วันไหนกินข้าวคนเดียว หรือจ่ายเองไม่ได้ออกให้ใคร = บันทึกไม่ได้
--          ★ ระบบจึงเป็น "เครื่องมือทวงหนี้" ไม่ใช่ "เครื่องมือดูค่าใช้จ่าย"
--            และหน้าสรุปไม่มีทางครบ เพราะเห็นเฉพาะมื้อที่มีคนอื่นเกี่ยวข้อง
--
-- ★★★ โครงข้อมูลรองรับอยู่แล้ว ไม่ต้องรื้ออะไรเลย
--
--     ★ p_shares ไม่เคยมีตัวผู้จ่ายอยู่ในนั้น — มีแต่ "คนอื่นที่ติดเงินเรา"
--       ★★ ส่วนของเราคำนวณจาก ยอดรวม − ผลรวมของคนอื่น (ดู summary/route.ts)
--       ★ บิลคนเดียวจึงคือ shares ว่าง แล้ว "ส่วนของฉัน = ยอดเต็ม"
--         ซึ่งถูกต้องเองโดยอัตโนมัติ
--     ★★ ลูปทุกอันในฟังก์ชันนี้วนศูนย์รอบแล้วจบ · v_sum = 0 ซึ่ง <= p_total
--        ★ ด่านเดียวที่ขวางอยู่คือ if v_count = 0 then raise ที่บรรทัดเดียว

-- ═════════════════════════════════════════════════════════════════════
-- 1 · หมวดค่าใช้จ่าย
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ของเดิมมีแค่ FOOD · COFFEE · OTHER ซึ่งพอสำหรับ "ค่าข้าวที่หารกัน"
--    ★ แต่พอบันทึกของตัวเองได้ ทุกอย่างที่ไม่ใช่อาหารจะไปกองรวมกันที่ OTHER
--      ★★ แล้วกราฟแยกประเภทจะบอกได้แค่ "อาหาร" กับ "อย่างอื่น"
--         ซึ่งตอบคำถาม "เงินหายไปไหน" ไม่ได้เลย
--
-- ★ เพิ่มเท่าที่ออฟฟิศใช้จริง ไม่ไล่ใส่ให้ครบทุกหมวดของแอปบัญชี
--   ★★ หมวดเยอะเกินแปลว่าทุกครั้งที่บันทึกต้องหยุดคิดว่าอันนี้หมวดไหน
--      ★ ซึ่งเป็นแรงเสียดทานที่ทำให้คนเลิกบันทึก

alter table public.expense_bills
  drop constraint if exists expense_bills_category_check;

alter table public.expense_bills
  add constraint expense_bills_category_check
  check (category in ('FOOD', 'COFFEE', 'TRANSPORT', 'SUPPLIES', 'FUN', 'OTHER'));


-- ═════════════════════════════════════════════════════════════════════
-- 2 · อนุญาตให้บิลไม่มีผู้ร่วมจ่าย
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.create_expense_bill(
  p_actor    uuid,
  p_title    text,
  p_total    numeric,
  p_category text,
  p_date     date,
  p_receipt  text,
  p_split    text,
  p_shares   jsonb
)
returns public.expense_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill      public.expense_bills;
  v_count     integer;
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
   *     ★ ของเดิม raise ตรงนี้ ★★ นั่นคือบรรทัดเดียวที่ขวาง
   *       "บันทึกค่าใช้จ่ายของตัวเอง" มาตลอด
   *     ★ ลูปข้างล่างวนศูนย์รอบแล้วจบ ไม่มีหนี้ถูกสร้าง ไม่มีใครถูกแจ้งเตือน
   *       ★★ ซึ่งเป็นพฤติกรรมที่ถูกต้องเป๊ะสำหรับบิลที่ไม่มีคนอื่นเกี่ยวข้อง
   */
  v_count := jsonb_array_length(coalesce(p_shares, '[]'::jsonb));

  /* ★ ทุกคนที่ถูกใส่ในบิลต้องเป็นพนักงานที่ใช้งานอยู่จริง
     ไม่งั้นจะสร้างหนี้ผูกกับ uuid ที่ไม่มีตัวตนหรือคนที่ลาออกไปแล้ว */
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

  /* ★ หารเท่ากันต้องมีคนหาร — ศูนย์คนก็ข้ามไปเลย ไม่ใช่หารด้วยศูนย์ */
  if v_bill.split_mode = 'EQUAL' and v_count > 0 then
    /* ★ ปัดลงก่อน แล้วค่อยแจกเศษ — ไม่ใช่ round() ซึ่งอาจทำให้ผลรวมเกิน */
    v_base := floor(p_total * 100 / v_count) / 100;
    v_remainder := round(p_total * 100)::integer - (round(v_base * 100)::integer * v_count);

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

    /*
     * ★★ ผลรวมของรายการย่อยต้องไม่เกินยอดบิล
     *    อนุญาตให้ "น้อยกว่า" ได้ เพราะคนจ่ายอาจออกส่วนของตัวเองด้วย
     *    ★ แต่ถ้า "มากกว่า" แปลว่ากรอกผิดแน่นอน — ปฏิเสธทั้งรายการ
     */
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
          jsonb_build_object('total', p_total, 'people', v_count));

  return v_bill;
end;
$$;


revoke all on function public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb)
  to service_role;
