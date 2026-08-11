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

/** Una toma con los elementos indicados. */
const feed = (items, p = {}) => ({ id: 'uuid-2', type: 'feed', items, notes: '', ...p })

const tetada = (start, end, side, id) => ({ id: id ?? `t-${start}`, kind: 'pecho', start, end, side })
const bibe = (start, ml, kind, id) => ({ id: id ?? `b-${start}`, kind: kind ?? 'formula', start, ml })

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
    expect(sheets).toEqual(['Sueno', 'Tomas', 'Panales', 'Banos', 'Peso'])
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

  it('la toma guarda una fila por elemento, unidas por Toma_ID', () => {
    expect(L.RECORD_TYPES.feed.grouped).toBe(true)
    const cols = L.columnsFor('feed')
    expect(cols).toEqual(
      expect.arrayContaining(['Toma_ID', 'Tipo', 'Pecho_Lado', 'Cantidad_Ml', 'Duracion_Min'])
    )
    // Las columnas del modelo anterior se siguen leyendo, pero ya no se crean.
    for (const vieja of L.legacyColumnsFor('feed')) expect(cols).not.toContain(vieja)
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
  it('una toma son sus elementos, cada uno con su hora', () => {
    const r = L.normalizeAndValidate(
      feed([
        tetada('2026-08-07 11:42', '2026-08-07 11:53', 'izquierdo'),
        tetada('2026-08-07 12:03', '2026-08-07 12:13', 'derecho'),
        bibe('2026-08-07 12:20', 60),
      ]),
      NOW
    )
    // El intervalo de la toma sale de sus elementos, del primero al último.
    expect(r.start).toBe('2026-08-07 11:42')
    expect(r.end).toBe('2026-08-07 12:20')
    expect(r.durationMin).toBe(38)
    // Los minutos de pecho son los de las tetadas, no los del intervalo.
    expect(r.breastMin).toBe(21)
    expect(r.breastSide).toBe('ambos')
    expect(r.formulaMl).toBe(60)
    expect(r.items).toHaveLength(3)
  })

  it('un biberón solo es puntual', () => {
    const r = L.normalizeAndValidate(feed([bibe('2026-08-07 13:13', 60)]), NOW)
    expect(r.start).toBe('2026-08-07 13:13')
    expect(r.end).toBe('2026-08-07 13:13')
    expect(r.durationMin).toBe(0)
  })

  it('los elementos se ordenan por hora aunque lleguen desordenados', () => {
    const r = L.normalizeAndValidate(
      feed([
        bibe('2026-08-07 12:20', 60),
        tetada('2026-08-07 11:42', '2026-08-07 11:53', 'izquierdo'),
      ]),
      NOW
    )
    expect(r.items.map((i) => i.start)).toEqual(['2026-08-07 11:42', '2026-08-07 12:20'])
  })

  it('repetir el mismo pecho suma sin volverlo "ambos"', () => {
    const r = L.normalizeAndValidate(
      feed([
        tetada('2026-08-07 11:42', '2026-08-07 11:53', 'izquierdo'),
        tetada('2026-08-07 12:30', '2026-08-07 12:38', 'izquierdo'),
      ]),
      NOW
    )
    expect(r.breastMin).toBe(19)
    expect(r.breastSide).toBe('izquierdo')
  })

  it('una tetada sin anotar deja la toma como "no recuerdo"', () => {
    const r = L.normalizeAndValidate(
      feed([
        tetada('2026-08-07 03:00', '2026-08-07 03:20', 'izquierdo'),
        tetada('2026-08-07 04:00', '2026-08-07 04:10'),
      ]),
      NOW
    )
    expect(r.breastSide).toBe('desconocido')
  })

  it('exige al menos un elemento', () => {
    expect(() => L.normalizeAndValidate(feed([]), NOW)).toThrow(/al menos una tetada/)
  })

  it('la tetada necesita hora de fin y el biberón cantidad', () => {
    expect(() =>
      L.normalizeAndValidate(feed([{ id: 'x', kind: 'pecho', start: '2026-08-07 11:42' }]), NOW)
    ).toThrow(/hora de fin/)
    expect(() => L.normalizeAndValidate(feed([bibe('2026-08-07 12:00', 0)]), NOW)).toThrow(
      /mayor que cero/
    )
  })

  it('rechaza elementos en el futuro o al revés', () => {
    expect(() =>
      L.normalizeAndValidate(feed([bibe('2026-08-07 18:00', 60)]), NOW)
    ).toThrow(/futuro/)
    expect(() =>
      L.normalizeAndValidate(feed([tetada('2026-08-07 12:00', '2026-08-07 11:50', 'izquierdo')]), NOW)
    ).toThrow(/posterior al inicio/)
  })
})

describe('lo que cuenta como toma y como caca', () => {
  const toma = (p) => ({ type: 'feed', breastMin: 0, expressedMl: 0, formulaMl: 0, ...p })
  const panal = (p) => ({ type: 'diaper', poop: true, consistency: null, ...p })

  it('un ratito al pecho es hidratación; a partir de cinco minutos, toma', () => {
    expect(L.isHydration(toma({ breastMin: 2 }))).toBe(true)
    expect(L.isHydration(toma({ breastMin: 4 }))).toBe(true)
    expect(L.isHydration(toma({ breastMin: 5 }))).toBe(false)
    expect(L.isHydration(toma({ breastMin: 20 }))).toBe(false)
  })

  it('un biberón es toma aunque dure cero: lo que come es la cantidad', () => {
    expect(L.isHydration(toma({ formulaMl: 60 }))).toBe(false)
    expect(L.isHydration(toma({ breastMin: 2, expressedMl: 30 }))).toBe(false)
    // Y una toma sin nada anotado no se esconde en hidratación.
    expect(L.isHydration(toma({}))).toBe(false)
  })

  it('el pedete no es una caca, pero sin anotar la consistencia sí lo es', () => {
    expect(L.isRealPoop(panal({ consistency: 'pedete' }))).toBe(false)
    expect(L.isRealPoop(panal({ consistency: 'liquida' }))).toBe(true)
    expect(L.isRealPoop(panal({}))).toBe(true)
    expect(L.isRealPoop(panal({ poop: false }))).toBe(false)
  })

  it('los totales del día separan las dos cosas', () => {
    const t = L.lifeDayTotals(
      [
        { type: 'feed', start: '2026-08-07 10:00', breastMin: 20, expressedMl: 0, formulaMl: 0 },
        { type: 'feed', start: '2026-08-07 12:00', breastMin: 3, expressedMl: 0, formulaMl: 0 },
        { type: 'diaper', start: '2026-08-07 11:00', pee: true, poop: true, consistency: 'pastosa' },
        { type: 'diaper', start: '2026-08-07 13:00', pee: false, poop: true, consistency: 'pedete' },
      ],
      '2026-08-07 00:00',
      '2026-08-08 00:00'
    )
    expect(t).toMatchObject({ feeds: 1, hydrations: 1, poops: 1, pedetes: 1, diapers: 2 })
    // Y los minutos de pecho se suman todos: se ha tomado, aunque fuera un rato.
    expect(t.breastMin).toBe(23)
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

  it('conserva la consistencia cuando hay caca, incluido el pedete', () => {
    expect(L.normalizeAndValidate(diaper({ poop: true, consistency: 'pastosa' }), NOW).consistency).toBe('pastosa')
    expect(L.normalizeAndValidate(diaper({ poop: true, consistency: 'pedete' }), NOW).consistency).toBe('pedete')
  })

  it('el pis lleva su propia cantidad', () => {
    const r = L.normalizeAndValidate(diaper({ pee: true, peeAmount: 'mucho' }), NOW)
    expect(r.peeAmount).toBe('mucho')
    expect(() => L.normalizeAndValidate(diaper({ pee: true, peeAmount: 'enorme' }), NOW)).toThrow(
      /Pis_Cantidad/
    )
  })

  it('descarta la cantidad de pis si no hubo pis', () => {
    const r = L.normalizeAndValidate(diaper({ poop: true, peeAmount: 'mucho' }), NOW)
    expect(r.peeAmount).toBeNull()
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

describe('normalizeAndValidate · peso', () => {
  const weight = (p = {}) => ({
    id: 'uuid-5',
    type: 'weight',
    start: '2026-08-07 12:00',
    grams: 3420,
    notes: '',
    ...p,
  })

  it('guarda el peso en gramos', () => {
    expect(L.normalizeAndValidate(weight(), NOW).grams).toBe(3420)
  })

  it('exige un peso mayor que cero', () => {
    expect(() => L.normalizeAndValidate(weight({ grams: 0 }), NOW)).toThrow(/Gramos/)
    expect(() => L.normalizeAndValidate(weight({ grams: null }), NOW)).toThrow(/Gramos/)
  })

  it('rechaza pesos imposibles', () => {
    expect(() => L.normalizeAndValidate(weight({ grams: 90000 }), NOW)).toThrow(/Gramos/)
  })

  it('es un registro puntual: va a la columna Hora', () => {
    expect(L.columnsFor('weight')).toContain('Hora')
    expect(L.columnsFor('weight')).toContain('Gramos')
    expect(L.columnsFor('weight')).not.toContain('Hora_Inicio')
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

  it('la toma se guarda en una fila por elemento y vuelve entera', () => {
    const record = withAudit(
      L.normalizeAndValidate(
        feed(
          [
            tetada('2026-08-07 11:42', '2026-08-07 11:53', 'izquierdo', 'i1'),
            tetada('2026-08-07 12:03', '2026-08-07 12:13', 'derecho', 'i2'),
            bibe('2026-08-07 12:20', 60, 'formula', 'i3'),
          ],
          { notes: 'con ayuda' }
        ),
        NOW
      )
    )
    const rows = L.feedToRows(record, false)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      ID: 'i1',
      Toma_ID: 'uuid-2',
      Hora_Inicio: '2026-08-07 11:42',
      Hora_Fin: '2026-08-07 11:53',
      Duracion_Min: 11,
      Tipo: 'Pecho',
      Pecho_Lado: 'Izquierdo',
      Notas: 'con ayuda',
    })
    expect(rows[2]).toMatchObject({ ID: 'i3', Tipo: 'Fórmula', Cantidad_Ml: 60, Hora_Fin: '' })

    // Y al leerlas vuelven a ser una sola toma.
    const parsed = rows.map((r) => L.rowToFeedItems(r))
    const [{ record: vuelta }] = L.groupFeedRows(parsed)
    expect(vuelta).toMatchObject({
      id: 'uuid-2',
      start: '2026-08-07 11:42',
      end: '2026-08-07 12:20',
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
      notes: 'con ayuda',
    })
    expect(vuelta.items).toHaveLength(3)
  })

  it('lee una toma guardada con el modelo anterior, de una sola fila', () => {
    const antigua = {
      ID: 'vieja-1',
      Fecha: '2026-08-07',
      Hora_Inicio: '2026-08-07 11:42',
      Hora_Fin: '2026-08-07 12:13',
      Pecho_Min: '21',
      Pecho_Lado: 'Ambos',
      Formula_Ml: '60',
      Notas: 'de antes',
      Eliminado: '',
    }
    const [{ record }] = L.groupFeedRows([L.rowToFeedItems(antigua)])
    expect(record).toMatchObject({
      id: 'vieja-1',
      start: '2026-08-07 11:42',
      // El intervalo guardado manda: la toma duró más que sus elementos.
      end: '2026-08-07 12:13',
      breastMin: 21,
      breastSide: 'ambos',
      formulaMl: 60,
    })
    expect(record.items).toHaveLength(2)
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

  it('recalcula la duración de la toma aunque la celda diga otra cosa', () => {
    const [{ record }] = L.groupFeedRows([
      L.rowToFeedItems({
        ID: 'manual-3',
        Toma_ID: 'manual-3',
        Fecha: '2026-08-07',
        Hora_Inicio: '10:00',
        Hora_Fin: '10:20',
        Duracion_Min: '999',
        Tipo: 'Pecho',
        Pecho_Lado: 'Izquierdo',
        Eliminado: '',
      }),
    ])
    expect(record.durationMin).toBe(20)
    expect(record.breastMin).toBe(20)
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
    const settings = L.normalizeSettings({ birth: '2026-08-05 09:17', birthWeightG: 3420 })
    const row = L.settingsToBabyRow(settings)
    expect(row).toEqual({
      Fecha_Nacimiento: '2026-08-05',
      Hora_Nacimiento: '09:17',
      Peso_Nacimiento_G: 3420,
    })
    expect(L.babyRowToSettings(row)).toEqual(settings)
  })

  it('rechaza un peso al nacer imposible', () => {
    expect(() => L.normalizeSettings({ birthWeightG: 90000 })).toThrow(/peso al nacer/)
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
