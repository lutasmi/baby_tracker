import { describe, expect, it } from 'vitest'
import { aBath, aDay, aDiaper, aFeed, aSleep } from '../test-fixtures'
import { filterByType, windowRecords } from './timeline'

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
