// Recorre los flujos de uso reales: lo que el formulario acaba enviando a la
// API en cada situación que se da con un bebé de verdad.

import { describe, expect, it } from 'vitest'
import { aDiaper, aFeed, aSleep } from '../test-fixtures'
import {
  activeKeysOf,
  breastMinutes,
  breastSideOf,
  buildInput,
  feedSummary,
  initialState,
  newSession,
  nextSide,
  feedTimes,
  validate,
  type BreastSession,
  type FormState,
} from './recordform'

const NOW = '2026-08-07 16:00'

/** Estado del formulario de toma con las cantidades y tetadas indicadas. */
function feedState(f: Partial<FormState> = {}): FormState {
  const base = { expressedMl: 0, formulaMl: 0, ...f }
  return {
    ...initialState('feed', null, null, NOW),
    ...base,
    active: activeKeysOf({
      expressedMl: base.expressedMl ?? 0,
      formulaMl: base.formulaMl ?? 0,
    }),
  }
}

/** Una tetada con su lado, inicio y fin. */
function tetada(side: BreastSession['side'], start: string, end: string): BreastSession {
  return { key: `${side}-${start}`, side, start, end }
}

const IZQ = tetada('izquierdo', '2026-08-07 11:42', '2026-08-07 11:53') // 11 min
const DER = tetada('derecho', '2026-08-07 12:03', '2026-08-07 12:13') // 10 min

describe('varias tetadas siguen siendo una sola toma', () => {
  it('suma los minutos y toma las horas de la primera y la última', () => {
    const s = feedState({ sessions: [IZQ, DER] })
    expect(validate('feed', s, NOW)).toBeNull()

    const input = buildInput('id-1', 'feed', s)
    expect(input).toMatchObject({
      type: 'feed',
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      durationMin: 31,
      breastMin: 21, // 11 + 10, no los 31 del intervalo
      breastSide: 'ambos',
    })
  })

  it('con un solo pecho guarda ese lado', () => {
    expect(buildInput('id', 'feed', feedState({ sessions: [IZQ] }))).toMatchObject({
      breastMin: 11,
      breastSide: 'izquierdo',
    })
  })

  it('repetir el mismo pecho suma, sin volverlo "ambos"', () => {
    const otra = tetada('izquierdo', '2026-08-07 12:30', '2026-08-07 12:38')
    expect(buildInput('id', 'feed', feedState({ sessions: [IZQ, otra] }))).toMatchObject({
      breastMin: 19,
      breastSide: 'izquierdo',
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:38',
    })
  })

  it('las tetadas pueden llegar en cualquier orden', () => {
    const s = feedState({ sessions: [DER, IZQ] })
    expect(buildInput('id', 'feed', s)).toMatchObject({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
    })
  })

  it('el pecho y el biberón conviven en la misma toma', () => {
    const s = feedState({ sessions: [IZQ], formulaMl: 60 })
    expect(buildInput('id', 'feed', s)).toMatchObject({
      breastMin: 11,
      breastSide: 'izquierdo',
      formulaMl: 60,
    })
  })
})

describe('toma solo de biberón', () => {
  it('es puntual: una hora y ya, sin fin que ajustar', () => {
    const s = { ...feedState({ formulaMl: 60 }), start: '2026-08-07 13:13' }
    expect(validate('feed', s, NOW)).toBeNull()
    expect(buildInput('id-2', 'feed', s)).toMatchObject({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:13',
      durationMin: 0,
      formulaMl: 60,
      breastMin: 0,
      breastSide: null,
    })
  })

  it('admite cualquier cantidad, sin saltos', () => {
    for (const ml of [1, 7, 63, 137, 999]) {
      const s = feedState({ formulaMl: ml })
      expect(validate('feed', s, NOW)).toBeNull()
      expect(buildInput('id', 'feed', s)).toMatchObject({ formulaMl: ml })
    }
  })

  it('quitar una cantidad la deja fuera aunque conserve su valor', () => {
    const s = feedState({ expressedMl: 30, formulaMl: 60 })
    const sinFormula = { ...s, active: s.active.filter((k) => k !== 'formula') }
    expect(buildInput('id', 'feed', sinFormula)).toMatchObject({ expressedMl: 30, formulaMl: 0 })
  })
})

describe('lo que impide guardar una toma', () => {
  it('una toma vacía', () => {
    expect(validate('feed', feedState(), NOW)).toMatch(/Añade una tetada/)
  })

  it('una tetada que acaba antes de empezar', () => {
    const alReves = tetada('izquierdo', '2026-08-07 12:00', '2026-08-07 11:50')
    expect(validate('feed', feedState({ sessions: [alReves] }), NOW)).toMatch(/después de empezar/)
  })

  it('una tetada en el futuro', () => {
    const futura = tetada('izquierdo', '2026-08-07 18:00', '2026-08-07 18:10')
    expect(validate('feed', feedState({ sessions: [futura] }), NOW)).toMatch(/futuro/)
  })

  it('un biberón con hora futura', () => {
    const s = { ...feedState({ formulaMl: 60 }), start: '2026-08-07 18:00' }
    expect(validate('feed', s, NOW)).toMatch(/futuro/)
  })
})

describe('ayudas al rellenar', () => {
  it('propone el pecho contrario al de la última tetada', () => {
    expect(nextSide([IZQ], null)).toBe('derecho')
    expect(nextSide([IZQ, DER], null)).toBe('izquierdo')
    // Sin tetadas todavía, se mira el de la toma anterior.
    expect(nextSide([], 'derecho')).toBe('izquierdo')
    expect(nextSide([], null)).toBe('izquierdo')
  })

  it('una tetada nueva se propone acabando ahora', () => {
    const s = newSession('izquierdo', NOW)
    expect(s.end).toBe(NOW)
    expect(s.start).toBe('2026-08-07 15:50')
  })

  it('resume en una frase lo que se va a guardar', () => {
    expect(feedSummary(feedState({ sessions: [IZQ, DER] }))).toBe(
      '21 min de pecho de 11:42 a 12:13'
    )
    expect(feedSummary({ ...feedState({ formulaMl: 60 }), start: '2026-08-07 13:13' })).toBe(
      '60 ml de fórmula a las 13:13'
    )
    expect(feedSummary(feedState())).toBe('')
  })

  it('sin tetadas, la toma se abre a esta hora y sin nada marcado', () => {
    const s = initialState('feed', null, null, NOW)
    expect(s.start).toBe(NOW)
    expect(s.end).toBe(NOW)
    expect(s.sessions).toEqual([])
  })

  it('repite las cantidades de la toma anterior', () => {
    const s = initialState('feed', null, aFeed({ formulaMl: 45, expressedMl: 20 }), NOW)
    expect(s).toMatchObject({ formulaMl: 45, expressedMl: 20 })
    expect([...s.active].sort()).toEqual(['expressed', 'formula'])
  })
})

describe('editar una toma ya guardada', () => {
  it('reconstruye una tetada que resume los minutos guardados', () => {
    const previa = aFeed({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      breastMin: 21,
      breastSide: 'ambos',
    })
    const s = initialState('feed', previa, null, NOW)
    expect(s.sessions).toHaveLength(1)
    expect(s.sessions[0]).toMatchObject({ side: 'ambos', start: '2026-08-07 11:42' })
    expect(breastMinutes(s.sessions)).toBe(21)
  })

  it('guardar sin tocar nada no cambia lo que había', () => {
    const previa = aFeed({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
    })
    const s = initialState('feed', previa, null, NOW)
    expect(buildInput(previa.id, 'feed', s)).toMatchObject({
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
    })
  })

  it('un biberón guardado se reabre sin tetadas', () => {
    const previa = aFeed({ start: '2026-08-07 13:13', end: '2026-08-07 13:13', formulaMl: 60 })
    const s = initialState('feed', previa, null, NOW)
    expect(s.sessions).toEqual([])
    expect(s.start).toBe('2026-08-07 13:13')
  })
})

describe('cálculos de las tetadas', () => {
  it('suma los minutos de cada una', () => {
    expect(breastMinutes([IZQ, DER])).toBe(21)
    expect(breastMinutes([])).toBe(0)
  })

  it('resuelve qué pechos se usaron', () => {
    expect(breastSideOf([IZQ])).toBe('izquierdo')
    expect(breastSideOf([IZQ, DER])).toBe('ambos')
    expect(breastSideOf([tetada('ambos', '2026-08-07 11:00', '2026-08-07 11:10')])).toBe('ambos')
    expect(breastSideOf([])).toBeNull()
  })

  it('las horas de la toma salen de la primera y la última tetada', () => {
    expect(feedTimes(feedState({ sessions: [IZQ, DER] }))).toEqual({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
    })
  })

  it('sin tetadas manda la hora que se haya puesto', () => {
    const s = { ...feedState({ formulaMl: 60 }), start: '2026-08-07 13:13', end: '2026-08-07 13:13' }
    expect(feedTimes(s)).toEqual({ start: '2026-08-07 13:13', end: '2026-08-07 13:13' })
  })
})

describe('registro retrospectivo', () => {
  it('a las 16:00 se puede anotar una toma de 13:12 a 13:43', () => {
    const s = feedState({
      sessions: [tetada('izquierdo', '2026-08-07 13:12', '2026-08-07 13:43')],
    })
    expect(validate('feed', s, NOW)).toBeNull()
    expect(buildInput('id-4', 'feed', s)).toMatchObject({
      start: '2026-08-07 13:12',
      end: '2026-08-07 13:43',
      durationMin: 31,
      breastMin: 31,
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

describe('sueño', () => {
  it('el sueño nuevo propone la última hora, no un cronómetro', () => {
    const s = initialState('sleep', null, null, NOW)
    expect(s.sleepOpen).toBe(false)
    expect(s.start).toBe('2026-08-07 15:00')
    expect(s.end).toBe(NOW)
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

  it('conserva el contenido y la consistencia de un pañal al reabrirlo', () => {
    const panal = aDiaper({ pee: true, poop: true, consistency: 'pastosa' })
    const s = initialState('diaper', panal, null, NOW)
    expect(s).toMatchObject({ pee: true, poop: true, consistency: 'pastosa' })
  })
})

describe('cuando no se sabe qué pecho fue', () => {
  const sinAnotar = tetada('desconocido', '2026-08-07 03:00', '2026-08-07 03:20')

  it('una tetada sin anotar se guarda como tal, sin inventar lado', () => {
    expect(buildInput('id', 'feed', feedState({ sessions: [sinAnotar] }))).toMatchObject({
      breastMin: 20,
      breastSide: 'desconocido',
    })
  })

  it('mezclada con un lado conocido sigue sin saberse', () => {
    // Media respuesta no autoriza a decir "ambos".
    expect(breastSideOf([IZQ, sinAnotar])).toBe('desconocido')
  })

  it('si las conocidas ya suman los dos pechos, es "ambos" igualmente', () => {
    expect(breastSideOf([IZQ, DER, sinAnotar])).toBe('ambos')
  })
})

describe('hora de fin del biberón', () => {
  it('sin pedirla, la toma es puntual', () => {
    const s = { ...feedState({ formulaMl: 60 }), start: '2026-08-07 13:13' }
    expect(buildInput('id', 'feed', s)).toMatchObject({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:13',
      durationMin: 0,
    })
  })

  it('pidiéndola, se guarda la duración: no es igual en 3 minutos que en 20', () => {
    const s = {
      ...feedState({ formulaMl: 60 }),
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:33',
      manualTimes: true,
    }
    expect(validate('feed', s, NOW)).toBeNull()
    expect(buildInput('id', 'feed', s)).toMatchObject({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:33',
      durationMin: 20,
    })
  })

  it('un biberón con duración se reabre conservándola', () => {
    const previa = aFeed({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:33',
      durationMin: 20,
      formulaMl: 60,
    })
    const s = initialState('feed', previa, null, NOW)
    expect(s.manualTimes).toBe(true)
    expect(buildInput(previa.id, 'feed', s)).toMatchObject({ end: '2026-08-07 13:33' })
  })

  it('un biberón puntual se reabre sin pedir el fin', () => {
    const previa = aFeed({ start: '2026-08-07 13:13', end: '2026-08-07 13:13', formulaMl: 60 })
    expect(initialState('feed', previa, null, NOW).manualTimes).toBe(false)
  })
})

describe('detalle del pañal', () => {
  it('la cantidad de pis solo viaja si hubo pis', () => {
    const base = initialState('diaper', null, null, NOW)
    const conPis = { ...base, pee: true, poop: false, peeAmount: 'mucho' as const }
    expect(buildInput('id', 'diaper', conPis)).toMatchObject({ peeAmount: 'mucho' })

    const sinPis = { ...base, pee: false, poop: true, peeAmount: 'mucho' as const }
    expect(buildInput('id', 'diaper', sinPis)).toMatchObject({ peeAmount: null })
  })

  it('el pedete es una consistencia más', () => {
    const s = { ...initialState('diaper', null, null, NOW), poop: true, consistency: 'pedete' as const }
    expect(buildInput('id', 'diaper', s)).toMatchObject({ consistency: 'pedete' })
  })

  it('reabrir un pañal conserva sus dos detalles', () => {
    const panal = aDiaper({ pee: true, peeAmount: 'poco', poop: true, consistency: 'pedete' })
    expect(initialState('diaper', panal, null, NOW)).toMatchObject({
      peeAmount: 'poco',
      consistency: 'pedete',
    })
  })
})

describe('horas de la toma puestas a mano', () => {
  it('reabrir y guardar sin tocar nada no recorta la toma', () => {
    // La tetada resumen dura 21 min desde las 11:42, o sea hasta las 12:03,
    // pero la toma llegó hasta las 12:13 porque después vino un biberón.
    const previa = aFeed({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      durationMin: 31,
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
    })
    const s = initialState('feed', previa, null, NOW)
    expect(s.manualTimes).toBe(true)
    expect(buildInput(previa.id, 'feed', s)).toMatchObject({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      durationMin: 31,
      breastMin: 21,
    })
  })

  it('una toma cuyo intervalo sí coincide con la tetada no necesita horas a mano', () => {
    const previa = aFeed({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:03',
      durationMin: 21,
      breastMin: 21,
      breastSide: 'izquierdo',
    })
    expect(initialState('feed', previa, null, NOW).manualTimes).toBe(false)
  })

  it('con tetadas, ajustar el final a mano manda sobre lo derivado', () => {
    const s = {
      ...feedState({ sessions: [IZQ, DER], formulaMl: 60 }),
      manualTimes: true,
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:30', // el biberón alargó la toma
    }
    expect(validate('feed', s, NOW)).toBeNull()
    expect(buildInput('id', 'feed', s)).toMatchObject({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:30',
      durationMin: 48,
      breastMin: 21, // los minutos de pecho siguen siendo los de las tetadas
    })
  })

  it('quitar el ajuste devuelve las horas a las tetadas', () => {
    const s = feedState({ sessions: [IZQ, DER] })
    expect(feedTimes({ ...s, manualTimes: false })).toEqual({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
    })
  })
})
