// Estado derivado y resúmenes a partir de la lista de registros. Lógica pura:
// recibe datos y el instante "ahora", y no consulta relojes ni la red.
//
// Principio del producto: la aplicación afirma lo que se ha registrado, no lo
// que está ocurriendo. Un sueño sin cerrar puede ser un bebé durmiendo ahora
// mismo o un cronómetro que alguien olvidó detener, y pasado cierto tiempo lo
// segundo es mucho más probable que lo primero.

import type { BabyRecord, FeedRecord, SleepRecord } from '../types'
import { diffMinutes, minutesInDay, timeOf } from './dates'
import { isHydration } from './lifeday'
import { milkMlOf } from './records'

/**
 * A partir de aquí, un sueño sin cerrar deja de considerarse en curso: ni se
 * cuenta en los totales ni se afirma que el bebé sigue dormido. El backend usa
 * el mismo umbral (OPEN_SLEEP_MAX_MIN en Logic.js).
 */
export const STALE_SLEEP_MIN = 14 * 60

export function isOpenSleep(r: BabyRecord): r is SleepRecord {
  return r.type === 'sleep' && !r.end
}

/** Sueño sin cerrar que ya no resulta creíble: cronómetro olvidado. */
export function isStaleSleep(r: BabyRecord, now: string): boolean {
  return isOpenSleep(r) && diffMinutes(r.start, now) > STALE_SLEEP_MIN
}

export interface BabyStatus {
  /** 'asleep' solo con un sueño abierto reciente; nunca por deducción lejana. */
  state: 'asleep' | 'awake' | 'unknown'
  /** Instante en que empezó el estado (inicio del sueño o último despertar). */
  since: string | null
  /** Hay un sueño sin cerrar que probablemente sea un olvido. */
  staleTimer: boolean
}

export function babyStatus(
  openSleep: SleepRecord | null,
  lastSleepEnd: SleepRecord | null,
  now: string
): BabyStatus {
  const stale = openSleep ? isStaleSleep(openSleep, now) : false
  if (openSleep && !stale) {
    return { state: 'asleep', since: openSleep.start, staleTimer: false }
  }
  if (lastSleepEnd?.end) {
    return { state: 'awake', since: lastSleepEnd.end, staleTimer: stale }
  }
  return { state: 'unknown', since: null, staleTimer: stale }
}

/**
 * Minutos dormidos durante un día natural, recortando los sueños que cruzan la
 * medianoche. Un sueño en curso cuenta hasta "ahora"; uno que lleva demasiado
 * tiempo abierto no cuenta, porque sumarlo daría una cifra inventada.
 */
export function sleepMinutesOnDate(records: BabyRecord[], date: string, now: string): number {
  let total = 0
  for (const r of records) {
    if (r.type !== 'sleep') continue
    if (isStaleSleep(r, now)) continue
    const end = r.end ?? now
    if (diffMinutes(r.start, end) <= 0) continue
    total += minutesInDay(r.start, end, date)
  }
  return total
}

export interface DaySummary {
  sleepMin: number
  feeds: number
  milkMl: number
  breastMin: number
  diapers: number
  baths: number
}

/** Resumen del día natural: lo que aparece en la cabecera de la cronología. */
export function daySummary(records: BabyRecord[], date: string, now: string): DaySummary {
  const startsOn = (r: BabyRecord) => r.start.slice(0, 10) === date
  let feeds = 0
  let milkMl = 0
  let breastMin = 0
  let diapers = 0
  let baths = 0
  for (const r of records) {
    if (!startsOn(r)) continue
    if (r.type === 'feed') {
      // Los ratitos al pecho no engordan el recuento de tomas, aquí tampoco.
      if (!isHydration(r)) feeds++
      milkMl += milkMlOf(r)
      breastMin += r.breastMin
    } else if (r.type === 'diaper') {
      diapers++
    } else if (r.type === 'bath') {
      baths++
    }
  }
  return { sleepMin: sleepMinutesOnDate(records, date, now), feeds, milkMl, breastMin, diapers, baths }
}

/** Entre las 20:00 y las 07:59 se asume sueño nocturno; el resto, siesta. */
export function guessSleepKind(startDt: string): 'siesta' | 'nocturno' {
  const time = timeOf(startDt)
  return time >= '20:00' || time < '08:00' ? 'nocturno' : 'siesta'
}

export interface FeedDefaults {
  expressedMl: number
  formulaMl: number
  /** Por qué pecho seguir: el contrario al de la última toma. */
  nextSide: FeedRecord['breastSide']
}

/**
 * Con qué valores se abre el formulario de toma: repetir las cantidades de la
 * última es casi siempre lo correcto y ahorra pulsaciones.
 *
 * Las tetadas no se preseleccionan —sus horas serían inventadas—, pero sí se
 * propone el pecho contrario al de la vez anterior.
 */
export function feedDefaults(lastFeed: FeedRecord | null): FeedDefaults {
  if (!lastFeed) return { expressedMl: 0, formulaMl: 0, nextSide: null }
  return {
    expressedMl: lastFeed.expressedMl,
    formulaMl: lastFeed.formulaMl,
    nextSide:
      lastFeed.breastSide === 'izquierdo'
        ? 'derecho'
        : lastFeed.breastSide === 'derecho'
          ? 'izquierdo'
          : lastFeed.breastSide,
  }
}

/**
 * Minutos entre el inicio de cada toma y el de la anterior, por identificador.
 *
 * De inicio a inicio, que es como se cuenta lo de "cada tres horas". La toma
 * anterior al día llega aparte para que la primera de la madrugada tampoco se
 * quede sin su hueco.
 *
 * La hidratación no entra ni como una cosa ni como la otra: un consuelo de dos
 * minutos ni tiene hueco propio que enseñar ni reinicia el de la siguiente
 * toma. Esta línea contesta a "cuánto llevaba sin comer".
 */
export function feedGaps(
  records: BabyRecord[],
  previousFeed: FeedRecord | null
): Map<string, number> {
  const gaps = new Map<string, number>()
  let previousStart = previousFeed && !isHydration(previousFeed) ? previousFeed.start : null
  for (const r of records) {
    if (r.type !== 'feed' || isHydration(r)) continue
    if (previousStart) {
      const minutes = diffMinutes(previousStart, r.start)
      if (minutes >= 0) gaps.set(r.id, minutes)
    }
    previousStart = r.start
  }
  return gaps
}
