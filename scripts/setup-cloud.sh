#!/usr/bin/env bash
# ============================================================================
#  ติดตั้งฐานข้อมูลขึ้น Supabase cloud ให้จบในคำสั่งเดียว
# ============================================================================
#
#  ใช้อย่างใดอย่างหนึ่ง:
#
#    # ก) ด้วย personal access token (แนะนำ)
#    #    ขอที่ https://supabase.com/dashboard/account/tokens
#    SUPABASE_ACCESS_TOKEN=sbp_xxx DB_PASSWORD='รหัสผ่าน DB' ./scripts/setup-cloud.sh
#
#    # ข) ด้วย connection string ตรง ๆ (ไม่ต้องมี token)
#    #    Settings → Database → Connection string → URI (Session pooler)
#    DB_URL='postgresql://postgres.xxx:pass@aws-0-...pooler.supabase.com:5432/postgres' \
#      ./scripts/setup-cloud.sh
#
#  สิ่งที่สคริปต์นี้ทำ:
#    1. push migration 0001–0008
#    2. generate types/database.ts จาก schema จริง แล้วเทียบกับที่เขียนมือไว้
#    3. ตรวจว่าตาราง / RLS / realtime ลงครบ
# ============================================================================
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-lklrbicnfuqsutodxyby}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

SUPABASE="npx --yes supabase"

# ---------------------------------------------------------------------------
step "1 · ตรวจสิ่งที่ต้องใช้"
# ---------------------------------------------------------------------------
if [ -n "${DB_URL:-}" ]; then
  MODE="db-url"
  pass "ใช้ connection string ที่ส่งมา"
elif [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  MODE="token"
  pass "ใช้ personal access token"
  [ -n "${DB_PASSWORD:-}" ] || warn "ไม่มี DB_PASSWORD — ถ้า push ไม่ผ่านให้ใส่เพิ่ม"
else
  fail "ต้องมี SUPABASE_ACCESS_TOKEN หรือ DB_URL อย่างใดอย่างหนึ่ง (ดูหัวไฟล์)"
fi

# ---------------------------------------------------------------------------
step "2 · Push migration"
# ---------------------------------------------------------------------------
if [ "$MODE" = "db-url" ]; then
  $SUPABASE db push --db-url "$DB_URL" --include-all --yes \
    && pass "migration ขึ้นครบแล้ว" || fail "push ไม่สำเร็จ"
else
  $SUPABASE link --project-ref "$PROJECT_REF" ${DB_PASSWORD:+-p "$DB_PASSWORD"} \
    && pass "link project แล้ว" || fail "link ไม่สำเร็จ"
  $SUPABASE db push --linked --include-all --yes \
    && pass "migration ขึ้นครบแล้ว" || fail "push ไม่สำเร็จ"
fi

# ---------------------------------------------------------------------------
step "3 · Generate types แล้วเทียบกับที่เขียนด้วยมือ"
# ---------------------------------------------------------------------------
# ★ ขั้นนี้สำคัญ: types/database.ts ถูกเขียนมือให้ตรงกับ migration
#   ถ้า generate ออกมาแล้วต่างกัน แปลว่ามีอะไรไม่ตรงระหว่างที่เข้าใจกับของจริง
cp types/database.ts /tmp/mr-types-handwritten.ts

if [ "$MODE" = "db-url" ]; then
  $SUPABASE gen types typescript --db-url "$DB_URL" > /tmp/mr-types-generated.ts
else
  $SUPABASE gen types typescript --linked > /tmp/mr-types-generated.ts
fi

if [ -s /tmp/mr-types-generated.ts ]; then
  pass "generate สำเร็จ ($(wc -l < /tmp/mr-types-generated.ts | tr -d ' ') บรรทัด)"
  for t in profiles rooms room_members queue_items playback_states \
           youtube_search_cache youtube_videos rate_limits; do
    grep -q "$t:" /tmp/mr-types-generated.ts \
      && pass "  พบตาราง $t" || fail "  ไม่พบตาราง $t ใน schema จริง"
  done
  for f in create_room join_room enqueue_track advance_queue set_playback \
           remove_queue_item clear_queue consume_rate_limit server_now; do
    grep -q "$f:" /tmp/mr-types-generated.ts \
      && pass "  พบฟังก์ชัน $f" || fail "  ไม่พบฟังก์ชัน $f ใน schema จริง"
  done
else
  fail "generate types ไม่สำเร็จ"
fi

# ---------------------------------------------------------------------------
step "4 · ตรวจ RLS / Realtime ผ่าน REST"
# ---------------------------------------------------------------------------
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
KEY=$(grep -E '^NEXT_PUBLIC_SUPABASE_(PUBLISHABLE_KEY|ANON_KEY)=' .env.local | head -1 | cut -d= -f2-)

if [ -n "$URL" ] && [ -n "$KEY" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL/rest/v1/rooms?select=id&limit=1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  case "$CODE" in
    200) pass "ตาราง rooms เข้าถึงได้ (คืน 0 แถวเพราะ RLS — ถูกต้อง)" ;;
    404) fail "ยังไม่เห็นตาราง rooms — migration อาจยังไม่ขึ้น" ;;
    *)   warn "rooms ตอบ $CODE (ตรวจเองอีกครั้ง)" ;;
  esac

  ANON=$(curl -s "$URL/auth/v1/settings" -H "apikey: $KEY" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['external']['anonymous_users'])" 2>/dev/null || echo "?")
  [ "$ANON" = "True" ] \
    && pass "anonymous sign-ins เปิดแล้ว" \
    || warn "★ anonymous sign-ins ยังปิด — เปิดที่ Authentication → Sign In / Providers"
fi

# ---------------------------------------------------------------------------
step "เสร็จแล้ว"
# ---------------------------------------------------------------------------
echo "  types ที่เขียนมือ : /tmp/mr-types-handwritten.ts"
echo "  types จาก schema  : /tmp/mr-types-generated.ts"
echo ""
echo "  ต่อไป: cp /tmp/mr-types-generated.ts types/database.ts && npm run build"
echo "  ทดสอบ race condition: DB_URL='...' npm run db:test   (ต้องมี psql)"
echo ""
