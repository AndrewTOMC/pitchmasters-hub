// Minimal in-memory Google Apps Script mocks, enough to run backend/Code.gs in Node.
// Loads Code.gs into the main realm (indirect eval) so Date instances match.
const fs = require('fs');
const path = require('path');

function makeMocks() {
  const sent = [];        // GmailApp.sendEmail calls
  let idSeq = 1;
  const nextId = (p) => p + '_' + (idSeq++);

  /* ---------------- Sheets ----------------
     coerce() mimics how Google Sheets parses typed text: a leading apostrophe
     keeps the text as-is (and is dropped), times become Dates, digit strings
     become Numbers (losing leading zeros / '+'), '=' runs as a formula. */
  function coerce(v) {
    if (typeof v !== 'string' || v === '') return v;
    if (v[0] === "'") return v.slice(1);
    let m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return new Date(Date.UTC(1899, 11, 30, +m[1], +m[2]));
    if (/^\+?\d[\d ]*$/.test(v) && v.replace(/\D/g, '').length < 16) return Number(v.replace(/[ +]/g, ''));
    if (v[0] === '=') return '#FORMULA_EXECUTED';
    return v;
  }
  class Range {
    constructor(sheet, r, c, h, w) { Object.assign(this, { sheet, r, c, h: h || 1, w: w || 1 }); }
    setValue(v) { this.sheet._set(this.r, this.c, v); return this; }
    setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sheet._set(this.r + i, this.c + j, v))); return this; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.h; i++) { const row = []; for (let j = 0; j < this.w; j++) row.push(this.sheet._get(this.r + i, this.c + j)); out.push(row); }
      return out;
    }
    getValue() { return this.sheet._get(this.r, this.c); }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getName() { return this.name; }
    _set(r, c, v) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = coerce(v); }
    _get(r, c) { const row = this.data[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; }
    getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some(v => v !== '' && v != null)) return i + 1; return 0; }
    getLastColumn() { let m = 0; this.data.forEach(row => { for (let j = row.length - 1; j >= 0; j--) if (row[j] !== '' && row[j] != null) { m = Math.max(m, j + 1); break; } }); return m; }
    getDataRange() {
      const h = Math.max(this.getLastRow(), 1), w = Math.max(this.getLastColumn(), 1);
      return new Range(this, 1, 1, h, w);
    }
    getRange(r, c, h, w) { if (typeof r === 'string') throw new Error('A1 not supported in mock'); return new Range(this, r, c, h, w); }
    appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, j) => this._set(r, j + 1, v)); return this; }
    setFrozenRows() { return this; }
  }
  class Spreadsheet {
    constructor() { this.sheets = []; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/MOCK/edit'; }
  }
  const ss = new Spreadsheet();
  const SpreadsheetApp = { openById: () => ss, flush: () => {} };

  /* ---------------- Drive ---------------- */
  const files = {}, folders = {};
  class File {
    constructor(blob) { this.id = nextId('file'); this.blob = blob; this.trashed = false; this.sharing = null; files[this.id] = this; }
    getId() { return this.id; } getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; }
    setTrashed(t) { this.trashed = t; return this; } setSharing(a, p) { this.sharing = [a, p]; return this; }
    getThumbnail() { return { getContentType: () => 'image/png', getBytes: () => [137, 80, 78, 71] }; }
    getName() { return this.blob.getName(); }
  }
  class Folder {
    constructor(name) { this.id = nextId('folder'); this.name = name; this.children = []; this.files = []; folders[this.id] = this; }
    getId() { return this.id; } getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; } getName() { return this.name; }
    createFolder(n) { const f = new Folder(n); this.children.push(f); return f; }
    getFoldersByName(n) { const list = this.children.filter(c => c.name === n); let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; }
    createFile(blob) { const f = new File(blob); this.files.push(f); return f; }
  }
  const root = new Folder('Pitcher Uploads'); root.id = '1qeNXlhBUq-YSKZwsvLcBrkU2ZybrebaA'; folders[root.id] = root;
  const DriveApp = {
    getFolderById: (id) => { if (!folders[id]) throw new Error('No folder ' + id); return folders[id]; },
    getFileById: (id) => { if (!files[id]) throw new Error('No file ' + id); return files[id]; },
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' }
  };

  /* ---------------- Mail, locks, utilities ---------------- */
  const GmailApp = { sendEmail: (to, subject, body, opts) => { sent.push({ to, subject, body, opts: opts || {} }); } };
  const MailApp = { getRemainingDailyQuota: () => 1400 };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) };
  const Utilities = {
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getContentType: () => mime, getName: () => name }),
    formatDate: (d, tz, fmt) => d.toISOString().replace('T', ' ').slice(0, 16),
    sleep: () => {}
  };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
  };
  const UrlFetchApp = { fetch: () => ({}) };
  const ScriptApp = { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) };

  return { SpreadsheetApp, DriveApp, GmailApp, MailApp, LockService, Utilities, ContentService, UrlFetchApp, ScriptApp,
           _ss: ss, _sent: sent, _files: files, _folders: folders, _root: root };
}

function loadCode(mocks) {
  Object.keys(mocks).forEach(k => { if (!k.startsWith('_')) global[k] = mocks[k]; });
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  (0, eval)(code);
  return global;
}

module.exports = { makeMocks, loadCode };
