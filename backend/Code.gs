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


/* ============================================================
   ADMIN CONSOLE API
   Logins live in the "Admins" tab: email · name · role · password.
     role "admin"  = Lee-Anne, Andrew: everything
     role "viewer" = Annie: read and export only
   ============================================================ */
var ADMIN_ONLY = ['savePerson','importPeople','withdraw','resetPassword','send','test','sendAccess'];

function admin_(body) {
  var me = adminAuth_(body.auth || {});
  if (!me) return { ok:false, error:'auth' };
  var op = String(body.op || '');
  if (ADMIN_ONLY.indexOf(op) >= 0 && me.role !== 'admin') return { ok:false, error:'forbidden' };

  if (op === 'login')         return { ok:true, admin:{ name:me.name, email:me.email, role:me.role }, event:EVENT };
  if (op === 'list')          return adminList_(me);
  if (op === 'thumb')         return { ok:true, thumb: (function () { var c = findPerson_(normEmail_(body.email)); return c && c.get('cover_file_id') ? thumbOf_(c.get('cover_file_id')) : ''; })() };
  if (op === 'savePerson')    return adminSavePerson_(me, body.person || {});
  if (op === 'importPeople')  return adminImport_(me, body.rows || []);
  if (op === 'withdraw')      return adminWithdraw_(body.email, !!body.withdrawn);
  if (op === 'resetPassword') return adminResetPassword_(body.email);
  if (op === 'send')          return adminSend_(body.kind, body.emails || []);
  if (op === 'test')          return adminTest_(me, body.kind, body.role);
  if (op === 'preview')       return adminPreview_(me, body.kind, body.role, body.email);
  if (op === 'sendAccess')    return adminSendAccess_(me, body.email);
  return { ok:false, error:'unknown_op' };
}

function adminAuth_(auth) {
  var email = normEmail_(auth.email), pass = String(auth.password || '').trim();
  if (!email || !pass) return null;
  var sh = tab_(CFG.ADMINS_TAB, ADMIN_COLS);
  var v = sh.getDataRange().getValues(), idx = headerIndex_(v[0]);
  for (var r = 1; r < v.length; r++) {
    if (normEmail_(v[r][idx.email]) !== email) continue;
    if (String(v[r][idx.password]).trim() !== pass) return null;
    try { sh.getRange(r + 1, idx.last_login + 1).setValue(new Date()); } catch (e) {}
    var role = String(v[r][idx.role] || '').trim().toLowerCase() === 'admin' ? 'admin' : 'viewer';
    return { email:email, name:String(v[r][idx.name] || email), role:role };
  }
  return null;
}

function adminList_(me) {
  var people = allPeople_().map(function (ctx) {
    var g = function (k) { return fmt_(ctx.get(k)); };
    var p = {
      code:g('code'), role:normRole_(g('role')) || 'pitcher', first:g('first_name'), surname:g('surname'),
      name:g('full_name') || (g('first_name') + ' ' + g('surname')).trim(), email:g('email'), phone:g('phone'),
      business:g('business'), title:g('title'), tagline:g('tagline'), synopsis:g('synopsis'), bio:g('bio'),
      lens:g('lens'), linkedin:g('linkedin'), arrival:g('arrival'), onStageNeeds:g('on_stage_needs'),
      dietary:g('dietary'), notes:g('notes'), coverUrl:g('cover_url'), folderUrl:g('folder_url'),
      state:stateOf_(ctx), checks:checksOf_(ctx),
      firstSeen:g('first_seen'), lastUpdated:g('last_updated'), lockedAt:g('submitted_at'),
      inviteSent:g('invite_sent'), lastReminded:g('last_reminded'), confirmSent:g('confirm_sent')
    };
    if (me.role === 'admin') p.password = g('password');
    return p;
  });

  var msgs = [];
  try {
    var ms = tab_(CFG.MESSAGES_TAB, MESSAGE_COLS).getDataRange().getValues(), mi = headerIndex_(ms[0]);
    for (var r = ms.length - 1; r >= 1 && msgs.length < 50; r--) {
      msgs.push({ at:fmt_(ms[r][mi.received_at]), name:fmt_(ms[r][mi.name]), role:fmt_(ms[r][mi.role]),
                  email:fmt_(ms[r][mi.email]), message:fmt_(ms[r][mi.message]) });
    }
  } catch (e) {}

  var out = { ok:true, people:people, messages:msgs, event:EVENT, me:{ name:me.name, role:me.role } };
  if (me.role === 'admin') {
    out.sheetUrl = ss_().getUrl();
    try { out.folderUrl = eventFolder_().getUrl(); } catch (e) {}
    try { out.quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  }
  return out;
}

/* Add or update one person. Email is the key. */
function adminSavePerson_(me, p) {
  var email = normEmail_(p.email);
  var original = normEmail_(p.originalEmail || p.email);
  if (!email || email.indexOf('@') < 1) return { ok:false, error:'bad_email' };
  var role = normRole_(p.role) || 'pitcher';

  var lock = LockService.getScriptLock(); lock.tryLock(20000);
  try {
    var ctx = findPerson_(original);
    if (original !== email && findPerson_(email)) return { ok:false, error:'duplicate' };
    var isNew = !ctx;
    if (isNew) {
      var sh = tab_(CFG.PEOPLE_TAB, COLS);
      var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      var blank = header.map(function () { return ''; });
      ctx = rowCtx_(sh, Math.max(sh.getLastRow(), 1) + 1, blank, headerIndex_(header));
      ctx.set('email', email);   // claims the row first
      ctx.set('code', nextCode_(role));
      ctx.set('password', newPassword_());
      ctx.set('added_by', me.name);
      ctx.set('added_at', new Date());
    }
    var first = String(p.first || p.first_name || ctx.get('first_name') || '').trim();
    var surname = String(p.surname != null ? p.surname : ctx.get('surname') || '').trim();
    ctx.set('email', email);
    ctx.set('role', cap_(role));
    ctx.set('first_name', first);
    ctx.set('surname', surname);
    ctx.set('full_name', (first + ' ' + surname).trim());
    if (p.phone != null)    ctx.set('phone', String(p.phone).trim());
    if (p.business != null) ctx.set('business', String(p.business).trim());
    if (p.title != null)    ctx.set('title', String(p.title).trim());
    ctx.set('status', stateOf_(ctx));
    SpreadsheetApp.flush();
    return { ok:true, created:isNew, code:ctx.get('code'), password:ctx.get('password') };
  } finally { lock.releaseLock(); }
}

/* Paste-in import: rows of {first, surname, email, phone, role, business}. Skips existing emails. */
function adminImport_(me, rows) {
  var added = 0, skipped = [];
  rows.slice(0, 200).forEach(function (r) {
    var email = normEmail_(r.email);
    if (!email || email.indexOf('@') < 1) { skipped.push({ email:r.email || '(blank)', reason:'no valid email' }); return; }
    if (findPerson_(email)) { skipped.push({ email:email, reason:'already on the list' }); return; }
    var res = adminSavePerson_(me, r);
    if (res.ok) added++; else skipped.push({ email:email, reason:res.error });
  });
  return { ok:true, added:added, skipped:skipped };
}

function adminWithdraw_(email, withdrawn) {
  var ctx = findPerson_(normEmail_(email));
  if (!ctx) return { ok:false, error:'not_found' };
  ctx.set('status', withdrawn ? 'withdrawn' : '');
  if (!withdrawn) ctx.set('status', stateOf_(ctx));
  return { ok:true, state:stateOf_(ctx) };
}

function adminResetPassword_(email) {
  var ctx = findPerson_(normEmail_(email));
  if (!ctx) return { ok:false, error:'not_found' };
  var pw = newPassword_();
  ctx.set('password', pw);
  return { ok:true, password:pw };
}

/* kind: invite | reminder | confirmation. Reminders skip anyone complete or locked. */
function adminSend_(kind, emails) {
  if (['invite','reminder','confirmation'].indexOf(kind) < 0) return { ok:false, error:'bad_kind' };
  var sent = 0, skipped = [], failed = [];
  emails.slice(0, 150).forEach(function (raw) {
    var ctx = findPerson_(normEmail_(raw));
    if (!ctx) { skipped.push({ email:raw, reason:'not on the list' }); return; }
    var st = stateOf_(ctx);
    if (st === 'withdrawn') { skipped.push({ email:raw, reason:'withdrawn' }); return; }
    if (kind === 'reminder' && (st === 'complete' || st === 'locked')) { skipped.push({ email:raw, reason:'already done' }); return; }
    try { sendKind_(kind, ctx); sent++; Utilities.sleep(350); }
    catch (e) { failed.push({ email:raw, reason:String(e.message || e) }); }
  });
  return { ok:true, sent:sent, skipped:skipped, failed:failed };
}

/* Sends one sample to the signed-in admin, filled with sample details. */
function adminTest_(me, kind, role) {
  try {
    var m = emailFor_(kind, samplePerson_(me, role));
    GmailApp.sendEmail(me.email, m.subject + ' (TEST)', m.text, { from:MAIL.SENDER, name:MAIL.SENDER_NAME, replyTo:MAIL.SENDER, htmlBody:m.html });
    return { ok:true, sentTo:me.email };
  } catch (e) { return { ok:false, error:'send_failed', detail:String(e.message || e) }; }
}

function adminPreview_(me, kind, role, email) {
  var person = null;
  if (email) { var ctx = findPerson_(normEmail_(email)); if (ctx) person = personForEmail_(ctx); }
  if (!person) person = samplePerson_(me, role);
  if (me.role !== 'admin') person.password = '••••••••';
  var m = emailFor_(kind, person);
  return { ok:true, subject:m.subject, html:m.html };
}

/* Console access email for a fellow admin/viewer (their own password). */
function adminSendAccess_(me, email) {
  email = normEmail_(email);
  var sh = tab_(CFG.ADMINS_TAB, ADMIN_COLS), v = sh.getDataRange().getValues(), idx = headerIndex_(v[0]);
  for (var r = 1; r < v.length; r++) {
    if (normEmail_(v[r][idx.email]) !== email) continue;
    var name = String(v[r][idx.name] || '').split(' ')[0] || 'there';
    var role = String(v[r][idx.role]).toLowerCase() === 'admin' ? 'admin' : 'viewer';
    var m = accessEmail_({ first:name, email:email, password:String(v[r][idx.password]), role:role, from:me.name });
    GmailApp.sendEmail(email, m.subject, m.text, { from:MAIL.SENDER, name:MAIL.SENDER_NAME, replyTo:MAIL.SENDER, htmlBody:m.html });
    return { ok:true, sentTo:email };
  }
  return { ok:false, error:'not_found' };
}

/* ============================================================
   EMAIL SENDING
   ============================================================ */
var STAMP = { invite:'invite_sent', reminder:'last_reminded', confirmation:'confirm_sent' };

function sendKind_(kind, ctx) {
  var m = emailFor_(kind, personForEmail_(ctx));
  GmailApp.sendEmail(String(ctx.get('email')).trim(), m.subject, m.text, {
    from: MAIL.SENDER, name: MAIL.SENDER_NAME, replyTo: MAIL.SENDER, htmlBody: m.html
  });
  ctx.set(STAMP[kind], new Date());
  ctx.set('status', stateOf_(ctx));
}

function personForEmail_(ctx) {
  var g = function (k) { return fmt_(ctx.get(k)); };
  return {
    role: normRole_(g('role')) || 'pitcher', first: g('first_name') || 'there', name: g('full_name'),
    email: g('email'), password: g('password'), business: g('business'), title: g('title'),
    tagline: g('tagline'), synopsis: g('synopsis'), bio: g('bio'), lens: g('lens'), linkedin: g('linkedin'),
    arrival: g('arrival'), phone: g('phone'), dietary: g('dietary'), notes: g('notes'),
    checks: checksOf_(ctx)
  };
}

function samplePerson_(me, role) {
  role = normRole_(role) || 'pitcher';
  var first = String(me.name || 'Sample').split(' ')[0];
  return {
    role: role, first: first, name: me.name, email: me.email, password: 'royale-07',
    business: role === 'judge' ? 'Sample Company' : 'Sample Business', title: role === 'judge' ? 'Founder' : '',
    tagline: '', synopsis: '', bio: '', lens: '', linkedin: '', arrival: EVENT.earlyTime, phone: '', dietary: '', notes: '',
    checks: { photo:true, profile:true, logistics:false }
  };
}

/* ============================================================
   CODES + PASSWORDS
   ============================================================ */
function nextCode_(role) {
  var prefix = role === 'judge' ? 'JG-' : 'PM-';
  var max = 0;
  allPeople_().forEach(function (ctx) {
    var c = String(ctx.get('code') || '');
    if (c.indexOf(prefix) === 0) max = Math.max(max, parseInt(c.slice(prefix.length), 10) || 0);
  });
  return prefix + ('0' + (max + 1)).slice(-2);
}
var PW_WORDS = ['baccarat','martini','tuxedo','royale','spotlight','encore','marquee','premiere','jackpot','velvet',
                'monaco','diamond','roulette','highroller','limelight','golden','curtain','chemin','croupier','ovation'];
function newPassword_() {
  var used = {};
  allPeople_().forEach(function (ctx) { used[String(ctx.get('password')).toLowerCase()] = 1; });
  for (var i = 0; i < 200; i++) {
    var pw = PW_WORDS[Math.floor(Math.random() * PW_WORDS.length)] + '-' + (10 + Math.floor(Math.random() * 90));
    if (!used[pw]) return pw;
  }
  return 'royale-' + Date.now().toString().slice(-5);
}


/* ============================================================
   EMAILS · Pitchmasters Royale
   emailFor_(kind, person) -> { subject, html, text }
     kind:   invite | reminder | confirmation
     person: { role:'pitcher'|'judge', first, name, email, password,
               business, title, tagline, synopsis, bio, lens, linkedin,
               arrival, phone, dietary, notes,
               checks:{ photo, profile, logistics } }
   accessEmail_({ first, email, password, role, from }) -> console access
   Every event fact comes from EVENT (00_core). No web fonts, no
   images except the hosted header. Table layout, 600px, Outlook-safe.
   ============================================================ */

var EM = {
  wine:'#663C3D', red:'#8A4340', night:'#3A2023', outer:'#4A2A2C',
  gold:'#E6B537', goldInk:'#8A6413', cream:'#F7EFE3', paper:'#FBF6EE',
  paper2:'#F3E8DA', line:'#E4D5C3', ink:'#2E1A1B', ink2:'#5C4A46', ok:'#2F7A55',
  serif:"Didot,'Bodoni 72','Bodoni MT','Big Caslon',Georgia,'Times New Roman',serif",
  sans:'Arial,Helvetica,sans-serif',
  mono:"'Courier New',Courier,monospace"
};

function emailFor_(kind, person) {
  var p = person || {};
  var role = normRole_(p.role) || 'pitcher';
  var first = String(p.first || 'there').trim() || 'there';
  if (kind === 'invite')       return role === 'judge' ? emJudgeInvite_(p, first) : emPitcherInvite_(p, first);
  if (kind === 'reminder')     return emReminder_(p, first, role);
  if (kind === 'confirmation') return emConfirmation_(p, first, role);
  throw new Error('Unknown email kind: ' + kind);
}

/* ---------------- PITCHER INVITE ---------------- */
function emPitcherInvite_(p, first) {
  var subject = 'Your licence to pitch, ' + first;
  var pre = 'You are on the bill for ' + EVENT.name + ' on ' + EVENT.dateShort + '. Four quick things before ' + EVENT.deadlineLong + '.';
  var tasks = emPitcherTasks_();
  var rows = [
    emHero_('Your licence to pitch', "You're on the bill,", first + '.', "The name's Pitchmasters. Pitchmasters Royale."),
    emPara_("I'm Andrew, your MC for the night, writing on behalf of Pitchmasters. I'll be the one introducing you to the room, so think of this as me getting you ready.") +
      emPara_('On <strong>' + esc_(EVENT.dateLong) + '</strong> you take the stage at <strong>' + esc_(EVENT.venue) + '</strong> for ' + EVENT.pitchMinutes + ' minutes, one spotlight and a room full of Voters. Your mission before then: four quick things in your Pitch Hub. It takes about ten minutes.'),
    emTasks_(tasks),
    emPass_(p.email, p.password, 'pitcher'),
    emButton_('Open my Pitch Hub', emHub_('pitcher')),
    emDeadline_('Please have everything in by <strong>' + esc_(EVENT.deadlineLong) + '</strong>.'),
    emBand_('Get there early', 'Arrive at <strong>' + esc_(EVENT.earlyTime) + '</strong> and we will film extra reels of you for your own channels, and I will run your pitch through with you before doors, so you walk on certain. Pick your arrival time in the hub.'),
    emNight_(true),
    emSignoff_('See you in the spotlight,')
  ];
  var text = [
    "You're on the bill, " + first + '.',
    "The name's Pitchmasters. Pitchmasters Royale.",
    '',
    "I'm Andrew, your MC for the night, writing on behalf of Pitchmasters. On " + EVENT.dateLong + ' you take the stage at ' + EVENT.venue + ' for ' + EVENT.pitchMinutes + ' minutes, one spotlight and a room full of Voters. Your mission before then: four quick things in your Pitch Hub. It takes about ten minutes.',
    '',
    emTasksText_(tasks),
    '',
    emPassText_(p.email, p.password, 'pitcher'),
    '',
    'Please have everything in by ' + EVENT.deadlineLong + '.',
    '',
    'GET THERE EARLY: arrive at ' + EVENT.earlyTime + ' and we will film extra reels of you for your own channels, and I will run your pitch through with you before doors.',
    '',
    emNightText_(true),
    '',
    'See you in the spotlight,',
    'Andrew Wolhuter, your MC',
    '',
    emFooterText_()
  ].join('\n');
  return { subject:subject, html:emShell_(subject, pre, rows, emHub_('pitcher')), text:text };
}

function emPitcherTasks_() {
  return [
    { lead:'Upload your photo.', text:'A bright, shoulders-up portrait for the programme and the screens.' },
    { lead:'Write your synopsis.', text:'Your story in about fifty words. It is the blurb the Voters read before you speak.' },
    { lead:'Rehearse your ' + EVENT.pitchMinutes + ' minutes.', text:'Coaching notes on storytelling, presenting and business talk, plus space to draft yours. Rehearse out loud to 2:45.' },
    { lead:'Sort the logistics.', text:'Arrival time, mobile number and anything we should know.' }
  ];
}

/* ---------------- JUDGE INVITE ---------------- */
function emJudgeInvite_(p, first) {
  var subject = "You're on the Royale judging panel, " + first;
  var pre = 'Thank you for judging at ' + EVENT.name + ' on ' + EVENT.dateShort + '. Three quick things before ' + EVENT.deadlineLong + '.';
  var tasks = emJudgeTasks_();
  var rows = [
    emHero_('The Royale judging panel', 'Welcome to the panel,', first + '.', 'Thank you for lending us your eye for a good pitch.'),
    emPara_("I'm Andrew, your MC for the night, writing on behalf of Pitchmasters. Thank you for agreeing to judge at <strong>" + esc_(EVENT.name) + '</strong> on <strong>' + esc_(EVENT.dateLong) + '</strong> at <strong>' + esc_(EVENT.venue) + '</strong>.') +
      emPara_('Before the night we need a few details for the programme and the screens, so the room knows who is weighing up the pitches. It takes about ten minutes in the Pitch Hub.'),
    emTasks_(tasks),
    emPass_(p.email, p.password, 'judge'),
    emButton_('Open my Pitch Hub', emHub_('judge')),
    emDeadline_('Please have everything in by <strong>' + esc_(EVENT.deadlineLong) + '</strong>.'),
    emNight_(true),
    emSignoff_('With thanks, and see you on the night,')
  ];
  var text = [
    'Welcome to the panel, ' + first + '.',
    'Thank you for lending us your eye for a good pitch.',
    '',
    "I'm Andrew, your MC for the night, writing on behalf of Pitchmasters. Thank you for agreeing to judge at " + EVENT.name + ' on ' + EVENT.dateLong + ' at ' + EVENT.venue + '.',
    'Before the night we need a few details for the programme and the screens. It takes about ten minutes in the Pitch Hub.',
    '',
    emTasksText_(tasks),
    '',
    emPassText_(p.email, p.password, 'judge'),
    '',
    'Please have everything in by ' + EVENT.deadlineLong + '.',
    '',
    emNightText_(true),
    '',
    'With thanks, and see you on the night,',
    'Andrew Wolhuter, your MC',
    '',
    emFooterText_()
  ].join('\n');
  return { subject:subject, html:emShell_(subject, pre, rows, emHub_('judge')), text:text };
}

function emJudgeTasks_() {
  return [
    { lead:'Upload your headshot.', text:'A bright, shoulders-up portrait for the programme and the screens.' },
    { lead:'Complete your profile.', text:'Your title and company, a 50 to 80 word bio, your judging lens and your LinkedIn.' },
    { lead:'Sort the logistics.', text:'Arrival time, mobile number and any dietary needs.' }
  ];
}

/* ---------------- REMINDER (both roles) ---------------- */
function emReminder_(p, first, role) {
  var subject = 'Quick nudge, ' + first + ': your Royale details';
  var missing = emMissing_(p, role);
  var pre = 'A few things are still missing from your Pitch Hub. Everything is due by ' + EVENT.deadlineLong + '.';
  var intro = role === 'judge'
    ? 'We are nearly there for <strong>' + esc_(EVENT.dateLong) + '</strong>, and we still need a few details for the programme and the screens. Here is what is missing from your Pitch Hub:'
    : 'The night is almost here, <strong>' + esc_(EVENT.dateLong) + '</strong> at <strong>' + esc_(EVENT.venue) + '</strong>, and we still need a few things to put you on that stage looking unmissable. Here is what is missing from your Pitch Hub:';
  var rows = [
    emHero_('Still to do', 'Quick nudge,', first + '.', "The clock's ticking on your Royale details."),
    emPara_(intro),
    emTasks_(missing),
    emPara_('Everything else is saved. It takes a few minutes to finish.'),
    emPass_(p.email, p.password, role),
    emButton_('Finish my Pitch Hub', emHub_(role)),
    emDeadline_('Please have everything in by <strong>' + esc_(EVENT.deadlineLong) + '</strong>.'),
    emSignoff_(role === 'judge' ? 'With thanks,' : 'See you in the spotlight,')
  ];
  var text = [
    'Quick nudge, ' + first + '.',
    '',
    (role === 'judge'
      ? 'We are nearly there for ' + EVENT.dateLong + ', and we still need a few details for the programme and the screens. Here is what is missing from your Pitch Hub:'
      : 'The night is almost here, ' + EVENT.dateLong + ' at ' + EVENT.venue + ', and we still need a few things from you. Here is what is missing from your Pitch Hub:'),
    '',
    emTasksText_(missing),
    '',
    emPassText_(p.email, p.password, role),
    '',
    'Please have everything in by ' + EVENT.deadlineLong + '.',
    '',
    'Andrew Wolhuter, your MC',
    '',
    emFooterText_()
  ].join('\n');
  return { subject:subject, html:emShell_(subject, pre, rows, emHub_(role)), text:text };
}

function emMissing_(p, role) {
  var c = p.checks || {};
  var out = [];
  if (role === 'judge') {
    if (!c.photo)     out.push({ lead:'Your headshot.', text:'A bright, shoulders-up portrait for the programme and the screens.' });
    if (!c.profile)   out.push({ lead:'Your profile.', text:'Title, company, a 50 to 80 word bio, your judging lens and LinkedIn.' });
    if (!c.logistics) out.push({ lead:'Your logistics.', text:'Arrival time and mobile number, plus any dietary needs.' });
  } else {
    if (!c.photo)     out.push({ lead:'Your photo.', text:'A bright, shoulders-up portrait for the programme and the screens.' });
    if (!c.profile)   out.push({ lead:'Your synopsis.', text:'Your story in about fifty words, the blurb the Voters read before you speak.' });
    if (!c.logistics) out.push({ lead:'Your logistics.', text:'Arrival time and mobile number, plus anything we should know.' });
  }
  if (!out.length) out.push({ lead:'Lock it in.', text:'Everything is there. Take one last look on the Review step and lock it in.' });
  return out;
}

/* ---------------- CONFIRMATION (both roles) ---------------- */
function emConfirmation_(p, first, role) {
  var c = p.checks || {};
  var subject = 'Locked in, ' + first + '. See you on the ' + emOrdinalDay_();
  var allIn = !!(c.photo && c.profile && c.logistics);
  var pre = allIn ? 'We have everything we need. Here is what landed, and what happens next.'
                  : 'Here is what landed, and what is still to add before ' + EVENT.deadlineLong + '.';
  var recap = role === 'judge'
    ? [ { label:'Your headshot', ok:!!c.photo }, { label:'Your profile', ok:!!c.profile }, { label:'Logistics', ok:!!c.logistics } ]
    : [ { label:'Your photo', ok:!!c.photo }, { label:'Your synopsis', ok:!!c.profile }, { label:'Logistics', ok:!!c.logistics } ];

  var edit = allIn
    ? 'You can still tweak anything until <strong>' + esc_(EVENT.deadlineLong) + '</strong>. Just sign in again.'
    : 'You can add the missing pieces until <strong>' + esc_(EVENT.deadlineLong) + '</strong>. Just sign in again with your stage-door pass.';

  var next = role === 'judge'
    ? 'Your headshot and bio go on the programme and the screens. Annie will be in touch about how the judging will run on the night.'
    : 'Your photo and synopsis go on the programme and the screens. Between now and then, say your pitch out loud, and time it to 2:45.';

  var arrival = String(p.arrival || '').trim();
  var early = arrival && arrival.indexOf(EVENT.earlyTime) === 0;

  var rows = [
    emHero_(role === 'judge' ? 'Your seat on the panel' : 'Licence to pitch: confirmed', 'Locked in,', first + '.', "We've got your details. Here's what landed."),
    emRecap_(recap),
    emPara_(edit),
    emPara_('<strong>What happens next.</strong> ' + next)
  ];
  if (role !== 'judge') {
    rows.push(emSpacer_(28));
    rows.push(early
      ? emBand_('See you at ' + EVENT.earlyTime, 'You chose the early slot. Brilliant. We will film extra reels of you for your own channels, and I will run your pitch through with you before doors.')
      : emBand_('Can you make ' + EVENT.earlyTime + '?', 'Arrive at <strong>' + esc_(EVENT.earlyTime) + '</strong> and we will film extra reels of you for your own channels, and I will run your pitch through with you before doors. You can change your arrival time in the hub.'));
  }
  rows.push(emNight_(true));
  rows.push(emButton_('Open my Pitch Hub', emHub_(role)));
  rows.push(emSignoff_(role === 'judge' ? 'With thanks, and see you on the night,' : 'See you in the spotlight,'));

  var text = [
    'Locked in, ' + first + '.',
    "We've got your details. Here's what landed:",
    '',
    recap.map(function (r) { return (r.ok ? '[x] ' : '[ ] ') + r.label + (r.ok ? '' : ' (still to add)'); }).join('\n'),
    '',
    (allIn ? 'You can still tweak anything until ' : 'You can add the missing pieces until ') + EVENT.deadlineLong + '. Just sign in again: ' + emHub_(role),
    '',
    'What happens next: ' + next,
    '',
    role === 'judge' ? '' : (early ? 'See you at ' + EVENT.earlyTime + ' for your extra reels and a run-through with me before doors.'
                                   : 'Can you make ' + EVENT.earlyTime + '? Arrive early for extra reels and a run-through with me before doors.'),
    '',
    emNightText_(true),
    '',
    'Andrew Wolhuter, your MC',
    '',
    emFooterText_()
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  return { subject:subject, html:emShell_(subject, pre, rows, emHub_(role)), text:text };
}

/* ---------------- CONSOLE ACCESS ---------------- */
function accessEmail_(o) {
  o = o || {};
  var first = String(o.first || 'there');
  var isAdmin = o.role === 'admin';
  var subject = 'Your ' + EVENT.name + ' console access';
  var pre = 'Sign in to the Pitch Hub console to ' + (isAdmin ? 'manage pitchers and judges.' : 'follow how pitchers and judges are getting on.');
  var can = isAdmin
    ? 'You can add pitchers and judges, send their invites and reminders, and see everything they hand in.'
    : 'You can see every pitcher and judge, their photos, synopses, bios and logistics, and export the list. Adding people and sending emails stay with the admins.';
  var rows = [
    emHero_('Pitch Hub console', 'Your console access,', first + '.', 'Everything for ' + EVENT.name + ' in one place.'),
    emPara_(esc_(o.from || 'Andrew') + ' has given you ' + (isAdmin ? '<strong>admin</strong>' : '<strong>view-only</strong>') + ' access to the ' + esc_(EVENT.name) + ' console.') +
      emPara_(can),
    emPass_(o.email, o.password, 'console'),
    emButton_('Open the console', EVENT.consoleUrl),
    emDeadline_('Keep this password to yourself. It opens the full list, including contact details.'),
    emSignoff_('Thank you,', '')
  ];
  var text = [
    'Your console access, ' + first + '.',
    '',
    (o.from || 'Andrew') + ' has given you ' + (isAdmin ? 'admin' : 'view-only') + ' access to the ' + EVENT.name + ' console.',
    can,
    '',
    'Console: ' + EVENT.consoleUrl,
    'Email: ' + (o.email || ''),
    'Password: ' + (o.password || ''),
    '',
    'Keep this password to yourself. It opens the full list, including contact details.',
    '',
    'Andrew Wolhuter',
    '',
    emFooterText_()
  ].join('\n');
  return { subject:subject, html:emShell_(subject, pre, rows, EVENT.consoleUrl), text:text };
}

/* ============================================================
   LAYOUT HELPERS
   ============================================================ */
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
}
/* Hub link that preselects the role at the stage door. */
function emHub_(role) {
  var base = String(EVENT.hubUrl || '');
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'role=' + (normRole_(role) === 'judge' ? 'judge' : 'pitcher');
}
function emOrdinalDay_() {
  var d = parseInt(String(EVENT.dateShort || ''), 10);
  if (!d) return 'night';
  var s = (d % 100 >= 11 && d % 100 <= 13) ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' })[d % 10] || 'th';
  return d + s;
}
function emRow_(inner, pad, bg) {
  return '<tr><td class="px" ' + (bg ? 'bgcolor="' + bg + '" ' : '') + 'style="padding:' + (pad || '0 40px') + ';' + (bg ? 'background-color:' + bg + ';' : '') + '">' + inner + '</td></tr>';
}

function emShell_(title, preheader, rows, link) {
  var head = '<!DOCTYPE html>\n<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
    '<meta name="x-apple-disable-message-reformatting">\n<meta name="color-scheme" content="light">\n<meta name="supported-color-schemes" content="light">\n' +
    '<title>' + esc_(title) + '</title>\n' +
    '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->\n' +
    '<style>\n' +
    '  :root{color-scheme:light;supported-color-schemes:light;}\n' +
    '  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}\n' +
    '  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}\n' +
    '  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}\n' +
    '  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}\n' +
    '  @media screen and (max-width:620px){\n' +
    '    .wrap{width:100% !important;}\n' +
    '    .px{padding-left:22px !important;padding-right:22px !important;}\n' +
    '    .h1{font-size:30px !important;line-height:36px !important;letter-spacing:2px !important;}\n' +
    '    .btn{padding-left:22px !important;padding-right:22px !important;}\n' +
    '    .btn a{display:block !important;padding:16px 10px !important;letter-spacing:1px !important;}\n' +
    '  }\n' +
    '</style>\n</head>\n';
  var body = '<body style="margin:0;padding:0;background-color:' + EM.outer + ';">\n' +
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:' + EM.outer + ';opacity:0;">' + esc_(preheader) + ' &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>\n' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + EM.outer + '" style="background-color:' + EM.outer + ';">\n' +
    '<tr><td align="center" style="padding:24px 10px 32px 10px;">\n' +
    '<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:' + EM.paper + ';">\n' +
    emHeader_(link) +
    rows.join('\n') +
    emFooter_() +
    '</table>\n</td></tr>\n</table>\n</body>\n</html>';
  return head + body;
}

function emHeader_(link) {
  return '<tr><td bgcolor="' + EM.wine + '" align="center" style="background-color:' + EM.wine + ';padding:0;">' +
    '<a href="' + esc_(link || EVENT.hubUrl) + '" style="text-decoration:none;color:' + EM.cream + ';">' +
    '<img src="' + esc_(EVENT.assetBase) + 'royale-header.png" width="600" height="200" alt="Pitchmasters Royale" ' +
    'style="display:block;width:100%;max-width:600px;height:auto;border:0;color:' + EM.cream + ';font-family:' + EM.serif + ';font-size:30px;letter-spacing:4px;text-align:center;background-color:' + EM.wine + ';">' +
    '</a></td></tr>\n' +
    '<tr><td bgcolor="' + EM.gold + '" style="background-color:' + EM.gold + ';height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>\n';
}

function emHero_(kicker, line1, line2, sub) {
  return emRow_(
    '<div style="font-family:' + EM.sans + ';font-size:12px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:' + EM.goldInk + ';font-weight:bold;mso-line-height-rule:exactly;">' + esc_(kicker) + '</div>' +
    '<div class="h1" style="font-family:' + EM.serif + ';font-size:36px;line-height:42px;letter-spacing:3px;text-transform:uppercase;color:' + EM.wine + ';font-weight:normal;padding-top:14px;mso-line-height-rule:exactly;">' +
      esc_(line1) + '<br><span style="color:' + EM.red + ';">' + esc_(line2) + '</span></div>' +
    '<div style="font-family:' + EM.serif + ';font-style:italic;font-size:18px;line-height:27px;color:' + EM.ink2 + ';padding-top:12px;mso-line-height-rule:exactly;">' + esc_(sub) + '</div>',
    '38px 40px 8px 40px');
}

function emPara_(html) {
  return emRow_('<div style="font-family:' + EM.sans + ';font-size:15px;line-height:24px;color:' + EM.ink + ';padding-top:14px;mso-line-height-rule:exactly;">' + html + '</div>', '0 40px');
}

function emTasks_(items) {
  var trs = items.map(function (t, i) {
    return '<tr>' +
      '<td width="38" valign="top" style="font-family:' + EM.serif + ';font-size:26px;line-height:28px;color:' + EM.red + ';padding:0 0 14px 0;mso-line-height-rule:exactly;">' + (i + 1) + '</td>' +
      '<td valign="top" style="font-family:' + EM.sans + ';font-size:15px;line-height:23px;color:' + EM.ink + ';padding:2px 0 14px 0;mso-line-height-rule:exactly;"><strong>' + esc_(t.lead) + '</strong> ' + esc_(t.text) + '</td>' +
      '</tr>';
  }).join('');
  return emRow_('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-top:1px solid ' + EM.line + ';"><tr><td style="height:16px;line-height:16px;font-size:16px;">&nbsp;</td><td></td></tr>' + trs + '</table>', '0 40px');
}
function emTasksText_(items) {
  return items.map(function (t, i) { return (i + 1) + '. ' + t.lead + ' ' + t.text; }).join('\n');
}

function emPass_(email, password, kind) {
  var label = kind === 'console' ? 'Your console sign-in' : 'Admit one: your stage-door pass';
  var roleLine = kind === 'judge' ? 'At the stage door, choose <strong>Judge</strong>, then sign in with:'
               : kind === 'pitcher' ? 'At the stage door, choose <strong>Pitcher</strong>, then sign in with:'
               : 'Sign in with:';
  return emRow_(
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border:1px solid ' + EM.goldInk + ';">' +
    '<tr><td style="padding:4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + EM.paper2 + '" style="background-color:' + EM.paper2 + ';border:1px dashed ' + EM.goldInk + ';">' +
    '<tr><td style="padding:18px 22px;">' +
      '<div style="font-family:' + EM.sans + ';font-size:11px;line-height:15px;letter-spacing:2px;text-transform:uppercase;color:' + EM.goldInk + ';font-weight:bold;">' + esc_(label) + '</div>' +
      '<div style="font-family:' + EM.sans + ';font-size:13px;line-height:20px;color:' + EM.ink2 + ';padding-top:8px;">' + roleLine + '</div>' +
      '<div style="font-family:' + EM.sans + ';font-size:11px;line-height:15px;letter-spacing:1px;text-transform:uppercase;color:' + EM.ink2 + ';font-weight:bold;padding-top:12px;">Email</div>' +
      '<div style="font-family:' + EM.sans + ';font-size:16px;line-height:22px;color:' + EM.ink + ';font-weight:bold;word-break:break-all;">' + esc_(email || '') + '</div>' +
      '<div style="font-family:' + EM.sans + ';font-size:11px;line-height:15px;letter-spacing:1px;text-transform:uppercase;color:' + EM.ink2 + ';font-weight:bold;padding-top:12px;">' + (kind === 'console' ? 'Password' : 'Unique password') + '</div>' +
      '<div style="font-family:' + EM.mono + ';font-size:19px;line-height:24px;color:' + EM.red + ';font-weight:bold;letter-spacing:1px;">' + esc_(password || '') + '</div>' +
    '</td></tr></table></td></tr></table>', '0 40px');
}
function emPassText_(email, password, kind) {
  return (kind === 'judge' ? 'At the stage door, choose Judge, then sign in.\n' : kind === 'pitcher' ? 'At the stage door, choose Pitcher, then sign in.\n' : '') +
    (kind === 'console' ? 'Console: ' + EVENT.consoleUrl : 'Pitch Hub: ' + emHub_(kind)) + '\nEmail: ' + (email || '') + '\nPassword: ' + (password || '');
}

function emButton_(label, url) {
  var L = esc_(String(label).toUpperCase());
  return '<tr><td class="btn" align="center" style="padding:26px 40px 8px 40px;">' +
    '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + esc_(url) + '" style="height:52px;v-text-anchor:middle;width:320px;" arcsize="50%" fillcolor="' + EM.red + '" stroke="f"><w:anchorlock/><center style="color:' + EM.cream + ';font-family:Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:2px;">' + L + '</center></v:roundrect><![endif]-->' +
    '<!--[if !mso]><!-- --><a href="' + esc_(url) + '" style="display:inline-block;background-color:' + EM.red + ';color:' + EM.cream + ';font-family:' + EM.sans + ';font-size:15px;line-height:20px;font-weight:bold;letter-spacing:2px;text-decoration:none;padding:16px 38px;border-radius:30px;border:1px solid ' + EM.wine + ';mso-padding-alt:0;">' + L + '</a><!--<![endif]-->' +
    '</td></tr>';
}

function emSpacer_(h) {
  return '<tr><td style="height:' + h + 'px;line-height:' + h + 'px;font-size:' + h + 'px;mso-line-height-rule:exactly;">&nbsp;</td></tr>';
}

function emDeadline_(html) {
  return '<tr><td class="px" align="center" style="padding:10px 40px 30px 40px;font-family:' + EM.sans + ';font-size:14px;line-height:21px;color:' + EM.ink2 + ';mso-line-height-rule:exactly;">' + html + '</td></tr>';
}

function emBand_(title, html) {
  return '<tr><td class="px" bgcolor="' + EM.night + '" style="background-color:' + EM.night + ';padding:26px 40px;">' +
    '<div style="font-family:' + EM.serif + ';font-size:22px;line-height:28px;letter-spacing:3px;text-transform:uppercase;color:' + EM.gold + ';mso-line-height-rule:exactly;">' + esc_(title) + '</div>' +
    '<div style="font-family:' + EM.sans + ';font-size:14px;line-height:22px;color:' + EM.cream + ';padding-top:8px;mso-line-height-rule:exactly;">' + html + '</div>' +
    '</td></tr>';
}

function emNight_(withDress) {
  var rows = [
    ['Date', esc_(EVENT.dateLong)],
    ['Time', esc_(EVENT.time)],
    ['Venue', esc_(EVENT.venue) + '<br><span style="color:' + EM.ink2 + ';font-weight:normal;">' + esc_(EVENT.venueAddress) + '</span>'],
    ['On the night', 'Casino-style fun, a drinks tasting, good food and great networking']
  ];
  if (withDress) rows.push(['Dress code', esc_(EVENT.dressCode)]);
  var trs = rows.map(function (r) {
    return '<tr>' +
      '<td width="112" valign="top" style="font-family:' + EM.sans + ';font-size:11px;line-height:20px;letter-spacing:1.5px;text-transform:uppercase;color:' + EM.goldInk + ';font-weight:bold;padding:9px 0;border-top:1px solid ' + EM.line + ';">' + r[0] + '</td>' +
      '<td valign="top" style="font-family:' + EM.sans + ';font-size:14px;line-height:21px;color:' + EM.ink + ';font-weight:bold;padding:9px 0;border-top:1px solid ' + EM.line + ';">' + r[1] + '</td>' +
      '</tr>';
  }).join('');
  return emRow_(
    '<div style="font-family:' + EM.serif + ';font-size:22px;line-height:28px;letter-spacing:3px;text-transform:uppercase;color:' + EM.wine + ';padding:28px 0 12px 0;">The night</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + trs + '</table>', '0 40px');
}
function emNightText_(withDress) {
  return 'THE NIGHT\n' +
    'Date: ' + EVENT.dateLong + '\n' +
    'Time: ' + EVENT.time + '\n' +
    'Venue: ' + EVENT.venue + ', ' + EVENT.venueAddress + '\n' +
    'On the night: casino-style fun, a drinks tasting, good food and great networking' +
    (withDress ? '\nDress code: ' + EVENT.dressCode : '');
}

function emRecap_(items) {
  var trs = items.map(function (r) {
    var mark = r.ok
      ? '<td width="34" valign="middle" style="padding:11px 0;border-top:1px solid ' + EM.line + ';"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background-color:' + EM.ok + ';color:#ffffff;font-family:' + EM.sans + ';font-size:13px;font-weight:bold;text-align:center;">&#10003;</div></td>'
      : '<td width="34" valign="middle" style="padding:11px 0;border-top:1px solid ' + EM.line + ';"><div style="width:20px;height:20px;line-height:20px;border-radius:12px;border:2px solid ' + EM.goldInk + ';color:' + EM.goldInk + ';font-family:' + EM.sans + ';font-size:13px;font-weight:bold;text-align:center;">&middot;</div></td>';
    return '<tr>' + mark +
      '<td valign="middle" style="font-family:' + EM.sans + ';font-size:15px;line-height:22px;color:' + EM.ink + ';font-weight:bold;padding:11px 0;border-top:1px solid ' + EM.line + ';">' + esc_(r.label) + '</td>' +
      '<td align="right" valign="middle" style="font-family:' + EM.sans + ';font-size:13px;line-height:20px;color:' + (r.ok ? EM.ok : EM.goldInk) + ';font-weight:bold;padding:11px 0;border-top:1px solid ' + EM.line + ';">' + (r.ok ? 'In' : 'Still to add') + '</td>' +
      '</tr>';
  }).join('');
  return emRow_('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-bottom:1px solid ' + EM.line + ';">' + trs + '</table>', '0 40px');
}

function emSignoff_(line, subline) {
  var sub = subline === undefined ? 'Your MC for ' + EVENT.name : subline;
  return emRow_(
    '<div style="font-family:' + EM.sans + ';font-size:15px;line-height:24px;color:' + EM.ink + ';padding:18px 0 34px 0;">' + esc_(line) + '<br>' +
    '<span style="font-family:' + EM.serif + ';font-size:20px;letter-spacing:2px;color:' + EM.wine + ';text-transform:uppercase;">Andrew Wolhuter</span>' +
    (sub ? '<br><span style="color:' + EM.ink2 + ';font-size:13px;">' + esc_(sub) + '</span>' : '') + '</div>', '0 40px');
}

function emFooter_() {
  return '<tr><td class="px" bgcolor="' + EM.wine + '" style="background-color:' + EM.wine + ';padding:26px 40px 28px 40px;">' +
    '<div style="font-family:' + EM.serif + ';font-style:italic;font-size:17px;line-height:25px;color:' + EM.cream + ';">Facts tell, stories sell.</div>' +
    '<div style="height:1px;line-height:1px;font-size:1px;background-color:' + EM.gold + ';margin:14px 0;width:60px;">&nbsp;</div>' +
    '<div style="font-family:' + EM.sans + ';font-size:12px;line-height:19px;color:' + EM.cream + ';">' +
      '<strong>Pitchmasters</strong>, an initiative of Get Story\'d<br>' +
      esc_(EVENT.hostName) + ' &middot; <a href="mailto:' + esc_(EVENT.hostEmail) + '" style="color:' + EM.cream + ';text-decoration:underline;">' + esc_(EVENT.hostEmail) + '</a> &middot; <a href="tel:' + esc_(String(EVENT.hostPhone).replace(/\s+/g, '')) + '" style="color:' + EM.cream + ';text-decoration:none;">' + esc_(EVENT.hostPhone) + '</a><br>' +
      esc_(EVENT.venue) + ', ' + esc_(EVENT.venueAddress) +
    '</div></td></tr>\n';
}
function emFooterText_() {
  return "Facts tell, stories sell.\n" +
    "Pitchmasters, an initiative of Get Story'd\n" +
    EVENT.hostName + ' | ' + EVENT.hostEmail + ' | ' + EVENT.hostPhone + '\n' +
    EVENT.venue + ', ' + EVENT.venueAddress;
}


