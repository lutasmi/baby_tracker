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
    components: null,
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
    // Una toma puede combinar componentes: el título es siempre el mismo.
    expect(eventTitle(ev({ type: 'feed', subtype: 'biberon' }))).toBe('Toma')
    expect(eventTitle(ev({ type: 'feed', subtype: 'mixta' }))).toBe('Toma')
    expect(eventTitle(ev({ type: 'diaper', subtype: 'caca' }))).toBe('Pañal · Caca')
    expect(eventTitle(ev({ type: 'bath', subtype: 'aseo' }))).toBe('Aseo rápido')
  })
})

describe('eventDetail', () => {
  const comps = (p: Partial<BabyEvent['components'] & object>) => ({
    breastMin: 0,
    breastSide: null,
    expressedMl: 0,
    formulaMl: 0,
    mixtaMl: 0,
    ...p,
  })

  it('describe una toma con su duración y su desglose', () => {
    const e = ev({
      type: 'feed',
      subtype: 'biberon',
      start: '2026-07-15 09:12',
      end: '2026-07-15 09:41',
      durationMin: 29,
      quantityMl: 35,
      components: comps({ formulaMl: 35 }),
    })
    expect(eventDetail(e)).toBe('29 min · 35 ml fórmula')
  })

  it('describe una toma mixta sin mezclar minutos y ml', () => {
    const e = ev({
      type: 'feed',
      subtype: 'mixta',
      start: '2026-07-15 09:00',
      end: '2026-07-15 09:30',
      durationMin: 30,
      components: comps({ breastMin: 17, expressedMl: 28, formulaMl: 37 }),
    })
    expect(eventDetail(e)).toBe('30 min · 17 min pecho · 28 ml extraída · 37 ml fórmula')
  })

  it('describe una toma registrada con la v1', () => {
    const e = ev({ type: 'feed', subtype: 'biberon', quantityMl: 120, detail: 'materna' })
    expect(eventDetail(e)).toBe('120 ml extraída')
  })

  it('describe un pañal con consistencia y nota', () => {
    const e = ev({ type: 'diaper', subtype: 'caca', detail: 'liquida', notes: 'poca cantidad' })
    expect(eventDetail(e)).toBe('Consistencia líquida · poca cantidad')
  })

  it('marca el sueño sin cerrar sin afirmar que siga durmiendo', () => {
    expect(eventDetail(ev({ type: 'sleep', end: null }))).toBe('Sin cerrar')
  })
})

describe('eventTimeLabel', () => {
  const day = '2026-07-15'

  it('evento puntual: solo la hora', () => {
    expect(eventTimeLabel(ev({ start: '2026-07-15 14:30', end: '2026-07-15 14:30' }), day)).toBe(
      '14:30'
    )
    expect(
      eventTimeLabel(ev({ type: 'diaper', subtype: 'pipi', start: '2026-07-15 08:10' }), day)
    ).toBe('08:10')
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
