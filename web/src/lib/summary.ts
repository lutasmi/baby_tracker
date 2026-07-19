// Textos e iconos con los que se muestra cada evento en la interfaz.

import type { BabyEvent } from '../types'
import { dateOf, formatDuration, timeOf } from './dates'

export const SUBTYPE_LABELS: Record<string, string> = {
  siesta: 'Siesta',
  nocturno: 'Sueño nocturno',
  biberon: 'Biberón',
  lactancia: 'Lactancia',
  pipi: 'Pipí',
  caca: 'Caca',
  ambos: 'Pipí y caca',
  completo: 'Baño completo',
  aseo: 'Aseo rápido',
}

export const DETAIL_LABELS: Record<string, string> = {
  materna: 'Leche materna',
  formula: 'Fórmula',
  mixta: 'Mixta',
  izquierdo: 'Pecho izquierdo',
  derecho: 'Pecho derecho',
  liquida: 'Líquida',
  pastosa: 'Pastosa',
  solida: 'Sólida',
}

export function eventIcon(e: BabyEvent): string {
  switch (e.type) {
    case 'sleep':
      return e.subtype === 'nocturno' ? '🌙' : '😴'
    case 'feed':
      return e.subtype === 'lactancia' ? '🤱' : '🍼'
    case 'diaper':
      return e.subtype === 'pipi' ? '💧' : '💩'
    case 'bath':
      return '🛁'
  }
}

export function eventTitle(e: BabyEvent): string {
  if (e.type === 'diaper') {
    return `Pañal · ${SUBTYPE_LABELS[e.subtype] ?? e.subtype}`
  }
  return SUBTYPE_LABELS[e.subtype] ?? e.subtype
}

/** Línea secundaria del evento: '120 ml · Fórmula', '25 min · Pecho izquierdo'… */
export function eventDetail(e: BabyEvent): string {
  const parts: string[] = []
  if (e.type === 'sleep' && !e.end) parts.push('En curso')
  if (e.durationMin != null && e.durationMin > 0) parts.push(formatDuration(e.durationMin))
  if (e.quantityMl != null) parts.push(`${e.quantityMl} ml`)
  if (e.detail) {
    const label = DETAIL_LABELS[e.detail] ?? e.detail
    parts.push(e.type === 'diaper' ? `Consistencia ${label.toLowerCase()}` : label)
  }
  if (e.notes) parts.push(e.notes)
  return parts.join(' · ')
}

/**
 * Hora que se muestra en la cronología del día `date`:
 *  - evento puntual: '14:30'
 *  - con fin el mismo día: '14:30–15:45'
 *  - empezó otro día: '(ayer) → 07:00'
 *  - termina otro día: '21:30 →'
 *  - sueño en curso: '14:30 →'
 */
export function eventTimeLabel(e: BabyEvent, date: string): string {
  const startsToday = dateOf(e.start) === date
  if (!e.end) {
    // Sin fin: solo el sueño está "en curso"; el resto son eventos puntuales.
    if (e.type !== 'sleep') return timeOf(e.start)
    return startsToday ? `${timeOf(e.start)} →` : '→'
  }
  const endsToday = dateOf(e.end) === date
  if (startsToday && endsToday) {
    return e.end === e.start ? timeOf(e.start) : `${timeOf(e.start)}–${timeOf(e.end)}`
  }
  if (startsToday) return `${timeOf(e.start)} →`
  return `→ ${timeOf(e.end)}`
}
