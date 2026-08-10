// Simulación de extremo a extremo del backend sobre una hoja de cálculo en
// memoria: instalación, un día real de uso y las correcciones que se hacen
// después. Comprueba lo que las pruebas de lógica no ven: qué queda escrito en
// cada pestaña y qué devuelve la API al frontend.

import { beforeEach, describe, expect, it } from 'vitest'
import { createBackend } from './harness.mjs'

const DAY = '2026-08-07'
let backend

const record = (payload) => ({ record: payload })

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

    expect(header('Tomas')).toEqual([
      'ID',
      'Fecha',
      'Hora_Inicio',
      'Hora_Fin',
      'Duracion_Min',
      'Pecho_Min',
      'Pecho_Lado',
      'Extraida_Ml',
      'Formula_Ml',
      'Notas',
      'Creado_Por',
      'Creado_En',
      'Modificado_Por',
      'Modificado_En',
      'Eliminado',
    ])
    expect(header('Panales')).toEqual(
      expect.arrayContaining(['Hora', 'Pis', 'Caca', 'Consistencia'])
    )
    expect(header('Panales')).not.toContain('Hora_Inicio')
  })

  it('da de alta al usuario que instala', () => {
    expect(backend.sheet('Usuarios').asObjects()[0]).toMatchObject({
      Email: 'ana@example.com',
      Activo: 'TRUE',
    })
  })

  it('volver a ejecutarlo no duplica nada ni pierde datos', () => {
    backend.setNow(`${DAY} 10:00`)
    backend.call(
      'createRecord',
      record({
        id: 'previo',
        type: 'feed',
        start: `${DAY} 09:00`,
        end: `${DAY} 09:20`,
        formulaMl: 60,
        notes: '',
      })
    )
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
    expect(cabecera).toEqual(expect.arrayContaining(['Pecho_Lado', 'Extraida_Ml', 'Formula_Ml']))
    // Las columnas que ya estaban no se reordenan y su fila se conserva.
    expect(cabecera.slice(0, 6)).toEqual([
      'ID',
      'Fecha',
      'Hora_Inicio',
      'Hora_Fin',
      'Duracion_Min',
      'Pecho_Min',
    ])
    backend.setNow(`${DAY} 12:00`)
    expect(backend.call('getDay', { date: DAY }).records[0]).toMatchObject({
      id: 'viejo-1',
      breastMin: 15,
    })
  })
})

describe('un día de uso', () => {
  /** Registra el día tal y como lo harían unos padres, hora a hora. */
  function liveTheDay() {
    backend.call('updateSettings', {
      settings: { birth: '2026-08-05 09:17', birthWeightG: 3420 },
    })

    // 08:05 — toma de fórmula anotada justo al terminar.
    backend.setNow(`${DAY} 08:05`)
    backend.call(
      'createRecord',
      record({
        id: 'toma-1',
        type: 'feed',
        start: `${DAY} 07:45`,
        end: `${DAY} 08:03`,
        formulaMl: 63,
        notes: '',
      })
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

    // 13:00 — toma mixta: pecho, extraída y fórmula a la vez.
    backend.setNow(`${DAY} 13:00`)
    backend.call(
      'createRecord',
      record({
        id: 'toma-2',
        type: 'feed',
        start: `${DAY} 12:20`,
        end: `${DAY} 12:51`,
        breastMin: 17,
        breastSide: 'izquierdo',
        expressedMl: 28,
        formulaMl: 37,
        notes: 'con ayuda',
      })
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

    expect(backend.sheet('Tomas').asObjects()).toHaveLength(2)
    expect(backend.sheet('Panales').asObjects()).toHaveLength(2)
    expect(backend.sheet('Sueno').asObjects()).toHaveLength(1)
    expect(backend.sheet('Banos').asObjects()).toHaveLength(1)

    expect(backend.sheet('Tomas').asObjects()[1]).toMatchObject({
      ID: 'toma-2',
      Fecha: DAY,
      Hora_Inicio: `${DAY} 12:20`,
      Hora_Fin: `${DAY} 12:51`,
      Duracion_Min: 31,
      Pecho_Min: 17,
      Pecho_Lado: 'Izquierdo',
      Extraida_Ml: 28,
      Formula_Ml: 37,
      Notas: 'con ayuda',
      Creado_Por: 'ana@example.com',
      Eliminado: '',
    })

    expect(backend.sheet('Panales').asObjects()[0]).toMatchObject({
      Hora: `${DAY} 08:18`,
      Pis: 'TRUE',
      Caca: 'TRUE',
      Consistencia: 'Pastosa',
    })
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
      record({
        id: 'toma-noche',
        type: 'feed',
        start: '2026-08-06 23:30',
        end: '2026-08-06 23:50',
        formulaMl: 50,
        notes: '',
      })
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

describe('correcciones posteriores', () => {
  beforeEach(() => {
    backend.setNow(`${DAY} 11:00`)
    backend.call(
      'createRecord',
      record({
        id: 'toma-1',
        type: 'feed',
        start: `${DAY} 10:00`,
        end: `${DAY} 10:20`,
        formulaMl: 60,
        notes: '',
      })
    )
  })

  it('editar una toma reescribe su fila sin crear otra', () => {
    backend.call(
      'updateRecord',
      record({
        id: 'toma-1',
        type: 'feed',
        start: `${DAY} 10:00`,
        end: `${DAY} 10:25`,
        expressedMl: 90,
        notes: 'corregido',
      })
    )
    const filas = backend.sheet('Tomas').asObjects()
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      Duracion_Min: 25,
      Formula_Ml: '', // ya no hay fórmula
      Extraida_Ml: 90,
      Notas: 'corregido',
      Modificado_Por: 'ana@example.com',
    })
  })

  it('borrar es lógico: la fila se queda marcada', () => {
    backend.call('deleteRecord', { type: 'feed', id: 'toma-1' })
    const filas = backend.sheet('Tomas').asObjects()
    expect(filas).toHaveLength(1)
    expect(filas[0].Eliminado).toBe('TRUE')
    expect(backend.call('getDay', { date: DAY }).records).toEqual([])
  })

  it('reintentar una creación no duplica la fila', () => {
    backend.call(
      'createRecord',
      record({
        id: 'toma-1',
        type: 'feed',
        start: `${DAY} 10:00`,
        end: `${DAY} 10:20`,
        formulaMl: 60,
        notes: '',
      })
    )
    expect(backend.sheet('Tomas').asObjects()).toHaveLength(1)
  })

  it('un registro editado a mano en la hoja se sigue leyendo', () => {
    // Alguien cambia la cantidad y la hora directamente en Sheets.
    const sheet = backend.sheet('Tomas')
    const header = sheet.getRange(1, 1, 1, 15).getValues()[0]
    sheet.setCell(2, header.indexOf('Formula_Ml') + 1, '75')
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
    expect(() =>
      backend.call(
        'createRecord',
        record({ id: 'x', type: 'feed', start: `${DAY} 09:00`, end: `${DAY} 09:20`, notes: '' })
      )
    ).toThrow(/al menos un componente/)
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
