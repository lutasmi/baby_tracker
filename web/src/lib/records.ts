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

/** Una toma necesita al menos un componente para tener sentido. */
export function feedIsEmpty(r: {
  breastMin: number
  expressedMl: number
  formulaMl: number
}): boolean {
  return !r.breastMin && !r.expressedMl && !r.formulaMl
}
