// Entorno de Apps Script simulado: una hoja de cálculo en memoria y los pocos
// servicios que usa el backend. Permite ejecutar Logic.js, Sheets.js, Setup.js
// y Main.js tal cual, sin tocarlos, y comprobar de extremo a extremo qué acaba
// escrito en cada pestaña.
//
// El reloj es fijo y se mueve a mano con setNow(), de modo que las pruebas no
// dependen de la hora a la que se ejecuten.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['Logic.js', 'Sheets.js', 'Setup.js', 'Main.js']

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet
    this.row = row
    this.column = column
    this.numRows = numRows
    this.numColumns = numColumns
  }

  getValues() {
    const out = []
    for (let r = 0; r < this.numRows; r++) {
      const row = []
      for (let c = 0; c < this.numColumns; c++) {
        row.push(this.sheet.cell(this.row + r, this.column + c))
      }
      out.push(row)
    }
    return out
  }

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.setCell(this.row + r, this.column + c, values[r][c])
      }
    }
    return this
  }

  setFontWeight() {
    return this
  }

  setNumberFormat(format) {
    this.sheet.formats.set(`${this.row}:${this.column}`, format)
    return this
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name
    this.values = [] // values[fila-1][columna-1]
    this.formats = new Map()
  }

  getName() {
    return this.name
  }

  cell(row, column) {
    const r = this.values[row - 1]
    const v = r ? r[column - 1] : ''
    return v === undefined ? '' : v
  }

  setCell(row, column, value) {
    while (this.values.length < row) this.values.push([])
    const r = this.values[row - 1]
    while (r.length < column) r.push('')
    r[column - 1] = value
  }

  getLastRow() {
    for (let r = this.values.length; r >= 1; r--) {
      if (this.values[r - 1].some((v) => v !== '' && v != null)) return r
    }
    return 0
  }

  getLastColumn() {
    let max = 0
    for (const row of this.values) {
      for (let c = row.length; c >= 1; c--) {
        if (row[c - 1] !== '' && row[c - 1] != null) {
          max = Math.max(max, c)
          break
        }
      }
    }
    return max
  }

  getRange(a, b, c, d) {
    // La notación A1 solo se usa para dar formato a una columna entera.
    if (typeof a === 'string') return new FakeRange(this, 1, 1, 0, 0)
    return new FakeRange(this, a, b, c ?? 1, d ?? 1)
  }

  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()))
  }

  appendRow(values) {
    const row = this.getLastRow() + 1
    for (let c = 0; c < values.length; c++) this.setCell(row, c + 1, values[c])
  }

  setFrozenRows() {}

  /** Filas como objetos {columna: valor}, para comprobar en los tests. */
  asObjects() {
    const header = this.getRange(1, 1, 1, Math.max(1, this.getLastColumn())).getValues()[0]
    const out = []
    for (let r = 2; r <= this.getLastRow(); r++) {
      const obj = {}
      header.forEach((name, i) => {
        if (name) obj[name] = this.cell(r, i + 1)
      })
      out.push(obj)
    }
    return out
  }
}

class FakeSpreadsheet {
  constructor(id, name) {
    this.id = id
    this.name = name
    this.sheets = [new FakeSheet('Hoja 1')]
  }

  getId() {
    return this.id
  }

  getUrl() {
    return `https://docs.google.com/spreadsheets/d/${this.id}`
  }

  getSheets() {
    return this.sheets
  }

  getSheetByName(name) {
    return this.sheets.find((s) => s.name === name) ?? null
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name)
    this.sheets.push(sheet)
    return sheet
  }

  deleteSheet(sheet) {
    this.sheets = this.sheets.filter((s) => s !== sheet)
  }

  setSpreadsheetTimeZone() {}
}

export function createBackend({ now = '2026-08-07 08:00', user = 'ana@example.com' } = {}) {
  const state = { now, uuid: 0, logs: [] }
  const properties = new Map()
  const spreadsheets = new Map()

  const stubs = {
    console,
    Logger: {
      log: (msg) => state.logs.push(String(msg)),
    },
    Utilities: {
      // El backend solo formatea "ahora"; el reloj lo controla la prueba.
      formatDate: (_date, _tz, format) =>
        format === 'HH:mm' ? state.now.slice(11, 16) : state.now,
      getUuid: () => `uuid-${++state.uuid}`,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (properties.has(k) ? properties.get(k) : null),
        setProperty: (k, v) => properties.set(k, v),
        deleteProperty: (k) => properties.delete(k),
        getKeys: () => [...properties.keys()],
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    SpreadsheetApp: {
      create: (name) => {
        const id = `ss-${spreadsheets.size + 1}`
        const ss = new FakeSpreadsheet(id, name)
        spreadsheets.set(id, ss)
        return ss
      },
      openById: (id) => {
        const ss = spreadsheets.get(id)
        if (!ss) throw new Error(`No existe la hoja ${id}`)
        return ss
      },
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => user }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({
        setMimeType() {
          return this
        },
        getContent: () => text,
      }),
    },
    UrlFetchApp: {
      fetch: () => {
        throw new Error('El login real no se simula: usa la sesión de prueba.')
      },
    },
  }

  const context = vm.createContext(stubs)
  for (const file of FILES) {
    vm.runInContext(readFileSync(join(DIR, file), 'utf8'), context, { filename: file })
  }

  const backend = {
    state,
    properties,
    setNow(dt) {
      state.now = dt
    },
    /** Ejecuta setup() y deja una sesión abierta lista para usar. */
    install() {
      backend.runSetup()
      properties.set(
        'sess:test-token',
        JSON.stringify({ email: user, exp: Date.now() + 86400000 })
      )
      return backend
    },
    /** Vuelve a ejecutar setup() sobre la misma hoja. */
    runSetup() {
      context.setup()
      return backend
    },
    spreadsheet() {
      return spreadsheets.get(properties.get('SPREADSHEET_ID'))
    },
    sheet(name) {
      return backend.spreadsheet().getSheetByName(name)
    },
    /** Llama a la API como lo haría el frontend. Devuelve `data` o lanza. */
    call(action, payload = {}) {
      const response = context.doPost({
        postData: { contents: JSON.stringify({ action, token: 'test-token', ...payload }) },
      })
      const body = JSON.parse(response.getContent())
      if (!body.ok) {
        const err = new Error(body.error.message)
        err.code = body.error.code
        throw err
      }
      return body.data
    },
  }
  return backend
}
