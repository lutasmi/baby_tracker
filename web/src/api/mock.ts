// API simulada en memoria para desarrollo local sin Google (VITE_USE_MOCK=1).
// Reproduce el comportamiento del backend real: idempotencia por id, un solo
// sueño activo y últimos eventos globales. Los datos se pierden al recargar.

import { addDays, diffMinutes, nowMadrid } from '../lib/dates'
import type { BabyEvent, DayData, EventInput } from '../types'
import { ApiError, type Api } from './types'

const LATENCY_MS = 300

const USERS: Record<string, string> = {
  'ana@example.com': 'Ana',
  'luis@example.com': 'Luis',
}

function wait(): Promise<void> {
  return new Promise((r) => setTimeout(r, LATENCY_MS))
}

function seedEvents(): BabyEvent[] {
  const today = nowMadrid().slice(0, 10)
  const yesterday = addDays(today, -1)
  const base = {
    durationMin: null,
    quantityMl: null,
    detail: null,
    notes: '',
    updatedBy: null,
    updatedAt: null,
  }
  const mk = (e: Partial<BabyEvent> & Pick<BabyEvent, 'id' | 'type' | 'subtype' | 'start'>): BabyEvent => ({
    ...base,
    end: null,
    createdBy: 'ana@example.com',
    createdAt: e.start,
    ...e,
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
      id: 'seed-biberon',
      type: 'feed',
      subtype: 'biberon',
      start: `${today} 07:45`,
      quantityMl: 120,
      detail: 'materna',
      createdBy: 'luis@example.com',
    }),
    mk({ id: 'seed-panal', type: 'diaper', subtype: 'ambos', start: `${today} 08:10`, detail: 'pastosa' }),
    mk({
      id: 'seed-siesta',
      type: 'sleep',
      subtype: 'siesta',
      start: `${today} 09:30`,
      end: `${today} 10:45`,
      durationMin: 75,
      createdBy: 'luis@example.com',
    }),
    mk({
      id: 'seed-lactancia',
      type: 'feed',
      subtype: 'lactancia',
      start: `${today} 11:00`,
      end: `${today} 11:20`,
      durationMin: 20,
      detail: 'izquierdo',
    }),
  ]
}

export function createMockApi(): Api {
  const events = new Map<string, BabyEvent>(seedEvents().map((e) => [e.id, e]))
  const me = { email: 'ana@example.com', name: 'Ana' }

  const openSleep = (exceptId?: string): BabyEvent | null => {
    for (const e of events.values()) {
      if (e.type === 'sleep' && !e.end && e.id !== exceptId) return e
    }
    return null
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
        let end = e.end ?? (e.type === 'sleep' ? now : e.start)
        if (end < e.start) end = e.start
        return e.start < dayEnd && end >= dayStart && !(e.start < dayStart && end === dayStart)
      }
      let lastFeed: BabyEvent | null = null
      let lastDiaper: BabyEvent | null = null
      let lastSleepEnd: BabyEvent | null = null
      for (const e of all) {
        if (e.type === 'feed' && (!lastFeed || e.start > lastFeed.start)) lastFeed = e
        if (e.type === 'diaper' && (!lastDiaper || e.start > lastDiaper.start)) lastDiaper = e
        if (e.type === 'sleep' && e.end && (!lastSleepEnd || e.end > lastSleepEnd.end!)) lastSleepEnd = e
      }
      return {
        date,
        events: all.filter(touches),
        activeSleep: openSleep(),
        last: { feed: lastFeed, diaper: lastDiaper, sleepEnd: lastSleepEnd },
        users: USERS,
        serverNow: now,
      }
    },

    async createEvent(input: EventInput): Promise<BabyEvent> {
      await wait()
      const existing = events.get(input.id)
      if (existing) return existing
      if (input.type === 'sleep' && !input.end && openSleep(input.id)) {
        throw new ApiError('ACTIVE_SLEEP', 'Ya hay un sueño en curso. Finalízalo antes de empezar otro.')
      }
      const now = nowMadrid()
      const e: BabyEvent = {
        ...input,
        durationMin: input.end ? diffMinutes(input.start, input.end) : input.durationMin,
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
        throw new ApiError('ACTIVE_SLEEP', 'Ya hay un sueño en curso. Finalízalo antes de empezar otro.')
      }
      const e: BabyEvent = {
        ...current,
        ...input,
        durationMin: input.end ? diffMinutes(input.start, input.end) : input.durationMin,
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
  }
}
