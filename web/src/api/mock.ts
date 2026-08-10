// API simulada en memoria para desarrollo local sin Google (VITE_USE_MOCK=1).
// Reproduce el comportamiento del backend real: idempotencia por id, un solo
// sueño sin cerrar, últimos registros globales, ajustes compartidos y totales
// del día de vida. Los datos se pierden al recargar.

import { addDays, addMinutes, diffMinutes, nowMadrid } from '../lib/dates'
import { STALE_SLEEP_MIN } from '../lib/derive'
import { lifeDayNumber, lifeDayRange, lifeDayTotals } from '../lib/lifeday'
import { feedIsEmpty } from '../lib/records'
import type {
  BabyRecord,
  DayData,
  DiaperRecord,
  FeedRecord,
  History,
  HistoryDay,
  LifeDay,
  RecordInput,
  RecordType,
  Settings,
  SleepRecord,
  WeightRecord,
} from '../types'
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

const AUDIT = { createdBy: 'ana@example.com', updatedBy: null, updatedAt: null }

function seedRecords(): BabyRecord[] {
  const today = nowMadrid().slice(0, 10)
  const yesterday = addDays(today, -1)
  return [
    {
      ...AUDIT,
      id: 'seed-noche',
      type: 'sleep',
      start: `${yesterday} 21:15`,
      end: `${today} 07:30`,
      durationMin: diffMinutes(`${yesterday} 21:15`, `${today} 07:30`),
      kind: 'nocturno',
      notes: '',
      createdAt: `${today} 07:30`,
    },
    {
      ...AUDIT,
      id: 'seed-toma-mixta',
      type: 'feed',
      start: `${today} 07:45`,
      end: `${today} 08:14`,
      durationMin: 29,
      breastMin: 12,
      breastSide: 'izquierdo',
      expressedMl: 30,
      formulaMl: 35,
      notes: '',
      createdBy: 'luis@example.com',
      createdAt: `${today} 08:15`,
    },
    {
      ...AUDIT,
      id: 'seed-panal',
      type: 'diaper',
      start: `${today} 08:10`,
      pee: true,
      poop: true,
      consistency: 'pastosa',
      notes: '',
      createdAt: `${today} 08:10`,
    },
    {
      ...AUDIT,
      id: 'seed-siesta',
      type: 'sleep',
      start: `${today} 09:30`,
      end: `${today} 10:45`,
      durationMin: 75,
      kind: 'siesta',
      notes: '',
      createdBy: 'luis@example.com',
      createdAt: `${today} 10:45`,
    },
    {
      ...AUDIT,
      id: 'seed-biberon',
      type: 'feed',
      start: `${today} 11:00`,
      end: `${today} 11:12`,
      durationMin: 12,
      breastMin: 0,
      breastSide: null,
      expressedMl: 90,
      formulaMl: 0,
      notes: '',
      createdAt: `${today} 11:12`,
    },
    {
      ...AUDIT,
      id: 'seed-pis',
      type: 'diaper',
      start: `${today} 12:20`,
      pee: true,
      poop: false,
      consistency: null,
      notes: '',
      createdAt: `${today} 12:20`,
    },
    {
      ...AUDIT,
      id: 'seed-peso',
      type: 'weight',
      start: `${today} 09:00`,
      grams: 3210,
      notes: '',
      createdAt: `${today} 09:00`,
    },
  ]
}

export function createMockApi({ latencyMs = DEFAULT_LATENCY_MS } = {}): Api {
  const wait = waiter(latencyMs)
  const records = new Map<string, BabyRecord>(seedRecords().map((r) => [r.id, r]))
  const me = { email: 'ana@example.com', name: 'Ana' }
  // Nacimiento cinco días antes de hoy, para que el día de vida sea visible.
  let settings: Settings = {
    birth: `${addDays(nowMadrid().slice(0, 10), -4)} 09:17`,
    birthWeightG: 3420,
  }

  const openSleepOther = (exceptId?: string): SleepRecord | null => {
    for (const r of records.values()) {
      if (r.type === 'sleep' && !r.end && r.id !== exceptId) return r
    }
    return null
  }

  /** Comprobaciones que hace el backend real antes de guardar. */
  const check = (input: RecordInput) => {
    if (input.type === 'feed') {
      if (!input.end) throw new ApiError('VALIDATION', 'Falta la hora de fin de la toma.')
      if (feedIsEmpty(input)) {
        throw new ApiError(
          'VALIDATION',
          'La toma necesita al menos un componente: pecho, leche extraída o fórmula.'
        )
      }
    }
    if (input.type === 'diaper' && !input.pee && !input.poop) {
      throw new ApiError('VALIDATION', 'El pañal tiene que llevar pis, caca o las dos cosas.')
    }
    if (input.type === 'weight' && !input.grams) {
      throw new ApiError('VALIDATION', 'Falta Gramos.')
    }
    if (input.type === 'sleep' && !input.end && openSleepOther(input.id)) {
      throw new ApiError('ACTIVE_SLEEP', 'Ya hay un sueño en curso. Finalízalo antes de empezar otro.')
    }
  }

  /** Lo que el backend deriva al guardar. */
  const derived = (input: RecordInput): RecordInput => {
    if (input.type === 'sleep' || input.type === 'feed') {
      return { ...input, durationMin: input.end ? diffMinutes(input.start, input.end) : null }
    }
    if (input.type === 'diaper' && !input.poop) return { ...input, consistency: null }
    return input
  }

  const currentLifeDay = (all: BabyRecord[], now: string): LifeDay | null => {
    if (!settings.birth) return null
    const number = lifeDayNumber(settings.birth, now)
    if (number < 1) return null
    const range = lifeDayRange(settings.birth, number)
    return {
      number,
      ...range,
      totals: lifeDayTotals(all, range.start, range.end),
      records: all.filter((r) => r.start >= range.start && r.start < range.end),
    }
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
      const all = [...records.values()].sort((a, b) => (a.start < b.start ? -1 : 1))
      const dayStart = `${date} 00:00`
      const dayEnd = `${addDays(date, 1)} 00:00`
      const touches = (r: BabyRecord) => {
        let end = (r.type === 'sleep' || r.type === 'feed' ? r.end : null) ?? r.start
        if (r.type === 'sleep' && !r.end) {
          // Un cronómetro olvidado deja de extenderse pasado el umbral.
          const cap = addMinutes(r.start, STALE_SLEEP_MIN)
          end = now < cap ? now : cap
        }
        if (end < r.start) end = r.start
        return r.start < dayEnd && end >= dayStart && !(r.start < dayStart && end === dayStart)
      }

      let lastFeed: FeedRecord | null = null
      let previousFeed: FeedRecord | null = null
      let lastDiaper: DiaperRecord | null = null
      let lastPee: DiaperRecord | null = null
      let lastPoop: DiaperRecord | null = null
      let lastSleepEnd: SleepRecord | null = null
      let lastWeight: WeightRecord | null = null
      let openSleep: SleepRecord | null = null
      for (const r of all) {
        if (r.type === 'feed') {
          if (!lastFeed || r.start > lastFeed.start) lastFeed = r
          if (r.start < dayStart && (!previousFeed || r.start > previousFeed.start)) previousFeed = r
        }
        if (r.type === 'diaper') {
          if (!lastDiaper || r.start > lastDiaper.start) lastDiaper = r
          if (r.pee && (!lastPee || r.start > lastPee.start)) lastPee = r
          if (r.poop && (!lastPoop || r.start > lastPoop.start)) lastPoop = r
        }
        if (r.type === 'sleep') {
          if (!r.end) openSleep = r
          else if (!lastSleepEnd || r.end > lastSleepEnd.end!) lastSleepEnd = r
        }
        if (r.type === 'weight' && (!lastWeight || r.start > lastWeight.start)) lastWeight = r
      }

      return {
        date,
        records: all.filter(touches),
        openSleep,
        last: {
          feed: lastFeed,
          diaper: lastDiaper,
          pee: lastPee,
          poop: lastPoop,
          sleepEnd: lastSleepEnd,
          weight: lastWeight,
        },
        previousFeed,
        users: USERS,
        serverNow: now,
        settings,
        lifeDay: currentLifeDay(all, now),
      }
    },

    async getHistory(days: number): Promise<History> {
      await wait()
      const all = [...records.values()].sort((a, b) => (a.start < b.start ? -1 : 1))
      const weights = all.filter((r): r is WeightRecord => r.type === 'weight')
      if (!settings.birth) return { birth: null, days: [], weights }
      const now = nowMadrid()
      const current = lifeDayNumber(settings.birth, now)
      if (current < 1) return { birth: settings.birth, days: [], weights }
      const wanted = Math.min(60, Math.max(1, days || 14))
      const out: HistoryDay[] = []
      for (let n = current; n > 0 && out.length < wanted; n--) {
        const range = lifeDayRange(settings.birth, n)
        const weights = all.filter(
          (r) => r.type === 'weight' && r.start >= range.start && r.start < range.end
        )
        out.push({
          number: n,
          ...range,
          totals: lifeDayTotals(all, range.start, range.end),
          weightG:
            weights.length > 0
              ? (weights.sort((a, b) => (a.start < b.start ? -1 : 1)).at(-1) as { grams: number })
                  .grams
              : null,
        })
      }
      return { birth: settings.birth, days: out, weights }
    },

    async createRecord(input: RecordInput): Promise<BabyRecord> {
      await wait()
      const existing = records.get(input.id)
      if (existing) return existing
      check(input)
      const now = nowMadrid()
      const record = {
        ...derived(input),
        createdBy: me.email,
        createdAt: now,
        updatedBy: null,
        updatedAt: null,
      } as BabyRecord
      records.set(record.id, record)
      return record
    },

    async updateRecord(input: RecordInput): Promise<BabyRecord> {
      await wait()
      const current = records.get(input.id)
      if (!current) throw new ApiError('NOT_FOUND', 'El registro ya no existe.')
      check(input)
      const record = {
        ...derived(input),
        createdBy: current.createdBy,
        createdAt: current.createdAt,
        updatedBy: me.email,
        updatedAt: nowMadrid(),
      } as BabyRecord
      records.set(record.id, record)
      return record
    },

    async deleteRecord(_type: RecordType, id: string): Promise<void> {
      await wait()
      records.delete(id)
    },

    async updateSettings(next: Settings): Promise<Settings> {
      await wait()
      settings = next
      return settings
    },
  }
}
