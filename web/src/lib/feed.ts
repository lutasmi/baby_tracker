// Componentes de una toma: pecho directo (minutos), leche materna extraída
// (ml) y fórmula (ml). Una misma toma puede combinarlos.
//
// Los minutos y los ml nunca se convierten entre sí: del pecho directo no
// sabemos cuántos ml ha tomado el bebé, y fingir lo contrario falsearía los
// totales.

import type { BabyEvent, FeedComponents } from '../types'

export const BREASTS = ['izquierdo', 'derecho', 'ambos']

export function emptyComponents(): FeedComponents {
  return { breastMin: 0, breastSide: null, expressedMl: 0, formulaMl: 0, mixtaMl: 0 }
}

/** Leche cuantificable: fórmula + extraída (+ mixta de registros antiguos). */
export function quantifiableMl(c: FeedComponents): number {
  return c.expressedMl + c.formulaMl + c.mixtaMl
}

export function isEmpty(c: FeedComponents): boolean {
  return !c.breastMin && !quantifiableMl(c)
}

/** Subtipo derivado: solo ml -> biberón, solo pecho -> lactancia, ambos -> mixta. */
export function feedSubtypeFor(c: FeedComponents): 'biberon' | 'lactancia' | 'mixta' {
  const hasMl = quantifiableMl(c) > 0
  if (c.breastMin > 0 && hasMl) return 'mixta'
  if (c.breastMin > 0) return 'lactancia'
  return 'biberon'
}

/**
 * Componentes de una toma registrada con la v1, que no los tenía: la lactancia
 * guardaba los minutos como duración del evento y el biberón, la cantidad con
 * el tipo de leche en `detail`.
 *
 * El backend ya hace esta misma traducción al leer la hoja; aquí sirve de red
 * de seguridad para que la aplicación funcione aunque todavía responda una
 * versión anterior del backend.
 */
export function legacyComponents(e: BabyEvent): FeedComponents {
  const c = emptyComponents()
  if (e.subtype === 'lactancia') {
    c.breastMin = e.durationMin ?? 0
    if (e.detail && BREASTS.includes(e.detail)) c.breastSide = e.detail
    return c
  }
  const ml = e.quantityMl ?? 0
  if (e.detail === 'materna') c.expressedMl = ml
  else if (e.detail === 'mixta') c.mixtaMl = ml
  else c.formulaMl = ml
  return c
}

/** Componentes de un evento de toma, vengan del backend o haya que derivarlos. */
export function componentsOf(e: BabyEvent): FeedComponents {
  if (e.type !== 'feed') return emptyComponents()
  return e.components ?? legacyComponents(e)
}

/** Partes legibles del desglose: ['17 min pecho', '28 ml extraída']. */
export function componentParts(c: FeedComponents): string[] {
  const parts: string[] = []
  if (c.breastMin > 0) parts.push(`${c.breastMin} min pecho`)
  if (c.expressedMl > 0) parts.push(`${c.expressedMl} ml extraída`)
  if (c.formulaMl > 0) parts.push(`${c.formulaMl} ml fórmula`)
  if (c.mixtaMl > 0) parts.push(`${c.mixtaMl} ml mixta`)
  return parts
}
