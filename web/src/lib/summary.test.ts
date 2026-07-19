import { describe, expect, it } from 'vitest'
import type { BabyEvent } from '../types'
import { eventDetail, eventTimeLabel, eventTitle } from './summary'

function ev(partial: Partial<BabyEvent>): BabyEvent {
  return {
    id: 'test',
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

describe('eventTitle', () => {
  it('titula cada tipo de evento', () => {
    expect(eventTitle(ev({ type: 'sleep', subtype: 'nocturno' }))).toBe('Sueño nocturno')
    expect(eventTitle(ev({ type: 'feed', subtype: 'biberon' }))).toBe('Biberón')
    expect(eventTitle(ev({ type: 'diaper', subtype: 'caca' }))).toBe('Pañal · Caca')
    expect(eventTitle(ev({ type: 'bath', subtype: 'aseo' }))).toBe('Aseo rápido')
  })
})

describe('eventDetail', () => {
  it('describe un biberón', () => {
    const e = ev({ type: 'feed', subtype: 'biberon', quantityMl: 120, detail: 'formula' })
    expect(eventDetail(e)).toBe('120 ml · Fórmula')
  })

  it('describe una lactancia con duración y pecho', () => {
    const e = ev({
      type: 'feed',
      subtype: 'lactancia',
      end: '2026-07-15 10:25',
      durationMin: 25,
      detail: 'izquierdo',
    })
    expect(eventDetail(e)).toBe('25 min · Pecho izquierdo')
  })

  it('describe un pañal con consistencia y nota', () => {
    const e = ev({ type: 'diaper', subtype: 'caca', detail: 'liquida', notes: 'poca cantidad' })
    expect(eventDetail(e)).toBe('Consistencia líquida · poca cantidad')
  })

  it('marca el sueño en curso', () => {
    expect(eventDetail(ev({ type: 'sleep', end: null }))).toBe('En curso')
  })
})

describe('eventTimeLabel', () => {
  const day = '2026-07-15'

  it('evento puntual: solo la hora', () => {
    expect(eventTimeLabel(ev({ start: '2026-07-15 14:30', end: '2026-07-15 14:30' }), day)).toBe(
      '14:30'
    )
  })

  it('intervalo dentro del día', () => {
    expect(eventTimeLabel(ev({ start: '2026-07-15 14:30', end: '2026-07-15 15:45' }), day)).toBe(
      '14:30–15:45'
    )
  })

  it('sueño que empezó ayer: muestra solo el despertar', () => {
    expect(eventTimeLabel(ev({ start: '2026-07-14 21:30', end: '2026-07-15 07:00' }), day)).toBe(
      '→ 07:00'
    )
  })

  it('sueño que sigue en curso', () => {
    expect(eventTimeLabel(ev({ start: '2026-07-15 21:30', end: null }), day)).toBe('21:30 →')
  })
})
