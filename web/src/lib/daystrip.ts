// Geometría de la franja de 24 h: dónde cae cada registro dentro del periodo.
//
// Un carril por tipo de cosa. Verlos alineados en el tiempo contesta a lo que
// una tabla no contesta: si las cacas son de mañana, si los pises se espacian
// al caer la noche, si el sueño llega siempre después de comer.

import type { BabyRecord } from '../types'
import { addMinutes, diffMinutes, timeOf } from './dates'
import { isStaleSleep } from './derive'

export type LaneKey = 'sleep' | 'feed' | 'pee' | 'poop' | 'other'

export interface StripMark {
  id: string
  /** 0-100: dónde empieza dentro del periodo. */
  leftPct: number
  /** 0-100: cuánto ocupa. Los registros puntuales valen 0. */
  widthPct: number
  /** Texto para lectores de pantalla y para el título del botón. */
  label: string
}

export interface StripLane {
  key: LaneKey
  icon: string
  name: string
  marks: StripMark[]
}

const LANES: { key: LaneKey; icon: string; name: string; match: (r: BabyRecord) => boolean }[] = [
  { key: 'sleep', icon: '😴', name: 'Sueño', match: (r) => r.type === 'sleep' },
  { key: 'feed', icon: '🍼', name: 'Tomas', match: (r) => r.type === 'feed' },
  { key: 'pee', icon: '💧', name: 'Pises', match: (r) => r.type === 'diaper' && r.pee },
  { key: 'poop', icon: '💩', name: 'Cacas', match: (r) => r.type === 'diaper' && r.poop },
  {
    key: 'other',
    icon: '🛁',
    name: 'Otros',
    match: (r) => r.type === 'bath' || r.type === 'weight',
  },
]

const clamp = (v: number) => Math.min(100, Math.max(0, v))

/**
 * Fin que se dibuja. Un sueño sin cerrar se extiende hasta ahora; si lleva
 * demasiado abierto es un cronómetro olvidado y se pinta como un instante,
 * para no teñir de sueño media franja.
 */
function drawnEnd(r: BabyRecord, now: string): string {
  if (r.type === 'sleep' && !r.end) return isStaleSleep(r, now) ? r.start : now
  if (r.type === 'sleep' || r.type === 'feed') return r.end ?? r.start
  return r.start
}

/** Los carriles con sus marcas, listos para pintar. */
export function stripLanes(
  records: BabyRecord[],
  start: string,
  end: string,
  now: string
): StripLane[] {
  const total = Math.max(1, diffMinutes(start, end))
  const pct = (dt: string) => clamp((diffMinutes(start, dt) / total) * 100)

  return LANES.map((lane) => ({
    key: lane.key,
    icon: lane.icon,
    name: lane.name,
    marks: records.filter(lane.match).map((r) => {
      const left = pct(r.start)
      const right = pct(drawnEnd(r, now))
      return {
        id: r.id,
        leftPct: left,
        widthPct: Math.max(0, right - left),
        label: `${lane.name} · ${timeOf(r.start)}`,
      }
    }),
  }))
}

/** Marcas de hora cada 6 h en punto que caen dentro del periodo. */
export function stripTicks(start: string, end: string): { leftPct: number; label: string }[] {
  const total = Math.max(1, diffMinutes(start, end))
  const out: { leftPct: number; label: string }[] = []

  // Primera hora en punto a partir del inicio.
  let cursor = `${start.slice(0, 14)}00`
  if (cursor < start) cursor = addMinutes(cursor, 60)

  while (cursor < end) {
    if (Number(cursor.slice(11, 13)) % 6 === 0) {
      out.push({ leftPct: (diffMinutes(start, cursor) / total) * 100, label: timeOf(cursor) })
    }
    cursor = addMinutes(cursor, 60)
  }
  return out
}

/** Posición de "ahora" dentro del periodo, o null si queda fuera. */
export function nowPct(start: string, end: string, now: string): number | null {
  if (now < start || now >= end) return null
  const total = Math.max(1, diffMinutes(start, end))
  return (diffMinutes(start, now) / total) * 100
}
