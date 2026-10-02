import { faceParams, type FaceParams, type Variant } from '@/lib/home/phantom-face'

export type { Variant }

/**
 * ร่างที่เดินผ่านหัวหน้าแรก — สามตน หน้าตนละ 30 แบบ
 *
 * ★★★ วาดด้วย SVG filter ไม่ใช่รูปทรงเรียบ ๆ
 *
 *     ผีที่วาดด้วยวงกลมกับเส้นโค้งเรียบ ๆ อ่านเป็นการ์ตูนทันทีไม่ว่าจะใส่สีอะไร
 *     ★ เพราะของจริงในธรรมชาติไม่มีขอบที่เรียบสม่ำเสมอ
 *     ★★ feTurbulence + feDisplacementMap บิดขอบทุกเส้นด้วยสัญญาณรบกวนแบบ
 *        fractal ซึ่งเป็นวิธีเดียวกับที่ใช้ทำควันและหมอกในงานกราฟิกจริง
 *
 * ★★★ ใบหน้าสร้างจาก "เงา" ไม่ใช่ "เส้น"
 *      ตาคือเบ้าตาที่มืดลึก ปากคือโพรงที่เปิดอยู่
 *      ★ สมองอ่านเงาเป็นโครงหน้าสามมิติ แต่อ่านเส้นเป็นภาพวาด
 *
 * ★★ สามตนเล่นคนละกลไกความกลัว ไม่ใช่ตัวเดียวย่อ-ขยาย
 *    · ไร้หน้าในฮู้ด — สมองหาใบหน้าในที่ที่ควรมีไม่เจอ
 *    · ผมยาวปิดครึ่งหน้า — ความไม่สมมาตรบังคับให้สมองเติมส่วนที่เหลือเอง
 *    · กะโหลก — ฟันกับโพรงจมูกบอกทันทีว่า "ไม่ใช่คน"
 *
 * ★ รายละเอียดของแต่ละแบบมาจาก lib/home/phantom-face.ts — ที่นี่มีแต่การวาด
 */

const ids = (v: Variant, scope: string) => ({
  mist: `ph-${scope}-${v}-mist`,
  face: `ph-${scope}-${v}-face`,
  body: `ph-${scope}-${v}-body`,
  skin: `ph-${scope}-${v}-skin`,
  socket: `ph-${scope}-${v}-socket`,
  iris: `ph-${scope}-${v}-iris`,
  shroud: `ph-${scope}-${v}-shroud`,
  hair: `ph-${scope}-${v}-hair`,
  blood: `ph-${scope}-${v}-blood`,
  void: `ph-${scope}-${v}-void`,
})

type Ids = ReturnType<typeof ids>

/*
 * ★ ผีที่เดินผ่านใช้แบบตายตัว ไม่สุ่ม
 *   ★★ มันอยู่บนจอเป็นนาที ถ้าหน้าเปลี่ยนระหว่างเดินคนจะจับได้ว่าเป็นของปลอม
 *      ส่วนหน้าจู่โจมอยู่แค่ 1 วินาที จึงสุ่มได้เต็มที่
 */
const WALKING: Record<Variant, number> = { hooded: 3, hair: 11, gaunt: 22 }

export function Phantoms() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Phantom variant="hooded" />
      <Phantom variant="hair" />
      <Phantom variant="gaunt" />
    </div>
  )
}

function Phantom({ variant }: { variant: Variant }) {
  const id = ids(variant, 'walk')
  const p = faceParams(variant, WALKING[variant])

  return (
    <div className={`phantom phantom--${variant}`}>
      <div className="phantom-gait">
        {/* ★ ชั้นบิดแสงข้างหลัง ทำให้พื้นหลังหักเหตามตัวที่เดินผ่าน */}
        <span className="phantom-warp" />

        <svg viewBox="0 0 220 420" className="phantom-svg" xmlns="http://www.w3.org/2000/svg">
          <Defs id={id} p={p} animated />
          <Body variant={variant} id={id} />
          <Face variant={variant} id={id} p={p} />
        </svg>
      </div>
    </div>
  )
}

/* ═══ นิยามสี/ฟิลเตอร์ ═══════════════════════════════════════════════════ */

function Defs({
  id,
  p,
  animated = false,
  bright = false,
}: {
  id: Ids
  p: FaceParams
  animated?: boolean
  bright?: boolean
}) {
  return (
    <defs>
      <filter id={id.mist} x="-35%" y="-20%" width="170%" height="150%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.013 0.022"
          numOctaves={3}
          seed={p.seed}
          result="noise"
        >
          {/* ★ ขยับความถี่ช้ามาก — เร็วกว่านี้จะกลายเป็นน้ำเดือด ไม่ใช่หมอกลอย */}
          {animated ? (
            <animate
              attributeName="baseFrequency"
              dur="18s"
              values="0.013 0.022; 0.017 0.016; 0.013 0.022"
              repeatCount="indefinite"
            />
          ) : null}
        </feTurbulence>
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale={bright ? Math.max(4, p.distort - 1) : p.distort + 10}
          xChannelSelector="R"
          yChannelSelector="G"
        />
        <feGaussianBlur stdDeviation={bright ? 0.7 : 1.6} />
      </filter>

      {/* ★ ใบหน้าใช้หมอกอ่อนกว่ามาก — บิดแรงเท่าชายผ้าแล้วหน้าจะละลาย */}
      <filter id={id.face} x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={p.seed + 5} result="fn" />
        <feDisplacementMap in="SourceGraphic" in2="fn" scale={bright ? 2 : p.distort / 2 + 1} />
        <feGaussianBlur stdDeviation={bright ? 0.35 : 0.9} />
      </filter>

      <radialGradient id={id.body} cx="50%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#dfe7f2" stopOpacity="0.55" />
        <stop offset="45%" stopColor="#c3cfe0" stopOpacity="0.30" />
        <stop offset="100%" stopColor="#8fa0b8" stopOpacity="0" />
      </radialGradient>

      {/* ★ สีผิวมาจากพารามิเตอร์ — ซีดฟ้า/ซีดเหลือง/ซีดเขียว/เลือดคั่ง/เทาเถ้า */}
      <radialGradient id={id.skin} cx="50%" cy="36%" r="58%">
        <stop offset="0%" stopColor={p.skin[0]} stopOpacity={bright ? 0.97 : 0.8} />
        <stop offset="60%" stopColor={p.skin[1]} stopOpacity={bright ? 0.75 : 0.44} />
        <stop offset="100%" stopColor={p.skin[1]} stopOpacity="0.06" />
      </radialGradient>

      <radialGradient id={id.socket} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#000000" stopOpacity={bright ? 1 : 0.93} />
        <stop offset="58%" stopColor="#04060c" stopOpacity={bright ? 0.82 : 0.62} />
        <stop offset="100%" stopColor="#04060c" stopOpacity="0" />
      </radialGradient>

      <radialGradient id={id.iris} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={bright ? 1 : 0.95} />
        <stop offset="100%" stopColor="#a9caff" stopOpacity="0" />
      </radialGradient>

      <linearGradient id={id.shroud} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#cfd9e8" stopOpacity={bright ? 0.42 : 0.28} />
        <stop offset="55%" stopColor="#aebbcf" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#8fa0b8" stopOpacity="0" />
      </linearGradient>

      <linearGradient id={id.hair} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#05070b" stopOpacity={bright ? 0.95 : 0.74} />
        <stop offset="65%" stopColor="#05070b" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#05070b" stopOpacity="0" />
      </linearGradient>

      {/* ★ ความมืดในฮู้ด — ไม่ใช่สีดำทึบ แต่เป็นความลึกที่ไล่ระดับ */}
      <radialGradient id={id.void} cx="50%" cy="46%" r="58%">
        <stop offset="0%" stopColor="#000000" stopOpacity={bright ? 1 : 0.96} />
        <stop offset="70%" stopColor="#02040a" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#05080f" stopOpacity="0" />
      </radialGradient>

      <linearGradient id={id.blood} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor={bright ? '#5c0508' : '#4a0407'} stopOpacity="1" />
        <stop offset="32%" stopColor={bright ? '#a60f16' : '#8d0d12'} stopOpacity="0.97" />
        <stop offset="100%" stopColor={bright ? '#e01e26' : '#c2161d'} stopOpacity="0.9" />
      </linearGradient>
    </defs>
  )
}

/* ═══ ลำตัว ═══════════════════════════════════════════════════════════════ */

function Body({ variant, id }: { variant: Variant; id: Ids }) {
  if (variant === 'hooded') {
    return (
      <g filter={`url(#${id.mist})`}>
        <path
          d="M110 52c33 0 58 26 58 60 0 26-9 44-9 70 0 34 14 52 14 88 0 42-27 66-63 66s-63-24-63-66c0-36 14-54 14-88 0-26-9-44-9-70 0-34 25-60 58-60z"
          fill={`url(#${id.shroud})`}
        />
        {/* ★ ชายผ้าเป็นคลื่นไม่เท่ากัน — ผ้าจริงไม่ตกเป็นขอบตรง */}
        <path
          d="M47 300c10 18 6 40 14 58 7 16 24 22 24 40-14 6-30 2-41-10-14-15-18-40-14-62 2-12 8-20 17-26z"
          fill={`url(#${id.shroud})`}
          opacity="0.75"
        />
        <path
          d="M173 300c-10 18-6 40-14 58-7 16-24 22-24 40 14 6 30 2 41-10 14-15 18-40 14-62-2-12-8-20-17-26z"
          fill={`url(#${id.shroud})`}
          opacity="0.75"
        />
        <ellipse cx="110" cy="150" rx="66" ry="86" fill={`url(#${id.body})`} />
      </g>
    )
  }

  if (variant === 'hair') {
    return (
      <g filter={`url(#${id.mist})`}>
        <path
          d="M110 96c28 0 46 20 50 48 5 34-6 60-6 96 0 44-18 74-44 74s-44-30-44-74c0-36-11-62-6-96 4-28 22-48 50-48z"
          fill={`url(#${id.shroud})`}
        />
        <ellipse cx="110" cy="190" rx="52" ry="92" fill={`url(#${id.body})`} opacity="0.8" />
        {/* ★ ผมยาวเป็นก้อนเงา ไม่ใช่เส้นเดี่ยว ๆ — ผมที่วาดเป็นเส้นอ่านเป็นลายการ์ตูน */}
        <path
          d="M72 86c-10 34-14 70-10 108 3 26 8 44 14 58-14-8-24-26-30-52-8-36-4-84 8-108 4-8 10-8 18-6z"
          fill={`url(#${id.hair})`}
        />
        <path
          d="M148 86c10 34 14 70 10 108-3 26-8 44-14 58 14-8 24-26 30-52 8-36 4-84-8-108-4-8-10-8-18-6z"
          fill={`url(#${id.hair})`}
        />
      </g>
    )
  }

  return (
    <g filter={`url(#${id.mist})`}>
      <path
        d="M110 74c22 0 36 16 38 40 3 30-8 48-8 78 0 40 16 60 16 100 0 36-20 58-46 58s-46-22-46-58c0-40 16-60 16-100 0-30-11-48-8-78 2-24 16-40 38-40z"
        fill={`url(#${id.shroud})`}
        opacity="0.85"
      />
      <path d="M64 320c6 28 2 56 10 76-16-10-24-34-24-56 0-10 6-18 14-20z" fill={`url(#${id.shroud})`} opacity="0.6" />
      <path d="M156 320c-6 28-2 56-10 76 16-10 24-34 24-56 0-10-6-18-14-20z" fill={`url(#${id.shroud})`} opacity="0.6" />
      <ellipse cx="110" cy="170" rx="46" ry="80" fill={`url(#${id.body})`} opacity="0.7" />
    </g>
  )
}

/* ═══ ใบหน้า ═══════════════════════════════════════════════════════════════ */

/**
 * ★★ ตัววาดเดียวกินทั้ง 90 แบบ
 *
 *    ส่วนที่ต่างกันคือ "ค่า" (ขนาด รูปทรง สี) ไม่ใช่ "โค้ด"
 *    ★ ถ้าแยกโค้ดตามแบบ วันที่อยากให้ทุกหน้ามีรอยแผลเพิ่มจะต้องแก้ 90 ที่
 *    ★★ ส่วนเอกลักษณ์ของแต่ละตน (ฮู้ด · ผม · กระดูก) ยังแยกเป็นโค้ดอยู่
 *       เพราะมันคือ "คนละสิ่ง" ไม่ใช่ "ค่าที่ต่างกัน"
 */
function Face({ variant, id, p }: { variant: Variant; id: Ids; p: FaceParams }) {
  const cx = 110
  const isSkull = variant === 'gaunt'
  /* ★ ตนแรกไม่มีผิวหน้าให้เห็น — ความมืดในฮู้ดกลืนไปหมด */
  const hidden = variant === 'hooded'

  return (
    <>
      <g filter={`url(#${id.face})`}>
        {!hidden ? <path d={headPath(p, isSkull)} fill={`url(#${id.skin})`} /> : null}

        {/* เงาแก้มตอบ/ขมับ — ทำให้หน้ามีกระดูกอยู่ข้างใต้ */}
        {!hidden ? (
          <>
            <ellipse
              cx={cx - p.headW * 0.66}
              cy={p.eyeY + 18}
              rx={p.headW * 0.28}
              ry={p.headH * 0.4}
              fill="#0b1119"
              opacity={isSkull ? 0.38 : 0.3}
            />
            <ellipse
              cx={cx + p.headW * 0.66}
              cy={p.eyeY + 18}
              rx={p.headW * 0.28}
              ry={p.headH * 0.4}
              fill="#0b1119"
              opacity={isSkull ? 0.38 : 0.3}
            />
          </>
        ) : null}

        {/* ★ รอยแตกบนหน้าผาก — มีแค่บางแบบ */}
        {p.cracks && !hidden ? (
          <path
            d={`M${cx - 14} ${p.eyeY - 26}l6 10-4 8 7 9M${cx + 10} ${p.eyeY - 30}l-4 12 6 7`}
            stroke="#0b1119"
            strokeOpacity="0.5"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}

        {/* ★ เส้นเลือดใต้ผิว — จางมาก เห็นชัดเฉพาะตอนหน้าจู่โจม */}
        {p.veins && !hidden ? (
          <path
            d={`M${cx - 20} ${p.eyeY + 8}c-6 6-8 12-7 20M${cx + 18} ${p.eyeY + 10}c6 5 9 12 8 20`}
            stroke="#3a1420"
            strokeOpacity="0.35"
            strokeWidth="1.2"
            fill="none"
          />
        ) : null}
      </g>

      {/* ── สิ่งที่คลุมหัว (เอกลักษณ์ของแต่ละตน) ─────────────────── */}
      {variant === 'hooded' ? (
        <g filter={`url(#${id.mist})`}>
          <path
            d="M110 30c36 0 62 30 62 68 0 26-10 46-22 62-6-42-18-66-40-66s-34 24-40 66c-12-16-22-36-22-62 0-38 26-68 62-68z"
            fill={`url(#${id.shroud})`}
          />
          <ellipse cx={cx} cy={p.eyeY} rx={p.headW + 2} ry={p.headH * 0.92} fill={`url(#${id.void})`} />
        </g>
      ) : null}

      {variant === 'hair' ? (
        /*
         * ★★★ ผมต้อง "กรอบหน้า" ไม่ใช่ "คลุมหน้า"
         *
         *     รอบแรกวาดผมเป็นก้อนเดียวคลุมทั้งหัว ★ ผลคือหน้ามืดจนไม่เห็นอะไรเลย
         *     ตรวจเจอตอนวาง 30 แบบเรียงกันดู — แถวของตนนี้ดำทั้งแถว
         *     ★★ แยกเป็นม่านซ้าย/ขวา + ฝาครอบด้านบน แล้วเว้นกลางหน้าไว้
         *        ★ ม่านขวากว้างกว่าซ้ายและกินเข้ามาถึงตา — ความไม่สมมาตรที่ตั้งใจ
         */
        <g filter={`url(#${id.mist})`}>
          {/* ฝาครอบกะโหลก */}
          <path
            d="M110 40c28 0 47 20 49 48 1 12 0 22-2 32-6-26-12-42-20-50-8-8-17-11-27-11s-19 3-27 11c-8 8-14 24-20 50-2-10-3-20-2-32 2-28 21-48 49-48z"
            fill={`url(#${id.hair})`}
          />
          {/* ม่านซ้าย — บางกว่า เปิดให้เห็นตาซ้ายเต็ม */}
          <path
            d="M76 66c-8 26-10 56-6 86 3 22 8 40 14 54-12-8-21-26-26-50-7-32-4-72 6-92 3-6 8-7 12 2z"
            fill={`url(#${id.hair})`}
          />
          {/* ★ ม่านขวา — หนากว่าและพาดเข้ามาบังตาขวาบางส่วน */}
          <path
            d="M138 62c12 24 16 58 12 90-3 24-9 44-17 58 4-30 6-58 3-82-2-18-6-34-11-44-4-8-2-18 4-24 3-3 6-2 9 2z"
            fill={`url(#${id.hair})`}
          />
          <path
            d="M126 70c7 14 10 30 9 46-3-10-8-20-14-26-3-8-1-16 5-20z"
            fill={`url(#${id.hair})`}
            opacity="0.9"
          />
        </g>
      ) : null}

      {/* ── ตา จมูก ปาก เลือด ──────────────────────────────────── */}
      <g filter={`url(#${id.face})`}>
        <Eye id={id} p={p} side={-1} skull={isSkull} />
        <Eye id={id} p={p} side={1} skull={isSkull} />

        {isSkull ? (
          /* โพรงจมูกทรงหัวใจกลับหัว — จุดที่บอกทันทีว่าไม่ใช่คน */
          <path
            d={`M${cx} ${p.eyeY + 14}c4 6 7 12 7 17 0 4-3 7-7 7s-7-3-7-7c0-5 3-11 7-17z`}
            fill={`url(#${id.socket})`}
          />
        ) : !hidden ? (
          <path
            d={`M${cx} ${p.eyeY + 4}c-1.5 11-3 17-6 22 3 2 7 2 10 1`}
            stroke="#0b1119"
            strokeOpacity="0.24"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}

        <Mouth id={id} p={p} />

        {/* ★ กรามจาง ๆ ในความมืด บอกว่ามีอะไรอยู่ในฮู้ดจริง */}
        {hidden ? (
          <path
            d={`M${cx - 22} ${p.mouthY + 4}c6 10 14 15 22 15s16-5 22-15`}
            stroke="#c9d6e8"
            strokeOpacity="0.16"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}

        <Blood id={id} p={p} />
      </g>
    </>
  )
}

/**
 * โครงกะโหลก
 *
 * ★ กะโหลกมีเหลี่ยม ส่วนหน้าที่ยังมีเนื้อมีเส้นโค้ง
 *   ★★ สร้างจากพารามิเตอร์ ไม่ใช่ path ตายตัว — ความกว้าง/ความสูง/คางที่หลุด
 *      จึงเปลี่ยนได้จริงในแต่ละแบบ ไม่ใช่แค่ย่อขยายรูปเดิม
 */
function headPath(p: FaceParams, skull: boolean): string {
  const cx = 110
  const top = p.eyeY - p.headH
  const w = p.headW
  const h = p.headH
  /* ระยะจากแนวตาลงไปถึงปลายคาง */
  const chin = h * (p.jawDrop ? 1.24 : 0.98)

  /*
   * ★★★ ห้ามเติมเครื่องหมายลบหน้าค่าที่อาจติดลบอยู่แล้ว
   *
   *     เดิมเขียน `-${chin - h * 0.88 - h * 0.3}` ★ พอวงเล็บให้ค่าติดลบ
   *     ผลลัพธ์คือ "--9.8" ซึ่ง SVG อ่านไม่ออก แล้วทิ้ง path ทั้งเส้น
   *     ★★ เบราว์เซอร์ไม่ได้พังและไม่มี error บนหน้า — มันแค่ไม่วาดหัวผีให้
   *        เจอเพราะไปอ่าน console ไม่ใช่เพราะภาพผิด (ผีมีหมอกบังอยู่แล้ว)
   *
   * ★ ทางแก้: คำนวณเป็นตัวเลขให้เสร็จ แล้วปล่อยให้ตัวเลขพาเครื่องหมายของมันเอง
   */
  const n = (v: number) => (Math.round(v * 100) / 100).toString()

  if (skull) {
    const shoulder = h * 0.86
    const cheek = h * 0.58
    const jaw = chin - shoulder - cheek

    return [
      `M${n(cx)} ${n(top)}`,
      `c${n(w * 0.62)} 0 ${n(w)} ${n(h * 0.4)} ${n(w)} ${n(shoulder)}`,
      `c0 ${n(h * 0.28)} ${n(-w * 0.18)} ${n(cheek * 0.8)} ${n(-w * 0.3)} ${n(cheek)}`,
      `c${n(-w * 0.04)} ${n(jaw * 0.5)} ${n(-w * 0.26)} ${n(jaw)} ${n(-w * 0.7)} ${n(jaw)}`,
      `c${n(-w * 0.44)} 0 ${n(-w * 0.66)} ${n(-jaw * 0.5)} ${n(-w * 0.7)} ${n(-jaw)}`,
      `c${n(-w * 0.12)} ${n(-cheek * 0.3)} ${n(-w * 0.3)} ${n(-cheek * 0.7)} ${n(-w * 0.3)} ${n(-cheek)}`,
      `c0 ${n(-h * 0.46)} ${n(w * 0.38)} ${n(-shoulder)} ${n(w)} ${n(-shoulder)}`,
      'z',
    ].join(' ')
  }

  const widest = h * 0.88
  const drop = chin - widest

  return [
    `M${n(cx)} ${n(top)}`,
    `c${n(w * 0.66)} 0 ${n(w)} ${n(h * 0.44)} ${n(w)} ${n(widest)}`,
    `c0 ${n(h * 0.3)} ${n(-w * 0.34)} ${n(drop)} ${n(-w)} ${n(drop)}`,
    `c${n(-w * 0.66)} 0 ${n(-w)} ${n(-drop)} ${n(-w)} ${n(-drop - h * 0.3)}`,
    `c0 ${n(-h * 0.44)} ${n(w * 0.34)} ${n(-widest)} ${n(w)} ${n(-widest)}`,
    'z',
  ].join(' ')
}

function Eye({ id, p, side, skull }: { id: Ids; p: FaceParams; side: -1 | 1; skull: boolean }) {
  const cx = 110 + side * p.eyeGap * 2.1
  const cy = p.eyeY
  const tilt = side * p.eyeTilt

  return (
    <g transform={`rotate(${tilt} ${cx} ${cy})`}>
      {skull ? (
        /* ★ เบ้าตาเหลี่ยม — กะโหลกไม่มีเนื้อมาทำให้ขอบมน */
        <path
          d={[
            `M${cx - p.eyeW} ${cy - p.eyeH * 0.5}`,
            `c${p.eyeW * 0.7} -${p.eyeH * 0.7} ${p.eyeW * 1.5} -${p.eyeH * 0.6} ${p.eyeW * 2} ${p.eyeH * 0.2}`,
            `c${p.eyeH * 0.3} ${p.eyeH * 1.1} -${p.eyeW * 0.6} ${p.eyeH * 1.7} -${p.eyeW * 1.1} ${p.eyeH * 1.6}`,
            `c-${p.eyeW * 0.8} -${p.eyeH * 0.1} -${p.eyeW * 1.1} -${p.eyeH * 0.9} -${p.eyeW * 0.9} -${p.eyeH * 1.8}`,
            'z',
          ].join(' ')}
          fill={`url(#${id.socket})`}
        />
      ) : (
        <ellipse cx={cx} cy={cy} rx={p.eyeW} ry={p.eyeH} fill={`url(#${id.socket})`} />
      )}

      {/* ★ บางแบบไม่มีประกายเลย — เบ้าโบ๋สนิทน่ากลัวคนละแบบกับตาที่เรืองแสง */}
      {p.glow > 0 ? (
        <ellipse cx={cx} cy={cy + 1} rx={p.glow} ry={p.glow * 0.88} fill={`url(#${id.iris})`}>
          <animate attributeName="opacity" dur="5s" values="0.95; 0.35; 0.95" repeatCount="indefinite" />
        </ellipse>
      ) : null}
    </g>
  )
}

function Mouth({ id, p }: { id: Ids; p: FaceParams }) {
  const cx = 110
  const y = p.mouthY

  if (p.mouth === 'teeth') {
    const w = Math.max(30, p.mouthW * 3.2)
    const h = Math.max(12, p.mouthH)
    const count = 6
    const step = (w - 4) / count

    return (
      <g>
        <rect x={cx - w / 2} y={y - h / 2} width={w} height={h} rx={3} fill={`url(#${id.socket})`} />
        {/* ★★ วางซี่สว่างทับช่องมืด ไม่ใช่ขีดเส้นคั่น — เส้นคั่นอ่านเป็นภาพวาด */}
        {Array.from({ length: count }, (_, i) => (
          <rect
            key={i}
            x={cx - w / 2 + 2 + i * step}
            y={y - h / 2 + 1}
            width={step - 1.6}
            height={i === 0 || i === count - 1 ? h - 4 : h - 2}
            rx={1.4}
            fill="#e8eefb"
            opacity={0.72}
          />
        ))}
        <rect x={cx - w / 2} y={y + h / 2 - 2} width={w} height={4} rx={2} fill="#05070c" opacity="0.6" />
      </g>
    )
  }

  if (p.mouth === 'stitch') {
    const w = Math.max(16, p.mouthW * 2.2)
    return (
      <g>
        <rect x={cx - w / 2} y={y - 2} width={w} height={4} rx={2} fill={`url(#${id.socket})`} />
        {/* ★ ปากที่ถูกเย็บ — ไหมขวางสี่เส้น เอียงสลับข้างไม่เท่ากัน */}
        {[-0.62, -0.2, 0.22, 0.6].map((t, i) => (
          <path
            key={i}
            d={`M${cx + w * t} ${y - 6}l${i % 2 ? 4 : -4} 12`}
            stroke="#d7dfec"
            strokeOpacity="0.55"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ))}
      </g>
    )
  }

  if (p.mouth === 'slit') {
    const w = Math.max(12, p.mouthW * 1.8)
    return <rect x={cx - w / 2} y={y - 1.5} width={w} height={3} rx={1.5} fill={`url(#${id.socket})`} />
  }

  if (p.mouth === 'gape') {
    const rx = Math.max(10, p.mouthW * 1.5)
    const ry = Math.max(12, p.mouthH * 1.2)
    return (
      <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={`url(#${id.socket})`}>
        <animate
          attributeName="ry"
          dur="7s"
          values={`${ry}; ${ry * 0.6}; ${ry * 1.15}; ${ry}`}
          repeatCount="indefinite"
        />
      </ellipse>
    )
  }

  /* void กับ scream ต่างกันที่สัดส่วน — scream สูงกว่ากว้างมาก */
  const rx = p.mouth === 'scream' ? Math.max(6, p.mouthW * 0.7) : Math.max(6, p.mouthW * 0.9)
  const ry = p.mouth === 'scream' ? Math.max(12, p.mouthH * 1.3) : Math.max(7, p.mouthH * 0.8)

  return (
    <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={`url(#${id.socket})`}>
      <animate
        attributeName="ry"
        dur="9s"
        values={`${ry}; ${ry * 0.65}; ${ry * 1.12}; ${ry}`}
        repeatCount="indefinite"
      />
    </ellipse>
  )
}

/**
 * เลือด
 *
 * ★★★ "ไหล" ไม่ใช่ "มีคราบ"
 *
 *     คราบเลือดที่วาดไว้นิ่ง ๆ อ่านเป็นเมกอัพ ★ สิ่งที่ทำให้สยองคือการเห็นมัน
 *     ยาวขึ้นต่อหน้า — สมองตีความว่าแผลยังเปิดอยู่ ไม่ใช่รอยเก่า
 *
 *     ★★ ใช้ stroke-dashoffset วิ่งจากความยาวเต็มไปหา 0 ซึ่งเป็นวิธี "ลากเส้น"
 *        ที่เบราว์เซอร์วาดได้ลื่นที่สุด (ไม่แตะเลย์เอาต์เลย)
 *        ★ ทางเลือกคือ animate ความสูงของ mask ซึ่งบังคับให้คำนวณ filter ใหม่
 *          ทุกเฟรม — แพงกว่ามากเมื่ออยู่ใต้ feTurbulence
 */
function Blood({ id, p }: { id: Ids; p: FaceParams }) {
  if (p.bloodFrom === 'none' || p.bloodAmount === 0) return null

  const cx = 110
  const ex = p.eyeGap * 2.1
  const streaks: { d: string; w: number; delay: string }[] = []
  const drops: { cx: number; from: number; to: number; r: number; dur: string; delay: string }[] = []

  const wantEyes = p.bloodFrom === 'eyes' || p.bloodFrom === 'all'
  const wantMouth = p.bloodFrom === 'mouth' || p.bloodFrom === 'all'
  const wantNose = p.bloodFrom === 'nose' || p.bloodFrom === 'all'
  const len = 18 + p.bloodAmount * 12

  if (wantEyes) {
    streaks.push({
      d: `M${cx - ex} ${p.eyeY + p.eyeH}c-1 ${len * 0.5} 0 ${len * 0.8} 2 ${len}`,
      w: 2.6 + p.bloodAmount * 0.5,
      delay: '0s',
    })
    streaks.push({
      d: `M${cx + ex} ${p.eyeY + p.eyeH}c2 ${len * 0.45} 1 ${len * 0.7} -1 ${len * 0.9}`,
      w: 2.2 + p.bloodAmount * 0.4,
      delay: '1.1s',
    })
    drops.push({
      cx: cx - ex + 2,
      from: p.eyeY + p.eyeH + len,
      to: p.eyeY + p.eyeH + len + 46,
      r: 2.2,
      dur: '5s',
      delay: '2.2s',
    })
  }

  if (wantNose) {
    streaks.push({ d: `M${cx - 4} ${p.eyeY + 28}c-1 ${len * 0.4} -1 ${len * 0.6} 0 ${len * 0.8}`, w: 2.2, delay: '0.6s' })
    streaks.push({ d: `M${cx + 4} ${p.eyeY + 28}c1 ${len * 0.35} 1 ${len * 0.55} 0 ${len * 0.75}`, w: 2, delay: '1.8s' })
  }

  if (wantMouth) {
    streaks.push({
      d: `M${cx - 6} ${p.mouthY + 6}c-2 ${len * 0.5} -2 ${len * 0.8} -1 ${len}`,
      w: 2.8 + p.bloodAmount * 0.4,
      delay: '1.4s',
    })
    streaks.push({ d: `M${cx + 7} ${p.mouthY + 6}c2 ${len * 0.4} 3 ${len * 0.7} 2 ${len * 0.9}`, w: 2.4, delay: '2.6s' })
    drops.push({
      cx: cx - 7,
      from: p.mouthY + 6 + len,
      to: p.mouthY + 6 + len + 44,
      r: 2.4,
      dur: '5.6s',
      delay: '3.1s',
    })
  }

  return (
    <g>
      {streaks.map((st, i) => (
        <path
          key={i}
          d={st.d}
          stroke={`url(#${id.blood})`}
          strokeWidth={st.w}
          strokeLinecap="round"
          fill="none"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            dur={`${5 + p.bloodAmount}s`}
            begin={st.delay}
            values="100; 0; 0"
            keyTimes="0; 0.55; 1"
            repeatCount="indefinite"
          />
        </path>
      ))}

      {/* ★ หยดที่ร่วงลงมาเป็นก้อนแยก ตกไม่พร้อมกัน — ของเหลวจริงไม่หยดเป็นจังหวะเครื่องจักร */}
      {drops.map((dp, i) => (
        <ellipse key={i} cx={dp.cx} cy={dp.from} rx={dp.r} ry={dp.r * 1.35} fill={`url(#${id.blood})`} opacity="0">
          <animate attributeName="cy" dur={dp.dur} begin={dp.delay} values={`${dp.from}; ${dp.to}`} repeatCount="indefinite" />
          <animate
            attributeName="opacity"
            dur={dp.dur}
            begin={dp.delay}
            values="0; 0.95; 0.95; 0"
            keyTimes="0; 0.12; 0.75; 1"
            repeatCount="indefinite"
          />
        </ellipse>
      ))}
    </g>
  )
}
