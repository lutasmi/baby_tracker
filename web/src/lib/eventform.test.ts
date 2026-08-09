// Recorre los flujos de uso reales: lo que el formulario acaba enviando a la
// API para cada situación que se da con un bebé de verdad.

import { describe, expect, it } from 'vitest'
import type { BabyEvent, FeedComponents } from '../types'
import { activeKeysOf, buildInput, initialState, validate, type FormState } from './eventform'
import { emptyComponents } from './feed'

const NOW = '2026-08-07 16:00'

function ev(partial: Partial<BabyEvent>): BabyEvent {
  return {
    id: 'previo',
    type: 'feed',
    subtype: 'biberon',
    start: '2026-08-07 09:00',
    end: '2026-08-07 09:20',
    durationMin: 20,
    quantityMl: null,
    detail: null,
    components: null,
    notes: '',
    createdBy: 'ana@example.com',
    createdAt: '2026-08-07 09:20',
    updatedBy: null,
    updatedAt: null,
    ...partial,
  }
}

/** Estado del formulario de toma con el desglose indicado. */
function feedState(start: string, end: string, c: Partial<FeedComponents>): FormState {
  const components = { ...emptyComponents(), ...c }
  return {
    ...initialState('feed', null, null, NOW),
    start,
    end,
    components,
    active: activeKeysOf(components),
  }
}

describe('toma simple', () => {
  it('registra 63 ml de fórmula entre 10:13 y 10:31', () => {
    const s = feedState('2026-08-07 10:13', '2026-08-07 10:31', { formulaMl: 63 })
    expect(validate('feed', s, NOW)).toBeNull()

    const input = buildInput('id-1', 'feed', s)
    expect(input.start).toBe('2026-08-07 10:13')
    expect(input.end).toBe('2026-08-07 10:31')
    expect(input.components).toMatchObject({ formulaMl: 63 })
    expect(input.quantityMl).toBe(63)
    expect(input.subtype).toBe('biberon')
    // La duración la deriva el backend de inicio y fin; no se envía a mano.
    expect(input.durationMin).toBeNull()
  })

  it('admite cualquier cantidad, sin saltos de 10 ml', () => {
    for (const ml of [1, 7, 63, 137, 999]) {
      const s = feedState('2026-08-07 10:13', '2026-08-07 10:31', { formulaMl: ml })
      expect(validate('feed', s, NOW)).toBeNull()
      expect(buildInput('id', 'feed', s).quantityMl).toBe(ml)
    }
  })
})

describe('toma mixta', () => {
  it('registra 17 min de pecho, 28 ml extraída y 37 ml fórmula', () => {
    const s = feedState('2026-08-07 15:00', '2026-08-07 15:30', {
      breastMin: 17,
      expressedMl: 28,
      formulaMl: 37,
    })
    expect(validate('feed', s, NOW)).toBeNull()

    const input = buildInput('id-2', 'feed', s)
    expect(input.subtype).toBe('mixta')
    expect(input.components).toMatchObject({ breastMin: 17, expressedMl: 28, formulaMl: 37 })
    // Los minutos de pecho no se convierten en ml: solo suman los cuantificables.
    expect(input.quantityMl).toBe(65)
  })

  it('quitar un componente lo deja fuera aunque conserve su valor', () => {
    const s = feedState('2026-08-07 15:00', '2026-08-07 15:30', {
      breastMin: 17,
      formulaMl: 37,
    })
    const sinFormula = { ...s, active: s.active.filter((k) => k !== 'formula') }
    const input = buildInput('id-3', 'feed', sinFormula)
    expect(input.components).toMatchObject({ breastMin: 17, formulaMl: 0 })
    expect(input.subtype).toBe('lactancia')
  })

  it('sin ningún componente no se puede guardar', () => {
    const s = feedState('2026-08-07 15:00', '2026-08-07 15:30', {})
    expect(validate('feed', s, NOW)).toMatch(/al menos/)
  })

  it('no admite más minutos de pecho que duración de la toma', () => {
    const s = feedState('2026-08-07 15:00', '2026-08-07 15:10', { breastMin: 45 })
    expect(validate('feed', s, NOW)).toMatch(/superar la duración/)
  })
})

describe('registro retrospectivo', () => {
  it('a las 16:00 se puede anotar una toma de 13:12 a 13:43', () => {
    const s = feedState('2026-08-07 13:12', '2026-08-07 13:43', { expressedMl: 90 })
    expect(validate('feed', s, NOW)).toBeNull()
    const input = buildInput('id-4', 'feed', s)
    expect(input.start).toBe('2026-08-07 13:12')
    expect(input.end).toBe('2026-08-07 13:43')
  })

  it('una siesta pasada de 11:37 a 12:54 se guarda cerrada', () => {
    const s: FormState = {
      ...initialState('sleep', null, null, NOW),
      subtype: 'siesta',
      start: '2026-08-07 11:37',
      end: '2026-08-07 12:54',
      sleepOpen: false,
    }
    expect(validate('sleep', s, NOW)).toBeNull()
    const input = buildInput('id-5', 'sleep', s)
    expect(input.end).toBe('2026-08-07 12:54')
  })

  it('rechaza horas futuras', () => {
    const s = feedState('2026-08-07 18:00', '2026-08-07 18:20', { formulaMl: 60 })
    expect(validate('feed', s, NOW)).toMatch(/futuro/)
  })
})

describe('valores por defecto', () => {
  it('la toma nueva se abre lista para anotar algo recién terminado', () => {
    const s = initialState('feed', null, null, NOW)
    expect(s.end).toBe(NOW)
    expect(s.start).toBe('2026-08-07 15:45')
  })

  it('repite el desglose de la toma anterior', () => {
    const anterior = ev({ components: { ...emptyComponents(), formulaMl: 45, expressedMl: 20 } })
    const s = initialState('feed', null, anterior, NOW)
    expect(s.components).toMatchObject({ formulaMl: 45, expressedMl: 20 })
    expect(s.active.sort()).toEqual(['expressed', 'formula'])
  })

  it('sin toma anterior no preselecciona ningún componente', () => {
    expect(initialState('feed', null, null, NOW).active).toEqual([])
  })

  it('el sueño nuevo propone la última hora, no un cronómetro', () => {
    const s = initialState('sleep', null, null, NOW)
    expect(s.sleepOpen).toBe(false)
    expect(s.start).toBe('2026-08-07 15:00')
    expect(s.end).toBe(NOW)
  })
})

describe('edición', () => {
  it('reabre una toma de la v1 con sus componentes derivados', () => {
    const antigua = ev({ quantityMl: 120, detail: 'materna', components: null })
    const s = initialState('feed', antigua, null, NOW)
    expect(s.components).toMatchObject({ expressedMl: 120 })
    expect(s.active).toEqual(['expressed'])
    // Al guardar de nuevo queda ya con el formato de la v2.
    expect(buildInput(antigua.id, 'feed', s).components).toMatchObject({ expressedMl: 120 })
  })

  it('permite corregir un sueño que quedó sin cerrar', () => {
    const abierto = ev({ type: 'sleep', subtype: 'nocturno', end: null, durationMin: null })
    const s = initialState('sleep', abierto, null, NOW)
    expect(s.sleepOpen).toBe(true)

    const cerrado: FormState = { ...s, sleepOpen: false, end: '2026-08-07 10:30' }
    expect(validate('sleep', cerrado, NOW)).toBeNull()
    expect(buildInput(abierto.id, 'sleep', cerrado).end).toBe('2026-08-07 10:30')
  })

  it('conserva el contenido y la consistencia de un pañal', () => {
    const panal = ev({ type: 'diaper', subtype: 'ambos', end: null, detail: 'pastosa' })
    const s = initialState('diaper', panal, null, NOW)
    expect(s.subtype).toBe('ambos')
    expect(s.consistency).toBe('pastosa')
    expect(buildInput(panal.id, 'diaper', s).detail).toBe('pastosa')
  })

  it('descarta la consistencia si el pañal pasa a ser solo pipí', () => {
    const panal = ev({ type: 'diaper', subtype: 'caca', end: null, detail: 'liquida' })
    const s = { ...initialState('diaper', panal, null, NOW), subtype: 'pipi' }
    expect(buildInput(panal.id, 'diaper', s).detail).toBeNull()
  })
})
