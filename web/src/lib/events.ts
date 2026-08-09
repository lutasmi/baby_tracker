import type { BabyEvent, EventInput } from '../types'
import { componentsOf } from './feed'

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
    // Los registros de la v1 no traen componentes: se derivan para que una
    // edición no los pierda.
    components: e.type === 'feed' ? componentsOf(e) : null,
    notes: e.notes,
  }
}
