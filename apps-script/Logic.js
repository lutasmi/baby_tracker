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

  // La toma es el único tipo agrupado: **una fila por cada cosa que pasa
  // dentro de ella**, unidas por `Toma_ID`. Una toma con dos tetadas y un
  // biberón son tres filas, y así cada elemento conserva su propia hora en vez
  // de quedar reducido a un total. Su intervalo y sus totales se calculan de
  // esas filas, nunca se guardan aparte. Todo lo suyo está más abajo, en "La
  // toma y sus elementos".
  feed: {
    sheet: 'Tomas',
    label: 'Toma',
    grouped: true,
    interval: true,
  },

  diaper: {
    sheet: 'Panales',
    label: 'Pañal',
    interval: false,
    fields: [
      { key: 'pee', column: 'Pis', kind: 'bool' },
      {
        key: 'peeAmount',
        column: 'Pis_Cantidad',
        kind: 'enum',
        values: { poco: 'Poco', medio: 'Medio', mucho: 'Mucho' },
      },
      { key: 'poop', column: 'Caca', kind: 'bool' },
      {
        key: 'poopAmount',
        column: 'Caca_Cantidad',
        kind: 'enum',
        values: { poco: 'Poco', medio: 'Medio', mucho: 'Mucho' },
      },
      {
        key: 'consistency',
        column: 'Consistencia',
        kind: 'enum',
        values: { pedete: 'Pedete', liquida: 'Líquida', pastosa: 'Pastosa', solida: 'Sólida' },
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
  if (spec.grouped) return FEED_COLUMNS.slice();
  var cols = COMMON_COLUMNS.slice();
  cols = cols.concat(spec.interval ? INTERVAL_COLUMNS : [MOMENT_COLUMN]);
  for (var i = 0; i < spec.fields.length; i++) cols.push(spec.fields[i].column);
  cols.push(NOTES_COLUMN);
  return cols.concat(AUDIT_COLUMNS);
}

/**
 * Columnas de versiones anteriores que se siguen leyendo pero ya no se crean.
 * `setup()` las respeta si están; nadie escribe en ellas.
 */
function legacyColumnsFor(type) {
  return type === 'feed' ? FEED_LEGACY_COLUMNS.slice() : [];
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
  // La toma no se valida campo a campo: se valida elemento a elemento.
  if (spec.grouped) return normalizeFeed(input, now);

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
    throw apiError('VALIDATION', requireAnyMessage());
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

function requireAnyMessage() {
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
  if (record.type === 'diaper') {
    // Cada detalle solo aplica si hubo aquello a lo que se refiere.
    if (!record.poop) {
      record.consistency = null;
      record.poopAmount = null;
    }
    if (!record.pee) record.peeAmount = null;
  }
  return record;
}

// ---------------------------------------------------------------------------
// La toma y sus elementos
// ---------------------------------------------------------------------------
//
// La pestaña `Tomas` guarda **una fila por cada tetada y cada biberón**. Las
// filas que comparten `Toma_ID` son la misma toma. El intervalo de la toma y
// sus totales se derivan de sus elementos cada vez que se leen: al no estar
// almacenados, no pueden contradecirlos.

var FEED_COLUMNS = [
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
].concat(AUDIT_COLUMNS);

/** Columnas de las tomas guardadas con el modelo anterior, de una sola fila. */
var FEED_LEGACY_COLUMNS = ['Pecho_Min', 'Extraida_Ml', 'Formula_Ml'];
var FEED_NUMERIC_COLUMNS = ['Duracion_Min', 'Cantidad_Ml'];

var FEED_KINDS = { pecho: 'Pecho', extraida: 'Extraída', formula: 'Fórmula' };
var BREAST_SIDES = {
  izquierdo: 'Izquierdo',
  derecho: 'Derecho',
  ambos: 'Ambos',
  // "No recuerdo" existe a propósito: de madrugada es mejor no saberlo que
  // inventarse un pecho.
  desconocido: 'No recuerdo',
};

function isBreast(item) {
  return item.kind === 'pecho';
}

/** Minutos que dura un elemento; los biberones puntuales valen 0. */
function itemMinutes(item) {
  return item.end ? Math.max(0, diffMinutes(item.start, item.end)) : 0;
}

/** Valida y normaliza un elemento de la toma. */
function normalizeItem(input, now) {
  if (!input || typeof input !== 'object') throw apiError('VALIDATION', 'Elemento no válido.');
  var kind = reverseValues(FEED_KINDS)[normText(input.kind)];
  if (!kind) throw apiError('VALIDATION', 'Tipo de elemento no válido en la toma.');

  var id = String(input.id == null ? '' : input.id).trim();
  if (!id || id.length > 80) throw apiError('VALIDATION', 'Identificador no válido.');

  var start = String(input.start == null ? '' : input.start).trim();
  if (!isValidDt(start)) throw apiError('VALIDATION', 'La hora del elemento no es válida.');
  if (diffMinutes(now, start) > FUTURE_MARGIN_MIN) {
    throw apiError('VALIDATION', 'Un elemento de la toma no puede empezar en el futuro.');
  }

  var end = input.end == null || input.end === '' ? null : String(input.end).trim();
  if (end) {
    if (!isValidDt(end)) throw apiError('VALIDATION', 'La hora de fin del elemento no es válida.');
    if (diffMinutes(now, end) > FUTURE_MARGIN_MIN) {
      throw apiError('VALIDATION', 'Un elemento de la toma no puede acabar en el futuro.');
    }
    var dur = diffMinutes(start, end);
    if (dur < 0) throw apiError('VALIDATION', 'El fin debe ser posterior al inicio.');
    if (dur > 24 * 60) throw apiError('VALIDATION', 'Un elemento no puede durar más de 24 horas.');
  }

  var item = { id: id, kind: kind, start: start, end: end, side: null, ml: 0 };

  if (kind === 'pecho') {
    if (!end) throw apiError('VALIDATION', 'Una tetada necesita hora de fin.');
    if (itemMinutes(item) <= 0) {
      throw apiError('VALIDATION', 'Cada tetada tiene que acabar después de empezar.');
    }
    if (input.side) {
      item.side = reverseValues(BREAST_SIDES)[normText(input.side)];
      if (!item.side) throw apiError('VALIDATION', 'Pecho no válido.');
    }
  } else {
    item.ml = boundedInt(input.ml, 1000, 'la cantidad');
    if (!item.ml) throw apiError('VALIDATION', 'La cantidad tiene que ser mayor que cero.');
  }
  return item;
}

/** Suma de los minutos de pecho de la toma. */
function breastMinutesOf(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    if (isBreast(items[i])) total += itemMinutes(items[i]);
  }
  return total;
}

/**
 * Qué pechos se usaron. Con tetadas de los dos lados es "ambos"; si alguna
 * quedó sin anotar es "no recuerdo", salvo que las conocidas ya sumen los dos:
 * media respuesta no autoriza a inventar la otra media.
 */
function breastSideOfItems(items) {
  var izquierdo = false;
  var derecho = false;
  var ambos = false;
  var desconocido = false;
  var alguna = false;
  for (var i = 0; i < items.length; i++) {
    if (!isBreast(items[i]) || itemMinutes(items[i]) <= 0) continue;
    alguna = true;
    if (items[i].side === 'izquierdo') izquierdo = true;
    else if (items[i].side === 'derecho') derecho = true;
    else if (items[i].side === 'ambos') ambos = true;
    else desconocido = true;
  }
  if (!alguna) return null;
  if (ambos || (izquierdo && derecho)) return 'ambos';
  if (desconocido) return 'desconocido';
  return izquierdo ? 'izquierdo' : derecho ? 'derecho' : 'desconocido';
}

function mlOf(items, kind) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].kind === kind) total += items[i].ml || 0;
  }
  return total;
}

/** La toma completa a partir de sus elementos: el intervalo y los totales. */
function feedFromItems(id, items, meta) {
  items = items.slice().sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });
  // Ya están en orden, así que la toma empieza con el primero. El fin hay que
  // buscarlo: una tetada larga puede acabar después de un biberón posterior.
  var start = items[0].start;
  var end = items[0].end || items[0].start;
  for (var i = 1; i < items.length; i++) {
    var itemEnd = items[i].end || items[i].start;
    if (itemEnd > end) end = itemEnd;
  }
  return {
    id: id,
    type: 'feed',
    start: start,
    end: end,
    durationMin: diffMinutes(start, end),
    items: items,
    breastMin: breastMinutesOf(items),
    breastSide: breastSideOfItems(items),
    expressedMl: mlOf(items, 'extraida'),
    formulaMl: mlOf(items, 'formula'),
    notes: meta.notes || '',
    createdBy: meta.createdBy || '',
    createdAt: meta.createdAt || '',
    updatedBy: meta.updatedBy || null,
    updatedAt: meta.updatedAt || null,
  };
}

/** Valida una toma entera: sus elementos y que tenga al menos uno. */
function normalizeFeed(input, now) {
  var id = String(input.id == null ? '' : input.id).trim();
  if (!id || id.length > 80) throw apiError('VALIDATION', 'Identificador no válido.');

  var raw = input.items;
  if (!raw || !raw.length) {
    throw apiError('VALIDATION', 'La toma necesita al menos una tetada o un biberón.');
  }
  var items = [];
  for (var i = 0; i < raw.length; i++) items.push(normalizeItem(raw[i], now));

  return feedFromItems(id, items, {
    notes: String(input.notes == null ? '' : input.notes)
      .trim()
      .slice(0, 500),
  });
}

/** Una fila por elemento; todas comparten Toma_ID, notas y auditoría. */
function feedToRows(record, deleted) {
  var rows = [];
  for (var i = 0; i < record.items.length; i++) {
    var item = record.items[i];
    var row = {
      ID: item.id,
      Toma_ID: record.id,
      Fecha: dtDateOf(item.start),
      Hora_Inicio: item.start,
      Hora_Fin: item.end || '',
      Duracion_Min: item.end ? itemMinutes(item) : '',
      Tipo: FEED_KINDS[item.kind],
      Pecho_Lado: item.side ? BREAST_SIDES[item.side] : '',
      Cantidad_Ml: item.ml ? item.ml : '',
      Notas: record.notes || '',
      Creado_Por: record.createdBy || '',
      Creado_En: record.createdAt || '',
      Modificado_Por: record.updatedBy || '',
      Modificado_En: record.updatedAt || '',
      Eliminado: deleted ? 'TRUE' : '',
    };
    // Si la fila venía del modelo anterior, sus totales ya no significan nada:
    // se vacían para que quien mire la hoja no lea dos versiones de lo mismo.
    for (var j = 0; j < FEED_LEGACY_COLUMNS.length; j++) row[FEED_LEGACY_COLUMNS[j]] = '';
    rows.push(row);
  }
  return rows;
}

/**
 * Una fila de la pestaña Tomas. Devuelve el elemento y a qué toma pertenece.
 *
 * Las filas guardadas con el modelo anterior no tienen ni `Toma_ID` ni `Tipo`:
 * se expanden a sus elementos para poder leerlas igual, y al editar esa toma se
 * reescribe ya con el modelo nuevo.
 */
function rowToFeedItems(row) {
  var id = String(row.ID == null ? '' : row.ID).trim();
  if (!id) return null;
  var fecha = parseDateCell(row.Fecha);
  var start = parseDtCell(row.Hora_Inicio, fecha);
  if (!start) return null;

  var end = parseDtCell(row.Hora_Fin, fecha) || null;
  if (end && diffMinutes(start, end) < 0 && dtDateOf(end) === fecha) {
    end = addMinutesDt(end, 24 * 60);
  }
  var meta = {
    notes: String(row.Notas == null ? '' : row.Notas).trim(),
    createdBy: String(row.Creado_Por == null ? '' : row.Creado_Por).trim(),
    createdAt: parseDtCell(row.Creado_En, '') || '',
    updatedBy: String(row.Modificado_Por == null ? '' : row.Modificado_Por).trim() || null,
    updatedAt: parseDtCell(row.Modificado_En, '') || null,
  };
  var deleted = isTruthyCell(row.Eliminado);
  var side = reverseValues(BREAST_SIDES)[normText(row.Pecho_Lado)] || null;
  var kind = reverseValues(FEED_KINDS)[normText(row.Tipo)];

  if (kind) {
    return {
      feedId: String(row.Toma_ID == null ? '' : row.Toma_ID).trim() || id,
      items: [
        {
          id: id,
          kind: kind,
          start: start,
          end: end,
          side: kind === 'pecho' ? side : null,
          ml: kind === 'pecho' ? 0 : numOrNull(row.Cantidad_Ml) || 0,
        },
      ],
      meta: meta,
      deleted: deleted,
    };
  }

  // Modelo anterior: totales en una sola fila.
  var items = [];
  var breastMin = numOrNull(row.Pecho_Min) || 0;
  if (breastMin > 0) {
    items.push({
      id: id + '-pecho',
      kind: 'pecho',
      start: start,
      end: addMinutesDt(start, breastMin),
      side: side,
      ml: 0,
    });
  }
  var expressed = numOrNull(row.Extraida_Ml) || 0;
  if (expressed > 0) {
    items.push({
      id: id + '-extraida',
      kind: 'extraida',
      start: start,
      end: null,
      side: null,
      ml: expressed,
    });
  }
  var formula = numOrNull(row.Formula_Ml) || 0;
  if (formula > 0) {
    items.push({
      id: id + '-formula',
      kind: 'formula',
      start: start,
      end: null,
      side: null,
      ml: formula,
    });
  }
  if (!items.length) return null;

  // `legacyEnd` conserva el intervalo guardado: la toma pudo durar más que la
  // suma de sus elementos reconstruidos, y esa hora de fin es un dato real.
  return { feedId: id, items: items, meta: meta, deleted: deleted, legacyEnd: end };
}

/**
 * Por debajo de estos minutos, un rato al pecho es consuelo o hidratación más
 * que una comida.
 */
var HYDRATION_MAX_MIN = 5;

/**
 * Una toma que fue solo un ratito al pecho.
 *
 * Importa para "cuánto hace de la última toma": si estás mirando si toca
 * comer, un consuelo de tres minutos no reinicia el reloj. Un biberón cuenta
 * siempre como toma, aunque se anotara sin hora de fin y dure cero minutos:
 * lo que come es la cantidad, no el tiempo.
 */
function isHydration(record) {
  if (record.type !== 'feed') return false;
  if ((record.expressedMl || 0) + (record.formulaMl || 0) > 0) return false;
  // Una toma sin nada anotado —posible editando la hoja a mano— es una toma,
  // no hidratación: ante la duda, el contador principal.
  var min = record.breastMin || 0;
  return min > 0 && min < HYDRATION_MAX_MIN;
}

/** Un pañal con caca de verdad; el pedete son gases, no una caca. */
function isRealPoop(record) {
  return record.type === 'diaper' && !!record.poop && record.consistency !== 'pedete';
}

/** Junta las filas de la pestaña Tomas en tomas completas. */
function groupFeedRows(parsedRows) {
  var order = [];
  var byId = {};
  for (var i = 0; i < parsedRows.length; i++) {
    var parsed = parsedRows[i];
    if (!parsed || parsed.deleted) continue;
    if (!byId[parsed.feedId]) {
      byId[parsed.feedId] = { items: [], meta: parsed.meta, legacyEnd: null, rowNumbers: [] };
      order.push(parsed.feedId);
    }
    var group = byId[parsed.feedId];
    for (var j = 0; j < parsed.items.length; j++) group.items.push(parsed.items[j]);
    if (parsed.legacyEnd) group.legacyEnd = parsed.legacyEnd;
    if (parsed.rowNumber) group.rowNumbers.push(parsed.rowNumber);
  }

  var out = [];
  for (var k = 0; k < order.length; k++) {
    var g = byId[order[k]];
    if (!g.items.length) continue;
    var record = feedFromItems(order[k], g.items, g.meta);
    // Una toma antigua pudo durar más que sus elementos reconstruidos.
    if (g.legacyEnd && g.legacyEnd > record.end) {
      record.end = g.legacyEnd;
      record.durationMin = diffMinutes(record.start, record.end);
    }
    out.push({ record: record, rowNumbers: g.rowNumbers });
  }
  return out;
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
    pedetes: 0,
    diapers: 0,
    feeds: 0,
    hydrations: 0,
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
      // Un pedete son gases, no una caca: cuenta aparte para que el número que
      // se vigila estas semanas siga significando lo que significaba.
      if (isRealPoop(r)) t.poops++;
      else if (r.poop) t.pedetes++;
    } else if (r.type === 'feed') {
      if (isHydration(r)) t.hydrations++;
      else t.feeds++;
      // Los minutos y los mililitros se suman siempre: se ha tomado, aunque
      // fuera un ratito.
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
    FEED_COLUMNS: FEED_COLUMNS,
    FEED_LEGACY_COLUMNS: FEED_LEGACY_COLUMNS,
    FEED_NUMERIC_COLUMNS: FEED_NUMERIC_COLUMNS,
    legacyColumnsFor: legacyColumnsFor,
    normalizeFeed: normalizeFeed,
    feedFromItems: feedFromItems,
    feedToRows: feedToRows,
    rowToFeedItems: rowToFeedItems,
    groupFeedRows: groupFeedRows,
    breastMinutesOf: breastMinutesOf,
    breastSideOfItems: breastSideOfItems,
    itemMinutes: itemMinutes,
    isHydration: isHydration,
    isRealPoop: isRealPoop,
    HYDRATION_MAX_MIN: HYDRATION_MAX_MIN,
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
