// Tests de la lógica pura del backend (Logic.js se ejecuta tal cual en Node).
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const L = require('../Logic.js')

const NOW = '2026-08-07 16:00'

const sleep = (p = {}) => ({
  id: 'uuid-1',
  type: 'sleep',
  start: '2026-08-07 11:37',
  end: '2026-08-07 12:54',
  kind: 'siesta',
  notes: '',
  ...p,
})

const feed = (p = {}) => ({
  id: 'uuid-2',
  type: 'feed',
  start: '2026-08-07 10:13',
  end: '2026-08-07 10:31',
  breastMin: 0,
  breastSide: null,
  expressedMl: 0,
  formulaMl: 0,
  notes: '',
  ...p,
})

const diaper = (p = {}) => ({
  id: 'uuid-3',
  type: 'diaper',
  start: '2026-08-07 14:08',
  pee: false,
  poop: false,
  consistency: null,
  notes: '',
  ...p,
})

const bath = (p = {}) => ({
  id: 'uuid-4',
  type: 'bath',
  start: '2026-08-07 15:00',
  kind: 'completo',
  durationMin: 0,
  notes: '',
  ...p,
})

// ---------------------------------------------------------------------------

describe('declaración de tipos', () => {
  it('cada tipo tiene su propia pestaña', () => {
    const sheets = L.recordTypeNames().map((t) => L.RECORD_TYPES[t].sheet)
    expect(sheets).toEqual(['Sueno', 'Tomas', 'Panales', 'Banos'])
    expect(new Set(sheets).size).toBe(sheets.length)
  })

  it('las columnas se derivan del esquema, sin repetirse', () => {
    for (const type of L.recordTypeNames()) {
      const cols = L.columnsFor(type)
      expect(new Set(cols).size).toBe(cols.length)
      // Comunes en todas las pestañas, con el mismo nombre.
      expect(cols).toContain('ID')
      expect(cols).toContain('Fecha')
      expect(cols).toContain('Notas')
      for (const audit of L.AUDIT_COLUMNS) expect(cols).toContain(audit)
    }
  })

  it('los tipos con intervalo llevan inicio, fin y duración; los puntuales, hora', () => {
    expect(L.columnsFor('sleep')).toEqual(
      expect.arrayContaining(['Hora_Inicio', 'Hora_Fin', 'Duracion_Min'])
    )
    expect(L.columnsFor('diaper')).toContain('Hora')
    expect(L.columnsFor('diaper')).not.toContain('Hora_Inicio')
    expect(L.startColumnOf('feed')).toBe('Hora_Inicio')
    expect(L.startColumnOf('bath')).toBe('Hora')
  })

  it('la toma tiene una columna por magnitud', () => {
    const cols = L.columnsFor('feed')
    expect(cols).toEqual(
      expect.arrayContaining(['Pecho_Min', 'Pecho_Lado', 'Extraida_Ml', 'Formula_Ml'])
    )
  })
})

describe('normalizeAndValidate · sueño', () => {
  it('acepta un sueño cerrado y deriva la duración', () => {
    const r = L.normalizeAndValidate(sleep(), NOW)
    expect(r.durationMin).toBe(77)
    expect(r.kind).toBe('siesta')
  })

  it('acepta un sueño sin cerrar', () => {
    const r = L.normalizeAndValidate(sleep({ end: null }), NOW)
    expect(r.end).toBeNull()
    expect(r.durationMin).toBeNull()
  })

  it('rechaza un fin anterior o igual al inicio', () => {
    expect(() => L.normalizeAndValidate(sleep({ end: '2026-08-07 11:00' }), NOW)).toThrow(
      /posterior al inicio/
    )
    expect(() => L.normalizeAndValidate(sleep({ end: sleep().start }), NOW)).toThrow(
      /posterior al inicio/
    )
  })

  it('rechaza horas futuras y duraciones de más de 24 h', () => {
    expect(() => L.normalizeAndValidate(sleep({ start: '2026-08-07 18:00' }), NOW)).toThrow(/futuro/)
    expect(() =>
      L.normalizeAndValidate(sleep({ start: '2026-08-05 10:00', end: '2026-08-06 11:00' }), NOW)
    ).toThrow(/24 horas/)
  })

  it('exige el tipo de sueño', () => {
    expect(() => L.normalizeAndValidate(sleep({ kind: null }), NOW)).toThrow(/Falta Tipo/)
    expect(() => L.normalizeAndValidate(sleep({ kind: 'profundo' }), NOW)).toThrow(/Tipo/)
  })
})

describe('normalizeAndValidate · toma', () => {
  it('guarda inicio y fin reales con precisión de un minuto', () => {
    const r = L.normalizeAndValidate(feed({ formulaMl: 63 }), NOW)
    expect(r.start).toBe('2026-08-07 10:13')
    expect(r.end).toBe('2026-08-07 10:31')
    expect(r.durationMin).toBe(18)
    expect(r.formulaMl).toBe(63)
  })

  it('admite varios componentes a la vez sin mezclarlos', () => {
    const r = L.normalizeAndValidate(
      feed({ start: '2026-08-07 15:00', end: '2026-08-07 15:30', breastMin: 17, expressedMl: 28, formulaMl: 37 }),
      NOW
    )
    expect(r.breastMin).toBe(17)
    expect(r.expressedMl).toBe(28)
    expect(r.formulaMl).toBe(37)
    // Sin conversión de minutos a mililitros en ningún sitio.
    expect(r.formulaMl + r.expressedMl).toBe(65)
  })

  it('admite una toma puntual (inicio igual que fin)', () => {
    const r = L.normalizeAndValidate(
      feed({ end: feed().start, formulaMl: 60 }),
      NOW
    )
    expect(r.durationMin).toBe(0)
  })

  it('exige hora de fin', () => {
    expect(() => L.normalizeAndValidate(feed({ end: null, formulaMl: 60 }), NOW)).toThrow(/fin/)
  })

  it('exige al menos un componente', () => {
    expect(() => L.normalizeAndValidate(feed(), NOW)).toThrow(/al menos un componente/)
  })

  it('rechaza cantidades fuera de rango', () => {
    expect(() => L.normalizeAndValidate(feed({ formulaMl: 2000 }), NOW)).toThrow(/Formula_Ml/)
    expect(() => L.normalizeAndValidate(feed({ expressedMl: -5 }), NOW)).toThrow(/Extraida_Ml/)
  })

  it('no admite más minutos de pecho que duración de la toma', () => {
    expect(() =>
      L.normalizeAndValidate(feed({ start: '2026-08-07 15:00', end: '2026-08-07 15:10', breastMin: 90 }), NOW)
    ).toThrow(/superar la duración/)
  })

  it('descarta el lado si no hay pecho', () => {
    const r = L.normalizeAndValidate(feed({ formulaMl: 60, breastSide: 'izquierdo' }), NOW)
    expect(r.breastSide).toBeNull()
  })
})

describe('normalizeAndValidate · pañal y baño', () => {
  it('el pañal registra pis y caca por separado', () => {
    const r = L.normalizeAndValidate(diaper({ pee: true, poop: true }), NOW)
    expect(r.pee).toBe(true)
    expect(r.poop).toBe(true)
  })

  it('exige que el pañal lleve algo', () => {
    expect(() => L.normalizeAndValidate(diaper(), NOW)).toThrow(/pis, caca/)
  })

  it('descarta la consistencia si no hay caca', () => {
    const r = L.normalizeAndValidate(diaper({ pee: true, consistency: 'liquida' }), NOW)
    expect(r.consistency).toBeNull()
  })

  it('conserva la consistencia cuando hay caca', () => {
    const r = L.normalizeAndValidate(diaper({ poop: true, consistency: 'pastosa' }), NOW)
    expect(r.consistency).toBe('pastosa')
  })

  it('valida la duración opcional del baño', () => {
    expect(L.normalizeAndValidate(bath({ durationMin: 15 }), NOW).durationMin).toBe(15)
    expect(L.normalizeAndValidate(bath(), NOW).durationMin).toBe(0)
    expect(() => L.normalizeAndValidate(bath({ durationMin: 500 }), NOW)).toThrow(/Duracion_Min/)
  })

  it('recorta las notas y rechaza ids vacíos', () => {
    expect(L.normalizeAndValidate(bath({ notes: '  hola  ' }), NOW).notes).toBe('hola')
    expect(() => L.normalizeAndValidate(bath({ id: '  ' }), NOW)).toThrow(/Identificador/)
  })
})

describe('recordToRow / rowToRecord', () => {
  const withAudit = (r) => ({
    ...r,
    createdBy: 'ana@example.com',
    createdAt: '2026-08-07 16:00',
    updatedBy: null,
    updatedAt: null,
  })

  it('la toma va y vuelve con cada magnitud en su columna', () => {
    const record = withAudit(
      L.normalizeAndValidate(
        feed({
          start: '2026-08-07 09:00',
          end: '2026-08-07 09:29',
          breastMin: 10,
          breastSide: 'derecho',
          expressedMl: 25,
          formulaMl: 15,
          notes: 'con ayuda',
        }),
        NOW
      )
    )
    const row = L.recordToRow(record, false)
    expect(row).toMatchObject({
      ID: 'uuid-2',
      Fecha: '2026-08-07',
      Hora_Inicio: '2026-08-07 09:00',
      Hora_Fin: '2026-08-07 09:29',
      Duracion_Min: 29,
      Pecho_Min: 10,
      Pecho_Lado: 'Derecho',
      Extraida_Ml: 25,
      Formula_Ml: 15,
      Notas: 'con ayuda',
      Eliminado: '',
    })

    const back = L.rowToRecord('feed', row)
    expect(back.deleted).toBe(false)
    expect(back.record).toMatchObject({
      id: 'uuid-2',
      type: 'feed',
      start: '2026-08-07 09:00',
      end: '2026-08-07 09:29',
      durationMin: 29,
      breastMin: 10,
      breastSide: 'derecho',
      expressedMl: 25,
      formulaMl: 15,
      createdBy: 'ana@example.com',
    })
  })

  it('el pañal escribe booleanos legibles', () => {
    const row = L.recordToRow(
      withAudit(L.normalizeAndValidate(diaper({ pee: true, poop: true, consistency: 'liquida' }), NOW)),
      false
    )
    expect(row).toMatchObject({ Hora: '2026-08-07 14:08', Pis: 'TRUE', Caca: 'TRUE', Consistencia: 'Líquida' })
    expect(row.Hora_Inicio).toBeUndefined()

    const back = L.rowToRecord('diaper', row).record
    expect(back).toMatchObject({ pee: true, poop: true, consistency: 'liquida' })
  })

  it('un pañal solo de pis deja la casilla de caca vacía', () => {
    const row = L.recordToRow(withAudit(L.normalizeAndValidate(diaper({ pee: true }), NOW)), false)
    expect(row.Pis).toBe('TRUE')
    expect(row.Caca).toBe('')
    expect(L.rowToRecord('diaper', row).record.poop).toBe(false)
  })

  it('marca el borrado lógico y reconoce sus variantes', () => {
    const record = withAudit(L.normalizeAndValidate(bath(), NOW))
    expect(L.recordToRow(record, true).Eliminado).toBe('TRUE')
    for (const v of ['TRUE', 'sí', 'Si', '1', true, 'x']) {
      const row = { ...L.recordToRow(record, false), Eliminado: v }
      expect(L.rowToRecord('bath', row).deleted).toBe(true)
    }
  })

  it('devuelve null para filas sin identificador o sin hora', () => {
    expect(L.rowToRecord('bath', { ID: '', Hora: '2026-08-07 19:00' })).toBeNull()
    expect(L.rowToRecord('bath', { ID: 'x', Hora: '', Fecha: '' })).toBeNull()
  })
})

describe('lectura tolerante de ediciones manuales', () => {
  it('acepta etiquetas sin acentos, en mayúsculas y fechas con barras', () => {
    const back = L.rowToRecord('sleep', {
      ID: 'manual-1',
      Fecha: '07/08/2026',
      Hora_Inicio: '10:00',
      Hora_Fin: '11:30',
      Duracion_Min: '',
      Tipo: 'SIESTA',
      Notas: '',
      Eliminado: '',
    })
    expect(back.record).toMatchObject({
      start: '2026-08-07 10:00',
      end: '2026-08-07 11:30',
      durationMin: 90,
      kind: 'siesta',
    })
  })

  it('interpreta un fin de solo hora que cruza la medianoche', () => {
    const back = L.rowToRecord('sleep', {
      ID: 'manual-2',
      Fecha: '2026-08-07',
      Hora_Inicio: '21:30',
      Hora_Fin: '07:00',
      Tipo: 'Nocturno',
      Eliminado: '',
    })
    expect(back.record.end).toBe('2026-08-08 07:00')
    expect(back.record.durationMin).toBe(570)
  })

  it('recalcula la duración aunque la celda diga otra cosa', () => {
    const back = L.rowToRecord('feed', {
      ID: 'manual-3',
      Fecha: '2026-08-07',
      Hora_Inicio: '10:00',
      Hora_Fin: '10:20',
      Duracion_Min: '999',
      Formula_Ml: '60',
      Eliminado: '',
    })
    expect(back.record.durationMin).toBe(20)
    expect(back.record.formulaMl).toBe(60)
  })

  it('una casilla de pañal marcada a mano con una equis cuenta', () => {
    const back = L.rowToRecord('diaper', {
      ID: 'manual-4',
      Fecha: '2026-08-07',
      Hora: '14:08',
      Pis: 'x',
      Caca: '',
      Eliminado: '',
    })
    expect(back.record.pee).toBe(true)
    expect(back.record.poop).toBe(false)
  })
})

describe('recordTouchesDay', () => {
  const now = '2026-08-07 12:00'

  it('incluye el sueño nocturno en el día en que termina', () => {
    const r = { type: 'sleep', start: '2026-08-06 21:30', end: '2026-08-07 07:00' }
    expect(L.recordTouchesDay(r, '2026-08-06', now)).toBe(true)
    expect(L.recordTouchesDay(r, '2026-08-07', now)).toBe(true)
    expect(L.recordTouchesDay(r, '2026-08-08', now)).toBe(false)
  })

  it('un registro puntual solo toca su día', () => {
    const r = { type: 'diaper', start: '2026-08-07 08:00' }
    expect(L.recordTouchesDay(r, '2026-08-07', now)).toBe(true)
    expect(L.recordTouchesDay(r, '2026-08-06', now)).toBe(false)
  })

  it('un sueño que termina a medianoche no aparece al día siguiente', () => {
    const r = { type: 'sleep', start: '2026-08-06 22:00', end: '2026-08-07 00:00' }
    expect(L.recordTouchesDay(r, '2026-08-07', now)).toBe(false)
    expect(L.recordTouchesDay(r, '2026-08-06', now)).toBe(true)
  })

  it('un sueño olvidado no se arrastra por todos los días siguientes', () => {
    const olvidado = { type: 'sleep', start: '2026-08-02 22:00', end: null }
    expect(L.recordTouchesDay(olvidado, '2026-08-02', now)).toBe(true)
    expect(L.recordTouchesDay(olvidado, '2026-08-03', now)).toBe(true) // hasta el tope
    expect(L.recordTouchesDay(olvidado, '2026-08-04', now)).toBe(false)
    expect(L.recordTouchesDay(olvidado, '2026-08-07', now)).toBe(false)
  })
})

describe('día de vida', () => {
  const BIRTH = '2026-08-05 09:17'

  it('cuenta periodos de 24 h desde la hora exacta de nacimiento', () => {
    expect(L.lifeDayNumber(BIRTH, '2026-08-05 09:17')).toBe(1)
    expect(L.lifeDayNumber(BIRTH, '2026-08-06 09:16')).toBe(1)
    expect(L.lifeDayNumber(BIRTH, '2026-08-06 09:17')).toBe(2)
  })

  it('separa los registros a ambos lados de la hora de nacimiento', () => {
    expect(L.lifeDayNumber(BIRTH, '2026-08-07 09:10')).toBe(2)
    expect(L.lifeDayNumber(BIRTH, '2026-08-07 09:20')).toBe(3)
  })

  it('devuelve 0 antes de nacer y calcula el rango', () => {
    expect(L.lifeDayNumber(BIRTH, '2026-08-05 09:10')).toBe(0)
    expect(L.lifeDayRange(BIRTH, 3)).toEqual({
      start: '2026-08-07 09:17',
      end: '2026-08-08 09:17',
    })
  })

  it('suma los totales del periodo y deja fuera lo demás', () => {
    const range = L.lifeDayRange(BIRTH, 3)
    const records = [
      { type: 'feed', start: '2026-08-07 09:10', formulaMl: 999 }, // día 2
      { type: 'feed', start: '2026-08-07 09:20', formulaMl: 60 },
      { type: 'feed', start: '2026-08-07 14:00', expressedMl: 40, breastMin: 15 },
      { type: 'feed', start: '2026-08-08 09:17', formulaMl: 999 }, // día 4
      { type: 'diaper', start: '2026-08-07 12:00', pee: true, poop: true },
      { type: 'diaper', start: '2026-08-07 18:00', pee: true },
      { type: 'sleep', start: '2026-08-07 20:00' },
    ]
    const t = L.lifeDayTotals(records, range.start, range.end)
    expect(t).toMatchObject({
      feeds: 2,
      formulaMl: 60,
      expressedMl: 40,
      breastMin: 15,
      pees: 2,
      poops: 1,
      diapers: 2,
    })
    // Leche cuantificable: fórmula + extraída, sin el pecho directo.
    expect(t.milkMl).toBe(100)
  })
})

describe('ajustes en la pestaña Bebe', () => {
  it('va y vuelve entre ajustes y fila', () => {
    const settings = L.normalizeSettings({
      birth: '2026-08-05 09:17',
      goals: { pees: 6, poops: 3, milkMl: 400 },
    })
    const row = L.settingsToBabyRow(settings)
    expect(row).toEqual({
      Fecha_Nacimiento: '2026-08-05',
      Hora_Nacimiento: '09:17',
      Objetivo_Pises: 6,
      Objetivo_Cacas: 3,
      Objetivo_Leche_Ml: 400,
    })
    expect(L.babyRowToSettings(row)).toEqual(settings)
  })

  it('una pestaña vacía da los valores neutros', () => {
    expect(L.babyRowToSettings(null)).toEqual(L.defaultSettings())
    expect(L.babyRowToSettings({})).toEqual(L.defaultSettings())
  })

  it('acepta el nacimiento escrito a mano con la fecha en otro formato', () => {
    const s = L.babyRowToSettings({ Fecha_Nacimiento: '05/08/2026', Hora_Nacimiento: '9:17' })
    expect(s.birth).toBe('2026-08-05 09:17')
  })

  it('rechaza una fecha de nacimiento mal formada', () => {
    expect(() => L.normalizeSettings({ birth: '5 de agosto' })).toThrow(/nacimiento/)
  })
})
