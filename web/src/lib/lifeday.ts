// Día de vida: periodos de 24 h contados desde el instante exacto del
// nacimiento. Con un nacimiento el 5 de agosto a las 09:17, el día de vida 1
// va de ese momento a las 09:16 del día 6.
//
// Convive con el día natural (00:00–23:59), que es el que usan la cronología y
// la navegación por fechas. El backend calcula los totales sobre el histórico
// completo; aquí está la aritmética para etiquetar, para la vista previa de los
// ajustes y para el modo demo.

import type { BabyRecord, DiaperRecord, FeedRecord, LifeDayTotals } from '../types'
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

// --- Contadores de la pantalla de inicio -------------------------------------
//
// Van aparte de `LifeDayTotals` a propósito: ese tipo es lo que devuelve la API
// y lo que usa la evolución. Esto es solo cómo se presentan los KPIs, y separa
// dos cosas que sumadas dicen menos de lo que dicen por separado.

/**
 * Por debajo de estos minutos, un rato al pecho es consuelo o hidratación más
 * que una comida. Contarlo como una toma más desvirtúa justo el número que se
 * mira para saber si toca.
 */
export const HYDRATION_MAX_MIN = 5

/**
 * Una toma que fue solo un ratito al pecho.
 *
 * Un biberón cuenta siempre como toma, aunque se anotara sin hora de fin y
 * dure cero minutos: lo que come es la cantidad, no el tiempo.
 */
export function isHydration(r: FeedRecord): boolean {
  return r.expressedMl + r.formulaMl === 0 && r.breastMin < HYDRATION_MAX_MIN
}

/** Un pañal con caca de verdad; el pedete son gases, no una caca. */
export function isRealPoop(r: DiaperRecord): boolean {
  return r.poop && r.consistency !== 'pedete'
}

export interface PeriodCounts {
  /** Tomas de verdad: con biberón, o con pecho suficiente. */
  feeds: number
  hydrations: number
  /** Cacas de verdad: las que no son un pedete. */
  poops: number
  pedetes: number
}

/** Cuenta los registros del periodo separando tomas e hidratación, cacas y pedetes. */
export function periodCounts(records: BabyRecord[], start: string, end: string): PeriodCounts {
  const c: PeriodCounts = { feeds: 0, hydrations: 0, poops: 0, pedetes: 0 }
  for (const r of records) {
    if (r.start < start || r.start >= end) continue
    if (r.type === 'feed') {
      if (isHydration(r)) c.hydrations++
      else c.feeds++
    } else if (r.type === 'diaper' && r.poop) {
      if (isRealPoop(r)) c.poops++
      else c.pedetes++
    }
  }
  return c
}
