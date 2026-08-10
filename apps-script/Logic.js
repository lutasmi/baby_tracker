/**
 * Baby Tracker — lógica pura del backend.
 *
 * El modelo de datos es **una pestaña por tipo de registro**. Cada tipo declara
 * aquí su pestaña, sus columnas y sus reglas; el resto del backend es genérico
 * y trabaja a partir de esa declaración. Añadir un campo a un tipo es añadir un
 * descriptor, y añadir un tipo nuevo es añadir una entrada a RECORD_TYPES más
 * su formulario en el frontend.
 *
 * Este archivo no usa ningún servicio de Apps Script: puede ejecutarse en Node
 * tal cual, y así lo prueban los tests (test/logic.test.mjs).
 */

// ---------------------------------------------------------------------------
// Columnas comunes
// ---------------------------------------------------------------------------

/** Presentes en todas las pestañas de registros, con el mismo nombre. */
var COMMON_COLUMNS = ['ID', 'Fecha'];
var NOTES_COLUMN = 'Notas';
var AUDIT_COLUMNS = ['Creado_Por', 'Creado_En', 'Modificado_Por', 'Modificado_En', 'Eliminado'];

/** Columnas del intervalo, solo en los tipos que duran un rato. */
var INTERVAL_COLUMNS = ['Hora_Inicio', 'Hora_Fin', 'Duracion_Min'];
/** Columna del instante, en los tipos puntuales. */
var MOMENT_COLUMN = 'Hora';

var SHEET_USERS = 'Usuarios';
var SHEET_BABY = 'Bebe';

var USER_COLUMNS = ['Usuario_ID', 'Email', 'Nombre', 'Activo', 'Rol', 'Fecha_Alta'];
var BABY_COLUMNS = ['Fecha_Nacimiento', 'Hora_Nacimiento', 'Peso_Nacimiento_G'];

// ---------------------------------------------------------------------------
// Declaración de los tipos de registro
// ---------------------------------------------------------------------------
//
// Cada campo se describe con:
//   key      nombre en la API (y en el frontend)
//   column   nombre de la columna en la hoja
//   kind     'int' | 'bool' | 'enum'
//   values   solo en 'enum': código -> etiqueta que se escribe en la hoja
//   max      solo en 'int'
//   required el registro no es válido sin él
//
// Y cada tipo con:
//   sheet        pestaña
//   label        cómo se llama en castellano
//   interval     true si tiene inicio, fin y duración derivada
//   openAllowed  true si puede guardarse sin cerrar (cronómetro)
//   minDuration  duración mínima cuando está cerrado
//   requireAny   al menos uno de estos campos debe tener valor

var RECORD_TYPES = {
  sleep: {
    sheet: 'Sueno',
    label: 'Sueño',
    interval: true,
    openAllowed: true, // el cronómetro puede quedarse abierto
    minDuration: 1,
    fields: [
      {
        key: 'kind',
        column: 'Tipo',
        kind: 'enum',
        required: true,
        values: { siesta: 'Siesta', nocturno: 'Nocturno' },
      },
    ],
  },

  feed: {
    sheet: 'Tomas',
    label: 'Toma',
    interval: true,
    openAllowed: false,
    minDuration: 0, // una toma puntual es válida
    // Los minutos de pecho y los mililitros son magnitudes distintas y viven en
    // columnas distintas: nunca se convierten entre sí.
    fields: [
      { key: 'breastMin', column: 'Pecho_Min', kind: 'int', max: 600 },
      {
        key: 'breastSide',
        column: 'Pecho_Lado',
        kind: 'enum',
        values: { izquierdo: 'Izquierdo', derecho: 'Derecho', ambos: 'Ambos' },
      },
      { key: 'expressedMl', column: 'Extraida_Ml', kind: 'int', max: 1000 },
      { key: 'formulaMl', column: 'Formula_Ml', kind: 'int', max: 1000 },
    ],
    requireAny: ['breastMin', 'expressedMl', 'formulaMl'],
  },

  diaper: {
    sheet: 'Panales',
    label: 'Pañal',
    interval: false,
    fields: [
      { key: 'pee', column: 'Pis', kind: 'bool' },
      { key: 'poop', column: 'Caca', kind: 'bool' },
      {
        key: 'consistency',
        column: 'Consistencia',
        kind: 'enum',
        values: { liquida: 'Líquida', pastosa: 'Pastosa', solida: 'Sólida' },
      },
    ],
    requireAny: ['pee', 'poop'],
  },

  bath: {
    sheet: 'Banos',
    label: 'Baño',
    interval: false,
    fields: [
      {
        key: 'kind',
        column: 'Tipo',
        kind: 'enum',
        required: true,
        values: { completo: 'Baño completo', aseo: 'Aseo rápido' },
      },
      { key: 'durationMin', column: 'Duracion_Min', kind: 'int', max: 240 },
    ],
  },

  // El peso se pesa de vez en cuando, no varias veces al día: es un registro
  // puntual más, con su pestaña y una sola columna propia.
  weight: {
    sheet: 'Peso',
    label: 'Peso',
    interval: false,
    fields: [{ key: 'grams', column: 'Gramos', kind: 'int', max: 30000, required: true }],
  },
};

/** Nombres de tipo en orden estable. */
function recordTypeNames() {
  var out = [];
  for (var name in RECORD_TYPES) out.push(name);
  return out;
}

function specOf(type) {
  var spec = RECORD_TYPES[type];
  if (!spec) throw apiError('VALIDATION', 'Tipo de registro no válido.');
  return spec;
}

/** Columnas de la pestaña de un tipo, en el orden en que se crean. */
function columnsFor(type) {
  var spec = specOf(type);
  var cols = COMMON_COLUMNS.slice();
  cols = cols.concat(spec.interval ? INTERVAL_COLUMNS : [MOMENT_COLUMN]);
  for (var i = 0; i < spec.fields.length; i++) cols.push(spec.fields[i].column);
  cols.push(NOTES_COLUMN);
  return cols.concat(AUDIT_COLUMNS);
}

/** Columna que guarda el instante principal del registro. */
function startColumnOf(type) {
  return specOf(type).interval ? 'Hora_Inicio' : MOMENT_COLUMN;
}

function typeForSheet(sheetName) {
  var names = recordTypeNames();
  for (var i = 0; i < names.length; i++) {
    if (RECORD_TYPES[names[i]].sheet === sheetName) return names[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Errores de la API
// ---------------------------------------------------------------------------

function apiError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Fechas: reloj de pared 'yyyy-MM-dd HH:mm'
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).length < 2 ? '0' + n : String(n);
}

function dtToUtcMs(dt) {
  return Date.UTC(
    Number(dt.slice(0, 4)),
    Number(dt.slice(5, 7)) - 1,
    Number(dt.slice(8, 10)),
    Number(dt.slice(11, 13) || '0'),
    Number(dt.slice(14, 16) || '0')
  );
}

function utcMsToDt(ms) {
  var d = new Date(ms);
  return (
    d.getUTCFullYear() +
    '-' +
    pad2(d.getUTCMonth() + 1) +
    '-' +
    pad2(d.getUTCDate()) +
    ' ' +
    pad2(d.getUTCHours()) +
    ':' +
    pad2(d.getUTCMinutes())
  );
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(dtToUtcMs(s + ' 00:00'));
  return (
    d.getUTCFullYear() === Number(s.slice(0, 4)) &&
    d.getUTCMonth() === Number(s.slice(5, 7)) - 1 &&
    d.getUTCDate() === Number(s.slice(8, 10))
  );
}

function isValidDt(s) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return false;
  return isValidDate(s.slice(0, 10)) && s.slice(11) < '24:00';
}

function diffMinutes(a, b) {
  return Math.round((dtToUtcMs(b) - dtToUtcMs(a)) / 60000);
}

function addMinutesDt(dt, minutes) {
  return utcMsToDt(dtToUtcMs(dt) + minutes * 60000);
}

function addDaysDate(date, days) {
  return utcMsToDt(dtToUtcMs(date + ' 00:00') + days * 86400000).slice(0, 10);
}

function dtDateOf(dt) {
  return dt.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Normalización de textos (lectura tolerante de celdas editadas a mano)
// ---------------------------------------------------------------------------

function normText(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Mapa etiqueta-o-código normalizado -> código, para leer un enum de la hoja. */
function reverseValues(values) {
  var map = {};
  for (var code in values) {
    map[normText(values[code])] = code;
    map[normText(code)] = code;
  }
  return map;
}

function isTruthyCell(v) {
  if (v === true) return true;
  var s = normText(v);
  return s === 'true' || s === 'si' || s === '1' || s === 'x' || s === 'verdadero';
}

/**
 * Interpreta una celda de fecha-hora ya convertida a texto.
 * Acepta 'yyyy-MM-dd HH:mm(:ss)', 'yyyy-MM-ddTHH:mm', 'dd/MM/yyyy HH:mm' y
 * 'HH:mm' (que se combina con la columna Fecha). Devuelve '' si no se entiende.
 */
function parseDtCell(value, fechaText) {
  var s = String(value == null ? '' : value)
    .trim()
    .replace('T', ' ');
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ ]+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]) + ' ' + pad2(m[4]) + ':' + m[5];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ]+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]) + ' ' + pad2(m[4]) + ':' + m[5];
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m && fechaText) return fechaText + ' ' + pad2(m[1]) + ':' + m[2];
  return '';
}

/** Interpreta una celda de fecha. Devuelve 'yyyy-MM-dd' o ''. */
function parseDateCell(value) {
  var s = String(value == null ? '' : value).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  return '';
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  var n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? Math.round(n) : null;
}

// ---------------------------------------------------------------------------
// Validación y normalización de registros entrantes
// ---------------------------------------------------------------------------

/** Margen para relojes desajustados al comprobar que algo no está en el futuro. */
var FUTURE_MARGIN_MIN = 10;

function boundedInt(value, max, what) {
  if (value == null || value === '' || value === false) return 0;
  var n = numOrNull(value);
  if (n == null || n < 0 || n > max) {
    throw apiError('VALIDATION', 'Valor no válido para ' + what + '.');
  }
  return n;
}

function readEnum(value, field) {
  if (value == null || value === '') return null;
  var code = reverseValues(field.values)[normText(value)];
  if (!code) throw apiError('VALIDATION', 'Valor no válido para ' + field.column + '.');
  return code;
}

/**
 * Valida un registro recibido de la API y devuelve su forma canónica.
 * `now` es la hora de pared actual de Madrid.
 */
function normalizeAndValidate(input, now) {
  if (!input || typeof input !== 'object') throw apiError('VALIDATION', 'Falta el registro.');
  var spec = specOf(input.type);

  var id = String(input.id == null ? '' : input.id).trim();
  if (!id || id.length > 80) throw apiError('VALIDATION', 'Identificador no válido.');

  var start = String(input.start == null ? '' : input.start).trim();
  if (!isValidDt(start)) throw apiError('VALIDATION', 'La fecha y hora no son válidas.');
  if (diffMinutes(now, start) > FUTURE_MARGIN_MIN) {
    throw apiError('VALIDATION', 'La hora no puede estar en el futuro.');
  }

  var out = {
    id: id,
    type: input.type,
    start: start,
    notes: String(input.notes == null ? '' : input.notes)
      .trim()
      .slice(0, 500),
  };

  if (spec.interval) {
    var end = input.end == null || input.end === '' ? null : String(input.end).trim();
    if (end && !isValidDt(end)) throw apiError('VALIDATION', 'La hora de fin no es válida.');
    if (!end && !spec.openAllowed) {
      throw apiError('VALIDATION', 'Falta la hora de fin de la ' + spec.label.toLowerCase() + '.');
    }
    if (end) {
      if (diffMinutes(now, end) > FUTURE_MARGIN_MIN) {
        throw apiError('VALIDATION', 'La hora de fin no puede estar en el futuro.');
      }
      var dur = diffMinutes(start, end);
      if (dur < spec.minDuration) {
        throw apiError('VALIDATION', 'El fin debe ser posterior al inicio.');
      }
      if (dur > 24 * 60) {
        throw apiError('VALIDATION', 'Un registro no puede durar más de 24 horas.');
      }
    }
    out.end = end;
    out.durationMin = end ? diffMinutes(start, end) : null;
  }

  for (var i = 0; i < spec.fields.length; i++) {
    var field = spec.fields[i];
    var raw = input[field.key];
    var value;
    if (field.kind === 'int') {
      value = boundedInt(raw, field.max, field.column);
    } else if (field.kind === 'bool') {
      value = raw === true || raw === 'TRUE' || raw === 1;
    } else {
      value = readEnum(raw, field);
    }
    if (field.required && (value == null || value === '')) {
      throw apiError('VALIDATION', 'Falta ' + field.column + '.');
    }
    out[field.key] = value;
  }

  if (spec.requireAny && !hasAny(out, spec.requireAny)) {
    throw apiError('VALIDATION', requireAnyMessage(input.type));
  }
  requirePositive(out, spec);
  applyTypeRules(out, spec);
  return out;
}

function hasAny(record, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (record[keys[i]]) return true;
  }
  return false;
}

function requireAnyMessage(type) {
  if (type === 'feed') {
    return 'La toma necesita al menos un componente: pecho, leche extraída o fórmula.';
  }
  return 'El pañal tiene que llevar pis, caca o las dos cosas.';
}

/** Un campo obligatorio a 0 no vale: un peso de 0 gramos no es un peso. */
function requirePositive(record, spec) {
  for (var i = 0; i < spec.fields.length; i++) {
    var field = spec.fields[i];
    if (field.required && field.kind === 'int' && !record[field.key]) {
      throw apiError('VALIDATION', 'Falta ' + field.column + '.');
    }
  }
}

/** Reglas que no caben en un descriptor de campo. */
function applyTypeRules(record, spec) {
  if (record.type === 'feed') {
    if (!record.breastMin) record.breastSide = null;
    if (record.breastMin && record.end) {
      var dur = diffMinutes(record.start, record.end);
      if (record.breastMin > dur + FUTURE_MARGIN_MIN) {
        throw apiError('VALIDATION', 'Los minutos de pecho no pueden superar la duración de la toma.');
      }
    }
  }
  if (record.type === 'diaper' && !record.poop) {
    // La consistencia solo aplica cuando hay caca.
    record.consistency = null;
  }
  return record;
}

// ---------------------------------------------------------------------------
// Conversión registro <-> fila
// ---------------------------------------------------------------------------

/** Convierte un registro (con auditoría) al objeto fila keyed por columna. */
function recordToRow(record, deleted) {
  var spec = specOf(record.type);
  var row = {
    ID: record.id,
    Fecha: dtDateOf(record.start),
    Notas: record.notes || '',
    Creado_Por: record.createdBy || '',
    Creado_En: record.createdAt || '',
    Modificado_Por: record.updatedBy || '',
    Modificado_En: record.updatedAt || '',
    Eliminado: deleted ? 'TRUE' : '',
  };

  if (spec.interval) {
    row.Hora_Inicio = record.start;
    row.Hora_Fin = record.end || '';
    row.Duracion_Min = record.durationMin == null ? '' : record.durationMin;
  } else {
    row.Hora = record.start;
  }

  for (var i = 0; i < spec.fields.length; i++) {
    var field = spec.fields[i];
    var value = record[field.key];
    if (field.kind === 'int') {
      row[field.column] = value ? value : '';
    } else if (field.kind === 'bool') {
      row[field.column] = value ? 'TRUE' : '';
    } else {
      row[field.column] = value ? field.values[value] || value : '';
    }
  }
  return row;
}

/**
 * Convierte una fila (valores ya en texto/número) en un registro. Lectura
 * tolerante: admite ediciones manuales razonables. Devuelve null si la fila no
 * es interpretable (sin identificador o sin hora).
 */
function rowToRecord(type, row) {
  var spec = specOf(type);
  var id = String(row.ID == null ? '' : row.ID).trim();
  if (!id) return null;

  var fecha = parseDateCell(row.Fecha);
  var start = parseDtCell(row[startColumnOf(type)], fecha);
  if (!start) return null;

  var record = {
    id: id,
    type: type,
    start: start,
    notes: String(row.Notas == null ? '' : row.Notas).trim(),
    createdBy: String(row.Creado_Por == null ? '' : row.Creado_Por).trim(),
    createdAt: parseDtCell(row.Creado_En, '') || '',
    updatedBy: String(row.Modificado_Por == null ? '' : row.Modificado_Por).trim() || null,
    updatedAt: parseDtCell(row.Modificado_En, '') || null,
  };

  if (spec.interval) {
    var end = parseDtCell(row.Hora_Fin, fecha) || null;
    // Un fin de solo hora anterior al inicio se interpreta como el día
    // siguiente: '21:30' → '07:00' es un sueño que cruza la medianoche.
    if (end && diffMinutes(start, end) < 0 && dtDateOf(end) === fecha) {
      end = addMinutesDt(end, 24 * 60);
    }
    record.end = end;
    // La duración se recalcula siempre: manda el intervalo, no la celda.
    record.durationMin = end ? diffMinutes(start, end) : null;
  }

  for (var i = 0; i < spec.fields.length; i++) {
    var field = spec.fields[i];
    var cell = row[field.column];
    if (field.kind === 'int') {
      record[field.key] = numOrNull(cell) || 0;
    } else if (field.kind === 'bool') {
      record[field.key] = isTruthyCell(cell);
    } else {
      record[field.key] = reverseValues(field.values)[normText(cell)] || null;
    }
  }

  return { record: record, deleted: isTruthyCell(row.Eliminado) };
}

// ---------------------------------------------------------------------------
// Consultas sobre los registros
// ---------------------------------------------------------------------------

function isOpenSleep(record) {
  return record.type === 'sleep' && !record.end;
}

/**
 * A partir de aquí, un sueño sin cerrar deja de tratarse como "en curso": es
 * casi seguro un cronómetro que alguien olvidó detener. El frontend usa el
 * mismo umbral (STALE_SLEEP_MIN en lib/derive.ts).
 */
var OPEN_SLEEP_MAX_MIN = 14 * 60;

/** Fin efectivo de un registro para decidir qué días ocupa. */
function effectiveEnd(record, now) {
  if (isOpenSleep(record)) {
    // Sin el tope, un sueño olvidado hace tres días aparecería en la
    // cronología de todos los días transcurridos desde entonces.
    var cap = addMinutesDt(record.start, OPEN_SLEEP_MAX_MIN);
    return now < cap ? now : cap;
  }
  var end = record.end || record.start;
  return end < record.start ? record.start : end;
}

/** ¿El intervalo del registro toca el día natural `date`? */
function recordTouchesDay(record, date, now) {
  var dayStart = date + ' 00:00';
  var dayEnd = addDaysDate(date, 1) + ' 00:00';
  var end = effectiveEnd(record, now);
  return (
    record.start < dayEnd && end >= dayStart && !(record.start < dayStart && end === dayStart)
  );
}

// ---------------------------------------------------------------------------
// Día de vida
// ---------------------------------------------------------------------------
//
// El día natural (00:00–23:59) se mantiene para la cronología y el histórico.
// El día de vida son periodos de 24 h contados desde el instante exacto del
// nacimiento. Ambos conceptos conviven.

function lifeDayNumber(birth, dt) {
  var minutes = diffMinutes(birth, dt);
  if (minutes < 0) return 0; // antes de nacer
  return Math.floor(minutes / 1440) + 1;
}

/** Rango [inicio, fin) del día de vida `n`. El fin es exclusivo. */
function lifeDayRange(birth, n) {
  var offset = (n - 1) * 1440;
  return { start: addMinutesDt(birth, offset), end: addMinutesDt(birth, offset + 1440) };
}

/**
 * Totales de un día de vida. Un registro cuenta en el periodo en el que
 * empieza, de modo que una toma que cruza el aniversario horario no se parte.
 */
function lifeDayTotals(records, rangeStart, rangeEnd) {
  var t = {
    pees: 0,
    poops: 0,
    diapers: 0,
    feeds: 0,
    breastMin: 0,
    expressedMl: 0,
    formulaMl: 0,
    milkMl: 0,
  };
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (r.start < rangeStart || r.start >= rangeEnd) continue;
    if (r.type === 'diaper') {
      t.diapers++;
      if (r.pee) t.pees++;
      if (r.poop) t.poops++;
    } else if (r.type === 'feed') {
      t.feeds++;
      t.breastMin += r.breastMin || 0;
      t.expressedMl += r.expressedMl || 0;
      t.formulaMl += r.formulaMl || 0;
    }
  }
  // Leche cuantificable: no incluye el pecho directo porque no sabemos los ml.
  t.milkMl = t.expressedMl + t.formulaMl;
  return t;
}

// ---------------------------------------------------------------------------
// Ajustes: nacimiento y objetivos (pestaña Bebe)
// ---------------------------------------------------------------------------

function defaultSettings() {
  return { birth: null, birthWeightG: 0 };
}

function normalizeSettings(raw) {
  var s = raw && typeof raw === 'object' ? raw : {};
  var birth = String(s.birth == null ? '' : s.birth).trim();
  if (birth && !isValidDt(birth)) {
    throw apiError('VALIDATION', 'La fecha y hora de nacimiento no son válidas.');
  }
  return {
    birth: birth || null,
    birthWeightG: boundedInt(s.birthWeightG, 30000, 'el peso al nacer'),
  };
}

/** Fila de la pestaña Bebe -> ajustes. */
function babyRowToSettings(row) {
  if (!row) return defaultSettings();
  var date = parseDateCell(row.Fecha_Nacimiento);
  var time = parseDtCell(row.Hora_Nacimiento, date);
  var birth = date && time ? time : '';
  return {
    birth: birth && isValidDt(birth) ? birth : null,
    birthWeightG: numOrNull(row.Peso_Nacimiento_G) || 0,
  };
}

/** Ajustes -> fila de la pestaña Bebe. */
function settingsToBabyRow(settings) {
  return {
    Fecha_Nacimiento: settings.birth ? dtDateOf(settings.birth) : '',
    // Solo la hora: la fecha ya está en su columna y así la pestaña se lee mejor.
    Hora_Nacimiento: settings.birth ? settings.birth.slice(11, 16) : '',
    Peso_Nacimiento_G: settings.birthWeightG || '',
  };
}

// Permite ejecutar este archivo en Node para los tests. En Apps Script
// `module` no existe y este bloque se ignora.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RECORD_TYPES: RECORD_TYPES,
    COMMON_COLUMNS: COMMON_COLUMNS,
    AUDIT_COLUMNS: AUDIT_COLUMNS,
    USER_COLUMNS: USER_COLUMNS,
    BABY_COLUMNS: BABY_COLUMNS,
    SHEET_USERS: SHEET_USERS,
    SHEET_BABY: SHEET_BABY,
    recordTypeNames: recordTypeNames,
    columnsFor: columnsFor,
    startColumnOf: startColumnOf,
    typeForSheet: typeForSheet,
    apiError: apiError,
    isValidDt: isValidDt,
    isValidDate: isValidDate,
    diffMinutes: diffMinutes,
    addMinutesDt: addMinutesDt,
    addDaysDate: addDaysDate,
    normText: normText,
    isTruthyCell: isTruthyCell,
    parseDtCell: parseDtCell,
    parseDateCell: parseDateCell,
    normalizeAndValidate: normalizeAndValidate,
    recordToRow: recordToRow,
    rowToRecord: rowToRecord,
    isOpenSleep: isOpenSleep,
    effectiveEnd: effectiveEnd,
    recordTouchesDay: recordTouchesDay,
    lifeDayNumber: lifeDayNumber,
    lifeDayRange: lifeDayRange,
    lifeDayTotals: lifeDayTotals,
    defaultSettings: defaultSettings,
    normalizeSettings: normalizeSettings,
    babyRowToSettings: babyRowToSettings,
    settingsToBabyRow: settingsToBabyRow,
  };
}
