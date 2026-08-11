// Utilidades sobre registros que no dependen de ninguna pantalla.

import type { BreastSide, FeedItem, FeedItemKind, FeedRecord } from '../types'
import { diffMinutes } from './dates'

/** Identificador único generado en el cliente: reintentar nunca duplica. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Leche cuantificable de una toma: fórmula más leche extraída. */
export function milkMlOf(r: FeedRecord): number {
  return r.expressedMl + r.formulaMl
}

// --- Elementos de una toma ---------------------------------------------------
//
// Estas funciones son la misma cuenta que hace el backend al leer la hoja. Se
// repiten aquí para que el formulario pueda enseñar lo que se va a guardar sin
// preguntárselo al servidor; si alguna cambia, tiene que cambiar en los dos
// sitios (apps-script/Logic.js).

/** Lo que dura un elemento; un biberón sin hora de fin es puntual. */
export function itemMinutes(i: FeedItem): number {
  return i.end ? Math.max(0, diffMinutes(i.start, i.end)) : 0
}

/** Minutos de pecho de la toma: la suma de sus tetadas. */
export function breastMinutesOf(items: FeedItem[]): number {
  return items.filter((i) => i.kind === 'pecho').reduce((total, i) => total + itemMinutes(i), 0)
}

export function mlOfItems(items: FeedItem[], kind: FeedItemKind): number {
  return items.filter((i) => i.kind === kind).reduce((total, i) => total + i.ml, 0)
}

/**
 * Qué pechos se usaron en la toma.
 *
 * Con tetadas de los dos lados es "ambos". Si alguna quedó sin anotar, el
 * resultado es "no recuerdo" salvo que las conocidas ya sumen los dos pechos:
 * media respuesta no autoriza a inventar la otra media.
 */
export function breastSideOfItems(items: FeedItem[]): BreastSide | null {
  const sides = new Set(
    items.filter((i) => i.kind === 'pecho' && itemMinutes(i) > 0).map((i) => i.side ?? 'desconocido')
  )
  if (sides.size === 0) return null

  const unknown = sides.delete('desconocido')
  if (sides.has('ambos') || (sides.has('izquierdo') && sides.has('derecho'))) return 'ambos'
  if (unknown || sides.size === 0) return 'desconocido'
  return [...sides][0]
}

/**
 * Cuándo empieza y acaba la toma: del primer elemento al último. Un biberón
 * suelto es puntual, y entonces el fin es el propio inicio.
 */
export function feedSpan(items: FeedItem[]): { start: string; end: string } {
  const starts = items.map((i) => i.start)
  const ends = items.map((i) => i.end ?? i.start)
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end: ends.reduce((a, b) => (a > b ? a : b)),
  }
}

/**
 * Todo lo que una toma deriva de sus elementos, en orden cronológico.
 *
 * Una toma con elementos siempre tiene fin y duración —aunque valgan lo mismo
 * que el inicio, si fue un biberón puntual—, así que aquí no son opcionales.
 */
export function deriveFeed(items: FeedItem[]): {
  items: FeedItem[]
  start: string
  end: string
  durationMin: number
  breastMin: number
  breastSide: BreastSide | null
  expressedMl: number
  formulaMl: number
} {
  const sorted = [...items].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  const { start, end } = feedSpan(sorted)
  return {
    items: sorted,
    start,
    end,
    durationMin: diffMinutes(start, end),
    breastMin: breastMinutesOf(sorted),
    breastSide: breastSideOfItems(sorted),
    expressedMl: mlOfItems(sorted, 'extraida'),
    formulaMl: mlOfItems(sorted, 'formula'),
  }
}

/** '3420' -> '3,420 kg'. La báscula da gramos; el peso se lee en kilos. */
export function formatKg(grams: number): string {
  return `${(grams / 1000).toFixed(3).replace('.', ',')} kg`
}

/** Variación respecto al peso al nacer, en gramos y en porcentaje. */
export function weightChange(
  grams: number,
  birthWeightG: number
): { diffG: number; percent: number } | null {
  if (!birthWeightG || !grams) return null
  const diffG = grams - birthWeightG
  return { diffG, percent: (diffG / birthWeightG) * 100 }
}

/** '-210' -> '−210 g'; '+40' -> '+40 g'. Con el signo menos tipográfico. */
export function formatGrams(diffG: number): string {
  const sign = diffG < 0 ? '−' : '+'
  return `${sign}${Math.abs(diffG)} g`
}

export function formatPercent(percent: number): string {
  const sign = percent < 0 ? '−' : '+'
  return `${sign}${Math.abs(percent).toFixed(1).replace('.', ',')} %`
}

/** Una toma sin elementos no es nada: no hay qué guardar. */
export function feedIsEmpty(items: FeedItem[]): boolean {
  return items.length === 0
}
