// Comprobación de que las pantallas se pintan y muestran lo que deben con
// datos reales. No sustituye a probarlas en el móvil, pero sí detecta que una
// vista deje de renderizar o pierda una cifra por el camino.

import render from 'preact-render-to-string'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, nowMadrid } from '../lib/dates'
import { lifeDayRange } from '../lib/lifeday'
import { cacheDay, clearDayCache } from '../store'
import { aDay, aDiaper, aFeed, aHistoryDay, aSleep, aWeight, someTotals } from '../test-fixtures'
import type { DayData } from '../types'
import { Dashboard } from './Dashboard'
import { BarList, WeightList } from './History'
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
    settings: { birth: BIRTH, birthWeightG: 3420 },
    lifeDay: {
      number: 3,
      start: range.start,
      end: range.end,
      records: partial.records ?? [],
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
  it('muestra el número de día y los contadores, sin objetivos', () => {
    const html = renderDashboard(day())
    expect(html).toContain('Día de vida 3')
    expect(html).toContain('>4<') // pises
    expect(html).toContain('>2<') // cacas
    expect(html).toContain('310')
    // Los objetivos se retiraron: nada de "4 / 6" ni barras de progreso.
    expect(html).not.toContain('goal-bar')
    expect(html).not.toContain('/ 6')
  })

  it('deja elegir entre día de vida y día natural', () => {
    const html = renderDashboard(day())
    expect(html).toContain('Día de vida')
    expect(html).toContain('Día natural')
  })

  it('junto a cada contador dice cuánto hace del último', () => {
    const pis = aDiaper({ start: `${TODAY} 11:00`, pee: true, poop: false })
    const caca = aDiaper({ start: `${TODAY} 02:00`, pee: false, poop: true })
    const toma = aFeed({ start: `${TODAY} 10:30`, end: `${TODAY} 10:50` })
    const html = renderDashboard(
      day({ records: [caca, toma, pis], last: { ...day().last, pee: pis, poop: caca, feed: toma } })
    )
    // Cada contador dice cuánto hace del último de su tipo.
    expect((html.match(/hace /g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('sin registros los contadores lo dicen sin dejar hueco en blanco', () => {
    const html = renderDashboard(day({ lifeDay: { ...day().lifeDay!, totals: someTotals() } }))
    expect(html).toContain('sin registros')
    expect(html).toContain('Sin tomas')
  })

  it('desglosa fórmula y extraída sin mezclarlas con los minutos de pecho', () => {
    const html = renderDashboard(day())
    expect(html).toContain('180 ml fórmula')
    expect(html).toContain('130 ml extraída')
    expect(html).toContain('25 min de pecho directo (no cuantificable)')
  })

  it('sin fecha de nacimiento invita a configurarla, sin dar error', () => {
    const html = renderDashboard(
      day({ settings: { birth: null, birthWeightG: 0 }, lifeDay: null })
    )
    expect(html).toContain('Añade la fecha y la hora de nacimiento')
    expect(html).not.toContain('banner-warn')
  })
})

describe('Dashboard · peso', () => {
  it('muestra la última pesada y su variación desde el nacimiento', () => {
    const peso = aWeight({ start: `${TODAY} 09:00`, grams: 3210 })
    const html = renderDashboard(
      day({ records: [peso], last: { ...day().last, weight: peso } })
    )
    expect(html).toContain('3,210 kg')
    expect(html).toContain('−210 g')
    expect(html).toContain('−6,1 %')
    expect(html).toContain('Al nacer 3,420 kg')
  })

  it('sin pesadas invita a añadir la primera', () => {
    const html = renderDashboard(day())
    expect(html).toContain('Todavía no hay ninguna pesada')
    expect(html).toContain('Añadir pesada')
  })

  it('sin peso al nacer no inventa una variación', () => {
    const peso = aWeight({ grams: 3210 })
    const html = renderDashboard(
      day({
        settings: { birth: BIRTH, birthWeightG: 0 },
        last: { ...day().last, weight: peso },
      })
    )
    expect(html).toContain('3,210 kg')
    expect(html).not.toContain('desde el nacimiento')
  })
})

describe('Dashboard · lo registrado', () => {
  it('la franja coloca cada registro en su carril y su hora', () => {
    const toma = aFeed({ start: `${TODAY} 06:17`, end: `${TODAY} 06:47`, formulaMl: 60 })
    const caca = aDiaper({ start: `${TODAY} 12:17`, pee: true, poop: true })
    const html = renderDashboard(day({ records: [toma, caca] }))
    expect(html).toContain('de un vistazo')
    // Cuatro carriles con marcas: sueño, tomas, pises y cacas.
    expect(html).toContain('strip-feed')
    expect(html).toContain('strip-pee')
    expect(html).toContain('strip-poop')
    // El pañal con las dos cosas aparece en los dos carriles.
    expect((html.match(/Cacas · 12:17/g) ?? []).length).toBe(1)
    expect((html.match(/Pises · 12:17/g) ?? []).length).toBe(1)
  })

  it('los contadores de pises y cacas abren su último registro', () => {
    const pis = aDiaper({ start: `${TODAY} 12:00`, pee: true, poop: false })
    const caca = aDiaper({ start: `${TODAY} 02:00`, pee: true, poop: true })
    const html = renderDashboard(
      day({ records: [caca, pis], last: { ...day().last, diaper: pis, pee: pis, poop: caca } })
    )
    // Sin repetir filas abajo: el contador es a la vez cifra, frescura y acceso.
    expect((html.match(/kpi-tile-link/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('Último pañal')
  })

  it('el estado del bebé es lo único que habla de ahora mismo', () => {
    const dormido = aSleep({ start: `${TODAY} 11:00` })
    const html = renderDashboard(day({ records: [dormido], openSleep: dormido }))
    expect(html).toContain('desde las 11:00')
    expect(html).toContain('Se ha despertado')
  })

  it('un cronómetro olvidado no afirma que el bebé siga dormido', () => {
    // Sueño abierto desde ayer: es un olvido, no un bebé durmiendo 30 horas.
    const abierto = aSleep({ start: `${addDays(TODAY, -1)} 00:05`, kind: 'nocturno' })
    const html = renderDashboard(
      day({
        records: [abierto],
        openSleep: abierto,
        last: {
          ...day().last,
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
  })

  it('sin registros no muestra huecos raros', () => {
    const html = renderDashboard(day({ records: [], lifeDay: { ...day().lifeDay!, totals: someTotals() } }))
    expect(html).toContain('sin registros')
    expect(html).toContain('sin sueños registrados todavía')
    expect(html).toContain('Sin registros en este periodo todavía')
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
    expect(html).toContain('09:12')
    expect(html).toContain('→ 09:41')
    expect(html).toContain('Toma')
    expect(html).toContain('29 min · 35 ml fórmula')
    expect(html).toContain('💩💧')
    expect(html).toContain('Pañal · pis y caca')
  })

  it('muestra el hueco entre tomas consecutivas', () => {
    const primera = aFeed({ start: `${TODAY} 06:00`, end: `${TODAY} 06:20` })
    const segunda = aFeed({ start: `${TODAY} 09:10`, end: `${TODAY} 09:30` })
    cacheDay(day({ records: [primera, segunda] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('3 h 10 min desde la anterior')
  })

  it('la primera toma del día toma su hueco de la última de anoche', () => {
    const anoche = aFeed({ start: `${addDays(TODAY, -1)} 23:30`, end: `${addDays(TODAY, -1)} 23:50` })
    const madrugada = aFeed({ start: `${TODAY} 02:45`, end: `${TODAY} 03:05` })
    cacheDay(day({ records: [madrugada], previousFeed: anoche }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('3 h 15 min desde la anterior')
  })

  it('el peso aparece en la cronología como un registro más', () => {
    cacheDay(day({ records: [aWeight({ start: `${TODAY} 10:00`, grams: 3210 })] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('Peso')
    expect(html).toContain('3,210 kg')
  })

  it('muestra el estado vacío cuando no hay nada en el tramo', () => {
    cacheDay(day({ records: [] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('No hay registros en este tramo')
  })

  it('cada tramo lleva su cabecera con el resumen, en singular cuando toca', () => {
    const toma = aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:20` })
    cacheDay(day({ records: [toma] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('Día de vida 1')
    expect(html).toContain('1 toma')
    expect(html).toContain('0 pañales')
  })

  it('ofrece encadenar tramos anteriores sin salir de la pantalla', () => {
    cacheDay(day({ records: [aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:20` })] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('Ver anteriores')
  })

  it('deja elegir el calendario y lo dice en la cabecera del tramo', () => {
    cacheDay(day({ records: [aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:20` })] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('Día natural')
    // En modo día de vida la cabecera muestra el tramo horario real.
    expect(html).toContain('00:17 → 00:17')
  })

  it('ancla en su hora de fin lo que viene del día anterior', () => {
    const noche = aSleep({
      start: `${addDays(TODAY, -1)} 21:30`,
      end: `${TODAY} 07:00`,
      durationMin: 570,
    })
    cacheDay(day({ records: [noche] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('07:00')
    expect(html).toContain('de antes')
  })
})

describe('Ajustes', () => {
  it('carga el nacimiento y el peso al nacer guardados', () => {
    cacheDay(day())
    const html = render(<SettingsView />)
    expect(html).toContain(`value="${TODAY}"`)
    expect(html).toContain('value="00:17"')
    expect(html).toContain('value="3420"')
    expect(html).toContain('3,420 kg')
    expect(html).toContain('día de vida')
  })
})

describe('Evolución', () => {
  const days = [
    aHistoryDay(6, { totals: someTotals({ pees: 3, poops: 1, milkMl: 210 }), weightG: 3300 }),
    aHistoryDay(5, { totals: someTotals({ pees: 6, poops: 3, milkMl: 380 }), weightG: 3250 }),
    aHistoryDay(4, { totals: someTotals({ pees: 4, poops: 2, milkMl: 300 }) }),
  ]

  it('dibuja una barra por día, proporcional al máximo', () => {
    const html = render(<BarList days={days} metric="pees" />)
    expect(html).toContain('Día 6')
    expect(html).toContain('Día 4')
    // 6 pises es el máximo del periodo: su barra ocupa el 100 %.
    expect(html).toContain('width:100%')
    expect(html).toContain('width:50%') // 3 de 6
  })

  it('marca el día en curso, que aún no está completo', () => {
    const html = render(<BarList days={days} metric="pees" />)
    expect(html).toContain('en curso')
    expect(html).toContain('hist-bar-current')
  })

  it('la leche se muestra con su unidad', () => {
    const html = render(<BarList days={days} metric="milk" />)
    expect(html).toContain('380 ml')
  })

  it('el peso se lista con su variación, sin barras engañosas', () => {
    const html = render(<WeightList days={days} />)
    expect(html).toContain('3,300 kg')
    expect(html).toContain('3,250 kg')
    expect(html).toContain('+50 g') // del día 5 al 6
    expect(html).toContain('sin pesada') // el día 4 no tuvo
    expect(html).not.toContain('hist-bar')
  })
})
