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

  it('el biberón exige cantidad válida y tipo de leche, y no lleva fin', () => {
    const e = L.normalizeAndValidate(
      input({
        type: 'feed',
        subtype: 'biberon',
        start: '2026-07-15 09:00',
        end: '2026-07-15 09:10',
        quantityMl: 120,
        detail: 'formula',
      }),
      NOW
    )
    expect(e.end).toBeNull()
    expect(e.quantityMl).toBe(120)

    expect(() =>
      L.normalizeAndValidate(
        input({ type: 'feed', subtype: 'biberon', end: null, quantityMl: 0, detail: 'formula' }),
        NOW
      )
    ).toThrowError(/1 y 1000 ml/)

    expect(() =>
      L.normalizeAndValidate(
        input({ type: 'feed', subtype: 'biberon', end: null, quantityMl: 120, detail: 'agua' }),
        NOW
      )
    ).toThrowError(/tipo de leche/)
  })

  it('la lactancia exige fin y pecho', () => {
    const e = L.normalizeAndValidate(
      input({
        type: 'feed',
        subtype: 'lactancia',
        start: '2026-07-15 09:00',
        end: '2026-07-15 09:25',
        detail: 'izquierdo',
      }),
      NOW
    )
    expect(e.durationMin).toBe(25)

    expect(() =>
      L.normalizeAndValidate(
        input({ type: 'feed', subtype: 'lactancia', end: null, detail: 'izquierdo' }),
        NOW
      )
    ).toThrowError(/fin o duración/)
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
  it('hace la ida y vuelta sin perder información', () => {
    const event = L.normalizeAndValidate(
      input({
        type: 'feed',
        subtype: 'biberon',
        start: '2026-07-15 09:00',
        end: null,
        quantityMl: 150,
        detail: 'mixta',
        notes: 'con ayuda',
      }),
      NOW
    )
    event.createdBy = 'ana@example.com'
    event.createdAt = '2026-07-15 09:01'
    const rec = L.eventToRecord(event, false)
    expect(rec.Tipo_Evento).toBe('Toma')
    expect(rec.Subtipo).toBe('Biberón')
    expect(rec.Fecha).toBe('2026-07-15')
    expect(rec.Unidad).toBe('ml')

    const back = L.recordToEvent(rec)
    expect(back.deleted).toBe(false)
    expect(back.event).toMatchObject({
      id: 'uuid-1',
      type: 'feed',
      subtype: 'biberon',
      start: '2026-07-15 09:00',
      quantityMl: 150,
      detail: 'mixta',
      notes: 'con ayuda',
      createdBy: 'ana@example.com',
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

describe('eventTouchesDay', () => {
  const now = '2026-07-15 12:00'

  it('incluye el sueño nocturno en el día en que termina', () => {
    const e = { type: 'sleep', start: '2026-07-14 21:30', end: '2026-07-15 07:00' }
    expect(L.eventTouchesDay(e, '2026-07-14', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-15', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-16', now)).toBe(false)
  })

  it('el sueño activo toca desde su inicio hasta hoy', () => {
    const e = { type: 'sleep', start: '2026-07-14 22:00', end: null }
    expect(L.eventTouchesDay(e, '2026-07-15', now)).toBe(true)
    expect(L.eventTouchesDay(e, '2026-07-13', now)).toBe(false)
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
