/**
 * Type ของฐานข้อมูล — ตรงกับ supabase/migrations/0001–0007
 *
 * ★ ไฟล์นี้เขียนด้วยมือให้ตรงกับ migration แบบบรรทัดต่อบรรทัด
 *   เมื่อรันฐานข้อมูลได้แล้วให้ generate ทับเพื่อยืนยันว่าตรงกันจริง:
 *
 *     npm run db:types          # local
 *     npx supabase gen types typescript --project-id <ref> > types/database.ts
 *
 *   ถ้า diff ออกมาไม่ว่าง แปลว่า migration กับที่เข้าใจไว้ไม่ตรงกัน — ต้องแก้
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MemberRole = 'OWNER' | 'MEMBER' | 'GUEST'

/* ── ระบบกิจกรรมออฟฟิศ (0023) ─────────────────────────────────────────── */

/** ACTIVE = ยังเป็นพนักงาน · RESIGNED = ลาออก (บัญชีที่ผูกถูกระงับอัตโนมัติ) */
export type EmployeeCodeStatus = 'ACTIVE' | 'RESIGNED'
export type AccountStatus = 'ACTIVE' | 'SUSPENDED'
/** ชนิดเนื้อหาที่รายงานได้ — ตรงกับ check constraint ของ content_reports */
export type ReportTargetType = 'restaurant' | 'listing'

/* ── โมดูล B · กระเป๋าเงิน (0026/0027) ────────────────────────────────── */

/**
 * PENDING      ค้างจ่าย
 * PAID_PENDING ลูกหนี้กดโอนแล้ว รอเจ้าหนี้ยืนยัน
 * SETTLED      เจ้าหนี้ยืนยันแล้ว
 * CANCELLED    เจ้าหนี้ยกเลิก
 */
export type DebtStatus = 'PENDING' | 'PAID_PENDING' | 'SETTLED' | 'CANCELLED'
export type ExpenseCategory = 'FOOD' | 'COFFEE' | 'OTHER'
export type SplitMode = 'EQUAL' | 'CUSTOM'
/** โทนข้อความทวง (FR-B06) */
export type ReminderTone = 'POLITE' | 'FUNNY'

/* ── โมดูล D · ตลาดนัด (0029) ─────────────────────────────────────────── */

/** ขาย · แจกฟรี · แลกเปลี่ยน · หาซื้อ */
export type ListingKind = 'SELL' | 'FREE' | 'TRADE' | 'WANTED'
export type ListingStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD'
export type ListingCondition = 'NEW' | 'GOOD' | 'FLAWED'
/** ★ ชุดคงที่ตาม FR-D03 — ตรงกับ check constraint ของ listings.category */
export type ListingCategory =
  | 'ELECTRONICS' | 'FURNITURE' | 'CLOTHES' | 'BOOKS'
  | 'SPORTS' | 'FOOD' | 'PLANT' | 'OTHER'

/* ── โมดูล A · กินอะไรดี (0025) ───────────────────────────────────────── */

/** ช่วงราคา — ตรงกับ check constraint ของ restaurants.price_range */
export type PriceRange = '฿' | '฿฿' | '฿฿฿'
/** ระยะทาง: เดินได้ · ขับรถ · เดลิเวอรี */
export type DistanceBand = 'WALK' | 'DRIVE' | 'DELIVERY'

export type QueueStatus = 'WAITING' | 'PLAYING' | 'PLAYED' | 'SKIPPED' | 'REMOVED'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          prefix: string | null
          first_name: string | null
          last_name: string | null
          phone: string | null
          company: string | null
          position_title: string | null
          purpose: string | null
          terms_accepted_at: string | null
          password_set_at: string | null
          id: string
          display_name: string
          avatar_url: string | null
          /** ฉายา — ข้อความรองใต้ชื่อ */
          nickname: string | null
          /** ชื่อผู้ใช้สำหรับเข้าใช้งานข้ามเครื่อง (พิมพ์เล็กเสมอ) */
          username: string | null
          /** หน้าตาตัวละครในลอบบี้ (0019) — jsonb ดิบ sanitize ตอนใช้ */
          appearance: unknown
          is_guest: boolean
          /* ── ระบบกิจกรรมออฟฟิศ (0023) ─────────────────────────────────
           * ★ nullable ทั้งหมดโดยตั้งใจ — ผู้ใช้เดิมของห้องเพลงยังไม่มีค่าพวกนี้
           *   และต้องใช้งานห้องเพลงต่อได้โดยไม่ต้องผูกรหัสพนักงาน
           */
          /** ฝ่าย/แผนก — พนักงานกรอกเองตอนสมัคร */
          department: string | null
          /** รหัสพนักงานที่ผูกไว้ — null = เข้าโมดูลออฟฟิศไม่ได้ */
          employee_code: string | null
          is_admin: boolean
          account_status: 'ACTIVE' | 'SUSPENDED'
          /** path ใน private bucket ไม่ใช่ URL สาธารณะ (NFR-07) */
          payment_qr_path: string | null
          /** 0046 — เบอร์พร้อมเพย์ ใช้สร้าง QR ที่มียอดเงินอยู่แล้ว */
          promptpay_id: string | null
          /** 0047 — งบค่าข้าวต่อเดือน (null = ยังไม่ได้ตั้ง) */
          monthly_budget: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string
          avatar_url?: string | null
          nickname?: string | null
          username?: string | null
          is_guest?: boolean
          department?: string | null
          employee_code?: string | null
          is_admin?: boolean
          account_status?: 'ACTIVE' | 'SUSPENDED'
          payment_qr_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string
          avatar_url?: string | null
          nickname?: string | null
          username?: string | null
          is_guest?: boolean
          department?: string | null
          employee_code?: string | null
          is_admin?: boolean
          account_status?: 'ACTIVE' | 'SUSPENDED'
          payment_qr_path?: string | null
          promptpay_id?: string | null
          /** 0047 — งบค่าข้าวต่อเดือน (null = ยังไม่ได้ตั้ง) */
          monthly_budget?: number | null
          updated_at?: string
        }
        Relationships: []
      }

      chat_messages: {
        Row: {
          id: string
          room_id: string
          user_id: string
          text: string
          image_url: string | null
          image_width: number | null
          image_height: number | null
          mentions: { id: string; name: string }[]
          reply_to: {
            id: string
            displayName: string
            text: string
            hasImage: boolean
          } | null
          deleted_at: string | null
          /** true = วาดใหญ่ ไม่มีฟองข้อความ */
          is_sticker: boolean
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }

      room_stickers: {
        Row: {
          id: string
          room_id: string
          url: string
          width: number | null
          height: number | null
          created_by: string | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }

      chat_reactions: {
        Row: {
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }

      rooms: {
        Row: {
          id: string
          code: string
          name: string
          owner_id: string
          is_locked: boolean
          allow_guest_add: boolean
          allow_member_skip: boolean
          allow_member_control: boolean
          max_queue_size: number
          chat_theme: string | null
          chat_wallpaper: string | null
          chat_wallpaper_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name?: string
          owner_id: string
          is_locked?: boolean
          allow_guest_add?: boolean
          allow_member_skip?: boolean
          allow_member_control?: boolean
          max_queue_size?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          is_locked?: boolean
          allow_guest_add?: boolean
          allow_member_skip?: boolean
          allow_member_control?: boolean
          max_queue_size?: number
          updated_at?: string
        }
        Relationships: []
      }

      room_members: {
        Row: {
          id: string
          room_id: string
          user_id: string
          role: MemberRole
          /** เจ้าของห้องมอบสิทธิ์ลัดคิว/ข้ามเพลงให้หรือยัง (OWNER มีเสมอ) */
          can_skip: boolean
          joined_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          room_id: string
          user_id: string
          role?: MemberRole
          can_skip?: boolean
          joined_at?: string
          last_seen_at?: string
        }
        Update: {
          role?: MemberRole
          can_skip?: boolean
          last_seen_at?: string
        }
        Relationships: []
      }

      quiz_games: {
        Row: QuizGameRow
        Insert: Partial<QuizGameRow> & { room_id: string; host_id: string; total_rounds: number }
        Update: Partial<QuizGameRow>
        Relationships: []
      }
      quiz_scores: {
        Row: { game_id: string; user_id: string; points: number }
        Insert: { game_id: string; user_id: string; points?: number }
        Update: { points?: number }
        Relationships: []
      }
      /**
       * ★★★ quiz_rounds ไม่มีชนิดที่นี่โดยตั้งใจ — และห้ามเพิ่ม
       *     มันเก็บเฉลย การมีชนิดให้ใช้คือคำเชิญให้เผลอ select มันออกไป
       *     ★ ทุกอย่างที่ฝั่งไหนก็ตามต้องรู้ ถูกคัดลอกไว้ใน quiz_games แล้ว
       */
      skip_votes: {
        Row: { room_id: string; queue_item_id: string; user_id: string; created_at: string }
        Insert: { room_id: string; queue_item_id: string; user_id: string }
        Update: never
        Relationships: []
      }
      queue_items: {
        Row: {
          id: string
          room_id: string
          video_id: string
          title: string
          channel_title: string | null
          thumbnail_url: string | null
          /** วินาที */
          duration: number
          /** เพิ่มขึ้นเรื่อย ๆ ต่อห้อง ไม่เคยใช้ซ้ำ */
          position: number
          status: QueueStatus
          added_by: string | null
          /** ★ ขอเพลงนี้ให้ใคร — null = เพิ่มตามปกติ */
          dedicated_to: string | null
          dedication: string | null
          started_at: string | null
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          room_id: string
          video_id: string
          title: string
          channel_title?: string | null
          thumbnail_url?: string | null
          duration: number
          position: number
          status?: QueueStatus
          added_by?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: QueueStatus
          started_at?: string | null
          ended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      playback_states: {
        Row: {
          room_id: string
          queue_item_id: string | null
          video_id: string | null
          is_playing: boolean
          /** anchor เวลาฝั่ง server — ดูนิยามใน 0002_tables.sql */
          started_at: string | null
          paused_at: string | null
          /** วินาทีที่ freeze ไว้ตอน pause/seek */
          current_position: number
          /** เพิ่มขึ้นทุกครั้งที่เขียน — ใช้ทิ้ง realtime payload ที่มาผิดลำดับ */
          version: number
          updated_at: string
        }
        Insert: {
          room_id: string
          queue_item_id?: string | null
          video_id?: string | null
          is_playing?: boolean
          started_at?: string | null
          paused_at?: string | null
          current_position?: number
          version?: number
          updated_at?: string
        }
        Update: {
          queue_item_id?: string | null
          video_id?: string | null
          is_playing?: boolean
          started_at?: string | null
          paused_at?: string | null
          current_position?: number
          version?: number
          updated_at?: string
        }
        Relationships: []
      }

      youtube_search_cache: {
        Row: {
          query_key: string
          page_token: string
          results: Json
          fetched_at: string
        }
        Insert: {
          query_key: string
          page_token?: string
          results: Json
          fetched_at?: string
        }
        Update: {
          results?: Json
          fetched_at?: string
        }
        Relationships: []
      }

      youtube_videos: {
        Row: {
          video_id: string
          title: string
          channel_title: string | null
          thumbnail_url: string | null
          duration: number
          embeddable: boolean
          unavailable_reason: string | null
          fetched_at: string
        }
        Insert: {
          video_id: string
          title: string
          channel_title?: string | null
          thumbnail_url?: string | null
          duration: number
          embeddable?: boolean
          unavailable_reason?: string | null
          fetched_at?: string
        }
        Update: {
          title?: string
          channel_title?: string | null
          thumbnail_url?: string | null
          duration?: number
          embeddable?: boolean
          unavailable_reason?: string | null
          fetched_at?: string
        }
        Relationships: []
      }

      rate_limits: {
        Row: {
          bucket_key: string
          window_start: string
          counter: number
        }
        Insert: {
          bucket_key: string
          window_start: string
          counter?: number
        }
        Update: {
          counter?: number
        }
        Relationships: []
      }

      /* ── ระบบกิจกรรมออฟฟิศ (0023) ───────────────────────────────────── */

      employee_codes: {
        Row: {
          /** ตัวพิมพ์ใหญ่เสมอ — normalize ที่ RPC */
          code: string
          status: EmployeeCodeStatus
          claimed_by: string | null
          claimed_at: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          code: string
          status?: EmployeeCodeStatus
          claimed_by?: string | null
          claimed_at?: string | null
          created_by?: string | null
        }
        Update: {
          status?: EmployeeCodeStatus
          claimed_by?: string | null
          claimed_at?: string | null
        }
        Relationships: []
      }

      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          /** ★ คีย์แปล ไม่ใช่ข้อความ — สลับภาษาแล้วเปลี่ยนย้อนหลังทั้งหมด */
          title_key: string
          params: unknown
          link: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          type: string
          title_key: string
          params?: unknown
          link?: string | null
        }
        Update: { read_at?: string | null }
        Relationships: []
      }

      notification_prefs: {
        Row: { user_id: string; type: string; enabled: boolean }
        Insert: { user_id: string; type: string; enabled?: boolean }
        Update: { enabled?: boolean }
        Relationships: []
      }

      content_reports: {
        Row: {
          target_type: ReportTargetType
          target_id: string
          reporter_id: string
          reason: string | null
          created_at: string
        }
        Insert: {
          target_type: ReportTargetType
          target_id: string
          reporter_id: string
          reason?: string | null
        }
        Update: Record<never, never>
        Relationships: []
      }

      app_settings: {
        Row: {
          key: string
          value: unknown
          updated_at: string
          updated_by: string | null
        }
        /* ★ updated_at เขียนเองได้ — ตารางนี้ไม่มี trigger touch_updated_at
           (มีแค่ default now() ตอน insert ซึ่งไม่ทำงานตอน upsert-update) */
        Insert: { key: string; value: unknown; updated_by?: string | null; updated_at?: string }
        Update: { value?: unknown; updated_by?: string | null; updated_at?: string }
        Relationships: []
      }

      /* ── โมดูล A · กินอะไรดี (0025) ─────────────────────────────── */

      restaurants: {
        Row: {
          id: string
          name: string
          /** เมนูเด็ด — บังคับตาม FR-A01 */
          signature_dish: string
          image_path: string | null
          cuisine: string | null
          price_range: PriceRange | null
          distance: DistanceBand | null
          map_url: string | null
          note: string | null
          added_by: string | null
          /** ★ ตัวนับที่ RPC เขียนเท่านั้น — อย่าเขียนจากที่อื่น */
          vote_count: number
          maybe_closed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          signature_dish: string
          image_path?: string | null
          cuisine?: string | null
          price_range?: PriceRange | null
          distance?: DistanceBand | null
          map_url?: string | null
          note?: string | null
          added_by?: string | null
        }
        Update: {
          name?: string
          signature_dish?: string
          image_path?: string | null
          cuisine?: string | null
          price_range?: PriceRange | null
          distance?: DistanceBand | null
          map_url?: string | null
          note?: string | null
          maybe_closed?: boolean
        }
        Relationships: []
      }

      restaurant_votes: {
        Row: { restaurant_id: string; user_id: string; created_at: string }
        Insert: { restaurant_id: string; user_id: string }
        Update: Record<never, never>
        Relationships: []
      }

      restaurant_visits: {
        Row: { id: string; restaurant_id: string; user_id: string; visited_at: string }
        Insert: { restaurant_id: string; user_id: string }
        Update: Record<never, never>
        Relationships: []
      }

      /* ── โมดูล B · กระเป๋าเงิน (0026/0027) ──────────────────────── */

      expense_bills: {
        Row: {
          id: string
          title: string
          /** ★ numeric มาเป็น number จาก PostgREST — ห้ามคำนวณต่อด้วย float */
          total_amount: number
          category: ExpenseCategory
          bill_date: string
          receipt_path: string | null
          payer_id: string
          split_mode: SplitMode
          /** ★ เฟส 2 (0030) — ใช้จัดกลุ่มในหน้าสรุป ไม่ใช่ title */
          restaurant_id: string | null
          /* ── 0045 ── ค่าส่งรวมใน total_amount แล้ว · ส่วนลดหักออกแล้ว */
          delivery_fee: number
          discount: number
          rounded: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          title: string
          total_amount: number
          category?: ExpenseCategory
          bill_date?: string
          receipt_path?: string | null
          payer_id: string
          split_mode?: SplitMode
          restaurant_id?: string | null
        }
        Update: {
          title?: string
          receipt_path?: string | null
          /* 0045 — เขียนตามหลังการสร้างบิล (ดู api/office/wallet/route.ts) */
          restaurant_id?: string | null
          delivery_fee?: number
          discount?: number
          rounded?: boolean
        }
        Relationships: []
      }

      debts: {
        Row: {
          id: string
          bill_id: string | null
          creditor_id: string
          debtor_id: string
          amount: number
          description: string | null
          status: DebtStatus
          slip_path: string | null
          paid_at: string | null
          confirmed_at: string | null
          last_reminded_at: string | null
          auto_reminded: number[]
          /** ★ true = หนี้จากการหักลบ ไม่ใช่รายจ่ายใหม่ (0031) */
          is_settlement: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          bill_id?: string | null
          creditor_id: string
          debtor_id: string
          amount: number
          description?: string | null
        }
        Update: {
          status?: DebtStatus
          slip_path?: string | null
          paid_at?: string | null
          confirmed_at?: string | null
          last_reminded_at?: string | null
        }
        Relationships: []
      }

      /* ── โมดูล C · สุ่มและเกม (0028) ────────────────────────────── */

      name_sets: {
        Row: {
          id: string
          owner_id: string
          name: string
          /** [{id?, label, department?}] — ภาพถ่าย ณ ตอนบันทึก */
          members: unknown
          created_at: string
          updated_at: string
        }
        Insert: { owner_id: string; name: string; members?: unknown }
        Update: { name?: string; members?: unknown }
        Relationships: []
      }

      lottery_picks: {
        Row: {
          id: string
          user_id: string
          number: string
          draw_date: string | null
          created_at: string
        }
        Insert: { user_id: string; number: string; draw_date?: string | null }
        Update: Record<never, never>
        Relationships: []
      }

      /* ── โมดูล D · ตลาดนัด (0029) ───────────────────────────────── */

      listings: {
        Row: {
          id: string
          seller_id: string
          title: string
          price: number
          kind: ListingKind
          category: ListingCategory
          condition: ListingCondition | null
          description: string | null
          meet_building: string | null
          meet_floor: string | null
          meet_desk: string | null
          status: ListingStatus
          hidden: boolean
          created_at: string
          updated_at: string
        }
        Insert: { seller_id: string; title: string; price?: number }
        Update: { status?: ListingStatus; hidden?: boolean }
        Relationships: []
      }

      listing_images: {
        Row: { id: string; listing_id: string; url: string; sort: number; created_at: string }
        Insert: { listing_id: string; url: string; sort?: number }
        Update: Record<never, never>
        Relationships: []
      }

      listing_reservations: {
        Row: {
          listing_id: string
          user_id: string
          position: number
          status: 'ACTIVE' | 'CANCELLED' | 'CHOSEN'
          created_at: string
        }
        Insert: { listing_id: string; user_id: string; position: number }
        Update: { status?: 'ACTIVE' | 'CANCELLED' | 'CHOSEN' }
        Relationships: []
      }

      /* ── FR-C08 สายแข่งขัน (0032) ──────────────────────────────── */

      tournaments: {
        Row: {
          id: string
          owner_id: string
          name: string
          status: 'OPEN' | 'DONE'
          created_at: string
          updated_at: string
        }
        Insert: { owner_id: string; name?: string }
        Update: { name?: string; status?: 'OPEN' | 'DONE' }
        Relationships: []
      }

      tournament_teams: {
        Row: {
          id: string
          tournament_id: string
          name: string
          color: string
          members: unknown
          seed: number
          created_at: string
        }
        Insert: { tournament_id: string; name: string; color?: string; members?: unknown; seed?: number }
        Update: { name?: string; color?: string }
        Relationships: []
      }

      tournament_matches: {
        Row: {
          id: string
          tournament_id: string
          round: number
          slot: number
          team_a: string | null
          team_b: string | null
          winner: string | null
          score_a: number | null
          score_b: number | null
          played_at: string | null
          created_at: string
        }
        Insert: { tournament_id: string; round: number; slot: number }
        Update: { winner?: string | null; score_a?: number | null; score_b?: number | null }
        Relationships: []
      }

      /* ── FR-D08/D09 แชทตลาดนัด + คำค้น (0033) ──────────────────── */

      listing_threads: {
        Row: {
          id: string
          listing_id: string
          buyer_id: string
          last_message_at: string
          created_at: string
        }
        Insert: { listing_id: string; buyer_id: string }
        Update: { last_message_at?: string }
        Relationships: []
      }

      listing_messages: {
        Row: {
          id: string
          thread_id: string
          sender_id: string
          text: string
          read_at: string | null
          created_at: string
        }
        Insert: { thread_id: string; sender_id: string; text: string }
        Update: { read_at?: string | null }
        Relationships: []
      }

      search_alerts: {
        Row: { id: string; user_id: string; keyword: string; created_at: string }
        Insert: { user_id: string; keyword: string }
        Update: Record<never, never>
        Relationships: []
      }

      /* ── FR-A09 ห้องสุ่มกลุ่ม (0035) ────────────────────────────── */

      draw_rooms: {
        Row: {
          id: string
          host_id: string
          title: string
          options: { id: string; label: string }[]
          status: 'OPEN' | 'SPINNING' | 'DONE'
          winner_id: string | null
          winner_label: string | null
          spun_at: string | null
          created_at: string
        }
        Insert: { host_id: string; title: string; options: { id: string; label: string }[] }
        Update: {
          status?: 'OPEN' | 'SPINNING' | 'DONE'
          winner_id?: string | null
          winner_label?: string | null
          spun_at?: string | null
        }
        Relationships: []
      }

      draw_room_members: {
        Row: { room_id: string; user_id: string; joined_at: string }
        Insert: { room_id: string; user_id: string }
        Update: Record<never, never>
        Relationships: []
      }

      /* ── แชทออฟฟิศ (0038) ─────────────────────────────────────── */

      office_chat_rooms: {
        Row: {
          id: string
          kind: 'DM' | 'GROUP'
          title: string | null
          created_by: string
          pair_key: string | null
          avatar_path: string | null
          pinned_message_id: string | null
          last_message_at: string
          created_at: string
          updated_at: string
        }
        Insert: { kind?: 'DM' | 'GROUP'; title?: string | null; created_by: string; pair_key?: string | null }
        Update: { title?: string | null; last_message_at?: string }
        Relationships: []
      }

      office_chat_members: {
        Row: {
          room_id: string
          user_id: string
          last_read_at: string
          muted: boolean
          role: 'OWNER' | 'MEMBER'
          pinned: boolean
          hidden: boolean
          forced_unread: boolean
          joined_at: string
        }
        Insert: { room_id: string; user_id: string }
        Update: { last_read_at?: string; muted?: boolean }
        Relationships: []
      }

      office_chat_messages: {
        Row: {
          id: string
          room_id: string
          sender_id: string
          text: string
          kind: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'STICKER' | 'SYSTEM'
          file_path: string | null
          file_name: string | null
          file_size: number | null
          mime: string | null
          reply_to: string | null
          edited_at: string | null
          mentions: string[]
          deleted_at: string | null
          created_at: string
        }
        Insert: { room_id: string; sender_id: string; text: string }
        Update: { deleted_at?: string | null }
        Relationships: []
      }

      /* 0044 — อิโมจิความรู้สึกบนข้อความแชทออฟฟิศ */
      office_chat_reactions: {
        Row: {
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        /* ★ เขียนผ่าน RPC เท่านั้น — ไม่มี policy ให้เขียนตรง ๆ
             ★★ ประกาศ Insert/Update ไว้เพื่อให้ชนิดครบรูป ไม่ใช่เพราะมีคนใช้ */
        Insert: { message_id: string; user_id: string; emoji: string }
        Update: never
        Relationships: []
      }

      /* 0045 — กลุ่มคนที่หารค่าข้าวด้วยบ่อย */
      split_groups: {
        Row: {
          id: string
          owner_id: string
          name: string
          member_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: { owner_id: string; name: string; member_ids: string[] }
        Update: { name?: string; member_ids?: string[] }
        Relationships: []
      }

      audit_log: {
        Row: {
          id: number
          actor_id: string | null
          action: string
          target_type: string | null
          target_id: string | null
          detail: unknown
          created_at: string
        }
        Insert: {
          actor_id?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          detail?: unknown
        }
        Update: Record<never, never>
        Relationships: []
      }
    }

    Views: Record<never, never>

    Functions: {
      create_room: {
        Args: { p_owner: string; p_name?: string | null }
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      join_room: {
        Args: { p_code: string; p_user: string }
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      touch_member: {
        Args: { p_room_id: string; p_user: string }
        Returns: undefined
      }
      transfer_ownership: {
        Args: { p_room_id: string; p_actor: string; p_target: string }
        Returns: Database['public']['Tables']['room_members']['Row']
      }
      room_heartbeat: {
        Args: {
          p_room_id: string
          p_actor: string
          p_owner_away_seconds?: number
          p_active_seconds?: number
        }
        /** user_id ของเจ้าของห้อง ณ ตอนจบ (อาจเปลี่ยนคนถ้าเจ้าของเดิมหายไปนาน) */
        Returns: string
      }
      enqueue_track: {
        Args: {
          p_room_id: string
          p_actor: string
          p_video_id: string
          p_title: string
          p_channel: string | null
          p_thumb: string | null
          p_duration: number
          p_dedicated_to?: string | null
          p_dedication?: string | null
        }
        Returns: Database['public']['Tables']['queue_items']['Row']
      }
      set_chat_style: {
        Args: {
          p_room_id: string
          p_actor: string
          p_theme: string | null
          p_wallpaper: string | null
          p_wallpaper_url?: string | null
        }
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      toggle_skip_vote: {
        Args: { p_room_id: string; p_actor: string }
        Returns: { voted: boolean; votes: number; needed: number; skipped: boolean }
      }
      quiz_start: {
        Args: { p_room_id: string; p_actor: string; p_rounds: number }
        Returns: QuizGameRow
      }
      quiz_answer: {
        Args: { p_room_id: string; p_actor: string; p_guess: string }
        Returns: { active: boolean; correct?: boolean; answer?: string }
      }
      quiz_next: {
        Args: { p_room_id: string; p_actor: string }
        Returns: QuizGameRow
      }
      quiz_stop: {
        Args: { p_room_id: string; p_actor: string }
        Returns: void
      }
      advance_queue: {
        Args: {
          p_room_id: string
          p_actor: string | null
          p_expected_id: string | null
          p_reason: 'ENDED' | 'SKIPPED'
        }
        Returns: Database['public']['Tables']['playback_states']['Row']
      }
      set_playback: {
        Args: {
          p_room_id: string
          p_actor: string
          p_action: 'PLAY' | 'PAUSE' | 'SEEK'
          p_position?: number | null
        }
        Returns: Database['public']['Tables']['playback_states']['Row']
      }
      play_queue_item: {
        Args: { p_room_id: string; p_actor: string; p_item_id: string }
        Returns: Database['public']['Tables']['playback_states']['Row']
      }
      remove_queue_item: {
        Args: { p_room_id: string; p_actor: string; p_item_id: string }
        Returns: Database['public']['Tables']['queue_items']['Row']
      }
      reorder_queue_item: {
        Args: {
          p_room_id: string
          p_actor: string
          p_item_id: string
          p_after_id: string | null
        }
        /** ★ คืนคิวใหม่ทั้งชุด (เรียงตาม position) ไม่ใช่แค่แถวที่ย้าย */
        Returns: Database['public']['Tables']['queue_items']['Row'][]
      }
      send_chat_message: {
        Args: {
          p_room_id: string
          p_actor: string
          p_text: string
          p_image_url?: string | null
          p_image_width?: number | null
          p_image_height?: number | null
          p_mentions?: { id: string; name: string }[]
          p_reply_to?: {
            id: string
            displayName: string
            text: string
            hasImage: boolean
          } | null
          p_is_sticker?: boolean
        }
        Returns: Database['public']['Tables']['chat_messages']['Row']
      }
      add_room_sticker: {
        Args: {
          p_room_id: string
          p_actor: string
          p_url: string
          p_width?: number | null
          p_height?: number | null
        }
        Returns: Database['public']['Tables']['room_stickers']['Row']
      }
      remove_room_sticker: {
        Args: { p_actor: string; p_sticker_id: string }
        Returns: string
      }
      delete_chat_message: {
        Args: { p_actor: string; p_message_id: string }
        Returns: Database['public']['Tables']['chat_messages']['Row']
      }
      toggle_chat_reaction: {
        Args: { p_actor: string; p_message_id: string; p_emoji: string; p_on: boolean }
        Returns: boolean
      }
      set_member_skip: {
        Args: {
          p_room_id: string
          p_actor: string
          p_target: string
          p_allow: boolean
        }
        Returns: Database['public']['Tables']['room_members']['Row']
      }
      clear_queue: {
        Args: { p_room_id: string; p_actor: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: {
          p_bucket: string
          p_limit: number
          p_window_seconds: number
          p_cost?: number
        }
        Returns: {
          allowed: boolean
          used: number
          limit_value: number
          reset_at: string
        }[]
      }
      reconcile_stale_playback: {
        Args: { p_grace_seconds?: number }
        Returns: number
      }
      prune_ephemeral: {
        Args: { p_search_cache_hours?: number; p_video_cache_days?: number }
        Returns: number
      }
      server_now: {
        Args: Record<string, never>
        Returns: string
      }
      is_room_member: {
        Args: { p_room_id: string }
        Returns: boolean
      }
      my_room_role: {
        Args: { p_room_id: string }
        Returns: MemberRole | null
      }
      set_appearance: {
        Args: { p_actor: string; p_appearance: Record<string, unknown> }
        Returns: void
      }

      /* ── ระบบกิจกรรมออฟฟิศ (0023) ───────────────────────────────────── */
      /* ── 0041 · ระบบสมัครสมาชิก ─────────────────────────────── */
      /* ── 0043 · สมัครแบบเปิด ไม่ต้องมีรหัสพนักงาน ───────────── */
      register_open: {
        Args: {
          p_actor: string
          p_nickname: string
          p_phone?: string | null
          p_company?: string | null
          p_dept?: string | null
          p_position?: string | null
          p_purpose?: string | null
        }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      can_use_office: {
        Args: { p_user: string }
        Returns: boolean
      }
      register_employee: {
        Args: {
          p_actor: string
          p_code: string
          p_prefix: string
          p_first: string
          p_last: string
          p_phone?: string | null
          p_company?: string | null
          p_dept?: string | null
          p_position?: string | null
          p_purpose?: string | null
        }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      mark_password_set: {
        Args: { p_user: string }
        Returns: undefined
      }
      user_has_password: {
        Args: { p_user: string }
        Returns: boolean
      }
      admin_user_list: {
        Args: { p_actor: string }
        Returns: unknown
      }
      admin_update_profile: {
        Args: {
          p_actor: string
          p_target: string
          p_prefix: string | null
          p_first: string
          p_last: string
          p_phone: string | null
          p_company: string | null
          p_dept: string | null
          p_position: string | null
        }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      claim_employee_code: {
        Args: {
          p_actor: string
          p_code: string
          p_display_name: string
          p_nickname?: string | null
          p_department?: string | null
        }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      set_employee_code_status: {
        Args: { p_actor: string; p_code: string; p_status: EmployeeCodeStatus }
        Returns: Database['public']['Tables']['employee_codes']['Row']
      }
      set_account_status: {
        Args: { p_actor: string; p_target: string; p_status: AccountStatus }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      set_admin_role: {
        Args: { p_actor: string; p_target: string; p_admin: boolean }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      notify: {
        Args: {
          p_user: string
          p_type: string
          p_title_key: string
          p_params?: Record<string, unknown>
          p_link?: string | null
        }
        Returns: string | null
      }
      mark_notifications_read: {
        Args: { p_actor: string; p_ids?: string[] | null }
        Returns: number
      }
      set_notification_pref: {
        Args: { p_actor: string; p_type: string; p_enabled: boolean }
        Returns: void
      }
      report_content: {
        Args: {
          p_actor: string
          p_target_type: ReportTargetType
          p_target_id: string
          p_reason?: string | null
        }
        Returns: { reports: number; threshold: number; hidden: boolean }
      }
      is_admin: {
        Args: { p_user: string }
        Returns: boolean
      }

      /* ── โมดูล A · กินอะไรดี (0025) ─────────────────────────────── */
      similar_restaurants: {
        Args: { p_name: string; p_limit?: number }
        Returns: { id: string; name: string; signature_dish: string; similarity: number }[]
      }
      add_restaurant: {
        Args: {
          p_actor: string
          p_name: string
          p_dish: string
          p_image?: string | null
          p_cuisine?: string | null
          p_price?: PriceRange | null
          p_distance?: DistanceBand | null
          p_map_url?: string | null
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['restaurants']['Row']
      }
      update_restaurant: {
        Args: {
          p_actor: string
          p_id: string
          p_name: string
          p_dish: string
          p_image?: string | null
          p_cuisine?: string | null
          p_price?: PriceRange | null
          p_distance?: DistanceBand | null
          p_map_url?: string | null
          p_note?: string | null
          p_clear_closed?: boolean
        }
        Returns: Database['public']['Tables']['restaurants']['Row']
      }
      delete_restaurant: {
        Args: { p_actor: string; p_id: string }
        Returns: string
      }
      toggle_restaurant_vote: {
        Args: { p_actor: string; p_id: string }
        Returns: Database['public']['Tables']['restaurants']['Row']
      }
      report_restaurant_closed: {
        Args: { p_actor: string; p_id: string }
        Returns: {
          reports: number
          threshold: number
          hidden: boolean
          maybeClosed: boolean
        }
      }
      log_restaurant_visit: {
        Args: { p_actor: string; p_id: string }
        Returns: string
      }
      employee_code_is_valid: {
        Args: { p_user: string }
        Returns: boolean
      }

      /* ── โมดูล B · กระเป๋าเงิน (0026/0027) ──────────────────────── */
      create_expense_bill: {
        Args: {
          p_actor: string
          p_title: string
          p_total: number
          p_category: ExpenseCategory | null
          p_date: string | null
          p_receipt: string | null
          p_split: SplitMode | null
          /** [{userId, amount?}] — amount ใช้เฉพาะโหมด CUSTOM */
          p_shares: { userId: string; amount?: number }[]
          p_include_self?: boolean
        }
        Returns: Database['public']['Tables']['expense_bills']['Row']
      }
      mark_debt_paid: {
        Args: { p_actor: string; p_id: string; p_slip?: string | null }
        Returns: Database['public']['Tables']['debts']['Row']
      }
      confirm_debt: {
        Args: { p_actor: string; p_id: string }
        Returns: Database['public']['Tables']['debts']['Row']
      }
      cancel_debt: {
        Args: { p_actor: string; p_id: string }
        Returns: Database['public']['Tables']['debts']['Row']
      }
      remind_debt: {
        Args: { p_actor: string; p_id: string; p_tone?: ReminderTone }
        Returns: Database['public']['Tables']['debts']['Row']
      }
      send_due_reminders: {
        Args: Record<string, never>
        Returns: number
      }
      my_debt_summary: {
        Args: { p_actor: string }
        Returns: { iOwe: number; owedToMe: number; pendingConfirm: number }
      }

      /* ── โมดูล C · สุ่มและเกม (0028) ────────────────────────────── */
      save_name_set: {
        Args: {
          p_actor: string
          p_id: string | null
          p_name: string
          p_members: { id?: string; label: string; department?: string | null }[]
        }
        Returns: Database['public']['Tables']['name_sets']['Row']
      }
      delete_name_set: {
        Args: { p_actor: string; p_id: string }
        Returns: string
      }
      save_lottery_pick: {
        Args: { p_actor: string; p_number: string }
        Returns: Database['public']['Tables']['lottery_picks']['Row']
      }
      delete_lottery_pick: {
        Args: { p_actor: string; p_id: string }
        Returns: string
      }

      /* ── โมดูล D · ตลาดนัด (0029) ───────────────────────────────── */
      create_listing: {
        Args: {
          p_actor: string
          p_title: string
          p_price: number
          p_kind: ListingKind
          p_category: ListingCategory
          p_condition: ListingCondition | null
          p_description: string | null
          p_building: string | null
          p_floor: string | null
          p_desk: string | null
          p_images: string[]
        }
        Returns: Database['public']['Tables']['listings']['Row']
      }
      toggle_reservation: {
        Args: { p_actor: string; p_id: string }
        Returns: { reserved: boolean; queue: number }
      }
      reservation_count: {
        Args: { p_id: string }
        Returns: number
      }
      set_listing_status: {
        Args: { p_actor: string; p_id: string; p_status: ListingStatus; p_buyer?: string | null }
        Returns: Database['public']['Tables']['listings']['Row']
      }
      delete_listing: {
        Args: { p_actor: string; p_id: string }
        Returns: string
      }
      /* ── เฟส 2 (0030) ──────────────────────────────────────────── */
      net_debts_between: {
        Args: { p_actor: string; p_other: string }
        Returns: {
          closed: number
          net: number
          direction: 'THEY_OWE_ME' | 'I_OWE_THEM' | 'EVEN'
          newDebtId: string | null
        }
      }
      my_expense_summary: {
        Args: { p_actor: string; p_from: string; p_to: string }
        Returns: {
          total: number
          myShare: number
          owedOut: number
          byCategory: Record<string, number>
          byRestaurant: { name: string; amount: number }[]
          byDay: { date: string; amount: number }[]
        }
      }
      recent_restaurant_visits: {
        Args: { p_actor: string }
        Returns: { restaurant_id: string; last_visit: string }[]
      }
      lottery_leaderboard: {
        Args: { p_limit?: number }
        Returns: { number: string; picks: number }[]
      }

      /* ── FR-C08/C09 สายแข่งขัน (0032) ──────────────────────────── */
      create_tournament: {
        Args: {
          p_actor: string
          p_name: string
          p_teams: { name: string; color: string; members: { id?: string; label: string }[] }[]
        }
        Returns: string
      }
      record_match_result: {
        Args: {
          p_actor: string
          p_match: string
          p_winner: string
          p_score_a?: number | null
          p_score_b?: number | null
        }
        Returns: void
      }
      delete_tournament: {
        Args: { p_actor: string; p_id: string }
        Returns: string
      }
      player_stats: {
        Args: Record<string, never>
        Returns: { user_id: string; wins: number; losses: number; matches: number }[]
      }
      player_skill: {
        Args: Record<string, never>
        Returns: { user_id: string; skill: number; matches: number }[]
      }

      send_listing_message: {
        Args: { p_actor: string; p_listing: string; p_buyer: string; p_text: string }
        Returns: string
      }
      read_listing_thread: {
        Args: { p_actor: string; p_thread: string }
        Returns: number
      }
      set_search_alert: {
        Args: { p_actor: string; p_keyword: string; p_on: boolean }
        Returns: void
      }

      create_draw_room: {
        Args: { p_actor: string; p_title: string; p_options: { id: string; label: string }[] }
        Returns: Database['public']['Tables']['draw_rooms']['Row']
      }
      join_draw_room: { Args: { p_actor: string; p_room: string }; Returns: void }
      leave_draw_room: { Args: { p_actor: string; p_room: string }; Returns: void }
      spin_draw_room: {
        Args: { p_actor: string; p_room: string }
        Returns: Database['public']['Tables']['draw_rooms']['Row']
      }
      finish_draw_room: { Args: { p_actor: string; p_room: string }; Returns: void }
      delete_draw_room: { Args: { p_actor: string; p_room: string }; Returns: void }

      /* ── FR-X10/X11 แดชบอร์ด + ห้องเพลง + การ์ดหน้าแรก (0036) ──── */
      office_usage_stats: { Args: { p_actor: string; p_days?: number }; Returns: Json }
      my_music_rooms: { Args: { p_actor: string; p_limit?: number }; Returns: Json }
      office_home_summary: { Args: { p_actor: string }; Returns: Json }

      open_office_dm: { Args: { p_actor: string; p_other: string }; Returns: string }
      update_office_group: {
        Args: { p_actor: string; p_room: string; p_title?: string | null; p_avatar?: string | null }
        Returns: void
      }
      add_office_members: {
        Args: { p_actor: string; p_room: string; p_members: string[] }
        Returns: number
      }
      remove_office_member: {
        Args: { p_actor: string; p_room: string; p_member: string }
        Returns: void
      }
      send_office_chat_v2: {
        Args: {
          p_actor: string
          p_room: string
          p_text: string
          p_kind?: string
          p_file_path?: string | null
          p_file_name?: string | null
          p_file_size?: number | null
          p_mime?: string | null
          p_reply_to?: string | null
          p_mentions?: string[]
        }
        Returns: string
      }
      edit_office_chat: { Args: { p_actor: string; p_msg: string; p_text: string }; Returns: void }
      delete_office_chat: { Args: { p_actor: string; p_msg: string }; Returns: void }
      /* 0044 — กดซ้ำคือถอน ส่ง p_on มาบอกว่าตั้งใจจะกดหรือถอน */
      toggle_office_reaction: {
        Args: { p_actor: string; p_msg: string; p_emoji: string; p_on: boolean }
        Returns: boolean
      }
      pin_office_message: { Args: { p_actor: string; p_room: string; p_msg: string }; Returns: void }
      set_office_chat_pref: {
        Args: { p_actor: string; p_room: string; p_field: string; p_value: boolean }
        Returns: void
      }
      search_office_chat: {
        Args: { p_actor: string; p_query: string; p_room?: string | null }
        Returns: Json
      }
      create_office_group: {
        Args: { p_actor: string; p_title: string; p_members: string[] }
        Returns: string
      }
      send_office_chat: { Args: { p_actor: string; p_room: string; p_text: string }; Returns: string }
      read_office_chat: { Args: { p_actor: string; p_room: string }; Returns: void }
      mute_office_chat: { Args: { p_actor: string; p_room: string; p_muted: boolean }; Returns: void }
      leave_office_group: { Args: { p_actor: string; p_room: string }; Returns: void }
      my_office_chats: { Args: { p_actor: string }; Returns: Json }

      report_listing: {
        Args: { p_actor: string; p_id: string; p_reason?: string | null }
        Returns: { reports: number; threshold: number; hidden: boolean }
      }
    }

    Enums: {
      member_role: MemberRole
      queue_status: QueueStatus
    }

    CompositeTypes: Record<never, never>
  }
}

/* ── ทางลัดที่ใช้บ่อยทั่วโปรเจกต์ ─────────────────────────────────────── */

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type ProfileRow = Tables<'profiles'>
export type RoomRow = Tables<'rooms'>
export type EmployeeCodeRow = Tables<'employee_codes'>
export type RestaurantRow = Tables<'restaurants'>
export type DebtRow = Tables<'debts'>
export type NameSetRow = Tables<'name_sets'>
export type ListingRow = Tables<'listings'>
export type LotteryPickRow = Tables<'lottery_picks'>
export type ExpenseBillRow = Tables<'expense_bills'>
export type NotificationRow = Tables<'notifications'>
export type AppSettingRow = Tables<'app_settings'>
export type ChatMessageRow = Tables<'chat_messages'>
export type RoomStickerRow = Tables<'room_stickers'>
export type RoomMemberRow = Tables<'room_members'>
/**
 * แถวของเกมทายเพลง
 *
 * ★ เขียนมือแทนที่จะประกาศใน Tables เพราะไม่มีที่ไหนอ่านผ่าน .from('quiz_games')
 *   แบบพิมพ์ชื่อคอลัมน์ทีละตัว — มันถูกอ่านทั้งก้อนแล้วแปลงเป็น DTO ที่เดียว
 *   ★★ quiz_rounds ไม่มีชนิดที่นี่โดยตั้งใจ ฝั่ง client ห้ามแตะตารางนั้นเลย
 *      เพราะมันเก็บเฉลย
 */
export type QuizGameRow = {
  id: string
  room_id: string
  host_id: string
  total_rounds: number
  round_idx: number
  status: 'PLAYING' | 'ENDED'
  hint_mask: string | null
  hint_initials: string | null
  hint_channel: string | null
  hint_duration: number | null
  hint_adder: string | null
  round_started_at: string | null
  round_ends_at: string | null
  last_answer: string | null
  last_cover: string | null
  last_winner: string | null
  created_at: string
  ended_at: string | null
}

export type QueueItemRow = Tables<'queue_items'>
export type PlaybackStateRow = Tables<'playback_states'>
