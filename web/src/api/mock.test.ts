// Recorrido completo contra la API simulada: registrar, corregir y ver cómo
// cambian los totales del día de vida. Reproduce los casos de uso reales que
// motivaron esta versión.

import { beforeEach, describe, expect, it } from 'vitest'
import { addMinutes, nowMadrid } from '../lib/dates'
import { buildInput, type FormState } from '../lib/eventform'
import { emptyComponents } from '../lib/feed'
import type { EventInput, FeedComponents } from '../types'
import { createMockApi } from './mock'
import type { Api } from './types'

const TODAY = nowMadrid().slice(0, 10)

let api: Api

/** Construye la toma tal y como la enviaría el formulario. */
function feedInput(id: string, start: string, end: string, c: Partial<FeedComponents>): EventInput {
  const components = { ...emptyComponents(), ...c }
  const state = {
    subtype: '',
    start,
    end,
    sleepOpen: false,
    components,
    active: (['breast', 'expressed', 'formula'] as const).filter((k) =>
      k === 'breast' ? components.breastMin > 0 : true
    ),
    durationMin: 0,
    consistency: '',
    notes: '',
  } as unknown as FormState
  return buildInput(id, 'feed', state)
}

beforeEach(async () => {
  api = createMockApi({ latencyMs: 0 })
  await api.updateSettings({
    birth: `${TODAY} 00:01`,
    goals: { pees: 6, poops: 3, milkMl: 400 },
  })
})

describe('registro y totales del día de vida', () => {
  it('una toma de fórmula suma a la leche cuantificable', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals

    await api.createEvent(
      feedInput('t1', `${TODAY} 10:13`, `${TODAY} 10:31`, { formulaMl: 63 })
    )

    const despues = (await api.getDay(TODAY)).lifeDay!.totals
    expect(despues.formulaMl - antes.formulaMl).toBe(63)
    expect(despues.milkMl - antes.milkMl).toBe(63)
    expect(despues.feeds - antes.feeds).toBe(1)
  })

  it('una toma mixta reparte cada componente en su sitio', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals

    const guardada = await api.createEvent(
      feedInput('t2', `${TODAY} 13:12`, `${TODAY} 13:43`, {
        breastMin: 17,
        expressedMl: 28,
        formulaMl: 37,
      })
    )
    expect(guardada.subtype).toBe('mixta')
    expect(guardada.durationMin).toBe(31)
    expect(guardada.quantityMl).toBe(65)

    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.breastMin - antes.breastMin).toBe(17)
    expect(t.expressedMl - antes.expressedMl).toBe(28)
    expect(t.formulaMl - antes.formulaMl).toBe(37)
    // Los 17 minutos de pecho no se convierten en mililitros.
    expect(t.milkMl - antes.milkMl).toBe(65)
  })

  it('los pañales actualizan pises y cacas por separado', async () => {
    const antes = (await api.getDay(TODAY)).lifeDay!.totals
    const base = {
      type: 'diaper' as const,
      end: null,
      durationMin: null,
      quantityMl: null,
      components: null,
      notes: '',
    }
    await api.createEvent({ ...base, id: 'p1', subtype: 'caca', start: `${TODAY} 09:00`, detail: 'pastosa' })
    await api.createEvent({ ...base, id: 'p2', subtype: 'ambos', start: `${TODAY} 11:00`, detail: null })

    const t = (await api.getDay(TODAY)).lifeDay!.totals
    expect(t.poops - antes.poops).toBe(2)
    expect(t.pees - antes.pees).toBe(1)
    expect(t.diapers - antes.diapers).toBe(2)
  })

  it('rechaza una toma sin componentes', async () => {
    await expect(
      api.createEvent(feedInput('t3', `${TODAY} 10:00`, `${TODAY} 10:10`, {}))
    ).rejects.toThrow(/al menos un componente/)
  })

  it('reintentar la misma petición no duplica ni altera los totales', async () => {
    const input = feedInput('t4', `${TODAY} 10:13`, `${TODAY} 10:31`, { formulaMl: 63 })
    await api.createEvent(input)
    const primera = (await api.getDay(TODAY)).lifeDay!.totals
    await api.createEvent(input)
    expect((await api.getDay(TODAY)).lifeDay!.totals).toEqual(primera)
  })
})

describe('sueño', () => {
  it('registra una siesta pasada con inicio y fin', async () => {
    const siesta = await api.createEvent({
      id: 's1',
      type: 'sleep',
      subtype: 'siesta',
      start: `${TODAY} 11:37`,
      end: `${TODAY} 12:54`,
      durationMin: null,
      quantityMl: null,
      detail: null,
      components: null,
      notes: '',
    })
    expect(siesta.durationMin).toBe(77)
  })

  it('un sueño olvidado se puede cerrar editándolo', async () => {
    const abierto = await api.createEvent({
      id: 's2',
      type: 'sleep',
      subtype: 'nocturno',
      start: addMinutes(nowMadrid(), -120),
      end: null,
      durationMin: null,
      quantityMl: null,
      detail: null,
      components: null,
      notes: '',
    })
    expect((await api.getDay(TODAY)).activeSleep?.id).toBe('s2')

    const cerrado = await api.updateEvent({
      id: abierto.id,
      type: 'sleep',
      subtype: 'nocturno',
      start: abierto.start,
      end: addMinutes(abierto.start, 45),
      durationMin: null,
      quantityMl: null,
      detail: null,
      components: null,
      notes: '',
    })
    expect(cerrado.durationMin).toBe(45)
    expect((await api.getDay(TODAY)).activeSleep).toBeNull()
  })

  it('no permite dos sueños abiertos a la vez', async () => {
    const open = {
      type: 'sleep' as const,
      subtype: 'siesta',
      end: null,
      durationMin: null,
      quantityMl: null,
      detail: null,
      components: null,
      notes: '',
    }
    await api.createEvent({ ...open, id: 's3', start: addMinutes(nowMadrid(), -30) })
    await expect(
      api.createEvent({ ...open, id: 's4', start: nowMadrid() })
    ).rejects.toThrow(/sueño en curso/)
  })
})

describe('compatibilidad', () => {
  it('los registros de la v1 siguen contando en los totales', async () => {
    // La semilla incluye un biberón con el formato antiguo (90 ml de materna).
    const { lifeDay, events } = await api.getDay(TODAY)
    const antiguo = events.find((e) => e.id === 'seed-biberon-v1')
    expect(antiguo).toBeDefined()
    expect(antiguo!.components).toBeNull()
    expect(lifeDay!.totals.expressedMl).toBeGreaterThanOrEqual(90)
  })

  it('editar un registro de la v1 lo migra sin perder la cantidad', async () => {
    const { events } = await api.getDay(TODAY)
    const antiguo = events.find((e) => e.id === 'seed-biberon-v1')!
    const migrado = await api.updateEvent(
      feedInput(antiguo.id, antiguo.start, antiguo.start, { expressedMl: 90 })
    )
    expect(migrado.components).toMatchObject({ expressedMl: 90 })
    expect(migrado.quantityMl).toBe(90)
  })
})
