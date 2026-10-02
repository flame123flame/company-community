'use client'

import { useEffect, useId, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { parseLatLngFromMapUrl } from '@/lib/office/geo'

/**
 * เลือกพิกัดด้วยการลากหมุดบนแผนที่ หรือวางลิงก์ Google Maps
 *
 * ★★★ ใช้ Leaflet ตรง ๆ ไม่ผ่าน react-leaflet
 *
 *     react-leaflet เป็นแค่ตัวห่อให้เขียนเป็น JSX ★ แลกมากับการที่มันต้อง
 *     ตามเวอร์ชัน React ให้ทัน และมีปัญหากับ SSR ของ App Router เป็นประจำ
 *     ★★ สิ่งที่เราต้องการมีอย่างเดียวคือ "แผนที่หนึ่งอันกับหมุดหนึ่งตัว"
 *        ซึ่งเป็นโค้ด 20 บรรทัดใน useEffect — ไม่คุ้มกับ dependency หนึ่งตัว
 *
 * ★★ โหลด leaflet ด้วย dynamic import ข้างใน effect
 *    ★ ไฟล์นี้เป็น client component ก็จริง แต่ Next ยัง render มันบน server
 *      รอบแรกเพื่อสร้าง HTML ★★ leaflet แตะ window ตั้งแต่ตอน import
 *      จึงต้องไม่ถูก import ที่ระดับบนสุดของโมดูล
 */
export function MapPicker({
  lat,
  lng,
  onChange,
  /** จุดเริ่มต้นเมื่อยังไม่มีพิกัด — ข้อกำหนดบอกให้เริ่มที่ตำแหน่งออฟฟิศ */
  fallbackLat,
  fallbackLng,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
  fallbackLat?: number | null
  fallbackLng?: number | null
}) {
  const ot = useOt()
  const id = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<{ setLatLng: (ll: [number, number]) => void } | null>(null)
  const mapRef = useRef<{ setView: (ll: [number, number], z?: number) => void; remove: () => void } | null>(null)
  const [urlText, setUrlText] = useState('')
  const [urlNote, setUrlNote] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  /* ★ onChange เปลี่ยนตัวตนทุก render ของ parent — เก็บไว้ใน ref
       ไม่งั้น effect จะรื้อแผนที่ทิ้งแล้วสร้างใหม่ทุกครั้งที่พ่อ render */
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let dead = false
    let map: import('leaflet').Map | null = null

    void (async () => {
      const L = (await import('leaflet')).default
      if (dead || !boxRef.current) return

      const start: [number, number] = [
        lat ?? fallbackLat ?? 13.7563,
        lng ?? fallbackLng ?? 100.5018,
      ]

      map = L.map(boxRef.current, { attributionControl: true }).setView(start, lat != null ? 17 : 14)

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map)

      /*
       * ★★ ใช้ divIcon ไม่ใช่หมุดรูปภาพมาตรฐานของ Leaflet
       *    ★ หมุดมาตรฐานอ้างไฟล์ png ด้วย path สัมพัทธ์ ซึ่งพังกับ bundler
       *      ทุกตัวจนต้องเขียนโค้ดแก้ path ★★ divIcon เป็น HTML ธรรมดา
       *      จึงใช้ theme token ได้ และไม่มีไฟล์ให้หาไม่เจอ
       */
      const icon = L.divIcon({
        className: '',
        html:
          '<span style="display:block;width:22px;height:22px;border-radius:9999px;' +
          'background:var(--color-accent);border:3px solid var(--color-page);' +
          'box-shadow:0 2px 10px rgba(0,0,0,.4)"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })

      const marker = L.marker(start, { draggable: true, icon }).addTo(map)
      markerRef.current = marker as unknown as { setLatLng: (ll: [number, number]) => void }
      mapRef.current = map as unknown as {
        setView: (ll: [number, number], z?: number) => void
        remove: () => void
      }

      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onChangeRef.current(round6(p.lat), round6(p.lng))
      })

      /* ★ แตะที่แผนที่ก็ย้ายหมุดได้ — บนมือถือการลากหมุดเล็ก ๆ ยากกว่าแตะ */
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker.setLatLng(e.latlng)
        onChangeRef.current(round6(e.latlng.lat), round6(e.latlng.lng))
      })

      setReady(true)
    })()

    return () => {
      dead = true
      map?.remove()
      markerRef.current = null
      mapRef.current = null
    }
    /* ★ ตั้งใจให้ทำงานครั้งเดียว — การย้ายหมุดตามค่าที่เปลี่ยนทำในอีก effect
         ★★ ถ้าใส่ lat/lng ใน deps แผนที่จะถูกสร้างใหม่ทุกครั้งที่ลากหมุด
            ซึ่งทำให้มันกระพริบและซูมกลับไปจุดเริ่มต้น */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ★ ค่าถูกเปลี่ยนจากข้างนอก (เช่นวางลิงก์) → ย้ายหมุดและเลื่อนแผนที่ตาม */
  useEffect(() => {
    if (!ready || lat == null || lng == null) return
    markerRef.current?.setLatLng([lat, lng])
    mapRef.current?.setView([lat, lng], 17)
  }, [ready, lat, lng])

  function applyUrl() {
    const hit = parseLatLngFromMapUrl(urlText.trim())
    if (!hit) {
      /* ★ ดึงไม่ได้ = บอกให้ลากหมุดแทน ตามข้อกำหนด ไม่ใช่ขึ้น error เฉย ๆ */
      setUrlNote(ot('food.geo.urlFailed'))
      return
    }
    setUrlNote(null)
    onChange(hit.lat, hit.lng)
  }

  return (
    <div>
      <div
        ref={boxRef}
        id={id}
        /* ★ ต้องมีความสูงจริง — Leaflet วาดลงกล่องที่สูง 0 แล้วไม่มีอะไรขึ้น
             และไม่มี error ด้วย ซึ่งเป็นอาการเดียวกับ QR ที่เคยยุบเป็นจุดขาว */
        className="h-64 w-full overflow-hidden rounded-xl border border-line"
      />

      <p className="mt-2 text-xs text-ink-faint">
        <Untranslated>{ot('food.geo.dragHint')}</Untranslated>
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          inputMode="url"
          placeholder={ot('food.geo.pastePlaceholder')}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-page px-4 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
        />
        <button
          type="button"
          onClick={applyUrl}
          className="h-11 shrink-0 rounded-full bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-hover"
        >
          <Untranslated>{ot('food.geo.useUrl')}</Untranslated>
        </button>
      </div>

      {urlNote ? <p className="mt-2 text-xs text-danger">{urlNote}</p> : null}

      {lat != null && lng != null ? (
        <p className="mt-2 font-mono text-xs text-ink-faint">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
      ) : null}
    </div>
  )
}

/** ★ ตัดทศนิยมให้ตรงกับ numeric(9,6) ในฐานข้อมูล — ไม่งั้นค่าที่อ่านกลับมาไม่ตรงกับที่ส่งไป */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
