// Textos e iconos con los que se muestra cada registro en la interfaz.

import type { BabyRecord, FeedRecord } from '../types'
import { durationOf, endOf } from '../types'
import { dateOf, formatDuration, timeOf } from './dates'

const SLEEP_LABELS: Record<string, string> = { siesta: 'Siesta', nocturno: 'Sueño nocturno' }
const BATH_LABELS: Record<string, string> = { completo: 'Baño completo', aseo: 'Aseo rápido' }
const SIDE_LABELS: Record<string, string> = {
  izquierdo: 'izq.',
  derecho: 'der.',
  ambos: 'ambos',
}
const CONSISTENCY_LABELS: Record<string, string> = {
  liquida: 'líquida',
  pastosa: 'pastosa',
  solida: 'sólida',
}

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
  } else if (r.type === 'diaper' && r.consistency) {
    parts.push(`consistencia ${CONSISTENCY_LABELS[r.consistency] ?? r.consistency}`)
  }

  if (r.notes) parts.push(r.notes)
  return parts.join(' · ')
}

/**
 * Hora que se muestra en la cronología del día `date`:
 *  - registro puntual: '14:30'
 *  - con fin el mismo día: '14:30–15:45'
 *  - empezó otro día: '→ 07:00'
 *  - termina otro día o sigue sin cerrar: '21:30 →'
 */
export function recordTimeLabel(r: BabyRecord, date: string): string {
  const startsToday = dateOf(r.start) === date
  const end = endOf(r)
  if (!end) {
    // Sin fin: solo el sueño queda abierto; el resto son registros puntuales.
    if (r.type !== 'sleep') return timeOf(r.start)
    return startsToday ? `${timeOf(r.start)} →` : '→'
  }
  const endsToday = dateOf(end) === date
  if (startsToday && endsToday) {
    return end === r.start ? timeOf(r.start) : `${timeOf(r.start)}–${timeOf(end)}`
  }
  if (startsToday) return `${timeOf(r.start)} →`
  return `→ ${timeOf(end)}`
}
