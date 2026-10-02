import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * แชทผู้ซื้อ-ผู้ขาย (FR-D08)
 *
 * GET               — รายการห้องของฉัน (ทั้งฝั่งซื้อและฝั่งขาย)
 * GET ?thread=<id>  — ข้อความในห้องนั้น + ทำเครื่องหมายว่าอ่านแล้ว
 * POST              — ส่งข้อความ
 *
 * ★ รวมสองฝั่งไว้ endpoint เดียวเพราะหน้าเว็บต้องเรียงห้องตามเวลาข้อความ
 *   ล่าสุดของทั้งสองฝั่งปนกัน — ถ้าแยก endpoint หน้าเว็บต้อง merge แล้ว sort เอง
 */

export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const threadId = request.nextUrl.searchParams.get('thread')

  /* ── ข้อความในห้องเดียว ────────────────────────────────────── */
  if (threadId) {
    if (!z.uuid().safeParse(threadId).success) return ok({ messages: [] })

    const { data: thread } = await admin
      .from('listing_threads')
      .select('id, listing_id, buyer_id')
      .eq('id', threadId)
      .maybeSingle()

    if (!thread) return ok({ messages: [] })

    const { data: listing } = await admin
      .from('listings')
      .select('seller_id, title, price, kind, status')
      .eq('id', thread.listing_id)
      .maybeSingle()

    /*
     * ★ ด่านเดียวกับที่ RLS บังคับไว้ ต้องเช็กที่นี่ด้วย
     *   เพราะ route นี้ใช้ service role ซึ่งข้าม RLS ไปทั้งหมด
     */
    if (thread.buyer_id !== actor.id && listing?.seller_id !== actor.id) {
      return ok({ messages: [] })
    }

    const { data, error } = await admin
      .from('listing_messages')
      .select('id, sender_id, text, created_at')
      .eq('thread_id', threadId)
      .order('created_at')
      .limit(200)

    if (error) throw fromPostgresError(error)

    /* ★ กดอ่านให้เลยตอนเปิดห้อง — หน้าเว็บไม่ต้องยิงอีกรอบ */
    await admin.rpc('read_listing_thread', { p_actor: actor.id, p_thread: threadId })

    /*
     * ★ หัวห้องต้องบอกว่าคุยกับใคร เรื่องอะไร ราคาเท่าไหร่
     *   ★★ เดิมบอกแค่ชื่อประกาศ ★ คนที่เปิดห้องมาจากกล่องข้อความ
     *      ต้องจำเองว่านี่คือใคร ซึ่งจำไม่ได้เมื่อมีหลายห้อง
     */
    const otherId = listing?.seller_id === actor.id ? thread.buyer_id : listing?.seller_id
    const [{ data: other }, { data: cover }] = await Promise.all([
      otherId
        ? admin.from('profiles').select('display_name, nickname, avatar_url').eq('id', otherId).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from('listing_images')
        .select('url')
        .eq('listing_id', thread.listing_id)
        .order('sort')
        .limit(1)
        .maybeSingle(),
    ])

    return ok({
      title: listing?.title ?? '',
      price: listing?.price ?? 0,
      kind: listing?.kind ?? 'SELL',
      status: listing?.status ?? 'AVAILABLE',
      cover: cover?.url ?? null,
      withName: other?.nickname || other?.display_name || '—',
      withAvatar: other?.avatar_url ?? null,
      iAmSeller: listing?.seller_id === actor.id,
      buyerId: thread.buyer_id,
      listingId: thread.listing_id,
      messages: (data ?? []).map((m) => ({
        id: m.id,
        text: m.text,
        mine: m.sender_id === actor.id,
        createdAt: m.created_at,
      })),
    })
  }

  /*
   * ── เปิดห้องจากหน้าประกาศ ───────────────────────────────────
   *
   * ★ ห้องยังไม่มีจริงจนกว่าจะส่งข้อความแรก (RPC เป็นคนสร้าง)
   *   ดังนั้นตอนกดปุ่ม "แชทกับผู้ขาย" เราคืนแค่ชื่อประกาศ + ห้องเดิมถ้ามี
   *   ★ ทางเลือกคือสร้างห้องว่างทันทีที่กดปุ่ม แต่จะได้ห้องเปล่าเกลื่อน
   *     กล่องข้อความของผู้ขายจากคนที่กดดูแล้วเปลี่ยนใจ
   */
  const listingId = request.nextUrl.searchParams.get('listing')
  if (listingId) {
    if (!z.uuid().safeParse(listingId).success) return ok({ draft: null })

    const { data: listing } = await admin
      .from('listings')
      .select('id, title, seller_id, price, kind, status')
      .eq('id', listingId)
      .maybeSingle()

    if (!listing || listing.seller_id === actor.id) return ok({ draft: null })

    /*
     * ★★★ ห้องที่ยังไม่มีข้อความก็ต้องมีหัวห้องที่สมบูรณ์
     *
     *     ★ เดิมคืนแค่ listingId/title/buyerId ★★ หัวห้องจึงขึ้นชื่อผู้ขายเป็น
     *       "—" และราคาเป็น "฿0" ทั้งที่ของชิ้นนั้นมีคนขายและมีราคาอยู่
     *     ★ จังหวะนี้คือจังหวะแรกที่คนซื้อเห็นห้อง — ข้อมูลที่ว่างเปล่า
     *       ตรงนี้อ่านว่า "ระบบไม่รู้จักของที่ฉันกำลังจะถาม"
     */
    const [{ data: seller }, { data: cover }, { data: existing }] = await Promise.all([
      admin
        .from('profiles')
        .select('display_name, nickname, avatar_url')
        .eq('id', listing.seller_id)
        .maybeSingle(),
      admin
        .from('listing_images')
        .select('url')
        .eq('listing_id', listingId)
        .order('sort')
        .limit(1)
        .maybeSingle(),
      admin
        .from('listing_threads')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', actor.id)
        .maybeSingle(),
    ])

    return ok({
      draft: {
        listingId,
        title: listing.title,
        price: listing.price,
        kind: listing.kind,
        status: listing.status,
        cover: cover?.url ?? null,
        withName: seller?.nickname || seller?.display_name || '—',
        withAvatar: seller?.avatar_url ?? null,
        iAmSeller: false,
        buyerId: actor.id,
        threadId: existing?.id ?? null,
      },
    })
  }

  /* ── รายการห้องทั้งหมด ─────────────────────────────────────── */
  const { data: mySells } = await admin
    .from('listings')
    .select('id')
    .eq('seller_id', actor.id)

  const sellIds = (mySells ?? []).map((l) => l.id)

  const { data: threads, error } = await admin
    .from('listing_threads')
    .select('id, listing_id, buyer_id, last_message_at')
    .or(
      sellIds.length > 0
        ? `buyer_id.eq.${actor.id},listing_id.in.(${sellIds.join(',')})`
        : `buyer_id.eq.${actor.id}`,
    )
    .order('last_message_at', { ascending: false })
    .limit(50)

  if (error) throw fromPostgresError(error)

  const rows = threads ?? []
  if (rows.length === 0) return ok({ threads: [] })

  const listingIds = [...new Set(rows.map((t) => t.listing_id))]

  const { data: listings } = await admin
    .from('listings')
    .select('id, title, seller_id, price, kind, status')
    .in('id', listingIds)

  /* ★ รูปแรกของแต่ละประกาศ — กล่องข้อความต้องบอกได้ว่า "เรื่องของชิ้นไหน"
       ★★ ชื่อประกาศอย่างเดียวอ่านยากเมื่อมีห้องหลายห้องจากคนขายคนเดียวกัน */
  const { data: covers } = await admin
    .from('listing_images')
    .select('listing_id, url, sort')
    .in('listing_id', listingIds)
    .order('sort')

  const coverOf = new Map<string, string>()
  for (const c of covers ?? []) if (!coverOf.has(c.listing_id)) coverOf.set(c.listing_id, c.url)

  const listingOf = new Map((listings ?? []).map((l) => [l.id, l]))

  /* ★ ต้องรู้ชื่อทั้งผู้ซื้อและผู้ขาย เพราะแต่ละห้องฉันอยู่ฝั่งไหนก็ได้ */
  const peopleIds = [
    ...new Set([
      ...rows.map((t) => t.buyer_id),
      ...(listings ?? []).map((l) => l.seller_id),
    ]),
  ]

  const [{ data: people }, { data: unread }] = await Promise.all([
    admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', peopleIds),
    admin
      .from('listing_messages')
      .select('thread_id')
      .in(
        'thread_id',
        rows.map((t) => t.id),
      )
      .is('read_at', null)
      .neq('sender_id', actor.id),
  ])

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.nickname || p.display_name]))
  const avatarOf = new Map((people ?? []).map((p) => [p.id, p.avatar_url]))

  /*
   * ★★ ข้อความล่าสุดของแต่ละห้อง — ดึงรวดเดียวแล้วเก็บอันแรกของแต่ละห้อง
   *    ★ กล่องข้อความที่มีแต่ชื่อ บอกไม่ได้ว่าคุยค้างไว้ตรงไหน
   *      ★★ คนต้องเปิดทีละห้องเพื่อจะรู้ว่าห้องไหนรอเราตอบอยู่
   */
  const { data: lastMsgs } = await admin
    .from('listing_messages')
    .select('thread_id, text, sender_id, created_at')
    .in('thread_id', rows.map((t) => t.id))
    .order('created_at', { ascending: false })

  const lastOf = new Map<string, { text: string; mine: boolean }>()
  for (const m of lastMsgs ?? []) {
    if (!lastOf.has(m.thread_id)) lastOf.set(m.thread_id, { text: m.text, mine: m.sender_id === actor.id })
  }

  const unreadCount = new Map<string, number>()
  for (const m of unread ?? []) {
    unreadCount.set(m.thread_id, (unreadCount.get(m.thread_id) ?? 0) + 1)
  }

  return ok({
    threads: rows.map((t) => {
      const listing = listingOf.get(t.listing_id)
      const iAmSeller = listing?.seller_id === actor.id
      /* ★ แสดงชื่อ "อีกฝ่าย" เสมอ ไม่ใช่ชื่อผู้ซื้อตายตัว */
      const otherId = iAmSeller ? t.buyer_id : listing?.seller_id
      return {
        id: t.id,
        listingId: t.listing_id,
        title: listing?.title ?? '',
        withName: (otherId ? nameOf.get(otherId) : null) ?? '—',
        withAvatar: (otherId ? avatarOf.get(otherId) : null) ?? null,
        cover: coverOf.get(t.listing_id) ?? null,
        price: listing?.price ?? 0,
        kind: listing?.kind ?? 'SELL',
        status: listing?.status ?? 'AVAILABLE',
        lastText: lastOf.get(t.id)?.text ?? null,
        lastMine: lastOf.get(t.id)?.mine ?? false,
        iAmSeller,
        unread: unreadCount.get(t.id) ?? 0,
        lastAt: t.last_message_at,
      }
    }),
  })
})

const sendSchema = z.object({
  listingId: z.uuid(),
  buyerId: z.uuid(),
  text: z.string().trim().min(1, 'common.required').max(500),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, sendSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('marketAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('send_listing_message', {
    p_actor: actor.id,
    p_listing: body.listingId,
    p_buyer: body.buyerId,
    p_text: body.text,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data })
})
