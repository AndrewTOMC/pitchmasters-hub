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
