/**
 * Baby Tracker — acceso a Google Sheets.
 *
 * La hoja de cálculo es la fuente de verdad. Este módulo lee y escribe filas
 * localizando las columnas por el nombre de su cabecera, de modo que
 * reordenar o añadir columnas a mano no rompe la aplicación.
 */

var SHEET_EVENTS = 'Eventos';
var SHEET_USERS = 'Usuarios';

function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw apiError('CONFIG', 'Falta configurar SPREADSHEET_ID. Ejecuta setup() desde el editor.');
  }
  return SpreadsheetApp.openById(id);
}

function getSheetOrFail(name) {
  var sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw apiError('CONFIG', 'No existe la hoja "' + name + '". Ejecuta setup() desde el editor.');
  }
  return sheet;
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
        'A la hoja "' + sheetName + '" le falta la columna "' + requiredColumns[k] + '".'
      );
    }
  }
  return map;
}

/**
 * Convierte una celda a texto conservando la semántica de fecha/hora.
 * Sheets devuelve Date para celdas con formato de fecha u hora; las celdas
 * de solo hora llegan como fechas de 1899.
 */
function cellToText(v) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1902) {
      return Utilities.formatDate(v, TZ, 'HH:mm');
    }
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  }
  return v;
}

/** Lee todos los eventos. Devuelve [{event, deleted, rowNumber}]. */
function readAllEvents() {
  var sheet = getSheetOrFail(SHEET_EVENTS);
  var values = sheet.getDataRange().getValues();
  if (values.length < 1) {
    throw apiError('CONFIG', 'La hoja "Eventos" está vacía. Ejecuta setup() desde el editor.');
  }
  var map = headerMap(values[0], COLUMNS, SHEET_EVENTS);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var rec = {};
    for (var c = 0; c < COLUMNS.length; c++) {
      rec[COLUMNS[c]] = cellToText(values[r][map[COLUMNS[c]]]);
    }
    var parsed = recordToEvent(rec);
    if (!parsed || !parsed.event.id) continue; // fila no interpretable o sin ID
    parsed.rowNumber = r + 1;
    out.push(parsed);
  }
  return out;
}

/** Devuelve el número de fila (1-based) del evento, o -1 si no existe. */
function findEventRowNumber(id) {
  var sheet = getSheetOrFail(SHEET_EVENTS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var map = headerMap(
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0],
    COLUMNS,
    SHEET_EVENTS
  );
  var ids = sheet.getRange(2, map.Evento_ID + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return -1;
}

/** Lee un evento por su número de fila. */
function readEventAtRow(rowNumber) {
  var sheet = getSheetOrFail(SHEET_EVENTS);
  var map = headerMap(
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0],
    COLUMNS,
    SHEET_EVENTS
  );
  var values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rec = {};
  for (var c = 0; c < COLUMNS.length; c++) {
    rec[COLUMNS[c]] = cellToText(values[map[COLUMNS[c]]]);
  }
  return recordToEvent(rec);
}

/**
 * Escribe un registro (objeto keyed por columna) en la fila indicada, o lo
 * añade al final si rowNumber es -1. Respeta el orden real de las columnas.
 */
function writeEventRecord(record, rowNumber) {
  var sheet = getSheetOrFail(SHEET_EVENTS);
  var lastColumn = sheet.getLastColumn();
  var map = headerMap(sheet.getRange(1, 1, 1, lastColumn).getValues()[0], COLUMNS, SHEET_EVENTS);
  var row = [];
  for (var i = 0; i < lastColumn; i++) row.push('');
  for (var name in record) {
    if (name in map) row[map[name]] = record[name];
  }
  if (rowNumber === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
  }
}

/** Lee los usuarios autorizados: [{email, name, active}]. */
function readUsers() {
  var sheet = getSheetOrFail(SHEET_USERS);
  var values = sheet.getDataRange().getValues();
  if (values.length < 1) return [];
  var map = headerMap(values[0], USER_COLUMNS, SHEET_USERS);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var email = normText(values[r][map.Email]);
    if (!email) continue;
    out.push({
      email: email,
      name: String(values[r][map.Nombre] || '').trim() || email.split('@')[0],
      active: isTruthyCell(values[r][map.Activo]),
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

/** Mapa email -> nombre para mostrar quién registró cada evento. */
function usersDisplayMap() {
  var users = readUsers();
  var map = {};
  for (var i = 0; i < users.length; i++) {
    map[users[i].email] = users[i].name;
  }
  return map;
}
