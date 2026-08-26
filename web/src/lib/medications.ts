// El catálogo de medicación: qué está en tratamiento y cómo se lee una dosis.

import type { Medication } from '../types'
import { isValidDate } from './dates'

/**
 * ¿El tratamiento cubre ese día?
 *
 * Sin fecha de inicio, desde siempre; sin fecha de fin, para siempre. De aquí
 * sale que un medicamento aparezca en el selector, sin ninguna marca de
 * "activo" que pudiera contradecir a las fechas.
 */
export function isActiveOn(m: Medication, date: string): boolean {
  if (m.from && date < m.from) return false
  if (m.to && date > m.to) return false
  return true
}

export function activeOn(list: Medication[], date: string): Medication[] {
  return list.filter((m) => isActiveOn(m, date))
}

/**
 * Motivo por el que una ficha no se puede guardar todavía, o null.
 *
 * Vive aquí, y no en la pantalla, porque la ficha se edita desde dos sitios:
 * el catálogo y el alta rápida del formulario de una dosis.
 */
export function medicationProblem(m: Medication): string | null {
  if (!m.name.trim()) return 'Ponle nombre al medicamento.'
  if (m.from && !isValidDate(m.from)) return 'La fecha de inicio del tratamiento no es válida.'
  if (m.to && !isValidDate(m.to)) return 'La fecha de fin del tratamiento no es válida.'
  if (m.from && m.to && m.to < m.from) return 'El tratamiento no puede acabar antes de empezar.'
  return null
}

/** Una ficha en blanco, lista para rellenar. */
export function emptyMedication(id: string): Medication {
  return { id, name: '', dose: 0, unit: '', frequency: '', from: null, to: null }
}

/** 0.6 -> '0,6'; 2 -> '2'. Con coma, que es como se lee una dosis aquí. */
export function formatAmount(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/** '0,6 ml', '1 gota', o '' si no hay cantidad anotada. */
export function formatDose(amount: number, unit: string): string {
  if (!amount) return ''
  return unit ? `${formatAmount(amount)} ${unit}` : formatAmount(amount)
}

/**
 * Cómo se resume el tratamiento debajo del nombre: 'del 1 al 12 de agosto',
 * 'desde el 1 de agosto', 'hasta el 12 de agosto' o '' si no tiene fechas.
 */
export function treatmentLabel(m: Medication): string {
  if (m.from && m.to) return `del ${dayMonth(m.from)} al ${dayMonth(m.to)}`
  if (m.from) return `desde el ${dayMonth(m.from)}`
  if (m.to) return `hasta el ${dayMonth(m.to)}`
  return ''
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** '2026-08-12' -> '12 de agosto'. */
function dayMonth(date: string): string {
  const day = Number(date.slice(8, 10))
  return `${day} de ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''}`
}
