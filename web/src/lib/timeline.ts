// Qué registros caen dentro de un periodo, sea un día natural o un día de vida.
//
// La cronología puede leerse con cualquiera de los dos calendarios, y en ambos
// casos un registro pertenece al periodo en el que **empieza**: así no aparece
// dos veces cuando se encadenan periodos consecutivos.

import type { BabyRecord, DayData, RecordType } from '../types'

/**
 * Registros de los días cargados que empiezan dentro de [start, end).
 *
 * Con `includeEarlier` se añade además lo que empezó antes pero llega hasta
 * dentro del periodo. Se usa solo en el periodo más antiguo cargado, para no
 * perder el sueño nocturno que arranca fuera del tramo visible.
 */
export function windowRecords(
  days: DayData[],
  start: string,
  end: string,
  { includeEarlier = false } = {}
): BabyRecord[] {
  const seen = new Set<string>()
  const out: BabyRecord[] = []

  for (const day of days) {
    for (const r of day.records) {
      if (seen.has(r.id)) continue
      const startsInside = r.start >= start && r.start < end
      const reachesInside = includeEarlier && r.start < start && touches(r, start)
      if (!startsInside && !reachesInside) continue
      seen.add(r.id)
      out.push(r)
    }
  }
  return out.sort((a, b) => (a.start === b.start ? (a.id < b.id ? -1 : 1) : a.start < b.start ? -1 : 1))
}

/**
 * Los registros de los tipos elegidos. Sin ninguno elegido se devuelven todos:
 * la cronología completa es lo normal, y filtrar es la excepción.
 */
export function filterByType(records: BabyRecord[], types: RecordType[]): BabyRecord[] {
  if (types.length === 0) return records
  return records.filter((r) => types.includes(r.type))
}

/** ¿El registro llega hasta `moment` o más allá? */
function touches(r: BabyRecord, moment: string): boolean {
  if (r.type !== 'sleep' && r.type !== 'feed') return false
  return r.end == null || r.end > moment
}
