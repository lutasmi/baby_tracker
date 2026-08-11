// Simulación de extremo a extremo del backend sobre una hoja de cálculo en
// memoria: instalación, un día real de uso y las correcciones que se hacen
// después. Comprueba lo que las pruebas de lógica no ven: qué queda escrito en
// cada pestaña y qué devuelve la API al frontend.

import { beforeEach, describe, expect, it } from 'vitest'
import { createBackend } from './harness.mjs'

const DAY = '2026-08-07'
let backend

const record = (payload) => ({ record: payload })

// Una toma se manda con sus elementos: cada tetada y cada biberón por separado.
const feed = (id, items, p = {}) => ({ record: { id, type: 'feed', items, notes: '', ...p } })
const tetada = (id, start, end, side) => ({ id, kind: 'pecho', start, end, side })
const bibe = (id, start, ml, kind = 'formula', end = null) => ({ id, kind, start, ml, end })

beforeEach(() => {
  backend = createBackend({ now: `${DAY} 08:00` }).install()
})

describe('instalación', () => {
  it('crea una pestaña por tipo de registro, más Usuarios y Bebe', () => {
    const names = backend.spreadsheet().getSheets().map((s) => s.getName())
    expect(names).toEqual(
      expect.arrayContaining(['Usuarios', 'Bebe', 'Sueno', 'Tomas', 'Panales', 'Banos', 'Peso'])
    )
    expect(names).not.toContain('Hoja 1') // la pestaña por defecto se retira
  })

  it('cada pestaña tiene sus columnas propias y las comunes', () => {
    const header = (name) =>
      backend.sheet(name).getRange(1, 1, 1, 20).getValues()[0].filter(Boolean)

    // La toma guarda una fila por elemento; `Toma_ID` es lo que las une.
    expect(header('Tomas')).toEqual([
      'ID',
      'Toma_ID',
      'Fecha',
      'Hora_Inicio',
      'Hora_Fin',
      'Duracion_Min',
      'Tipo',
      'Pecho_Lado',
      'Cantidad_Ml',
      'Notas',
      'Creado_Por',
      'Creado_En',
      'Modificado_Por',
      'Modificado_En',
      'Eliminado',
    ])
    expect(header('Panales')).toEqual(
      expect.arrayContaining(['Hora', 'Pis', 'Pis_Cantidad', 'Caca', 'Consistencia'])
    )
    expect(header('Panales')).not.toContain('Hora_Inicio')
  })

  it('da formato de número a las columnas numéricas y de texto al resto', () => {
    // Si una columna numérica se queda como texto, Sheets la alinea a la
    // izquierda y deja de servir para fórmulas o gráficos.
    expect(backend.columnFormat('Tomas', 'Cantidad_Ml')).toBe('0')
    expect(backend.columnFormat('Tomas', 'Duracion_Min')).toBe('0')
    expect(backend.columnFormat('Peso', 'Gramos')).toBe('0')
    expect(backend.columnFormat('Bebe', 'Peso_Nacimiento_G')).toBe('0')

    // Las horas se guardan como texto para que Sheets no las reinterprete.
    expect(backend.columnFormat('Tomas', 'Hora_Inicio')).toBe('@')
    expect(backend.columnFormat('Panales', 'Hora')).toBe('@')
    expect(backend.columnFormat('Bebe', 'Fecha_Nacimiento')).toBe('@')
    expect(backend.columnFormat('Bebe', 'Hora_Nacimiento')).toBe('@')
  })

  it('da de alta al usuario que instala', () => {
    expect(backend.sheet('Usuarios').asObjects()[0]).toMatchObject({
      Email: 'ana@example.com',
      Activo: 'TRUE',
    })
  })

  it('volver a ejecutarlo no duplica nada ni pierde datos', () => {
    backend.setNow(`${DAY} 10:00`)
    backend.call('createRecord', feed('previo', [bibe('b1', `${DAY} 09:00`, 60)]))
    const hojas = backend.spreadsheet().getSheets().length
    const cabecera = backend.sheet('Tomas').getRange(1, 1, 1, 15).getValues()[0]

    backend.runSetup()

    expect(backend.spreadsheet().getSheets().length).toBe(hojas)
    expect(backend.sheet('Tomas').getRange(1, 1, 1, 15).getValues()[0]).toEqual(cabecera)
    expect(backend.sheet('Usuarios').asObjects()).toHaveLength(1)
    // El registro que ya existía sigue ahí.
    expect(backend.sheet('Tomas').asObjects()).toHaveLength(1)
    expect(backend.call('getDay', { date: DAY }).records[0].id).toBe('previo')
  })

  it('añade a una pestaña existente las columnas que falten', () => {
    // Simula una pestaña creada por una versión anterior, sin Pecho_Lado.
    const ss = backend.spreadsheet()
    ss.deleteSheet(ss.getSheetByName('Tomas'))
    const parcial = ss.insertSheet('Tomas')
    parcial.appendRow(['ID', 'Fecha', 'Hora_Inicio', 'Hora_Fin', 'Duracion_Min', 'Pecho_Min'])
    parcial.appendRow(['viejo-1', DAY, `${DAY} 09:00`, `${DAY} 09:20`, 20, 15])

    backend.runSetup()

    const cabecera = backend.sheet('Tomas').getRange(1, 1, 1, 20).getValues()[0].filter(Boolean)
    expect(cabecera).toEqual(expect.arrayContaining(['Toma_ID', 'Tipo', 'Cantidad_Ml']))
    // Las columnas que ya estaban no se reordenan y su fila se conserva.
    expect(cabecera.slice(0, 6)).toEqual([
      'ID',
      'Fecha',
      'Hora_Inicio',
      'Hora_Fin',
      'Duracion_Min',
      'Pecho_Min',
    ])
    // Y la toma de antes se sigue leyendo, ahora repartida en elementos.
    backend.setNow(`${DAY} 12:00`)
    const vieja = backend.call('getDay', { date: DAY }).records[0]
    expect(vieja).toMatchObject({ id: 'viejo-1', breastMin: 15, end: `${DAY} 09:20` })
    expect(vieja.items).toHaveLength(1)
  })
})

describe('un día de uso', () => {
  /** Registra el día tal y como lo harían unos padres, hora a hora. */
  function liveTheDay() {
    backend.call('updateSettings', {
      settings: { birth: '2026-08-05 09:17', birthWeightG: 3420 },
    })

    // 08:05 — biberón de fórmula anotado justo al terminar.
    backend.setNow(`${DAY} 08:05`)
    backend.call(
      'createRecord',
      feed('toma-1', [bibe('t1-bib', `${DAY} 07:45`, 63, 'formula', `${DAY} 08:03`)])
    )

    // 08:20 — pañal con las dos cosas.
    backend.setNow(`${DAY} 08:20`)
    backend.call(
      'createRecord',
      record({
        id: 'panal-1',
        type: 'diaper',
        start: `${DAY} 08:18`,
        pee: true,
        poop: true,
        consistency: 'pastosa',
        notes: '',
      })
    )

    // 09:30 — se duerme; el cronómetro queda abierto.
    backend.setNow(`${DAY} 09:30`)
    backend.call(
      'createRecord',
      record({ id: 'sueno-1', type: 'sleep', start: `${DAY} 09:30`, end: null, kind: 'siesta', notes: '' })
    )

    // 10:45 — se despierta: se cierra el mismo registro.
    backend.setNow(`${DAY} 10:45`)
    backend.call(
      'updateRecord',
      record({
        id: 'sueno-1',
        type: 'sleep',
        start: `${DAY} 09:30`,
        end: `${DAY} 10:45`,
        kind: 'siesta',
        notes: '',
      })
    )

    // 13:00 — toma larga: tetada, leche extraída y remate de fórmula.
    backend.setNow(`${DAY} 13:00`)
    backend.call(
      'createRecord',
      feed(
        'toma-2',
        [
          tetada('t2-pecho', `${DAY} 12:20`, `${DAY} 12:37`, 'izquierdo'),
          bibe('t2-extr', `${DAY} 12:40`, 28, 'extraida'),
          bibe('t2-form', `${DAY} 12:51`, 37, 'formula'),
        ],
        { notes: 'con ayuda' }
      )
    )

    // 16:00 — se anota un pis de la tarde y un baño.
    backend.setNow(`${DAY} 16:00`)
    backend.call(
      'createRecord',
      record({ id: 'panal-2', type: 'diaper', start: `${DAY} 15:10`, pee: true, poop: false, notes: '' })
    )
    backend.call(
      'createRecord',
      record({ id: 'bano-1', type: 'bath', start: `${DAY} 15:30`, kind: 'completo', durationMin: 12, notes: '' })
    )
  }

  it('cada registro acaba en su pestaña, con sus columnas', () => {
    liveTheDay()

    // Una fila por elemento: el biberón de la mañana y los tres de la tarde.
    expect(backend.sheet('Tomas').asObjects()).toHaveLength(4)
    expect(backend.sheet('Panales').asObjects()).toHaveLength(2)
    expect(backend.sheet('Sueno').asObjects()).toHaveLength(1)
    expect(backend.sheet('Banos').asObjects()).toHaveLength(1)

    const tomas = backend.sheet('Tomas').asObjects()
    expect(tomas[1]).toMatchObject({
      ID: 't2-pecho',
      Toma_ID: 'toma-2',
      Fecha: DAY,
      Hora_Inicio: `${DAY} 12:20`,
      Hora_Fin: `${DAY} 12:37`,
      Duracion_Min: 17,
      Tipo: 'Pecho',
      Pecho_Lado: 'Izquierdo',
      Cantidad_Ml: '',
      Notas: 'con ayuda',
      Creado_Por: 'ana@example.com',
      Eliminado: '',
    })
    expect(tomas[2]).toMatchObject({
      ID: 't2-extr',
      Toma_ID: 'toma-2',
      Hora_Inicio: `${DAY} 12:40`,
      Hora_Fin: '',
      Tipo: 'Extraída',
      Cantidad_Ml: 28,
    })
    expect(tomas[3]).toMatchObject({ ID: 't2-form', Tipo: 'Fórmula', Cantidad_Ml: 37 })

    expect(backend.sheet('Panales').asObjects()[0]).toMatchObject({
      Hora: `${DAY} 08:18`,
      Pis: 'TRUE',
      Caca: 'TRUE',
      Consistencia: 'Pastosa',
    })
  })

  it('el pañal guarda la cantidad de pis en su columna', () => {
    liveTheDay()
    backend.setNow(`${DAY} 17:00`)
    backend.call(
      'createRecord',
      record({
        id: 'panal-3',
        type: 'diaper',
        start: `${DAY} 16:40`,
        pee: true,
        peeAmount: 'mucho',
        poop: true,
        consistency: 'pedete',
        notes: '',
      })
    )
    const fila = backend.sheet('Panales').asObjects().find((r) => r.ID === 'panal-3')
    expect(fila).toMatchObject({ Pis: 'TRUE', Pis_Cantidad: 'Mucho', Consistencia: 'Pedete' })
  })

  it('la cronología del día une las cuatro pestañas por hora', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:05`)
    const day = backend.call('getDay', { date: DAY })

    expect(day.records.map((r) => r.id)).toEqual([
      'toma-1',
      'panal-1',
      'sueno-1',
      'toma-2',
      'panal-2',
      'bano-1',
    ])
    expect(day.records.map((r) => r.type)).toEqual([
      'feed',
      'diaper',
      'sleep',
      'feed',
      'diaper',
      'bath',
    ])
  })

  it('los totales del día de vida salen de los registros', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:05`)
    const { lifeDay } = backend.call('getDay', { date: DAY })

    // Nacimiento el 5 a las 09:17: el día 7 a las 16:05 es el día de vida 3.
    expect(lifeDay.number).toBe(3)
    expect(lifeDay.start).toBe(`${DAY} 09:17`)
    expect(lifeDay.totals).toMatchObject({
      pees: 1, // el pañal de las 08:18 pertenece al día de vida anterior
      poops: 0,
      feeds: 1,
      breastMin: 17,
      expressedMl: 28,
      formulaMl: 37,
      milkMl: 65,
    })
  })

  it('el último registro de cada tipo es el que la pantalla necesita', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:05`)
    const day = backend.call('getDay', { date: DAY })

    expect(day.last.feed.id).toBe('toma-2')
    expect(day.last.diaper.id).toBe('panal-2')
    expect(day.last.sleepEnd.id).toBe('sueno-1')
    expect(day.openSleep).toBeNull()
  })

  it('los ajustes viven en la pestaña Bebe', () => {
    liveTheDay()
    expect(backend.sheet('Bebe').asObjects()[0]).toMatchObject({
      Fecha_Nacimiento: '2026-08-05',
      Hora_Nacimiento: '09:17',
      Peso_Nacimiento_G: 3420,
    })
    expect(backend.call('getDay', { date: DAY }).settings).toEqual({
      birth: '2026-08-05 09:17',
      birthWeightG: 3420,
    })
  })

  it('la hidratación no cuenta como última toma ni el pedete como última caca', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:30`)
    // Un ratito al pecho para calmarlo y un pañal con solo gases.
    backend.call(
      'createRecord',
      feed('consuelo', [tetada('c1', `${DAY} 16:10`, `${DAY} 16:13`, 'izquierdo')])
    )
    backend.call(
      'createRecord',
      record({
        id: 'pedete-1',
        type: 'diaper',
        start: `${DAY} 16:15`,
        pee: false,
        poop: true,
        consistency: 'pedete',
        notes: '',
      })
    )

    const { last } = backend.call('getDay', { date: DAY })
    // El reloj de "cuánto hace" no lo reinicia ninguna de las dos cosas.
    expect(last.feed.id).toBe('toma-2')
    expect(last.poop.id).toBe('panal-1')
    // Pero el último pañal sí es el de los gases: es un pañal como otro.
    expect(last.diaper.id).toBe('pedete-1')
  })

  it('una tetada larga sí cuenta como última toma', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:30`)
    backend.call(
      'createRecord',
      feed('tetada-larga', [tetada('t1', `${DAY} 16:00`, `${DAY} 16:20`, 'derecho')])
    )
    expect(backend.call('getDay', { date: DAY }).last.feed.id).toBe('tetada-larga')
  })

  it('un biberón corto cuenta como toma: lo que come es la cantidad', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:30`)
    backend.call('createRecord', feed('bibe-rapido', [bibe('b1', `${DAY} 16:05`, 40)]))
    expect(backend.call('getDay', { date: DAY }).last.feed.id).toBe('bibe-rapido')
  })

  it('sigue la última caca aparte del último pañal', () => {
    liveTheDay()
    backend.setNow(`${DAY} 16:05`)
    const { last } = backend.call('getDay', { date: DAY })
    // El último pañal es el pis de las 15:10; la última caca, el de las 08:18.
    expect(last.diaper.id).toBe('panal-2')
    expect(last.poop.id).toBe('panal-1')
  })

  it('da la toma anterior al día para calcular el hueco de la primera', () => {
    liveTheDay()
    // Una toma de anoche, que no aparece en la cronología de hoy.
    backend.setNow(`${DAY} 16:10`)
    backend.call(
      'createRecord',
      feed('toma-noche', [bibe('n1', '2026-08-06 23:30', 50, 'formula', '2026-08-06 23:50')])
    )
    const day = backend.call('getDay', { date: DAY })
    expect(day.records.find((r) => r.id === 'toma-noche')).toBeUndefined()
    expect(day.previousFeed.id).toBe('toma-noche')
  })

  it('registra el peso en su pestaña y lo devuelve como último', () => {
    liveTheDay()
    backend.setNow(`${DAY} 17:00`)
    backend.call(
      'createRecord',
      record({ id: 'peso-1', type: 'weight', start: `${DAY} 16:45`, grams: 3210, notes: '' })
    )
    expect(backend.sheet('Peso').asObjects()[0]).toMatchObject({
      ID: 'peso-1',
      Hora: `${DAY} 16:45`,
      Gramos: 3210,
    })
    const day = backend.call('getDay', { date: DAY })
    expect(day.last.weight.grams).toBe(3210)
    expect(day.records.find((r) => r.id === 'peso-1')).toBeDefined()
  })
})

describe('evolución por días de vida', () => {
  it('devuelve los totales de cada periodo, del más reciente al más antiguo', () => {
    backend.call('updateSettings', { settings: { birth: '2026-08-05 09:17', birthWeightG: 3420 } })

    // Día de vida 2 (del 6 a las 09:17 al 7 a las 09:17).
    backend.setNow('2026-08-07 08:00')
    backend.call(
      'createRecord',
      record({ id: 'p-d2', type: 'diaper', start: '2026-08-06 20:00', pee: true, poop: true, notes: '' })
    )
    // Día de vida 3.
    backend.setNow(`${DAY} 16:00`)
    backend.call(
      'createRecord',
      record({ id: 'p-d3', type: 'diaper', start: `${DAY} 12:00`, pee: true, poop: false, notes: '' })
    )
    backend.call('createRecord', feed('t-d3', [bibe('b-d3', `${DAY} 13:00`, 90)]))
    backend.call(
      'createRecord',
      record({ id: 'w-d3', type: 'weight', start: `${DAY} 14:00`, grams: 3300, notes: '' })
    )

    const { birth, days } = backend.call('getHistory', { days: 5 })
    expect(birth).toBe('2026-08-05 09:17')
    expect(days.map((d) => d.number)).toEqual([3, 2, 1])

    expect(days[0]).toMatchObject({ number: 3, weightG: 3300 })
    expect(days[0].totals).toMatchObject({ pees: 1, poops: 0, milkMl: 90 })
    expect(days[1].totals).toMatchObject({ pees: 1, poops: 1, milkMl: 0 })
    expect(days[1].weightG).toBeNull()
  })

  it('limita cuántos días devuelve', () => {
    backend.call('updateSettings', { settings: { birth: '2026-07-01 09:00', birthWeightG: 0 } })
    backend.setNow(`${DAY} 12:00`)
    expect(backend.call('getHistory', { days: 5 }).days).toHaveLength(5)
    expect(backend.call('getHistory', {}).days).toHaveLength(14)
  })

  it('sin fecha de nacimiento no hay evolución que mostrar', () => {
    expect(backend.call('getHistory', {})).toEqual({ birth: null, days: [], weights: [] })
  })
})

describe('correcciones posteriores', () => {
  beforeEach(() => {
    backend.setNow(`${DAY} 11:00`)
    backend.call(
      'createRecord',
      feed('toma-1', [bibe('b1', `${DAY} 10:00`, 60, 'formula', `${DAY} 10:20`)])
    )
  })

  it('editar una toma reescribe su fila sin crear otra', () => {
    backend.call(
      'updateRecord',
      feed('toma-1', [bibe('b1', `${DAY} 10:00`, 90, 'extraida', `${DAY} 10:25`)], {
        notes: 'corregido',
      })
    )
    const filas = backend.sheet('Tomas').asObjects()
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      Duracion_Min: 25,
      Tipo: 'Extraída', // ya no es fórmula
      Cantidad_Ml: 90,
      Notas: 'corregido',
      Modificado_Por: 'ana@example.com',
    })
  })

  it('añadir una tetada a la toma añade su fila, y quitarla la retira', () => {
    backend.call(
      'updateRecord',
      feed('toma-1', [
        bibe('b1', `${DAY} 10:00`, 60, 'formula', `${DAY} 10:20`),
        tetada('t1', `${DAY} 10:30`, `${DAY} 10:45`, 'derecho'),
      ])
    )
    expect(backend.sheet('Tomas').asObjects()).toHaveLength(2)
    let toma = backend.call('getDay', { date: DAY }).records[0]
    expect(toma).toMatchObject({ breastMin: 15, breastSide: 'derecho', end: `${DAY} 10:45` })

    // Al quitarla, su fila queda marcada como eliminada y la toma se encoge.
    backend.call(
      'updateRecord',
      feed('toma-1', [bibe('b1', `${DAY} 10:00`, 60, 'formula', `${DAY} 10:20`)])
    )
    const filas = backend.sheet('Tomas').asObjects()
    expect(filas).toHaveLength(2)
    expect(filas.find((f) => f.ID === 't1').Eliminado).toBe('TRUE')
    toma = backend.call('getDay', { date: DAY }).records[0]
    expect(toma).toMatchObject({ breastMin: 0, end: `${DAY} 10:20` })
    expect(toma.items).toHaveLength(1)
  })

  it('al corregir una toma del modelo anterior, su fila se reescribe entera', () => {
    // Una toma guardada por la versión anterior: los totales en una sola fila,
    // sin Toma_ID ni Tipo, y con la columna Pecho_Min que ya no se crea.
    const sheet = backend.sheet('Tomas')
    const pechoMin = sheet.getRange(1, 1, 1, 20).getValues()[0].filter(Boolean).length + 1
    sheet.setCell(1, pechoMin, 'Pecho_Min')
    sheet.appendRow(['vieja-1', '', DAY, `${DAY} 09:00`, `${DAY} 09:20`, 20, '', 'Ambos', '', ''])
    sheet.setCell(sheet.getLastRow(), pechoMin, 20)

    backend.setNow(`${DAY} 12:00`)
    const vieja = backend.call('getDay', { date: DAY }).records.find((r) => r.id === 'vieja-1')
    expect(vieja).toMatchObject({ breastMin: 20, breastSide: 'ambos' })
    expect(vieja.items).toHaveLength(1)

    // Se corrige: eran 15 minutos del pecho izquierdo.
    backend.call(
      'updateRecord',
      feed('vieja-1', [tetada(vieja.items[0].id, `${DAY} 09:00`, `${DAY} 09:15`, 'izquierdo')])
    )
    const fila = backend.sheet('Tomas').asObjects().find((f) => f.ID === vieja.items[0].id)
    expect(fila).toMatchObject({
      Toma_ID: 'vieja-1',
      Tipo: 'Pecho',
      Pecho_Lado: 'Izquierdo',
      Duracion_Min: 15,
      Pecho_Min: '', // el total del modelo anterior ya no dice nada
    })
  })

  it('borrar es lógico: las filas se quedan marcadas', () => {
    backend.call('deleteRecord', { type: 'feed', id: 'toma-1' })
    const filas = backend.sheet('Tomas').asObjects()
    expect(filas).toHaveLength(1)
    expect(filas[0].Eliminado).toBe('TRUE')
    expect(backend.call('getDay', { date: DAY }).records).toEqual([])
  })

  it('reintentar una creación no duplica la fila', () => {
    backend.call(
      'createRecord',
      feed('toma-1', [bibe('b1', `${DAY} 10:00`, 60, 'formula', `${DAY} 10:20`)])
    )
    expect(backend.sheet('Tomas').asObjects()).toHaveLength(1)
  })

  it('un registro editado a mano en la hoja se sigue leyendo', () => {
    // Alguien cambia la cantidad y la hora directamente en Sheets.
    const sheet = backend.sheet('Tomas')
    const header = sheet.getRange(1, 1, 1, 15).getValues()[0]
    sheet.setCell(2, header.indexOf('Cantidad_Ml') + 1, '75')
    sheet.setCell(2, header.indexOf('Hora_Fin') + 1, '10:40')

    const day = backend.call('getDay', { date: DAY })
    expect(day.records[0]).toMatchObject({
      formulaMl: 75,
      end: `${DAY} 10:40`,
      durationMin: 40, // recalculada a partir del intervalo
    })
  })
})

describe('reglas que protegen los datos', () => {
  it('no deja dos sueños abiertos a la vez', () => {
    backend.setNow(`${DAY} 10:00`)
    backend.call(
      'createRecord',
      record({ id: 's1', type: 'sleep', start: `${DAY} 09:30`, end: null, kind: 'siesta', notes: '' })
    )
    expect(() =>
      backend.call(
        'createRecord',
        record({ id: 's2', type: 'sleep', start: `${DAY} 10:00`, end: null, kind: 'siesta', notes: '' })
      )
    ).toThrow(/sueño en curso/)
  })

  it('rechaza una toma sin componentes y un pañal vacío', () => {
    backend.setNow(`${DAY} 10:00`)
    expect(() => backend.call('createRecord', feed('x', []))).toThrow(/al menos una tetada/)
    expect(() =>
      backend.call(
        'createRecord',
        record({ id: 'y', type: 'diaper', start: `${DAY} 09:00`, pee: false, poop: false, notes: '' })
      )
    ).toThrow(/pis, caca/)
  })

  it('sin sesión no se puede leer ni escribir', () => {
    backend.properties.delete('sess:test-token')
    expect(() => backend.call('getDay', { date: DAY })).toThrow(/sesión/i)
  })

  it('un usuario desactivado pierde el acceso al momento', () => {
    const usuarios = backend.sheet('Usuarios')
    const header = usuarios.getRange(1, 1, 1, 6).getValues()[0]
    usuarios.setCell(2, header.indexOf('Activo') + 1, 'FALSE')
    expect(() => backend.call('getDay', { date: DAY })).toThrow(/no está autorizada/)
  })
})

describe('convivencia con la versión anterior', () => {
  it('la pestaña Eventos se deja intacta y deja de leerse', () => {
    const ss = backend.spreadsheet()
    const viejo = ss.insertSheet('Eventos')
    viejo.appendRow(['Evento_ID', 'Tipo_Evento', 'Hora_Inicio'])
    viejo.appendRow(['antiguo-1', 'Toma', `${DAY} 07:00`])

    backend.setNow(`${DAY} 12:00`)
    const day = backend.call('getDay', { date: DAY })
    expect(day.records).toEqual([])
    // Pero la pestaña sigue ahí con sus datos.
    expect(ss.getSheetByName('Eventos').getLastRow()).toBe(2)
  })
})
