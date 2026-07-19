/**
 * Baby Tracker — instalación inicial.
 *
 * Ejecuta setup() una vez desde el editor de Apps Script (botón "Ejecutar").
 * Crea la hoja de cálculo si no existe, prepara las pestañas Usuarios y
 * Eventos con sus cabeceras y formatos, y da de alta como primer usuario a
 * quien ejecuta el script. Es seguro ejecutarlo varias veces.
 */

function setup() {
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

  setupSheet(ss, SHEET_USERS, USER_COLUMNS, {
    textColumns: USER_COLUMNS,
  });
  setupSheet(ss, SHEET_EVENTS, COLUMNS, {
    textColumns: COLUMNS.filter(function (c) {
      return c !== 'Cantidad' && c !== 'Duracion_Minutos';
    }),
  });
  removeDefaultSheet(ss);
  addOwnerIfEmpty(ss);

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
  Logger.log('Siguiente paso: Implementar > Nueva implementación > Aplicación web.');
}

function setupSheet(ss, name, headers, options) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  // Escribe las cabeceras solo si faltan, sin machacar datos existentes.
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeaders = String(firstRow[0]).trim() !== '';
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Las columnas de fecha/hora se guardan como texto para que Sheets no las
  // reinterprete; así la celda contiene exactamente 'yyyy-MM-dd HH:mm'.
  for (var i = 0; i < headers.length; i++) {
    var isText = options.textColumns.indexOf(headers[i]) !== -1;
    var a1 = columnLetter(i + 1) + '2:' + columnLetter(i + 1);
    sheet.getRange(a1).setNumberFormat(isText ? '@' : '0');
  }
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
