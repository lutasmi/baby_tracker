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
  mixta: 'Mixta',
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
  // El subtipo de una toma es derivado: lo calcula feedSubtypeFor() a partir
  // de sus componentes. Se conserva porque la hoja lo muestra y porque los
  // registros anteriores a la v2 lo usaban como dato principal.
  feed: ['biberon', 'lactancia', 'mixta'],
  diaper: ['pipi', 'caca', 'ambos'],
  bath: ['completo', 'aseo'],
};

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
// Componentes de una toma
// ---------------------------------------------------------------------------
//
// Una toma puede combinar pecho directo (minutos), leche materna extraída (ml)
// y fórmula (ml). La hoja de cálculo no cambia: el desglose se serializa en
// 'Detalle_2' —una columna que hasta ahora siempre estaba vacía— con un texto
// legible y reversible:
//
//   pecho 15 min (ambos) · extraída 28 ml · fórmula 37 ml
//
// 'Cantidad' guarda el total de ml cuantificables y 'Detalle_1' conserva el
// significado que tenía en la v1, de modo que la hoja se sigue leyendo igual.
// Cuando 'Detalle_2' está vacío se interpreta el registro con las reglas
// antiguas (ver legacyComponents), así que nada de lo ya registrado se pierde.
//
// 'mixtaMl' solo aparece en registros de la v1 con tipo de leche "Mixta", donde
// se conocía el total pero no el reparto. No se genera nunca desde la v2.

function emptyComponents() {
  return { breastMin: 0, breastSide: null, expressedMl: 0, formulaMl: 0, mixtaMl: 0 };
}

/** Alias aceptados al leer el desglose escrito a mano en la hoja. */
var COMPONENT_ALIASES = {
  pecho: 'pecho',
  lactancia: 'pecho',
  teta: 'pecho',
  extraida: 'extraida',
  materna: 'extraida',
  formula: 'formula',
  biberon: 'formula',
  mixta: 'mixta',
};

function componentsAreEmpty(c) {
  return !c || (!c.breastMin && !c.expressedMl && !c.formulaMl && !c.mixtaMl);
}

function quantifiableMl(c) {
  return (c.expressedMl || 0) + (c.formulaMl || 0) + (c.mixtaMl || 0);
}

/** Subtipo derivado: solo ml -> biberón, solo pecho -> lactancia, ambos -> mixta. */
function feedSubtypeFor(c) {
  var hasMl = quantifiableMl(c) > 0;
  var hasBreast = (c.breastMin || 0) > 0;
  if (hasBreast && hasMl) return 'mixta';
  if (hasBreast) return 'lactancia';
  return 'biberon';
}

/** Texto de 'Detalle_2': legible para una persona y reversible para la app. */
function serializeComponents(c) {
  var parts = [];
  if (c.breastMin > 0) {
    var side = c.breastSide ? ' (' + (DETAIL_LABELS[c.breastSide] || c.breastSide) + ')' : '';
    parts.push('pecho ' + c.breastMin + ' min' + side);
  }
  if (c.expressedMl > 0) parts.push('extraída ' + c.expressedMl + ' ml');
  if (c.formulaMl > 0) parts.push('fórmula ' + c.formulaMl + ' ml');
  if (c.mixtaMl > 0) parts.push('mixta ' + c.mixtaMl + ' ml');
  return parts.join(' · ');
}

/**
 * Interpreta el texto de 'Detalle_2'. Tolerante con la edición manual: acepta
 * '·', ';' o ',' como separador, mayúsculas, acentos y unidades ausentes.
 * Devuelve null si no reconoce ningún componente.
 */
function parseComponents(text) {
  var raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  var out = emptyComponents();
  var found = false;
  var parts = raw.split(/[·;,]/);
  for (var i = 0; i < parts.length; i++) {
    var m = normText(parts[i]).match(/^([a-z]+)\s*(\d+)\s*(min|ml)?\s*(?:\(([a-z]+)\))?$/);
    if (!m) continue;
    var key = COMPONENT_ALIASES[m[1]];
    if (!key) continue;
    var value = Number(m[2]);
    if (!isFinite(value) || value < 0) continue;
    if (key === 'pecho') {
      out.breastMin = value;
      if (m[4] && BREASTS.indexOf(m[4]) !== -1) out.breastSide = m[4];
    } else if (key === 'extraida') {
      out.expressedMl = value;
    } else if (key === 'formula') {
      out.formulaMl = value;
    } else {
      out.mixtaMl = value;
    }
    found = true;
  }
  return found ? out : null;
}

/**
 * Componentes de un registro anterior a la v2, que no tiene 'Detalle_2':
 *   - Lactancia: los minutos eran la duración del propio evento.
 *   - Biberón: 'Cantidad' con el tipo de leche en 'Detalle_1'.
 */
function legacyComponents(subtype, quantityMl, durationMin, detail) {
  var c = emptyComponents();
  if (subtype === 'lactancia') {
    c.breastMin = durationMin > 0 ? durationMin : 0;
    if (detail && BREASTS.indexOf(detail) !== -1) c.breastSide = detail;
    return c;
  }
  var ml = quantityMl > 0 ? quantityMl : 0;
  if (detail === 'materna') c.expressedMl = ml;
  else if (detail === 'mixta') c.mixtaMl = ml;
  else c.formulaMl = ml;
  return c;
}

/** 'Detalle_1' equivalente al de la v1, para que la hoja se lea igual. */
function feedDetailLabel(c) {
  if (quantifiableMl(c) === 0) return c.breastSide || null;
  if (c.mixtaMl > 0) return 'mixta';
  var kinds = 0;
  if (c.expressedMl > 0) kinds++;
  if (c.formulaMl > 0) kinds++;
  if (c.breastMin > 0 || kinds > 1) return 'mixta';
  return c.expressedMl > 0 ? 'materna' : 'formula';
}

function normalizeComponents(input) {
  var c = emptyComponents();
  var src = input && typeof input === 'object' ? input : {};
  c.breastMin = boundedInt(src.breastMin, 0, 600, 'los minutos de pecho');
  c.expressedMl = boundedInt(src.expressedMl, 0, 1000, 'los ml de leche extraída');
  c.formulaMl = boundedInt(src.formulaMl, 0, 1000, 'los ml de fórmula');
  c.mixtaMl = boundedInt(src.mixtaMl, 0, 1000, 'los ml de leche mixta');
  if (c.breastMin > 0 && src.breastSide) {
    c.breastSide = requireIn(src.breastSide, BREASTS, 'el pecho');
  }
  return c;
}

function boundedInt(value, min, max, what) {
  if (value == null || value === '' || value === false) return 0;
  var n = numOrNull(value);
  if (n == null || n < min || n > max) {
    throw apiError('VALIDATION', 'Valor no válido para ' + what + '.');
  }
  return n;
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
  // En las tomas el subtipo lo decide el desglose, no el cliente.
  var subtype = type === 'feed' ? null : requireIn(input.subtype, SUBTYPES_BY_TYPE[type], 'el subtipo');

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
    // Una toma puntual (un biberón que se anota a una hora) puede durar 0.
    if (dur < 0 || (dur === 0 && type !== 'feed')) {
      throw apiError('VALIDATION', 'El fin debe ser posterior al inicio.');
    }
    if (dur > 24 * 60) throw apiError('VALIDATION', 'Un evento no puede durar más de 24 horas.');
  }

  var notes = String(input.notes == null ? '' : input.notes)
    .trim()
    .slice(0, 500);

  var quantityMl = null;
  var detail = null;
  var durationMin = null;
  var components = null;

  if (type === 'sleep') {
    durationMin = end ? diffMinutes(start, end) : null;
  } else if (type === 'feed') {
    components = normalizeComponents(input.components);
    if (componentsAreEmpty(components)) {
      throw apiError(
        'VALIDATION',
        'La toma necesita al menos un componente: pecho, leche extraída o fórmula.'
      );
    }
    if (components.breastMin > 0 && end && components.breastMin > diffMinutes(start, end) + margin) {
      throw apiError('VALIDATION', 'Los minutos de pecho no pueden superar la duración de la toma.');
    }
    subtype = feedSubtypeFor(components);
    detail = feedDetailLabel(components);
    quantityMl = quantifiableMl(components) || null;
    durationMin = end ? diffMinutes(start, end) : null;
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
    components: components,
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
    Detalle_2: event.components ? serializeComponents(event.components) : '',
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

  var quantityMl = numOrNull(rec.Cantidad);
  var components = null;
  if (type === 'feed') {
    // El desglose de 'Detalle_2' manda; si falta, es un registro de la v1 y se
    // interpreta con las reglas antiguas.
    components = parseComponents(rec.Detalle_2);
    if (!components) {
      components = legacyComponents(subtype, quantityMl || 0, durationMin || 0, detail);
    }
    subtype = feedSubtypeFor(components);
    quantityMl = quantifiableMl(components) || null;
  }

  return {
    event: {
      id: String(rec.Evento_ID == null ? '' : rec.Evento_ID).trim(),
      type: type,
      subtype: subtype,
      start: start,
      end: end,
      durationMin: durationMin,
      quantityMl: quantityMl,
      detail: detail,
      components: components,
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

/**
 * A partir de aquí, un sueño sin cerrar deja de tratarse como "en curso": es
 * casi seguro un cronómetro que alguien olvidó detener. El frontend usa el
 * mismo umbral (STALE_SLEEP_MIN en lib/derive.ts).
 */
var OPEN_SLEEP_MAX_MIN = 14 * 60;

/** ¿El intervalo del evento toca el día `date`? */
function eventTouchesDay(event, date, now) {
  var dayStart = date + ' 00:00';
  var dayEnd = addDaysDate(date, 1) + ' 00:00';
  var effectiveEnd = event.end || event.start;
  if (isOpenSleep(event)) {
    // Sin el tope, un sueño olvidado hace tres días aparecería en la
    // cronología de todos los días transcurridos desde entonces.
    var cap = addMinutesDt(event.start, OPEN_SLEEP_MAX_MIN);
    effectiveEnd = now < cap ? now : cap;
  }
  if (effectiveEnd < event.start) effectiveEnd = event.start;
  return event.start < dayEnd && effectiveEnd >= dayStart && !(event.start < dayStart && effectiveEnd === dayStart);
}

// ---------------------------------------------------------------------------
// Día de vida
// ---------------------------------------------------------------------------
//
// El día natural (00:00–23:59) se mantiene para la cronología y el histórico.
// El día de vida son periodos de 24 h contados desde el instante exacto del
// nacimiento: con un nacimiento a las 09:17, el día de vida 1 va de las 09:17
// del día del parto a las 09:16 del día siguiente. Ambos conceptos conviven.

/** Día de vida (1 = las primeras 24 h) al que pertenece el instante `dt`. */
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
 * Totales de un día de vida. Un evento cuenta en el día de vida en el que
 * empieza, de modo que una toma que cruza el aniversario horario no se parte.
 */
function lifeDayTotals(events, rangeStart, rangeEnd) {
  var t = {
    pees: 0,
    poops: 0,
    diapers: 0,
    feeds: 0,
    breastMin: 0,
    expressedMl: 0,
    formulaMl: 0,
    mixtaMl: 0,
    milkMl: 0,
  };
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.start < rangeStart || e.start >= rangeEnd) continue;
    if (e.type === 'diaper') {
      t.diapers++;
      if (e.subtype === 'pipi' || e.subtype === 'ambos') t.pees++;
      if (e.subtype === 'caca' || e.subtype === 'ambos') t.poops++;
    } else if (e.type === 'feed') {
      t.feeds++;
      var c = e.components || emptyComponents();
      t.breastMin += c.breastMin || 0;
      t.expressedMl += c.expressedMl || 0;
      t.formulaMl += c.formulaMl || 0;
      t.mixtaMl += c.mixtaMl || 0;
    }
  }
  // Leche cuantificable: no incluye el pecho directo porque no sabemos los ml.
  t.milkMl = t.expressedMl + t.formulaMl + t.mixtaMl;
  return t;
}

// ---------------------------------------------------------------------------
// Ajustes (nacimiento y objetivos)
// ---------------------------------------------------------------------------
//
// Viven en las propiedades del script, no en la hoja de cálculo: son
// configuración del despliegue, como SPREADSHEET_ID, y así esta fase no
// modifica la estructura de Sheets. Un objetivo a 0 significa "sin objetivo".

function defaultSettings() {
  return { birth: null, goals: { pees: 0, poops: 0, milkMl: 0 } };
}

function normalizeSettings(raw) {
  var s = raw && typeof raw === 'object' ? raw : {};
  var birth = String(s.birth == null ? '' : s.birth).trim();
  if (birth && !isValidDt(birth)) {
    throw apiError('VALIDATION', 'La fecha y hora de nacimiento no son válidas.');
  }
  var goals = s.goals && typeof s.goals === 'object' ? s.goals : {};
  return {
    birth: birth || null,
    goals: {
      pees: boundedInt(goals.pees, 0, 50, 'el objetivo de pises'),
      poops: boundedInt(goals.poops, 0, 50, 'el objetivo de cacas'),
      milkMl: boundedInt(goals.milkMl, 0, 5000, 'el objetivo de leche'),
    },
  };
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
    emptyComponents: emptyComponents,
    serializeComponents: serializeComponents,
    parseComponents: parseComponents,
    legacyComponents: legacyComponents,
    feedSubtypeFor: feedSubtypeFor,
    feedDetailLabel: feedDetailLabel,
    quantifiableMl: quantifiableMl,
    lifeDayNumber: lifeDayNumber,
    lifeDayRange: lifeDayRange,
    lifeDayTotals: lifeDayTotals,
    defaultSettings: defaultSettings,
    normalizeSettings: normalizeSettings,
  };
}
