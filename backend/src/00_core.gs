/************************************************************
 * PITCHMASTERS HUB · Google Apps Script backend · v2 (Royale)
 * ----------------------------------------------------------
 * One Web App serving three front ends:
 *   1. the Pitch Hub (pitchers AND judges)   pitchershub.vercel.app
 *   2. the admin console                      pitchershub.vercel.app/admin
 *   3. the automated emails                   sent from Andrew's Gmail alias
 *
 * All requests are POST with a plain-text JSON body (a CORS "simple"
 * request, so no preflight). Do NOT send application/json from the
 * front end or the browser will block the response.
 *
 *   { action:"signin",      email, password, role }
 *   { action:"save",        email, password, ...fields }
 *   { action:"submit",      email, password, ...fields }   lock in + confirmation email
 *   { action:"uploadCover", email, password, filename, mimeType, dataBase64 }
 *   { action:"ask",         email, password?, name?, message }
 *   { action:"admin",       op, auth:{email,password}, ...payload }
 *
 * FULL-FILE RULE: paste this whole file over the old one, then
 * Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * The /exec URL stays the same.
 ************************************************************/

var CFG = {
  SHEET_ID:          '1I2x6gXW7zDxnOBrbCp-dTU_vBaSzW5xWzPirb9BXAFA',
  PEOPLE_TAB:        'Royale Oct 2026',      // this event's pitchers + judges
  ADMINS_TAB:        'Admins',               // console logins
  MESSAGES_TAB:      'Messages',             // "Ask the team" messages
  PARENT_FOLDER_ID:  '1qeNXlhBUq-YSKZwsvLcBrkU2ZybrebaA', // Drive: Pitcher Uploads
  EVENT_FOLDER_NAME: 'Royale Oct 2026',      // subfolder created under Pitcher Uploads
  MAKE_COVER_LINK_VIEWABLE: false,           // false = photos stay private to the Drive owner
  SHARE_FOLDER_WITH: ['lee-anne@getstoryd.com', 'annie@getstoryd.com'], // can open the event's photo folder
  EXEC_URL: 'https://script.google.com/macros/s/AKfycbzG0bBQcG8uOw1QdrFOuSOmysY53N804XaIbGxyxTea_7EA80Qhue3Q59P_HFw3gdqt8w/exec',
  TZ: 'Africa/Johannesburg'
};

/* Everything the emails and console say about the night. Change it here. */
var EVENT = {
  name:          'Pitchmasters Royale',
  theme:         'Casino Royale',
  dateLong:      'Friday 30 October 2026',
  dateShort:     '30 October',
  time:          '6pm to 8:30pm',
  doors:         '6pm',
  venue:         'BMW Cape Town City',
  venueAddress:  'Harbour Arch, Foreshore, Cape Town',
  host:          'BMW Cape Town City',
  deadlineLong:  'Wednesday 28 October',
  deadlineShort: '28 October',
  pitchMinutes:  3,
  earlyTime:     '5:15',
  dressCode:     'Dress to impress: bow ties, posh frocks, slick jackets and a touch of 007 glamour.',
  hubUrl:        'https://pitchershub.vercel.app/',
  consoleUrl:    'https://pitchershub.vercel.app/admin',
  bookingUrl:    'https://qkt.io/8E9jo9',
  hostName:      'Annie Olufuwa',
  hostEmail:     'annie@getstoryd.com',
  hostPhone:     '+27 76 358 2634',
  mcName:        'Andrew Wolhuter',
  assetBase:     'https://pitchershub.vercel.app/assets/email/'
};

var MAIL = {
  SENDER:      'helloyou@andrewwolhuter.com',   // send-as alias on the script owner's Gmail
  SENDER_NAME: 'Andrew Wolhuter',
  TEST_TO:     'andrew@theonmediacollective.com',
  NOTIFY:      ['annie@getstoryd.com', 'lee-anne@getstoryd.com'] // "Ask the team" goes here
};

/* Canonical columns of the people tab. Mapped by header name, so order
   in the sheet does not matter. Missing columns are added on first write. */
var COLS = [
  'code','role','first_name','surname','full_name','email','password','phone',
  'business','title','tagline','synopsis','bio','lens','linkedin',
  'arrival','on_stage_needs','dietary','notes',
  'cover_url','cover_file_id','folder_url','folder_id',
  'status','first_seen','last_updated','submitted_at',
  'invite_sent','last_reminded','confirm_sent','added_by','added_at'
];
var ADMIN_COLS   = ['email','name','role','password','last_login'];
var MESSAGE_COLS = ['received_at','name','role','email','message','status'];

/* What each role may write from the hub. */
var EDITABLE = {
  pitcher: ['business','tagline','synopsis','arrival','on_stage_needs','phone','dietary','notes'],
  judge:   ['business','title','bio','lens','linkedin','arrival','phone','dietary','notes']
};
/* hub field name -> sheet column */
var FIELD_MAP = { onStageNeeds:'on_stage_needs', company:'business' };

/* ---------------- HTTP entry points ---------------- */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = String(body.action || '');
    if (action === 'signin')      return json_(signin_(body));
    if (action === 'save')        return json_(save_(body, false));
    if (action === 'submit')      return json_(save_(body, true));
    if (action === 'uploadCover') return json_(uploadCover_(body));
    if (action === 'ask')         return json_(ask_(body));
    if (action === 'admin')       return json_(admin_(body));
    return json_({ ok:false, error:'unknown_action' });
  } catch (err) {
    return json_({ ok:false, error:'server', detail:String(err && err.message || err) });
  }
}

function doGet(e) {
  return json_({ ok:true, service:'pitchmasters-hub', version:'2-royale', event:EVENT.name, time:new Date().toISOString() });
}

/* ============================================================
   HUB ACTIONS (pitchers + judges)
   ============================================================ */
function signin_(body) {
  var email = normEmail_(body.email);
  var pass  = String(body.password || '').trim();
  var want  = normRole_(body.role);
  if (!email || !pass) return { ok:false, error:'missing' };

  var ctx = findPerson_(email);
  if (!ctx) return { ok:false, error:'not_found' };
  if (String(ctx.get('password')).trim().toLowerCase() !== pass.toLowerCase())
    return { ok:false, error:'bad_password' };
  if (ctx.get('status') === 'withdrawn') return { ok:false, error:'withdrawn' };

  var actual = normRole_(ctx.get('role')) || 'pitcher';
  if (want && want !== actual) return { ok:false, error:'wrong_role', role:actual };

  if (!ctx.get('first_seen')) { ctx.set('first_seen', new Date()); ctx.set('status', stateOf_(ctx)); }
  return { ok:true, person: publicPerson_(ctx, true) };
}

function save_(body, lockIn) {
  var ctx = authed_(body);
  if (ctx.error) return ctx;
  var role = normRole_(ctx.get('role')) || 'pitcher';
  var allowed = EDITABLE[role];

  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  var emailed = false;
  try {
    Object.keys(body).forEach(function (k) {
      var col = FIELD_MAP[k] || camelToSnake_(k);
      if (allowed.indexOf(col) < 0) return;
      var v = body[k];
      if (v === undefined || v === null) return;
      ctx.set(col, String(v).slice(0, 4000));
    });
    ctx.set('last_updated', new Date());
    if (lockIn) ctx.set('submitted_at', new Date());
    ctx.set('status', stateOf_(ctx));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  if (lockIn && !ctx.get('confirm_sent')) {
    try { sendKind_('confirmation', ctx); emailed = true; } catch (e) { /* confirmation is best-effort */ }
  }
  return { ok:true, emailed:emailed, person: publicPerson_(ctx, false) };
}

function uploadCover_(body) {
  var ctx = authed_(body);
  if (ctx.error) return ctx;
  if (!body.dataBase64) return { ok:false, error:'no_file' };

  var folder = ensurePersonFolder_(ctx);
  var raw   = String(body.dataBase64).replace(/^data:[^;]+;base64,/, '');
  var bytes = Utilities.base64Decode(raw);
  var mime  = body.mimeType || 'image/jpeg';
  var name  = (ctx.get('code') || 'person') + '-' + (normRole_(ctx.get('role')) === 'judge' ? 'headshot' : 'cover') + '-' +
              String(body.filename || ('upload.' + extFor_(mime))).replace(/[^\w.\- ]+/g, '');
  var blob  = Utilities.newBlob(bytes, mime, name);

  var oldId = ctx.get('cover_file_id');
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {} }

  var file = folder.createFile(blob);
  if (CFG.MAKE_COVER_LINK_VIEWABLE) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  }
  ctx.set('cover_file_id', file.getId());
  ctx.set('cover_url', file.getUrl());
  ctx.set('last_updated', new Date());
  ctx.set('status', stateOf_(ctx));
  return { ok:true, coverUrl:file.getUrl(), fileId:file.getId() };
}

/* "Ask the team": stored in the Messages tab and emailed to Annie + Lee-Anne.
   Works signed in (we know who) or from the stage door (email required). */
function ask_(body) {
  var message = String(body.message || '').trim().slice(0, 3000);
  if (!message) return { ok:false, error:'empty' };
  var email = normEmail_(body.email), name = String(body.name || '').trim(), role = '';
  if (body.password) {
    var ctx = authed_(body);
    if (!ctx.error) { name = ctx.get('full_name') || ctx.get('first_name'); role = cap_(normRole_(ctx.get('role'))); }
  }
  if (!email || email.indexOf('@') < 1) return { ok:false, error:'need_email' };

  var sh = tab_(CFG.MESSAGES_TAB, MESSAGE_COLS);
  sh.appendRow([new Date(), safeCell_(name), role || 'Not signed in', safeCell_(email), safeCell_(message), 'new']);

  try {
    var subject = 'Pitch Hub question from ' + (name || email) + (role ? ' (' + role + ')' : '');
    var text = (name || email) + (role ? ', ' + role : '') + ' asked:\n\n' + message +
               '\n\nReply to this email to answer them directly.\n\nSent from the Pitchmasters Pitch Hub.';
    GmailApp.sendEmail(MAIL.NOTIFY.join(','), subject, text, {
      from: MAIL.SENDER, name: 'Pitchmasters Pitch Hub', replyTo: email
    });
  } catch (e) { /* message is stored even if the notification fails */ }
  return { ok:true };
}

/* ============================================================
   PEOPLE · state, lookup, shaping
   ============================================================ */
/* new -> invited -> started -> complete -> locked   (or withdrawn) */
function stateOf_(ctx) {
  if (ctx.get('status') === 'withdrawn') return 'withdrawn';
  if (ctx.get('submitted_at')) return 'locked';
  if (isComplete_(ctx)) return 'complete';
  if (ctx.get('first_seen')) return 'started';
  if (ctx.get('invite_sent')) return 'invited';
  return 'new';
}
function isComplete_(ctx) {
  var role = normRole_(ctx.get('role')) || 'pitcher';
  var has = function (k) { return !!String(ctx.get(k) || '').trim(); };
  if (role === 'judge') return has('cover_url') && has('bio') && has('arrival') && has('phone');
  return has('cover_url') && has('synopsis') && has('arrival') && has('phone');
}
function checksOf_(ctx) {
  var role = normRole_(ctx.get('role')) || 'pitcher';
  var has = function (k) { return !!String(ctx.get(k) || '').trim(); };
  return {
    photo:     has('cover_url'),
    profile:   role === 'judge' ? has('bio') : has('synopsis'),
    logistics: has('arrival') && has('phone')
  };
}

function authed_(body) {
  var res = signin_({ email:body.email, password:body.password });
  if (!res.ok) return { ok:false, error:'auth', reason:res.error };
  return findPerson_(normEmail_(body.email));
}

/* A row wrapper: ctx.get('col'), ctx.set('col', v). */
function findPerson_(email) {
  var sh = tab_(CFG.PEOPLE_TAB, COLS);
  var values = sh.getDataRange().getValues();
  var idx = headerIndex_(values[0]);
  if (idx.email === undefined) return null;
  for (var r = 1; r < values.length; r++) {
    if (normEmail_(values[r][idx.email]) === email) return rowCtx_(sh, r + 1, values[r], idx);
  }
  return null;
}
function allPeople_() {
  var sh = tab_(CFG.PEOPLE_TAB, COLS);
  var values = sh.getDataRange().getValues();
  var idx = headerIndex_(values[0]);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    if (!String(values[r][idx.email] || '').trim()) continue;
    out.push(rowCtx_(sh, r + 1, values[r], idx));
  }
  return out;
}
function rowCtx_(sh, rowNum, row, idx) {
  var ctx = { sh:sh, rowNum:rowNum, row:row, idx:idx };
  ctx.get = function (k) { var c = idx[k]; return c === undefined ? '' : row[c]; };
  ctx.set = function (k, v) {
    var c = idx[k];
    if (c === undefined) { c = addColumn_(sh, k); idx[k] = c; }
    sh.getRange(rowNum, c + 1).setValue(safeCell_(v));
    row[c] = v;
  };
  return ctx;
}

function publicPerson_(ctx, withThumb) {
  var g = function (k) { return fmt_(ctx.get(k)); };
  var p = {
    role: normRole_(g('role')) || 'pitcher',
    code: g('code'), first: g('first_name'), name: g('full_name') || g('first_name'),
    email: g('email'), status: stateOf_(ctx),
    business: g('business'), title: g('title'), tagline: g('tagline'), synopsis: g('synopsis'),
    bio: g('bio'), lens: g('lens'), linkedin: g('linkedin'),
    arrival: g('arrival'), onStageNeeds: g('on_stage_needs'), phone: g('phone'),
    dietary: g('dietary'), notes: g('notes'),
    coverUrl: g('cover_url'), lockedAt: g('submitted_at')
  };
  if (withThumb && ctx.get('cover_file_id')) p.coverThumb = thumbOf_(ctx.get('cover_file_id'));
  return p;
}

function thumbOf_(fileId) {
  try {
    var t = DriveApp.getFileById(fileId).getThumbnail();
    if (!t) return '';
    return 'data:' + t.getContentType() + ';base64,' + Utilities.base64Encode(t.getBytes());
  } catch (e) { return ''; }
}

function ensurePersonFolder_(ctx) {
  var existing = ctx.get('folder_id');
  if (existing) { try { return DriveApp.getFolderById(existing); } catch (e) {} }
  var parent = eventFolder_();
  var label = ((ctx.get('code') || '') + ' ' + (ctx.get('full_name') || ctx.get('first_name') || 'Person') +
              ' (' + cap_(normRole_(ctx.get('role')) || 'pitcher') + ')').trim();
  var folder = parent.createFolder(label);
  ctx.set('folder_id', folder.getId());
  ctx.set('folder_url', folder.getUrl());
  return folder;
}
function eventFolder_() {
  var parent = DriveApp.getFolderById(CFG.PARENT_FOLDER_ID);
  var it = parent.getFoldersByName(CFG.EVENT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  var folder = parent.createFolder(CFG.EVENT_FOLDER_NAME);
  (CFG.SHARE_FOLDER_WITH || []).forEach(function (email) {
    try { folder.addViewer(email); } catch (e) { /* sharing is best-effort */ }
  });
  return folder;
}

/* ============================================================
   SHEET HELPERS
   ============================================================ */
function ss_() { return SpreadsheetApp.openById(CFG.SHEET_ID); }
function tab_(name, cols) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1000, cols.length).setNumberFormat('@'); // keep +27 numbers as text
  }
  return sh;
}
function headerIndex_(headerRow) {
  var idx = {};
  (headerRow || []).forEach(function (h, i) { var k = String(h).trim().toLowerCase(); if (k) idx[k] = i; });
  return idx;
}
/* Sheets auto-parses typed text: "5:45" becomes a time, "0831112222" loses its
   zero, "+27..." becomes a number and "=..." runs as a formula. A leading
   apostrophe stores the exact text (it is not part of the value read back). */
function safeCell_(v) {
  if (typeof v !== 'string' || v === '') return v;
  if (/^[=+\-@]/.test(v) || /^[\d\s.:\/()]+$/.test(v)) return "'" + v;
  return v;
}
function addColumn_(sh, key) {
  var c = sh.getLastColumn();
  sh.getRange(1, c + 1).setValue(key);
  return c;
}

/* ============================================================
   SMALL UTILITIES
   ============================================================ */
function normEmail_(x) { return String(x || '').trim().toLowerCase(); }
function normRole_(x) {
  var r = String(x || '').trim().toLowerCase();
  if (r.indexOf('judge') === 0) return 'judge';
  if (r.indexOf('pitch') === 0) return 'pitcher';
  return '';
}
function cap_(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function camelToSnake_(k) { return String(k).replace(/([A-Z])/g, '_$1').toLowerCase(); }
function extFor_(mime) { return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'})[mime] || 'jpg'; }
function fmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'd MMM yyyy, HH:mm');
  return v == null ? '' : String(v);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   KEEP-WARM · run installKeepWarm() once from the editor
   ============================================================ */
function keepWarm() {
  try { UrlFetchApp.fetch(CFG.EXEC_URL + '?ping=1', { muteHttpExceptions:true }); } catch (e) {}
}
function installKeepWarm() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'keepWarm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(5).create();
  keepWarm();
  return 'Keep-warm on: pinging every 5 minutes.';
}
