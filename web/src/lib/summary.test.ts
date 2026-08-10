import { describe, expect, it } from 'vitest'
import { aBath, aDiaper, aFeed, aSleep } from '../test-fixtures'
import { recordDetail, recordIcon, recordTimeLabel, recordTitle } from './summary'

describe('recordTitle', () => {
  it('titula cada tipo de registro', () => {
    expect(recordTitle(aSleep({ kind: 'nocturno' }))).toBe('Sueño nocturno')
    expect(recordTitle(aSleep({ kind: 'siesta' }))).toBe('Siesta')
    // Una toma puede combinar componentes: el título es siempre el mismo.
    expect(recordTitle(aFeed({ formulaMl: 60 }))).toBe('Toma')
    expect(recordTitle(aBath({ kind: 'aseo' }))).toBe('Aseo rápido')
  })

  it('el pañal dice en el título lo que llevaba', () => {
    expect(recordTitle(aDiaper({ pee: true, poop: false }))).toBe('Pañal · pis')
    expect(recordTitle(aDiaper({ pee: false, poop: true }))).toBe('Pañal · caca')
    expect(recordTitle(aDiaper({ pee: true, poop: true }))).toBe('Pañal · pis y caca')
  })
})

describe('recordIcon', () => {
  it('distingue la lactancia directa del biberón', () => {
    expect(recordIcon(aFeed({ breastMin: 20 }))).toBe('🤱')
    expect(recordIcon(aFeed({ formulaMl: 60 }))).toBe('🍼')
    expect(recordIcon(aFeed({ breastMin: 10, formulaMl: 60 }))).toBe('🍼')
  })

  it('el pañal con las dos cosas lleva los dos iconos', () => {
    expect(recordIcon(aDiaper({ pee: true, poop: true }))).toBe('💩💧')
    expect(recordIcon(aDiaper({ pee: true, poop: false }))).toBe('💧')
    expect(recordIcon(aDiaper({ pee: false, poop: true }))).toBe('💩')
  })
})

describe('recordDetail', () => {
  it('describe una toma con su duración y su desglose', () => {
    const r = aFeed({
      start: '2026-08-07 09:12',
      end: '2026-08-07 09:41',
      durationMin: 29,
      formulaMl: 35,
    })
    expect(recordDetail(r)).toBe('29 min · 35 ml fórmula')
  })

  it('describe una toma mixta sin mezclar minutos y ml', () => {
    const r = aFeed({
      start: '2026-08-07 09:00',
      end: '2026-08-07 09:30',
      durationMin: 30,
      breastMin: 17,
      breastSide: 'izquierdo',
      expressedMl: 28,
      formulaMl: 37,
    })
    expect(recordDetail(r)).toBe('30 min · 17 min pecho izq. · 28 ml extraída · 37 ml fórmula')
  })

  it('describe un pañal con consistencia y nota', () => {
    const r = aDiaper({ poop: true, consistency: 'liquida', notes: 'poca cantidad' })
    expect(recordDetail(r)).toBe('consistencia líquida · poca cantidad')
  })

  it('marca el sueño sin cerrar sin afirmar que siga durmiendo', () => {
    expect(recordDetail(aSleep({ end: null }))).toBe('Sin cerrar')
  })

  it('muestra la duración opcional del baño', () => {
    expect(recordDetail(aBath({ durationMin: 12 }))).toBe('12 min')
    expect(recordDetail(aBath({ durationMin: 0 }))).toBe('')
  })
})

describe('recordTimeLabel', () => {
  const day = '2026-08-07'

  it('registro puntual: solo la hora', () => {
    expect(recordTimeLabel(aDiaper({ start: '2026-08-07 08:10' }), day)).toBe('08:10')
    expect(recordTimeLabel(aBath({ start: '2026-08-07 19:30' }), day)).toBe('19:30')
  })

  it('intervalo dentro del día', () => {
    const r = aFeed({ start: '2026-08-07 14:30', end: '2026-08-07 15:45' })
    expect(recordTimeLabel(r, day)).toBe('14:30–15:45')
  })

  it('una toma puntual no muestra un rango vacío', () => {
    const r = aFeed({ start: '2026-08-07 14:30', end: '2026-08-07 14:30' })
    expect(recordTimeLabel(r, day)).toBe('14:30')
  })

  it('sueño que empezó ayer: muestra solo el despertar', () => {
    const r = aSleep({ start: '2026-08-06 21:30', end: '2026-08-07 07:00' })
    expect(recordTimeLabel(r, day)).toBe('→ 07:00')
  })

  it('sueño que sigue sin cerrar', () => {
    expect(recordTimeLabel(aSleep({ start: '2026-08-07 21:30' }), day)).toBe('21:30 →')
  })
})
