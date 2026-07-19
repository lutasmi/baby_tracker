import type { BabyEvent, EventInput } from '../types'

/** Identificador único generado en el cliente: reintentar nunca duplica. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Reduce un evento a los campos editables que viajan a la API. */
export function toInput(e: BabyEvent): EventInput {
  return {
    id: e.id,
    type: e.type,
    subtype: e.subtype,
    start: e.start,
    end: e.end,
    durationMin: e.durationMin,
    quantityMl: e.quantityMl,
    detail: e.detail,
    notes: e.notes,
  }
}
