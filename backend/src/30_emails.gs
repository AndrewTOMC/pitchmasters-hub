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
