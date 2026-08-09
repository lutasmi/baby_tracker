// Comprobación de que las pantallas se pintan y muestran lo que deben con
// datos reales. No sustituye a probarlas en el móvil, pero sí detecta que una
// vista deje de renderizar o pierda una cifra por el camino.

import render from 'preact-render-to-string'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, nowMadrid } from '../lib/dates'
import { emptyComponents } from '../lib/feed'
import { lifeDayRange } from '../lib/lifeday'
import { cacheDay, clearDayCache } from '../store'
import type { BabyEvent, DayData, FeedComponents } from '../types'
import { Dashboard } from './Dashboard'
import { SettingsView } from './Settings'
import { Timeline } from './Timeline'

const NOW = nowMadrid()
const TODAY = NOW.slice(0, 10)
const USER = { email: 'ana@example.com', name: 'Ana' }

function ev(partial: Partial<BabyEvent>): BabyEvent {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'diaper',
    subtype: 'pipi',
    start: `${TODAY} 08:00`,
    end: null,
    durationMin: null,
    quantityMl: null,
    detail: null,
    components: null,
    notes: '',
    createdBy: 'ana@example.com',
    createdAt: `${TODAY} 08:00`,
    updatedBy: null,
    updatedAt: null,
    ...partial,
  }
}

function feed(start: string, end: string, c: Partial<FeedComponents>): BabyEvent {
  const components = { ...emptyComponents(), ...c }
  return ev({
    type: 'feed',
    subtype: 'biberon',
    start,
    end,
    durationMin: 29,
    components,
    quantityMl: components.expressedMl + components.formulaMl || null,
  })
}

function day(partial: Partial<DayData> = {}): DayData {
  const birth = `${TODAY} 00:17`
  const range = lifeDayRange(birth, 1)
  return {
    date: TODAY,
    events: [],
    activeSleep: null,
    last: { feed: null, diaper: null, sleepEnd: null },
    users: { 'ana@example.com': 'Ana' },
    serverNow: NOW,
    settings: { birth, goals: { pees: 6, poops: 3, milkMl: 400 } },
    lifeDay: {
      number: 3,
      start: range.start,
      end: range.end,
      totals: {
        pees: 4,
        poops: 2,
        diapers: 5,
        feeds: 6,
        breastMin: 25,
        expressedMl: 130,
        formulaMl: 180,
        mixtaMl: 0,
        milkMl: 310,
      },
    },
    ...partial,
  }
}

function renderDashboard(d: DayData): string {
  cacheDay(d)
  return render(<Dashboard user={USER} onLogout={() => {}} />)
}

beforeEach(() => clearDayCache())

describe('Dashboard · día de vida', () => {
  it('muestra el número de día y el progreso frente a los objetivos', () => {
    const html = renderDashboard(day())
    expect(html).toContain('Día de vida')
    expect(html).toContain('>3<')
    expect(html).toContain('4')
    expect(html).toContain('/ 6')
    expect(html).toContain('/ 3')
    expect(html).toContain('310')
    expect(html).toContain('/ 400')
  })

  it('desglosa fórmula y extraída sin mezclarlas con los minutos de pecho', () => {
    const html = renderDashboard(day())
    expect(html).toContain('180 ml fórmula')
    expect(html).toContain('130 ml extraída')
    expect(html).toContain('25 min de pecho directo (no cuantificable)')
  })

  it('sin fecha de nacimiento invita a configurarla, sin dar error', () => {
    const html = renderDashboard(
      day({ settings: { birth: null, goals: { pees: 0, poops: 0, milkMl: 0 } }, lifeDay: null })
    )
    expect(html).toContain('Añade la fecha y la hora de nacimiento')
    expect(html).not.toContain('banner-warn')
  })

  it('sin objetivos muestra las cifras y oculta las barras de progreso', () => {
    const html = renderDashboard(
      day({ settings: { birth: `${TODAY} 00:17`, goals: { pees: 0, poops: 0, milkMl: 0 } } })
    )
    expect(html).not.toContain('goal-bar')
    expect(html).toContain('310')
  })
})

describe('Dashboard · lo registrado', () => {
  it('resume la última toma con su desglose', () => {
    const ultima = feed(`${TODAY} 09:12`, `${TODAY} 09:41`, { formulaMl: 35 })
    const html = renderDashboard(day({ events: [ultima], last: { feed: ultima, diaper: null, sleepEnd: null } }))
    expect(html).toContain('35 ml fórmula')
    expect(html).toContain('09:12')
  })

  it('un cronómetro olvidado no afirma que el bebé siga dormido', () => {
    // Sueño abierto desde ayer: es un olvido, no un bebé durmiendo 30 horas.
    const abierto = ev({
      type: 'sleep',
      subtype: 'nocturno',
      start: `${addDays(TODAY, -1)} 00:05`,
    })
    const html = renderDashboard(
      day({
        events: [abierto],
        activeSleep: abierto,
        last: {
          feed: null,
          diaper: null,
          sleepEnd: ev({ type: 'sleep', start: `${TODAY} 01:00`, end: `${TODAY} 02:00` }),
        },
      })
    )
    expect(html).toContain('Despierto')
    expect(html).toContain('🌙 Se ha dormido')
    expect(html).not.toContain('Se ha despertado')
    // Se ofrece corregirlo, sin tono de error…
    expect(html).toContain('sueño abierto desde las 00:05')
    expect(html).toContain('banner-note')
    expect(html).not.toContain('banner-warn')
    // …y no infla las horas dormidas de hoy.
    expect(html).toContain('>0 min<')
  })

  it('sin registros no muestra huecos raros', () => {
    const html = renderDashboard(day({ events: [] }))
    expect(html).toContain('Sin registros')
    expect(html).toContain('Sin sueños registrados')
  })
})

describe('Timeline', () => {
  it('pinta el rango horario, el desglose de la toma y el resumen del día', () => {
    const toma = feed(`${TODAY} 09:12`, `${TODAY} 09:41`, { formulaMl: 35 })
    const panal = ev({ subtype: 'ambos', start: `${TODAY} 14:08` })
    cacheDay(day({ events: [toma, panal] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('09:12–09:41')
    expect(html).toContain('Toma')
    expect(html).toContain('29 min · 35 ml fórmula')
    expect(html).toContain('💩💧')
    expect(html).toContain('Pañal · Pipí y caca')
  })

  it('muestra el estado vacío cuando no hay nada ese día', () => {
    cacheDay(day({ events: [] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('No hay registros este día')
  })
})

describe('Ajustes', () => {
  it('carga el nacimiento y los objetivos guardados', () => {
    cacheDay(day())
    const html = render(<SettingsView />)
    expect(html).toContain(`value="${TODAY}"`)
    expect(html).toContain('value="00:17"')
    expect(html).toContain('value="6"')
    expect(html).toContain('value="400"')
    expect(html).toContain('día de vida')
  })

  it('deja claro que los objetivos los ponen los padres', () => {
    cacheDay(day())
    const html = render(<SettingsView />)
    expect(html).toContain('La aplicación no propone ninguno')
    expect(html).toContain('El pecho directo no cuenta aquí')
  })
})
