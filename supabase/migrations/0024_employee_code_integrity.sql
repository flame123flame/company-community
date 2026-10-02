-- ═══════════════════════════════════════════════════════════════════
-- 0024 · ปิดช่องที่ profiles.employee_code ค้างเป็นผี
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ บั๊กที่เจอจริงตอนทดสอบหน้า Admin
--
--     หน้า "ผู้ใช้งาน" แสดงคนสองคนถือรหัส EMP002 พร้อมกัน ทั้งที่
--     employee_codes.claimed_by มี unique index กันไว้แล้ว
--
--     ลำดับที่ทำให้เกิด:
--       1. officetest ผูก EMP002 → profiles.employee_code = 'EMP002'
--                                   employee_codes.claimed_by = officetest
--       2. ลบแถว EMP002 ทิ้ง (ทำจาก dashboard/REST ได้)
--          ★ profiles.employee_code ของ officetest ยังค้างอยู่ —
--            0023 จงใจไม่ผูก FK ไว้ เพื่อให้ Admin ลบรหัสได้โดยไม่ติดขัด
--            แต่ไม่ได้จัดการผลที่ตามมาเลยสักอย่าง
--       3. สร้าง EMP002 ใหม่ → claimed_by = null → officetest2 ผูกได้
--       4. ผลลัพธ์: สองคนถือรหัสเดียวกันในสายตาของ profiles
--
-- ★★ ทำไมเรื่องนี้ไม่ใช่แค่ "ตัวเลขในตารางเพี้ยน"
--
--    requireOfficeUser() ตัดสินสิทธิ์จาก profiles.employee_code ตัวเดียว
--    ★ คนที่รหัสถูกลบหรือถูกยกให้คนอื่นไปแล้ว จึงยังเข้าโมดูลออฟฟิศได้ต่อ
--      ทั้งที่ NFR-11 บอกว่าใช้ได้เฉพาะคนที่มีรหัสอยู่ในรายชื่อและยังใช้งานอยู่
--
-- ★★ ทางแก้: trigger ไม่ใช่ FK
--
--    FK จะทำให้ลบรหัสไม่ได้จนกว่าจะไปแก้ profiles ก่อน ซึ่งเป็นเหตุผลที่
--    0023 ไม่ใช้มันตั้งแต่แรก ★ trigger ให้ทั้งสองอย่าง: ลบได้ และสำเนา
--    ถูกล้างให้อัตโนมัติในทรานแซกชันเดียวกัน
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ล้างสำเนาเมื่อรหัสถูกลบ หรือเปลี่ยนมือ
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.sync_employee_code_holder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    /*
     * ★ ล้างเฉพาะคนที่ถือรหัสนี้จริง ๆ
     *   เงื่อนไข employee_code = old.code กันกรณีที่ profiles ถูกแก้ไปแล้ว
     *   ระหว่างนั้น — เราไม่อยากล้างค่าที่ถูกต้องทิ้งโดยไม่ตั้งใจ
     */
    if old.claimed_by is not null then
      update public.profiles
         set employee_code = null,
             /* ★ ระงับบัญชีด้วย ไม่ใช่แค่ล้างรหัส
                คนที่รหัสถูกลบคือคนที่ไม่ควรอยู่ในระบบแล้ว — ปล่อยให้บัญชี
                ยัง ACTIVE ไว้แปลว่าเขากลับมาผูกรหัสอื่นได้ทันที */
             account_status = 'SUSPENDED'
       where id = old.claimed_by
         and employee_code = old.code;
    end if;
    return old;
  end if;

  /* UPDATE — รหัสเปลี่ยนมือ หรือถูกปลดการจอง */
  if old.claimed_by is distinct from new.claimed_by and old.claimed_by is not null then
    update public.profiles
       set employee_code = null
     where id = old.claimed_by
       and employee_code = old.code;
  end if;

  return new;
end;
$$;

drop trigger if exists employee_codes_sync_holder on public.employee_codes;
create trigger employee_codes_sync_holder
  after delete or update of claimed_by on public.employee_codes
  for each row execute function public.sync_employee_code_holder();


-- ═════════════════════════════════════════════════════════════════════
-- 2 · ซ่อมข้อมูลที่เพี้ยนไปแล้ว
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ความจริงอยู่ที่ employee_codes.claimed_by เสมอ (มี unique index คุม)
--   ★ profiles.employee_code ที่ไม่ตรงกับความจริงคือสำเนาที่ค้าง ล้างทิ้ง

update public.profiles p
   set employee_code = null
 where p.employee_code is not null
   and not exists (
     select 1 from public.employee_codes e
      where e.code = p.employee_code
        and e.claimed_by = p.id
   );


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ด่านตรวจความถูกต้องแบบอ่านอย่างเดียว
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★ ให้ฝั่ง server เรียกได้เมื่ออยากมั่นใจจริง ๆ ว่ารหัสยังใช้ได้อยู่
--
--    requireOfficeUser() ยังอ่าน profiles.employee_code ต่อไปในเส้นทางปกติ
--    เพราะมันคือ query เดียวที่ทำอยู่แล้ว ★ ตอนนี้เชื่อถือได้แล้วเพราะ
--    trigger ด้านบนรับประกันว่าสำเนาตรงกับความจริงเสมอ
--
--    ★ ฟังก์ชันนี้มีไว้สำหรับจุดที่ "ผิดแล้วเสียหายหนัก" เช่นก่อนสร้าง
--      รายการเงิน — ยอมจ่ายอีกหนึ่ง query เพื่อไม่ต้องเชื่อสำเนา
create or replace function public.employee_code_is_valid(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.employee_codes e
      on e.code = p.employee_code and e.claimed_by = p.id
    where p.id = p_user
      and p.account_status = 'ACTIVE'
      and e.status = 'ACTIVE'
  );
$$;

revoke execute on function public.employee_code_is_valid(uuid) from public, anon, authenticated;
grant execute on function public.employee_code_is_valid(uuid) to service_role;
