-- ============================================================================
--  0061 · ประเภทร้านเป็นรายการตายตัว + ราคาคาราโอเกะ
-- ============================================================================
--  ★★ ประเภทร้านเคยเป็นข้อความอิสระ (≤ 40 ตัวอักษร) — ใครพิมพ์อะไรก็กลายเป็นชิป
--     ใหม่ในหน้าร้านเด็ด ("อิตาเลียน" กับ "อิตาเลี่ยน" เป็นสองชิป)
--     ★ ตอนนี้บังคับเป็น 12 ค่า: 11 ค่าที่มีในระบบตอนนั้น + "คาราโอเกะ"
--     ★ ต้องตรงกับ CUISINES ใน lib/office/food.ts ทุกตัวอักษร
--
--  ★★ ร้านคาราโอเกะมีราคาแยกเป็น jsonb ในคอลัมน์ karaoke:
--     {
--       "hostessPerHour": 300 | null,            -- ค่าเด็กเอ็น/ชม./คน
--       "packages": [{"name":"…","price":1600,"hostesses":2}],  -- เหล้าเหมา รวมเด็กกี่คน
--       "rooms":    [{"name":"VIP","perHour":500,"night":3000}], -- ต่อชม. และ/หรือ เหมาคืน
--       "note": "…" | null
--     }
--     ★ รูปแบบละเอียดตรวจที่ API ด้วย zod — ฐานข้อมูลตรวจแค่ว่าเป็น object
--       ขนาดไม่เกิน และมีได้เฉพาะร้านประเภทคาราโอเกะ
--
--  รันซ้ำได้ — วางใน SQL Editor ได้ทั้งไฟล์
-- ============================================================================

-- ── 1 · ข้อมูลเดิมที่ไม่อยู่ในรายการ → ไม่ระบุประเภท (กันเพิ่ม constraint ไม่ผ่าน) ──
update public.restaurants
   set cuisine = null
 where cuisine is not null
   and cuisine not in ('ไทย','อีสาน','ใต้','จีน','ญี่ปุ่น','เวียดนาม','อิตาเลียน',
                       'ปิ้งย่าง','ชาบู','สุขภาพ','กาแฟ','คาราโอเกะ');

-- ── 2 · ประเภทต้องอยู่ในรายการ ───────────────────────────────────────────
alter table public.restaurants drop constraint if exists restaurants_cuisine_list;
alter table public.restaurants
  add constraint restaurants_cuisine_list
  check (cuisine is null or cuisine in ('ไทย','อีสาน','ใต้','จีน','ญี่ปุ่น','เวียดนาม','อิตาเลียน',
                                        'ปิ้งย่าง','ชาบู','สุขภาพ','กาแฟ','คาราโอเกะ'));

-- ── 3 · ราคาคาราโอเกะ ────────────────────────────────────────────────────
alter table public.restaurants
  add column if not exists karaoke jsonb;

alter table public.restaurants drop constraint if exists restaurants_karaoke_shape;
alter table public.restaurants
  add constraint restaurants_karaoke_shape
  check (
    karaoke is null
    or (
      jsonb_typeof(karaoke) = 'object'
      and octet_length(karaoke::text) <= 16000
      -- ★ ราคาคาราโอเกะมีได้เฉพาะร้านประเภทคาราโอเกะ — เปลี่ยนประเภทแล้ว API ล้างให้
      and cuisine = 'คาราโอเกะ'
    )
  );
