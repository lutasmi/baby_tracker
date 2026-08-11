import { describe, expect, it } from 'vitest'
import { aBath, aDiaper, aFeed, aSleep } from '../test-fixtures'
import {
  babyStatus,
  daySummary,
  feedDefaults,
  feedGaps,
  guessSleepKind,
  isStaleSleep,
  sleepMinutesOnDate,
} from './derive'

describe('babyStatus', () => {
  const now = '2026-08-07 15:00'

  it('dormido si hay un sueño abierto reciente', () => {
    const s = babyStatus(aSleep({ start: '2026-08-07 14:00' }), null, now)
    expect(s).toEqual({ state: 'asleep', since: '2026-08-07 14:00', staleTimer: false })
  })

  it('despierto desde el fin del último sueño', () => {
    const s = babyStatus(
      null,
      aSleep({ start: '2026-08-07 12:00', end: '2026-08-07 13:15', durationMin: 75 }),
      now
    )
    expect(s).toEqual({ state: 'awake', since: '2026-08-07 13:15', staleTimer: false })
  })

  it('desconocido si no hay ningún sueño registrado', () => {
    expect(babyStatus(null, null, now).state).toBe('unknown')
  })

  it('un cronómetro olvidado no significa que el bebé siga dormido', () => {
    const olvidado = aSleep({ start: '2026-08-06 09:00' })
    const ultimoFin = aSleep({ start: '2026-08-07 12:00', end: '2026-08-07 13:15' })
    const s = babyStatus(olvidado, ultimoFin, now)
    expect(s.state).toBe('awake')
    expect(s.staleTimer).toBe(true)
  })

  it('marca como olvidado solo a partir del umbral', () => {
    expect(isStaleSleep(aSleep({ start: '2026-08-07 02:00' }), now)).toBe(false) // 13 h
    expect(isStaleSleep(aSleep({ start: '2026-08-07 00:30' }), now)).toBe(true) // 14 h 30
  })
})

describe('sleepMinutesOnDate', () => {
  const day = '2026-08-07'

  it('suma solo la parte del sueño nocturno que cae en el día', () => {
    const records = [
      aSleep({ start: '2026-08-06 21:30', end: '2026-08-07 07:00' }), // 420 hoy
      aSleep({ start: '2026-08-07 10:00', end: '2026-08-07 11:30' }), // 90
    ]
    expect(sleepMinutesOnDate(records, day, '2026-08-07 12:00')).toBe(510)
  })

  it('cuenta el sueño en curso hasta ahora', () => {
    expect(sleepMinutesOnDate([aSleep({ start: '2026-08-07 14:00' })], day, '2026-08-07 14:45')).toBe(45)
  })

  it('no suma un sueño sin cerrar desde hace demasiado', () => {
    // Sumarlo daría "20 h dormido hoy" por un cronómetro que nadie detuvo.
    expect(sleepMinutesOnDate([aSleep({ start: '2026-08-07 00:00' })], day, '2026-08-07 20:00')).toBe(0)
  })

  it('ignora lo que no es sueño', () => {
    const records = [aFeed({ start: '2026-08-07 09:00' }), aDiaper({ start: '2026-08-07 09:30' })]
    expect(sleepMinutesOnDate(records, day, '2026-08-07 12:00')).toBe(0)
  })
})

describe('daySummary', () => {
  it('separa los ml cuantificables de los minutos de pecho', () => {
    const records = [
      aFeed({ start: '2026-08-07 09:00', formulaMl: 120 }),
      aFeed({ start: '2026-08-07 13:00', expressedMl: 60, formulaMl: 90 }),
      aFeed({ start: '2026-08-07 17:00', breastMin: 20 }),
      aDiaper({ start: '2026-08-07 08:00' }),
      aBath({ start: '2026-08-07 19:00' }),
      // De otro día: no cuenta.
      aFeed({ start: '2026-08-06 09:00', formulaMl: 999 }),
    ]
    const s = daySummary(records, '2026-08-07', '2026-08-07 20:00')
    expect(s).toMatchObject({ feeds: 3, milkMl: 270, breastMin: 20, diapers: 1, baths: 1 })
  })
})

describe('guessSleepKind', () => {
  it('clasifica el tramo nocturno', () => {
    expect(guessSleepKind('2026-08-07 20:00')).toBe('nocturno')
    expect(guessSleepKind('2026-08-08 03:00')).toBe('nocturno')
    expect(guessSleepKind('2026-08-08 07:59')).toBe('nocturno')
  })

  it('clasifica el tramo diurno como siesta', () => {
    expect(guessSleepKind('2026-08-07 08:00')).toBe('siesta')
    expect(guessSleepKind('2026-08-07 19:59')).toBe('siesta')
  })
})

describe('feedDefaults', () => {
  it('sin toma previa no preselecciona nada', () => {
    expect(feedDefaults(null)).toEqual({ expressedMl: 0, formulaMl: 0, nextSide: null })
  })

  it('repite las cantidades de la última toma', () => {
    expect(feedDefaults(aFeed({ expressedMl: 30, formulaMl: 45 }))).toMatchObject({
      expressedMl: 30,
      formulaMl: 45,
    })
  })

  it('propone el pecho contrario al de la última toma', () => {
    expect(feedDefaults(aFeed({ breastMin: 15, breastSide: 'izquierdo' })).nextSide).toBe('derecho')
    expect(feedDefaults(aFeed({ breastMin: 15, breastSide: 'derecho' })).nextSide).toBe('izquierdo')
    expect(feedDefaults(aFeed({ breastMin: 15, breastSide: 'ambos' })).nextSide).toBe('ambos')
  })
})

describe('feedGaps', () => {
  it('mide el hueco de inicio a inicio entre tomas consecutivas', () => {
    const records = [
      aFeed({ id: 'a', start: '2026-08-07 06:00', end: '2026-08-07 06:20' }),
      aDiaper({ start: '2026-08-07 07:00' }),
      aFeed({ id: 'b', start: '2026-08-07 09:10', end: '2026-08-07 09:30' }),
    ]
    const gaps = feedGaps(records, null)
    // La primera toma del día no tiene con qué compararse.
    expect(gaps.get('a')).toBeUndefined()
    expect(gaps.get('b')).toBe(190)
  })

  it('usa la toma anterior al día para la primera de la madrugada', () => {
    const anoche = aFeed({ start: '2026-08-06 23:30', end: '2026-08-06 23:50' })
    const madrugada = aFeed({ id: 'm', start: '2026-08-07 02:45', end: '2026-08-07 03:05' })
    expect(feedGaps([madrugada], anoche).get('m')).toBe(195)
  })

  it('ignora lo que no son tomas', () => {
    const records = [aSleep({ start: '2026-08-07 08:00' }), aDiaper({ start: '2026-08-07 09:00' })]
    expect(feedGaps(records, null).size).toBe(0)
  })

  it('una hidratación por medio no acorta el hueco de la siguiente toma', () => {
    // Lo que se lee aquí es "cuánto llevaba sin comer": un consuelo de dos
    // minutos a las 08:00 no es haber comido a las 08:00.
    const records = [
      aFeed({ id: 'a', start: '2026-08-07 06:00', end: '2026-08-07 06:20', formulaMl: 60 }),
      aFeed({ id: 'h', start: '2026-08-07 08:00', end: '2026-08-07 08:02', breastMin: 2 }),
      aFeed({ id: 'b', start: '2026-08-07 09:00', end: '2026-08-07 09:20', formulaMl: 60 }),
    ]
    const gaps = feedGaps(records, null)
    expect(gaps.get('b')).toBe(180) // desde las 06:00, no desde las 08:00
    // Y la hidratación no enseña hueco propio: no es lo que se está midiendo.
    expect(gaps.has('h')).toBe(false)
  })

  it('tampoco cuenta como la toma anterior al día', () => {
    const consuelo = aFeed({ start: '2026-08-06 23:30', end: '2026-08-06 23:32', breastMin: 2 })
    const madrugada = aFeed({ id: 'm', start: '2026-08-07 02:45', formulaMl: 60 })
    expect(feedGaps([madrugada], consuelo).has('m')).toBe(false)
  })
})
