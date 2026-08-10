// Recorrido completo contra la API simulada: registrar, corregir y ver cómo
// cambian los totales del día de vida.

import { beforeEach, describe, expect, it } from 'vitest'
import { addMinutes, nowMadrid } from '../lib/dates'
import type { RecordInput } from '../types'
import { createMockApi } from './mock'
import type { Api } from './types'

const TODAY = nowMadrid().slice(0, 10)

let api: Api

const feed = (id: string, start: string, end: string, p: Partial<RecordInput> = {}): RecordInput =>
  ({
    id,
    type: 'feed',
    start,
    end,
    durationMin: null,
    breastMin: 0,
    breastSide: null,
    expressedMl: 0,
    formulaMl: 0,
    notes: '',
    ...p,
  }) as RecordInput

const diaper = (id: string, start: string, pee: boolean, poop: boolean): RecordInput => ({
  id,
  type: 'diaper',
  start,
  pee,
  poop,
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
    await api.createRecord(feed('t1', `${TODAY} 10:13`, `${TODAY} 10:31`, { formulaMl: 63 }))

    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.formulaMl - antes.formulaMl).toBe(63)
    expect(t.milkMl - antes.milkMl).toBe(63)
    expect(t.feeds - antes.feeds).toBe(1)
  })

  it('una toma mixta reparte cada componente en su sitio', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals
    const guardada = await api.createRecord(
      feed('t2', `${TODAY} 13:12`, `${TODAY} 13:43`, {
        breastMin: 17,
        expressedMl: 28,
        formulaMl: 37,
      })
    )
    expect(guardada.type).toBe('feed')
    if (guardada.type !== 'feed') throw new Error('tipo inesperado')
    expect(guardada.durationMin).toBe(31)
    expect(guardada.breastMin).toBe(17)

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

  it('rechaza una toma sin componentes y un pañal vacío', async () => {
    await expect(api.createRecord(feed('t3', `${TODAY} 10:00`, `${TODAY} 10:10`))).rejects.toThrow(
      /al menos un componente/
    )
    await expect(api.createRecord(diaper('p3', `${TODAY} 10:00`, false, false))).rejects.toThrow(
      /pis, caca/
    )
  })

  it('reintentar la misma petición no duplica ni altera los totales', async () => {
    const input = feed('t4', `${TODAY} 10:13`, `${TODAY} 10:31`, { formulaMl: 63 })
    await api.createRecord(input)
    const primera = (await api.getDay(TODAY)).lifeDay!.totals
    await api.createRecord(input)
    expect((await api.getDay(TODAY)).lifeDay!.totals).toEqual(primera)
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
    await api.createRecord(feed('t5', `${TODAY} 10:00`, `${TODAY} 10:20`, { formulaMl: 60 }))
    const antes = (await api.getDay(TODAY)).lifeDay!.totals

    await api.updateRecord(feed('t5', `${TODAY} 10:00`, `${TODAY} 10:20`, { formulaMl: 90 }))
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
    await api.createRecord(feed('h2', `${TODAY} 10:00`, `${TODAY} 10:20`, { formulaMl: 90 }))

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
