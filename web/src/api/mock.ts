// API simulada en memoria para desarrollo local sin Google (VITE_USE_MOCK=1).
// Reproduce el comportamiento del backend real: idempotencia por id, un solo
// sueño sin cerrar, últimos eventos globales, ajustes compartidos y totales del
// día de vida. Los datos se pierden al recargar.

import { addDays, addMinutes, diffMinutes, nowMadrid } from '../lib/dates'
import { STALE_SLEEP_MIN } from '../lib/derive'
import { componentsOf, feedSubtypeFor, isEmpty, quantifiableMl } from '../lib/feed'
import { lifeDayNumber, lifeDayRange, lifeDayTotals } from '../lib/lifeday'
import type { BabyEvent, DayData, EventInput, LifeDay, Settings } from '../types'
import { ApiError, type Api } from './types'

// Latencia simulada: la del backend real es de 1-3 s y la interfaz debe
// aguantarla. Los tests la ponen a 0.
const DEFAULT_LATENCY_MS = 300

const USERS: Record<string, string> = {
  'ana@example.com': 'Ana',
  'luis@example.com': 'Luis',
}

function waiter(latencyMs: number) {
  return () => new Promise<void>((r) => setTimeout(r, latencyMs))
}

function seedEvents(): BabyEvent[] {
  const today = nowMadrid().slice(0, 10)
  const yesterday = addDays(today, -1)
  const base = {
    durationMin: null,
    quantityMl: null,
    detail: null,
    components: null,
    notes: '',
    updatedBy: null,
    updatedAt: null,
  }
  const mk = (
    e: Partial<BabyEvent> & Pick<BabyEvent, 'id' | 'type' | 'subtype' | 'start'>
  ): BabyEvent => ({
    ...base,
    end: null,
    createdBy: 'ana@example.com',
    createdAt: e.start,
    ...e,
  })
  const comps = (p: Partial<BabyEvent['components'] & object>) => ({
    breastMin: 0,
    breastSide: null,
    expressedMl: 0,
    formulaMl: 0,
    mixtaMl: 0,
    ...p,
  })
  return [
    mk({
      id: 'seed-noche',
      type: 'sleep',
      subtype: 'nocturno',
      start: `${yesterday} 21:15`,
      end: `${today} 07:30`,
      durationMin: diffMinutes(`${yesterday} 21:15`, `${today} 07:30`),
    }),
    mk({
      id: 'seed-toma-mixta',
      type: 'feed',
      subtype: 'mixta',
      start: `${today} 07:45`,
      end: `${today} 08:14`,
      durationMin: 29,
      quantityMl: 65,
      detail: 'mixta',
      components: comps({ breastMin: 12, breastSide: 'izquierdo', expressedMl: 30, formulaMl: 35 }),
      createdBy: 'luis@example.com',
    }),
    mk({
      id: 'seed-panal',
      type: 'diaper',
      subtype: 'ambos',
      start: `${today} 08:10`,
      detail: 'pastosa',
    }),
    mk({
      id: 'seed-siesta',
      type: 'sleep',
      subtype: 'siesta',
      start: `${today} 09:30`,
      end: `${today} 10:45`,
      durationMin: 75,
      createdBy: 'luis@example.com',
    }),
    // Registro con el formato de la v1 (sin componentes): comprueba que la
    // aplicación sigue leyendo lo que ya estaba guardado.
    mk({
      id: 'seed-biberon-v1',
      type: 'feed',
      subtype: 'biberon',
      start: `${today} 11:00`,
      quantityMl: 90,
      detail: 'materna',
    }),
    mk({ id: 'seed-pis', type: 'diaper', subtype: 'pipi', start: `${today} 12:20` }),
  ]
}

export function createMockApi({ latencyMs = DEFAULT_LATENCY_MS } = {}): Api {
  const wait = waiter(latencyMs)
  const events = new Map<string, BabyEvent>(seedEvents().map((e) => [e.id, e]))
  const me = { email: 'ana@example.com', name: 'Ana' }
  // Nacimiento cinco días antes que hoy, para que el día de vida sea visible.
  let settings: Settings = {
    birth: `${addDays(nowMadrid().slice(0, 10), -4)} 09:17`,
    goals: { pees: 6, poops: 3, milkMl: 400 },
  }

  const openSleep = (exceptId?: string): BabyEvent | null => {
    for (const e of events.values()) {
      if (e.type === 'sleep' && !e.end && e.id !== exceptId) return e
    }
    return null
  }

  /** Deriva lo que el backend real calcula al guardar. */
  const derived = (input: EventInput): Partial<BabyEvent> => {
    if (input.type !== 'feed') {
      return {
        durationMin: input.end ? diffMinutes(input.start, input.end) : input.durationMin,
      }
    }
    const c = input.components ?? componentsOf({ ...input } as BabyEvent)
    if (isEmpty(c)) {
      throw new ApiError(
        'VALIDATION',
        'La toma necesita al menos un componente: pecho, leche extraída o fórmula.'
      )
    }
    return {
      subtype: feedSubtypeFor(c),
      components: c,
      quantityMl: quantifiableMl(c) || null,
      durationMin: input.end ? diffMinutes(input.start, input.end) : null,
    }
  }

  const currentLifeDay = (all: BabyEvent[], now: string): LifeDay | null => {
    if (!settings.birth) return null
    const number = lifeDayNumber(settings.birth, now)
    if (number < 1) return null
    const range = lifeDayRange(settings.birth, number)
    return { number, ...range, totals: lifeDayTotals(all, range.start, range.end) }
  }

  return {
    async login() {
      await wait()
      return { token: 'mock-token', user: me }
    },

    async logout() {
      await wait()
    },

    async getDay(date: string): Promise<DayData> {
      await wait()
      const now = nowMadrid()
      const all = [...events.values()].sort((a, b) => (a.start < b.start ? -1 : 1))
      const dayEnd = `${addDays(date, 1)} 00:00`
      const dayStart = `${date} 00:00`
      const touches = (e: BabyEvent) => {
        let end = e.end ?? e.start
        if (e.type === 'sleep' && !e.end) {
          // Un cronómetro olvidado deja de extenderse pasado el umbral.
          const cap = addMinutes(e.start, STALE_SLEEP_MIN)
          end = now < cap ? now : cap
        }
        if (end < e.start) end = e.start
        return e.start < dayEnd && end >= dayStart && !(e.start < dayStart && end === dayStart)
      }
      let lastFeed: BabyEvent | null = null
      let lastDiaper: BabyEvent | null = null
      let lastSleepEnd: BabyEvent | null = null
      for (const e of all) {
        if (e.type === 'feed' && (!lastFeed || e.start > lastFeed.start)) lastFeed = e
        if (e.type === 'diaper' && (!lastDiaper || e.start > lastDiaper.start)) lastDiaper = e
        if (e.type === 'sleep' && e.end && (!lastSleepEnd || e.end > lastSleepEnd.end!)) {
          lastSleepEnd = e
        }
      }
      return {
        date,
        events: all.filter(touches),
        activeSleep: openSleep(),
        last: { feed: lastFeed, diaper: lastDiaper, sleepEnd: lastSleepEnd },
        users: USERS,
        serverNow: now,
        settings,
        lifeDay: currentLifeDay(all, now),
      }
    },

    async createEvent(input: EventInput): Promise<BabyEvent> {
      await wait()
      const existing = events.get(input.id)
      if (existing) return existing
      if (input.type === 'sleep' && !input.end && openSleep(input.id)) {
        throw new ApiError(
          'ACTIVE_SLEEP',
          'Ya hay un sueño en curso. Finalízalo antes de empezar otro.'
        )
      }
      const now = nowMadrid()
      const e: BabyEvent = {
        ...input,
        ...derived(input),
        createdBy: me.email,
        createdAt: now,
        updatedBy: null,
        updatedAt: null,
      }
      events.set(e.id, e)
      return e
    },

    async updateEvent(input: EventInput): Promise<BabyEvent> {
      await wait()
      const current = events.get(input.id)
      if (!current) throw new ApiError('NOT_FOUND', 'El registro ya no existe.')
      if (input.type === 'sleep' && !input.end && openSleep(input.id)) {
        throw new ApiError(
          'ACTIVE_SLEEP',
          'Ya hay un sueño en curso. Finalízalo antes de empezar otro.'
        )
      }
      const e: BabyEvent = {
        ...current,
        ...input,
        ...derived(input),
        updatedBy: me.email,
        updatedAt: nowMadrid(),
      }
      events.set(e.id, e)
      return e
    },

    async deleteEvent(id: string): Promise<void> {
      await wait()
      events.delete(id)
    },

    async updateSettings(next: Settings): Promise<Settings> {
      await wait()
      settings = next
      return settings
    },
  }
}
