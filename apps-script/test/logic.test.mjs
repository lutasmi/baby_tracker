// Tests de la lógica pura del backend (Logic.js se ejecuta tal cual en Node).
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const L = require('../Logic.js')

const NOW = '2026-07-15 12:00'

function input(partial) {
  return {
    id: 'uuid-1',
    type: 'sleep',
    subtype: 'siesta',
    start: '2026-07-15 10:00',
    end: '2026-07-15 11:00',
    durationMin: null,
    quantityMl: null,
    detail: null,
    notes: '',
    ...partial,
  }
}

/** Toma con sus componentes: `{start, end, breastMin, expressedMl, formulaMl}`. */
function feed({ start, end, breastMin, breastSide, expressedMl, formulaMl, mixtaMl, ...rest }) {
  return input({
    type: 'feed',
    subtype: null,
    start: start ?? '2026-07-15 09:00',
    end: end === undefined ? '2026-07-15 09:20' : end,
    components: { breastMin, breastSide, expressedMl, formulaMl, mixtaMl },
    ...rest,
  })
}

describe('normalizeAndValidate', () => {
  it('acepta un sueño cerrado y calcula la duración', () => {
    const e = L.normalizeAndValidate(input({}), NOW)
    expect(e.durationMin).toBe(60)
  })

  it('acepta un sueño activo (sin fin)', () => {
    const e = L.normalizeAndValidate(input({ end: null }), NOW)
    expect(e.end).toBeNull()
    expect(e.durationMin).toBeNull()
  })

  it('rechaza un fin anterior al inicio', () => {
    expect(() => L.normalizeAndValidate(input({ end: '2026-07-15 09:00' }), NOW)).toThrowError(
      /posterior al inicio/
    )
  })

  it('rechaza inicios en el futuro', () => {
    expect(() => L.normalizeAndValidate(input({ start: '2026-07-15 13:00', end: null }), NOW)).toThrowError(
      /futuro/
    )
  })

  it('rechaza duraciones de más de 24 horas', () => {
    expect(() =>
      L.normalizeAndValidate(
        input({ start: '2026-07-13 10:00', end: '2026-07-14 11:00' }),
        NOW
      )
    ).toThrowError(/24 horas/)
  })

  it('la toma conserva inicio y fin y deriva la duración con precisión de 1 min', () => {
    const e = L.normalizeAndValidate(
      feed({ start: '2026-07-15 10:13', end: '2026-07-15 10:31', formulaMl: 63 }),
      NOW
    )
    expect(e.end).toBe('2026-07-15 10:31')
    expect(e.durationMin).toBe(18)
    expect(e.quantityMl).toBe(63)
    expect(e.subtype).toBe('biberon')
    expect(e.components).toMatchObject({ formulaMl: 63, expressedMl: 0, breastMin: 0 })
  })

  it('acepta una toma con varios componentes y deriva el subtipo mixto', () => {
    const e = L.normalizeAndValidate(
      feed({
        start: '2026-07-15 09:00',
        end: '2026-07-15 09:30',
        breastMin: 17,
        expressedMl: 28,
        formulaMl: 37,
      }),
      NOW
    )
    expect(e.subtype).toBe('mixta')
    expect(e.detail).toBe('mixta')
    // Los ml cuantificables suman; los minutos de pecho no se convierten.
    expect(e.quantityMl).toBe(65)
    expect(e.components.breastMin).toBe(17)
  })

  it('una toma solo de pecho es lactancia y no tiene cantidad', () => {
    const e = L.normalizeAndValidate(
      feed({ start: '2026-07-15 09:00', end: '2026-07-15 09:20', breastMin: 20, breastSide: 'ambos' }),
      NOW
    )
    expect(e.subtype).toBe('lactancia')
    expect(e.quantityMl).toBeNull()
    expect(e.components.breastSide).toBe('ambos')
  })

  it('admite una toma puntual (inicio igual que fin)', () => {
    const e = L.normalizeAndValidate(
      feed({ start: '2026-07-15 09:00', end: '2026-07-15 09:00', formulaMl: 60 }),
      NOW
    )
    expect(e.durationMin).toBe(0)
  })

  it('rechaza una toma sin ningún componente', () => {
    expect(() => L.normalizeAndValidate(feed({}), NOW)).toThrowError(/al menos un componente/)
  })

  it('rechaza cantidades fuera de rango y minutos de pecho imposibles', () => {
    expect(() => L.normalizeAndValidate(feed({ formulaMl: 2000 }), NOW)).toThrowError(/fórmula/)
    expect(() =>
      L.normalizeAndValidate(
        feed({ start: '2026-07-15 09:00', end: '2026-07-15 09:10', breastMin: 90 }),
        NOW
      )
    ).toThrowError(/superar la duración/)
  })

  it('descarta la consistencia en un pañal de solo pipí', () => {
    const e = L.normalizeAndValidate(
      input({ type: 'diaper', subtype: 'pipi', end: null, detail: 'liquida' }),
      NOW
    )
    expect(e.detail).toBeNull()
  })

  it('acepta la consistencia cuando hay caca', () => {
    const e = L.normalizeAndValidate(
      input({ type: 'diaper', subtype: 'caca', end: null, detail: 'liquida' }),
      NOW
    )
    expect(e.detail).toBe('liquida')
  })

  it('valida la duración opcional del baño', () => {
    const e = L.normalizeAndValidate(
      input({ type: 'bath', subtype: 'completo', end: null, durationMin: 15 }),
      NOW
    )
    expect(e.durationMin).toBe(15)

    expect(() =>
      L.normalizeAndValidate(
        input({ type: 'bath', subtype: 'completo', end: null, durationMin: 500 }),
        NOW
      )
    ).toThrowError(/240/)
  })

  it('recorta las notas y rechaza ids vacíos', () => {
    const e = L.normalizeAndValidate(input({ notes: '  hola  ' }), NOW)
    expect(e.notes).toBe('hola')
    expect(() => L.normalizeAndValidate(input({ id: '  ' }), NOW)).toThrowError(/Identificador/)
  })
})

describe('eventToRecord / recordToEvent', () => {
  it('hace la ida y vuelta de una toma mixta sin perder información', () => {
    const event = L.normalizeAndValidate(
      feed({
        start: '2026-07-15 09:00',
        end: '2026-07-15 09:29',
        breastMin: 10,
        breastSide: 'derecho',
        expressedMl: 25,
        formulaMl: 15,
        notes: 'con ayuda',
      }),
      NOW
    )
    event.createdBy = 'ana@example.com'
    event.createdAt = '2026-07-15 09:30'
    const rec = L.eventToRecord(event, false)
    expect(rec.Tipo_Evento).toBe('Toma')
    expect(rec.Subtipo).toBe('Mixta')
    expect(rec.Fecha).toBe('2026-07-15')
    expect(rec.Cantidad).toBe(40)
    expect(rec.Unidad).toBe('ml')
    // El desglose viaja en Detalle_2, la única columna que estaba sin usar.
    expect(rec.Detalle_2).toBe('pecho 10 min (Derecho) · extraída 25 ml · fórmula 15 ml')

    const back = L.recordToEvent(rec)
    expect(back.deleted).toBe(false)
    expect(back.event).toMatchObject({
      id: 'uuid-1',
      type: 'feed',
      subtype: 'mixta',
      start: '2026-07-15 09:00',
      end: '2026-07-15 09:29',
      durationMin: 29,
      quantityMl: 40,
      notes: 'con ayuda',
      createdBy: 'ana@example.com',
    })
    expect(back.event.components).toMatchObject({
      breastMin: 10,
      breastSide: 'derecho',
      expressedMl: 25,
      formulaMl: 15,
    })
  })

  it('lee filas editadas a mano: etiquetas sin acentos y hora suelta', () => {
    const back = L.recordToEvent({
      Evento_ID: 'manual-1',
      Tipo_Evento: 'sueño',
      Fecha: '15/07/2026',
      Hora_Inicio: '10:00',
      Hora_Fin: '11:30',
      Duracion_Minutos: '',
      Subtipo: 'SIESTA',
      Cantidad: '',
      Unidad: '',
      Detalle_1: '',
      Detalle_2: '',
      Notas: '',
      Creado_Por: 'ana@example.com',
      Creado_En: '',
      Modificado_Por: '',
      Modificado_En: '',
      Eliminado: '',
    })
    expect(back.event).toMatchObject({
      type: 'sleep',
      subtype: 'siesta',
      start: '2026-07-15 10:00',
      end: '2026-07-15 11:30',
      durationMin: 90,
    })
  })

  it('interpreta un fin de solo hora que cruza la medianoche', () => {
    const back = L.recordToEvent({
      Evento_ID: 'manual-2',
      Tipo_Evento: 'Sueño',
      Fecha: '2026-07-14',
      Hora_Inicio: '21:30',
      Hora_Fin: '07:00',
      Subtipo: 'Nocturno',
      Eliminado: '',
    })
    expect(back.event.end).toBe('2026-07-15 07:00')
    expect(back.event.durationMin).toBe(570)
  })

  it('reconoce las variantes de borrado lógico', () => {
    for (const v of ['TRUE', 'sí', 'Si', '1', true, 'x']) {
      expect(L.recordToEvent({ Evento_ID: 'a', Tipo_Evento: 'Baño', Fecha: '2026-07-15', Hora_Inicio: '10:00', Subtipo: 'Baño completo', Eliminado: v }).deleted).toBe(true)
    }
    expect(L.recordToEvent({ Evento_ID: 'a', Tipo_Evento: 'Baño', Fecha: '2026-07-15', Hora_Inicio: '10:00', Subtipo: 'Baño completo', Eliminado: '' }).deleted).toBe(false)
  })

  it('devuelve null para filas no interpretables', () => {
    expect(L.recordToEvent({ Tipo_Evento: 'Cosa rara', Hora_Inicio: '10:00' })).toBeNull()
    expect(L.recordToEvent({ Tipo_Evento: 'Sueño', Fecha: '', Hora_Inicio: '' })).toBeNull()
  })
})

describe('componentes de la toma', () => {
  it('parsea el desglose tolerando acentos, mayúsculas y separadores', () => {
    expect(L.parseComponents('PECHO 12 MIN; Extraida 30 ml, Fórmula 45 ml')).toMatchObject({
      breastMin: 12,
      expressedMl: 30,
      formulaMl: 45,
    })
    expect(L.parseComponents('pecho 15 min (Ambos)')).toMatchObject({
      breastMin: 15,
      breastSide: 'ambos',
    })
    expect(L.parseComponents('')).toBeNull()
    expect(L.parseComponents('cualquier cosa escrita a mano')).toBeNull()
  })

  it('deriva el subtipo y la etiqueta de Detalle_1 según los componentes', () => {
    const c = (p) => ({ ...L.emptyComponents(), ...p })
    expect(L.feedSubtypeFor(c({ formulaMl: 60 }))).toBe('biberon')
    expect(L.feedSubtypeFor(c({ breastMin: 15 }))).toBe('lactancia')
    expect(L.feedSubtypeFor(c({ breastMin: 15, formulaMl: 30 }))).toBe('mixta')
    expect(L.feedDetailLabel(c({ formulaMl: 60 }))).toBe('formula')
    expect(L.feedDetailLabel(c({ expressedMl: 60 }))).toBe('materna')
    expect(L.feedDetailLabel(c({ expressedMl: 20, formulaMl: 40 }))).toBe('mixta')
    expect(L.feedDetailLabel(c({ breastMin: 10, breastSide: 'izquierdo' }))).toBe('izquierdo')
  })

  it('no mezcla minutos de pecho con ml cuantificables', () => {
    const c = { ...L.emptyComponents(), breastMin: 40, expressedMl: 10, formulaMl: 20 }
    expect(L.quantifiableMl(c)).toBe(30)
  })
})

describe('compatibilidad con registros de la v1', () => {
  const row = (partial) => ({
    Evento_ID: 'v1',
    Tipo_Evento: 'Toma',
    Fecha: '2026-07-15',
    Hora_Inicio: '2026-07-15 09:00',
    Hora_Fin: '',
    Duracion_Minutos: '',
    Subtipo: 'Biberón',
    Cantidad: '',
    Unidad: '',
    Detalle_1: '',
    Detalle_2: '', // la v1 nunca escribía esta columna
    Notas: '',
    Eliminado: '',
    ...partial,
  })

  it('un biberón de fórmula se lee como componente de fórmula', () => {
    const e = L.recordToEvent(row({ Cantidad: '120', Detalle_1: 'Fórmula' })).event
    expect(e.components).toMatchObject({ formulaMl: 120, expressedMl: 0, breastMin: 0 })
    expect(e.quantityMl).toBe(120)
    expect(e.subtype).toBe('biberon')
  })

  it('un biberón de leche materna se lee como leche extraída', () => {
    const e = L.recordToEvent(row({ Cantidad: '90', Detalle_1: 'Materna' })).event
    expect(e.components).toMatchObject({ expressedMl: 90, formulaMl: 0 })
  })

  it('un biberón mixto conserva el total aunque se desconozca el reparto', () => {
    const e = L.recordToEvent(row({ Cantidad: '80', Detalle_1: 'Mixta' })).event
    expect(e.components).toMatchObject({ mixtaMl: 80, formulaMl: 0, expressedMl: 0 })
    expect(L.quantifiableMl(e.components)).toBe(80)
  })

  it('una lactancia antigua se lee como minutos de pecho', () => {
    const e = L.recordToEvent(
      row({
        Subtipo: 'Lactancia',
        Hora_Fin: '2026-07-15 09:25',
        Detalle_1: 'Izquierdo',
      })
    ).event
    expect(e.components).toMatchObject({ breastMin: 25, breastSide: 'izquierdo' })
    expect(e.subtype).toBe('lactancia')
    expect(e.quantityMl).toBeNull()
  })

  it('el desglose de Detalle_2 tiene prioridad sobre la lectura heredada', () => {
    const e = L.recordToEvent(
      row({ Cantidad: '120', Detalle_1: 'Fórmula', Detalle_2: 'extraída 45 ml · fórmula 15 ml' })
    ).event
    expect(e.components).toMatchObject({ expressedMl: 45, formulaMl: 15 })
    expect(e.quantityMl).toBe(60)
  })
})

describe('día de vida', () => {
  const BIRTH = '2026-08-05 09:17'

  it('cuenta periodos de 24 h desde la hora exacta de nacimiento', () => {
    expect(L.lifeDayNumber(BIRTH, '2026-08-05 09:17')).toBe(1)
    expect(L.lifeDayNumber(BIRTH, '2026-08-06 09:16')).toBe(1)
    expect(L.lifeDayNumber(BIRTH, '2026-08-06 09:17')).toBe(2)
    expect(L.lifeDayNumber(BIRTH, '2026-08-07 23:59')).toBe(3)
  })

  it('separa correctamente los eventos a ambos lados de la hora de nacimiento', () => {
    expect(L.lifeDayNumber(BIRTH, '2026-08-07 09:10')).toBe(2)
    expect(L.lifeDayNumber(BIRTH, '2026-08-07 09:20')).toBe(3)
  })

  it('devuelve 0 antes de nacer', () => {
    expect(L.lifeDayNumber(BIRTH, '2026-08-05 09:10')).toBe(0)
  })

  it('calcula el rango del día de vida', () => {
    expect(L.lifeDayRange(BIRTH, 3)).toEqual({
      start: '2026-08-07 09:17',
      end: '2026-08-08 09:17',
    })
  })

  it('suma los totales del día de vida y deja fuera lo que no le pertenece', () => {
    const range = L.lifeDayRange(BIRTH, 3)
    const mk = (start, partial) => ({ start, type: 'feed', subtype: 'biberon', ...partial })
    const events = [
      mk('2026-08-07 09:10', { components: { ...L.emptyComponents(), formulaMl: 999 } }), // día 2
      mk('2026-08-07 09:20', { components: { ...L.emptyComponents(), formulaMl: 60 } }),
      mk('2026-08-07 14:00', {
        components: { ...L.emptyComponents(), expressedMl: 40, breastMin: 15 },
      }),
      mk('2026-08-08 08:00', { components: { ...L.emptyComponents(), mixtaMl: 30 } }),
      { start: '2026-08-07 12:00', type: 'diaper', subtype: 'ambos' },
      { start: '2026-08-07 18:00', type: 'diaper', subtype: 'pipi' },
      { start: '2026-08-08 10:00', type: 'diaper', subtype: 'caca' }, // día 4
      { start: '2026-08-07 20:00', type: 'sleep', subtype: 'nocturno' },
    ]
    const t = L.lifeDayTotals(events, range.start, range.end)
    expect(t).toMatchObject({
      feeds: 3,
      formulaMl: 60,
      expressedMl: 40,
      mixtaMl: 30,
      breastMin: 15,
      pees: 2,
      poops: 1,
      diapers: 2,
    })
    // Leche cuantificable: fórmula + extraída + mixta, sin el pecho directo.
    expect(t.milkMl).toBe(130)
  })
})

describe('ajustes', () => {
  it('acepta nacimiento y objetivos válidos', () => {
    const s = L.normalizeSettings({
      birth: '2026-08-05 09:17',
      goals: { pees: 6, poops: 3, milkMl: 400 },
    })
    expect(s).toEqual({ birth: '2026-08-05 09:17', goals: { pees: 6, poops: 3, milkMl: 400 } })
  })

  it('sin nacimiento ni objetivos devuelve los valores neutros', () => {
    expect(L.normalizeSettings({})).toEqual(L.defaultSettings())
    expect(L.normalizeSettings(null)).toEqual(L.defaultSettings())
  })

  it('rechaza una fecha de nacimiento mal formada', () => {
    expect(() => L.normalizeSettings({ birth: '5 de agosto' })).toThrowError(/nacimiento/)
  })
})

describe('eventTouchesDay', () => {
  const now = '2026-07-15 12:00'

  it('incluye el sueño nocturno en el día en que termina', () => {
    const e = { type: 'sleep', start: '2026-07-14 21:30', end: '2026-07-15 07:00' }
    expect(L.eventTouchesDay(e, '2026-07-14', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-15', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-16', now)).toBe(false)
  })

  it('el sueño en curso toca desde su inicio hasta ahora', () => {
    const e = { type: 'sleep', start: '2026-07-14 22:00', end: null }
    expect(L.eventTouchesDay(e, '2026-07-15', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-13', now)).toBe(false)
  })

  it('un sueño olvidado no se arrastra por todos los días siguientes', () => {
    const olvidado = { type: 'sleep', start: '2026-07-10 22:00', end: null }
    const ahora = '2026-07-15 12:00'
    expect(L.eventTouchesDay(olvidado, '2026-07-10', ahora)).toBe(true)
    expect(L.eventTouchesDay(olvidado, '2026-07-11', ahora)).toBe(true) // hasta el tope
    expect(L.eventTouchesDay(olvidado, '2026-07-12', ahora)).toBe(false)
    expect(L.eventTouchesDay(olvidado, '2026-07-15', ahora)).toBe(false)
  })

  it('un evento puntual solo toca su día', () => {
    const e = { type: 'diaper', start: '2026-07-15 08:00', end: null }
    expect(L.eventTouchesDay(e, '2026-07-15', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-14', now)).toBe(false)
  })

  it('un sueño que termina exactamente a medianoche no aparece al día siguiente', () => {
    const e = { type: 'sleep', start: '2026-07-14 22:00', end: '2026-07-15 00:00' }
    expect(L.eventTouchesDay(e, '2026-07-15', now)).toBe(false)
    expect(L.eventTouchesDay(e, '2026-07-14', now)).toBe(true)
  })
})
