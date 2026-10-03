-- ===========================================================================
-- 0059 · ให้แจ้งเตือน "หักลบยอดค้าง" มีชนิดของตัวเอง
-- ===========================================================================
--
-- ★★★ สวิตช์ปิดแจ้งเตือนทำงานจากช่อง type ไม่ใช่จาก title_key
--
--     ★ สามข่าวเคยยืมชนิด 'debtCreated' มาใช้ —
--         เจ้าหนี้แจ้งว่ายังไม่ได้รับเงิน · ชวนตั้งค่า QR · หักลบยอดค้าง
--       ★★ แปลว่าคนที่ปิด "มีคนสร้างรายการค้างจ่ายถึงคุณ" จะเงียบไปอีกสามเรื่อง
--          ที่เขาไม่ได้สั่งให้เงียบ ★ โดยเฉพาะ "เงินที่โอนไปแล้วถูกตีกลับ"
--          ซึ่งเป็นข่าวที่ต้องรู้ที่สุด
--     ★ สองตัวแรกอยู่ใน route แก้ไปแล้ว ตัวนี้อยู่ใน RPC จึงต้องมาทาง migration
--
-- ★★ คัดลอกตัวฟังก์ชันมาจาก 0031 ทั้งก้อน เปลี่ยนแค่บรรทัดเดียว
--    ★ เขียนตรรกะใหม่เองคือการเปิดช่องให้ธง is_settlement หรือการล็อกแถว
--      หายไปโดยไม่มีใครสังเกต — ทั้งสองอย่างนั้นเคยเป็นบั๊กจริงมาแล้ว
--
-- ★ ไม่มี begin;/commit; — ตัวรันยิงทีละคำสั่งนอกทรานแซกชัน (เหตุผลใน 0056)

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

  /*
   * ★★★ 'debtNetted' ไม่ใช่ 'debtCreated' — แก้ใน 0059
   *     ★ ช่อง type คือสิ่งที่สวิตช์ในหน้าโปรไฟล์ใช้ตัดสินว่าจะส่งไหม
   *       ★★ ยืมชนิดของคนอื่นมาใช้ แปลว่าคนที่ปิด "มีคนสร้างรายการค้างจ่าย"
   *          จะไม่ได้รับข่าวว่าหนี้ตัวเองถูกหักลบไปด้วย ซึ่งเป็นคนละเรื่องกัน
   */
  perform public.notify(
    p_other, 'debtNetted', 'notify.type.debtNetted',
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

revoke all on function public.net_debts_between(uuid, uuid) from public, anon, authenticated;
grant execute on function public.net_debts_between(uuid, uuid) to service_role;
