// Constructores de registros para los tests. No entra en el bundle: solo lo
// importan los archivos *.test.*.

import type {
  BathRecord,
  DayData,
  DiaperRecord,
  FeedRecord,
  HistoryDay,
  LifeDayTotals,
  SleepRecord,
  WeightRecord,
} from './types'

let seq = 0
const nextId = () => `test-${++seq}`

const AUDIT = {
  createdBy: 'ana@example.com',
  createdAt: '2026-08-07 12:00',
  updatedBy: null,
  updatedAt: null,
}

export function aSleep(p: Partial<SleepRecord> = {}): SleepRecord {
  return {
    ...AUDIT,
    id: nextId(),
    type: 'sleep',
    start: '2026-08-07 10:00',
    end: null,
    durationMin: null,
    kind: 'siesta',
    notes: '',
    ...p,
  }
}

export function aFeed(p: Partial<FeedRecord> = {}): FeedRecord {
  return {
    ...AUDIT,
    id: nextId(),
    type: 'feed',
    start: '2026-08-07 10:00',
    end: '2026-08-07 10:20',
    durationMin: 20,
    breastMin: 0,
    breastSide: null,
    expressedMl: 0,
    formulaMl: 0,
    notes: '',
    ...p,
  }
}

export function aDiaper(p: Partial<DiaperRecord> = {}): DiaperRecord {
  return {
    ...AUDIT,
    id: nextId(),
    type: 'diaper',
    start: '2026-08-07 08:00',
    pee: true,
    peeAmount: null,
    poop: false,
    consistency: null,
    notes: '',
    ...p,
  }
}

export function aBath(p: Partial<BathRecord> = {}): BathRecord {
  return {
    ...AUDIT,
    id: nextId(),
    type: 'bath',
    start: '2026-08-07 19:00',
    kind: 'completo',
    durationMin: 0,
    notes: '',
    ...p,
  }
}

export function aWeight(p: Partial<WeightRecord> = {}): WeightRecord {
  return {
    ...AUDIT,
    id: nextId(),
    type: 'weight',
    start: '2026-08-07 09:00',
    grams: 3210,
    notes: '',
    ...p,
  }
}

export function aDay(p: Partial<DayData> = {}): DayData {
  return {
    date: '2026-08-07',
    records: [],
    openSleep: null,
    last: { feed: null, diaper: null, pee: null, poop: null, sleepEnd: null, weight: null },
    previousFeed: null,
    users: { 'ana@example.com': 'Ana' },
    serverNow: '2026-08-07 12:00',
    settings: { birth: null, birthWeightG: 0 },
    lifeDay: null,
    ...p,
  }
}

export function someTotals(p: Partial<LifeDayTotals> = {}): LifeDayTotals {
  return {
    pees: 0,
    poops: 0,
    diapers: 0,
    feeds: 0,
    breastMin: 0,
    expressedMl: 0,
    formulaMl: 0,
    milkMl: 0,
    ...p,
  }
}

export function aHistoryDay(number: number, p: Partial<HistoryDay> = {}): HistoryDay {
  return {
    number,
    start: '2026-08-07 09:17',
    end: '2026-08-08 09:17',
    totals: someTotals(),
    weightG: null,
    ...p,
  }
}
