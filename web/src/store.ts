// Caché en memoria de los días ya cargados. Permite pintar al instante lo
// último conocido mientras se refresca en segundo plano, y localizar un
// registro para editarlo sin otra petición.

import type { BabyRecord, DayData } from './types'

const dayCache = new Map<string, DayData>()

export function cacheDay(d: DayData): void {
  dayCache.set(d.date, d)
}

export function getCachedDay(date: string): DayData | null {
  return dayCache.get(date) ?? null
}

export function findCachedRecord(id: string): BabyRecord | null {
  for (const day of dayCache.values()) {
    for (const r of day.records) {
      if (r.id === id) return r
    }
    if (day.openSleep?.id === id) return day.openSleep
    for (const r of [day.last.feed, day.last.diaper, day.last.poop, day.last.sleepEnd, day.last.weight, day.previousFeed]) {
      if (r?.id === id) return r
    }
  }
  return null
}

/** Nombre visible de un usuario a partir de su email. */
export function userName(email: string | null): string {
  if (!email) return ''
  for (const day of dayCache.values()) {
    const name = day.users[email]
    if (name) return name
  }
  return email.split('@')[0]
}

export function clearDayCache(): void {
  dayCache.clear()
  inFlight.clear()
}

// Peticiones en curso, por fecha. La pantalla principal y la cronología piden
// el mismo día a la vez más de una vez: sin esto son dos viajes de 1-3 s para
// traer lo mismo.
const inFlight = new Map<string, Promise<DayData>>()

/** Pide un día y lo guarda en la caché, sin repetir una petición en curso. */
export function fetchDay(date: string, getDay: (d: string) => Promise<DayData>): Promise<DayData> {
  const curso = inFlight.get(date)
  if (curso) return curso

  const peticion = getDay(date)
    .then((day) => {
      cacheDay(day)
      return day
    })
    .finally(() => inFlight.delete(date))

  inFlight.set(date, peticion)
  return peticion
}
