// Comprobación de que las pantallas se pintan y muestran lo que deben con
// datos reales. No sustituye a probarlas en el móvil, pero sí detecta que una
// vista deje de renderizar o pierda una cifra por el camino.

import render from 'preact-render-to-string'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, nowMadrid } from '../lib/dates'
import { lifeDayRange, lifeDayTotals } from '../lib/lifeday'
import { cacheDay, clearDayCache } from '../store'
import { aDay, aDiaper, aFeed, aHistoryDay, aSleep, aWeight, someTotals } from '../test-fixtures'
import type { DayData } from '../types'
import { WeightChart } from '../components/WeightChart'
import { Dashboard } from './Dashboard'
import { BarList, HistoryView, WeightList } from './History'
import { EditRecord, NewRecord } from './RecordForm'
import { SettingsView } from './Settings'
import { Timeline } from './Timeline'

// Las pantallas leen el reloj real. La fecha se toma de verdad —para que la
// navegación por días siga siendo la de hoy— pero la hora se fija: si no, una
// prueba pasa a las 10:00 y falla a las 23:00, que es peor que no tenerla.
const TODAY = nowMadrid().slice(0, 10)
const NOW = `${TODAY} 12:00`
const USER = { email: 'ana@example.com', name: 'Ana' }

// Nacimiento a medianoche de hace dos días: así el día de vida 3 coincide
// exactamente con el día natural de hoy y las pruebas valen a cualquier hora,
// en los dos calendarios.
const LIFE_DAY = 3
const BIRTH = `${addDays(TODAY, -(LIFE_DAY - 1))} 00:00`

/**
 * Un día con sus registros. Los totales se calculan de ellos, no se declaran:
 * una fixture que dijera "4 pises" sin cuatro pañales sería mentira, y la
 * pantalla dejaría de estar probada de verdad.
 */
function day(partial: Partial<DayData> = {}): DayData {
  const range = lifeDayRange(BIRTH, LIFE_DAY)
  const records = partial.records ?? []
  return aDay({
    date: TODAY,
    serverNow: NOW,
    settings: { birth: BIRTH, birthWeightG: 3420 },
    lifeDay: {
      number: LIFE_DAY,
      start: range.start,
      end: range.end,
      records,
      totals: lifeDayTotals(records, range.start, range.end),
    },
    ...partial,
  })
}

/** Un día de vida con cuatro pises, dos cacas y 310 ml de leche. */
function diaCompleto(): DayData {
  return day({
    records: [
      aFeed({ start: `${TODAY} 08:00`, end: `${TODAY} 08:20`, formulaMl: 180 }),
      aFeed({ start: `${TODAY} 12:00`, end: `${TODAY} 12:20`, expressedMl: 130 }),
      aFeed({ start: `${TODAY} 16:00`, end: `${TODAY} 16:25`, breastMin: 25, breastSide: 'ambos' }),
      aDiaper({ start: `${TODAY} 07:00`, pee: true, poop: true }),
      aDiaper({ start: `${TODAY} 10:00`, pee: true, poop: false }),
      aDiaper({ start: `${TODAY} 13:00`, pee: true, poop: true }),
      aDiaper({ start: `${TODAY} 18:00`, pee: true, poop: false }),
    ],
  })
}

/** El número que muestra un contador de la pantalla de inicio. */
function kpi(html: string, label: string): string {
  const match = html.match(new RegExp(`${label}</div><div class="kpi-value">([^<]*)</div>`))
  if (!match) throw new Error(`No se encontró el contador "${label}"`)
  return match[1]
}

/** El "hace cuánto" de un contador, o '' si no lo muestra. */
function kpiNote(html: string, label: string): string {
  const match = html.match(
    new RegExp(`${label}</div><div class="kpi-value">[^<]*</div><div class="kpi-fresh">([^<]*)</div>`)
  )
  return match ? match[1] : ''
}

function renderDashboard(d: DayData): string {
  cacheDay(d)
  return render(<Dashboard user={USER} onLogout={() => {}} />)
}

beforeEach(() => {
  clearDayCache()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
})

afterEach(() => vi.useRealTimers())

describe('Dashboard · día de vida', () => {
  it('muestra el número de día y los contadores, sin objetivos', () => {
    const html = renderDashboard(diaCompleto())
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
    const html = renderDashboard(day())
    expect(html).toContain('sin registros')
    expect(html).toContain('Sin pañales')
  })

  it('desglosa fórmula y extraída sin mezclarlas con los minutos de pecho', () => {
    const html = renderDashboard(diaCompleto())
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
    // El contexto va en una sola línea pequeña, sin ocupar media tarjeta.
    expect(html).toContain('al nacer 3,420 kg')
    // Y la franja avisa de que la pesada no se dibuja ahí.
    expect(html).toContain('se ven en la cronología')
  })

  it('sin pesadas lo dice, y pesar está en los accesos rápidos', () => {
    const html = renderDashboard(day())
    expect(html).toContain('Todavía no hay ninguna pesada')
    expect(html).toContain('action-weight')
  })

  it('la pesada lleva su fecha, no la del tramo que se esté mirando', () => {
    const ayer = aWeight({ start: `${addDays(TODAY, -1)} 09:00`, grams: 3300 })
    const html = renderDashboard(day({ last: { ...day().last, weight: ayer } }))
    expect(html).toContain('3,300 kg')
    expect(html).toContain('Ayer · 09:00')
  })

  it('marca en verde por encima del peso al nacer y en rojo por debajo', () => {
    const bajo = aWeight({ grams: 3210 })
    expect(renderDashboard(day({ last: { ...day().last, weight: bajo } }))).toContain(
      'weight-pill below'
    )
    clearDayCache()
    const alto = aWeight({ grams: 3500 })
    expect(renderDashboard(day({ last: { ...day().last, weight: alto } }))).toContain(
      'weight-pill above'
    )
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
    expect(html).not.toContain('weight-pill')
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
    // Y ninguno para baños y pesadas: su fila salía vacía casi siempre.
    expect(html).not.toContain('title="Otros"')
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

  it('un sueño abierto reciente se cierra de un toque, sin cuadro permanente', () => {
    const dormido = aSleep({ start: `${TODAY} 11:00` })
    const html = renderDashboard(day({ records: [dormido], openSleep: dormido }))
    expect(html).toContain('Durmiendo')
    expect(html).toContain('desde las 11:00')
    expect(html).toContain('Despertó')
  })

  it('sin sueño abierto no hay barra que ocupe sitio', () => {
    const html = renderDashboard(day())
    expect(html).not.toContain('open-sleep')
    expect(html).not.toContain('Despertó')
  })

  it('un cronómetro olvidado no se cierra de un toque: lleva a corregirlo', () => {
    // Cerrarlo con la hora de ahora guardaría un sueño de treinta horas.
    const abierto = aSleep({ start: `${addDays(TODAY, -1)} 00:05`, kind: 'nocturno' })
    const html = renderDashboard(day({ records: [abierto], openSleep: abierto }))
    expect(html).toContain('Sueño sin cerrar')
    expect(html).toContain('Corregir')
    expect(html).not.toContain('Despertó')
    // Sin tono de error: es un olvido, no un fallo.
    expect(html).not.toContain('banner-warn')
  })

  it('sin registros no muestra huecos raros', () => {
    const html = renderDashboard(day({ records: [] }))
    expect(html).toContain('sin registros')
    expect(html).toContain('Sin sueños registrados todavía')
    expect(html).toContain('Sin registros en este periodo todavía')
  })

  it('el pie de la franja dice desde cuándo está despierto', () => {
    const siesta = aSleep({
      start: `${TODAY} 10:00`,
      end: `${TODAY} 11:00`,
      durationMin: 60,
    })
    const html = renderDashboard(
      day({ records: [siesta], last: { ...day().last, sleepEnd: siesta } })
    )
    expect(html).toContain('Despierto desde las 11:00')
  })

  it('un solo acceso a la evolución, no dos', () => {
    const html = renderDashboard(day())
    expect((html.match(/Evoluci/g) ?? []).length).toBe(1)
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
    expect(html).toContain('Día de vida 3')
    expect(html).toContain('1 toma')
    expect(html).toContain('0 pañales')
  })

  it('deja filtrar por tipo de registro, y volver a verlo todo', () => {
    cacheDay(
      day({
        records: [
          aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:20`, formulaMl: 60 }),
          aDiaper({ start: `${TODAY} 11:00`, pee: true, poop: false }),
        ],
      })
    )
    const html = render(<Timeline date={TODAY} />)
    for (const label of ['🍼 Tomas', '💩 Pañales', '😴 Sueño', '🛁 Baños', '⚖️ Peso']) {
      expect(html).toContain(label)
    }
    // Sin filtro puesto se ve todo, que es lo habitual.
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('Ver todo')
  })

  it('ofrece encadenar tramos anteriores, con la flecha hacia donde aparecen', () => {
    cacheDay(day({ records: [aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:20` })] }))
    const html = render(<Timeline date={TODAY} />)
    // Los anteriores se añaden debajo: la flecha apunta abajo.
    expect(html).toContain('↓ Ver anteriores')
    // Y estando en el tramo en curso no hay nada más reciente que ver.
    expect(html).not.toContain('Ver posteriores')
  })

  it('en un tramo pasado deja volver hacia el presente', () => {
    const AYER = addDays(TODAY, -1)
    cacheDay(day({ date: AYER, records: [aFeed({ start: `${AYER} 10:00`, end: `${AYER} 10:20` })] }))
    const html = render(<Timeline date={AYER} />)
    expect(html).toContain('↑ Ver posteriores')
    expect(html).toContain('↓ Ver anteriores')
  })

  it('el primer día de vida no ofrece seguir hacia atrás', () => {
    const nacimiento = `${TODAY} 00:00`
    cacheDay(day({ settings: { birth: nacimiento, birthWeightG: 3420 }, records: [] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('Día de vida 1')
    expect(html).not.toContain('Ver anteriores')
  })

  it('deja elegir el calendario y lo dice en la cabecera del tramo', () => {
    cacheDay(day({ records: [aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:20` })] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('Día natural')
    // En modo día de vida la cabecera muestra el tramo con sus dos fechas.
    expect(html).toMatch(/\d{1,2} \w{3} \d{2}:\d{2} → \d{1,2} \w{3} \d{2}:\d{2}/)
  })

  it('un día de vida a caballo de dos fechas no llama "de antes" a la madrugada', () => {
    // El fallo que hacía ilegible la cronología: el tramo empieza a las 22:40
    // de un día y todo lo de la mañana siguiente salía marcado como pasado.
    const nacimiento = `${addDays(TODAY, -2)} 22:40`
    const anoche = aFeed({ start: `${addDays(TODAY, -1)} 23:00`, end: `${addDays(TODAY, -1)} 23:20` })
    const madrugada = aFeed({ start: `${TODAY} 03:30`, end: `${TODAY} 03:50` })
    cacheDay(
      day({
        settings: { birth: nacimiento, birthWeightG: 3420 },
        records: [anoche, madrugada],
      })
    )
    cacheDay(
      day({ date: addDays(TODAY, -1), settings: { birth: nacimiento, birthWeightG: 3420 }, records: [anoche, madrugada] })
    )
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('03:30')
    expect(html).not.toContain('de antes')
    // Y se ve dónde cambia la fecha dentro del tramo.
    expect(html).toContain('tl-daybreak')
  })

  it('un tramo que cruza la medianoche se lee entero y en orden', () => {
    // El caso real: día de vida que empieza a las 22:40 y llega hasta la noche
    // siguiente. Antes, todo lo de después de medianoche salía como "de antes"
    // y el resumen de la cabecera solo contaba la primera fecha.
    const AYER = addDays(TODAY, -1)
    const nacimiento = `${addDays(TODAY, -2)} 22:40`
    const records = [
      aSleep({ start: `${AYER} 21:00`, end: `${AYER} 23:10`, kind: 'nocturno' }),
      aFeed({ start: `${AYER} 23:20`, end: `${AYER} 23:40`, formulaMl: 60 }),
      aFeed({ start: `${TODAY} 02:20`, end: `${TODAY} 02:45`, formulaMl: 60 }),
      aDiaper({ start: `${TODAY} 03:00`, pee: true, poop: true }),
      aFeed({ start: `${TODAY} 06:00`, end: `${TODAY} 06:20`, formulaMl: 60 }),
    ]
    const settings = { birth: nacimiento, birthWeightG: 3420 }
    cacheDay(day({ settings, records }))
    cacheDay(day({ date: AYER, settings, records }))

    const html = render(<Timeline date={TODAY} />)

    // Las tres tomas del tramo y el pañal, ninguno marcado como pasado.
    for (const hora of ['23:20', '02:20', '03:00', '06:00']) expect(html).toContain(hora)
    // "De antes" solo lo lleva el sueño que empezó antes de que abriera el
    // tramo, anclado en su hora de fin, que es lo que cae dentro.
    expect((html.match(/de antes/g) ?? []).length).toBe(1)
    expect(html).toContain('<span class="tl-time">23:10</span><span class="tl-note">de antes</span>')
    // De lo más reciente a lo más antiguo: la madrugada antes que anoche.
    expect(html.indexOf('06:00')).toBeLessThan(html.indexOf('02:20'))
    expect(html.indexOf('02:20')).toBeLessThan(html.indexOf('23:20'))
    // Con la fecha marcada donde cambia.
    expect(html).toContain('tl-daybreak')
    // El resumen cuenta las dos fechas: tres tomas, un pañal, 180 ml.
    expect(html).toContain('3 tomas')
    expect(html).toContain('1 pañal')
    expect(html).toContain('180 ml')
    // Y el sueño que venía de antes del tramo suma solo lo que cae dentro.
    expect(html).toContain('30 min dormido')
    // Los huecos entre tomas cruzan la medianoche sin perderse.
    expect(html).toContain('3 h desde la anterior')
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
    expect(html).toContain(`value="${BIRTH.slice(0, 10)}"`)
    expect(html).toContain('value="00:00"')
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

  it('lista las pesadas con lo que cambian y su porcentaje', () => {
    const pesadas = [
      aWeight({ start: '2026-08-06 10:00', grams: 3250 }),
      aWeight({ start: '2026-08-07 10:00', grams: 3300 }),
    ]
    const html = render(<WeightList weights={pesadas} birthWeightG={3420} />)
    expect(html).toContain('3,300 kg')
    expect(html).toContain('3,250 kg')
    expect(html).toContain('+50 g') // respecto a la pesada anterior
    expect(html).toContain('−3,5 %') // respecto al nacimiento
  })

  it('sin pesadas no dibuja una lista vacía', () => {
    expect(render(<WeightList weights={[]} birthWeightG={3420} />)).toContain('Todavía no hay pesadas')
  })
})

describe('Gráfica de peso', () => {
  const pesadas = [
    aWeight({ id: 'p1', start: '2026-08-06 10:00', grams: 3200 }),
    aWeight({ id: 'p2', start: '2026-08-09 10:00', grams: 3500 }),
  ]

  it('pinta la línea en dos colores, según esté por debajo o por encima', () => {
    const html = render(<WeightChart weights={pesadas} birthWeightG={3420} today={TODAY} />)
    expect(html).toContain('chart-line-up')
    expect(html).toContain('chart-line-down')
    // Un punto a cada lado de la referencia.
    expect(html).toContain('chart-point-down')
    expect(html).toContain('chart-point-up')
  })

  it('las barras miden la diferencia y el eje derecho la expresa en %', () => {
    const html = render(<WeightChart weights={pesadas} birthWeightG={3420} today={TODAY} />)
    expect(html).toContain('chart-bar-down')
    expect(html).toContain('chart-bar-up')
    expect(html).toContain('0 %')
    expect(html).toContain('%')
  })

  it('el eje horizontal es tiempo real, no una pesada por posición', () => {
    const html = render(<WeightChart weights={pesadas} birthWeightG={3420} today={TODAY} />)
    // Tres días de separación, así que los puntos no están equiespaciados
    // respecto a una tercera pesada intermedia.
    const conIntermedia = render(
      <WeightChart
        weights={[...pesadas, aWeight({ id: 'p3', start: '2026-08-07 10:00', grams: 3300 })]}
        birthWeightG={3420}
        today={TODAY}
      />
    )
    expect(conIntermedia).not.toBe(html)
  })

  it('sin peso al nacer no inventa porcentajes', () => {
    const html = render(<WeightChart weights={pesadas} birthWeightG={0} today={TODAY} />)
    expect(html).not.toContain('chart-bar-up')
    expect(html).not.toContain('desde el nacimiento')
  })

  it('sin pesadas lo dice y no dibuja nada', () => {
    const html = render(<WeightChart weights={[]} birthWeightG={3420} today={TODAY} />)
    expect(html).toContain('Todavía no hay pesadas que dibujar')
  })
})

describe('Formulario de toma', () => {
  it('se abre vacía, con las dos cosas que pueden pasar en una toma', () => {
    cacheDay(day())
    const html = render(<NewRecord type="feed" />)
    expect(html).toContain('+ Añadir tetada')
    expect(html).toContain('+ Añadir biberón')
  })

  it('al reabrir una toma vuelve cada elemento con su hora', () => {
    const toma = aFeed({
      id: 'toma-mixta',
      items: [
        {
          id: 'i1',
          kind: 'pecho',
          start: `${TODAY} 11:42`,
          end: `${TODAY} 12:03`,
          side: 'ambos',
          ml: 0,
        },
        { id: 'i2', kind: 'formula', start: `${TODAY} 12:13`, end: null, side: null, ml: 60 },
      ],
      start: `${TODAY} 11:42`,
      end: `${TODAY} 12:13`,
      durationMin: 31,
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
    })
    cacheDay(day({ records: [toma] }))
    const html = render(<EditRecord id="toma-mixta" />)
    expect(html).toContain('Tetada 1')
    expect(html).toContain('Empezó')
    expect(html).toContain('Terminó')
    expect(html).toContain('21 min')
    // El biberón de la misma toma sigue ahí, con su cantidad y su hora.
    expect(html).toContain('Fórmula 1')
    expect(html).toContain('value="60"')
    expect(html).toContain('value="12:13"')
    // Y la toma entera abarca de la primera tetada al último biberón.
    expect(html).toContain('Toma de <strong>11:42</strong> a <strong>12:13</strong>')
  })

  it('el biberón puede llevar su propia hora de fin', () => {
    const toma = aFeed({
      id: 'solo-bibe',
      items: [{ id: 'b1', kind: 'formula', start: `${TODAY} 13:13`, end: null, side: null, ml: 60 }],
      start: `${TODAY} 13:13`,
      end: `${TODAY} 13:13`,
      durationMin: 0,
      formulaMl: 60,
    })
    cacheDay(day({ records: [toma] }))
    const html = render(<EditRecord id="solo-bibe" />)
    expect(html).toContain('+ Añadir hora de fin')
    expect(html).toContain('Toma a las <strong>13:13</strong>')
  })

  it('resume en una frase lo que se va a guardar', () => {
    const toma = aFeed({
      id: 'resumen',
      start: `${TODAY} 13:13`,
      end: `${TODAY} 13:13`,
      durationMin: 0,
      formulaMl: 60,
    })
    cacheDay(day({ records: [toma] }))
    const html = render(<EditRecord id="resumen" />)
    expect(html).toContain('60 ml de fórmula a las 13:13')
  })
})

describe('Dashboard · navegar a tramos anteriores', () => {
  it('muestra el tramo en curso y deja retroceder', () => {
    const html = renderDashboard(diaCompleto())
    expect(html).toContain('Día de vida 3')
    // Con las dos fechas del calendario: el número de día de vida solo no dice
    // a qué días corresponde, y menos aún navegando hacia atrás.
    expect(html).toMatch(/\d{1,2} \w{3} \d{2}:\d{2} → \d{1,2} \w{3} \d{2}:\d{2}/)
    expect(html).toContain('aria-label="Tramo anterior"')
    // Ya estamos en el más reciente: no hay hacia dónde avanzar.
    expect(html).toContain('aria-label="Tramo siguiente" disabled')
  })

  it('el día de vida 1 no deja seguir hacia atrás', () => {
    const range = lifeDayRange(BIRTH, 1)
    const html = renderDashboard(
      day({ lifeDay: { number: 1, ...range, records: [], totals: someTotals() } })
    )
    expect(html).toContain('aria-label="Tramo anterior" disabled')
  })

  it('el pañal guarda cuánto pis, cuánta caca y cómo era', () => {
    const panal = aDiaper({
      start: `${TODAY} 12:00`,
      pee: true,
      peeAmount: 'mucho',
      poop: true,
      poopAmount: 'poco',
      consistency: 'liquida',
    })
    cacheDay(day({ records: [panal] }))
    const html = render(<Timeline date={TODAY} />)
    expect(html).toContain('pis mucho')
    expect(html).toContain('caca poca')
    expect(html).toContain('consistencia líquida')
  })

  it('las horas se mueven a saltos, hacia atrás y hacia delante', () => {
    cacheDay(day())
    const html = render(<NewRecord type="sleep" />)
    // Restar a la izquierda, sumar a la derecha y "ahora" en medio.
    for (const salto of ['−10', '−5', '−1', '+1', '+5', '+10']) {
      expect(html).toContain(`>${salto}</button>`)
    }
    expect(html).toContain('aria-label="1 minuto antes"')
    expect(html).toContain('aria-label="5 minutos después"')
    expect(html).toContain('ahora')
    expect(html.indexOf('minutos antes')).toBeLessThan(html.indexOf('minutos después'))
  })

  it('el formulario del pañal pregunta las dos cantidades por separado', () => {
    const panal = aDiaper({ id: 'p-1', start: `${TODAY} 12:00`, pee: true, poop: true })
    cacheDay(day({ records: [panal] }))
    const html = render(<EditRecord id="p-1" />)
    expect(html).toContain('Cuánto pis')
    expect(html).toContain('Cuánta caca')
    expect(html).toContain('Cómo era')
    // La caca se pregunta en femenino, aunque se guarde el mismo valor.
    expect(html).toContain('Mucha')
    expect(html).toContain('Mucho')
  })
})

describe('Dashboard · lo que cada contador separa', () => {
  it('una toma corta al pecho cuenta como hidratación, no como toma', () => {
    const html = renderDashboard(
      day({
        records: [
          aFeed({ start: `${TODAY} 08:00`, end: `${TODAY} 08:20`, breastMin: 20, breastSide: 'izquierdo' }),
          aFeed({ start: `${TODAY} 10:00`, end: `${TODAY} 10:03`, breastMin: 3, breastSide: 'derecho' }),
          aFeed({ start: `${TODAY} 12:00`, end: `${TODAY} 12:02`, breastMin: 2, breastSide: 'izquierdo' }),
        ],
      })
    )
    expect(kpi(html, '🍼 Tomas')).toBe('1')
    expect(kpi(html, '💦 Hidratación')).toBe('2')
  })

  it('un biberón es una toma aunque se anotara sin hora de fin', () => {
    // Lo que come es la cantidad, no el tiempo: un biberón puntual dura 0 min.
    const html = renderDashboard(
      day({
        records: [
          aFeed({ start: `${TODAY} 09:00`, end: `${TODAY} 09:00`, durationMin: 0, formulaMl: 60 }),
        ],
      })
    )
    expect(kpi(html, '🍼 Tomas')).toBe('1')
    expect(kpi(html, '💦 Hidratación')).toBe('0')
  })

  it('las tomas, la hidratación y la leche van en el mismo cuadro', () => {
    // Son la misma historia contada de dos maneras: las veces y los mililitros.
    const html = renderDashboard(diaCompleto())
    expect(html).toMatch(/kpi-milk[\s\S]*🍼 Tomas[\s\S]*💦 Hidratación[\s\S]*Leche cuantificable/)
  })

  it('la línea de pañales dice cuánto hace del último', () => {
    const panal = aDiaper({ start: `${TODAY} 08:00`, pee: true, poop: false })
    const html = renderDashboard(
      day({ records: [panal], last: { ...day().last, diaper: panal } })
    )
    expect(html).toMatch(/1 pañal · el último (hace|ahora mismo)/)
  })

  it('los pedetes van aparte de las cacas', () => {
    const html = renderDashboard(
      day({
        records: [
          aDiaper({ start: `${TODAY} 08:00`, pee: true, poop: true, consistency: 'pastosa' }),
          aDiaper({ start: `${TODAY} 11:00`, pee: false, poop: true, consistency: 'pedete' }),
          aDiaper({ start: `${TODAY} 14:00`, pee: false, poop: true, consistency: 'pedete' }),
          // Una caca sin anotar cómo era sigue siendo una caca.
          aDiaper({ start: `${TODAY} 17:00`, pee: false, poop: true }),
        ],
      })
    )
    expect(kpi(html, '💩 Cacas')).toBe('2')
    expect(kpi(html, '💨 Pedetes')).toBe('2')
    expect(kpi(html, '💧 Pises')).toBe('1')
  })
})

describe('Dashboard · accesos que faltaban', () => {
  it('el contador de tomas dice cuánto hace de la última y lleva a corregirla', () => {
    const toma = aFeed({ start: `${TODAY} 10:30`, end: `${TODAY} 10:50`, formulaMl: 60 })
    const html = renderDashboard(day({ records: [toma], last: { ...day().last, feed: toma } }))
    // Igual que pises y cacas: cifra, cuánto hace y acceso a corregirlo.
    expect(kpi(html, '🍼 Tomas')).toBe('1')
    expect(kpiNote(html, '🍼 Tomas')).toMatch(/^(hace |ahora mismo)/)
    expect(html).toContain('kpi-tile-link')
  })

  it('sin tomas el contador lo dice, sin dejar el hueco vacío', () => {
    const html = renderDashboard(day())
    expect(kpi(html, '🍼 Tomas')).toBe('0')
    expect(kpiNote(html, '🍼 Tomas')).toBe('sin registros')
  })

  it('pesar es un acceso rápido más, sin botones sueltos al final', () => {
    const html = renderDashboard(day())
    // Los cinco registros se crean desde la misma cuadrícula.
    for (const c of ['action-feed', 'action-diaper', 'action-sleep', 'action-bath', 'action-weight']) {
      expect(html).toContain(c)
    }
    // Y la tarjeta del peso se queda solo con la información.
    expect(html).not.toContain('Añadir pesada')
    // Ver la gráfica ya lo resuelve el botón de Evolución de abajo.
    expect(html).not.toContain('Ver pesadas')
  })

  it('la evolución puede abrirse directamente por el peso', () => {
    const html = render(<HistoryView metric="weight" />)
    // La pestaña de peso ya viene elegida, sin tener que buscarla.
    expect(html).toContain('<button type="button" class="on">⚖️ Peso</button>')
  })
})
