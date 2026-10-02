/**
 * แข่งพิมพ์ดีด — การนับและคิดคะแนน แยกจาก UI เพื่อให้ทดสอบได้
 *
 * ★★★ ทำไมต้องแยก: การนับตัวอักษรภาษาไทยเป็นเรื่องที่พลาดแล้วไม่มีอะไรฟ้อง
 *
 *     ★ "สวัสดี" ยาวกี่ตัว? ตาเห็น 4 กลุ่ม แต่ JS บอก 6
 *       ★★ สระบน-ล่างและวรรณยุกต์เป็น code point แยก ซึ่งลอยอยู่เหนือ
 *          หรือใต้พยัญชนะโดยไม่กินความกว้าง
 *     ★ ข้อกำหนดตัดสินไว้แล้วว่า "นับเป็น 1 ตัวอักษรต่อ 1 code point
 *       เพื่อให้นับได้สม่ำเสมอ" — ไฟล์นี้ทำตามนั้น และเทสต์ล็อกไว้
 */

/** นับเป็น code point ไม่ใช่ UTF-16 unit */
export function toChars(s: string): string[] {
  /*
   * ★★ [...s] แยกตาม code point ไม่ใช่ s.split('')
   *    ★ split('') แยกตาม UTF-16 unit ซึ่งทำให้อีโมจิและอักษรนอก BMP
   *      ถูกหั่นครึ่งกลายเป็นคู่ surrogate ที่ไม่มีความหมาย
   */
  return [...s]
}

export type Progress = {
  /** พิมพ์ถูกไปแล้วกี่ตัว (นับจากต้นข้อความต่อเนื่อง) */
  correct: number
  /** ตำแหน่งที่เคอร์เซอร์อยู่ */
  cursor: number
  /** ตัวที่กำลังพิมพ์ผิดอยู่ตอนนี้ไหม */
  wrong: boolean
  /** พิมพ์ครบแล้วไหม */
  done: boolean
}

/**
 * เทียบสิ่งที่พิมพ์กับข้อความต้นฉบับ
 *
 * ★★★ ต้องพิมพ์แก้ให้ถูกก่อนถึงจะไปต่อได้ — ตามข้อกำหนด
 *
 *     ★ จึงนับ "ถูกต่อเนื่องจากต้น" ไม่ใช่ "ถูกกี่ตัวรวม ๆ"
 *       ★★ ถ้านับรวม ๆ คนที่พิมพ์ผิดกลางทางแล้วพิมพ์ต่อไปเรื่อย ๆ
 *          จะได้คะแนนเหมือนคนที่พิมพ์ถูกหมด ซึ่งผิดเจตนาของเกม
 */
export function compare(target: string, typed: string): Progress {
  const t = toChars(target)
  const u = toChars(typed)

  let i = 0
  while (i < u.length && i < t.length && u[i] === t[i]) i++

  return {
    correct: i,
    cursor: u.length,
    /* ★ ผิดเมื่อพิมพ์เกินจุดที่ถูก — รวมถึงพิมพ์ยาวเกินข้อความด้วย */
    wrong: u.length > i,
    done: i === t.length && u.length === t.length,
  }
}

/**
 * WPM = (ตัวอักษรที่พิมพ์ถูก ÷ 5) ÷ นาที — ตามข้อกำหนด
 *
 * ★ คืน 0 เมื่อเวลายังเป็นศูนย์ ไม่ใช่ Infinity
 *   ★★ Infinity ไหลไปถึงกระดานอันดับแล้วทำให้การเรียงพังทั้งตาราง
 */
export function wpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  const minutes = elapsedMs / 60_000
  return Math.round(correctChars / 5 / minutes)
}

/**
 * ความแม่นยำ = ตัวที่พิมพ์ถูกในครั้งแรก ÷ จำนวนครั้งที่กดทั้งหมด × 100
 *
 * ★★ ตัวหารคือ "จำนวนครั้งที่กด" ไม่ใช่ "ความยาวข้อความ"
 *    ★ คนที่พิมพ์ผิดแล้วลบแก้ กดมากกว่าความยาวข้อความเสมอ
 *      ★★ ถ้าหารด้วยความยาวข้อความ ความแม่นยำจะเป็น 100% เสมอ
 *         ตอนพิมพ์จบ ไม่ว่าจะลบแก้ไปกี่ครั้ง
 */
export function accuracy(firstTryCorrect: number, keystrokes: number): number {
  if (keystrokes <= 0) return 100
  return Math.round((firstTryCorrect / keystrokes) * 1000) / 10
}

/**
 * ตัวนับที่เดินไปข้างหน้าอย่างเดียว — ใช้ระหว่างพิมพ์
 *
 * ★★★ "ถูกในครั้งแรก" ต้องจำว่าเคยถึงตำแหน่งไหนมาแล้ว
 *
 *     ★ ถ้านับจากสถานะปัจจุบันอย่างเดียว คนที่พิมพ์ผิดแล้วลบแก้จนถูก
 *       จะได้ความแม่นยำ 100% ★★ ซึ่งลบล้างความหมายของคำว่า "ครั้งแรก"
 */
export class TypingCounter {
  private maxReached = 0
  private firstTryCorrect = 0
  private keystrokes = 0

  /** เรียกทุกครั้งที่ข้อความในช่องเปลี่ยน */
  update(target: string, typed: string, keystrokeDelta: number): Progress {
    this.keystrokes += Math.max(0, keystrokeDelta)
    const p = compare(target, typed)

    /* ★ นับเฉพาะ "ตัวที่เพิ่งไปถึงเป็นครั้งแรกและถูก" */
    if (p.correct > this.maxReached) {
      this.firstTryCorrect += p.correct - this.maxReached
      this.maxReached = p.correct
    }
    return p
  }

  stats(elapsedMs: number) {
    return {
      wpm: wpm(this.maxReached, elapsedMs),
      accuracy: accuracy(this.firstTryCorrect, this.keystrokes),
      correct: this.maxReached,
      keystrokes: this.keystrokes,
    }
  }
}

/**
 * WPM ที่สูงเกินกว่าจะเป็นไปได้ — ไม่นับเข้ากระดานอันดับ (ตามข้อกำหนด)
 *
 * ★ ตรวจที่ server ด้วยเสมอ ★★ ค่านี้อยู่ที่นี่เพื่อให้สองฝั่งใช้เลขเดียวกัน
 *   ไม่ใช่ให้ client เป็นคนตัดสิน
 */
export const MAX_CREDIBLE_WPM = 250

/** เวลาที่ใช้สมเหตุสมผลไหม — ใช้ตรวจฝั่ง server */
export function isCredible(correctChars: number, elapsedMs: number): boolean {
  if (elapsedMs < 1000) return false
  return wpm(correctChars, elapsedMs) <= MAX_CREDIBLE_WPM
}

export type TextLang = 'th' | 'en'
export type TextLength = 'short' | 'medium'

/**
 * คลังข้อความ
 *
 * ★★ เป็นประโยคทั่วไปที่แต่งเอง ไม่มีเนื้อหาที่มีลิขสิทธิ์ ตามข้อกำหนด
 *    ★ และเลี่ยงชื่อคน/องค์กรจริง เพราะข้อความพวกนี้จะถูกพิมพ์ซ้ำ
 *      โดยคนทั้งออฟฟิศ
 */
export const TEXTS: Record<TextLang, string[]> = {
  th: [
    'วันนี้อากาศดีมาก เหมาะกับการออกไปเดินเล่นที่สวนใกล้บ้าน',
    'กาแฟร้อนแก้วเล็กในตอนเช้าทำให้วันทั้งวันเริ่มต้นได้ดีขึ้น',
    'การอ่านหนังสือก่อนนอนช่วยให้หลับสบายกว่าการจ้องหน้าจอ',
    'ฝนตกหนักตั้งแต่เมื่อคืน ถนนหน้าออฟฟิศจึงมีน้ำขังเล็กน้อย',
    'เพื่อนร่วมงานชวนไปกินข้าวเที่ยงที่ร้านใหม่แถวตลาดหลังตึก',
    'การวางแผนงานล่วงหน้าหนึ่งสัปดาห์ช่วยลดความเร่งรีบได้มาก',
    'ต้นไม้ในห้องทำงานช่วยให้บรรยากาศดูสดชื่นขึ้นอย่างน่าประหลาด',
    'เสียงเพลงเบาๆ ระหว่างทำงานช่วยให้มีสมาธิกับงานตรงหน้ามากขึ้น',
    'การเดินขึ้นบันไดแทนลิฟต์วันละนิดเป็นการออกกำลังกายที่ง่ายที่สุด',
    'ขนมหวานหลังมื้อเที่ยงเป็นความสุขเล็กๆ ที่หลายคนรอคอยทุกวัน',
    'สมุดจดเล่มเล็กที่พกติดตัวช่วยไม่ให้ลืมเรื่องสำคัญระหว่างวัน',
    'การนอนให้ครบแปดชั่วโมงสำคัญกว่าการดื่มกาแฟเพิ่มอีกหนึ่งแก้ว',
    'แสงแดดยามเช้าช่วยปรับนาฬิกาในร่างกายให้ตื่นตัวได้ตามธรรมชาติ',
    'การจัดโต๊ะทำงานให้เป็นระเบียบทำให้หาของเจอเร็วขึ้นกว่าเดิมมาก',
    'น้ำเปล่าวันละแปดแก้วเป็นคำแนะนำที่ได้ยินบ่อยแต่ทำได้ยากจริง',
    'การเดินทางด้วยรถไฟฟ้าในชั่วโมงเร่งด่วนต้องเผื่อเวลาไว้เสมอ',
    'หนังสือเล่มหนาที่วางไว้ข้างเตียงยังอ่านไม่จบมาสามเดือนแล้ว',
    'การทักทายเพื่อนร่วมงานตอนเช้าทำให้บรรยากาศในทีมดีขึ้นมาก',
    'ร้านข้าวมันไก่เจ้าประจำปิดวันจันทร์ จึงต้องหาร้านอื่นแทน',
    'การเขียนสิ่งที่ต้องทำลงกระดาษช่วยให้สมองโล่งกว่าการจำไว้เอง',
    'แมวที่นอนอยู่หน้าร้านกาแฟกลายเป็นที่รู้จักของคนแถวนั้นไปแล้ว',
    'การประชุมที่มีวาระชัดเจนมักจบเร็วกว่าที่ทุกคนคาดไว้เสมอ',
    'ผลไม้ตามฤดูกาลมักมีราคาถูกกว่าและรสชาติดีกว่าช่วงนอกฤดู',
    'การพักสายตาจากหน้าจอทุกยี่สิบนาทีช่วยลดอาการตาล้าได้จริง',
    'เสียงฝนตกกระทบหลังคาตอนกลางคืนทำให้หลับสบายกว่าปกติมาก',
    'การเตรียมเสื้อผ้าไว้ตั้งแต่คืนก่อนช่วยประหยัดเวลาตอนเช้า',
    'ร้านหนังสือมือสองแถวนั้นมีหนังสือเก่าที่หาไม่ได้แล้วหลายเล่ม',
    'การปลูกผักสวนครัวในกระถางเล็กๆ ทำได้แม้อยู่ในคอนโดกลางเมือง',
    'กล่องข้าวที่เตรียมเองช่วยประหยัดเงินและควบคุมอาหารได้ดีกว่า',
    'การเดินเล่นหลังอาหารเย็นช่วยย่อยอาหารและได้คุยกับคนในบ้าน',
    'จดหมายที่เขียนด้วยลายมือยังให้ความรู้สึกต่างจากข้อความในแอป',
    'การเก็บของเข้าที่ทันทีหลังใช้เสร็จทำให้บ้านไม่รกโดยไม่ต้องจัด',
    'ต้นกล้าที่เพิ่งงอกต้องการแสงแดดอ่อนและน้ำในปริมาณพอเหมาะ',
    'การฟังเพลงที่ไม่มีเนื้อร้องช่วยให้ทำงานที่ต้องใช้สมาธิได้นานขึ้น',
    'ตลาดนัดวันเสาร์มีของกินแปลกใหม่ให้ลองทุกสัปดาห์ไม่ซ้ำกัน',
    'การตั้งนาฬิกาปลุกไว้ไกลจากเตียงทำให้ต้องลุกไปปิดและตื่นจริง',
    'หม้อหุงข้าวใบเก่าที่ใช้มาสิบปียังทำงานได้ดีเหมือนวันแรกที่ซื้อ',
    'การถ่ายรูปสิ่งเล็กๆ ระหว่างทางทำให้สังเกตเห็นอะไรมากขึ้นกว่าเดิม',
    'ร่มพับที่พกไว้ในกระเป๋ามักได้ใช้ในวันที่ไม่คิดว่าฝนจะตก',
    'การทำอาหารเองแม้เมนูง่ายๆ ก็ให้ความรู้สึกดีกว่าการสั่งมากิน',
    'เพลงเก่าที่ได้ยินโดยบังเอิญทำให้นึกถึงช่วงเวลาที่ผ่านมานานแล้ว',
    'การเดินสำรวจย่านที่ไม่เคยไปทำให้รู้จักเมืองที่อยู่มานานขึ้นอีก',
    'กระเป๋าใบเล็กที่ใส่ของจำเป็นพอดีทำให้เดินทางสะดวกกว่าใบใหญ่',
    'การรดน้ำต้นไม้ตอนเช้าดีกว่าตอนเที่ยงเพราะน้ำไม่ระเหยเร็วเกิน',
    'หนังสือที่อ่านจบแล้วส่งต่อให้เพื่อนดีกว่าเก็บไว้บนชั้นเฉยๆ',
    'การนั่งหลังตรงขณะทำงานช่วยลดอาการปวดคอและไหล่ได้มากทีเดียว',
    'ร้านก๋วยเตี๋ยวเล็กๆ ในซอยมักอร่อยกว่าร้านใหญ่ริมถนนใหญ่',
    'การวางโทรศัพท์ไว้อีกห้องตอนทำงานช่วยให้จดจ่อได้นานขึ้นจริง',
    'ลมเย็นในเดือนพฤศจิกายนทำให้การเดินกลับบ้านกลายเป็นเรื่องสนุก',
    'การขอบคุณคนที่ช่วยเหลือเราแม้เรื่องเล็กน้อยทำให้วันนั้นดีขึ้น',
  ],
  en: [
    'The morning light slipped through the curtains and filled the quiet room.',
    'A small notebook in your pocket is often better than a perfect memory.',
    'She walked to the corner shop for bread and came back with flowers.',
    'The rain stopped just long enough for everyone to reach the station.',
    'Good plans leave room for the things nobody thought to plan for.',
    'He learned to cook one dish well before trying anything complicated.',
    'The cat by the window has decided this chair belongs to him now.',
    'Reading before bed works better than scrolling through a bright screen.',
    'They met for lunch at the new place behind the market every Friday.',
    'A short walk after dinner helps more than an hour at the gym once.',
    'The old radio still works, which surprises everyone who sees it.',
    'Writing things down frees the mind from holding them all at once.',
    'Rooms with plants feel different, even when nothing else has changed.',
    'The bus was late, so she finished the chapter she had been saving.',
    'Clear agendas make meetings end sooner than anyone expects them to.',
    'Fruit in season tastes better and costs less than fruit out of it.',
    'He keeps a folding umbrella for days the forecast gets wrong.',
    'The second-hand bookshop has titles that nobody prints any more.',
    'Taking the stairs instead of the lift is the easiest exercise there is.',
    'Quiet music without words makes long tasks feel shorter than they are.',
    'A tidy desk means finding things without remembering where they went.',
    'The weekend market brings something new to try every single time.',
    'Setting the alarm across the room guarantees you will actually stand up.',
    'Photographs of small things teach you to notice more along the way.',
    'Letters written by hand still feel different from any message sent.',
    'Herbs grow well in small pots, even on a balcony in the city centre.',
    'Packing lunch saves money and makes the afternoon easier to manage.',
    'The rice cooker they bought ten years ago has never once failed.',
    'Resting your eyes every twenty minutes keeps the afternoon bearable.',
    'Walking through an unfamiliar street makes an old city feel new.',
    'Putting things away right after using them means never tidying up.',
    'A song you had forgotten can return an entire year to you at once.',
    'The noodle shop in the alley is better than the one on the main road.',
    'Leaving the phone in another room makes an hour of work feel longer.',
    'Sitting up straight costs nothing and saves your neck by evening.',
    'Cool wind in November turns the walk home into something to enjoy.',
    'Thanking someone for a small thing can change the shape of their day.',
    'Seedlings need gentle light and slightly less water than you think.',
    'Watering plants in the morning wastes less than watering at noon.',
    'Books you have finished are better passed on than kept on a shelf.',
    'A small bag that fits only what matters makes travel much simpler.',
    'Greeting your colleagues in the morning changes how the team feels.',
    'Eight glasses of water a day is advice everyone knows and few follow.',
    'The train at rush hour requires leaving earlier than seems necessary.',
    'Cooking something simple yourself beats ordering something elaborate.',
    'The heavy book beside the bed has been unfinished for three months.',
    'Sunlight early in the day sets your internal clock without effort.',
    'Dessert after lunch is a small thing many people quietly look forward to.',
    'Sleeping a full night matters more than one more cup of coffee.',
    'Preparing clothes the night before buys ten calm minutes each morning.',
  ],
}

/**
 * เลือกข้อความ
 *
 * ★★ rnd รับเข้ามาเพื่อให้ "ทุกคนในห้องได้ข้อความเดียวกัน" ทำได้
 *    ★ ห้องจะสุ่มเลขหนึ่งตัวแล้วแจกให้ทุกเครื่องใช้เลขเดียวกัน
 *      ★★ ถ้าแต่ละเครื่องสุ่มเอง จะได้คนละข้อความ แล้วการแข่งไม่มีความหมาย
 */
export function pickText(
  lang: TextLang,
  length: TextLength,
  rnd: () => number = Math.random,
): string {
  const pool = TEXTS[lang]
  const one = pool[Math.floor(rnd() * pool.length)] as string

  /*
   * ★ "สั้น" = หนึ่งประโยค · "กลาง" = ต่อกันจนยาวพอ
   *   ★★ ต่อประโยคจากคลังเดิม ไม่เขียนคลังที่สองสำหรับความยาวกลาง
   *      ซึ่งจะกลายเป็นสองที่ที่ต้องดูแลให้มีคุณภาพเท่ากัน
   */
  if (length === 'short') return one

  const second = pool[Math.floor(rnd() * pool.length)] as string
  const third = pool[Math.floor(rnd() * pool.length)] as string
  const joiner = lang === 'th' ? ' ' : ' '
  return [one, second, third].join(joiner)
}
