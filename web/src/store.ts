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
    for (const r of [day.last.feed, day.last.diaper, day.last.sleepEnd]) {
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
}
