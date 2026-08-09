import { describe, expect, it } from 'vitest'
import type { BabyEvent, FeedComponents } from '../types'
import {
  babyStatus,
  daySummary,
  feedDefaults,
  guessSleepSubtype,
  isStaleSleep,
  sleepMinutesOnDate,
} from './derive'
import { emptyComponents } from './feed'

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
    components: null,
    notes: '',
    createdBy: 'ana@example.com',
    createdAt: '2026-07-15 10:00',
    updatedBy: null,
    updatedAt: null,
    ...partial,
  }
}

/** Toma con componentes explícitos, como los guarda la v2. */
function feed(start: string, c: Partial<FeedComponents>, end?: string): BabyEvent {
  return ev({
    type: 'feed',
    subtype: 'biberon',
    start,
    end: end ?? null,
    components: { ...emptyComponents(), ...c },
  })
}

describe('babyStatus', () => {
  const now = '2026-07-15 15:00'

  it('dormido si hay un sueño abierto reciente', () => {
    const s = babyStatus(ev({ start: '2026-07-15 14:00' }), null, now)
    expect(s).toEqual({ state: 'asleep', since: '2026-07-15 14:00', staleTimer: false })
  })

  it('despierto desde el fin del último sueño', () => {
    const s = babyStatus(null, ev({ start: '2026-07-15 12:00', end: '2026-07-15 13:15' }), now)
    expect(s).toEqual({ state: 'awake', since: '2026-07-15 13:15', staleTimer: false })
  })

  it('desconocido si no hay ningún sueño registrado', () => {
    expect(babyStatus(null, null, now).state).toBe('unknown')
  })

  it('un cronómetro olvidado no significa que el bebé siga dormido', () => {
    // Sueño abierto hace más de un día: es un olvido, no un bebé durmiendo.
    const olvidado = ev({ start: '2026-07-14 09:00', end: null })
    const ultimoFin = ev({ start: '2026-07-15 12:00', end: '2026-07-15 13:15' })
    const s = babyStatus(olvidado, ultimoFin, now)
    expect(s.state).toBe('awake')
    expect(s.staleTimer).toBe(true)
  })

  it('marca como olvidado solo a partir del umbral', () => {
    expect(isStaleSleep(ev({ start: '2026-07-15 02:00' }), now)).toBe(false) // 13 h
    expect(isStaleSleep(ev({ start: '2026-07-15 00:30' }), now)).toBe(true) // 14 h 30
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

  it('cuenta el sueño en curso hasta ahora', () => {
    const events = [ev({ start: '2026-07-15 14:00', end: null })]
    expect(sleepMinutesOnDate(events, day, '2026-07-15 14:45')).toBe(45)
  })

  it('no suma un sueño sin cerrar desde hace demasiado', () => {
    // Sumarlo daría "20 h dormido hoy" por un cronómetro que nadie detuvo.
    const events = [ev({ start: '2026-07-15 00:00', end: null })]
    expect(sleepMinutesOnDate(events, day, '2026-07-15 20:00')).toBe(0)
  })

  it('ignora los eventos que no son sueño y los intervalos vacíos', () => {
    const events = [
      feed('2026-07-15 09:00', { formulaMl: 90 }),
      ev({ start: '2026-07-15 10:00', end: '2026-07-15 10:00' }),
    ]
    expect(sleepMinutesOnDate(events, day, '2026-07-15 12:00')).toBe(0)
  })
})

describe('daySummary', () => {
  it('separa los ml cuantificables de los minutos de pecho', () => {
    const events = [
      feed('2026-07-15 09:00', { formulaMl: 120 }),
      feed('2026-07-15 13:00', { expressedMl: 60, formulaMl: 90 }),
      feed('2026-07-15 17:00', { breastMin: 20 }, '2026-07-15 17:20'),
      ev({ type: 'diaper', subtype: 'pipi', start: '2026-07-15 08:00' }),
      ev({ type: 'bath', subtype: 'completo', start: '2026-07-15 19:00' }),
      // De otro día: no cuenta.
      feed('2026-07-14 09:00', { formulaMl: 999 }),
    ]
    const s = daySummary(events, '2026-07-15', '2026-07-15 20:00')
    expect(s.feeds).toBe(3)
    expect(s.milkMl).toBe(270)
    expect(s.breastMin).toBe(20)
    expect(s.diapers).toBe(1)
    expect(s.baths).toBe(1)
  })

  it('cuenta también las tomas registradas con la v1', () => {
    const events = [
      ev({ type: 'feed', subtype: 'biberon', start: '2026-07-15 09:00', quantityMl: 120, detail: 'materna' }),
      ev({
        type: 'feed',
        subtype: 'lactancia',
        start: '2026-07-15 12:00',
        end: '2026-07-15 12:25',
        durationMin: 25,
        detail: 'izquierdo',
      }),
    ]
    const s = daySummary(events, '2026-07-15', '2026-07-15 20:00')
    expect(s.milkMl).toBe(120)
    expect(s.breastMin).toBe(25)
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
  it('sin toma previa no preselecciona nada', () => {
    expect(feedDefaults(null)).toEqual(emptyComponents())
  })

  it('repite el desglose de la última toma', () => {
    const d = feedDefaults(feed('2026-07-15 09:00', { expressedMl: 30, formulaMl: 45 }))
    expect(d).toMatchObject({ expressedMl: 30, formulaMl: 45, breastMin: 0 })
  })

  it('alterna el pecho respecto a la última toma', () => {
    const d = feedDefaults(
      feed('2026-07-15 09:00', { breastMin: 15, breastSide: 'izquierdo' }, '2026-07-15 09:15')
    )
    expect(d).toMatchObject({ breastMin: 15, breastSide: 'derecho' })
  })

  it('convierte lo mixto de la v1 en fórmula, que es lo que se puede repetir', () => {
    const previa = ev({
      type: 'feed',
      subtype: 'biberon',
      start: '2026-07-15 09:00',
      quantityMl: 80,
      detail: 'mixta',
    })
    expect(feedDefaults(previa)).toMatchObject({ formulaMl: 80, mixtaMl: 0 })
  })
})
