import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/wallet/recent — ทุกอย่างที่หน้าสร้างบิลต้องเดาให้ผู้ใช้
 *
 * ★★★ หลักของหน้านี้คือ "กรอกน้อยที่สุด" ซึ่งแปลว่าระบบต้องเดาเก่ง
 *
 *     ★ สิ่งที่เดาได้มีสี่อย่าง: คนที่หารด้วย · ร้าน · วิธีหาร · ฉันร่วมจ่ายไหม
 *       ★★ ทั้งสี่อย่างนี้ "ครั้งก่อนเป็นยังไง" คือคำตอบที่ถูกเกิน 80%
 *          เพราะคนกินข้าวกับกลุ่มเดิมที่ร้านเดิมเป็นปกติ
 *     ★ คืนมาในคำขอเดียว ไม่ใช่สี่คำขอ — หน้านี้เปิดตอนยืนจ่ายเงินที่ร้าน
 *       ★★ สี่รอบไปกลับบนเน็ตมือถือคือสองวินาทีที่คนยืนรอหน้าแคชเชียร์
 *
 * ★★ ไม่คืนข้อมูลของคนอื่นเลย — ทุกอย่างมาจากบิลที่ "ฉัน" เป็นคนสร้าง
 *    ★ รายชื่อคนที่ใครหารด้วยบ่อย เป็นข้อมูลที่บอกว่าใครสนิทกับใคร
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  /*
   * ★ ดูย้อนหลัง 60 บิลล่าสุดพอ — ไม่ต้องทั้งประวัติ
   *   ★★ พฤติกรรม "กินกับใครบ่อย" ของเมื่อหกเดือนก่อนไม่ได้บอกอะไรเกี่ยวกับ
   *      วันนี้ และการนับทั้งประวัติจะทำให้คนที่ย้ายทีมไปแล้วยังขึ้นก่อน
   */
  const { data: bills } = await admin
    .from('expense_bills')
    .select('id, restaurant_id, split_mode, bill_date, created_at')
    .eq('payer_id', actor.id)
    .order('created_at', { ascending: false })
    .limit(60)

  const myBills = bills ?? []
  const billIds = myBills.map((b) => b.id)

  const { data: debts } = billIds.length
    ? await admin
        .from('debts')
        .select('bill_id, debtor_id')
        .in('bill_id', billIds)
        .neq('status', 'CANCELLED')
    : { data: [] as { bill_id: string | null; debtor_id: string }[] }

  /* ── คนในแต่ละบิล ─────────────────────────────────────────── */
  const peopleOf = new Map<string, string[]>()
  for (const d of debts ?? []) {
    if (!d.bill_id) continue
    const list = peopleOf.get(d.bill_id) ?? []
    list.push(d.debtor_id)
    peopleOf.set(d.bill_id, list)
  }

  /* ── นับความถี่ของแต่ละคน ─────────────────────────────────── */
  const freq = new Map<string, number>()
  for (const ids of peopleOf.values()) {
    for (const id of ids) freq.set(id, (freq.get(id) ?? 0) + 1)
  }

  /*
   * ── ชุดคนที่ซ้ำกันบ่อย ────────────────────────────────────────
   * ★★ ข้อกำหนด: ใช้ชุดเดิมซ้ำ 3 ครั้งแล้วให้เสนอบันทึกเป็นกลุ่ม
   *    ★ คีย์คือรายชื่อที่เรียงแล้ว — "นัท,ต้น" กับ "ต้น,นัท" ต้องเป็นชุดเดียวกัน
   */
  const setCount = new Map<string, number>()
  for (const ids of peopleOf.values()) {
    if (ids.length < 2) continue
    setCount.set([...ids].sort().join(','), (setCount.get([...ids].sort().join(',')) ?? 0) + 1)
  }

  /* ── บิลล่าสุด = ค่าเริ่มต้นของ "หารแบบครั้งก่อน" ──────────── */
  const last = myBills[0] ?? null
  const lastPeople = last ? (peopleOf.get(last.id) ?? []) : []

  /* ── ร้านที่ใช้ล่าสุด (ไม่ซ้ำ) ─────────────────────────────── */
  const recentShopIds: string[] = []
  for (const b of myBills) {
    if (b.restaurant_id && !recentShopIds.includes(b.restaurant_id)) {
      recentShopIds.push(b.restaurant_id)
    }
    if (recentShopIds.length >= 5) break
  }

  /*
   * ★★ ผู้ใช้ใหม่ยังไม่เคยสร้างบิล — ไม่มีร้านล่าสุดเลย
   *    ★ ถอยไปใช้ "ร้านที่ออฟฟิศโหวตเยอะสุด" แทนช่องว่าง
   *      ★★ ชิปว่างเปล่าสอนผู้ใช้ว่าฟีเจอร์นี้ไม่มีอะไร แล้วเขาจะไม่กลับมาดูอีก
   */
  const { data: topShops } =
    recentShopIds.length < 5
      ? await admin
          .from('restaurants')
          .select('id, name, cuisine, vote_count')
          .order('vote_count', { ascending: false })
          .limit(8)
      : { data: [] as { id: string; name: string; cuisine: string | null; vote_count: number }[] }

  /*
   * ★★★ ดึงคอลัมน์เสริมแบบล้มแล้วถอยได้
   *
   *     ★ vote_count มาจาก 0048 · rating_* จาก 0049 · travel_* จาก 0050
   *       ★★ หน้าสร้างบิลเป็นหน้าที่คนใช้ทุกวัน — มันต้องไม่พังเพราะ
   *          migration ตัวใดตัวหนึ่งยังไม่ได้รัน
   *     ★ บทเรียนเดิมของโปรเจกต์: โค้ดที่อ่านของใหม่ก่อน migration ขึ้น
   *       ทำให้ทั้งหน้าพัง ไม่ใช่แค่ฟีเจอร์นั้นหาย
   */
  type ShopRow = {
    id: string
    name: string
    cuisine: string | null
    vote_count?: number | null
    rating_sum?: number | null
    rating_count?: number | null
    travel_minutes?: number | null
  }

  let shopRows: ShopRow[] = []
  if (needIdsReady(recentShopIds, topShops)) {
    const needIds = [...new Set([...recentShopIds, ...(topShops ?? []).map((s) => s.id)])]
    const full = await admin
      .from('restaurants')
      .select('id, name, cuisine, vote_count, rating_sum, rating_count, travel_minutes')
      .in('id', needIds)
    if (full.error) {
      const base = await admin.from('restaurants').select('id, name, cuisine').in('id', needIds)
      shopRows = (base.data ?? []) as ShopRow[]
    } else {
      shopRows = (full.data ?? []) as ShopRow[]
    }
  }
  const shopOf = new Map(shopRows.map((s) => [s.id, s]))

  const shops = [
    ...recentShopIds,
    ...(topShops ?? []).map((s) => s.id).filter((id) => !recentShopIds.includes(id)),
  ]
    .slice(0, 6)
    .map((id) => {
      const row = shopOf.get(id)
      const count = row?.rating_count ?? 0
      return {
        id,
        name: row?.name ?? '',
        cuisine: row?.cuisine ?? null,
        /* ★ ส่งคะแนนเฉลี่ยที่คิดแล้ว ไม่ใช่ sum กับ count ให้หน้าเว็บหารเอง
             ★★ สองที่ที่หารเองคือสองที่ที่ปัดเศษไม่ตรงกันได้ */
        rating: count > 0 ? Math.round(((row?.rating_sum ?? 0) / count) * 10) / 10 : null,
        ratingCount: count,
        voteCount: row?.vote_count ?? 0,
        walkMin: row?.travel_minutes ?? null,
        /* ★ บอกว่าร้านนี้มาจาก "เคยสั่ง" หรือ "ออฟฟิศนิยม" — คนละน้ำหนัก */
        recent: recentShopIds.includes(id),
      }
    })
    .filter((s) => s.name)

  /* ── รายชื่อคน (เฉพาะที่ต้องใช้) ───────────────────────────── */
  const topIds = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id)

  const wantIds = [...new Set([...topIds, ...lastPeople])]
  const { data: people } = wantIds.length
    ? await admin
        .from('profiles')
        .select('id, display_name, nickname, avatar_url, department')
        .in('id', wantIds)
    : { data: [] as { id: string; display_name: string; nickname: string | null; avatar_url: string | null; department: string | null }[] }

  const personOf = new Map(
    (people ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        name: p.nickname || p.display_name,
        avatarUrl: p.avatar_url,
        department: p.department,
      },
    ]),
  )

  /*
   * ── กลุ่มที่บันทึกไว้ ─────────────────────────────────────────
   * ★★ ห่อ try/catch เพราะตารางนี้มาจาก migration 0045
   *    ★ บทเรียนเดิมของโปรเจกต์: โค้ดที่อ่านของใหม่ก่อน migration ขึ้น
   *      ทำให้ทั้งหน้าพัง ★★ ที่นี่ล้มแล้วแค่ไม่มีชิปกลุ่ม ส่วนการสร้างบิล
   *      ยังทำได้ครบทุกอย่าง
   */
  let groups: { id: string; name: string; memberIds: string[] }[] = []
  try {
    const { data: g } = await admin
      .from('split_groups')
      .select('id, name, member_ids')
      .eq('owner_id', actor.id)
      .order('created_at', { ascending: false })
      .limit(10)
    groups = (g ?? []).map((x) => ({ id: x.id, name: x.name, memberIds: x.member_ids }))
  } catch {
    /* ★ ยังไม่ได้รัน 0045 — ไม่มีกลุ่มให้แสดง แต่หน้ายังใช้งานได้ */
  }

  /*
   * ★ ชุดที่ซ้ำ ≥3 ครั้งและยังไม่ถูกบันทึกเป็นกลุ่ม → เสนอให้บันทึก
   *   ★★ เสนอเฉพาะชุดที่ "ยังไม่มีกลุ่มไหนตรงเป๊ะ" ไม่งั้นจะถามซ้ำทุกครั้ง
   */
  const savedKeys = new Set(groups.map((g) => [...g.memberIds].sort().join(',')))
  const suggestKey =
    [...setCount.entries()]
      .filter(([k, n]) => n >= 3 && !savedKeys.has(k))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return ok({
    lastBill: last
      ? {
          shopId: last.restaurant_id,
          shopName: last.restaurant_id ? (shopOf.get(last.restaurant_id)?.name ?? null) : null,
          splitMode: last.split_mode,
          people: lastPeople.map((id) => personOf.get(id)).filter(Boolean),
        }
      : null,
    frequentPeople: topIds.map((id) => personOf.get(id)).filter(Boolean),
    shops,
    groups,
    /* ★ ส่งเป็นรายชื่อ id ไม่ใช่สตริงคีย์ — หน้าเว็บจะได้ไม่ต้อง split เอง */
    suggestGroup: suggestKey ? suggestKey.split(',') : null,
  })
})

/** มีอะไรให้ดึงไหม — แยกออกมาเพื่อไม่ให้เงื่อนไขยาวปนอยู่กลางฟังก์ชัน */
function needIdsReady(recent: string[], top: { id: string }[] | null): boolean {
  return recent.length > 0 || (top ?? []).length > 0
}
