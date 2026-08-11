/**
 * Baby Tracker — API web (punto de entrada).
 *
 * Se despliega como aplicación web ("Ejecutar como: yo", acceso: "Cualquier
 * usuario"). El frontend envía POST con JSON y recibe JSON:
 *   petición:  { action, token?, idToken?, date?, record?, type?, id?, settings? }
 *   respuesta: { ok: true, data } | { ok: false, error: { code, message } }
 *
 * Códigos de error: AUTH (volver a iniciar sesión), FORBIDDEN (usuario no
 * autorizado), VALIDATION, ACTIVE_SLEEP, NOT_FOUND, CONFIG, INTERNAL.
 */

var TZ = 'Europe/Madrid';
var SESSION_DAYS = 180;

function nowMadrid() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
}

function doGet() {
  return jsonOutput({ ok: true, data: { service: 'baby-tracker', time: nowMadrid() } });
}

function doPost(e) {
  var body;
  resetSheetCache();
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var req = JSON.parse(raw);
    body = { ok: true, data: route(req) };
  } catch (err) {
    body = {
      ok: false,
      error: { code: err.code || 'INTERNAL', message: err.message || 'Error inesperado.' },
    };
  }
  return jsonOutput(body);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function route(req) {
  if (!req || typeof req.action !== 'string') {
    throw apiError('VALIDATION', 'Petición no válida.');
  }
  if (req.action === 'login') return login(req);

  var session = requireSession(req.token);
  switch (req.action) {
    case 'getDay':
      return getDay(req);
    case 'getHistory':
      return getHistory(req);
    case 'createRecord':
      return createRecord(req, session);
    case 'updateRecord':
      return updateRecord(req, session);
    case 'deleteRecord':
      return deleteRecord(req, session);
    case 'updateSettings':
      return writeSettings(req.settings);
    case 'logout':
      return logout(req.token);
    default:
      throw apiError('VALIDATION', 'Acción desconocida: ' + req.action);
  }
}

// ---------------------------------------------------------------------------
// Autenticación y sesiones
// ---------------------------------------------------------------------------

/**
 * Verifica el ID token de Google Identity Services contra el endpoint
 * tokeninfo y comprueba que pertenece a nuestro Client ID.
 */
function verifyGoogleIdToken(idToken) {
  if (!idToken) throw apiError('AUTH', 'Falta el token de Google.');
  var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) {
    throw apiError('CONFIG', 'Falta configurar GOOGLE_CLIENT_ID en las propiedades del script.');
  }
  var resp = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) {
    throw apiError('AUTH', 'La sesión de Google no es válida. Vuelve a iniciar sesión.');
  }
  var info = JSON.parse(resp.getContentText());
  if (info.aud !== clientId) {
    throw apiError('AUTH', 'El token de Google no pertenece a esta aplicación.');
  }
  if (String(info.email_verified) !== 'true' || !info.email) {
    throw apiError('AUTH', 'La cuenta de Google no tiene el email verificado.');
  }
  return { email: normText(info.email), name: info.name || info.email };
}

function login(req) {
  var identity = verifyGoogleIdToken(req.idToken);
  var user = findUser(identity.email);
  if (!user || !user.active) {
    throw apiError(
      'FORBIDDEN',
      'La cuenta ' +
        identity.email +
        ' no está autorizada. Pide acceso a quien administra la aplicación.'
    );
  }

  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  var expires = Date.now() + SESSION_DAYS * 86400000;
  PropertiesService.getScriptProperties().setProperty(
    'sess:' + token,
    JSON.stringify({ email: user.email, exp: expires })
  );
  cleanExpiredSessions();
  return { token: token, user: { email: user.email, name: user.name } };
}

function requireSession(token) {
  if (!token) throw apiError('AUTH', 'Sesión no iniciada.');
  var raw = PropertiesService.getScriptProperties().getProperty('sess:' + token);
  if (!raw) throw apiError('AUTH', 'La sesión ha caducado. Vuelve a iniciar sesión.');
  var data = JSON.parse(raw);
  if (!data.exp || data.exp < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty('sess:' + token);
    throw apiError('AUTH', 'La sesión ha caducado. Vuelve a iniciar sesión.');
  }
  // Comprobar el usuario en cada petición permite revocar el acceso
  // desactivándolo en la pestaña Usuarios.
  var user = findUser(data.email);
  if (!user || !user.active) {
    throw apiError('FORBIDDEN', 'Esta cuenta ya no está autorizada.');
  }
  return { email: user.email, name: user.name };
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('sess:' + token);
  return { done: true };
}

function cleanExpiredSessions() {
  var props = PropertiesService.getScriptProperties();
  var keys = props.getKeys();
  var now = Date.now();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('sess:') !== 0) continue;
    try {
      var data = JSON.parse(props.getProperty(keys[i]));
      if (!data.exp || data.exp < now) props.deleteProperty(keys[i]);
    } catch (err) {
      props.deleteProperty(keys[i]);
    }
  }
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

/**
 * Datos de un día: los registros de todas las pestañas cuyo intervalo toca la
 * fecha, el sueño sin cerrar, los últimos toma/pañal globales y el día de vida
 * en curso con sus totales.
 */
function getDay(req) {
  var date = String(req.date || '').trim();
  if (!isValidDate(date)) throw apiError('VALIDATION', 'Fecha no válida.');
  var now = nowMadrid();

  var all = readAllRecords();
  var dayStart = date + ' 00:00';
  var records = [];
  var openSleep = null;
  var lastFeed = null;
  var lastDiaper = null;
  var lastPee = null;
  var lastPoop = null;
  var lastSleepEnd = null;
  var lastWeight = null;
  var previousFeed = null;

  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    if (recordTouchesDay(r, date, now)) records.push(r);
    if (isOpenSleep(r)) openSleep = r; // el de inicio más tardío prevalece
    if (r.type === 'feed') {
      // La hidratación no cuenta como "última toma": el reloj que se mira para
      // saber si toca comer no lo reinicia un consuelo de tres minutos, igual
      // que no lo cuenta el contador de la pantalla.
      if (!isHydration(r) && (!lastFeed || r.start > lastFeed.start)) lastFeed = r;
      // Última toma anterior al día consultado: da el hueco de la primera
      // toma de la noche, que si no quedaría sin calcular. Tampoco cuenta la
      // hidratación: ese hueco contesta a "cuánto llevaba sin comer".
      if (
        !isHydration(r) &&
        r.start < dayStart &&
        (!previousFeed || r.start > previousFeed.start)
      ) {
        previousFeed = r;
      }
    }
    if (r.type === 'diaper') {
      if (!lastDiaper || r.start > lastDiaper.start) lastDiaper = r;
      // Pis y caca se siguen por separado: un pañal de solo pis no dice nada
      // de la caca, y es justo lo que se vigila las primeras semanas.
      if (r.pee && (!lastPee || r.start > lastPee.start)) lastPee = r;
      // Y el pedete tampoco cuenta como "última caca": son gases.
      if (isRealPoop(r) && (!lastPoop || r.start > lastPoop.start)) lastPoop = r;
    }
    if (r.type === 'sleep' && r.end && (!lastSleepEnd || r.end > lastSleepEnd.end)) {
      lastSleepEnd = r;
    }
    if (r.type === 'weight' && (!lastWeight || r.start > lastWeight.start)) lastWeight = r;
  }

  var settings = readSettings();

  return {
    date: date,
    records: records,
    openSleep: openSleep,
    last: {
      feed: lastFeed,
      diaper: lastDiaper,
      pee: lastPee,
      poop: lastPoop,
      sleepEnd: lastSleepEnd,
      weight: lastWeight,
    },
    previousFeed: previousFeed,
    users: usersDisplayMap(),
    serverNow: now,
    settings: settings,
    // Siempre el día de vida en curso (según `now`), con independencia de la
    // fecha consultada: es lo que necesita la pantalla principal.
    lifeDay: currentLifeDay(settings, all, now),
  };
}

/**
 * Totales de los últimos días de vida, del más reciente al más antiguo, para
 * ver la evolución. Sin fecha de nacimiento no hay días de vida que contar.
 */
function getHistory(req) {
  var settings = readSettings();
  if (!settings.birth) return { birth: null, days: [], weights: [] };

  var now = nowMadrid();
  var current = lifeDayNumber(settings.birth, now);
  if (current < 1) return { birth: settings.birth, days: [], weights: weightsOf(readAllRecords()) };

  var wanted = Math.min(60, Math.max(1, Number(req.days) || 14));
  var all = readAllRecords();

  // Las pesadas van enteras, con su hora: la gráfica necesita un eje temporal
  // de verdad, no un valor por día.
  var weights = [];
  for (var w = 0; w < all.length; w++) {
    if (all[w].type === 'weight') weights.push(all[w]);
  }

  var days = [];
  for (var n = current; n > 0 && days.length < wanted; n--) {
    var range = lifeDayRange(settings.birth, n);
    days.push({
      number: n,
      start: range.start,
      end: range.end,
      totals: lifeDayTotals(all, range.start, range.end),
      // Última pesada del periodo, si la hubo.
      weightG: lastWeightIn(all, range.start, range.end),
    });
  }
  return { birth: settings.birth, days: days, weights: weights };
}

function weightsOf(records) {
  var out = [];
  for (var i = 0; i < records.length; i++) {
    if (records[i].type === 'weight') out.push(records[i]);
  }
  return out;
}

function lastWeightIn(records, rangeStart, rangeEnd) {
  var found = null;
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (r.type !== 'weight') continue;
    if (r.start < rangeStart || r.start >= rangeEnd) continue;
    if (!found || r.start > found.start) found = r;
  }
  return found ? found.grams : null;
}

/**
 * Día de vida actual con sus totales y sus registros. Los registros vienen
 * aquí y no se piden aparte porque la franja de la pantalla principal cubre un
 * periodo que casi siempre cae a caballo de dos días naturales.
 */
function currentLifeDay(settings, allRecords, now) {
  if (!settings.birth) return null;
  var number = lifeDayNumber(settings.birth, now);
  if (number < 1) return null; // la fecha de nacimiento aún no ha llegado
  var range = lifeDayRange(settings.birth, number);
  var records = [];
  for (var i = 0; i < allRecords.length; i++) {
    var r = allRecords[i];
    if (r.start >= range.start && r.start < range.end) records.push(r);
  }
  return {
    number: number,
    start: range.start,
    end: range.end,
    totals: lifeDayTotals(allRecords, range.start, range.end),
    records: records,
  };
}

// ---------------------------------------------------------------------------
// Escrituras (bajo bloqueo global; los reintentos son idempotentes por ID)
// ---------------------------------------------------------------------------

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Lanza ACTIVE_SLEEP si existe un sueño abierto distinto de `exceptId`. */
function assertNoOtherOpenSleep(exceptId) {
  var rows = readRecordsOfType('sleep');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].deleted) continue;
    if (isOpenSleep(rows[i].record) && rows[i].record.id !== exceptId) {
      throw apiError('ACTIVE_SLEEP', 'Ya hay un sueño en curso. Finalízalo antes de empezar otro.');
    }
  }
}

/** La toma guardada con ese identificador, o null. */
function findFeed(id) {
  var feeds = readRecordsOfType('feed');
  for (var i = 0; i < feeds.length; i++) {
    if (feeds[i].record.id === id) return feeds[i].record;
  }
  return null;
}

function createRecord(req, session) {
  var now = nowMadrid();
  var record = normalizeAndValidate(req.record, now);
  return withLock(function () {
    if (RECORD_TYPES[record.type].grouped) {
      // Reintento de una petición ya aplicada: no duplicar.
      var already = findFeed(record.id);
      if (already) return already;
      record.createdBy = session.email;
      record.createdAt = now;
      record.updatedBy = null;
      record.updatedAt = null;
      writeFeed(record, false);
      return record;
    }

    var existing = findRecordRow(record.type, record.id);
    if (existing !== -1) return readRecordAtRow(record.type, existing).record;
    if (isOpenSleep(record)) assertNoOtherOpenSleep(record.id);
    record.createdBy = session.email;
    record.createdAt = now;
    record.updatedBy = null;
    record.updatedAt = null;
    writeRecordRow(record.type, recordToRow(record, false), -1);
    return record;
  });
}

function updateRecord(req, session) {
  var now = nowMadrid();
  var record = normalizeAndValidate(req.record, now);
  return withLock(function () {
    if (RECORD_TYPES[record.type].grouped) {
      var current = findFeed(record.id);
      if (!current) throw apiError('NOT_FOUND', 'El registro ya no existe.');
      record.createdBy = current.createdBy;
      record.createdAt = current.createdAt;
      record.updatedBy = session.email;
      record.updatedAt = now;
      writeFeed(record, false);
      return record;
    }

    var rowNumber = findRecordRow(record.type, record.id);
    if (rowNumber === -1) throw apiError('NOT_FOUND', 'El registro ya no existe.');
    var currentRow = readRecordAtRow(record.type, rowNumber);
    if (!currentRow || currentRow.deleted) throw apiError('NOT_FOUND', 'El registro fue eliminado.');
    if (isOpenSleep(record)) assertNoOtherOpenSleep(record.id);
    record.createdBy = currentRow.record.createdBy;
    record.createdAt = currentRow.record.createdAt;
    record.updatedBy = session.email;
    record.updatedAt = now;
    writeRecordRow(record.type, recordToRow(record, false), rowNumber);
    return record;
  });
}

function deleteRecord(req, session) {
  var id = String(req.id == null ? '' : req.id).trim();
  if (!id) throw apiError('VALIDATION', 'Falta el identificador.');
  var type = req.type;
  if (!RECORD_TYPES[type]) throw apiError('VALIDATION', 'Tipo de registro no válido.');
  return withLock(function () {
    if (RECORD_TYPES[type].grouped) {
      var feed = findFeed(id);
      if (!feed) return { deleted: true }; // ya no existe: idempotente
      feed.updatedBy = session.email;
      feed.updatedAt = nowMadrid();
      writeFeed(feed, true);
      return { deleted: true };
    }

    var rowNumber = findRecordRow(type, id);
    if (rowNumber === -1) return { deleted: true };
    var current = readRecordAtRow(type, rowNumber);
    if (current && !current.deleted) {
      var record = current.record;
      record.updatedBy = session.email;
      record.updatedAt = nowMadrid();
      writeRecordRow(type, recordToRow(record, true), rowNumber);
    }
    return { deleted: true };
  });
}
