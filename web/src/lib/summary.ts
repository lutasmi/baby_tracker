// Textos e iconos con los que se muestra cada registro en la interfaz.

import type { BabyRecord, DiaperRecord, FeedRecord } from '../types'
import { durationOf, endOf } from '../types'
import { dateOf, formatDuration, timeOf } from './dates'
import { isHydration } from './lifeday'
import { formatKg } from './records'

const SLEEP_LABELS: Record<string, string> = { siesta: 'Siesta', nocturno: 'Sueño nocturno' }
const BATH_LABELS: Record<string, string> = { completo: 'Baño completo', aseo: 'Aseo rápido' }
const SIDE_LABELS: Record<string, string> = {
  izquierdo: 'izq.',
  derecho: 'der.',
  ambos: 'ambos',
  desconocido: 'lado sin anotar',
}
const CONSISTENCY_LABELS: Record<string, string> = {
  pedete: 'pedete',
  liquida: 'líquida',
  pastosa: 'pastosa',
  solida: 'sólida',
}

const PEE_LABELS: Record<string, string> = { poco: 'poco', medio: 'medio', mucho: 'mucho' }
const POOP_LABELS: Record<string, string> = { poco: 'poca', medio: 'media', mucho: 'mucha' }

export function recordIcon(r: BabyRecord): string {
  switch (r.type) {
    case 'sleep':
      return r.kind === 'nocturno' ? '🌙' : '😴'
    case 'feed':
      // Solo pecho: el icono lo dice antes de leer nada.
      return r.breastMin > 0 && r.expressedMl === 0 && r.formulaMl === 0 ? '🤱' : '🍼'
    case 'diaper':
      if (r.pee && r.poop) return '💩💧'
      return r.poop ? '💩' : '💧'
    case 'bath':
      return '🛁'
    case 'weight':
      return '⚖️'
  }
}

export function recordTitle(r: BabyRecord): string {
  switch (r.type) {
    case 'sleep':
      return SLEEP_LABELS[r.kind] ?? 'Sueño'
    case 'feed':
      // Una toma puede combinar componentes: el desglose va en el detalle.
      // Si fue un ratito al pecho se dice aquí, porque no cuenta como toma en
      // ningún contador y desde la cronología no se vería por qué.
      return isHydration(r) ? 'Toma · hidratación' : 'Toma'
    case 'diaper':
      return `Pañal · ${diaperContent(r)}`
    case 'bath':
      return BATH_LABELS[r.kind] ?? 'Baño'
    case 'weight':
      return 'Peso'
  }
}

function diaperContent(r: DiaperRecord): string {
  // Un pedete no es una caca y no cuenta como tal: se nombra por lo que es.
  const solido = r.consistency === 'pedete' ? 'pedete' : 'caca'
  if (r.pee && r.poop) return `pis y ${solido}`
  return r.poop ? solido : 'pis'
}

/** Partes legibles del desglose de una toma: ['17 min pecho', '28 ml extraída']. */
export function feedParts(r: Pick<FeedRecord, 'breastMin' | 'breastSide' | 'expressedMl' | 'formulaMl'>): string[] {
  const parts: string[] = []
  if (r.breastMin > 0) {
    const side = r.breastSide ? ` ${SIDE_LABELS[r.breastSide] ?? r.breastSide}` : ''
    parts.push(`${r.breastMin} min pecho${side}`)
  }
  if (r.expressedMl > 0) parts.push(`${r.expressedMl} ml extraída`)
  if (r.formulaMl > 0) parts.push(`${r.formulaMl} ml fórmula`)
  return parts
}

/** Línea secundaria: '29 min · 35 ml fórmula', '1 h 21 min', 'consistencia líquida'… */
export function recordDetail(r: BabyRecord): string {
  const parts: string[] = []
  if (r.type === 'sleep' && !r.end) parts.push('Sin cerrar')

  const duration = durationOf(r)
  if (duration != null && duration > 0) parts.push(formatDuration(duration))

  if (r.type === 'feed') {
    parts.push(...feedParts(r))
  } else if (r.type === 'diaper') {
    if (r.peeAmount) parts.push(`pis ${PEE_LABELS[r.peeAmount] ?? r.peeAmount}`)
    if (r.poopAmount) parts.push(`caca ${POOP_LABELS[r.poopAmount] ?? r.poopAmount}`)
    // El pedete ya está en el título; repetirlo aquí sobraría.
    if (r.consistency && r.consistency !== 'pedete') {
      parts.push(`consistencia ${CONSISTENCY_LABELS[r.consistency] ?? r.consistency}`)
    }
  } else if (r.type === 'weight') {
    parts.push(formatKg(r.grams))
  }

  if (r.notes) parts.push(r.notes)
  return parts.join(' · ')
}

/** El tramo que se está leyendo: un día natural o un día de vida. */
export interface TimeWindow {
  start: string
  /** Exclusivo. */
  end: string
}

/**
 * Cómo se muestra la hora en la columna izquierda de la cronología: una hora
 * grande y, debajo, la matización que haga falta.
 *
 *   14:30            registro puntual
 *   14:30 → 15:45    empieza y acaba dentro del tramo
 *   07:00 de antes   empezó antes del tramo y acabó dentro
 *   21:30 sigue      se prolonga más allá del tramo
 *   21:30 sin cerrar sueño que sigue abierto
 *
 * Se compara con **el tramo**, no con una fecha: un día de vida va de las 22:40
 * de un día a las 22:40 del siguiente, así que media lista cae en la fecha de
 * después y llamarla "de antes" es justo al revés de lo que pasó.
 *
 * `date` es el día natural del instante que se está enseñando, para poder
 * separar en la lista dónde cambia la fecha.
 */
export function recordTimeParts(
  r: BabyRecord,
  window: TimeWindow
): { time: string; note: string | null; date: string } {
  const end = endOf(r)

  if (r.start < window.start) {
    // Venía de antes: lo que cae dentro del tramo es su final.
    const endsInside = end != null && end > window.start && end < window.end
    const shown = endsInside ? end! : r.start
    return { time: timeOf(shown), note: 'de antes', date: dateOf(shown) }
  }

  const date = dateOf(r.start)
  if (end && end >= window.end) return { time: timeOf(r.start), note: 'sigue', date: date }
  if (end && end !== r.start) return { time: timeOf(r.start), note: `→ ${timeOf(end)}`, date: date }
  if (!end && r.type === 'sleep') return { time: timeOf(r.start), note: 'sin cerrar', date: date }
  return { time: timeOf(r.start), note: null, date: date }
}
