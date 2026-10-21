// Renders every email template to /emails/*.html (+ .txt) for review.
// Run: backend/build.sh && node backend/test/render-emails.js
const fs = require('fs');
const path = require('path');
const { makeMocks, loadCode } = require('./gas-mocks');
const G = loadCode(makeMocks());
const OUT = path.join(__dirname, '..', '..', 'emails');
fs.mkdirSync(OUT, { recursive: true });

const pitcherDone = { role: 'pitcher', first: 'Thandi', name: 'Thandi Molefe', email: 'thandi@ubuntuthreads.co.za', password: 'baccarat-27',
  business: 'Ubuntu Threads', tagline: 'Threads with a story', synopsis: 'x', arrival: '5:15 (early)', phone: '+27 82 123 4567',
  checks: { photo: true, profile: true, logistics: true } };
const pitcherGaps = Object.assign({}, pitcherDone, { first: 'Lerato', name: 'Lerato Khumalo', email: 'lerato@shopfront.co.za', password: 'velvet-41', arrival: '',
  checks: { photo: true, profile: false, logistics: false } });
const judgeDone = { role: 'judge', first: 'Grace', name: 'Grace Naidoo', email: 'grace@capitalfund.co.za', password: 'martini-63',
  business: 'Capital Fund', title: 'Managing Partner', bio: 'x', lens: 'Business', arrival: '5:30', phone: '082 000 0000',
  checks: { photo: true, profile: true, logistics: true } };
const judgeGaps = Object.assign({}, judgeDone, { first: 'Sipho', name: 'Sipho Dlamini', email: 'sipho@bank.co.za', password: 'tuxedo-18',
  checks: { photo: false, profile: true, logistics: false } });

const jobs = [
  ['pitcher-invite', () => G.emailFor_('invite', pitcherDone)],
  ['judge-invite', () => G.emailFor_('invite', judgeDone)],
  ['pitcher-reminder', () => G.emailFor_('reminder', pitcherGaps)],
  ['judge-reminder', () => G.emailFor_('reminder', judgeGaps)],
  ['pitcher-confirmation', () => G.emailFor_('confirmation', pitcherDone)],
  ['judge-confirmation', () => G.emailFor_('confirmation', judgeGaps)],
  ['pitcher-confirmation-gaps', () => G.emailFor_('confirmation', pitcherGaps)],
  ['judge-confirmation-complete', () => G.emailFor_('confirmation', judgeDone)],
  ['access-admin', () => G.accessEmail_({ first: 'Lee-Anne', email: 'lee-anne@getstoryd.com', password: 'console-sample-1', role: 'admin', from: 'Andrew Wolhuter' })],
  ['access-viewer', () => G.accessEmail_({ first: 'Annie', email: 'annie@getstoryd.com', password: 'console-sample-2', role: 'viewer', from: 'Andrew Wolhuter' })]
];

const index = [];
for (const [name, fn] of jobs) {
  const m = fn();
  const html = m.html.split(G.EVENT.assetBase).join('../assets/email/');
  fs.writeFileSync(path.join(OUT, name + '.html'), html);
  fs.writeFileSync(path.join(OUT, name + '.txt'), 'Subject: ' + m.subject + '\n\n' + m.text);
  const visible = m.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  const bad = /—|\btransform|\bdelve|\bunpack|\bempower|\bunleash|\bthrive/i.exec(m.subject + m.text + visible) || /—/.exec(m.html);
  index.push(`${name.padEnd(30)} ${String(m.html.length).padStart(6)}b  "${m.subject}"${bad ? '  !! banned: ' + bad[0] : ''}`);
}
console.log(index.join('\n'));
