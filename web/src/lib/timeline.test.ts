import { describe, expect, it } from 'vitest'
import { aBath, aDay, aDiaper, aFeed, aSleep } from '../test-fixtures'
import { filterByType, timelineRows, windowRecords } from './timeline'

describe('windowRecords', () => {
  const noche = aSleep({ start: '2026-08-06 21:30', end: '2026-08-07 07:00' })
  const toma = aFeed({ start: '2026-08-07 10:00', end: '2026-08-07 10:20' })
  const siesta = aSleep({ start: '2026-08-07 12:00', end: '2026-08-07 13:00' })

  const ayer = aDay({ date: '2026-08-06', records: [noche] })
  const hoy = aDay({ date: '2026-08-07', records: [noche, toma, siesta] })

  it('toma los registros que empiezan dentro del periodo', () => {
    const out = windowRecords([hoy], '2026-08-07 00:00', '2026-08-08 00:00')
    expect(out.map((r) => r.id)).toEqual([toma.id, siesta.id])
  })

  it('no repite un registro que llega en varios días cargados', () => {
    const out = windowRecords([hoy, ayer], '2026-08-06 00:00', '2026-08-08 00:00')
    expect(out.filter((r) => r.id === noche.id)).toHaveLength(1)
  })

  it('con includeEarlier recoge lo que venía de antes', () => {
    const out = windowRecords([hoy], '2026-08-07 00:00', '2026-08-08 00:00', {
      includeEarlier: true,
    })
    expect(out.map((r) => r.id)).toContain(noche.id)
  })

  it('devuelve todo en orden cronológico', () => {
    const out = windowRecords([hoy], '2026-08-07 00:00', '2026-08-08 00:00', {
      includeEarlier: true,
    })
    expect(out.map((r) => r.start)).toEqual([...out.map((r) => r.start)].sort())
  })

  it('sirve igual para un día de vida que no empieza a medianoche', () => {
    const out = windowRecords([hoy, ayer], '2026-08-06 09:17', '2026-08-07 09:17')
    expect(out.map((r) => r.id)).toEqual([noche.id])
  })
})

describe('tramos encadenados', () => {
  // Dos días de vida seguidos, como cuando se pulsa "Ver anteriores".
  const primero = { start: '2026-08-09 22:40', end: '2026-08-10 22:40' }
  const segundo = { start: '2026-08-10 22:40', end: '2026-08-11 22:40' }

  const records = [
    aFeed({ id: 'a', start: '2026-08-10 08:00', end: '2026-08-10 08:20' }),
    aFeed({ id: 'b', start: '2026-08-10 22:00', end: '2026-08-10 22:20' }),
    // Justo en el corte: pertenece al tramo que empieza ahí.
    aFeed({ id: 'c', start: '2026-08-10 22:40', end: '2026-08-10 23:00' }),
    aFeed({ id: 'd', start: '2026-08-11 06:00', end: '2026-08-11 06:20' }),
  ]
  const days = [
    aDay({ date: '2026-08-10', records }),
    aDay({ date: '2026-08-11', records }),
  ]

  it('cada registro cae en un solo tramo, y en el que empieza', () => {
    const viejo = windowRecords(days, primero.start, primero.end, { includeEarlier: true })
    const nuevo = windowRecords(days, segundo.start, segundo.end)
    expect(viejo.map((r) => r.id)).toEqual(['a', 'b'])
    expect(nuevo.map((r) => r.id)).toEqual(['c', 'd'])
  })

  it('encadenados no pierden ni repiten nada', () => {
    const todos = [
      ...windowRecords(days, segundo.start, segundo.end),
      ...windowRecords(days, primero.start, primero.end, { includeEarlier: true }),
    ].map((r) => r.id)
    expect([...todos].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('un sueño que cruza el corte se queda en el tramo donde empezó', () => {
    const noche = aSleep({ id: 'n', start: '2026-08-10 21:00', end: '2026-08-11 06:00' })
    const conSueno = [aDay({ date: '2026-08-10', records: [noche] }), aDay({ date: '2026-08-11', records: [noche] })]
    expect(windowRecords(conSueno, primero.start, primero.end).map((r) => r.id)).toEqual(['n'])
    // En el siguiente no se repite: ya se ha contado.
    expect(windowRecords(conSueno, segundo.start, segundo.end)).toEqual([])
  })
})

describe('timelineRows', () => {
  const dia = { start: '2026-08-07 00:00', end: '2026-08-08 00:00' }

  it('ordena por la hora que se enseña, no por la que tiene guardada', () => {
    // El sueño de anoche se enseña a las 07:00, que es cuando acabó y lo
    // único que cae dentro del día. Colocarlo por su inicio lo mandaba al
    // principio de la lista, delante de las 00:30.
    const noche = aSleep({ id: 'n', start: '2026-08-06 21:30', end: '2026-08-07 07:00' })
    const madrugada = aFeed({ id: 'm', start: '2026-08-07 00:30', end: '2026-08-07 00:50' })
    const manana = aFeed({ id: 'x', start: '2026-08-07 09:00', end: '2026-08-07 09:20' })

    const rows = timelineRows([noche, madrugada, manana], dia)
    expect(rows.map((r) => r.record.id)).toEqual(['m', 'n', 'x'])
    expect(rows.map((r) => r.when.time)).toEqual(['00:30', '07:00', '09:00'])
  })

  it('marca dónde cambia la fecha dentro del tramo, y solo ahí', () => {
    const tramo = { start: '2026-08-10 22:40', end: '2026-08-11 22:40' }
    const rows = timelineRows(
      [
        aFeed({ id: 'a', start: '2026-08-10 23:00', end: '2026-08-10 23:20' }),
        aFeed({ id: 'b', start: '2026-08-11 03:00', end: '2026-08-11 03:20' }),
        aFeed({ id: 'c', start: '2026-08-11 09:00', end: '2026-08-11 09:20' }),
      ],
      tramo
    )
    expect(rows.map((r) => r.dayBreak)).toEqual([null, '2026-08-11', null])
  })
})

describe('filterByType', () => {
  const toma = aFeed({ start: '2026-08-07 10:00' })
  const panal = aDiaper({ start: '2026-08-07 11:00' })
  const bano = aBath({ start: '2026-08-07 19:00' })
  const todos = [toma, panal, bano]

  it('sin ningún tipo elegido devuelve todo, que es lo normal', () => {
    expect(filterByType(todos, [])).toBe(todos)
  })

  it('deja solo los tipos elegidos, en su orden original', () => {
    expect(filterByType(todos, ['feed']).map((r) => r.id)).toEqual([toma.id])
    expect(filterByType(todos, ['bath', 'feed']).map((r) => r.id)).toEqual([toma.id, bano.id])
  })

  it('un tipo del que no hay nada deja el tramo vacío', () => {
    expect(filterByType(todos, ['sleep'])).toEqual([])
  })
})
