import { describe, expect, it } from 'vitest'
import type { BabyEvent } from '../types'
import { emptyComponents } from './feed'
import { lifeDayNumber, lifeDayRange, lifeDayTotals } from './lifeday'

const BIRTH = '2026-08-05 09:17'

function ev(partial: Partial<BabyEvent>): BabyEvent {
  return {
    id: 'x',
    type: 'diaper',
    subtype: 'pipi',
    start: '2026-08-07 12:00',
    end: null,
    durationMin: null,
    quantityMl: null,
    detail: null,
    components: null,
    notes: '',
    createdBy: 'ana@example.com',
    createdAt: '2026-08-07 12:00',
    updatedBy: null,
    updatedAt: null,
    ...partial,
  }
}

describe('lifeDayNumber', () => {
  it('cuenta periodos de 24 h desde la hora exacta de nacimiento', () => {
    expect(lifeDayNumber(BIRTH, '2026-08-05 09:17')).toBe(1)
    expect(lifeDayNumber(BIRTH, '2026-08-06 09:16')).toBe(1)
    expect(lifeDayNumber(BIRTH, '2026-08-06 09:17')).toBe(2)
  })

  it('separa los eventos a ambos lados de la hora de nacimiento', () => {
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
    expect(lifeDayRange(BIRTH, 3)).toEqual({
      start: '2026-08-07 09:17',
      end: '2026-08-08 09:17',
    })
  })
})

describe('lifeDayTotals', () => {
  const range = lifeDayRange(BIRTH, 3)
  const feed = (start: string, c: Partial<ReturnType<typeof emptyComponents>>) =>
    ev({ type: 'feed', subtype: 'biberon', start, components: { ...emptyComponents(), ...c } })

  it('cuenta pises, cacas y leche del periodo', () => {
    const events = [
      feed('2026-08-07 09:20', { formulaMl: 60 }),
      feed('2026-08-07 14:00', { expressedMl: 40, breastMin: 15 }),
      ev({ start: '2026-08-07 12:00', subtype: 'ambos' }),
      ev({ start: '2026-08-07 18:00', subtype: 'pipi' }),
      ev({ start: '2026-08-07 22:00', subtype: 'caca' }),
    ]
    const t = lifeDayTotals(events, range.start, range.end)
    expect(t).toMatchObject({ pees: 2, poops: 2, diapers: 3, feeds: 2, breastMin: 15 })
    expect(t.milkMl).toBe(100)
  })

  it('deja fuera lo que pertenece a otro día de vida', () => {
    const events = [
      feed('2026-08-07 09:10', { formulaMl: 999 }), // día 2
      feed('2026-08-08 09:17', { formulaMl: 999 }), // día 4
      feed('2026-08-07 09:17', { formulaMl: 50 }),
    ]
    expect(lifeDayTotals(events, range.start, range.end).milkMl).toBe(50)
  })

  it('el pecho directo no entra en la leche cuantificable', () => {
    const events = [feed('2026-08-07 10:00', { breastMin: 40 })]
    const t = lifeDayTotals(events, range.start, range.end)
    expect(t.breastMin).toBe(40)
    expect(t.milkMl).toBe(0)
  })

  it('suma también las tomas registradas con la v1', () => {
    const events = [
      ev({
        type: 'feed',
        subtype: 'biberon',
        start: '2026-08-07 10:00',
        quantityMl: 70,
        detail: 'formula',
      }),
    ]
    expect(lifeDayTotals(events, range.start, range.end).milkMl).toBe(70)
  })
})
