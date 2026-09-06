// Recorre los flujos de uso reales: lo que el formulario acaba enviando a la
// API en cada situación que se da con un bebé de verdad.

import { describe, expect, it } from 'vitest'
import { aDiaper, aFeed, aMed, aMedication, aNote, aSleep } from '../test-fixtures'
import type { FeedInput, FeedItem } from '../types'
import { breastSideOfItems, deriveFeed } from './records'
import {
  buildInput,
  chosenMedication,
  endAfterStart,
  setSleepEnd,
  setSleepStart,
  toggleSleepOpen,
  feedSummary,
  feedTimes,
  initialState,
  newBottleItem,
  newBreastItem,
  nextSide,
  validate,
  withStart,
  type FormState,
} from './recordform'

const NOW = '2026-08-07 16:00'

/** Estado del formulario de toma con los elementos indicados. */
function feedState(items: FeedItem[] = [], f: Partial<FormState> = {}): FormState {
  return { ...initialState('feed', null, null, NOW), items, ...f }
}

/** Una tetada con su lado, inicio y fin. */
function tetada(side: FeedItem['side'], start: string, end: string): FeedItem {
  return { id: `${side}-${start}`, kind: 'pecho', side, start, end, ml: 0 }
}

/** Un biberón: puntual salvo que se le dé hora de fin. */
function bibe(start: string, ml: number, end: string | null = null): FeedItem {
  return { id: `bib-${start}`, kind: 'formula', side: null, start, end, ml }
}

/**
 * Lo que quedaría guardado: el servidor deriva el intervalo y los totales de
 * los elementos que le llegan, así que la prueba hace esa misma cuenta.
 */
function saved(s: FormState) {
  const input = buildInput('id', 'feed', s) as FeedInput
  return deriveFeed(input.items)
}

const IZQ = tetada('izquierdo', '2026-08-07 11:42', '2026-08-07 11:53') // 11 min
const DER = tetada('derecho', '2026-08-07 12:03', '2026-08-07 12:13') // 10 min

describe('varias tetadas siguen siendo una sola toma', () => {
  it('suma los minutos y toma las horas de la primera y la última', () => {
    const s = feedState([IZQ, DER])
    expect(validate('feed', s, NOW)).toBeNull()

    expect(saved(s)).toMatchObject({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      durationMin: 31,
      breastMin: 21, // 11 + 10, no los 31 del intervalo
      breastSide: 'ambos',
    })
  })

  it('cada tetada viaja entera, con su hora y su lado', () => {
    const input = buildInput('id-1', 'feed', feedState([IZQ, DER])) as FeedInput
    expect(input.items).toHaveLength(2)
    expect(input.items[0]).toMatchObject({
      kind: 'pecho',
      side: 'izquierdo',
      start: '2026-08-07 11:42',
      end: '2026-08-07 11:53',
    })
    expect(input.items[1]).toMatchObject({ side: 'derecho', start: '2026-08-07 12:03' })
  })

  it('con un solo pecho guarda ese lado', () => {
    expect(saved(feedState([IZQ]))).toMatchObject({
      breastMin: 11,
      breastSide: 'izquierdo',
    })
  })

  it('repetir el mismo pecho suma, sin volverlo "ambos"', () => {
    const otra = tetada('izquierdo', '2026-08-07 12:30', '2026-08-07 12:38')
    expect(saved(feedState([IZQ, otra]))).toMatchObject({
      breastMin: 19,
      breastSide: 'izquierdo',
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:38',
    })
  })

  it('las tetadas pueden llegar en cualquier orden', () => {
    expect(saved(feedState([DER, IZQ]))).toMatchObject({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
    })
  })

  it('el pecho y el biberón conviven en la misma toma', () => {
    const s = feedState([IZQ, bibe('2026-08-07 12:05', 60)])
    expect(saved(s)).toMatchObject({
      breastMin: 11,
      breastSide: 'izquierdo',
      formulaMl: 60,
      // El biberón vino después y alargó la toma, sin tocar los minutos de pecho.
      end: '2026-08-07 12:05',
    })
  })
})

describe('toma solo de biberón', () => {
  it('es puntual: una hora y ya, sin fin que ajustar', () => {
    const s = feedState([bibe('2026-08-07 13:13', 60)])
    expect(validate('feed', s, NOW)).toBeNull()
    expect(saved(s)).toMatchObject({
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
      const s = feedState([bibe('2026-08-07 13:13', ml)])
      expect(validate('feed', s, NOW)).toBeNull()
      expect(saved(s)).toMatchObject({ formulaMl: ml })
    }
  })

  it('dos biberones en la misma toma se suman', () => {
    const s = feedState([bibe('2026-08-07 13:13', 60), bibe('2026-08-07 13:40', 30)])
    expect(saved(s)).toMatchObject({ formulaMl: 90, start: '2026-08-07 13:13', end: '2026-08-07 13:40' })
  })

  it('la leche extraída y la fórmula no se mezclan', () => {
    const extraida: FeedItem = { ...bibe('2026-08-07 13:13', 30), kind: 'extraida' }
    const s = feedState([extraida, bibe('2026-08-07 13:20', 60)])
    expect(saved(s)).toMatchObject({ expressedMl: 30, formulaMl: 60 })
  })
})

describe('lo que impide guardar una toma', () => {
  it('una toma vacía', () => {
    expect(validate('feed', feedState(), NOW)).toMatch(/Añade una tetada/)
  })

  it('una tetada que acaba antes de empezar', () => {
    const alReves = tetada('izquierdo', '2026-08-07 12:00', '2026-08-07 11:50')
    expect(validate('feed', feedState([alReves]), NOW)).toMatch(/anterior al inicio/)
  })

  it('una tetada en el futuro', () => {
    const futura = tetada('izquierdo', '2026-08-07 18:00', '2026-08-07 18:10')
    expect(validate('feed', feedState([futura]), NOW)).toMatch(/futuro/)
  })

  it('un biberón con hora futura', () => {
    expect(validate('feed', feedState([bibe('2026-08-07 18:00', 60)]), NOW)).toMatch(/futuro/)
  })

  it('un biberón sin cantidad', () => {
    expect(validate('feed', feedState([bibe('2026-08-07 13:13', 0)]), NOW)).toMatch(/mililitros/)
  })
})

describe('ayudas al rellenar', () => {
  it('propone el pecho contrario al de la última tetada', () => {
    expect(nextSide([IZQ], null)).toBe('derecho')
    expect(nextSide([IZQ, DER], null)).toBe('izquierdo')
    // Sin tetadas todavía, se mira el de la toma anterior.
    expect(nextSide([], 'derecho')).toBe('izquierdo')
    expect(nextSide([], null)).toBe('izquierdo')
    // Los biberones no cuentan para decidir el pecho.
    expect(nextSide([IZQ, bibe('2026-08-07 12:00', 60)], null)).toBe('derecho')
  })

  it('una tetada nueva empieza ahora y dura un minuto, para cerrarla luego', () => {
    // Se apunta cuando empieza, que es cuando se tiene el móvil en la mano:
    // en ese momento no se sabe cuánto va a durar.
    const item = newBreastItem('izquierdo', NOW)
    expect(item.start).toBe(NOW)
    expect(item.end).toBe('2026-08-07 16:01')
    // Y se puede guardar tal cual, sin tocar nada más.
    expect(validate('feed', feedState([item]), NOW)).toBeNull()
  })

  it('un biberón nuevo es puntual, a esta hora', () => {
    expect(newBottleItem('formula', 60, NOW)).toMatchObject({ start: NOW, end: null, ml: 60 })
  })

  it('resume en una frase lo que se va a guardar', () => {
    expect(feedSummary(feedState([IZQ, DER]))).toBe('21 min de pecho de 11:42 a 12:13')
    expect(feedSummary(feedState([bibe('2026-08-07 13:13', 60)]))).toBe(
      '60 ml de fórmula a las 13:13'
    )
    expect(feedSummary(feedState())).toBe('')
  })

  it('sin toma anterior se abre vacía, a esta hora', () => {
    const s = initialState('feed', null, null, NOW)
    expect(s.start).toBe(NOW)
    expect(s.items).toEqual([])
  })

  it('repite los biberones de la toma anterior', () => {
    const s = initialState('feed', null, aFeed({ formulaMl: 45, expressedMl: 20 }), NOW)
    expect(s.items).toHaveLength(2)
    expect(saved(s)).toMatchObject({ formulaMl: 45, expressedMl: 20 })
    // Con la hora de ahora, no la de la toma anterior.
    expect(s.items.every((i) => i.start === NOW)).toBe(true)
  })
})

describe('mover la hora de inicio', () => {
  it('el fin recién propuesto sigue al inicio', () => {
    const item = newBreastItem('izquierdo', NOW)
    const movida = withStart(item, '2026-08-07 15:30')
    expect(movida.start).toBe('2026-08-07 15:30')
    expect(movida.end).toBe('2026-08-07 15:31')
  })

  it('un fin escrito a mano no se pierde al corregir el inicio', () => {
    // Lo que costó anotar manda: aquí solo se estaba ajustando el inicio.
    const terminada = tetada('izquierdo', '2026-08-07 14:00', '2026-08-07 14:25')
    expect(withStart(terminada, '2026-08-07 13:55').end).toBe('2026-08-07 14:25')
  })

  it('si el cambio dejaría el fin detrás, se arrastra', () => {
    // Guardar una tetada que acaba antes de empezar es imposible: en vez de
    // dejar el formulario en error, el fin se mueve con el inicio.
    const terminada = tetada('izquierdo', '2026-08-07 14:00', '2026-08-07 14:25')
    const movida = withStart(terminada, '2026-08-07 14:40')
    expect(movida.end).toBe('2026-08-07 14:41')
    expect(validate('feed', feedState([movida]), NOW)).toBeNull()
  })

  it('un biberón puntual no gana una hora de fin por moverlo', () => {
    const puntual = bibe('2026-08-07 13:13', 60)
    expect(withStart(puntual, '2026-08-07 13:30')).toMatchObject({
      start: '2026-08-07 13:30',
      end: null,
    })
  })

  it('el sueño tampoco deja el fin detrás del inicio', () => {
    expect(endAfterStart('2026-08-07 14:00', '2026-08-07 15:00')).toBe('2026-08-07 15:00')
    expect(endAfterStart('2026-08-07 16:00', '2026-08-07 15:00')).toBe('2026-08-07 16:01')
    expect(endAfterStart('2026-08-07 15:00', '2026-08-07 15:00')).toBe('2026-08-07 15:01')
  })
})

describe('editar una toma ya guardada', () => {
  it('vuelve con todo lo que pasó dentro, elemento a elemento', () => {
    const previa = aFeed({
      items: [IZQ, DER, bibe('2026-08-07 12:20', 60)],
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:20',
    })
    const s = initialState('feed', previa, null, NOW)
    expect(s.items).toHaveLength(3)
    expect(s.items[0]).toMatchObject({ side: 'izquierdo', start: '2026-08-07 11:42' })
    expect(s.items[2]).toMatchObject({ kind: 'formula', ml: 60 })
  })

  it('guardar sin tocar nada deja la toma exactamente igual', () => {
    // Este es el caso que el modelo anterior no podía representar: una toma
    // más larga que sus tetadas porque después vino un biberón.
    const previa = aFeed({
      items: [IZQ, DER, bibe('2026-08-07 12:13', 60)],
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
    })
    const s = initialState('feed', previa, null, NOW)
    expect(saved(s)).toMatchObject({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
      durationMin: 31,
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
    })
  })

  it('un biberón guardado se reabre sin tetadas', () => {
    const previa = aFeed({ start: '2026-08-07 13:13', end: '2026-08-07 13:13', formulaMl: 60 })
    const s = initialState('feed', previa, null, NOW)
    expect(s.items).toHaveLength(1)
    expect(s.items[0]).toMatchObject({ kind: 'formula', start: '2026-08-07 13:13' })
  })

  it('quitar una tetada encoge la toma; añadir otra la alarga', () => {
    const previa = aFeed({ items: [IZQ, DER], start: '2026-08-07 11:42', end: '2026-08-07 12:13' })
    const s = initialState('feed', previa, null, NOW)

    const sinLaSegunda = { ...s, items: s.items.filter((i) => i.id !== DER.id) }
    expect(saved(sinLaSegunda)).toMatchObject({ end: '2026-08-07 11:53', breastMin: 11 })

    const conOtra = { ...s, items: [...s.items, bibe('2026-08-07 12:40', 60)] }
    expect(saved(conOtra)).toMatchObject({ end: '2026-08-07 12:40', formulaMl: 60 })
  })
})

describe('cálculos de la toma', () => {
  it('resuelve qué pechos se usaron', () => {
    expect(breastSideOfItems([IZQ])).toBe('izquierdo')
    expect(breastSideOfItems([IZQ, DER])).toBe('ambos')
    expect(breastSideOfItems([tetada('ambos', '2026-08-07 11:00', '2026-08-07 11:10')])).toBe(
      'ambos'
    )
    expect(breastSideOfItems([])).toBeNull()
    // Un biberón no dice nada del pecho.
    expect(breastSideOfItems([bibe('2026-08-07 13:13', 60)])).toBeNull()
  })

  it('las horas de la toma salen del primer elemento y del último', () => {
    expect(feedTimes(feedState([IZQ, DER]))).toEqual({
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:13',
    })
  })

  it('con un biberón puntual, la toma es un instante', () => {
    expect(feedTimes(feedState([bibe('2026-08-07 13:13', 60)]))).toEqual({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:13',
    })
  })
})

describe('registro retrospectivo', () => {
  it('a las 16:00 se puede anotar una toma de 13:12 a 13:43', () => {
    const s = feedState([tetada('izquierdo', '2026-08-07 13:12', '2026-08-07 13:43')])
    expect(validate('feed', s, NOW)).toBeNull()
    expect(saved(s)).toMatchObject({
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
    expect(saved(feedState([sinAnotar]))).toMatchObject({
      breastMin: 20,
      breastSide: 'desconocido',
    })
  })

  it('mezclada con un lado conocido sigue sin saberse', () => {
    // Media respuesta no autoriza a decir "ambos".
    expect(breastSideOfItems([IZQ, sinAnotar])).toBe('desconocido')
  })

  it('si las conocidas ya suman los dos pechos, es "ambos" igualmente', () => {
    expect(breastSideOfItems([IZQ, DER, sinAnotar])).toBe('ambos')
  })
})

describe('hora de fin del biberón', () => {
  it('sin pedirla, el biberón es puntual', () => {
    expect(saved(feedState([bibe('2026-08-07 13:13', 60)]))).toMatchObject({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:13',
      durationMin: 0,
    })
  })

  it('pidiéndola, se guarda la duración: no es igual en 3 minutos que en 20', () => {
    const s = feedState([bibe('2026-08-07 13:13', 60, '2026-08-07 13:33')])
    expect(validate('feed', s, NOW)).toBeNull()
    expect(saved(s)).toMatchObject({
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:33',
      durationMin: 20,
    })
  })

  it('un biberón con duración se reabre conservándola', () => {
    const previa = aFeed({
      items: [bibe('2026-08-07 13:13', 60, '2026-08-07 13:33')],
      start: '2026-08-07 13:13',
      end: '2026-08-07 13:33',
    })
    const s = initialState('feed', previa, null, NOW)
    expect(s.items[0].end).toBe('2026-08-07 13:33')
    expect(saved(s)).toMatchObject({ end: '2026-08-07 13:33', durationMin: 20 })
  })
})

describe('detalle del pañal', () => {
  it('la caca lleva su cantidad, y solo viaja si hubo caca', () => {
    const base = initialState('diaper', null, null, NOW)
    const conCaca = { ...base, pee: false, poop: true, poopAmount: 'mucho' as const }
    expect(buildInput('id', 'diaper', conCaca)).toMatchObject({ poopAmount: 'mucho' })

    const sinCaca = { ...base, pee: true, poop: false, poopAmount: 'mucho' as const }
    expect(buildInput('id', 'diaper', sinCaca)).toMatchObject({ poopAmount: null })
  })

  it('reabrir un pañal conserva las dos cantidades y la consistencia', () => {
    const panal = aDiaper({
      pee: true,
      peeAmount: 'poco',
      poop: true,
      poopAmount: 'mucho',
      consistency: 'liquida',
    })
    expect(initialState('diaper', panal, null, NOW)).toMatchObject({
      peeAmount: 'poco',
      poopAmount: 'mucho',
      consistency: 'liquida',
    })
  })

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

describe('medicación', () => {
  const vitd = aMedication({ id: 'm-vitd', name: 'Vitamina D', dose: 0.6, unit: 'ml' })
  const apiretal = aMedication({ id: 'm-api', name: 'Apiretal', dose: 2.4, unit: 'ml' })

  it('con un solo tratamiento en curso viene ya elegido, con su dosis', () => {
    // Es el caso de todos los días: registrar la vitamina D tiene que ser un
    // botón, no una elección entre una sola cosa.
    expect(initialState('med', null, null, NOW, [vitd])).toMatchObject({
      medId: 'm-vitd',
      medName: 'Vitamina D',
      amount: 0.6,
      unit: 'ml',
    })
  })

  it('con dos, no elige por su cuenta', () => {
    expect(initialState('med', null, null, NOW, [vitd, apiretal])).toMatchObject({
      medId: '',
      medName: '',
    })
  })

  it('un tratamiento terminado no se propone', () => {
    const terminado = aMedication({ ...vitd, to: '2026-08-01' })
    expect(initialState('med', null, null, NOW, [terminado]).medName).toBe('')
  })

  it('elegir un medicamento trae su nombre y su dosis habitual', () => {
    expect(chosenMedication(apiretal)).toEqual({
      medId: 'm-api',
      medName: 'Apiretal',
      amount: 2.4,
      unit: 'ml',
    })
  })

  it('guarda la cantidad que se dio de verdad, no la del catálogo', () => {
    const s = { ...initialState('med', null, null, NOW, [vitd]), amount: 1.2 }
    expect(buildInput('id', 'med', s)).toMatchObject({
      type: 'med',
      medId: 'm-vitd',
      medName: 'Vitamina D',
      amount: 1.2,
      unit: 'ml',
    })
  })

  it('sin medicamento no se puede guardar', () => {
    const s = initialState('med', null, null, NOW, [])
    expect(validate('med', s, NOW)).toMatch(/Elige el medicamento/)
  })

  it('la cantidad es opcional: lo esencial es qué se le dio y cuándo', () => {
    const s = { ...initialState('med', null, null, NOW, [vitd]), amount: 0 }
    expect(validate('med', s, NOW)).toBeNull()
    expect(buildInput('id', 'med', s)).toMatchObject({ amount: 0 })
  })

  it('la hora no puede estar en el futuro', () => {
    const s = { ...initialState('med', null, null, NOW, [vitd]), start: '2026-08-07 17:00' }
    expect(validate('med', s, NOW)).toMatch(/futuro/)
  })

  it('reabrir una dosis vuelve con lo que se dio, aunque cambie el catálogo', () => {
    const dosis = aMed({ medId: 'm-vitd', medName: 'Vitamina D', amount: 0.6, unit: 'ml' })
    expect(initialState('med', dosis, null, NOW, [])).toMatchObject({
      medId: 'm-vitd',
      medName: 'Vitamina D',
      amount: 0.6,
      unit: 'ml',
    })
  })
})

describe('nota del día', () => {
  const estado = (p = {}) => ({ ...initialState('note', null, null, NOW), ...p })

  it('se abre vacía y a la hora de ahora', () => {
    expect(estado()).toMatchObject({ notes: '', starred: false, start: NOW })
  })

  it('sin texto no se puede guardar', () => {
    expect(validate('note', estado(), NOW)).toMatch(/Escribe la nota/)
    expect(validate('note', estado({ notes: '   ' }), NOW)).toMatch(/Escribe la nota/)
    expect(validate('note', estado({ notes: 'Buen día.' }), NOW)).toBeNull()
  })

  it('el texto viaja en notes, que es donde vive en todos los registros', () => {
    const s = estado({ notes: '  Salimos a pasear.  ', starred: true })
    expect(buildInput('id', 'note', s)).toEqual({
      id: 'id',
      type: 'note',
      start: NOW,
      notes: 'Salimos a pasear.',
      starred: true,
    })
  })

  it('reabrir una nota vuelve con su texto y su estrella', () => {
    const nota = aNote({ notes: 'Primera vez fuera de casa.', starred: true })
    expect(initialState('note', nota, null, NOW)).toMatchObject({
      notes: 'Primera vez fuera de casa.',
      starred: true,
      start: nota.start,
    })
  })

  it('la hora no puede estar en el futuro', () => {
    const s = estado({ notes: 'Algo.', start: '2026-08-07 18:00' })
    expect(validate('note', s, NOW)).toMatch(/futuro/)
  })
})

describe('cambiar entre "ya despertó" y "sigue durmiendo"', () => {
  const ABRE = '2026-08-07 22:30'
  const LUEGO = '2026-08-07 22:32'
  const nuevo = () => initialState('sleep', null, null, ABRE)

  it('se abre proponiendo una siesta que ya terminó', () => {
    expect(nuevo()).toMatchObject({
      sleepOpen: false,
      start: '2026-08-07 21:30',
      end: ABRE,
      timesTouched: false,
    })
  })

  it('marcar "sigue durmiendo" propone que se acaba de dormir', () => {
    const patch = toggleSleepOpen(nuevo(), true, LUEGO, true)
    expect(patch).toMatchObject({ sleepOpen: true, start: LUEGO })
  })

  it('y volver a "ya despertó" vuelve a proponer la siesta terminada', () => {
    let s = nuevo()
    s = { ...s, ...toggleSleepOpen(s, true, LUEGO, true) }
    expect(toggleSleepOpen(s, false, LUEGO, true)).toMatchObject({
      sleepOpen: false,
      start: '2026-08-07 21:32',
      end: LUEGO,
    })
  })

  // Lo que llevaba a tener que corregir el registro después: se escribía la
  // hora buena y el botón la borraba sin decir nada.
  it('lo que se ha escrito no se toca nunca', () => {
    const escrito = { ...nuevo(), ...setSleepStart(nuevo(), '2026-08-07 22:15') }
    expect(escrito.timesTouched).toBe(true)

    const patch = toggleSleepOpen(escrito, true, LUEGO, true)
    expect(patch).toEqual({ sleepOpen: true })
    expect({ ...escrito, ...patch }.start).toBe('2026-08-07 22:15')
  })

  it('tampoco al mover solo la hora de despertar', () => {
    const escrito = { ...nuevo(), ...setSleepEnd(nuevo(), '2026-08-07 22:20') }
    const patch = toggleSleepOpen(escrito, true, LUEGO, true)
    expect(patch).toEqual({ sleepOpen: true })
  })

  it('editando uno ya guardado no le toca las horas', () => {
    // Las de un registro que existe son lo que pasó de verdad.
    const s = { ...nuevo(), start: '2026-08-07 20:00', end: '2026-08-07 21:00' }
    expect(toggleSleepOpen(s, true, LUEGO, false)).toEqual({ sleepOpen: true })
  })

  it('volver a "ya despertó" nunca deja el fin por detrás del inicio', () => {
    // Con las horas escritas a mano no se repropone nada, así que el fin
    // podría haberse quedado antes que el inicio: eso no se podía guardar.
    const s = {
      ...nuevo(),
      timesTouched: true,
      sleepOpen: true,
      start: '2026-08-07 22:32',
      end: '2026-08-07 22:30',
    }
    const patch = toggleSleepOpen(s, false, LUEGO, true)
    expect(patch.end! > s.start).toBe(true)
    expect(validate('sleep', { ...s, ...patch }, '2026-08-07 22:35')).toBeNull()
  })

  it('ida y vuelta acaba siempre en algo guardable', () => {
    for (const tocadas of [false, true]) {
      let s = { ...nuevo(), timesTouched: tocadas }
      s = { ...s, ...toggleSleepOpen(s, true, LUEGO, true) }
      s = { ...s, ...toggleSleepOpen(s, false, '2026-08-07 22:33', true) }
      expect(validate('sleep', s, '2026-08-07 22:33')).toBeNull()
    }
  })

  it('mover el inicio arrastra el fin solo si se quedaría detrás', () => {
    const s = nuevo()
    expect(setSleepStart(s, '2026-08-07 21:00').end).toBe(s.end) // sigue valiendo
    expect(setSleepStart(s, '2026-08-07 23:00').end).toBe('2026-08-07 23:01')
  })
})
