/**
 * Baby Tracker — instalación y actualización de la hoja de cálculo.
 *
 * Ejecuta setup() una vez desde el editor de Apps Script (botón "Ejecutar").
 * Crea la hoja si no existe y prepara una pestaña por tipo de registro, más
 * `Usuarios` y `Bebe`. Es seguro ejecutarlo varias veces: solo añade lo que
 * falta y nunca borra datos.
 *
 * Si vienes de una versión anterior, la pestaña `Eventos` se deja intacta. La
 * aplicación ya no la lee: consérvala como histórico el tiempo que quieras y
 * bórrala a mano cuando ya no te haga falta.
 */

function setup() {
  resetSheetCache();
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Baby Tracker');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(TZ);

  setupSheet(ss, SHEET_USERS, USER_COLUMNS, []);
  setupSheet(ss, SHEET_BABY, BABY_COLUMNS, [
    'Objetivo_Pises',
    'Objetivo_Cacas',
    'Objetivo_Leche_Ml',
  ]);

  var types = recordTypeNames();
  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    setupSheet(ss, RECORD_TYPES[type].sheet, columnsFor(type), numericColumnsFor(type));
    Logger.log('✔ Pestaña "' + RECORD_TYPES[type].sheet + '" lista.');
  }

  removeDefaultSheet(ss);
  addOwnerIfEmpty(ss);
  migrationNotice(ss);

  Logger.log('✔ Hoja de cálculo lista: ' + ss.getUrl());
  if (!props.getProperty('GOOGLE_CLIENT_ID')) {
    Logger.log(
      '⚠ Falta el Client ID de OAuth. En "Configuración del proyecto" > ' +
        '"Propiedades de la secuencia de comandos" añade GOOGLE_CLIENT_ID con el ' +
        'Client ID creado en Google Cloud Console.'
    );
  } else {
    Logger.log('✔ GOOGLE_CLIENT_ID configurado.');
  }
  Logger.log('Siguiente paso: Implementar > Administrar implementaciones > nueva versión.');
}

/** Columnas de un tipo que guardan números, no texto. */
function numericColumnsFor(type) {
  var out = RECORD_TYPES[type].interval ? ['Duracion_Min'] : [];
  var fields = RECORD_TYPES[type].fields;
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].kind === 'int') out.push(fields[i].column);
  }
  return out;
}

/**
 * Crea la pestaña si falta y garantiza que están todas las columnas. Las
 * columnas que ya existen no se tocan ni se reordenan; las que faltan se
 * añaden al final, de modo que actualizar nunca pierde datos.
 */
function setupSheet(ss, name, headers, numericColumns) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var lastColumn = Math.max(1, sheet.getLastColumn());
  var current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var present = {};
  for (var i = 0; i < current.length; i++) {
    var key = normText(current[i]).replace(/ /g, '_');
    if (key) present[key] = true;
  }

  var missing = [];
  for (var j = 0; j < headers.length; j++) {
    if (!present[normText(headers[j]).replace(/ /g, '_')]) missing.push(headers[j]);
  }
  if (missing.length) {
    var startColumn = String(current[0]).trim() === '' ? 1 : lastColumn + 1;
    sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);
  }

  var width = Math.max(sheet.getLastColumn(), headers.length);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Las columnas de fecha/hora y las de texto se fuerzan a texto para que
  // Sheets no las reinterprete; así la celda contiene exactamente lo escrito.
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];
  for (var c = 0; c < width; c++) {
    var isNumeric = indexOfText(numericColumns, header[c]) !== -1;
    var a1 = columnLetter(c + 1) + '2:' + columnLetter(c + 1);
    sheet.getRange(a1).setNumberFormat(isNumeric ? '0' : '@');
  }
}

function indexOfText(list, value) {
  var target = normText(value);
  for (var i = 0; i < list.length; i++) {
    if (normText(list[i]) === target) return i;
  }
  return -1;
}

function columnLetter(n) {
  var s = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function removeDefaultSheet(ss) {
  var names = ['Hoja 1', 'Sheet1', 'Hoja1'];
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  }
}

function addOwnerIfEmpty(ss) {
  var sheet = ss.getSheetByName(SHEET_USERS);
  if (sheet.getLastRow() > 1) return;
  var email = Session.getEffectiveUser().getEmail();
  if (!email) return;
  sheet.appendRow([
    Utilities.getUuid(),
    email,
    email.split('@')[0],
    'TRUE',
    'admin',
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
  ]);
  Logger.log('✔ Usuario inicial dado de alta: ' + email);
}

function migrationNotice(ss) {
  var old = ss.getSheetByName('Eventos');
  if (!old) return;
  Logger.log(
    'ℹ La pestaña "Eventos" de la versión anterior sigue ahí con ' +
      Math.max(0, old.getLastRow() - 1) +
      ' filas. La aplicación ya no la lee. Vuelve a introducir esos registros en ' +
      'las pestañas nuevas y bórrala cuando quieras.'
  );
}
