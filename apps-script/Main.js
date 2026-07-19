/**
 * Baby Tracker — API web (punto de entrada).
 *
 * Se despliega como aplicación web ("Ejecutar como: yo", acceso: "Cualquier
 * usuario"). El frontend envía POST con JSON y recibe JSON:
 *   petición:  { action, token?, idToken?, date?, event?, id? }
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
    case 'createEvent':
      return createEvent(req, session);
    case 'updateEvent':
      return updateEvent(req, session);
    case 'deleteEvent':
      return deleteEvent(req, session);
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
      'La cuenta ' + identity.email + ' no está autorizada. Pide acceso a quien administra la aplicación.'
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
  // desactivándolo en la hoja Usuarios.
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
 * Datos de un día: eventos cuyo intervalo toca la fecha, el sueño activo, y
 * los últimos toma/pañal/sueño globales (para la pantalla principal).
 */
function getDay(req) {
  var date = String(req.date || '').trim();
  if (!isValidDate(date)) throw apiError('VALIDATION', 'Fecha no válida.');
  var now = nowMadrid();

  var all = [];
  var rows = readAllEvents();
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].deleted) all.push(rows[i].event);
  }
  all.sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });

  var events = [];
  var activeSleep = null;
  var lastFeed = null;
  var lastDiaper = null;
  var lastSleepEnd = null;
  for (var j = 0; j < all.length; j++) {
    var e = all[j];
    if (eventTouchesDay(e, date, now)) events.push(e);
    if (isOpenSleep(e)) activeSleep = e; // el de inicio más tardío prevalece
    if (e.type === 'feed' && (!lastFeed || e.start > lastFeed.start)) lastFeed = e;
    if (e.type === 'diaper' && (!lastDiaper || e.start > lastDiaper.start)) lastDiaper = e;
    if (e.type === 'sleep' && e.end && (!lastSleepEnd || e.end > lastSleepEnd.end)) {
      lastSleepEnd = e;
    }
  }

  return {
    date: date,
    events: events,
    activeSleep: activeSleep,
    last: { feed: lastFeed, diaper: lastDiaper, sleepEnd: lastSleepEnd },
    users: usersDisplayMap(),
    serverNow: now,
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
  var rows = readAllEvents();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].deleted) continue;
    if (isOpenSleep(rows[i].event) && rows[i].event.id !== exceptId) {
      throw apiError('ACTIVE_SLEEP', 'Ya hay un sueño en curso. Finalízalo antes de empezar otro.');
    }
  }
}

function createEvent(req, session) {
  var now = nowMadrid();
  var event = normalizeAndValidate(req.event, now);
  return withLock(function () {
    var existing = findEventRowNumber(event.id);
    if (existing !== -1) {
      // Reintento de una petición ya aplicada: no duplicar.
      return readEventAtRow(existing).event;
    }
    if (isOpenSleep(event)) assertNoOtherOpenSleep(event.id);
    event.createdBy = session.email;
    event.createdAt = now;
    event.updatedBy = null;
    event.updatedAt = null;
    writeEventRecord(eventToRecord(event, false), -1);
    return event;
  });
}

function updateEvent(req, session) {
  var now = nowMadrid();
  var event = normalizeAndValidate(req.event, now);
  return withLock(function () {
    var rowNumber = findEventRowNumber(event.id);
    if (rowNumber === -1) throw apiError('NOT_FOUND', 'El registro ya no existe.');
    var current = readEventAtRow(rowNumber);
    if (!current || current.deleted) {
      throw apiError('NOT_FOUND', 'El registro fue eliminado.');
    }
    if (isOpenSleep(event)) assertNoOtherOpenSleep(event.id);
    event.createdBy = current.event.createdBy;
    event.createdAt = current.event.createdAt;
    event.updatedBy = session.email;
    event.updatedAt = now;
    writeEventRecord(eventToRecord(event, false), rowNumber);
    return event;
  });
}

function deleteEvent(req, session) {
  var id = String(req.id == null ? '' : req.id).trim();
  if (!id) throw apiError('VALIDATION', 'Falta el identificador.');
  return withLock(function () {
    var rowNumber = findEventRowNumber(id);
    if (rowNumber === -1) return { deleted: true }; // ya no existe: idempotente
    var current = readEventAtRow(rowNumber);
    if (current && !current.deleted) {
      var event = current.event;
      event.updatedBy = session.email;
      event.updatedAt = nowMadrid();
      writeEventRecord(eventToRecord(event, true), rowNumber);
    }
    return { deleted: true };
  });
}
