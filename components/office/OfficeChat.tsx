'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { useOnlinePeople } from './useOnlinePeople'
import { useOt, type Ot } from '@/lib/i18n/office'
import { ChatAvatar } from './ChatAvatar'
import { ChatGroupPanel } from './ChatGroupPanel'
import { useChatTyping } from './useChatTyping'
import { ChatStats, ChatWelcome } from './ChatSideExtras'
import { ReactionPeople } from './ReactionPeople'

/**
 * แชทออฟฟิศ — แชทส่วนตัวและแชทกลุ่ม
 *
 * ★★★ สองบานบนคอม บานเดียวบนมือถือ
 *
 *     แอปแชททุกตัวทำแบบนี้เพราะบนจอกว้างการสลับห้องคือสิ่งที่ทำบ่อยที่สุด
 *     ★ ส่วนบนมือถือ รายการกับห้องแย่งพื้นที่กันจนอ่านข้อความไม่ได้ทั้งคู่
 *     ★★ ไม่ใช่สองคอมโพเนนต์ แต่เป็นคอมโพเนนต์เดียวที่ซ่อนบานหนึ่งตามความกว้าง
 *        — ถ้าแยก วันที่แก้ตรรกะการส่งข้อความจะลืมแก้อีกบานแน่นอน
 *
 * ★★ Realtime เป็นทางเร็ว ส่วนการถามซ้ำเป็นหลักประกัน
 *    บทเรียนจากห้องสุ่มกลุ่ม: subscribe สำเร็จแต่ไม่มี event เข้ามาเลยก็เกิดขึ้นได้
 *    ★ แชทที่ข้อความไม่มาคือแชทที่ใช้ไม่ได้ จึงต้องมีทางที่สองเสมอ
 */

type Room = {
  id: string
  kind: 'DM' | 'GROUP'
  title: string
  avatar: string | null
  members: number
  last_text: string | null
  last_message_at: string
  unread: number
  muted: boolean
}

type Reaction = { emoji: string; count: number; mine: boolean }

type Message = {
  id: string
  text: string
  kind: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'STICKER'
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  mime: string | null
  deleted: boolean
  mine: boolean
  senderName: string
  senderAvatar: string | null
  createdAt: string
  read: boolean
  /** คนอื่นที่อ่านข้อความนี้แล้วกี่คน (เฉพาะข้อความของเราเอง) */
  readers: number
  /** ข้อความที่ใบนี้ตอบกลับไป — เซิร์ฟเวอร์ส่งเนื้อหามาให้เลย ไม่ต้องไปหาในลิสต์ */
  replyTo: {
    id: string
    text: string
    kind: Message['kind']
    senderName: string
    senderAvatar: string | null
  } | null
  reactions: Reaction[]
}

/*
 * ★★★ หกอีโมจิเท่านั้น ไม่ใช่แผงอีโมจิเต็ม
 *
 *     ★ ชุดนี้คือชุดเดียวกับที่เฟซบุ๊กใช้ และเหตุผลที่มันเหลือหกตัวคือ
 *       "ความรู้สึก" ที่คนอยากบอกบนข้อความงานมีไม่กี่แบบจริง ๆ
 *       ★★ แผงเต็มเปลี่ยนการกดหนึ่งครั้งเป็นการค้นหา ซึ่งไม่มีใครทำ
 *     ★ หกตัวเรียงเดียวกว้างพอดีกับจอมือถือ ไม่ต้องเลื่อนและไม่ต้องตัดบรรทัด
 */
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

type Member = {
  id: string
  name: string
  avatarUrl: string | null
  isOwner: boolean
  isMe: boolean
}
type Person = { id: string; name: string; department: string | null; avatarUrl: string | null }

type Thread = {
  room: {
    id: string
    kind: 'DM' | 'GROUP'
    title: string | null
    avatarUrl: string | null
    pinnedMessageId: string | null
    iAmOwner: boolean
  } | null
  members: Member[]
  messages: Message[]
}

export function OfficeChat() {
  const ot = useOt()
  /* ★ วันที่หัวกลุ่มข้อความต้องเขียนด้วยปฏิทินและเดือนของภาษาที่คนอ่านเลือก
     ★★ เดิมตรึงไว้ที่ 'th-TH' — คนญี่ปุ่นจะเห็นเดือนเป็นตัวหนังสือไทย
        ปนอยู่กลางหน้าญี่ปุ่น ซึ่งอ่านไม่ออกและไม่มีใครรู้ว่ามาจากไหน */
  const locale = useLocale()
  const [rooms, setRooms] = useState<Room[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  /*
   * ★★ แยก error สองก้อน
   *
   *    ★ ตอนแรกใช้ตัวเดียวกัน แล้ว error จากการ "กดเปิดแชท" ไปโผล่ในช่อง
   *      รายการห้องว่า "ระบบขัดข้อง" ★ ซึ่งชี้ไปผิดที่จนหาสาเหตุไม่เจอ
   *    ★★ error ต้องโผล่ตรงที่การกระทำเกิด ไม่ใช่ที่ไหนก็ได้ในหน้า
   */
  const [listError, setListError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [composer, setComposer] = useState<'none' | 'dm' | 'group'>('none')
  const [groupTitle, setGroupTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** เปิดแผงข้อมูลกลุ่มทับห้องแชทอยู่หรือไม่ */
  const [panel, setPanel] = useState(false)
  const [uploading, setUploading] = useState(false)
  /**
   * ข้อความที่กำลังตอบกลับ
   *
   * ★★ เก็บทั้งก้อน ไม่ใช่เก็บแค่ id
   *    ★ แถบ "กำลังตอบกลับ…" ต้องโชว์ชื่อคนส่งกับข้อความต้นทาง ★★ ถ้าเก็บ
   *      แค่ id ต้องไปหาในลิสต์ทุกครั้งที่วาด และจะหาไม่เจอเมื่อข้อความนั้น
   *      เก่าเกิน 300 ใบที่โหลดมา — แถบจะว่างเปล่าโดยไม่มีอะไรฟ้อง
   */
  const [replying, setReplying] = useState<Message | null>(null)
  /** ข้อความที่กล่องเลือกอิโมจิเปิดอยู่ — ครั้งละใบเดียว */
  const [pickFor, setPickFor] = useState<string | null>(null)
  /** ข้อความที่กำลังเปิดดูว่า "ใครกดความรู้สึกบ้าง" */
  const [whoFor, setWhoFor] = useState<string | null>(null)

  const endRef = useRef<HTMLDivElement | null>(null)
  const wallRef = useRef<HTMLDivElement | null>(null)
  const photoRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const me = thread?.members.find((m) => m.isMe) ?? null
  const { typing, notify } = useChatTyping(openId, me?.id ?? null, me?.name ?? '')

  /* ★ ทุกที่ที่ให้เลือก "คน" ต้องไม่มีตัวเราเอง — ทั้งแชทด่วน เปิดแชทส่วนตัว และสร้างกลุ่ม */
  const others = useMemo(() => people.filter((p) => p.id !== meId), [people, meId])

  /* ── ใครออนไลน์อยู่ตอนนี้ ──────────────────────────────────────── */
  const online = useOnlinePeople(meId)

  const [whoQuery, setWhoQuery] = useState('')
  /*
   * ★★ คนที่ออนไลน์ขึ้นก่อนเสมอ แล้วค่อยเรียงตามชื่อ
   *    ★ คนที่ทักแล้วได้คำตอบทันทีมีค่ากว่าคนที่ต้องรอข้ามวัน
   *      ★★ การเรียงตามชื่ออย่างเดียวทำให้คนที่ออนไลน์อยู่ไปจมอยู่ท้ายรายการ
   *         ทั้งที่เป็นคนที่ควรทักที่สุดในตอนนั้น
   */
  const whoList = useMemo(() => {
    const q = whoQuery.trim().toLowerCase()
    const base = q ? others.filter((p) => p.name.toLowerCase().includes(q)) : others
    return [...base].sort((a, b) => {
      const ao = online.has(a.id) ? 0 : 1
      const bo = online.has(b.id) ? 0 : 1
      return ao !== bo ? ao - bo : a.name.localeCompare(b.name)
    })
  }, [others, whoQuery, online])

  const onlineCount = useMemo(
    () => others.reduce((n, p) => n + (online.has(p.id) ? 1 : 0), 0),
    [others, online],
  )

  /*
   * ★★★ ถามซ้ำทุก 5 วินาที แต่ห้าม setState ถ้าข้อมูลเหมือนเดิม
   *
   *     ★ ถ้าเซ็ตทุกครั้ง React จะวาดรายการห้องใหม่ทั้งชุดทุก 5 วินาที
   *       แม้ไม่มีอะไรเปลี่ยน — ปุ่มถูกสร้างใหม่ ตำแหน่งขยับ สถานะ hover หลุด
   *     ★★ อาการนี้จับได้ตอนทดสอบอัตโนมัติ: คลิกแถวแล้ว timeout เพราะ
   *        ตัวตรวจ "องค์ประกอบนิ่งหรือยัง" ไม่เคยผ่านสักที
   *        ★ คนใช้จริงจะไม่เห็นเป็น error แต่จะรู้สึกว่ารายการ "ดิ้น"
   *
   *     ★ เทียบด้วย JSON.stringify ตรง ๆ พอ — ข้อมูลชุดนี้เล็กและมาจาก
   *       ลำดับที่แน่นอนของฐานข้อมูล จึงเทียบสตริงได้ตรงไปตรงมา
   */
  const roomsRef = useRef('')
  const threadRef = useRef('')

  const loadRooms = useCallback(async () => {
    try {
      const d = await apiFetch<{ rooms: Room[]; meId: string }>('/api/office/chat')
      const key = JSON.stringify(d.rooms)
      if (key !== roomsRef.current) {
        roomsRef.current = key
        setRooms(d.rooms)
      }
      setMeId(d.meId)
      setListError(null)
    } catch (e) {
      setListError(officeErrorText(e, ot))
    }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    try {
      const d = await apiFetch<Thread>(`/api/office/chat/${id}`)
      const key = threadKey(d)
      if (key !== threadRef.current) {
        threadRef.current = key
        setThread((prev) => keepLoadedUrls(prev, d))
      }
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void loadRooms()
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => setPeople(d.items))
      .catch(() => undefined)
  }, [loadRooms])

  useEffect(() => {
    /* ★ เปลี่ยนห้องต้องล้างลายเซ็นเดิม ไม่งั้นห้องใหม่จะถูกมองว่า "ไม่เปลี่ยน" */
    threadRef.current = ''
    setPanel(false)
    /*
     * ★★ ล้างเป้าหมายการตอบกลับตอนเปลี่ยนห้องด้วย
     *    ★ ข้อความต้นทางอยู่ในห้องเดิม ★★ ถ้าค้างไว้แล้วกดส่งในห้องใหม่
     *      RPC จะปฏิเสธเพราะ reply_to ไม่ได้อยู่ในห้องนี้ — คนจะเห็นแค่
     *      "ส่งไม่ได้" โดยไม่มีทางเดาได้ว่าเพราะแถบที่ค้างมาจากห้องก่อน
     */
    setReplying(null)
    setPickFor(null)
    /* ★ กล่อง "ใครกดบ้าง" ผูกกับ id ของข้อความในห้องเดิม — ค้างไว้แล้วจะยิง
         คำขอที่ได้ FORBIDDEN กลับมา เพราะข้อความนั้นไม่ได้อยู่ในห้องใหม่ */
    setWhoFor(null)
    if (openId) void loadThread(openId)
  }, [openId, loadThread])

  /*
   * ── ปิดกล่องเลือกอิโมจิ ────────────────────────────────────────
   *
   * ★★ จับที่ document ไม่ใช่ที่ตัวกล่อง
   *    ★ กล่องเปิดได้ครั้งละใบ แต่ปุ่มที่เปิดมันมีเท่าจำนวนข้อความในห้อง
   *      ★★ การผูก ref ให้ทุกใบคือ 300 ref เพื่อกล่องเดียวที่เปิดอยู่
   *    ★ เช็คด้วย closest('.rx-pop') — กดในกล่องเองไม่ควรปิดกล่อง
   */
  useEffect(() => {
    if (!pickFor) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el?.closest('.rx-pop') && !el?.closest('.msg-act')) setPickFor(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickFor(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickFor])

  /*
   * ★★★ กดตอบกลับแล้วเคอร์เซอร์ต้องไปอยู่ในช่องพิมพ์ทันที
   *
   *     ★ คนกดตอบกลับเพื่อ "จะพิมพ์" ไม่ใช่เพื่อดูแถบบริบท ★★ ถ้าไม่ย้าย
   *       โฟกัสให้ คนต้องกดอีกครั้งที่ช่องพิมพ์ ซึ่งบนมือถือคือการกดสองที
   *       แล้วรอแป้นพิมพ์เด้งขึ้นมา
   *     ★ ผูกกับ replying?.id ไม่ใช่ replying — กดตอบกลับใบเดิมซ้ำไม่ต้อง
   *       ย้ายโฟกัสอีก (ซึ่งจะเลื่อนเคอร์เซอร์ไปท้ายข้อความที่พิมพ์ไว้แล้ว)
   */
  useEffect(() => {
    if (replying?.id) inputRef.current?.focus()
  }, [replying?.id])

  /* ── Realtime ────────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel('office-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'office_chat_messages' },
        () => {
          void loadRooms()
          if (openId) void loadThread(openId)
        },
      )
      /*
       * ★★★ อิโมจิใช้ event '*' ไม่ใช่ INSERT อย่างเดียว
       *
       *     ★ การ "ถอน" อิโมจิเป็น DELETE ไม่ใช่ UPDATE ★★ ถ้าฟังแต่ INSERT
       *       เม็ดที่คนอื่นถอนไปจะค้างบนจอเราจนกว่าตัวถามซ้ำ 5 วินาทีจะมาถึง
       *       ★ ซึ่งนานพอให้คนกดเม็ดที่ไม่มีอยู่แล้ว แล้วได้ผลตรงข้าม
       *     ★ ไม่ต้องรีเฟรชรายการห้อง — อิโมจิไม่เปลี่ยนบรรทัดสุดท้าย
       *       และไม่นับเป็นข้อความที่ยังไม่อ่าน
       */
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'office_chat_reactions' },
        () => {
          if (openId) void loadThread(openId)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [openId, loadRooms, loadThread])

  /* ── ถามซ้ำเป็นหลักประกัน ────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      void loadRooms()
      if (openId) void loadThread(openId)
    }
    const id = window.setInterval(tick, 5000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [openId, loadRooms, loadThread])

  /*
   * ★★ จำนวนที่ยังไม่อ่านขึ้นบนแท็บเบราว์เซอร์ด้วย
   *
   *    ★ คนไม่ได้จ้องหน้าแชททั้งวัน เขาเปิดค้างไว้แล้วไปทำอย่างอื่น
   *      ★★ ตัวเลขที่อยู่ในหน้าเว็บจึงไม่มีใครเห็น ส่วนชื่อแท็บเห็นตลอด
   *    ★ คืนชื่อเดิมตอนออกจากหน้า — ไม่งั้นเลขค้างอยู่บนแท็บหน้าอื่น
   */
  useEffect(() => {
    const total = rooms.reduce((sum, r) => sum + r.unread, 0)
    const base = ot('chat.title')
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [rooms])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages.length])

  /*
   * ★★★ ฟอง "กำลังพิมพ์" ต้องเลื่อนตามด้วย ไม่งั้นมันโผล่ใต้ขอบจอ
   *
   *     ★ จับได้ตอนถ่ายภาพหน้าจอทดสอบ: ระบบทำงานถูกทุกอย่าง ฟองมีอยู่จริง
   *       ในหน้าเว็บ ★★ แต่มันอยู่ต่ำกว่าที่ตามองเห็น — ฟีเจอร์ที่ไม่มีใคร
   *       เห็นเท่ากับไม่ได้ทำ
   *
   * ★★ แต่เลื่อนเฉพาะตอนที่คนอ่านอยู่ท้ายห้องแล้วเท่านั้น
   *    ★ ถ้าเลื่อนทุกครั้ง คนที่กำลังไล่อ่านข้อความเก่าจะโดนกระชากลงล่าง
   *      ทุกครั้งที่มีใครสักคนแตะแป้นพิมพ์ ซึ่งแย่กว่าการไม่เห็นฟองมาก
   */
  useEffect(() => {
    if (typing.length === 0) return
    const wall = wallRef.current
    if (!wall) return
    const atBottom = wall.scrollHeight - wall.scrollTop - wall.clientHeight < 140
    if (atBottom) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [typing.length])

  async function send() {
    const body = text.trim()
    if (!openId || !body || busy) return

    /*
     * ★★★ ล้างช่องพิมพ์ทันที ไม่ใช่หลังส่งสำเร็จ
     *
     *     เดิมล้างหลัง await ★ ถ้าผู้ใช้พิมพ์ข้อความถัดไประหว่างที่ข้อความแรก
     *     ยังส่งไม่เสร็จ setText('') จะไปลบสิ่งที่เพิ่งพิมพ์ทิ้ง
     */
    /*
     * ★★ จับค่าที่จะตอบกลับไว้ก่อนล้างสถานะ
     *    ★ setReplying(null) ไม่ได้เปลี่ยน replying ของรอบนี้ทันที แต่ถ้า
     *      อ่านค่าหลัง await จะกลายเป็นการพึ่งลำดับการ render
     *      ★★ ซึ่งเป็นที่มาของบั๊ก "ตอบกลับผิดข้อความ" ที่หาสาเหตุยากมาก
     */
    const parent = replying?.id ?? null

    setText('')
    setReplying(null)
    setBusy(true)
    setError(null)

    try {
      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: { action: 'send', text: body, replyTo: parent },
      })
    } catch (e) {
      setError(officeErrorText(e, ot))
      /* ★ คืนข้อความให้ผู้ใช้ ไม่ให้สิ่งที่พิมพ์หายไปพร้อมกับความผิดพลาด */
      setText((t) => (t ? t : body))
      /* ★ คืนเป้าหมายการตอบกลับด้วย — ไม่งั้นกดส่งซ้ำจะได้ข้อความลอย ๆ
           ที่ไม่ได้ตอบใคร ซึ่งอ่านไม่รู้เรื่องในห้องกลุ่มที่คุยหลายเรื่องพร้อมกัน */
      setReplying(replying)
      setBusy(false)
      return
    }

    /*
     * ★★★ ปลดล็อกช่องพิมพ์ทันทีที่เซิร์ฟเวอร์รับข้อความแล้ว
     *
     *     เดิมรอ loadThread + loadRooms ให้เสร็จก่อนค่อยปลด ★ สองอันนั้น
     *     ยิงรวมกันห้า query กินเวลาเกินวินาที — คนพิมพ์เร็วจะกด Enter
     *     ข้อความถัดไปแล้วไม่มีอะไรเกิดขึ้น ★★ วัดได้ตอนทดสอบ: busy ยังเป็น
     *     true ที่ 1.5 วินาทีหลังส่ง แล้วข้อความที่สองหายไปเงียบ ๆ
     *
     *     ★ การรีเฟรชเป็นเรื่องของ "ภาพที่เห็น" ไม่ใช่ "ส่งสำเร็จหรือยัง"
     *       จึงปล่อยให้ทำงานเบื้องหลังได้ และตัวถามซ้ำทุก 5 วินาทีก็รับช่วงต่อ
     */
    setBusy(false)
    void loadThread(openId)
    void loadRooms()
  }

  /**
   * กด/ถอนอิโมจิบนข้อความ
   *
   * ★★★ เปลี่ยนภาพบนจอก่อน แล้วค่อยยิงไปเซิร์ฟเวอร์ (optimistic)
   *
   *     ★ การกดอิโมจิเป็นการ "ตอบ" ที่เบาที่สุดที่มี — คนกดคาดหวังว่า
   *       มันจะติดทันที เหมือนกดไลก์
   *       ★★ ถ้ารอรอบไปกลับก่อน (วัดได้ 200–400ms บนเน็ตบริษัท) คนจะกดซ้ำ
   *          แล้วครั้งที่สองคือการ "ถอน" — ได้ผลตรงข้ามกับที่ต้องการ
   *     ★ พลาดแล้วค่อยถอนภาพกลับด้วย loadThread() ซึ่งเอาความจริงจาก
   *       เซิร์ฟเวอร์มาทับทั้งชุด ★★ ไม่ต้องเขียนโค้ดย้อนสถานะเองทีละขั้น
   */
  async function react(m: Message, emoji: string) {
    if (!openId) return

    const had = m.reactions.find((r) => r.emoji === emoji)?.mine ?? false
    setPickFor(null)

    setThread((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        messages: prev.messages.map((x) => {
          if (x.id !== m.id) return x
          const list = x.reactions.filter((r) => r.emoji !== emoji)
          const old = x.reactions.find((r) => r.emoji === emoji)
          const count = (old?.count ?? 0) + (had ? -1 : 1)
          /* ★ เม็ดที่นับเหลือศูนย์ต้องหายไป ไม่ใช่ค้างเป็น "0" */
          return { ...x, reactions: count > 0 ? [...list, { emoji, count, mine: !had }] : list }
        }),
      }
    })

    try {
      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: { action: 'react', messageId: m.id, emoji, on: !had },
      })
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
    void loadThread(openId)
  }

  /**
   * ลบข้อความของตัวเอง
   *
   * ★★ ถามยืนยันก่อน — ปุ่มลบอยู่ติดปุ่มตอบกลับซึ่งกดบ่อยกว่ากันหลายเท่า
   *    ★ การกดพลาดหนึ่งพิกเซลแล้วข้อความหายไปเลยคือสิ่งที่ย้อนไม่ได้
   *      ★★ (ฝั่งฐานข้อมูลเป็น soft delete แต่หน้าเว็บไม่มีทางกู้คืน
   *         จึงต้องถือว่าย้อนไม่ได้)
   */
  async function removeMessage(m: Message) {
    if (!openId) return
    if (!window.confirm(ot('chat.deleteConfirm'))) return

    try {
      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: { action: 'deleteMessage', messageId: m.id },
      })
    } catch (e) {
      setError(officeErrorText(e, ot))
      return
    }
    /* ★ รีเฟรชทั้งรายการห้องด้วย — บรรทัดสุดท้ายของห้องอาจเป็นใบที่เพิ่งลบ */
    void loadThread(openId)
    void loadRooms()
  }

  /**
   * แนบไฟล์ — อัปโหลดก่อน แล้วค่อยส่งข้อความที่ชี้ไปหาไฟล์นั้น
   *
   * ★★ สองขั้นแยกกันโดยตั้งใจ
   *    ★ ถ้ายัดไฟล์ไปกับข้อความในคำขอเดียว การส่งพลาดกลางทางจะไม่รู้ว่า
   *      ไฟล์ขึ้นไปแล้วหรือยัง และผู้ใช้ต้องอัปใหม่ทั้งก้อน
   *    ★★ แยกแล้วขั้นอัปโหลดตรวจสิทธิ์ห้องได้ก่อนเปลืองพื้นที่จริง
   */
  async function sendAttachment(file: File, kind: 'IMAGE' | 'FILE') {
    if (!openId || uploading) return

    setUploading(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('roomId', openId)

      const res = await fetch('/api/office/chat/upload', { method: 'POST', body: form })
      const payload = (await res.json()) as
        | { ok: true; data: { path: string; name: string; size: number; mime: string } }
        | { ok: false; error: { message: string } }

      if (!payload.ok) throw new Error(payload.error.message)

      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: {
          action: 'send',
          kind,
          filePath: payload.data.path,
          fileName: payload.data.name,
          fileSize: payload.data.size,
          mime: payload.data.mime,
        },
      })
    } catch (e) {
      setError(officeErrorText(e, ot))
      setUploading(false)
      return
    }

    setUploading(false)
    void loadThread(openId)
    void loadRooms()
  }

  async function openDm(userId: string) {
    try {
      const d = await apiFetch<{ roomId: string }>('/api/office/chat', {
        method: 'POST',
        body: { action: 'dm', userId },
      })
      setComposer('none')
      await loadRooms()
      setOpenId(d.roomId)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  async function createGroup() {
    if (!groupTitle.trim() || picked.size === 0) return
    try {
      const d = await apiFetch<{ roomId: string }>('/api/office/chat', {
        method: 'POST',
        body: { action: 'group', title: groupTitle.trim(), members: [...picked] },
      })
      setComposer('none')
      setGroupTitle('')
      setPicked(new Set())
      await loadRooms()
      setOpenId(d.roomId)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  const current = useMemo(() => rooms.find((r) => r.id === openId) ?? null, [rooms, openId])

  return (
    /*
     * ★★ หน้านี้กว้างกว่าหน้าอื่นโดยตั้งใจ (page-wide)
     *    ★ สองบานที่ต้องอ่านพร้อมกันบีบอยู่ใน 1000px แล้วฟองข้อความขึ้น
     *      บรรทัดละไม่กี่คำ ★★ แชทคือหน้าเดียวในระบบที่ยิ่งกว้างยิ่งใช้ง่าย
     */
    <div className="page-wide grid gap-4 py-2 lg:grid-cols-[23rem_1fr]">
      {/* ═══ รายการห้อง ═══════════════════════════════════════════ */}
      <aside className={cn('flex flex-col gap-3', openId && 'hidden lg:flex')}>
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={() => setComposer('dm')}>
            {ot('chat.newDm')}
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setComposer('group')}>
            {ot('chat.newGroup')}
          </Button>
        </div>

        {/* ── ตัวเลือกคนคุย / สร้างกลุ่ม ────────────────────────── */}
        {composer !== 'none' ? (
          <div className="rounded-2xl border border-line bg-elevated/60 p-4 backdrop-blur-md">
            {composer === 'group' ? (
              <Input
                radius="round"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder={ot('chat.groupName')}
                maxLength={60}
                className="mb-3"
              />
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-faint">
                {composer === 'dm' ? ot('chat.pickOne') : ot('chat.pickMany')}
              </p>
              {/* ★ บอกจำนวนคนที่ออนไลน์ก่อนกวาดตาหาทีละคน
                  ★★ ถ้าไม่มีใครออนเลย คนจะได้รู้ตั้งแต่แรกว่าทักไปแล้วต้องรอ */}
              {onlineCount > 0 ? (
                <span className="who-count">
                  <span className="who-count-dot" aria-hidden="true" />
                  ออนไลน์ {onlineCount} คน
                </span>
              ) : null}
            </div>

            {/* ★ ช่องค้นหาโผล่เมื่อคนเยอะพอที่จะหาไม่เจอด้วยตา
                ★★ ต่ำกว่านั้นช่องค้นหาเป็นของที่กินที่แล้วไม่มีใครใช้ */}
            {others.length > 8 ? (
              <Input
                radius="round"
                value={whoQuery}
                onChange={(e) => setWhoQuery(e.target.value)}
                placeholder={ot('common.search')}
                className="mt-2"
              />
            ) : null}

            <div className="who-grid mt-2">
              {whoList.length === 0 ? (
                <p className="col-span-full px-2 py-6 text-center text-xs text-ink-faint">
                  {ot('wallet.create.noMatch')}
                </p>
              ) : (
                whoList.map((p) => {
                  const on = picked.has(p.id)
                  const isOn = online.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={composer === 'group' ? on : undefined}
                      onClick={() => {
                        if (composer === 'dm') {
                          void openDm(p.id)
                          return
                        }
                        setPicked((s) => {
                          const next = new Set(s)
                          if (next.has(p.id)) next.delete(p.id)
                          else next.add(p.id)
                          return next
                        })
                      }}
                      className="who-card"
                    >
                      <span className="who-ava">
                        <ChatAvatar name={p.name} url={p.avatarUrl} size={34} />
                        {/* ★ จุดขึ้นทั้งสองสถานะ ไม่ใช่โผล่เฉพาะตอนออนไลน์
                            ★★ ถ้าโผล่เฉพาะตอนออน คนจะอ่าน "ไม่มีจุด" ว่า
                               ระบบยังโหลดไม่เสร็จ ไม่ใช่ว่าเขาออฟไลน์ */}
                        <span
                          className={cn('who-dot', isOn && 'who-dot-on')}
                          aria-hidden="true"
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink" dir="auto">
                          {p.name}
                        </span>
                        <span className="block text-[10.5px] text-ink-faint">
                          {isOn ? 'ออนไลน์' : 'ออฟไลน์'}
                        </span>
                      </span>

                      {composer === 'group' && on ? (
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>

            {error ? (
              <p role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              {composer === 'group' ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!groupTitle.trim() || picked.size === 0}
                  onClick={createGroup}
                >
                  {ot('chat.create')}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setComposer('none')}>
                {ot('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        {/* ★ สรุปที่ค้างอยู่ก่อนรายการห้อง — ตอบคำถามแรกที่คนเปิดหน้านี้ถาม */}

        {/*
          * ★★ แถวรายการแบบ LINE: รูป 56px · ชื่อหนา · ข้อความล่าสุดสีจาง ·
          *    เวลาอยู่ขวาบน · ป้ายยังไม่อ่านอยู่ขวาล่าง
          *    ★ ตำแหน่งพวกนี้คนไทยจำได้หมดแล้ว การวางให้ตรงแปลว่าไม่ต้องเรียนใหม่
          */}
        <div className="chat-shell overflow-hidden bg-elevated/40 backdrop-blur-md">
          {rooms.length === 0 ? (
            /*
             * ★★ โหลดรายการไม่สำเร็จ ต้องบอกว่าพัง ไม่ใช่บอกว่า "ยังไม่มีห้อง"
             *
             *    ★ ตอนทดสอบเองเจอหน้าจอบอก "ยังไม่มีห้องแชท" ทั้งที่จริง ๆ คือ
             *      API ตอบ 500 เพราะฐานข้อมูลยังไม่มีตาราง — หลงคิดว่าระบบปกติ
             *    ★★ สถานะว่างกับสถานะพังต้องหน้าตาไม่เหมือนกันเสมอ
             */
            listError ? (
              <p role="alert" className="px-4 py-10 text-center text-sm text-danger">
                {listError}
              </p>
            ) : (
              <p className="py-12 text-center text-sm text-ink-faint">{ot('chat.empty')}</p>
            )
          ) : (
            rooms.map((room, i) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setOpenId(room.id)}
                className={cn(
                  'chat-row flex w-full items-center gap-3 px-3 py-2.5 text-start',
                  i > 0 && 'border-t border-line/60',
                  room.id === openId ? 'chat-row-on' : 'hover:bg-surface/70',
                )}
              >
                {/*
                  * ★★★ ห้องกลุ่มก็มีรูปของตัวเอง — ไม่ได้บังคับให้เป็น "#" เสมอ
                  *
                  *     ★ เดิมเขียนตรง ๆ ว่า kind === 'GROUP' → url = null ★★ ซึ่งแปลว่า
                  *       กลุ่มที่อัปรูปแล้วจะเห็นรูปเฉพาะในหัวห้องกับแผงข้อมูลกลุ่ม
                  *       แต่รายการฝั่งซ้ายยังเป็น "#" อยู่ตลอดไป
                  *     ★ คนตั้งรูปกลุ่มเพื่อให้ "หาห้องเจอเร็วขึ้นในรายการ" เป็นหลัก —
                  *       ★★ ที่เดียวที่รูปไม่ขึ้น คือที่เดียวที่มันมีประโยชน์จริง
                  *     ★ "#" ยังเป็นตัวสำรองเมื่อกลุ่มยังไม่ได้ตั้งรูป (ดู ChatAvatar)
                  */}
                <ChatAvatar
                  name={room.title}
                  url={room.avatar}
                  group={room.kind === 'GROUP'}
                  size={52}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                      {room.title}
                      {room.kind === 'GROUP' ? (
                        <span className="ms-1 text-xs font-normal text-ink-faint">
                          {room.members}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {shortTime(room.last_message_at)}
                    </span>
                  </span>

                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                      {room.last_text ?? ot('chat.noMessage')}
                    </span>
                    {room.muted ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3.5 shrink-0 text-ink-faint"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M11 5 6 9H3v6h3l5 4zM17 9l4 6M21 9l-4 6" />
                      </svg>
                    ) : null}
                    {room.unread > 0 ? (
                      /* ★ ป้ายเขียวของ LINE — กลมเสมอ ไม่ใช่สี่เหลี่ยมมน */
                      <span
                        className="chat-badge grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white tabular-nums"
                        title={ot('chat.unreadHere', { n: room.unread })}
                      >
                        {room.unread > 99 ? '99+' : room.unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* ★ ของสองอย่างนี้ไม่ใช่ของประดับ — เติมพื้นที่ว่างด้วยสิ่งที่กดต่อได้ */}
        <ChatStats rooms={rooms} />
      </aside>

      {/* ═══ ห้องแชท ═══════════════════════════════════════════════ */}
      <section
        className={cn(
          'chat-shell relative flex min-h-[78vh] flex-col overflow-hidden',
          !openId && 'hidden lg:flex',
        )}
      >
        {!openId || !thread ? (
          <ChatWelcome />
        ) : (
          <>
            {/* ★ แผงข้อมูลกลุ่มทับอยู่ข้างบน ปิดแล้วเจอบทสนทนาที่เดิมเป๊ะ */}
            {panel && thread.room?.kind === 'GROUP' ? (
              <ChatGroupPanel
                roomId={thread.room.id}
                title={current?.title ?? thread.room.title ?? ''}
                avatarUrl={thread.room.avatarUrl}
                members={thread.members}
                people={others}
                iAmOwner={thread.room.iAmOwner}
                onClose={() => setPanel(false)}
                onChanged={() => {
                  threadRef.current = ''
                  roomsRef.current = ''
                  void loadThread(openId)
                  void loadRooms()
                }}
                onLeft={() => {
                  setPanel(false)
                  setOpenId(null)
                  setThread(null)
                  roomsRef.current = ''
                  void loadRooms()
                }}
              />
            ) : null}

            {/* ── หัวห้อง ──────────────────────────────────────────── */}
            <div className="chat-bar flex items-center gap-2 border-b border-line px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setOpenId(null)
                  setThread(null)
                }}
                aria-label={ot('room.back')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink lg:hidden"
              >
                <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
                  <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
                </svg>
              </button>

              {/* ★ กดที่ชื่อ/รูปเพื่อเปิดข้อมูลกลุ่ม — ตำแหน่งเดียวกับแอปแชททั่วไป
                  ★★ แชทส่วนตัวไม่มีข้อมูลให้แก้ จึงไม่ทำให้กดได้ (ปุ่มที่กดแล้ว
                     ไม่เกิดอะไรขึ้นแย่กว่าไม่มีปุ่ม) */}
              <button
                type="button"
                disabled={thread.room?.kind !== 'GROUP'}
                onClick={() => setPanel(true)}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-start',
                  thread.room?.kind === 'GROUP' && 'transition-colors hover:bg-surface',
                )}
              >
                <ChatAvatar
                  name={current?.title ?? ''}
                  url={thread.room?.avatarUrl ?? current?.avatar ?? null}
                  group={thread.room?.kind === 'GROUP'}
                  size={36}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {current?.title ?? thread.room?.title ?? '—'}
                  </span>
                  {thread.room?.kind === 'GROUP' ? (
                    <span className="block text-[11px] text-ink-faint">
                      {ot('chat.memberCount', { n: thread.members.length })}
                    </span>
                  ) : null}
                </span>
              </button>

              {/*
                * ★★★ ปุ่มขีดสามขีดสำหรับเปิดข้อมูลกลุ่ม
                *
                *     ★ เดิมกดที่ชื่อห้องได้อยู่แล้ว แต่ไม่มีอะไรบอกว่ากดได้ —
                *       ผู้ใช้จริงถามว่า "ทำตรงไหน" ทั้งที่ปุ่มอยู่ตรงหน้า
                *     ★★ ความสามารถที่มองไม่เห็นเท่ากับไม่มี ไอคอนที่มีรูปร่าง
                *        ชัดเจนตรงมุมขวาคือที่ที่คนเปิดเมนูห้องไปหาอยู่แล้ว
                *     ★ ยังคงกดที่ชื่อได้เหมือนเดิม — สองทางไปที่เดียวกัน
                */}
              {thread.room?.kind === 'GROUP' ? (
                <button
                  type="button"
                  onClick={() => setPanel(true)}
                  title={ot('chat.groupInfo')}
                  aria-label={ot('chat.groupInfo')}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="size-5"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              ) : null}

              {/* ★ ปิดเสียงห้อง — สิ่งแรกที่คนหาเมื่อกลุ่มเริ่มคุยเยอะ */}
              <button
                type="button"
                onClick={() =>
                  void apiFetch(`/api/office/chat/${openId}`, {
                    method: 'POST',
                    body: { action: 'mute', muted: !current?.muted },
                  }).then(loadRooms)
                }
                title={current?.muted ? ot('chat.unmute') : ot('chat.mute')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="size-5"
                  aria-hidden="true"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  {current?.muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
                </svg>
              </button>
            </div>

            {/* ── ผนังห้องแชท ─────────────────────────────────────── */}
            <div ref={wallRef} className="chat-wall flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
              {thread.messages.length === 0 ? (
                <p className="chat-daypill m-auto">{ot('chat.sayHi')}</p>
              ) : (
                thread.messages.map((m, i) => {
                  const prev = thread.messages[i - 1]
                  const next = thread.messages[i + 1]
                  const showDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt)
                  /* ★ ฟองแรกของช่วงเท่านั้นที่มีหางและรูปโปรไฟล์ */
                  const first = !prev || prev.mine !== m.mine || prev.senderName !== m.senderName || showDay
                  const last = !next || next.mine !== m.mine || next.senderName !== m.senderName

                  return (
                    <div key={m.id}>
                      {showDay ? (
                        <p className="my-3 flex justify-center">
                          <span className="chat-daypill">{dayLabel(ot, locale, m.createdAt)}</span>
                        </p>
                      ) : null}

                      <div
                        className={cn(
                          'msg-row flex items-end gap-2',
                          m.mine ? 'justify-end' : 'justify-start',
                          first ? 'mt-2' : 'mt-0.5',
                        )}
                      >
                        {!m.mine ? (
                          <span className={cn('shrink-0', !first && 'invisible')}>
                            <ChatAvatar name={m.senderName} url={m.senderAvatar} size={34} />
                          </span>
                        ) : null}

                        <span className={cn('flex max-w-[72%] flex-col', m.mine ? 'items-end' : 'items-start')}>
                          {/* ★ ชื่อคนส่งขึ้นเฉพาะในกลุ่มและเฉพาะฟองแรกของช่วง */}
                          {!m.mine && first && thread.room?.kind === 'GROUP' ? (
                            <span className="chat-meta mb-1 ps-1" dir="auto">{m.senderName}</span>
                          ) : null}

                          <span className="flex items-end gap-1.5">
                            {/*
                              * ★★★ ปุ่มอยู่ "ด้านนอก" ของฟองเสมอ — ไม่ใช่ด้านใดด้านหนึ่งตายตัว
                              *
                              *     ★ ฟองของเราชิดขวา ปุ่มจึงต้องอยู่ซ้าย ★★ ถ้าวางขวา
                              *       มันจะล้นออกนอกจอบนมือถือ และกดไม่ได้เลย
                              *     ★ ฟองของคนอื่นชิดซ้าย ปุ่มจึงอยู่ขวา — กลับด้านกัน
                              */}
                            {m.mine && !m.deleted ? (
                              <MsgActions
                                m={m}
                                ot={ot}
                                pickOpen={pickFor === m.id}
                                onPick={() => setPickFor((v) => (v === m.id ? null : m.id))}
                                onReact={(e) => void react(m, e)}
                                onReply={() => setReplying(m)}
                                onDelete={() => void removeMessage(m)}
                              />
                            ) : null}

                            {/* ★★ "อ่านแล้ว" อยู่เหนือเวลา ทางซ้ายของฟองเรา — ตำแหน่งเดียวกับต้นฉบับ */}
                            {m.mine ? (
                              <span className="flex flex-col items-end">
                                {/*
                                  * ★★ ในกลุ่มบอกเป็นจำนวนคน ไม่ใช่รอให้ครบทุกคนแล้วค่อยขึ้น
                                  *
                                  *    ★ เดิมขึ้น "อ่านแล้ว" ต่อเมื่อทุกคนอ่านครบ ★★ กลุ่มสิบคน
                                  *      ที่มีคนลาหนึ่งคนจะไม่ขึ้นคำว่าอ่านแล้วเลยทั้งวัน
                                  *      ทั้งที่อีกเก้าคนอ่านไปตั้งนานแล้ว
                                  *    ★ ตัวเลขตอบคำถามที่คนถามจริง ๆ ว่า "มีคนเห็นหรือยัง กี่คน"
                                  */}
                                {m.readers > 0 && last ? (
                                  <span className="chat-meta font-medium">
                                    {thread.room?.kind === 'GROUP'
                                      ? ot('chat.readCount', { n: m.readers })
                                      : ot('chat.read')}
                                  </span>
                                ) : null}
                                {last ? <span className="chat-meta">{shortTime(m.createdAt)}</span> : null}
                              </span>
                            ) : null}

                            <MessageBody m={m} last={last} />

                            {!m.mine && last ? (
                              <span className="chat-meta">{shortTime(m.createdAt)}</span>
                            ) : null}

                            {!m.mine && !m.deleted ? (
                              <MsgActions
                                m={m}
                                ot={ot}
                                pickOpen={pickFor === m.id}
                                onPick={() => setPickFor((v) => (v === m.id ? null : m.id))}
                                onReact={(e) => void react(m, e)}
                                onReply={() => setReplying(m)}
                                /* ★ ลบได้แค่ข้อความของตัวเอง — ฝั่งฐานข้อมูลก็กันไว้อีกชั้น
                                     ★★ ซ่อนปุ่มที่กดแล้วจะได้ FORBIDDEN แน่ ๆ ดีกว่าให้กดแล้วค่อยด่า */
                                onDelete={null}
                              />
                            ) : null}
                          </span>

                          {/* ★ แถวอิโมจิอยู่ใต้ฟอง ไม่ใช่ข้าง ๆ — ข้าง ๆ จะบีบฟองให้แคบลง
                                ทั้งที่อิโมจิเป็นของประกอบ ไม่ใช่เนื้อหา */}
                          {m.reactions.length > 0 ? (
                            <span className={cn('rx-row', m.mine && 'justify-end')}>
                              {[...m.reactions]
                                /* ★ เรียงตามจำนวนมากไปน้อย — อันที่คนเห็นด้วยมากที่สุดขึ้นก่อน
                                     ★★ เรียงตามเวลาที่กดจะทำให้ลำดับเปลี่ยนทุกครั้งที่มีคนกด
                                        ซึ่งทำให้ปุ่มขยับหนีนิ้วตอนกำลังจะกด */
                                .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
                                .map((r) => (
                                  <button
                                    key={r.emoji}
                                    type="button"
                                    /*
                                     * ★★★ กดเม็ดแล้ว "เปิดดูว่าใครกด" ไม่ใช่ถอนของตัวเอง
                                     *
                                     *     ★ เดิมกดแล้วถอนทันที ★★ ซึ่งแปลว่าไม่มีทางรู้เลยว่า
                                     *       ใครกดบ้าง — เม็ด "👍 3" ตอบได้แค่ "สามคน"
                                     *       แต่คำถามจริงในที่ทำงานคือ "หัวหน้าเห็นหรือยัง"
                                     *     ★ การถอนย้ายไปอยู่ในกล่อง (แตะชื่อตัวเอง) และยังถอน
                                     *       จากกล่องเลือกอีโมจิได้เหมือนเดิม — เลือกตัวเดิมซ้ำ = ถอน
                                     *       ★★ ทางถอนจึงไม่ได้หายไป แค่ไม่ใช่ผลข้างเคียงของการ "ดู"
                                     */
                                    onClick={() => setWhoFor(m.id)}
                                    title={ot('chat.whoReacted')}
                                    className={cn('rx-chip', r.mine && 'rx-chip-mine')}
                                  >
                                    <span aria-hidden="true">{r.emoji}</span>
                                    {/* ★ ตัวเลขขึ้นเฉพาะตอนมากกว่าหนึ่ง — "1" ไม่ได้บอกอะไร
                                          นอกจากกินที่และทำให้เม็ดกว้างขึ้นโดยไม่ได้อะไร */}
                                    {r.count > 1 ? <span>{r.count}</span> : null}
                                  </button>
                                ))}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
              {/* ★ ฟองจุดเต้นอยู่ท้ายบทสนทนา ไม่ใช่แถบลอยด้านล่าง
                  ★★ มันคือข้อความที่กำลังจะมาถึง จึงควรอยู่ตรงที่ข้อความนั้นจะโผล่ */}
              {typing.length > 0 ? (
                <div className="mt-2 flex items-end gap-2">
                  {/* ★ ช่องว่างกว้างเท่ารูปโปรไฟล์ ให้ฟองนี้ตรงแนวกับฟองอื่นของฝั่งซ้าย
                      ★★ เยื้องไป 34px อ่านเป็น "จัดวางพลาด" ไม่ใช่ดีไซน์ */}
                  <span className="size-8.5 shrink-0" />
                  <span className="flex flex-col items-start">
                    <span className="chat-meta mb-1 ps-1">{typingLabel(ot, typing)}</span>
                    <span className="bubble bubble-you chat-typing" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                </div>
              ) : null}

              <div ref={endRef} />
            </div>

            {/* ★ กำลังอัปโหลดต้องเห็น — ไฟล์ใหญ่ใช้เวลาหลายวินาทีโดยที่หน้าจอ
                ไม่มีอะไรเปลี่ยนเลย คนจะกดแนบซ้ำแล้วได้ไฟล์ซ้ำสองอัน */}
            {uploading ? (
              <p className="flex items-center gap-2 bg-elevated px-4 py-1 text-xs text-ink-soft">
                <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                {ot('chat.uploading')}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="bg-elevated px-4 py-1 text-xs text-danger">
                {error}
              </p>
            ) : null}

            {/*
              * ★★★ แถบนี้อยู่ "ติดช่องพิมพ์" ไม่ใช่ลอยอยู่กลางหน้า
              *
              *     ★ มันคือบริบทของสิ่งที่กำลังจะพิมพ์ ★★ คนที่กดตอบกลับแล้ว
              *       เลื่อนผนังห้องขึ้นไปอ่านข้อความเก่า ต้องยังเห็นว่าตัวเอง
              *       กำลังตอบใบไหนอยู่ — ซึ่งได้เฉพาะเมื่อแถบเกาะกับช่องพิมพ์
              *     ★ และต้องมีปุ่มยกเลิก — การตอบกลับที่ถอนไม่ได้แปลว่า
              *       คนที่กดพลาดต้องส่งข้อความผิดออกไปก่อนแล้วค่อยลบ
              */}
            {replying ? (
              <div className="reply-bar">
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 size-4 shrink-0 text-accent rtl:-scale-x-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7" />
                </svg>

                <span className="min-w-0 flex-1">
                  {/* ★ รูปคนที่กำลังตอบอยู่ในแถบนี้ด้วย — รูปทรงเดียวกับกล่อง
                        คำพูดในฟอง เพื่อให้คนเชื่อมได้ว่า "ที่พิมพ์อยู่จะไปโผล่แบบนี้" */}
                  <span className="flex items-center gap-1.5">
                    <ChatAvatar
                      name={replying.senderName}
                      url={replying.senderAvatar}
                      size={16}
                    />
                    <span className="min-w-0 truncate text-[11.5px] font-medium text-ink" dir="auto">
                      {ot('chat.replyingTo', { name: replying.senderName })}
                    </span>
                  </span>
                  <span className="quote-text mt-0.5 text-[12px] text-ink-faint" dir="auto">
                    {quoteOf(ot, {
                      id: replying.id,
                      text: replying.text,
                      kind: replying.kind,
                      senderName: replying.senderName,
                      senderAvatar: replying.senderAvatar,
                    })}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setReplying(null)}
                  title={ot('chat.cancelReply')}
                  aria-label={ot('chat.cancelReply')}
                  className="msg-act -mt-0.5 opacity-100"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ) : null}

            {/* ── แถบพิมพ์ ─────────────────────────────────────────── */}
            {/*
              * ★★ ปุ่มส่งเป็นวงกลมที่โผล่เมื่อมีข้อความ เหมือนต้นฉบับ
              *    ★ ปุ่มที่กดไม่ได้ค้างอยู่ตลอดเวลาเป็นสิ่งรบกวนสายตา
              *      ส่วนปุ่มที่โผล่มาตอนพิมพ์เสร็จคือการยืนยันว่า "พร้อมส่งแล้ว"
              */}
            <div className="chat-bar flex items-end gap-2 border-t border-line px-3 py-2.5">
              {/*
                * ★★ ปุ่มรูปกับปุ่มไฟล์แยกกัน ไม่ยุบเป็นปุ่ม "+" อันเดียว
                *    ★ การส่งรูปเป็นสิ่งที่ทำบ่อยที่สุดรองจากพิมพ์ข้อความ
                *      ซ่อนไว้ใต้เมนูแปลว่าเพิ่มคลิกให้กับงานที่ทำทุกวัน
                *    ★★ accept ต่างกันด้วย — ปุ่มรูปเปิดแกลเลอรีบนมือถือ
                *       ส่วนปุ่มไฟล์เปิดตัวจัดการไฟล์ คนละที่กันคนละงานกัน
                */}
              <input
                ref={photoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void sendAttachment(f, 'IMAGE')
                  e.target.value = ''
                }}
              />
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void sendAttachment(f, 'FILE')
                  e.target.value = ''
                }}
              />

              <button
                type="button"
                disabled={uploading}
                onClick={() => photoRef.current?.click()}
                title={ot('chat.sendImage')}
                aria-label={ot('chat.sendImage')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2.5" />
                  <circle cx="8.5" cy="9.5" r="1.6" />
                  <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 18" />
                </svg>
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                title={ot('chat.sendFile')}
                aria-label={ot('chat.sendFile')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.3-7.3" />
                </svg>
              </button>

              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  /* ★ ส่งสัญญาณเฉพาะตอนมีอะไรอยู่ในช่อง — ลบทิ้งจนว่างคือเลิกพิมพ์ */
                  if (e.target.value.trim()) notify()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                  /* ★ Escape ยกเลิกการตอบกลับ — ปุ่มกากบาทอยู่ไกลมือที่พิมพ์อยู่
                       ★★ และ Escape คือสิ่งที่ทุกคนลองกดก่อนอยู่แล้ว */
                  if (e.key === 'Escape' && replying) setReplying(null)
                }}
                rows={1}
                placeholder={ot('chat.placeholder')}
                maxLength={2000}
                aria-label={ot('chat.placeholder')}
                /*
                 * ★★★ สีขอบตอนโฟกัสคุมจาก .chat-input ใน globals.css ไม่ใช่ที่นี่
                 *
                 *     ★ เดิมเขียน `focus-visible:outline-none` ไว้ตรงนี้ ★★ แล้ว
                 *       มันไม่เคยทำงานเลย — กฎ focus กลางของเว็บอยู่นอก @layer
                 *       ส่วน utility ของ Tailwind อยู่ใน layer ★ สิ่งที่อยู่นอก
                 *       layer ชนะสิ่งที่อยู่ใน layer เสมอ ไม่เกี่ยวกับ specificity
                 *     ★★ วัดจากเบราว์เซอร์จริงได้ rgb(6 95 212) คือสีฟ้าของลิงก์
                 *        ทั้งที่โค้ดตรงนี้สั่งปิดไปแล้ว
                 */
                className={cn(
                  'chat-input max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5',
                  'text-[15px] text-ink placeholder:text-ink-faint',
                )}
              />

              {/*
                * ★★★ ปุ่มส่งอยู่ตลอดเวลา แค่หรี่ลงเมื่อยังไม่มีอะไรให้ส่ง
                *
                *     ★ เดิมทำให้จางหายไปเลยตอนช่องว่าง เลียนแบบ LINE
                *       ★★ แต่ LINE เอาปุ่มไมค์มาวางแทนที่ ช่องนั้นจึงไม่เคยว่าง
                *          ของเราไม่มีไมค์ ผลคือมุมขวาโล่ง ๆ ซึ่งคนอ่านว่า
                *          "ปุ่มส่งหายไปไหน" ไม่ใช่ "ยังไม่พร้อมส่ง"
                *     ★ ปุ่มที่หรี่อยู่บอกสองอย่างพร้อมกัน: ส่งตรงนี้ · ยังกดไม่ได้
                */}
              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || busy}
                aria-label={ot('chat.send')}
                title={ot('chat.send')}
                className={cn('chat-send', text.trim() && !busy && 'chat-send-on')}
              >
                <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
                  <path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </section>

      {/*
        * ★ กล่องอยู่นอก <section> ของห้อง — มันเป็น portal ไปที่ document.body อยู่แล้ว
        *   ★★ วางไว้ตรงนี้เพื่อให้อ่านโค้ดแล้วเห็นว่ามันเป็นของทั้งหน้า
        *      ไม่ใช่ของบานใดบานหนึ่ง
        */}
      {whoFor && openId ? (
        <ReactionPeople
          roomId={openId}
          messageId={whoFor}
          onClose={() => setWhoFor(null)}
          onToggle={(emoji) => {
            /*
             * ★ หาข้อความจาก thread ตอนกด ไม่ได้เก็บทั้งก้อนไว้ใน state
             *   ★★ ข้อความถูกดึงใหม่ทุก 5 วินาที ★ ก้อนที่เก็บไว้ตอนเปิดกล่อง
             *      จะมี reactions เป็นค่าเก่า แล้ว react() จะคำนวณ "เรากดไว้ไหม"
             *      จากค่าเก่านั้น — ได้ผลกลับด้านถ้ามีคนกดเพิ่มระหว่างที่กล่องเปิด
             */
            const msg = thread?.messages.find((x) => x.id === whoFor)
            if (msg) void react(msg, emoji)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * เนื้อในฟองข้อความ — ข้อความ · รูป · ไฟล์
 *
 * ★★ รูปไม่ใส่ฟอง
 *    ★ ฟองมีไว้แยก "คำพูด" ออกจากพื้นหลัง แต่รูปมีขอบของตัวเองอยู่แล้ว
 *      การครอบฟองอีกชั้นทำให้ได้กรอบซ้อนกรอบและรูปเล็กลงโดยไม่ได้อะไรกลับมา
 *    ★★ แอปแชททุกตัวจึงปล่อยรูปลอยบนผนังห้องตรง ๆ
 */
function MessageBody({ m, last }: { m: Message; last: boolean }) {
  const ot = useOt()
  if (m.deleted) {
    return (
      <span
        className="bubble border border-white/25 bg-transparent italic"
        style={{ color: 'var(--chat-meta)' }}
      >
        {ot('chat.deleted')}
      </span>
    )
  }

  if (m.kind === 'IMAGE' && m.fileUrl) {
    return (
      <a href={m.fileUrl} target="_blank" rel="noreferrer" className="chat-photo">
        {/* ★ ใช้ <img> ธรรมดา ไม่ใช่ next/image — ลิงก์เซ็นชื่อมีอายุ 10 นาที
            และโดเมนเปลี่ยนตามโปรเจกต์ ตัวปรับขนาดของ Next จึงแคชผิดตัวได้ */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.fileUrl} alt={m.fileName ?? ot('chat.image')} loading="lazy" />
      </a>
    )
  }

  /*
   * ★ ไฟล์ทุกชนิดที่ไม่ใช่รูป (รวมถึงรูปที่ลิงก์หมดอายุ) แสดงเป็นแถบไฟล์
   *   ★★ ไม่ปล่อยให้กลายเป็นฟองว่างเปล่า — ข้อความที่ว่างทั้งฟองอ่านเหมือนระบบพัง
   */
  if (m.kind === 'IMAGE' || m.kind === 'FILE') {
    const inner = (
      <>
        <svg
          viewBox="0 0 24 24"
          className="size-7 shrink-0 opacity-70"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 3v5h5" />
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        </svg>
        <span className="min-w-0">
          <span className="block truncate text-[14px]">{m.fileName ?? ot('chat.file')}</span>
          <span className="block text-[11px] opacity-60">{prettySize(m.fileSize)}</span>
        </span>
      </>
    )

    const shell = cn(
      'bubble flex max-w-[16rem] items-center gap-2.5',
      m.mine ? 'bubble-me' : 'bubble-you',
      last && (m.mine ? 'bubble-tail-me' : 'bubble-tail-you'),
    )

    return m.fileUrl ? (
      <a href={m.fileUrl} download={m.fileName ?? undefined} className={shell} title={ot('chat.download')}>
        {inner}
      </a>
    ) : (
      <span className={shell}>{inner}</span>
    )
  }

  return (
    <span
      className={cn(
        'bubble',
        m.mine ? 'bubble-me' : 'bubble-you',
        last && (m.mine ? 'bubble-tail-me' : 'bubble-tail-you'),
      )}
    >
      {/*
        * ★★★ ข้อความต้นทางอยู่ "ในฟอง" ไม่ใช่เหนือฟอง
        *
        *     ★ เหนือฟองจะอ่านเป็นข้อความอีกใบที่จางลง ★★ แล้วในห้องกลุ่ม
        *       ที่มีการตอบกลับหลายอัน ผนังห้องจะกลายเป็นฟองสลับจางสลับเข้ม
        *       จนแยกไม่ออกว่าอันไหนคือคำพูดจริง
        *     ★ ในฟองเดียวกันบอกชัดว่า "ใบนี้พูดถึงใบนั้น" โดยไม่ต้องมีเส้นโยง
        */}
      {m.replyTo ? (
        <span className="quote">
          <span className="quote-head">
            <ChatAvatar
              name={m.replyTo.senderName}
              url={m.replyTo.senderAvatar}
              size={18}
            />
            <span className="truncate font-semibold" dir="auto">
              {m.replyTo.senderName}
            </span>
          </span>
          <span className="quote-text" dir="auto">
            {quoteOf(ot, m.replyTo)}
          </span>
        </span>
      ) : null}
      {m.text}
    </span>
  )
}

/**
 * ข้อความย่อของสิ่งที่ยกมา
 *
 * ★★ รูปกับไฟล์ไม่มี text ให้ยก — ต้องเขียนคำแทน
 *    ★ ถ้าปล่อยว่าง กล่องคำพูดจะเหลือแต่ชื่อคนกับที่ว่าง ซึ่งอ่านเหมือนระบบพัง
 *      ★★ และคนตอบกลับรูปบ่อยกว่าที่คิด (เช่น "อันนี้เท่าไหร่" ใต้รูปเมนู)
 */
function quoteOf(ot: Ot, p: NonNullable<Message['replyTo']>): string {
  if (p.text) return p.text
  if (p.kind === 'IMAGE') return ot('chat.image')
  if (p.kind === 'AUDIO') return ot('chat.voice')
  if (p.kind === 'FILE') return ot('chat.file')
  return ot('chat.deleted')
}

/**
 * ปุ่มข้างฟอง — ใส่อิโมจิ · ตอบกลับ · ลบ
 *
 * ★★★ สามปุ่มเท่านั้น ไม่ทำเมนู "⋯" ที่กดแล้วกางรายการ
 *
 *     ★ เมนูซ้อนชั้นแปลว่าทุกการกระทำต้องกดสองครั้ง ★★ ทั้งที่การตอบกลับ
 *       เป็นสิ่งที่ทำบ่อยที่สุดในแชทกลุ่มที่คุยหลายเรื่องพร้อมกัน
 *     ★ สามปุ่มเรียงกันกว้างรวม 84px ซึ่งพอดีกับที่ว่างข้างฟองบนจอมือถือ
 *       ที่แคบที่สุดที่เราออกแบบไว้ (320px) — จึงไม่มีเหตุผลต้องยุบ
 *
 * ★ onDelete เป็น null แปลว่า "ลบไม่ได้" ไม่ใช่ "ลบแล้วไม่ทำอะไร"
 *   ★★ ปุ่มที่กดแล้วเงียบคือบั๊กที่หาไม่เจอ — ไม่มีปุ่มเลยชัดกว่า
 */
function MsgActions({
  m,
  ot,
  pickOpen,
  onPick,
  onReact,
  onReply,
  onDelete,
}: {
  m: Message
  ot: Ot
  pickOpen: boolean
  onPick: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onDelete: (() => void) | null
}) {
  return (
    <span className="msg-acts">
      {/* ★ relative อยู่ที่ปุ่มนี้ ไม่ใช่ที่แถว — กล่องเลือกต้องเกาะปุ่มที่กด
            ★★ ถ้าเกาะแถว กล่องจะโผล่คนละที่กันระหว่างฟองเรากับฟองคนอื่น
               เพราะแถวจัดเรียงกลับด้านกัน */}
      <span className="relative">
        <button
          type="button"
          onClick={onPick}
          aria-expanded={pickOpen}
          title={ot('chat.react')}
          aria-label={ot('chat.react')}
          className="msg-act"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
          </svg>
        </button>

        {pickOpen ? (
          <span
            /* ★ ชิดด้านเดียวกับฟอง — ฟองเราอยู่ขวา กล่องจึงกางไปทางขวา
                 ★★ กางออกนอกจอคือกดไม่ได้ ซึ่งแย่กว่าตำแหน่งที่ไม่สวย */
            className={cn('rx-pop', m.mine ? 'inset-s-0' : 'inset-e-0')}
            role="group"
            aria-label={ot('chat.react')}
          >
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(e)}
                title={e}
                aria-label={e}
                className="rx-pick"
              >
                <span aria-hidden="true">{e}</span>
              </button>
            ))}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        onClick={onReply}
        title={ot('chat.reply')}
        aria-label={ot('chat.reply')}
        className="msg-act"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 rtl:-scale-x-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7" />
        </svg>
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          title={ot('chat.deleteMessage')}
          aria-label={ot('chat.deleteMessage')}
          className="msg-act hover:text-danger!"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
          </svg>
        </button>
      ) : null}
    </span>
  )
}

/*
 * ★★★ ลายเซ็นของบทสนทนาต้องไม่รวมลิงก์ไฟล์
 *
 *     ไฟล์ในแชทอยู่ใน bucket ส่วนตัว เซิร์ฟเวอร์จึงเซ็น URL ใหม่ทุกครั้งที่ถาม
 *     ★ แปลว่า JSON ของบทสนทนา "ไม่เคยเหมือนเดิม" แม้ไม่มีข้อความใหม่เลย
 *     ★★ ถ้าใช้ JSON ทั้งก้อนเป็นลายเซ็น ตัวกันวาดซ้ำจะไร้ผลทันทีที่ห้องมีรูป
 *        — วาดใหม่ทุก 5 วินาที และ src ของ <img> เปลี่ยนทุกครั้ง
 *        ★ ผลที่คนใช้เห็นคือรูปกะพริบทุก 5 วินาทีตลอดเวลาที่เปิดห้องค้างไว้
 *
 *     ★ จึงตัดเฉพาะฟิลด์ที่ "เปลี่ยนโดยไม่มีความหมาย" ออกจากการเทียบ
 */
function threadKey(t: Thread): string {
  return JSON.stringify(t, (k, v) => (k === 'fileUrl' || k === 'avatarUrl' ? null : v))
}

/*
 * ★★ ข้อความที่เคยแสดงอยู่แล้ว ให้คงลิงก์เดิมไว้
 *
 *    ★ ตอนมีข้อความใหม่เข้ามาเราต้อง setState จริง ซึ่งจะพาลิงก์ชุดใหม่
 *      เข้ามาทั้งกระดาน ★★ รูปเก่าที่โหลดเสร็จไปแล้วจะถูกสั่งโหลดใหม่หมด
 *      เพราะ src เปลี่ยน ทั้งที่รูปเป็นรูปเดิมเป๊ะ
 *    ★ ลิงก์เก่ายังไม่หมดอายุ (10 นาที) และรูปก็วาดอยู่บนจอแล้ว
 *      การคงของเดิมไว้จึงทั้งถูกต้องและไม่เสียแบนด์วิดท์
 */
function keepLoadedUrls(prev: Thread | null, next: Thread): Thread {
  if (!prev) return next
  const had = new Map(prev.messages.filter((m) => m.fileUrl).map((m) => [m.id, m.fileUrl]))
  if (had.size === 0) return next
  return {
    ...next,
    messages: next.messages.map((m) => (had.has(m.id) ? { ...m, fileUrl: had.get(m.id)! } : m)),
  }
}

/**
 * ข้อความ "ใครกำลังพิมพ์"
 *
 * ★ สามคนขึ้นไปไม่ไล่ชื่อทั้งหมด — บรรทัดจะยาวจนดันฟองข้อความหลุดจอ
 *   ★★ ชื่อแรกคนเดียวพอ ที่เหลือเป็นตัวเลข
 */
function typingLabel(ot: Ot, names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return ot('chat.typingOne', { name: clean[0]! })
  if (clean.length === 2) return ot('chat.typingTwo', { name: clean[0]!, other: clean[1]! })
  return ot('chat.typingMany', { name: clean[0]!, n: clean.length - 1 })
}

/** ขนาดไฟล์แบบอ่านออก — ไม่ใช้ทศนิยมเมื่อเป็นหน่วยเล็ก */
function prettySize(bytes: number | null): string {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

function dayLabel(ot: Ot, locale: string, iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86_400_000,
  )
  if (diff === 0) return ot('chat.today')
  if (diff === 1) return ot('chat.yesterday')
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}
