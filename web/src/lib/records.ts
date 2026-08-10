// Utilidades sobre registros que no dependen de ninguna pantalla.

import type { BabyRecord, FeedRecord, RecordInput } from '../types'

/** Identificador único generado en el cliente: reintentar nunca duplica. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Reduce un registro a los campos editables que viajan a la API. */
export function toInput(r: BabyRecord): RecordInput {
  const { createdBy: _by, createdAt: _at, updatedBy: _uby, updatedAt: _uat, ...input } = r
  return input
}

/** Leche cuantificable de una toma: fórmula más leche extraída. */
export function milkMlOf(r: FeedRecord): number {
  return r.expressedMl + r.formulaMl
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

/** Una toma necesita al menos un componente para tener sentido. */
export function feedIsEmpty(r: {
  breastMin: number
  expressedMl: number
  formulaMl: number
}): boolean {
  return !r.breastMin && !r.expressedMl && !r.formulaMl
}
