import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/chat/[id]'>

/**
 * ข้อความในห้อง
 *
 * ★ ตรวจสมาชิกที่นี่ด้วย ไม่พึ่ง RLS อย่างเดียว
 *   เพราะ route นี้ใช้ service role ซึ่งข้าม RLS ไปทั้งหมด
 */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  const { data: member } = await admin
    .from('office_chat_members')
    .select('room_id')
    .eq('room_id', id)
    .eq('user_id', actor.id)
    .maybeSingle()

  if (!member) return ok({ messages: [], members: [] })

  const [{ data: room }, { data: messages, error }, { data: memberRows }] = await Promise.all([
    admin
      .from('office_chat_rooms')
      .select('id, kind, title, avatar_path, pinned_message_id, created_by')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('office_chat_messages')
      .select(
        'id, sender_id, text, kind, file_path, file_name, file_size, mime, reply_to, edited_at, mentions, created_at, deleted_at',
      )
      .eq('room_id', id)
      .order('created_at')
      .limit(300),
    admin.from('office_chat_members').select('user_id, last_read_at, role').eq('room_id', id),
  ])

  if (error) throw fromPostgresError(error)

  const ids = (memberRows ?? []).map((m) => m.user_id)
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', ids)
    : { data: [] as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }[] }

  const byId = new Map((people ?? []).map((p) => [p.id, p]))

  /*
   * ★★ "อ่านแล้ว" คำนวณจากเวลาอ่านล่าสุดของอีกฝ่าย
   *    ★ ในห้องกลุ่มนับว่าอ่านแล้วเมื่อทุกคนอ่านผ่านข้อความนั้นไปแล้ว
   *      ไม่ใช่แค่คนใดคนหนึ่ง — ไม่งั้นป้าย "อ่านแล้ว" จะโกหก
   */
  const othersRead = (memberRows ?? [])
    .filter((m) => m.user_id !== actor.id)
    .map((m) => Date.parse(m.last_read_at))
  const readUpTo = othersRead.length > 0 ? Math.min(...othersRead) : 0

  /*
   * ★★ นับ "อ่านแล้วกี่คน" ที่เซิร์ฟเวอร์ ไม่ใช่ส่งเวลาอ่านของทุกคนไปให้หน้าเว็บนับ
   *
   *    ★ เวลาอ่านล่าสุดของแต่ละคนเป็นข้อมูลที่บอกได้ว่าใครเปิดแชทตอนกี่โมง
   *      ซึ่งละเอียดเกินกว่าที่หน้าจอต้องใช้ — หน้าจอต้องการแค่ตัวเลข
   *    ★★ ส่งเท่าที่ต้องใช้ ไม่ส่งเผื่อ
   */
  const readTimes = othersRead.slice().sort((a, b) => a - b)
  const readersOf = (createdAt: string): number => {
    const t = Date.parse(createdAt)
    /* ★ readTimes เรียงแล้ว หาตำแหน่งแรกที่ >= t แล้วที่เหลือคือคนที่อ่านผ่านไปแล้ว */
    let lo = 0
    let hi = readTimes.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (readTimes[mid]! < t) lo = mid + 1
      else hi = mid
    }
    return readTimes.length - lo
  }

  /* ★ เปิดห้องแล้วถือว่าอ่านทันที หน้าเว็บไม่ต้องยิงซ้ำ */
  await admin.rpc('read_office_chat', { p_actor: actor.id, p_room: id })

  /*
   * ★★ ไฟล์ในแชทอยู่ใน bucket ส่วนตัว ต้องออก signed URL ให้ทีละไฟล์
   *    ★ อายุ 10 นาที พอสำหรับการดู/ดาวน์โหลดหนึ่งรอบ และสั้นพอที่ลิงก์
   *      ที่หลุดออกไปจะหมดอายุก่อนถูกส่งต่อ
   */
  const withFiles = (messages ?? []).filter((m) => m.file_path && !m.deleted_at)
  const signed = new Map<string, string>()

  if (withFiles.length > 0) {
    const { data: urls } = await admin.storage
      .from('chat-files')
      .createSignedUrls(withFiles.map((m) => m.file_path!), 600)

    for (const [i, u] of (urls ?? []).entries()) {
      const path = withFiles[i]?.file_path
      if (path && u.signedUrl) signed.set(path, u.signedUrl)
    }
  }

  let groupAvatar: string | null = null
  if (room?.avatar_path) {
    const { data: u } = await admin.storage
      .from('chat-files')
      .createSignedUrl(room.avatar_path, 600)
    groupAvatar = u?.signedUrl ?? null
  }

  const byMessageId = new Map((messages ?? []).map((m) => [m.id, m]))
  const roleOf = new Map((memberRows ?? []).map((m) => [m.user_id, m.role]))

  /*
   * ★★★ อิโมจิความรู้สึก — ดึงทั้งห้องในคำขอเดียว ไม่ใช่คำขอต่อข้อความ
   *
   *     ★ 300 ข้อความ × 1 คำขอ = 300 รอบไปฐานข้อมูลเพื่อเปิดห้องแชทหนึ่งห้อง
   *       ★★ ซึ่งจะทำให้การเปิดแชทช้ากว่าการโหลดทั้งหน้าเสียอีก
   *
   * ★★ ห่อ try/catch เพราะตารางนี้มาจาก migration 0044
   *    ★ บทเรียนเดิมของโปรเจกต์: โค้ดที่อ่านของใหม่ก่อน migration ขึ้น
   *      ทำให้ "เปิดแชทไม่ได้เลย" ซึ่งหนักกว่า "ไม่มีอิโมจิ" หลายเท่า
   *      ★★ ล้มแล้วแค่ไม่มีอิโมจิ ส่วนแชทยังคุยกันได้ปกติ
   */
  const reactionsOf = new Map<string, { emoji: string; count: number; mine: boolean }[]>()

  /*
   * ★★★ ข้ามข้อความที่ถูกลบแล้ว — ไม่ใช่แค่ไม่ให้กดเพิ่ม แต่ไม่ส่งของเก่ามาด้วย
   *
   *     ★ การลบที่นี่เป็น soft delete (ตั้ง deleted_at) ★★ แถวอิโมจิจึงไม่ถูก
   *       cascade ทิ้งไปด้วย และยังอยู่ในตารางครบ
   *     ★ ผลที่เห็นจริงบนจอ: ฟองเขียนว่า "ข้อความถูกลบแล้ว" แต่มี 👍 ห้อยอยู่ใต้ฟอง
   *       ★★ ซึ่งอ่านได้ว่า "มีคนชอบข้อความที่ไม่มีอยู่" — คนจะพยายามกดดูว่า
   *          ข้อความเดิมคืออะไร ทั้งที่มันหายไปแล้ว
   *     ★ จับได้จากการลบจริงในเบราว์เซอร์ ไม่ใช่จากการอ่านโค้ด
   */
  const alive = (messages ?? []).filter((m) => !m.deleted_at)
  if (alive.length > 0) {
    try {
      const { data: rows } = await admin
        .from('office_chat_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', alive.map((m) => m.id))

      /* ★ ยุบเป็น "อีโมจิ + จำนวน + เรากดไหม" ที่เซิร์ฟเวอร์
         ★★ ส่ง user_id ของทุกคนที่กดไปให้หน้าเว็บนับเอง จะเป็นการบอกว่า
            ใครกดอะไรบนข้อความไหน ซึ่งละเอียดเกินกว่าที่หน้าจอต้องใช้ */
      for (const r of rows ?? []) {
        const list = reactionsOf.get(r.message_id) ?? []
        const hit = list.find((x) => x.emoji === r.emoji)
        if (hit) {
          hit.count += 1
          if (r.user_id === actor.id) hit.mine = true
        } else {
          list.push({ emoji: r.emoji, count: 1, mine: r.user_id === actor.id })
        }
        reactionsOf.set(r.message_id, list)
      }
    } catch {
      /* ★ ปล่อยว่าง — ฟองข้อความแค่ไม่มีแถวอิโมจิใต้ตัว */
    }
  }

  return ok({
    room: room
      ? {
          id: room.id,
          kind: room.kind,
          title: room.title,
          avatarUrl: groupAvatar,
          pinnedMessageId: room.pinned_message_id,
          iAmOwner: roleOf.get(actor.id) === 'OWNER',
        }
      : null,
    members: ids.map((uid) => ({
      id: uid,
      name: byId.get(uid)?.nickname || byId.get(uid)?.display_name || '—',
      avatarUrl: byId.get(uid)?.avatar_url ?? null,
      isOwner: roleOf.get(uid) === 'OWNER',
      isMe: uid === actor.id,
    })),
    messages: (messages ?? []).map((m) => {
      const parent = m.reply_to ? byMessageId.get(m.reply_to) : null
      return {
        id: m.id,
        text: m.deleted_at ? '' : m.text,
        kind: m.kind,
        fileUrl: m.file_path ? (signed.get(m.file_path) ?? null) : null,
        fileName: m.file_name,
        fileSize: m.file_size,
        mime: m.mime,
        edited: Boolean(m.edited_at),
        mentions: m.mentions ?? [],
        /* ★ ส่งข้อความต้นทางมาด้วยเลย หน้าเว็บจะได้ไม่ต้องไปหาเองในลิสต์
           ★★ ข้อความที่ตอบกลับไปอาจเก่าเกิน 300 ข้อความที่โหลดมา */
        replyTo: parent
          ? {
              id: parent.id,
              text: parent.deleted_at ? '' : parent.text,
              kind: parent.kind,
              senderName:
                byId.get(parent.sender_id)?.nickname ||
                byId.get(parent.sender_id)?.display_name ||
                '—',
              /* ★ รูปของคนที่ถูกตอบกลับ — กล่องคำพูดที่ยกมาแสดงรูปด้วย
                   ★★ ในห้องกลุ่มที่คุยกันหลายคน ชื่ออย่างเดียวต้องอ่านก่อนถึงรู้
                      ว่าตอบใคร ส่วนรูปรู้ได้ด้วยการเหลือบตาครั้งเดียว */
              senderAvatar: byId.get(parent.sender_id)?.avatar_url ?? null,
            }
          : null,
        deleted: Boolean(m.deleted_at),
        mine: m.sender_id === actor.id,
        senderId: m.sender_id,
        senderName: byId.get(m.sender_id)?.nickname || byId.get(m.sender_id)?.display_name || '—',
        senderAvatar: byId.get(m.sender_id)?.avatar_url ?? null,
        createdAt: m.created_at,
        reactions: reactionsOf.get(m.id) ?? [],
        read: m.sender_id === actor.id && Date.parse(m.created_at) <= readUpTo,
        /* ★ จำนวนคนอื่นที่อ่านข้อความนี้แล้ว — ใช้กับห้องกลุ่มเป็นหลัก */
        readers: m.sender_id === actor.id ? readersOf(m.created_at) : 0,
      }
    }),
  })
})

const schema = z.union([
  z.object({
    action: z.literal('send'),
    text: z.string().trim().max(2000).default(''),
    kind: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'STICKER']).default('TEXT'),
    filePath: z.string().max(400).nullish(),
    fileName: z.string().max(200).nullish(),
    fileSize: z.number().int().nonnegative().nullish(),
    mime: z.string().max(120).nullish(),
    replyTo: z.uuid().nullish(),
    mentions: z.array(z.uuid()).max(50).default([]),
  }),
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('leave') }),
  /* ★ ตั้งค่ารายคน: ปักหมุด · ซ่อน · ปิดเสียง · ทำเป็นยังไม่อ่าน */
  z.object({
    action: z.literal('pref'),
    field: z.enum(['pinned', 'hidden', 'muted', 'forced_unread']),
    value: z.boolean(),
  }),
  /* ★ โปรไฟล์กลุ่ม */
  z.object({
    action: z.literal('group'),
    title: z.string().trim().min(1).max(60).nullish(),
    avatarPath: z.string().max(400).nullish(),
  }),
  z.object({ action: z.literal('addMembers'), members: z.array(z.uuid()).min(1).max(50) }),
  z.object({ action: z.literal('removeMember'), userId: z.uuid() }),
  /* ★ ข้อความ */
  z.object({ action: z.literal('edit'), messageId: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('deleteMessage'), messageId: z.uuid() }),
  z.object({ action: z.literal('pinMessage'), messageId: z.uuid() }),
  /*
   * ★★ จำกัดอีโมจิไว้ 16 ตัวอักษร เท่าที่ constraint ในฐานข้อมูลยอมรับ
   *    ★ ตัวเลขนี้ไม่ใช่ "16 อีโมจิ" — อีโมจิหนึ่งตัวที่มีสีผิวและเพศกำกับ
   *      ยาวได้ถึง 7 code point ★★ ขอบเขตจึงกว้างพอสำหรับอีโมจิเดียว
   *      แต่แคบพอที่จะไม่กลายเป็นช่องส่งข้อความซ่อนรูป
   */
  z.object({
    action: z.literal('react'),
    messageId: z.uuid(),
    emoji: z.string().min(1).max(16),
    on: z.boolean(),
  }),
])

export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  if (body.action === 'send') {
    await enforceRateLimit('chatAction', actor.id)
    const { data, error } = await admin.rpc('send_office_chat_v2', {
      p_actor: actor.id,
      p_room: id,
      p_text: body.text,
      p_kind: body.kind,
      p_file_path: body.filePath ?? null,
      p_file_name: body.fileName ?? null,
      p_file_size: body.fileSize ?? null,
      p_mime: body.mime ?? null,
      p_reply_to: body.replyTo ?? null,
      p_mentions: body.mentions,
    })
    if (error) throw fromPostgresError(error)
    return ok({ id: data })
  }

  if (body.action === 'pref') {
    const { error } = await admin.rpc('set_office_chat_pref', {
      p_actor: actor.id,
      p_room: id,
      p_field: body.field,
      p_value: body.value,
    })
    if (error) throw fromPostgresError(error)
    return ok({ [body.field]: body.value })
  }

  if (body.action === 'group') {
    const { error } = await admin.rpc('update_office_group', {
      p_actor: actor.id,
      p_room: id,
      p_title: body.title ?? null,
      p_avatar: body.avatarPath ?? null,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'addMembers') {
    const { data, error } = await admin.rpc('add_office_members', {
      p_actor: actor.id,
      p_room: id,
      p_members: body.members,
    })
    if (error) throw fromPostgresError(error)
    return ok({ added: data ?? 0 })
  }

  if (body.action === 'removeMember') {
    const { error } = await admin.rpc('remove_office_member', {
      p_actor: actor.id,
      p_room: id,
      p_member: body.userId,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'edit') {
    const { error } = await admin.rpc('edit_office_chat', {
      p_actor: actor.id,
      p_msg: body.messageId,
      p_text: body.text,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'deleteMessage') {
    const { error } = await admin.rpc('delete_office_chat', {
      p_actor: actor.id,
      p_msg: body.messageId,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'react') {
    /*
     * ★★ นับโควตาด้วย เพราะการกดอิโมจิกดได้เร็วกว่าการพิมพ์หลายเท่า
     *    ★ ปุ่มเดียวที่กดรวดเดียวสิบครั้งได้ในหนึ่งวินาที คือช่องที่ใช้
     *      ถล่มฐานข้อมูลได้ง่ายที่สุดในหน้านี้
     */
    await enforceRateLimit('chatAction', actor.id)
    const { error } = await admin.rpc('toggle_office_reaction', {
      p_actor: actor.id,
      p_msg: body.messageId,
      p_emoji: body.emoji,
      p_on: body.on,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'pinMessage') {
    const { error } = await admin.rpc('pin_office_message', {
      p_actor: actor.id,
      p_room: id,
      p_msg: body.messageId,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'leave') {
    const { error } = await admin.rpc('leave_office_group', { p_actor: actor.id, p_room: id })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  const { error } = await admin.rpc('read_office_chat', { p_actor: actor.id, p_room: id })
  if (error) throw fromPostgresError(error)
  return ok({})
})
