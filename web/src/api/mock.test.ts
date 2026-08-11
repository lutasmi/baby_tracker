// Recorrido completo contra la API simulada: registrar, corregir y ver cómo
// cambian los totales del día de vida.

import { beforeEach, describe, expect, it } from 'vitest'
import { addMinutes, nowMadrid } from '../lib/dates'
import type { FeedItem, FeedItemKind, RecordInput } from '../types'
import { createMockApi } from './mock'
import type { Api } from './types'

const TODAY = nowMadrid().slice(0, 10)

let api: Api

/** Una toma con los elementos que hayan pasado dentro. */
const feed = (id: string, items: FeedItem[]): RecordInput => ({ id, type: 'feed', items, notes: '' })

const tetada = (start: string, end: string, side: FeedItem['side'] = 'izquierdo'): FeedItem => ({
  id: `pecho-${start}`,
  kind: 'pecho',
  start,
  end,
  side,
  ml: 0,
})

const bibe = (
  start: string,
  ml: number,
  kind: FeedItemKind = 'formula',
  end: string | null = null
): FeedItem => ({ id: `bib-${start}-${kind}`, kind, start, end, side: null, ml })

const diaper = (id: string, start: string, pee: boolean, poop: boolean): RecordInput => ({
  id,
  type: 'diaper',
  start,
  pee,
  peeAmount: null,
  poop,
  poopAmount: null,
  consistency: null,
  notes: '',
})

const sleep = (id: string, start: string, end: string | null): RecordInput => ({
  id,
  type: 'sleep',
  start,
  end,
  durationMin: null,
  kind: 'siesta',
  notes: '',
})

beforeEach(async () => {
  api = createMockApi({ latencyMs: 0 })
  await api.updateSettings({ birth: `${TODAY} 00:01`, birthWeightG: 3420 })
})

describe('registro y totales del día de vida', () => {
  it('una toma de fórmula suma a la leche cuantificable', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals
    await api.createRecord(feed('t1', [bibe(`${TODAY} 10:13`, 63, 'formula', `${TODAY} 10:31`)]))

    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.formulaMl - antes.formulaMl).toBe(63)
    expect(t.milkMl - antes.milkMl).toBe(63)
    expect(t.feeds - antes.feeds).toBe(1)
  })

  it('una toma mixta reparte cada componente en su sitio', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals
    const guardada = await api.createRecord(
      feed('t2', [
        tetada(`${TODAY} 13:12`, `${TODAY} 13:29`),
        bibe(`${TODAY} 13:35`, 28, 'extraida'),
        bibe(`${TODAY} 13:43`, 37),
      ])
    )
    expect(guardada.type).toBe('feed')
    if (guardada.type !== 'feed') throw new Error('tipo inesperado')
    // El intervalo y los totales salen de los elementos, no llegan aparte.
    expect(guardada.start).toBe(`${TODAY} 13:12`)
    expect(guardada.durationMin).toBe(31)
    expect(guardada.breastMin).toBe(17)
    expect(guardada.items).toHaveLength(3)

    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.breastMin - antes.breastMin).toBe(17)
    expect(t.expressedMl - antes.expressedMl).toBe(28)
    expect(t.formulaMl - antes.formulaMl).toBe(37)
    // Los 17 minutos de pecho no se convierten en mililitros.
    expect(t.milkMl - antes.milkMl).toBe(65)
  })

  it('los pañales actualizan pises y cacas por separado', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals
    await api.createRecord(diaper('p1', `${TODAY} 09:00`, false, true))
    await api.createRecord(diaper('p2', `${TODAY} 11:00`, true, true))

    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.poops - antes.poops).toBe(2)
    expect(t.pees - antes.pees).toBe(1)
    expect(t.diapers - antes.diapers).toBe(2)
  })

  it('rechaza una toma sin elementos y un pañal vacío', async () => {
    await expect(api.createRecord(feed('t3', []))).rejects.toThrow(/al menos una tetada/)
    await expect(api.createRecord(diaper('p3', `${TODAY} 10:00`, false, false))).rejects.toThrow(
      /pis, caca/
    )
  })

  it('reintentar la misma petición no duplica ni altera los totales', async () => {
    const input = feed('t4', [bibe(`${TODAY} 10:13`, 63)])
    await api.createRecord(input)
    const primera = (await api.getDay(TODAY)).lifeDay!.totals
    await api.createRecord(input)
    expect((await api.getDay(TODAY)).lifeDay!.totals).toEqual(primera)
  })
})

describe('lo último de cada cosa', () => {
  it('la hidratación no reinicia el reloj de la última toma', async () => {
    // Después de las tomas que ya trae el simulador de serie.
    await api.createRecord(feed('t-real', [bibe(`${TODAY} 20:00`, 60)]))
    await api.createRecord(feed('t-consuelo', [tetada(`${TODAY} 21:00`, `${TODAY} 21:03`)]))
    const { last } = await api.getDay(TODAY)
    expect(last.feed?.id).toBe('t-real')
  })

  it('el pedete no reinicia el de la última caca, pero sí es un pañal', async () => {
    await api.createRecord(diaper('p-caca', `${TODAY} 19:00`, false, true))
    const pedete: RecordInput = {
      id: 'p-pedete',
      type: 'diaper',
      start: `${TODAY} 22:00`,
      pee: false,
      peeAmount: null,
      poop: true,
      poopAmount: null,
      consistency: 'pedete',
      notes: '',
    }
    await api.createRecord(pedete)

    const { last } = await api.getDay(TODAY)
    expect(last.poop?.id).toBe('p-caca')
    expect(last.diaper?.id).toBe('p-pedete')
  })
})

describe('sueño', () => {
  it('registra una siesta pasada con inicio y fin', async () => {
    const siesta = await api.createRecord(sleep('s1', `${TODAY} 11:37`, `${TODAY} 12:54`))
    if (siesta.type !== 'sleep') throw new Error('tipo inesperado')
    expect(siesta.durationMin).toBe(77)
  })

  it('un sueño olvidado se puede cerrar editándolo', async () => {
    const start = addMinutes(nowMadrid(), -120)
    await api.createRecord(sleep('s2', start, null))
    expect((await api.getDay(TODAY)).openSleep?.id).toBe('s2')

    const cerrado = await api.updateRecord(sleep('s2', start, addMinutes(start, 45)))
    if (cerrado.type !== 'sleep') throw new Error('tipo inesperado')
    expect(cerrado.durationMin).toBe(45)
    expect((await api.getDay(TODAY)).openSleep).toBeNull()
  })

  it('no permite dos sueños abiertos a la vez', async () => {
    await api.createRecord(sleep('s3', addMinutes(nowMadrid(), -30), null))
    await expect(api.createRecord(sleep('s4', nowMadrid(), null))).rejects.toThrow(/sueño en curso/)
  })
})

describe('edición y borrado', () => {
  it('editar una toma actualiza los totales', async () => {
    await api.createRecord(feed('t5', [bibe(`${TODAY} 10:00`, 60)]))
    const antes = (await api.getDay(TODAY)).lifeDay!.totals

    await api.updateRecord(feed('t5', [bibe(`${TODAY} 10:00`, 90)]))
    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.formulaMl - antes.formulaMl).toBe(30)
    expect(t.feeds).toBe(antes.feeds) // sigue siendo la misma toma
  })

  it('borrar un registro lo saca de los totales', async () => {
    await api.createRecord(diaper('p4', `${TODAY} 09:00`, true, false))
    const conPanal = (await api.getDay(TODAY)).lifeDay!.totals
    await api.deleteRecord('diaper', 'p4')
    const sinPanal = (await api.getDay(TODAY)).lifeDay!.totals
    expect(conPanal.pees - sinPanal.pees).toBe(1)
  })
})

describe('evolución', () => {
  it('devuelve las pesadas con su hora para la gráfica', async () => {
    const { weights } = await api.getHistory(7)
    expect(weights.length).toBeGreaterThan(0)
    expect(weights[0]).toMatchObject({ type: 'weight' })
    expect(weights[0].start).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('agrupa los totales por día de vida', async () => {
    await api.createRecord(diaper('h1', `${TODAY} 09:00`, true, true))
    await api.createRecord(feed('h2', [bibe(`${TODAY} 10:00`, 90)]))

    const { birth, days } = await api.getHistory(7)
    expect(birth).toBe(`${TODAY} 00:01`)
    expect(days[0].number).toBe(1)
    expect(days[0].totals.poops).toBeGreaterThanOrEqual(1)
    expect(days[0].totals.milkMl).toBeGreaterThanOrEqual(90)
  })

  it('sin fecha de nacimiento devuelve una evolución vacía', async () => {
    await api.updateSettings({ birth: null, birthWeightG: 0 })
    const { birth, days } = await api.getHistory(7)
    expect(birth).toBeNull()
    expect(days).toEqual([])
  })
})
