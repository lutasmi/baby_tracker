// Derivación del estado del bebé y de los resúmenes diarios a partir de la
// lista de eventos. Lógica pura: recibe datos y el instante "ahora" y no
// consulta relojes ni la red.
//
// Principio de la v2: la aplicación afirma lo que se ha registrado, no lo que
// está ocurriendo. Un sueño sin cerrar puede ser un bebé durmiendo ahora mismo
// o un cronómetro que alguien olvidó detener, y pasado cierto tiempo lo segundo
// es mucho más probable que lo primero.

import type { BabyEvent, FeedComponents } from '../types'
import { diffMinutes, minutesInDay, timeOf } from './dates'
import { componentsOf, emptyComponents, quantifiableMl } from './feed'

/**
 * A partir de aquí, un sueño sin cerrar deja de considerarse en curso: ni se
 * cuenta en los totales ni se afirma que el bebé sigue dormido.
 */
export const STALE_SLEEP_MIN = 14 * 60

export function isOpenSleep(e: BabyEvent): boolean {
  return e.type === 'sleep' && !e.end
}

/** Sueño sin cerrar que ya no resulta creíble: cronómetro olvidado. */
export function isStaleSleep(e: BabyEvent, now: string): boolean {
  return isOpenSleep(e) && diffMinutes(e.start, now) > STALE_SLEEP_MIN
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
  activeSleep: BabyEvent | null,
  lastSleepEnd: BabyEvent | null,
  now: string
): BabyStatus {
  const stale = activeSleep ? isStaleSleep(activeSleep, now) : false
  if (activeSleep && !stale) {
    return { state: 'asleep', since: activeSleep.start, staleTimer: false }
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
export function sleepMinutesOnDate(events: BabyEvent[], date: string, now: string): number {
  let total = 0
  for (const e of events) {
    if (e.type !== 'sleep') continue
    if (isStaleSleep(e, now)) continue
    const end = e.end ?? now
    if (diffMinutes(e.start, end) <= 0) continue
    total += minutesInDay(e.start, end, date)
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
export function daySummary(events: BabyEvent[], date: string, now: string): DaySummary {
  const startsOn = (e: BabyEvent) => e.start.slice(0, 10) === date
  const feeds = events.filter((e) => e.type === 'feed' && startsOn(e))
  let milkMl = 0
  let breastMin = 0
  for (const e of feeds) {
    const c = componentsOf(e)
    milkMl += quantifiableMl(c)
    breastMin += c.breastMin
  }
  return {
    sleepMin: sleepMinutesOnDate(events, date, now),
    feeds: feeds.length,
    milkMl,
    breastMin,
    diapers: events.filter((e) => e.type === 'diaper' && startsOn(e)).length,
    baths: events.filter((e) => e.type === 'bath' && startsOn(e)).length,
  }
}

/** Entre las 20:00 y las 07:59 se asume sueño nocturno; el resto, siesta. */
export function guessSleepSubtype(startDt: string): 'siesta' | 'nocturno' {
  const time = timeOf(startDt)
  return time >= '20:00' || time < '08:00' ? 'nocturno' : 'siesta'
}

/**
 * Componentes con los que se abre el formulario de toma: repetir la última
 * toma es casi siempre lo correcto y ahorra pulsaciones. El pecho se alterna
 * respecto al que se usó la vez anterior.
 *
 * Sin tomas previas no se preselecciona nada: es preferible un toque más a
 * inventar una cantidad.
 */
export function feedDefaults(lastFeed: BabyEvent | null): FeedComponents {
  if (!lastFeed) return emptyComponents()
  const last = componentsOf(lastFeed)
  return {
    ...last,
    breastSide:
      last.breastSide === 'izquierdo'
        ? 'derecho'
        : last.breastSide === 'derecho'
          ? 'izquierdo'
          : last.breastSide,
    // Lo "mixto" de la v1 no se puede repetir: no sabemos de qué era.
    mixtaMl: 0,
    formulaMl: last.mixtaMl > 0 ? last.mixtaMl : last.formulaMl,
  }
}
