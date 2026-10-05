/**
 * ควิซออฟฟิศ — ชนิดข้อมูล · ค่าคงที่ · ชุดคำถามตัวอย่าง (ใช้ทั้ง API และหน้าเว็บ)
 *
 * ★ ตารางในฐานข้อมูลชื่อ office_quiz_* (ไม่ใช่ quiz_*) — quiz_* เป็นของเกมทายเพลงในห้องฟังเพลง
 */

export const QUIZ_SECONDS = [10, 20, 30] as const
export type QuizSeconds = (typeof QUIZ_SECONDS)[number]
export type QuizStatus = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'DONE'

export type QuizDraftQuestion = { body: string; choices: string[]; correct: number; seconds: QuizSeconds }

export type QuizPlayer = {
  id: string
  name: string
  avatarUrl: string | null
  score: number
  isMe: boolean
  /** ตอบข้อนี้แล้วหรือยัง (ระหว่างถาม) — ไม่บอกว่าตอบอะไร */
  answered: boolean
  /** ได้คะแนนจากข้อนี้เท่าไหร่ (หลังเฉลยเท่านั้น) */
  gained: number | null
}

export type QuizState = {
  room: {
    id: string
    code: string
    title: string
    status: QuizStatus
    qIndex: number
    qCount: number
    startedAt: string | null
    answered: number
    isHost: boolean
    hostName: string
  }
  /** ข้อปัจจุบัน — ไม่มีเฉลยปนมาเด็ดขาด */
  question: { body: string; choices: string[]; seconds: number } | null
  /** เฉลย — มีเฉพาะหลังกดเฉลยแล้ว */
  reveal: { correct: number; counts: number[] } | null
  players: QuizPlayer[]
  me: { joined: boolean; choice: number | null; points: number | null }
  serverNow: string
}

export type QuizListItem = {
  id: string
  code: string
  title: string
  status: QuizStatus
  players: number
  hostName: string
  isHost: boolean
}

/** สี + สัญลักษณ์ของตัวเลือก — แยกได้ทั้งด้วยสีและรูปทรง (คนตาบอดสีก็เล่นได้) */
export const CHOICE_STYLE = [
  { tone: 'red', shape: '▲' },
  { tone: 'blue', shape: '◆' },
  { tone: 'gold', shape: '●' },
  { tone: 'green', shape: '■' },
] as const

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * ชุดคำถามตัวอย่าง — เริ่มเล่นได้ทันทีโดยไม่ต้องคิดคำถามเอง
 * ★ ทุกข้อตรวจคำตอบแล้ว (77 จังหวัดนับรวมกรุงเทพฯ ตั้งแต่มีบึงกาฬ 2554 · 7 × 24 = 168)
 */
export const SAMPLE_QUESTIONS: QuizDraftQuestion[] = [
  { body: 'ประเทศไทยมีทั้งหมดกี่จังหวัด (นับรวมกรุงเทพมหานคร)?', choices: ['75', '76', '77', '78'], correct: 2, seconds: 20 },
  { body: 'ดาวเคราะห์ดวงใดใหญ่ที่สุดในระบบสุริยะ?', choices: ['ดาวเสาร์', 'ดาวพฤหัสบดี', 'ดาวเนปจูน', 'โลก'], correct: 1, seconds: 20 },
  { body: 'น้ำบริสุทธิ์เดือดที่กี่องศาเซลเซียส (ที่ระดับน้ำทะเล)?', choices: ['90', '100', '110', '120'], correct: 1, seconds: 10 },
  {
    body: '"HTML" ย่อมาจากอะไร?',
    choices: ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlink Text Management Language'],
    correct: 0,
    seconds: 20,
  },
  { body: 'ธงชาติไทยมีทั้งหมดกี่สี?', choices: ['2 สี', '3 สี', '4 สี', '5 สี'], correct: 1, seconds: 10 },
  { body: '1 สัปดาห์มีกี่ชั่วโมง?', choices: ['148', '158', '168', '178'], correct: 2, seconds: 20 },
]
