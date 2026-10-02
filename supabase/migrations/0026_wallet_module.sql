-- ═══════════════════════════════════════════════════════════════════
-- 0026 · โมดูล B · กระเป๋าเงินออฟฟิศ
-- ═══════════════════════════════════════════════════════════════════
--
--   FR-B01  สร้างรายการค้างจ่าย (ผู้ค้าง ยอด รายละเอียด ใบเสร็จ)
--   FR-B02  หารเท่ากัน หรือระบุยอดรายคน
--   FR-B03  QR รับเงินของผู้รับ (X06 ใช้ร่วมกับตลาดนัด)
--   FR-B04  ผู้จ่ายกด "โอนแล้ว" + แนบสลิป → ผู้รับยืนยัน → ชำระแล้ว
--   FR-B05  แจ้งเตือนอัตโนมัติตามรอบ (ค่าเริ่มต้น 1, 3, 7 วัน)
--   FR-B06  ทวงเองได้วันละ 1 ครั้งต่อรายการ (สุภาพ/ขำ)
--   FR-B07  สรุป "ฉันค้างใคร" / "ใครค้างฉัน"
--   NFR-05  audit log ทุกการแก้ไขรายการเงิน
--   NFR-08  ยอดค้างเห็นเฉพาะผู้เกี่ยวข้อง — ไม่มีกระดานลูกหนี้สาธารณะ
--
-- ★★★ ระบบนี้ไม่โอนเงิน มันบันทึกอย่างเดียว (กฎข้อ 1 ในหัวข้อ 7)
--
--     ไม่มีการเชื่อมธนาคาร ไม่มี payment gateway ไม่มียอดคงเหลือ
--     ★ สิ่งที่เก็บคือ "ข้อตกลงระหว่างคนสองคน" และสถานะของมัน
--       การโอนจริงเกิดในแอปธนาคารของผู้ใช้ ซึ่งเราไม่มีทางรู้ได้เอง
--       จึงต้องให้ "ผู้รับกดยืนยัน" เป็นตัวปิดรายการเสมอ
-- ───────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════
-- 1 · บิลที่หารกัน
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.expense_bills (
  id           uuid primary key default gen_random_uuid(),

  title        text not null
               constraint expense_bills_title_len
               check (char_length(btrim(title)) between 1 and 100),

  /*
   * ★★★ numeric ไม่ใช่ float หรือ integer-สตางค์
   *
   *     float: 0.1 + 0.2 ≠ 0.3 — เงินที่บวกกันแล้วไม่ตรงคือบั๊กที่
   *            ทำลายความเชื่อใจทั้งระบบ และหาสาเหตุยากมากเพราะผิดทีละเศษ
   *     integer-สตางค์: ถูกต้องเป๊ะ แต่ทุกที่ที่อ่านค่าต้องหาร 100 เอง
   *            ★ ที่ไหนลืมหาร จะแสดงยอด 12,000 บาทแทน 120 บาท
   *
   *     numeric(12,2) ถูกต้องเป๊ะเหมือน integer และอ่านได้ตรง ๆ
   *     เพดาน 10 หลัก = หลักพันล้านบาท ซึ่งเกินพอสำหรับค่าข้าวออฟฟิศ
   */
  total_amount numeric(12,2) not null
               constraint expense_bills_amount_positive check (total_amount > 0),

  /** FOOD | COFFEE | OTHER — ใช้แยกหมวดในหน้าสรุป (FR-B09) */
  category     text not null default 'FOOD'
               constraint expense_bills_category
               check (category in ('FOOD', 'COFFEE', 'OTHER')),

  bill_date    date not null default current_date,

  /** ★ path ใน private bucket ไม่ใช่ URL — ใบเสร็จเห็นเฉพาะคนในบิล (NFR-06) */
  receipt_path text,

  /** คนที่จ่ายไปก่อน = เจ้าหนี้ของทุกรายการในบิลนี้ */
  payer_id     uuid not null references public.profiles(id) on delete cascade,

  /** EQUAL | CUSTOM (FR-B02) */
  split_mode   text not null default 'EQUAL'
               constraint expense_bills_split
               check (split_mode in ('EQUAL', 'CUSTOM')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists expense_bills_touch on public.expense_bills;
create trigger expense_bills_touch
  before update on public.expense_bills
  for each row execute function public.touch_updated_at();

create index if not exists expense_bills_payer_idx
  on public.expense_bills (payer_id, bill_date desc);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · รายการค้างจ่ายรายคน
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.debts (
  id           uuid primary key default gen_random_uuid(),

  /** null = รายการเดี่ยวที่ไม่ได้มาจากบิลหาร */
  bill_id      uuid references public.expense_bills(id) on delete cascade,

  creditor_id  uuid not null references public.profiles(id) on delete cascade,
  debtor_id    uuid not null references public.profiles(id) on delete cascade,

  amount       numeric(12,2) not null
               constraint debts_amount_positive check (amount > 0),

  description  text
               constraint debts_desc_len
               check (description is null or char_length(description) <= 200),

  /*
   * PENDING      — ค้างจ่าย
   * PAID_PENDING — ผู้จ่ายกด "โอนแล้ว" รอผู้รับยืนยัน (FR-B04)
   * SETTLED      — ผู้รับยืนยันแล้ว จบ
   * CANCELLED    — เจ้าหนี้ยกเลิกหนี้
   *
   * ★★ ต้องมี PAID_PENDING แยกจาก SETTLED
   *    ถ้าให้ผู้จ่ายกดแล้วปิดรายการเลย ใครก็กดปิดหนี้ตัวเองได้โดยไม่โอนจริง
   *    ★ ระบบไม่มีทางรู้ว่าเงินเข้าบัญชีหรือยัง — คนเดียวที่รู้คือผู้รับ
   */
  status       text not null default 'PENDING'
               constraint debts_status
               check (status in ('PENDING', 'PAID_PENDING', 'SETTLED', 'CANCELLED')),

  /** ★ สลิปอยู่ใน private bucket — เห็นเฉพาะคู่นี้สองคน (NFR-07) */
  slip_path    text,

  paid_at      timestamptz,
  confirmed_at timestamptz,

  /** FR-B06 — ทวงได้วันละ 1 ครั้งต่อรายการ */
  last_reminded_at timestamptz,
  /** FR-B05 — รอบเตือนอัตโนมัติที่ส่งไปแล้ว เช่น [1,3] */
  auto_reminded    integer[] not null default '{}',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  /* ★ ค้างเงินตัวเองไม่ได้ — กันตั้งแต่ระดับฐานข้อมูล ไม่ใช่แค่ใน UI */
  constraint debts_not_self check (creditor_id <> debtor_id)
);

comment on table public.debts is
  'รายการค้างจ่ายระหว่างพนักงานสองคน — ระบบบันทึกอย่างเดียว ไม่มีการโอนเงินจริง';

drop trigger if exists debts_touch on public.debts;
create trigger debts_touch
  before update on public.debts
  for each row execute function public.touch_updated_at();

-- ★ สอง query หลักของ FR-B07: "ฉันค้างใคร" กับ "ใครค้างฉัน"
create index if not exists debts_debtor_idx
  on public.debts (debtor_id, status, created_at desc);
create index if not exists debts_creditor_idx
  on public.debts (creditor_id, status, created_at desc);

-- ★ ใช้โดย cron ที่ส่งเตือนอัตโนมัติ (FR-B05) — เฉพาะที่ยังค้างจริง
create index if not exists debts_pending_idx
  on public.debts (created_at)
  where status = 'PENDING';


-- ═════════════════════════════════════════════════════════════════════
-- 3 · ที่เก็บไฟล์ส่วนตัว (NFR-06 / NFR-07)
-- ═════════════════════════════════════════════════════════════════════
--
-- ★★★ ทั้งสาม bucket เป็น private (public = false)
--
--     ใบเสร็จ สลิปโอนเงิน และ QR รับเงิน เป็นข้อมูลที่ NFR-07 ระบุว่า
--     "แสดงเฉพาะคู่ที่เกี่ยวข้อง" ★ bucket สาธารณะแปลว่าใครที่เดา URL ถูก
--       ก็เปิดดูสลิปโอนเงินของคนทั้งบริษัทได้ ซึ่งมีเลขบัญชีอยู่ในรูป
--
--     การเข้าถึงทำผ่าน signed URL อายุสั้นที่ออกให้ฝั่ง server หลังตรวจสิทธิ์

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts',   'receipts',   false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('slips',      'slips',      false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('payment-qr', 'payment-qr', false, 2097152, array['image/jpeg','image/png'])
on conflict (id) do nothing;

/*
 * ★★ ไม่มี RLS policy ให้ client อ่าน/เขียน bucket พวกนี้เลย
 *
 *    ทุกการอัปโหลดผ่าน Route Handler ที่ใช้ service role หลังตรวจสิทธิ์แล้ว
 *    และทุกการอ่านผ่าน signed URL ที่ server เป็นคนออกให้
 *    ★ ถ้าเปิด policy ให้ client เขียนเอง เราจะคุมไม่ได้ว่าไฟล์ถูกวางที่ path
 *      ของใคร — คนหนึ่งเขียนทับ QR ของอีกคนได้
 */


-- ═════════════════════════════════════════════════════════════════════
-- 4 · สร้างบิล + แตกเป็นรายการค้าง (FR-B01 / FR-B02)
-- ═════════════════════════════════════════════════════════════════════

/**
 * สร้างบิลและแตกรายการค้างจ่ายให้ผู้ร่วมจ่ายแต่ละคน
 *
 * p_shares รูปแบบ: [{"userId":"…","amount":123.45}, …]
 *   - โหมด EQUAL  ให้ส่ง amount เป็น null แล้วฟังก์ชันหารให้
 *   - โหมด CUSTOM ต้องส่ง amount ครบทุกคน และผลรวมต้องเท่ากับ total
 *
 * ★★★ ปัญหาเศษสตางค์ของการหารเท่ากัน
 *
 *     100 บาท หาร 3 คน = 33.333… ซึ่งเก็บเป็น 33.33 ได้อย่างเดียว
 *     ★ สามคนรวมกันได้ 99.99 — หายไป 1 สตางค์ ซึ่งแปลว่าคนจ่ายไปก่อน
 *       ได้เงินคืนไม่ครบ และยอดในระบบไม่ตรงกับใบเสร็จตลอดไป
 *
 *     ★★ ทางแก้: ให้เศษที่เหลือตกกับคนแรก ๆ คนละ 1 สตางค์จนครบ
 *        33.34 + 33.33 + 33.33 = 100.00 พอดี
 *        ไม่ใช่วิธีเดียวที่ถูก แต่เป็นวิธีที่ "ผลรวมตรงเสมอ" ซึ่งเป็น
 *        คุณสมบัติที่ขาดไม่ได้ ส่วนใครรับเศษนั้นไม่มีใครสนใจจริง ๆ
 */
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

  v_count := jsonb_array_length(coalesce(p_shares, '[]'::jsonb));
  if v_count = 0 then
    raise exception 'VALIDATION_FAILED: no participants';
  end if;

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

  if v_bill.split_mode = 'EQUAL' then
    /* ★ ปัดลงก่อน แล้วค่อยแจกเศษ — ไม่ใช่ round() ซึ่งอาจทำให้ผลรวมเกิน */
    v_base := floor(p_total * 100 / v_count) / 100;
    v_remainder := round(p_total * 100)::integer - (round(v_base * 100)::integer * v_count);

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

    /*
     * ★★ ผลรวมของรายการย่อยต้องไม่เกินยอดบิล
     *    อนุญาตให้ "น้อยกว่า" ได้ เพราะคนจ่ายอาจออกส่วนของตัวเองด้วย
     *    ★ แต่ถ้า "มากกว่า" แปลว่ากรอกผิดแน่นอน — ปฏิเสธทั้งรายการ
     *      ดีกว่าปล่อยให้มีหนี้ที่รวมแล้วเกินใบเสร็จจริง
     */
    if v_sum > p_total then
      raise exception 'VALIDATION_FAILED: shares exceed total';
    end if;
  end if;

  /* แจ้งเตือนทุกคนที่ถูกเพิ่ม (FR-X04) */
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


-- ═════════════════════════════════════════════════════════════════════
-- 5 · วงจรการชำระ (FR-B04)
-- ═════════════════════════════════════════════════════════════════════

/** ผู้จ่ายกด "โอนแล้ว" — แนบสลิปได้ */
create or replace function public.mark_debt_paid(
  p_actor uuid,
  p_id    uuid,
  p_slip  text default null
)
returns public.debts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.debts;
begin
  select * into v_row from public.debts where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  /* ★ เฉพาะลูกหนี้เท่านั้น — เจ้าหนี้กดแทนไม่ได้ */
  if v_row.debtor_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status not in ('PENDING', 'PAID_PENDING') then
    raise exception 'VALIDATION_FAILED: already closed';
  end if;

  update public.debts
     set status    = 'PAID_PENDING',
         slip_path = coalesce(p_slip, slip_path),
         paid_at   = now()
   where id = p_id
   returning * into v_row;

  perform public.notify(
    v_row.creditor_id, 'debtPaidPending', 'notify.type.debtPaidPending',
    jsonb_build_object('amount', v_row.amount), '/office/wallet/owed'
  );

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'debt.markPaid', 'debt', p_id::text,
          jsonb_build_object('amount', v_row.amount));

  return v_row;
end;
$$;


/** ผู้รับกดยืนยันว่าได้เงินแล้ว — ปิดรายการ */
create or replace function public.confirm_debt(p_actor uuid, p_id uuid)
returns public.debts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.debts;
begin
  select * into v_row from public.debts where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  /* ★★ เฉพาะเจ้าหนี้ — นี่คือด่านที่ทำให้ระบบเชื่อถือได้
     คนเดียวที่รู้ว่าเงินเข้าบัญชีจริงคือเจ้าของบัญชี */
  if v_row.creditor_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status = 'SETTLED' then
    return v_row;   -- กดซ้ำไม่พัง
  end if;

  update public.debts
     set status = 'SETTLED', confirmed_at = now()
   where id = p_id
   returning * into v_row;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'debt.confirm', 'debt', p_id::text,
          jsonb_build_object('amount', v_row.amount));

  return v_row;
end;
$$;


/** เจ้าหนี้ยกเลิกหนี้ (ให้ไปเลย / กรอกผิด) */
create or replace function public.cancel_debt(p_actor uuid, p_id uuid)
returns public.debts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.debts;
begin
  select * into v_row from public.debts where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_row.creditor_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status = 'SETTLED' then
    raise exception 'VALIDATION_FAILED: already settled';
  end if;

  update public.debts set status = 'CANCELLED' where id = p_id returning * into v_row;

  insert into public.audit_log (actor_id, action, target_type, target_id, detail)
  values (p_actor, 'debt.cancel', 'debt', p_id::text,
          jsonb_build_object('amount', v_row.amount));

  return v_row;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 6 · ทวงเงิน (FR-B06)
-- ═════════════════════════════════════════════════════════════════════

/**
 * เจ้าหนี้กดทวง — วันละ 1 ครั้งต่อรายการ
 *
 * ★★ เพดานอยู่ที่ฐานข้อมูล ไม่ใช่ปุ่มที่ซ่อนใน UI
 *
 *    การทวงเป็นเรื่องที่กระทบความสัมพันธ์จริง ๆ ระหว่างเพื่อนร่วมงาน
 *    ★ ถ้าด่านอยู่แค่ฝั่งหน้าเว็บ คนที่รู้วิธียิง API จะทวงได้ไม่จำกัด
 *      ซึ่งเปลี่ยนฟีเจอร์นี้จาก "เครื่องมือเตือนความจำ" เป็น "เครื่องมือกวน"
 */
create or replace function public.remind_debt(
  p_actor uuid,
  p_id    uuid,
  p_tone  text default 'POLITE'
)
returns public.debts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.debts;
begin
  select * into v_row from public.debts where id = p_id for update;
  if not found then
    raise exception 'QUEUE_ITEM_NOT_FOUND';
  end if;

  if v_row.creditor_id <> p_actor then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status <> 'PENDING' then
    raise exception 'VALIDATION_FAILED: nothing to remind';
  end if;

  /* ★ เทียบด้วย "วันเดียวกัน" ไม่ใช่ "24 ชั่วโมง"
     คนทวงตอน 23:50 แล้วอยากทวงอีกทีเช้าวันรุ่งขึ้นควรทำได้
     ซึ่งตรงกับความเข้าใจของคำว่า "วันละครั้ง" มากกว่า */
  if v_row.last_reminded_at is not null
     and v_row.last_reminded_at::date = current_date then
    raise exception 'RATE_LIMITED';
  end if;

  update public.debts set last_reminded_at = now() where id = p_id returning * into v_row;

  perform public.notify(
    v_row.debtor_id, 'debtReminder', 'notify.type.debtReminder',
    jsonb_build_object('amount', v_row.amount, 'tone', coalesce(p_tone, 'POLITE')),
    '/office/wallet/owed'
  );

  return v_row;
end;
$$;


/**
 * เตือนอัตโนมัติตามรอบ (FR-B05) — เรียกจาก cron วันละครั้ง
 *
 * ★ อ่านรอบจาก app_settings ที่ Admin ปรับได้ ไม่ฮาร์ดโค้ด 1/3/7
 * ★ auto_reminded เก็บรอบที่ส่งไปแล้ว จึงไม่ส่งซ้ำแม้ cron จะรันหลายครั้ง
 */
create or replace function public.send_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days  integer[];
  v_day   integer;
  v_row   record;
  v_count integer := 0;
begin
  select array(select jsonb_array_elements_text(public.setting('reminder_days', '[1,3,7]'::jsonb))::integer)
  into v_days;

  foreach v_day in array v_days loop
    for v_row in
      select id, debtor_id, amount
      from public.debts
      where status = 'PENDING'
        and created_at::date <= current_date - v_day
        and not (v_day = any(auto_reminded))
    loop
      perform public.notify(
        v_row.debtor_id, 'debtReminder', 'notify.type.debtReminder',
        jsonb_build_object('amount', v_row.amount, 'days', v_day),
        '/office/wallet/owed'
      );
      update public.debts
         set auto_reminded = array_append(auto_reminded, v_day)
       where id = v_row.id;
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 7 · สรุปยอด (FR-B07)
-- ═════════════════════════════════════════════════════════════════════

/**
 * ยอดรวมสองฝั่งของผู้ใช้คนเดียว
 *
 * ★ คำนวณในฐานข้อมูล ไม่ใช่ดึงทุกแถวมาบวกฝั่ง client
 *   คนที่มีรายการ 300 แถวไม่ควรต้องโหลดทั้งหมดเพื่อดูตัวเลขสองตัว
 */
create or replace function public.my_debt_summary(p_actor uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'iOwe', coalesce((
      select sum(amount) from public.debts
      where debtor_id = p_actor and status in ('PENDING', 'PAID_PENDING')
    ), 0),
    'owedToMe', coalesce((
      select sum(amount) from public.debts
      where creditor_id = p_actor and status in ('PENDING', 'PAID_PENDING')
    ), 0),
    'pendingConfirm', coalesce((
      select count(*) from public.debts
      where creditor_id = p_actor and status = 'PAID_PENDING'
    ), 0)
  );
$$;


-- ═════════════════════════════════════════════════════════════════════
-- 8 · RLS (NFR-08)
-- ═════════════════════════════════════════════════════════════════════

alter table public.expense_bills enable row level security;
alter table public.debts         enable row level security;

revoke all on public.expense_bills, public.debts from anon, authenticated;
grant select on public.expense_bills, public.debts to authenticated;

/*
 * ★★★ ยอดค้างเห็นเฉพาะคู่ที่เกี่ยวข้อง — ไม่มีข้อยกเว้นแม้แต่ Admin
 *
 *     เอกสารระบุท้ายหัวข้อ 8.6: "ข้อมูลการเงินส่วนตัวของผู้ใช้
 *     Admin ไม่เห็นในหน้า Admin" ★ policy นี้จึงไม่มี or viewer_is_admin()
 *       ซึ่งต่างจาก employee_codes ที่ Admin อ่านได้
 *
 *     ★ ผลพลอยได้: ไม่มีทางทำ "กระดานลูกหนี้" ได้เลยแม้จะอยากทำ
 *       ซึ่งตรงกับ NFR-08 พอดี
 */
drop policy if exists "debts: parties read" on public.debts;
create policy "debts: parties read"
  on public.debts for select to authenticated
  using (creditor_id = (select auth.uid()) or debtor_id = (select auth.uid()));

drop policy if exists "expense_bills: parties read" on public.expense_bills;
create policy "expense_bills: parties read"
  on public.expense_bills for select to authenticated
  using (
    payer_id = (select auth.uid())
    or exists (
      select 1 from public.debts d
      where d.bill_id = expense_bills.id and d.debtor_id = (select auth.uid())
    )
  );


-- ═════════════════════════════════════════════════════════════════════
-- 9 · Realtime
-- ═════════════════════════════════════════════════════════════════════
--
-- ★ ยอดค้างต้องอัปเดตทันทีเมื่ออีกฝ่ายกดโอน/ยืนยัน — RLS กรองให้เอง
--   คนนอกจึงไม่มีทางได้ payload ของหนี้ที่ไม่เกี่ยวกับตัวเอง
alter table public.debts replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debts'
  ) then
    alter publication supabase_realtime add table public.debts;
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════
-- 10 · Grants
-- ═════════════════════════════════════════════════════════════════════

revoke execute on function
  public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb),
  public.mark_debt_paid(uuid, uuid, text),
  public.confirm_debt(uuid, uuid),
  public.cancel_debt(uuid, uuid),
  public.remind_debt(uuid, uuid, text),
  public.send_due_reminders(),
  public.my_debt_summary(uuid)
from public, anon, authenticated;

grant execute on function
  public.create_expense_bill(uuid, text, numeric, text, date, text, text, jsonb),
  public.mark_debt_paid(uuid, uuid, text),
  public.confirm_debt(uuid, uuid),
  public.cancel_debt(uuid, uuid),
  public.remind_debt(uuid, uuid, text),
  public.send_due_reminders(),
  public.my_debt_summary(uuid)
to service_role;
