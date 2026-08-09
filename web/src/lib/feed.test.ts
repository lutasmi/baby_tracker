import { describe, expect, it } from 'vitest'
import type { BabyEvent } from '../types'
import { componentParts, componentsOf, emptyComponents, feedSubtypeFor, quantifiableMl } from './feed'

function ev(partial: Partial<BabyEvent>): BabyEvent {
  return {
    id: 'x',
    type: 'feed',
    subtype: 'biberon',
    start: '2026-07-15 09:00',
    end: null,
    durationMin: null,
    quantityMl: null,
    detail: null,
    components: null,
    notes: '',
    createdBy: 'ana@example.com',
    createdAt: '2026-07-15 09:00',
    updatedBy: null,
    updatedAt: null,
    ...partial,
  }
}

describe('componentsOf', () => {
  it('usa los componentes del evento cuando existen', () => {
    const c = { ...emptyComponents(), formulaMl: 63 }
    expect(componentsOf(ev({ components: c }))).toBe(c)
  })

  it('deriva los de un biberón de la v1 según el tipo de leche', () => {
    expect(componentsOf(ev({ quantityMl: 120, detail: 'formula' }))).toMatchObject({
      formulaMl: 120,
    })
    expect(componentsOf(ev({ quantityMl: 120, detail: 'materna' }))).toMatchObject({
      expressedMl: 120,
    })
    expect(componentsOf(ev({ quantityMl: 120, detail: 'mixta' }))).toMatchObject({ mixtaMl: 120 })
  })

  it('deriva los de una lactancia de la v1 desde su duración', () => {
    const c = componentsOf(
      ev({ subtype: 'lactancia', end: '2026-07-15 09:25', durationMin: 25, detail: 'izquierdo' })
    )
    expect(c).toMatchObject({ breastMin: 25, breastSide: 'izquierdo' })
    expect(quantifiableMl(c)).toBe(0)
  })
})

describe('feedSubtypeFor', () => {
  it('deriva el subtipo del desglose', () => {
    const c = (p: Partial<ReturnType<typeof emptyComponents>>) => ({ ...emptyComponents(), ...p })
    expect(feedSubtypeFor(c({ formulaMl: 60 }))).toBe('biberon')
    expect(feedSubtypeFor(c({ expressedMl: 60 }))).toBe('biberon')
    expect(feedSubtypeFor(c({ breastMin: 15 }))).toBe('lactancia')
    expect(feedSubtypeFor(c({ breastMin: 15, formulaMl: 30 }))).toBe('mixta')
  })
})

describe('componentParts', () => {
  it('mantiene minutos y ml como magnitudes separadas', () => {
    const parts = componentParts({
      ...emptyComponents(),
      breastMin: 17,
      expressedMl: 28,
      formulaMl: 37,
    })
    expect(parts).toEqual(['17 min pecho', '28 ml extraída', '37 ml fórmula'])
  })

  it('omite los componentes vacíos', () => {
    expect(componentParts({ ...emptyComponents(), formulaMl: 35 })).toEqual(['35 ml fórmula'])
    expect(componentParts(emptyComponents())).toEqual([])
  })
})
