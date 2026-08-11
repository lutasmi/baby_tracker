/**
 * Baby Tracker — acceso a Google Sheets.
 *
 * La hoja de cálculo es la fuente de verdad y tiene **una pestaña por tipo de
 * registro** (`Sueno`, `Tomas`, `Panales`, `Banos`), más `Usuarios` y `Bebe`.
 * Las columnas se localizan por el nombre de su cabecera, de modo que
 * reordenarlas o añadir columnas propias a mano no rompe la aplicación.
 *
 * Este módulo no sabe qué significa cada tipo: pregunta a RECORD_TYPES
 * (Logic.js) qué pestaña y qué columnas le corresponden.
 */

// Caché de una sola ejecución: abrir la hoja y leer cabeceras cuesta una
// llamada cada vez, y una petición toca varias pestañas.
var _ss = null;
var _sheetCache = {};

function resetSheetCache() {
  _ss = null;
  _sheetCache = {};
}

function getSpreadsheet() {
  if (_ss) return _ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw apiError('CONFIG', 'Falta configurar SPREADSHEET_ID. Ejecuta setup() desde el editor.');
  }
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

/** Devuelve {sheet, map} de una pestaña, con las columnas ya localizadas. */
function sheetWithColumns(name, requiredColumns, optionalColumns) {
  if (_sheetCache[name]) return _sheetCache[name];
  var sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw apiError(
      'CONFIG',
      'No existe la pestaña "' + name + '". Ejecuta setup() desde el editor de Apps Script.'
    );
  }
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = headerMap(header, requiredColumns, name);
  // Las opcionales se leen si están; no se exigen. Sirven para seguir
  // entendiendo columnas de versiones anteriores sin obligar a migrarlas.
  var optional = optionalColumns || [];
  for (var i = 0; i < optional.length; i++) {
    var found = findColumn(header, optional[i]);
    if (found !== -1) map[optional[i]] = found;
  }
  var entry = { sheet: sheet, map: map, width: lastColumn, columns: requiredColumns.concat(optional) };
  _sheetCache[name] = entry;
  return entry;
}

function findColumn(header, name) {
  var target = normText(name).replace(/ /g, '_');
  for (var i = 0; i < header.length; i++) {
    if (normText(header[i]).replace(/ /g, '_') === target) return i;
  }
  return -1;
}

function sheetForType(type) {
  return sheetWithColumns(RECORD_TYPES[type].sheet, columnsFor(type), legacyColumnsFor(type));
}

/** Mapa nombre de columna canónico -> índice, a partir de la fila de cabecera. */
function headerMap(headerRow, requiredColumns, sheetName) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = normText(headerRow[i]).replace(/ /g, '_');
    for (var j = 0; j < requiredColumns.length; j++) {
      if (key === normText(requiredColumns[j]).replace(/ /g, '_')) {
        map[requiredColumns[j]] = i;
      }
    }
  }
  for (var k = 0; k < requiredColumns.length; k++) {
    if (!(requiredColumns[k] in map)) {
      throw apiError(
        'CONFIG',
        'A la pestaña "' + sheetName + '" le falta la columna "' + requiredColumns[k] + '".'
      );
    }
  }
  return map;
}

/**
 * Convierte una celda a texto conservando la semántica de fecha/hora.
 * Sheets devuelve Date para celdas con formato de fecha u hora; las celdas de
 * solo hora llegan como fechas de 1899.
 */
function cellToText(v) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1902) return Utilities.formatDate(v, TZ, 'HH:mm');
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  }
  return v;
}

function rowObject(values, columns, map) {
  var row = {};
  for (var c = 0; c < columns.length; c++) {
    if (!(columns[c] in map)) continue;
    row[columns[c]] = cellToText(values[map[columns[c]]]);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Lectura de registros
// ---------------------------------------------------------------------------

/** Lee todos los registros de un tipo: [{record, deleted, rowNumber}]. */
function readRecordsOfType(type) {
  if (RECORD_TYPES[type].grouped) return readFeeds();
  var entry = sheetForType(type);
  var columns = columnsFor(type);
  var values = entry.sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var parsed = rowToRecord(type, rowObject(values[r], columns, entry.map));
    if (!parsed) continue; // fila vacía o no interpretable
    parsed.rowNumber = r + 1;
    out.push(parsed);
  }
  return out;
}

/**
 * Las tomas, juntando las filas que comparten Toma_ID. Devuelve la misma forma
 * que el resto de tipos: [{record, deleted, rowNumbers}].
 */
function readFeeds() {
  var entry = sheetForType('feed');
  var columns = entry.columns;
  var values = entry.sheet.getDataRange().getValues();
  var parsedRows = [];
  for (var r = 1; r < values.length; r++) {
    var parsed = rowToFeedItems(rowObject(values[r], columns, entry.map));
    if (!parsed) continue;
    parsed.rowNumber = r + 1;
    parsedRows.push(parsed);
  }
  var grouped = groupFeedRows(parsedRows);
  var out = [];
  for (var i = 0; i < grouped.length; i++) {
    out.push({ record: grouped[i].record, deleted: false, rowNumbers: grouped[i].rowNumbers });
  }
  return out;
}

/** Números de fila que pertenecen a una toma, incluidas las ya borradas. */
function feedRowNumbers(feedId) {
  var entry = sheetForType('feed');
  var values = entry.sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][entry.map.ID] || '').trim();
    var group = String(values[r][entry.map.Toma_ID] || '').trim() || id;
    if (id && group === feedId) out.push(r + 1);
  }
  return out;
}

/**
 * Escribe una toma: reescribe las filas que ya tenía y añade o marca las que
 * falten. Así corregir una toma no deja elementos sueltos de la versión
 * anterior ni mueve filas de sitio.
 */
function writeFeed(record, deleted) {
  var entry = sheetForType('feed');
  var rows = feedToRows(record, deleted);
  var existing = feedRowNumbers(record.id);

  for (var i = 0; i < rows.length; i++) {
    writeRowAt(entry, rows[i], i < existing.length ? existing[i] : -1);
  }
  // Elementos que ya no están: se marcan como eliminados en su sitio.
  for (var j = rows.length; j < existing.length; j++) {
    writeRowAt(entry, { Eliminado: 'TRUE' }, existing[j]);
  }
}

function writeRowAt(entry, row, rowNumber) {
  var values;
  if (rowNumber === -1) {
    values = [];
    for (var i = 0; i < entry.width; i++) values.push('');
  } else {
    values = entry.sheet.getRange(rowNumber, 1, 1, entry.width).getValues()[0];
  }
  for (var name in row) {
    if (name in entry.map) values[entry.map[name]] = row[name];
  }
  if (rowNumber === -1) entry.sheet.appendRow(values);
  else entry.sheet.getRange(rowNumber, 1, 1, entry.width).setValues([values]);
}

/**
 * Todos los registros vivos de todas las pestañas, ordenados por hora.
 *
 * Son tantas llamadas a Sheets como tipos hay. Si algún día se nota, la
 * sustitución es leer todos los rangos de una vez con el servicio avanzado de
 * Sheets (`Sheets.Spreadsheets.Values.batchGet`), sin tocar nada más.
 */
function readAllRecords() {
  var types = recordTypeNames();
  var all = [];
  for (var i = 0; i < types.length; i++) {
    var rows = readRecordsOfType(types[i]);
    for (var j = 0; j < rows.length; j++) {
      if (!rows[j].deleted) all.push(rows[j].record);
    }
  }
  all.sort(function (a, b) {
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return all;
}

/** Número de fila (1-based) de un registro, o -1 si no está. */
function findRecordRow(type, id) {
  var entry = sheetForType(type);
  var lastRow = entry.sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = entry.sheet.getRange(2, entry.map.ID + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return -1;
}

function readRecordAtRow(type, rowNumber) {
  var entry = sheetForType(type);
  var values = entry.sheet.getRange(rowNumber, 1, 1, entry.width).getValues()[0];
  return rowToRecord(type, rowObject(values, columnsFor(type), entry.map));
}

/**
 * Escribe una fila (objeto keyed por columna) en la posición indicada, o la
 * añade al final si rowNumber es -1. Respeta el orden real de las columnas y
 * no borra las que alguien haya añadido a mano.
 */
function writeRecordRow(type, row, rowNumber) {
  writeRowAt(sheetForType(type), row, rowNumber);
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/** Lee los usuarios autorizados: [{email, name, active}]. */
function readUsers() {
  var entry = sheetWithColumns(SHEET_USERS, USER_COLUMNS);
  var values = entry.sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var email = normText(values[r][entry.map.Email]);
    if (!email) continue;
    out.push({
      email: email,
      name: String(values[r][entry.map.Nombre] || '').trim() || email.split('@')[0],
      active: isTruthyCell(values[r][entry.map.Activo]),
    });
  }
  return out;
}

function findUser(email) {
  var users = readUsers();
  var normalized = normText(email);
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === normalized) return users[i];
  }
  return null;
}

/** Mapa email -> nombre para mostrar quién registró cada cosa. */
function usersDisplayMap() {
  var users = readUsers();
  var map = {};
  for (var i = 0; i < users.length; i++) map[users[i].email] = users[i].name;
  return map;
}

// ---------------------------------------------------------------------------
// Bebé: nacimiento y objetivos
// ---------------------------------------------------------------------------

/** Lee la única fila de la pestaña Bebe. */
function readSettings() {
  var entry = sheetWithColumns(SHEET_BABY, BABY_COLUMNS);
  if (entry.sheet.getLastRow() < 2) return defaultSettings();
  var values = entry.sheet.getRange(2, 1, 1, entry.width).getValues()[0];
  return babyRowToSettings(rowObject(values, BABY_COLUMNS, entry.map));
}

function writeSettings(input) {
  var settings = normalizeSettings(input);
  var entry = sheetWithColumns(SHEET_BABY, BABY_COLUMNS);
  var row = settingsToBabyRow(settings);
  var width = entry.width;
  var values;
  if (entry.sheet.getLastRow() < 2) {
    values = [];
    for (var i = 0; i < width; i++) values.push('');
  } else {
    values = entry.sheet.getRange(2, 1, 1, width).getValues()[0];
  }
  for (var name in row) {
    if (name in entry.map) values[entry.map[name]] = row[name];
  }
  entry.sheet.getRange(2, 1, 1, width).setValues([values]);
  return settings;
}
