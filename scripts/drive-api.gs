var USERNAME = '12213457611'
var SESSION_MS = 30 * 24 * 60 * 60 * 1000
var LOCK_MESSAGE = 'Acesso bloqueado após 3 tentativas de senha.'

function doGet() {
  return json({ ok: true, service: 'personal-finance' })
}

function doPost(e) {
  var lock = LockService.getScriptLock()
  lock.waitLock(15000)
  try {
    var body = {}
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents)
    var action = body.action
    if (action === 'login') return json(login(body.username, body.password))
    if (action === 'refresh') return json(refresh(body.refreshToken))
    if (action === 'get') return json(readFinance(body.accessToken))
    if (action === 'put') return json(writeFinance(body.accessToken, body.data))
    return json({ ok: false, status: 400, error: 'Ação inválida.' })
  } catch (error) {
    return json({ ok: false, status: 400, error: error && error.message ? error.message : 'Falha ao acessar o arquivo.' })
  } finally {
    lock.releaseLock()
  }
}

function login(username, password) {
  var state = authState()
  if (state.locked) return { ok: false, status: 423, error: LOCK_MESSAGE }
  var expected = PropertiesService.getScriptProperties().getProperty('PASSWORD') || ''
  if (!expected) return { ok: false, status: 500, error: 'Defina a propriedade PASSWORD no Apps Script.' }
  var accepted = String(username || '').trim() === USERNAME && String(password || '') === expected
  if (!accepted) {
    state.failedAttempts += 1
    if (state.failedAttempts >= 3) state.locked = true
    saveAuth(state)
    return { ok: false, status: state.locked ? 423 : 401, error: state.locked ? LOCK_MESSAGE : 'Usuário ou senha inválidos.' }
  }
  state.failedAttempts = 0
  var issued = issue(state)
  saveAuth(issued.state)
  return issued.body
}

function refresh(refreshToken) {
  var now = Date.now()
  var state = authState()
  var active = state.sessions.filter(function (session) { return session.expiresAt > now })
  var hash = tokenHash(refreshToken)
  var current = null
  for (var i = 0; i < active.length; i += 1) {
    if (active[i].hash === hash) current = active[i]
  }
  if (!current) {
    state.sessions = active
    saveAuth(state)
    return { ok: false, status: 401, error: 'Sessão expirada. Entre novamente.' }
  }
  state.sessions = active.filter(function (session) { return session !== current })
  var issued = issue(state)
  saveAuth(issued.state)
  return issued.body
}

function readFinance(accessToken) {
  var state = authState()
  if (!validAccess(state, accessToken)) return { ok: false, status: 401, error: 'Sessão expirada. Entre novamente.' }
  return { ok: true, status: 200, data: finance() }
}

function writeFinance(accessToken, data) {
  var state = authState()
  if (!validAccess(state, accessToken)) return { ok: false, status: 401, error: 'Sessão expirada. Entre novamente.' }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, status: 400, error: 'O banco precisa ser um objeto JSON.' }
  driveFile('finance.json', JSON.stringify(emptyFinance())).setContent(JSON.stringify(data))
  return { ok: true, status: 200 }
}

function issue(state) {
  var now = Date.now()
  var refreshToken = randomToken()
  state.sessions = state.sessions.filter(function (session) { return session.expiresAt > now })
  state.sessions.push({ hash: tokenHash(refreshToken), expiresAt: now + SESSION_MS })
  state.sessions = state.sessions.slice(-10)
  return {
    state: state,
    body: {
      ok: true,
      status: 200,
      accessToken: signAccess(state.secret, now),
      refreshToken: refreshToken,
      expiresAt: new Date(now + SESSION_MS).toISOString(),
    },
  }
}

function validAccess(state, token) {
  var parts = String(token || '').split('.')
  if (parts.length !== 3) return false
  var expected = b64url(Utilities.computeHmacSha256Signature(parts[0] + '.' + parts[1], state.secret))
  if (expected !== parts[2]) return false
  var payload = JSON.parse(decode(parts[1]))
  return payload && payload.sub === USERNAME && typeof payload.exp === 'number' && payload.exp > Date.now()
}

function signAccess(secret, now) {
  var body = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({ sub: USERNAME, exp: now + SESSION_MS }))
  return body + '.' + b64url(Utilities.computeHmacSha256Signature(body, secret))
}

function authState() {
  var raw = driveFile('auth.json', JSON.stringify(emptyAuth())).getBlob().getDataAsString()
  var value = JSON.parse(raw)
  if (!value || typeof value.secret !== 'string' || !value.secret) return emptyAuth()
  var sessions = Array.isArray(value.sessions) ? value.sessions : []
  return {
    secret: value.secret,
    failedAttempts: value.failedAttempts > 0 ? value.failedAttempts : 0,
    locked: value.locked === true,
    sessions: sessions.filter(function (session) { return session && typeof session.hash === 'string' && isFinite(session.expiresAt) }),
  }
}

function saveAuth(state) {
  driveFile('auth.json', JSON.stringify(emptyAuth())).setContent(JSON.stringify(state))
}

function finance() {
  var raw = driveFile('finance.json', JSON.stringify(emptyFinance())).getBlob().getDataAsString()
  var value = JSON.parse(raw)
  return value && typeof value === 'object' ? value : emptyFinance()
}

function emptyAuth() {
  return { secret: randomToken(), failedAttempts: 0, locked: false, sessions: [] }
}

function emptyFinance() {
  return {
    categories: [],
    transactions: [],
    settlements: [],
    recurrences: [],
    creditCards: [],
    purchases: [],
    installmentGroups: [],
    parties: [],
    banks: [],
    bankTransfers: [],
    bankBalances: [],
    listOrders: [],
    settings: null,
  }
}

function driveFile(name, seed) {
  var props = PropertiesService.getScriptProperties()
  var folderId = props.getProperty('FOLDER_ID')
  var folder = null
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId) } catch (error) { folder = null }
  }
  if (!folder) {
    folder = DriveApp.createFolder('personal-finance-app')
    props.setProperty('FOLDER_ID', folder.getId())
  }
  var files = folder.getFilesByName(name)
  if (files.hasNext()) return files.next()
  return folder.createFile(name, seed, MimeType.PLAIN_TEXT)
}

function tokenHash(token) {
  return b64url(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''), Utilities.Charset.UTF_8))
}

function randomToken() {
  return tokenHash(Utilities.getUuid() + Utilities.getUuid() + new Date().getTime())
}

function b64url(value) {
  var bytes = typeof value === 'string' ? Utilities.newBlob(value).getBytes() : value
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '')
}

function decode(value) {
  var pad = value.length % 4 === 0 ? '' : new Array(5 - (value.length % 4)).join('=')
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(value + pad)).getDataAsString()
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}
