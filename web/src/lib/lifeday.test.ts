import { describe, expect, it } from 'vitest'
import { aDiaper, aFeed, aSleep } from '../test-fixtures'
import { isHydration, lifeDayNumber, lifeDayRange, lifeDayTotals, periodCounts } from './lifeday'

const BIRTH = '2026-08-05 09:17'

describe('lifeDayNumber', () => {
  it('cuenta periodos de 24 h desde la hora exacta de nacimiento', () => {
    expect(lifeDayNumber(BIRTH, '2026-08-05 09:17')).toBe(1)
    expect(lifeDayNumber(BIRTH, '2026-08-06 09:16')).toBe(1)
    expect(lifeDayNumber(BIRTH, '2026-08-06 09:17')).toBe(2)
  })

  it('separa los registros a ambos lados de la hora de nacimiento', () => {
    expect(lifeDayNumber(BIRTH, '2026-08-07 09:10')).toBe(2)
    expect(lifeDayNumber(BIRTH, '2026-08-07 09:20')).toBe(3)
  })

  it('devuelve 0 antes de nacer', () => {
    expect(lifeDayNumber(BIRTH, '2026-08-05 09:10')).toBe(0)
  })
})

describe('lifeDayRange', () => {
  it('da el intervalo del día de vida pedido', () => {
    expect(lifeDayRange(BIRTH, 1)).toEqual({ start: BIRTH, end: '2026-08-06 09:17' })
    expect(lifeDayRange(BIRTH, 3)).toEqual({ start: '2026-08-07 09:17', end: '2026-08-08 09:17' })
  })
})

describe('lifeDayTotals', () => {
  const range = lifeDayRange(BIRTH, 3)

  it('cuenta pises, cacas y leche del periodo', () => {
    const records = [
      aFeed({ start: '2026-08-07 09:20', formulaMl: 60 }),
      aFeed({ start: '2026-08-07 14:00', expressedMl: 40, breastMin: 15 }),
      aDiaper({ start: '2026-08-07 12:00', pee: true, poop: true }),
      aDiaper({ start: '2026-08-07 18:00', pee: true, poop: false }),
      aDiaper({ start: '2026-08-07 22:00', pee: false, poop: true }),
      aSleep({ start: '2026-08-07 20:00' }),
    ]
    const t = lifeDayTotals(records, range.start, range.end)
    expect(t).toMatchObject({ pees: 2, poops: 2, diapers: 3, feeds: 2, breastMin: 15 })
    expect(t.milkMl).toBe(100)
  })

  it('deja fuera lo que pertenece a otro día de vida', () => {
    const records = [
      aFeed({ start: '2026-08-07 09:10', formulaMl: 999 }), // día 2
      aFeed({ start: '2026-08-08 09:17', formulaMl: 999 }), // día 4
      aFeed({ start: '2026-08-07 09:17', formulaMl: 50 }),
    ]
    expect(lifeDayTotals(records, range.start, range.end).milkMl).toBe(50)
  })

  it('el pecho directo no entra en la leche cuantificable', () => {
    const t = lifeDayTotals([aFeed({ start: '2026-08-07 10:00', breastMin: 40 })], range.start, range.end)
    expect(t.breastMin).toBe(40)
    expect(t.milkMl).toBe(0)
  })
})

describe('contadores de la pantalla de inicio', () => {
  const range = lifeDayRange('2026-08-05 09:17', 3) // del 7 a las 09:17 al 8

  it('separa las tomas de las hidrataciones por los minutos de pecho', () => {
    const counts = periodCounts(
      [
        aFeed({ start: '2026-08-07 10:00', breastMin: 20, breastSide: 'izquierdo' }),
        aFeed({ start: '2026-08-07 12:00', breastMin: 5, breastSide: 'derecho' }), // justo en el umbral
        aFeed({ start: '2026-08-07 14:00', breastMin: 4, breastSide: 'derecho' }),
        aFeed({ start: '2026-08-07 16:00', breastMin: 1, breastSide: 'izquierdo' }),
      ],
      range.start,
      range.end
    )
    expect(counts).toMatchObject({ feeds: 2, hydrations: 2 })
  })

  it('un biberón es una toma aunque no tenga duración', () => {
    // Lo que come es la cantidad, no el tiempo.
    expect(isHydration(aFeed({ start: '2026-08-07 10:00', durationMin: 0, formulaMl: 60 }))).toBe(
      false
    )
    // Y un ratito al pecho rematado con biberón tampoco es hidratación.
    expect(isHydration(aFeed({ breastMin: 2, formulaMl: 30 }))).toBe(false)
    expect(isHydration(aFeed({ breastMin: 2, breastSide: 'izquierdo' }))).toBe(true)
  })

  it('separa las cacas de los pedetes, y no cuenta los pañales de solo pis', () => {
    const counts = periodCounts(
      [
        aDiaper({ start: '2026-08-07 10:00', pee: true, poop: false }),
        aDiaper({ start: '2026-08-07 11:00', poop: true, consistency: 'pedete' }),
        aDiaper({ start: '2026-08-07 12:00', poop: true, consistency: 'liquida' }),
        aDiaper({ start: '2026-08-07 13:00', poop: true }), // sin anotar: caca igual
      ],
      range.start,
      range.end
    )
    expect(counts).toMatchObject({ poops: 2, pedetes: 1 })
  })

  it('solo cuenta lo que empieza dentro del periodo', () => {
    const fuera = [
      aFeed({ start: '2026-08-07 09:10', formulaMl: 60 }),
      aDiaper({ start: '2026-08-08 09:17', poop: true, consistency: 'pedete' }),
    ]
    expect(periodCounts(fuera, range.start, range.end)).toEqual({
      feeds: 0,
      hydrations: 0,
      poops: 0,
      pedetes: 0,
    })
  })
})
