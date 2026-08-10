// Recorre los flujos de uso reales: lo que el formulario acaba enviando a la
// API en cada situación que se da con un bebé de verdad.

import { describe, expect, it } from 'vitest'
import { aDiaper, aFeed, aSleep } from '../test-fixtures'
import {
  activeKeysOf,
  buildInput,
  initialState,
  validate,
  type FormState,
} from './recordform'

const NOW = '2026-08-07 16:00'

/** Estado del formulario de toma con las cantidades indicadas. */
function feedState(start: string, end: string, f: Partial<FormState>): FormState {
  const base = { breastMin: 0, expressedMl: 0, formulaMl: 0, ...f }
  return {
    ...initialState('feed', null, null, NOW),
    ...base,
    start,
    end,
    active: activeKeysOf({
      breastMin: base.breastMin ?? 0,
      expressedMl: base.expressedMl ?? 0,
      formulaMl: base.formulaMl ?? 0,
    }),
  }
}

describe('toma simple', () => {
  it('registra 63 ml de fórmula entre 10:13 y 10:31', () => {
    const s = feedState('2026-08-07 10:13', '2026-08-07 10:31', { formulaMl: 63 })
    expect(validate('feed', s, NOW)).toBeNull()

    const input = buildInput('id-1', 'feed', s)
    expect(input).toMatchObject({
      type: 'feed',
      start: '2026-08-07 10:13',
      end: '2026-08-07 10:31',
      durationMin: 18,
      formulaMl: 63,
      expressedMl: 0,
      breastMin: 0,
    })
  })

  it('admite cualquier cantidad, sin saltos de 10 ml', () => {
    for (const ml of [1, 7, 63, 137, 999]) {
      const s = feedState('2026-08-07 10:13', '2026-08-07 10:31', { formulaMl: ml })
      expect(validate('feed', s, NOW)).toBeNull()
      expect(buildInput('id', 'feed', s)).toMatchObject({ formulaMl: ml })
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
    // Cada magnitud viaja en su propio campo: no hay conversión de min a ml.
    expect(buildInput('id-2', 'feed', s)).toMatchObject({
      breastMin: 17,
      expressedMl: 28,
      formulaMl: 37,
    })
  })

  it('quitar un componente lo deja fuera aunque conserve su valor', () => {
    const s = feedState('2026-08-07 15:00', '2026-08-07 15:30', { breastMin: 17, formulaMl: 37 })
    const sinFormula = { ...s, active: s.active.filter((k) => k !== 'formula') }
    expect(buildInput('id-3', 'feed', sinFormula)).toMatchObject({ breastMin: 17, formulaMl: 0 })
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
    expect(buildInput('id-4', 'feed', s)).toMatchObject({
      start: '2026-08-07 13:12',
      end: '2026-08-07 13:43',
      durationMin: 31,
    })
  })

  it('una siesta pasada de 11:37 a 12:54 se guarda cerrada', () => {
    const s: FormState = {
      ...initialState('sleep', null, null, NOW),
      start: '2026-08-07 11:37',
      end: '2026-08-07 12:54',
      sleepOpen: false,
      sleepKind: 'siesta',
    }
    expect(validate('sleep', s, NOW)).toBeNull()
    expect(buildInput('id-5', 'sleep', s)).toMatchObject({
      end: '2026-08-07 12:54',
      durationMin: 77,
    })
  })

  it('rechaza horas futuras', () => {
    const s = feedState('2026-08-07 18:00', '2026-08-07 18:20', { formulaMl: 60 })
    expect(validate('feed', s, NOW)).toMatch(/futuro/)
  })
})

describe('pañal', () => {
  it('pis y caca son independientes', () => {
    const s = { ...initialState('diaper', null, null, NOW), pee: true, poop: true }
    expect(validate('diaper', s, NOW)).toBeNull()
    expect(buildInput('id-6', 'diaper', s)).toMatchObject({ pee: true, poop: true })
  })

  it('un pañal vacío no se puede guardar', () => {
    const s = { ...initialState('diaper', null, null, NOW), pee: false, poop: false }
    expect(validate('diaper', s, NOW)).toMatch(/pis, caca/)
  })

  it('la consistencia solo viaja si hay caca', () => {
    const base = initialState('diaper', null, null, NOW)
    const soloPis = { ...base, pee: true, poop: false, consistency: 'liquida' as const }
    expect(buildInput('id-7', 'diaper', soloPis)).toMatchObject({ consistency: null })

    const conCaca = { ...base, pee: false, poop: true, consistency: 'pastosa' as const }
    expect(buildInput('id-8', 'diaper', conCaca)).toMatchObject({ consistency: 'pastosa' })
  })

  it('el pañal nuevo se abre con pis marcado: es lo más frecuente', () => {
    expect(initialState('diaper', null, null, NOW)).toMatchObject({ pee: true, poop: false })
  })
})

describe('valores por defecto', () => {
  it('la toma nueva se abre lista para anotar algo recién terminado', () => {
    const s = initialState('feed', null, null, NOW)
    expect(s.start).toBe('2026-08-07 15:45')
    expect(s.end).toBe(NOW)
    expect(s.active).toEqual([])
  })

  it('repite el desglose de la toma anterior', () => {
    const s = initialState('feed', null, aFeed({ formulaMl: 45, expressedMl: 20 }), NOW)
    expect(s).toMatchObject({ formulaMl: 45, expressedMl: 20 })
    expect([...s.active].sort()).toEqual(['expressed', 'formula'])
  })

  it('el sueño nuevo propone la última hora, no un cronómetro', () => {
    const s = initialState('sleep', null, null, NOW)
    expect(s.sleepOpen).toBe(false)
    expect(s.start).toBe('2026-08-07 15:00')
    expect(s.end).toBe(NOW)
  })
})

describe('edición', () => {
  it('reabre una toma con sus componentes marcados', () => {
    const previa = aFeed({ start: '2026-08-07 09:00', end: '2026-08-07 09:20', expressedMl: 120 })
    const s = initialState('feed', previa, null, NOW)
    expect(s).toMatchObject({ expressedMl: 120, start: '2026-08-07 09:00' })
    expect(s.active).toEqual(['expressed'])
  })

  it('permite cerrar un sueño que quedó abierto', () => {
    const abierto = aSleep({ start: '2026-08-07 09:00', end: null, kind: 'nocturno' })
    const s = initialState('sleep', abierto, null, NOW)
    expect(s.sleepOpen).toBe(true)

    const cerrado: FormState = { ...s, sleepOpen: false, end: '2026-08-07 10:30' }
    expect(validate('sleep', cerrado, NOW)).toBeNull()
    expect(buildInput(abierto.id, 'sleep', cerrado)).toMatchObject({
      end: '2026-08-07 10:30',
      kind: 'nocturno',
    })
  })

  it('conserva el contenido y la consistencia de un pañal', () => {
    const panal = aDiaper({ pee: true, poop: true, consistency: 'pastosa' })
    const s = initialState('diaper', panal, null, NOW)
    expect(s).toMatchObject({ pee: true, poop: true, consistency: 'pastosa' })
  })
})
