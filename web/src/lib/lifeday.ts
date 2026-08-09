// Día de vida: periodos de 24 h contados desde el instante exacto del
// nacimiento. Con un nacimiento el 5 de agosto a las 09:17, el día de vida 1
// va de ese momento a las 09:16 del día 6.
//
// Convive con el día natural (00:00–23:59), que es el que usan la cronología y
// la navegación por fechas. El backend calcula los totales; aquí solo se
// necesita la aritmética para etiquetar y para la vista previa de los ajustes.

import type { BabyEvent, LifeDayTotals } from '../types'
import { addMinutes, diffMinutes } from './dates'
import { componentsOf } from './feed'

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
    mixtaMl: 0,
    milkMl: 0,
  }
}

/**
 * Totales de un día de vida. Un evento cuenta en el periodo en el que empieza,
 * de modo que una toma que cruza el aniversario horario no se parte en dos.
 *
 * El backend calcula estos mismos totales sobre el histórico completo; esta
 * versión existe para el modo demo y para poder probar la regla de reparto.
 */
export function lifeDayTotals(events: BabyEvent[], start: string, end: string): LifeDayTotals {
  const t = emptyTotals()
  for (const e of events) {
    if (e.start < start || e.start >= end) continue
    if (e.type === 'diaper') {
      t.diapers++
      if (e.subtype === 'pipi' || e.subtype === 'ambos') t.pees++
      if (e.subtype === 'caca' || e.subtype === 'ambos') t.poops++
    } else if (e.type === 'feed') {
      t.feeds++
      const c = componentsOf(e)
      t.breastMin += c.breastMin
      t.expressedMl += c.expressedMl
      t.formulaMl += c.formulaMl
      t.mixtaMl += c.mixtaMl
    }
  }
  // Leche cuantificable: el pecho directo no entra porque no sabemos los ml.
  t.milkMl = t.expressedMl + t.formulaMl + t.mixtaMl
  return t
}
