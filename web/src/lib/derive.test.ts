import { describe, expect, it } from 'vitest'
import type { BabyEvent } from '../types'
import { babyStatus, daySummary, feedDefaults, guessSleepSubtype, sleepMinutesOnDate } from './derive'

let seq = 0

function ev(partial: Partial<BabyEvent>): BabyEvent {
  return {
    id: `test-${++seq}`,
    type: 'sleep',
    subtype: 'siesta',
    start: '2026-07-15 10:00',
    end: null,
    durationMin: null,
    quantityMl: null,
    detail: null,
    notes: '',
    createdBy: 'ana@example.com',
    createdAt: '2026-07-15 10:00',
    updatedBy: null,
    updatedAt: null,
    ...partial,
  }
}

describe('babyStatus', () => {
  it('dormido si hay un sueño activo', () => {
    const s = babyStatus(ev({ start: '2026-07-15 14:00' }), null)
    expect(s).toEqual({ state: 'asleep', since: '2026-07-15 14:00' })
  })

  it('despierto desde el fin del último sueño', () => {
    const s = babyStatus(null, ev({ start: '2026-07-15 12:00', end: '2026-07-15 13:15' }))
    expect(s).toEqual({ state: 'awake', since: '2026-07-15 13:15' })
  })

  it('desconocido si no hay ningún sueño registrado', () => {
    expect(babyStatus(null, null).state).toBe('unknown')
  })
})

describe('sleepMinutesOnDate', () => {
  const day = '2026-07-15'

  it('suma solo la parte del sueño nocturno que cae en el día', () => {
    const events = [
      ev({ start: '2026-07-14 21:30', end: '2026-07-15 07:00' }), // 420 hoy
      ev({ start: '2026-07-15 10:00', end: '2026-07-15 11:30' }), // 90
    ]
    expect(sleepMinutesOnDate(events, day, '2026-07-15 12:00')).toBe(510)
  })

  it('cuenta el sueño activo hasta ahora', () => {
    const events = [ev({ start: '2026-07-15 14:00', end: null })]
    expect(sleepMinutesOnDate(events, day, '2026-07-15 14:45')).toBe(45)
  })

  it('ignora los eventos que no son sueño y los intervalos vacíos', () => {
    const events = [
      ev({ type: 'feed', subtype: 'biberon', start: '2026-07-15 09:00', end: null }),
      ev({ start: '2026-07-15 10:00', end: '2026-07-15 10:00' }),
    ]
    expect(sleepMinutesOnDate(events, day, '2026-07-15 12:00')).toBe(0)
  })
})

describe('daySummary', () => {
  it('cuenta tomas, ml de biberón, pañales y baños del día', () => {
    const events = [
      ev({ type: 'feed', subtype: 'biberon', start: '2026-07-15 09:00', quantityMl: 120 }),
      ev({ type: 'feed', subtype: 'biberon', start: '2026-07-15 13:00', quantityMl: 150 }),
      ev({ type: 'feed', subtype: 'lactancia', start: '2026-07-15 17:00', end: '2026-07-15 17:20' }),
      ev({ type: 'diaper', subtype: 'pipi', start: '2026-07-15 08:00' }),
      ev({ type: 'bath', subtype: 'completo', start: '2026-07-15 19:00' }),
      // De otro día: no cuenta.
      ev({ type: 'feed', subtype: 'biberon', start: '2026-07-14 09:00', quantityMl: 999 }),
    ]
    const s = daySummary(events, '2026-07-15', '2026-07-15 20:00')
    expect(s.feeds).toBe(3)
    expect(s.bottleMl).toBe(270)
    expect(s.diapers).toBe(1)
    expect(s.baths).toBe(1)
  })
})

describe('guessSleepSubtype', () => {
  it('clasifica el tramo nocturno', () => {
    expect(guessSleepSubtype('2026-07-15 20:00')).toBe('nocturno')
    expect(guessSleepSubtype('2026-07-15 23:30')).toBe('nocturno')
    expect(guessSleepSubtype('2026-07-16 03:00')).toBe('nocturno')
    expect(guessSleepSubtype('2026-07-16 07:59')).toBe('nocturno')
  })

  it('clasifica el tramo diurno como siesta', () => {
    expect(guessSleepSubtype('2026-07-15 08:00')).toBe('siesta')
    expect(guessSleepSubtype('2026-07-15 14:30')).toBe('siesta')
    expect(guessSleepSubtype('2026-07-15 19:59')).toBe('siesta')
  })
})

describe('feedDefaults', () => {
  it('sin toma previa propone biberón con valores razonables', () => {
    const d = feedDefaults(null)
    expect(d.subtype).toBe('biberon')
    expect(d.quantityMl).toBeGreaterThan(0)
  })

  it('repite cantidad y tipo de leche del último biberón', () => {
    const d = feedDefaults(
      ev({ type: 'feed', subtype: 'biberon', quantityMl: 150, detail: 'formula' })
    )
    expect(d).toMatchObject({ subtype: 'biberon', quantityMl: 150, milkType: 'formula' })
  })

  it('tras una lactancia propone lactancia con el otro pecho', () => {
    const d = feedDefaults(ev({ type: 'feed', subtype: 'lactancia', detail: 'izquierdo' }))
    expect(d).toMatchObject({ subtype: 'lactancia', breast: 'derecho' })
  })
})
