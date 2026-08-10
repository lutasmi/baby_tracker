// Día de vida: periodos de 24 h contados desde el instante exacto del
// nacimiento. Con un nacimiento el 5 de agosto a las 09:17, el día de vida 1
// va de ese momento a las 09:16 del día 6.
//
// Convive con el día natural (00:00–23:59), que es el que usan la cronología y
// la navegación por fechas. El backend calcula los totales sobre el histórico
// completo; aquí está la aritmética para etiquetar, para la vista previa de los
// ajustes y para el modo demo.

import type { BabyRecord, LifeDayTotals } from '../types'
import { addMinutes, diffMinutes } from './dates'

const DAY_MIN = 24 * 60

/** Día de vida (1 = las primeras 24 h) del instante `dt`; 0 si aún no ha nacido. */
export function lifeDayNumber(birth: string, dt: string): number {
  const minutes = diffMinutes(birth, dt)
  if (minutes < 0) return 0
  return Math.floor(minutes / DAY_MIN) + 1
}

/** Rango [inicio, fin) del día de vida `n`. */
export function lifeDayRange(birth: string, n: number): { start: string; end: string } {
  const offset = (n - 1) * DAY_MIN
  return { start: addMinutes(birth, offset), end: addMinutes(birth, offset + DAY_MIN) }
}

export function emptyTotals(): LifeDayTotals {
  return {
    pees: 0,
    poops: 0,
    diapers: 0,
    feeds: 0,
    breastMin: 0,
    expressedMl: 0,
    formulaMl: 0,
    milkMl: 0,
  }
}

/**
 * Totales de un día de vida. Un registro cuenta en el periodo en el que
 * empieza, de modo que una toma que cruza el aniversario horario no se parte.
 */
export function lifeDayTotals(records: BabyRecord[], start: string, end: string): LifeDayTotals {
  const t = emptyTotals()
  for (const r of records) {
    if (r.start < start || r.start >= end) continue
    if (r.type === 'diaper') {
      t.diapers++
      if (r.pee) t.pees++
      if (r.poop) t.poops++
    } else if (r.type === 'feed') {
      t.feeds++
      t.breastMin += r.breastMin
      t.expressedMl += r.expressedMl
      t.formulaMl += r.formulaMl
    }
  }
  // Leche cuantificable: el pecho directo no entra porque no sabemos los ml.
  t.milkMl = t.expressedMl + t.formulaMl
  return t
}
