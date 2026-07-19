// Derivación del estado del bebé y de los resúmenes diarios a partir de la
// lista de eventos. Lógica pura: recibe datos y el instante "ahora" y no
// consulta relojes ni la red.

import type { BabyEvent } from '../types'
import { diffMinutes, minutesInDay, timeOf } from './dates'

export interface BabyStatus {
  state: 'asleep' | 'awake' | 'unknown'
  /** Instante en que empezó el estado (inicio del sueño o último despertar). */
  since: string | null
}

export function babyStatus(
  activeSleep: BabyEvent | null,
  lastSleepEnd: BabyEvent | null
): BabyStatus {
  if (activeSleep) return { state: 'asleep', since: activeSleep.start }
  if (lastSleepEnd && lastSleepEnd.end) return { state: 'awake', since: lastSleepEnd.end }
  return { state: 'unknown', since: null }
}

/**
 * Minutos dormidos durante un día, recortando los sueños que cruzan la
 * medianoche y contando el sueño activo hasta "ahora".
 */
export function sleepMinutesOnDate(events: BabyEvent[], date: string, now: string): number {
  let total = 0
  for (const e of events) {
    if (e.type !== 'sleep') continue
    const end = e.end ?? now
    if (diffMinutes(e.start, end) <= 0) continue
    total += minutesInDay(e.start, end, date)
  }
  return total
}

export interface DaySummary {
  sleepMin: number
  feeds: number
  bottleMl: number
  diapers: number
  baths: number
}

/** Resumen básico de un día: lo que aparece en la cabecera de la cronología. */
export function daySummary(events: BabyEvent[], date: string, now: string): DaySummary {
  const startsOn = (e: BabyEvent) => e.start.slice(0, 10) === date
  return {
    sleepMin: sleepMinutesOnDate(events, date, now),
    feeds: events.filter((e) => e.type === 'feed' && startsOn(e)).length,
    bottleMl: events
      .filter((e) => e.type === 'feed' && e.subtype === 'biberon' && startsOn(e))
      .reduce((sum, e) => sum + (e.quantityMl ?? 0), 0),
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
 * Valores por defecto para el formulario de toma: repetir lo último que se
 * usó es casi siempre lo correcto y ahorra pulsaciones.
 */
export function feedDefaults(lastFeed: BabyEvent | null): {
  subtype: 'biberon' | 'lactancia'
  quantityMl: number
  milkType: string
  breast: string
} {
  const d = { subtype: 'biberon' as const, quantityMl: 120, milkType: 'materna', breast: 'izquierdo' }
  if (!lastFeed) return d
  if (lastFeed.subtype === 'lactancia') {
    return {
      ...d,
      subtype: 'lactancia',
      // Alternar el pecho respecto a la última lactancia es el valor más útil.
      breast:
        lastFeed.detail === 'izquierdo'
          ? 'derecho'
          : lastFeed.detail === 'derecho'
            ? 'izquierdo'
            : d.breast,
    }
  }
  return {
    ...d,
    subtype: 'biberon',
    quantityMl: lastFeed.quantityMl ?? d.quantityMl,
    milkType: lastFeed.detail ?? d.milkType,
  }
}
