import { describe, expect, it } from 'vitest'
import { aBath, aDiaper, aFeed, aSleep } from '../test-fixtures'
import { recordDetail, recordIcon, recordTimeParts, recordTitle } from './summary'

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

  it('nombra el pedete y la hidratación por lo que son', () => {
    // No cuentan como caca ni como toma en ningún contador; desde la
    // cronología no se vería por qué si se llamaran igual que ellas.
    expect(recordTitle(aDiaper({ pee: false, poop: true, consistency: 'pedete' }))).toBe(
      'Pañal · pedete'
    )
    expect(recordTitle(aDiaper({ pee: true, poop: true, consistency: 'pedete' }))).toBe(
      'Pañal · pis y pedete'
    )
    expect(recordTitle(aFeed({ breastMin: 2, breastSide: 'izquierdo' }))).toBe('Toma · hidratación')
    expect(recordTitle(aFeed({ breastMin: 20, breastSide: 'izquierdo' }))).toBe('Toma')
    // Un biberón es una toma aunque dure poco.
    expect(recordTitle(aFeed({ formulaMl: 30 }))).toBe('Toma')
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

  it('dice cuánto de cada cosa, cada una en su género', () => {
    const r = aDiaper({ pee: true, peeAmount: 'poco', poop: true, poopAmount: 'mucho' })
    expect(recordDetail(r)).toBe('pis poco · caca mucha')
  })

  it('no repite el pedete: ya está en el título', () => {
    const r = aDiaper({ pee: true, peeAmount: 'mucho', poop: true, consistency: 'pedete' })
    expect(recordDetail(r)).toBe('pis mucho')
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

describe('recordTimeParts', () => {
  const day = '2026-08-07'

  it('registro puntual: solo la hora', () => {
    expect(recordTimeParts(aDiaper({ start: '2026-08-07 08:10' }), day)).toEqual({
      time: '08:10',
      note: null,
    })
    expect(recordTimeParts(aBath({ start: '2026-08-07 19:30' }), day)).toEqual({
      time: '19:30',
      note: null,
    })
  })

  it('intervalo dentro del día: hora de inicio y hasta cuándo', () => {
    const r = aFeed({ start: '2026-08-07 14:30', end: '2026-08-07 15:45' })
    expect(recordTimeParts(r, day)).toEqual({ time: '14:30', note: '→ 15:45' })
  })

  it('una toma puntual no muestra un rango vacío', () => {
    const r = aFeed({ start: '2026-08-07 14:30', end: '2026-08-07 14:30' })
    expect(recordTimeParts(r, day)).toEqual({ time: '14:30', note: null })
  })

  it('lo que viene del día anterior se ancla en su hora de fin', () => {
    const r = aSleep({ start: '2026-08-06 21:30', end: '2026-08-07 07:00' })
    expect(recordTimeParts(r, day)).toEqual({ time: '07:00', note: 'de antes' })
  })

  it('lo que sigue al día siguiente se marca como tal', () => {
    const r = aSleep({ start: '2026-08-07 21:30', end: '2026-08-08 07:00' })
    expect(recordTimeParts(r, day)).toEqual({ time: '21:30', note: 'sigue' })
  })

  it('un sueño sin cerrar lo dice, sin afirmar que siga durmiendo', () => {
    expect(recordTimeParts(aSleep({ start: '2026-08-07 21:30' }), day)).toEqual({
      time: '21:30',
      note: 'sin cerrar',
    })
  })
})
