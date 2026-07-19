// Caché en memoria de los días ya cargados. Permite pintar al instante lo
// último conocido mientras se refresca en segundo plano, y localizar un
// evento para editarlo sin otra petición.

import type { BabyEvent, DayData } from './types'

const dayCache = new Map<string, DayData>()

export function cacheDay(d: DayData): void {
  dayCache.set(d.date, d)
}

export function getCachedDay(date: string): DayData | null {
  return dayCache.get(date) ?? null
}

export function findCachedEvent(id: string): BabyEvent | null {
  for (const day of dayCache.values()) {
    for (const e of day.events) {
      if (e.id === id) return e
    }
    if (day.activeSleep?.id === id) return day.activeSleep
    for (const e of [day.last.feed, day.last.diaper, day.last.sleepEnd]) {
      if (e?.id === id) return e
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
}
