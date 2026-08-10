// Comprobación de que las pantallas se pintan y muestran lo que deben con
// datos reales. No sustituye a probarlas en el móvil, pero sí detecta que una
// vista deje de renderizar o pierda una cifra por el camino.

import render from 'preact-render-to-string'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, nowMadrid } from '../lib/dates'
import { lifeDayRange } from '../lib/lifeday'
import { cacheDay, clearDayCache } from '../store'
import { aDiaper, aFeed, aSleep, aDay } from '../test-fixtures'
import type { DayData } from '../types'
import { Dashboard } from './Dashboard'
import { SettingsView } from './Settings'
import { Timeline } from './Timeline'

const NOW = nowMadrid()
const TODAY = NOW.slice(0, 10)
const USER = { email: 'ana@example.com', name: 'Ana' }
const BIRTH = `${TODAY} 00:17`

function day(partial: Partial<DayData> = {}): DayData {
  const range = lifeDayRange(BIRTH, 1)
  return aDay({
    date: TODAY,
    serverNow: NOW,
    settings: { birth: BIRTH, goals: { pees: 6, poops: 3, milkMl: 400 } },
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
        milkMl: 310,
      },
    },
    ...partial,
  })
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
    expect(html).toContain('/ 6')
    expect(html).toContain('/ 3')
    expect(html).toContain('310')
    expect(html).toContain('/ 400')
    expect(html).toContain('goal-bar')
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
      day({ settings: { birth: BIRTH, goals: { pees: 0, poops: 0, milkMl: 0 } } })
    )
    expect(html).not.toContain('goal-bar')
    expect(html).toContain('310')
  })
})

describe('Dashboard · lo registrado', () => {
  it('resume la última toma con su desglose', () => {
    const ultima = aFeed({
      start: `${TODAY} 09:12`,
      end: `${TODAY} 09:41`,
      durationMin: 29,
      formulaMl: 35,
    })
    const html = renderDashboard(
      day({ records: [ultima], last: { feed: ultima, diaper: null, sleepEnd: null } })
    )
    expect(html).toContain('35 ml fórmula')
    expect(html).toContain('09:12')
  })

  it('un cronómetro olvidado no afirma que el bebé siga dormido', () => {
    // Sueño abierto desde ayer: es un olvido, no un bebé durmiendo 30 horas.
    const abierto = aSleep({ start: `${addDays(TODAY, -1)} 00:05`, kind: 'nocturno' })
    const html = renderDashboard(
      day({
        records: [abierto],
        openSleep: abierto,
        last: {
          feed: null,
          diaper: null,
          sleepEnd: aSleep({ start: `${TODAY} 01:00`, end: `${TODAY} 02:00`, durationMin: 60 }),
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
    const html = renderDashboard(day({ records: [] }))
    expect(html).toContain('Sin registros')
    expect(html).toContain('Sin sueños registrados')
  })
})

describe('Timeline', () => {
  it('pinta el rango horario, el desglose de la toma y el resumen del día', () => {
    const toma = aFeed({
      start: `${TODAY} 09:12`,
      end: `${TODAY} 09:41`,
      durationMin: 29,
      formulaMl: 35,
    })
    const panal = aDiaper({ start: `${TODAY} 14:08`, pee: true, poop: true })
    cacheDay(day({ records: [toma, panal] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('09:12–09:41')
    expect(html).toContain('Toma')
    expect(html).toContain('29 min · 35 ml fórmula')
    expect(html).toContain('💩💧')
    expect(html).toContain('Pañal · pis y caca')
  })

  it('muestra el estado vacío cuando no hay nada ese día', () => {
    cacheDay(day({ records: [] }))
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
