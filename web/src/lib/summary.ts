// Textos e iconos con los que se muestra cada registro en la interfaz.

import type { BabyRecord, FeedRecord } from '../types'
import { durationOf, endOf } from '../types'
import { dateOf, formatDuration, timeOf } from './dates'
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
      return 'Toma'
    case 'diaper':
      return `Pañal · ${diaperContent(r.pee, r.poop)}`
    case 'bath':
      return BATH_LABELS[r.kind] ?? 'Baño'
    case 'weight':
      return 'Peso'
  }
}

function diaperContent(pee: boolean, poop: boolean): string {
  if (pee && poop) return 'pis y caca'
  return poop ? 'caca' : 'pis'
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
    if (r.consistency === 'pedete') parts.push('pedete')
    else if (r.consistency) {
      parts.push(`consistencia ${CONSISTENCY_LABELS[r.consistency] ?? r.consistency}`)
    }
  } else if (r.type === 'weight') {
    parts.push(formatKg(r.grams))
  }

  if (r.notes) parts.push(r.notes)
  return parts.join(' · ')
}

/**
 * Cómo se muestra la hora en la columna izquierda de la cronología: una hora
 * grande y, debajo, la matización que haga falta.
 *
 *   14:30            registro puntual
 *   14:30 → 15:45    empieza y acaba el mismo día
 *   07:00 de antes   venía del día anterior
 *   21:30 sin cerrar sueño que sigue abierto
 */
export function recordTimeParts(r: BabyRecord, date: string): { time: string; note: string | null } {
  const end = endOf(r)
  const startsToday = dateOf(r.start) === date

  if (!startsToday) {
    const endsToday = end != null && dateOf(end) === date
    return { time: timeOf(endsToday ? end! : r.start), note: 'de antes' }
  }
  if (end && dateOf(end) !== date) return { time: timeOf(r.start), note: 'sigue' }
  if (end && end !== r.start) return { time: timeOf(r.start), note: `→ ${timeOf(end)}` }
  if (!end && r.type === 'sleep') return { time: timeOf(r.start), note: 'sin cerrar' }
  return { time: timeOf(r.start), note: null }
}
