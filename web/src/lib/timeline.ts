// Qué registros caen dentro de un periodo, sea un día natural o un día de vida.
//
// La cronología puede leerse con cualquiera de los dos calendarios, y en ambos
// casos un registro pertenece al periodo en el que **empieza**: así no aparece
// dos veces cuando se encadenan periodos consecutivos.

import type { BabyRecord, DayData, RecordType } from '../types'
import { dateOf } from './dates'
import { recordTimeParts, type TimeWindow } from './summary'

type TimeParts = ReturnType<typeof recordTimeParts>

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

/**
 * Las filas de un tramo: en el orden en que se leen y con la fecha marcada
 * donde cambia.
 *
 * Se ordenan por **la hora que se enseña**, que no siempre es la de inicio: lo
 * que venía de antes del tramo se ancla en su hora de fin, y colocarlo por su
 * inicio lo mandaba al principio de la lista con una hora de la mañana.
 *
 * La fecha se marca porque un día de vida cae a caballo de dos días naturales:
 * sin eso, a las 03:00 no hay forma de saber si fue anoche o esta madrugada.
 */
export function timelineRows(
  records: BabyRecord[],
  window: TimeWindow
): { record: BabyRecord; when: TimeParts; dayBreak: string | null }[] {
  const rows = records
    .map((record) => ({ record: record, when: recordTimeParts(record, window) }))
    .sort((a, b) =>
      a.when.at === b.when.at
        ? a.record.id < b.record.id
          ? -1
          : 1
        : a.when.at < b.when.at
          ? -1
          : 1
    )

  let previous = dateOf(window.start)
  return rows.map(({ record, when }) => {
    const date = dateOf(when.at)
    const dayBreak = date === previous ? null : date
    previous = date
    return { record: record, when: when, dayBreak: dayBreak }
  })
}

/** ¿El registro llega hasta `moment` o más allá? */
function touches(r: BabyRecord, moment: string): boolean {
  if (r.type !== 'sleep' && r.type !== 'feed') return false
  return r.end == null || r.end > moment
}
