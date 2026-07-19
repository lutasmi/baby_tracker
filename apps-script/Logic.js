/**
 * Baby Tracker — lógica pura del backend.
 *
 * Validación de eventos, conversión entre los objetos JSON de la API y las
 * filas de la hoja de cálculo, y aritmética de fechas sobre el reloj de pared
 * de Madrid ('yyyy-MM-dd HH:mm').
 *
 * Este archivo no usa ningún servicio de Apps Script: puede ejecutarse en
 * Node tal cual, y así lo prueban los tests (test/logic.test.mjs).
 */

var COLUMNS = [
  'Evento_ID',
  'Tipo_Evento',
  'Fecha',
  'Hora_Inicio',
  'Hora_Fin',
  'Duracion_Minutos',
  'Subtipo',
  'Cantidad',
  'Unidad',
  'Detalle_1',
  'Detalle_2',
  'Notas',
  'Creado_Por',
  'Creado_En',
  'Modificado_Por',
  'Modificado_En',
  'Eliminado',
];

var USER_COLUMNS = ['Usuario_ID', 'Email', 'Nombre', 'Activo', 'Rol', 'Fecha_Alta'];

var TYPE_LABELS = { sleep: 'Sueño', feed: 'Toma', diaper: 'Pañal', bath: 'Baño' };

var SUBTYPE_LABELS = {
  siesta: 'Siesta',
  nocturno: 'Nocturno',
  biberon: 'Biberón',
  lactancia: 'Lactancia',
  pipi: 'Pipí',
  caca: 'Caca',
  ambos: 'Ambos',
  completo: 'Baño completo',
  aseo: 'Aseo rápido',
};

var DETAIL_LABELS = {
  materna: 'Materna',
  formula: 'Fórmula',
  mixta: 'Mixta',
  izquierdo: 'Izquierdo',
  derecho: 'Derecho',
  ambos: 'Ambos',
  liquida: 'Líquida',
  pastosa: 'Pastosa',
  solida: 'Sólida',
};

var SUBTYPES_BY_TYPE = {
  sleep: ['siesta', 'nocturno'],
  feed: ['biberon', 'lactancia'],
  diaper: ['pipi', 'caca', 'ambos'],
  bath: ['completo', 'aseo'],
};

var MILK_TYPES = ['materna', 'formula', 'mixta'];
var BREASTS = ['izquierdo', 'derecho', 'ambos'];
var CONSISTENCIES = ['liquida', 'pastosa', 'solida'];

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

function buildReverseMap(labels) {
  var map = {};
  for (var code in labels) {
    map[normText(labels[code])] = code;
    map[normText(code)] = code;
  }
  return map;
}

var TYPE_REVERSE = buildReverseMap(TYPE_LABELS);
var SUBTYPE_REVERSE = buildReverseMap(SUBTYPE_LABELS);
var DETAIL_REVERSE = buildReverseMap(DETAIL_LABELS);

function isTruthyCell(v) {
  if (v === true) return true;
  var s = normText(v);
  return s === 'true' || s === 'si' || s === 'sí' || s === '1' || s === 'x' || s === 'verdadero';
}

/**
 * Interpreta una celda de fecha-hora ya convertida a texto.
 * Acepta 'yyyy-MM-dd HH:mm(:ss)', 'yyyy-MM-ddTHH:mm', 'dd/MM/yyyy HH:mm' y
 * 'HH:mm' (que se combina con la columna Fecha). Devuelve '' si no se
 * entiende.
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
// Validación y normalización de eventos entrantes
// ---------------------------------------------------------------------------

function requireIn(value, allowed, what) {
  var v = normText(value);
  if (allowed.indexOf(v) === -1) {
    throw apiError('VALIDATION', 'Valor no válido para ' + what + '.');
  }
  return v;
}

/**
 * Valida un evento recibido de la API y devuelve su forma canónica.
 * `now` es la hora de pared actual de Madrid; se admite un margen de 10
 * minutos para relojes desajustados.
 */
function normalizeAndValidate(input, now) {
  if (!input || typeof input !== 'object') {
    throw apiError('VALIDATION', 'Falta el evento.');
  }
  var id = String(input.id == null ? '' : input.id).trim();
  if (!id || id.length > 80) throw apiError('VALIDATION', 'Identificador no válido.');

  var type = SUBTYPES_BY_TYPE[input.type] ? input.type : null;
  if (!type) throw apiError('VALIDATION', 'Tipo de evento no válido.');
  var subtype = requireIn(input.subtype, SUBTYPES_BY_TYPE[type], 'el subtipo');

  var start = String(input.start == null ? '' : input.start).trim();
  if (!isValidDt(start)) throw apiError('VALIDATION', 'La fecha y hora de inicio no son válidas.');

  var end = input.end == null || input.end === '' ? null : String(input.end).trim();
  if (end && !isValidDt(end)) throw apiError('VALIDATION', 'La fecha y hora de fin no son válidas.');

  var margin = 10;
  if (diffMinutes(now, start) > margin) {
    throw apiError('VALIDATION', 'El inicio no puede estar en el futuro.');
  }
  if (end && diffMinutes(now, end) > margin) {
    throw apiError('VALIDATION', 'El fin no puede estar en el futuro.');
  }
  if (end) {
    var dur = diffMinutes(start, end);
    if (dur <= 0) throw apiError('VALIDATION', 'El fin debe ser posterior al inicio.');
    if (dur > 24 * 60) throw apiError('VALIDATION', 'Un evento no puede durar más de 24 horas.');
  }

  var notes = String(input.notes == null ? '' : input.notes)
    .trim()
    .slice(0, 500);

  var quantityMl = null;
  var detail = null;
  var durationMin = null;

  if (type === 'sleep') {
    durationMin = end ? diffMinutes(start, end) : null;
  } else if (type === 'feed' && subtype === 'biberon') {
    end = null;
    quantityMl = numOrNull(input.quantityMl);
    if (quantityMl == null || quantityMl < 1 || quantityMl > 1000) {
      throw apiError('VALIDATION', 'La cantidad del biberón debe estar entre 1 y 1000 ml.');
    }
    detail = requireIn(input.detail, MILK_TYPES, 'el tipo de leche');
  } else if (type === 'feed' && subtype === 'lactancia') {
    if (!end) throw apiError('VALIDATION', 'La lactancia necesita hora de fin o duración.');
    durationMin = diffMinutes(start, end);
    detail = requireIn(input.detail, BREASTS, 'el pecho');
  } else if (type === 'diaper') {
    end = null;
    // La consistencia solo aplica cuando hay caca; en pipí se descarta.
    if (subtype !== 'pipi' && input.detail != null && input.detail !== '') {
      detail = requireIn(input.detail, CONSISTENCIES, 'la consistencia');
    }
  } else if (type === 'bath') {
    end = null;
    if (input.durationMin != null && input.durationMin !== '') {
      durationMin = numOrNull(input.durationMin);
      if (durationMin == null || durationMin < 1 || durationMin > 240) {
        throw apiError('VALIDATION', 'La duración del baño debe estar entre 1 y 240 minutos.');
      }
    }
  }

  return {
    id: id,
    type: type,
    subtype: subtype,
    start: start,
    end: end,
    durationMin: durationMin,
    quantityMl: quantityMl,
    detail: detail,
    notes: notes,
  };
}

// ---------------------------------------------------------------------------
// Conversión evento <-> fila
// ---------------------------------------------------------------------------

/**
 * Convierte un evento (con metadatos de auditoría) al objeto fila keyed por
 * nombre de columna. `deleted` marca el borrado lógico.
 */
function eventToRecord(event, deleted) {
  return {
    Evento_ID: event.id,
    Tipo_Evento: TYPE_LABELS[event.type],
    Fecha: dtDateOf(event.start),
    Hora_Inicio: event.start,
    Hora_Fin: event.end || '',
    Duracion_Minutos: event.durationMin == null ? '' : event.durationMin,
    Subtipo: SUBTYPE_LABELS[event.subtype] || event.subtype,
    Cantidad: event.quantityMl == null ? '' : event.quantityMl,
    Unidad: event.quantityMl == null ? '' : 'ml',
    Detalle_1: event.detail ? DETAIL_LABELS[event.detail] || event.detail : '',
    Detalle_2: '',
    Notas: event.notes || '',
    Creado_Por: event.createdBy || '',
    Creado_En: event.createdAt || '',
    Modificado_Por: event.updatedBy || '',
    Modificado_En: event.updatedAt || '',
    Eliminado: deleted ? 'TRUE' : '',
  };
}

/**
 * Convierte un registro de fila (valores ya en texto/número) en un evento.
 * Lectura tolerante: admite ediciones manuales razonables. Devuelve null si
 * la fila no es interpretable (sin tipo o sin hora de inicio).
 */
function recordToEvent(rec) {
  var type = TYPE_REVERSE[normText(rec.Tipo_Evento)];
  if (!type) return null;

  var fecha = parseDateCell(rec.Fecha);
  var start = parseDtCell(rec.Hora_Inicio, fecha);
  if (!start) return null;

  var end = parseDtCell(rec.Hora_Fin, fecha) || null;
  // Celda de fin con solo la hora en un sueño que cruza la medianoche:
  // '21:30' → '07:00' se interpreta como el día siguiente.
  if (end && diffMinutes(start, end) < 0 && dtDateOf(end) === fecha) {
    end = addMinutesDt(end, 24 * 60);
  }

  var subtype = SUBTYPE_REVERSE[normText(rec.Subtipo)] || normText(rec.Subtipo);
  var detailRaw = normText(rec.Detalle_1);
  var detail = detailRaw ? DETAIL_REVERSE[detailRaw] || detailRaw : null;

  var durationMin = numOrNull(rec.Duracion_Minutos);
  if (end) durationMin = diffMinutes(start, end); // recalcular siempre: la hoja manda

  return {
    event: {
      id: String(rec.Evento_ID == null ? '' : rec.Evento_ID).trim(),
      type: type,
      subtype: subtype,
      start: start,
      end: end,
      durationMin: durationMin,
      quantityMl: numOrNull(rec.Cantidad),
      detail: detail,
      notes: String(rec.Notas == null ? '' : rec.Notas).trim(),
      createdBy: String(rec.Creado_Por == null ? '' : rec.Creado_Por).trim(),
      createdAt: parseDtCell(rec.Creado_En, '') || String(rec.Creado_En == null ? '' : rec.Creado_En).trim(),
      updatedBy: String(rec.Modificado_Por == null ? '' : rec.Modificado_Por).trim() || null,
      updatedAt: parseDtCell(rec.Modificado_En, '') || null,
    },
    deleted: isTruthyCell(rec.Eliminado),
  };
}

function isOpenSleep(event) {
  return event.type === 'sleep' && !event.end;
}

/** ¿El intervalo del evento toca el día `date`? */
function eventTouchesDay(event, date, now) {
  var dayStart = date + ' 00:00';
  var dayEnd = addDaysDate(date, 1) + ' 00:00';
  var effectiveEnd = event.end || (isOpenSleep(event) ? now : event.start);
  if (effectiveEnd < event.start) effectiveEnd = event.start;
  return event.start < dayEnd && effectiveEnd >= dayStart && !(event.start < dayStart && effectiveEnd === dayStart);
}

// Permite ejecutar este archivo en Node para los tests. En Apps Script
// `module` no existe y este bloque se ignora.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLUMNS: COLUMNS,
    USER_COLUMNS: USER_COLUMNS,
    TYPE_LABELS: TYPE_LABELS,
    SUBTYPE_LABELS: SUBTYPE_LABELS,
    DETAIL_LABELS: DETAIL_LABELS,
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
    eventToRecord: eventToRecord,
    recordToEvent: recordToEvent,
    isOpenSleep: isOpenSleep,
    eventTouchesDay: eventTouchesDay,
  };
}
