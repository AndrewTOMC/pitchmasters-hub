// End-to-end harness for backend/Code.gs against in-memory GAS mocks.
// Run: node backend/test/harness.js   (run backend/build.sh first)
const { makeMocks, loadCode } = require('./gas-mocks');
const M = makeMocks();
const G = loadCode(M);

/* ---------- seed the spreadsheet ---------- */
const ss = M._ss;
const july = ss.insertSheet('Untitled'); july.appendRow(['code', 'email']); july.appendRow(['PM-001', 'old@example.com']);
const people = ss.insertSheet(G.CFG.PEOPLE_TAB); people.getRange(1, 1, 1, G.COLS.length).setValues([G.COLS]);
const admins = ss.insertSheet(G.CFG.ADMINS_TAB); admins.getRange(1, 1, 1, 5).setValues([G.ADMIN_COLS]);
admins.appendRow(['andrew@theonmediacollective.com', 'Andrew Wolhuter', 'admin', 'andrew-pass-1', '']);
admins.appendRow(['lee-anne@getstoryd.com', 'Lee-Anne Webster', 'admin', 'lee-pass-2', '']);
admins.appendRow(['annie@getstoryd.com', 'Annie Olufuwa', 'viewer', 'annie-pass-3', '']);
const msgs = ss.insertSheet(G.CFG.MESSAGES_TAB); msgs.getRange(1, 1, 1, G.MESSAGE_COLS.length).setValues([G.MESSAGE_COLS]);

/* ---------- helpers ---------- */
const post = (body) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
const LEE = { email: 'lee-anne@getstoryd.com', password: 'lee-pass-2' };
const ANNIE = { email: 'annie@getstoryd.com', password: 'annie-pass-3' };
const admin = (op, extra, auth) => post(Object.assign({ action: 'admin', op, auth: auth || LEE }, extra || {}));
const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail: cond ? '' : JSON.stringify(detail).slice(0, 300) }); }
const sentCount = () => M._sent.length;
const lastSent = () => M._sent[M._sent.length - 1];
const row = (email) => { const v = people.getDataRange().getValues(); const h = v[0]; const i = h.indexOf('email'); const r = v.find((x, k) => k && String(x[i]).toLowerCase() === email); if (!r) return null; const o = {}; h.forEach((k, j) => o[k] = r[j]); return o; };

/* ---------- health ---------- */
const health = JSON.parse(G.doGet({}).getContent());
check('doGet health', health.ok && health.version === '2-royale', health);

/* ---------- admin auth ---------- */
let r = admin('login');
check('admin login (Lee-Anne admin)', r.ok && r.admin.role === 'admin' && r.event && r.event.name, r);
r = admin('login', {}, { email: 'lee-anne@getstoryd.com', password: 'wrong' });
check('admin login bad password refused', !r.ok && r.error === 'auth', r);
r = admin('login', {}, ANNIE);
check('admin login (Annie viewer)', r.ok && r.admin.role === 'viewer', r);
r = admin('login', {}, { email: 'nobody@x.com', password: 'x' });
check('admin login unknown email refused', !r.ok && r.error === 'auth', r);

/* ---------- add people ---------- */
r = admin('savePerson', { person: { first: 'Thandi', surname: 'Molefe', email: 'Thandi@Ubuntu.co.za', phone: '+27821234567', role: 'pitcher', business: 'Ubuntu Threads' } });
check('savePerson pitcher created', r.ok && r.created && /^PM-\d+/.test(r.code) && r.password, r);
const thandiPw = r.password;
r = admin('savePerson', { person: { first: 'Sipho', surname: 'Dlamini', email: 'sipho@bank.co.za', role: 'judge', business: 'Big Bank', title: 'CEO' } });
check('savePerson judge created', r.ok && r.created && /^JG-\d+/.test(r.code), r);
const siphoPw = r.password;
const t = row('thandi@ubuntu.co.za');
check('email normalised to lower case', !!t, people.data);
check('phone kept as given (+27)', t && t.phone === '+27821234567', t);
check('role stored as Pitcher', t && t.role === 'Pitcher', t);
check('status new', t && t.status === 'new', t);
r = admin('savePerson', { person: { first: 'Thandi', surname: 'Molefe-Smith', email: 'thandi@ubuntu.co.za', role: 'pitcher' } });
check('savePerson existing updates, not duplicates', r.ok && r.created === false && r.password === thandiPw && row('thandi@ubuntu.co.za').surname === 'Molefe-Smith', r);
r = admin('savePerson', { person: { first: 'X', email: 'not-an-email', role: 'pitcher' } });
check('savePerson rejects bad email', !r.ok && r.error === 'bad_email', r);

r = admin('importPeople', { rows: [
  { first: 'Lerato', surname: 'Khumalo', email: 'lerato@shop.co.za', phone: '0831112222', role: 'Pitcher', business: 'Shop' },
  { first: 'Dup', surname: 'Thandi', email: 'thandi@ubuntu.co.za', role: 'pitcher' },
  { first: 'Bad', surname: 'Email', email: 'bademail', role: 'pitcher' },
  { first: 'Grace', surname: 'Naidoo', email: 'grace@vc.co.za', role: 'Judge', business: 'VC Fund' }
] });
check('importPeople adds 2, skips duplicate + bad email', r.ok && r.added === 2 && r.skipped.length === 2, r);
const codes = people.getDataRange().getValues().slice(1).map(x => x[0]);
check('codes unique', new Set(codes).size === codes.length, codes);
check('import judge got JG code', row('grace@vc.co.za') && /^JG-02$/.test(row('grace@vc.co.za').code), row('grace@vc.co.za'));

/* ---------- list ---------- */
r = admin('list');
check('list (admin) returns people with passwords', r.ok && r.people.length === 4 && r.people.every(p => p.password), r.people && r.people.map(p => p.email));
check('list (admin) includes sheetUrl + quota', r.sheetUrl && r.quota === 1400, r);
r = admin('list', {}, ANNIE);
check('list (viewer) hides passwords', r.ok && r.people.length === 4 && r.people.every(p => !('password' in p)) && !r.sheetUrl, r.people && r.people[0]);

/* ---------- permissions ---------- */
r = admin('send', { kind: 'invite', emails: ['thandi@ubuntu.co.za'] }, ANNIE);
check('viewer forbidden from send', !r.ok && r.error === 'forbidden', r);
r = admin('savePerson', { person: { first: 'Z', email: 'z@z.com' } }, ANNIE);
check('viewer forbidden from savePerson', !r.ok && r.error === 'forbidden', r);

/* ---------- invites ---------- */
let before = sentCount();
r = admin('send', { kind: 'invite', emails: ['thandi@ubuntu.co.za', 'sipho@bank.co.za', 'ghost@nowhere.com'] });
check('send invite: 2 sent, 1 skipped', r.ok && r.sent === 2 && r.skipped.length === 1, r);
const inv = M._sent.slice(before);
check('invite from alias + name', inv.every(m => m.opts.from === 'helloyou@andrewwolhuter.com' && m.opts.name === 'Andrew Wolhuter'), inv.map(m => m.opts));
check('pitcher invite subject + password + role link', inv[0].subject === 'Your licence to pitch, Thandi' && inv[0].opts.htmlBody.includes(thandiPw) && inv[0].opts.htmlBody.includes('?role=pitcher') && inv[0].body.includes('?role=pitcher'), inv[0].subject);
check('judge invite subject + role link', inv[1].subject === "You're on the Royale judging panel, Sipho" && inv[1].opts.htmlBody.includes('?role=judge') && inv[1].opts.htmlBody.includes(siphoPw), inv[1].subject);
check('no em dashes in any email', inv.every(m => !/—/.test(m.subject + m.body + m.opts.htmlBody)), '');
check('judge invite never mentions score sheet / line-up', !/score|criteria|line-up|lineup/i.test(inv[1].opts.htmlBody + inv[1].body), '');
check('invite stamps invite_sent + status invited', row('thandi@ubuntu.co.za').invite_sent instanceof Date && row('thandi@ubuntu.co.za').status === 'invited', row('thandi@ubuntu.co.za'));

/* ---------- sign-in ---------- */
r = post({ action: 'signin', email: 'THANDI@ubuntu.co.za ', password: thandiPw.toUpperCase(), role: 'pitcher' });
check('signin pitcher right role (case-insensitive)', r.ok && r.person.role === 'pitcher' && r.person.first === 'Thandi' && !('password' in r.person), r);
check('signin stamps first_seen + status started', row('thandi@ubuntu.co.za').first_seen instanceof Date && row('thandi@ubuntu.co.za').status === 'started', row('thandi@ubuntu.co.za'));
r = post({ action: 'signin', email: 'thandi@ubuntu.co.za', password: thandiPw, role: 'judge' });
check('signin wrong role -> wrong_role + actual role', !r.ok && r.error === 'wrong_role' && r.role === 'pitcher', r);
r = post({ action: 'signin', email: 'thandi@ubuntu.co.za', password: 'nope', role: 'pitcher' });
check('signin bad password', !r.ok && r.error === 'bad_password', r);
r = post({ action: 'signin', email: 'who@nowhere.com', password: 'x', role: 'pitcher' });
check('signin unknown email', !r.ok && r.error === 'not_found', r);
r = post({ action: 'signin', email: '', password: '' });
check('signin missing fields', !r.ok && r.error === 'missing', r);
r = post({ action: 'signin', email: 'sipho@bank.co.za', password: siphoPw, role: 'judge' });
check('signin judge right role', r.ok && r.person.role === 'judge' && r.person.title === 'CEO', r);

/* ---------- save ---------- */
const TH = { email: 'thandi@ubuntu.co.za', password: thandiPw };
r = post(Object.assign({ action: 'save', business: 'Ubuntu Threads', tagline: 'Threads with a story', synopsis: 'Fifty words of story.', arrival: '5:15 (early)', onStageNeeds: 'Just me & a mic', phone: '+27 82 123 4567', dietary: 'None', notes: 'Excited', bio: 'should be ignored', title: 'ignored' }, TH));
const t2 = row('thandi@ubuntu.co.za');
check('save pitcher fields written', r.ok && t2.synopsis === 'Fifty words of story.' && t2.on_stage_needs === 'Just me & a mic' && t2.phone === '+27 82 123 4567', t2);
check('pitcher cannot write judge fields', !t2.bio && !t2.title, t2);
check('pitcher without photo is not complete', t2.status === 'started', t2.status);
const SI = { email: 'sipho@bank.co.za', password: siphoPw };
r = post(Object.assign({ action: 'save', company: 'Big Bank SA', title: 'Group CEO', bio: 'Sipho has judged many pitches.', lens: 'Business', linkedin: 'linkedin.com/in/sipho', arrival: '5:30', phone: '0820000000', synopsis: 'judge trying to write synopsis', tagline: 'nope' }, SI));
const s2 = row('sipho@bank.co.za');
check('save judge fields written (company -> business)', r.ok && s2.business === 'Big Bank SA' && s2.title === 'Group CEO' && s2.lens === 'Business' && s2.linkedin === 'linkedin.com/in/sipho', s2);
check('judge cannot write synopsis/tagline', !s2.synopsis && !s2.tagline, s2);
r = post({ action: 'save', email: 'sipho@bank.co.za', password: 'bad', bio: 'x' });
check('save with bad password refused', !r.ok && r.error === 'auth', r);

/* ---------- Sheets coercion: exact text in, exact text out ---------- */
r = post(Object.assign({ action: 'save', arrival: '5:30', phone: '0820000000', bio: '=IMPORTXML("http://evil","//a")', linkedin: '+27 test' }, SI));
const s3 = row('sipho@bank.co.za');
check('judge arrival 5:30 stays text (not a time)', s3.arrival === '5:30', s3.arrival);
check('phone keeps leading zero', s3.phone === '0820000000', s3.phone);
check('formula-looking input stored as text', s3.bio === '=IMPORTXML("http://evil","//a")', s3.bio);
r = post(Object.assign({ action: 'save', arrival: '5:45', phone: '+27821234567' }, TH));
check('pitcher 5:45 + +27 number stay text', row('thandi@ubuntu.co.za').arrival === '5:45' && row('thandi@ubuntu.co.za').phone === '+27821234567', row('thandi@ubuntu.co.za'));
r = post(Object.assign({ action: 'signin', role: 'pitcher' }, TH));
check('signin returns arrival as typed', r.ok && r.person.arrival === '5:45', r.person && r.person.arrival);
post(Object.assign({ action: 'save', arrival: '5:15 (early)', phone: '+27 82 123 4567' }, TH));
post(Object.assign({ action: 'save', bio: 'Sipho has judged many pitches.', phone: '0820000000' }, SI));

/* ---------- upload ---------- */
r = post(Object.assign({ action: 'uploadCover', filename: 'me photo!.jpg', mimeType: 'image/jpeg', dataBase64: 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64') }, TH));
const t3 = row('thandi@ubuntu.co.za');
check('uploadCover saves file + folder', r.ok && r.fileId && t3.cover_file_id === r.fileId && t3.folder_id, r);
const evFolders = M._root.children.filter(f => f.name === G.CFG.EVENT_FOLDER_NAME);
check('event subfolder created once under Pitcher Uploads', evFolders.length === 1 && evFolders[0].children.length === 1, M._root.children.map(f => f.name));
check('photo kept private (no sharing)', M._files[r.fileId].sharing === null, M._files[r.fileId].sharing);
check('pitcher now complete', t3.status === 'complete', t3.status);
const firstFile = r.fileId;
r = post(Object.assign({ action: 'uploadCover', filename: 'v2.png', mimeType: 'image/png', dataBase64: Buffer.from('png2').toString('base64') }, TH));
check('replacing photo trashes the old one, reuses folder', r.ok && M._files[firstFile].trashed && evFolders[0].children.length === 1, r);
r = post(Object.assign({ action: 'signin', role: 'pitcher' }, TH));
check('signin returns coverThumb data URL when photo on file', r.ok && /^data:image\/png;base64,/.test(r.person.coverThumb || ''), r.person && r.person.coverThumb);

/* ---------- submit / confirmation ---------- */
before = sentCount();
r = post(Object.assign({ action: 'submit', notes: 'Locked' }, TH));
check('submit locks + emails confirmation', r.ok && r.emailed === true && row('thandi@ubuntu.co.za').status === 'locked' && sentCount() === before + 1, r);
check('confirmation subject', lastSent().subject === 'Locked in, Thandi. See you on the 30th', lastSent().subject);
check('confirmation shows all in', /Still to add/.test(lastSent().opts.htmlBody) === false, '');
r = post(Object.assign({ action: 'submit' }, TH));
check('second submit does not re-send confirmation', r.ok && r.emailed === false && sentCount() === before + 1, r);
before = sentCount();
r = post(Object.assign({ action: 'submit' }, SI));
check('judge with gaps can lock in; confirmation lists still to add', r.ok && r.emailed && /Still to add/.test(lastSent().opts.htmlBody) && lastSent().opts.htmlBody.includes('?role=judge'), r);

/* ---------- reminders ---------- */
admin('send', { kind: 'invite', emails: ['lerato@shop.co.za'] });
before = sentCount();
r = admin('send', { kind: 'reminder', emails: ['thandi@ubuntu.co.za', 'lerato@shop.co.za', 'sipho@bank.co.za'] });
check('reminder skips complete/locked people', r.ok && r.sent === 1 && r.skipped.length === 2, r);
check('reminder goes to Lerato, lists photo + synopsis + logistics', lastSent().to === 'lerato@shop.co.za' && /Your photo\./.test(lastSent().body) && /Your synopsis\./.test(lastSent().body), lastSent().body);
check('reminder stamps last_reminded', row('lerato@shop.co.za').last_reminded instanceof Date, row('lerato@shop.co.za'));

/* ---------- withdraw ---------- */
r = admin('withdraw', { email: 'lerato@shop.co.za', withdrawn: true });
check('withdraw', r.ok && r.state === 'withdrawn', r);
const lerPw = row('lerato@shop.co.za').password;
r = post({ action: 'signin', email: 'lerato@shop.co.za', password: lerPw, role: 'pitcher' });
check('withdrawn cannot sign in', !r.ok && r.error === 'withdrawn', r);
r = admin('send', { kind: 'invite', emails: ['lerato@shop.co.za'] });
check('withdrawn skipped by send', r.ok && r.sent === 0 && r.skipped[0].reason === 'withdrawn', r);
r = admin('withdraw', { email: 'lerato@shop.co.za', withdrawn: false });
check('restore after withdraw', r.ok && r.state !== 'withdrawn', r);
r = post({ action: 'signin', email: 'lerato@shop.co.za', password: lerPw, role: 'pitcher' });
check('restored person can sign in', r.ok, r);

/* ---------- reset password ---------- */
r = admin('resetPassword', { email: 'lerato@shop.co.za' });
check('resetPassword returns new password', r.ok && r.password && r.password !== lerPw, r);
check('old password stops working', !post({ action: 'signin', email: 'lerato@shop.co.za', password: lerPw }).ok, '');
check('new password works', post({ action: 'signin', email: 'lerato@shop.co.za', password: r.password }).ok, '');

/* ---------- ask ---------- */
before = sentCount();
r = post(Object.assign({ action: 'ask', message: 'Can I bring a prop?' }, TH));
const mrows = msgs.getDataRange().getValues();
check('ask (signed in) stored + notifies team with replyTo', r.ok && mrows.length === 2 && mrows[1][1] === 'Thandi Molefe-Smith' && mrows[1][2] === 'Pitcher' && lastSent().to.includes('annie@getstoryd.com') && lastSent().opts.replyTo === 'thandi@ubuntu.co.za', { r, mrows, last: lastSent() });
r = post({ action: 'ask', email: 'new@person.com', name: 'New Person', message: '=HYPERLINK("x") please add me' });
check('ask from stage door (no password) stored as text', r.ok && msgs.getDataRange().getValues().length === 3 && msgs._get(3, 5) === '=HYPERLINK("x") please add me', msgs.data[2]);
r = post({ action: 'ask', message: 'no email' });
check('ask without email refused', !r.ok && r.error === 'need_email', r);
r = post({ action: 'ask', email: 'a@b.com', message: '   ' });
check('ask empty message refused', !r.ok && r.error === 'empty', r);
r = admin('list');
check('messages listed newest first', r.messages.length === 2 && r.messages[0].email === 'new@person.com', r.messages);

/* ---------- preview / test / access ---------- */
r = admin('preview', { kind: 'invite', role: 'judge' });
check('preview sample judge invite', r.ok && /judging panel/.test(r.subject) && r.html.includes('royale-01') === false && r.html.length > 2000, r.subject);
r = admin('preview', { kind: 'invite', email: 'thandi@ubuntu.co.za' }, ANNIE);
check('viewer preview masks password', r.ok && !r.html.includes(thandiPw) && r.html.includes('••••••••'), '');
r = admin('preview', { kind: 'invite', email: 'thandi@ubuntu.co.za' });
check('admin preview of a real person shows their password', r.ok && r.html.includes(thandiPw), '');
before = sentCount();
r = admin('test', { kind: 'reminder', role: 'pitcher' });
check('test sends to the signed-in admin only', r.ok && r.sentTo === 'lee-anne@getstoryd.com' && lastSent().to === 'lee-anne@getstoryd.com' && /\(TEST\)$/.test(lastSent().subject), r);
r = admin('test', { kind: 'reminder', role: 'pitcher' }, ANNIE);
check('viewer cannot send tests', !r.ok && r.error === 'forbidden', r);
r = admin('sendAccess', { email: 'annie@getstoryd.com' });
check('sendAccess emails Annie her viewer access', r.ok && lastSent().to === 'annie@getstoryd.com' && lastSent().opts.htmlBody.includes('annie-pass-3') && /view-only/.test(lastSent().body), r);
r = admin('thumb', { email: 'thandi@ubuntu.co.za' }, ANNIE);
check('thumb op works for viewer', r.ok && /^data:image/.test(r.thumb), r);
r = admin('nope');
check('unknown op', !r.ok && r.error === 'unknown_op', r);
r = post({ action: 'nope' });
check('unknown action', !r.ok && r.error === 'unknown_action', r);

/* ---------- July archive untouched ---------- */
check('July tab untouched', july.getDataRange().getValues().length === 2 && july._get(2, 2) === 'old@example.com', july.data);

/* ---------- report ---------- */
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
results.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + pad(x.name, 72) + (x.ok ? '' : ' ' + x.detail)));
const passed = results.filter(x => x.ok).length;
console.log(`\n${passed}/${results.length} passed, ${M._sent.length} emails captured`);
process.exitCode = passed === results.length ? 0 : 1;
