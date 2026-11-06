// Salary Advance Manager - local-only server. No external dependencies, no network calls.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = '127.0.0.1'; // localhost only: not reachable from the office WiFi
const PORT = Number(process.env.PORT) || 3500;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PUBLIC_DIR = path.join(ROOT, 'public');
const KEEP_DAILY = 90;

// ---------- storage ----------
const emptyDb = () => ({ version: 1, settings: { fundSize: 0, companyName: 'Company Name' }, employees: [], requests: [] });

function loadDb() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) { saveDb(emptyDb()); }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDb(d) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic replace so a crash never leaves a half-written file
}
let db = loadDb();

function dailyBackup() {
  const name = `db-${today()}.json`;
  const target = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(target)) fs.copyFileSync(DB_FILE, target);
  const old = fs.readdirSync(BACKUP_DIR).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  while (old.length > KEEP_DAILY) fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
}

// ---------- dates & money ----------
function today() { const d = new Date(); return ymd(d); }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function thisMonth() { return today().slice(0, 7); }
function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return ymd(d).slice(0, 7); }
function addMonthsToDate(dateStr, n) { const [y, m, d] = dateStr.split('-').map(Number); return ymd(new Date(y, m - 1 + n, d)); }
const round2 = x => Math.round(x * 100) / 100;
const id = () => crypto.randomBytes(6).toString('hex');

// ---------- advance maths ----------
function paidTotal(r) { return round2((r.payments || []).reduce((s, p) => s + p.amount, 0)); }
function balance(r) { return r.status === 'approved' ? round2(r.approvedAmount - paidTotal(r)) : 0; }
function cumDueThrough(r, ym) { return round2(r.schedule.filter(s => s.month <= ym).reduce((s, x) => s + x.due, 0)); }
function dueNow(r, ym = thisMonth()) { return r.status === 'approved' ? Math.max(0, round2(Math.min(balance(r), cumDueThrough(r, ym) - paidTotal(r)))) : 0; }
function isOverdue(r) { return r.status === 'approved' && dueNow(r, addMonths(thisMonth(), -1)) > 0; }
function buildSchedule(amount, months, startYm) {
  const each = round2(Math.floor((amount / months) * 100) / 100);
  const out = [];
  for (let i = 0; i < months; i++) out.push({ month: addMonths(startYm, i), due: i === months - 1 ? round2(amount - each * (months - 1)) : each });
  return out;
}
function outstandingTotal() { return round2(db.requests.reduce((s, r) => s + balance(r), 0)); }

// ---------- policy checks ----------
function policyChecks(req, amount) {
  const e = db.employees.find(x => x.id === req.employeeId);
  if (!e) return [{ rule: 'Employee exists', ok: false, detail: 'Employee record not found' }];
  const year = today().slice(0, 4);
  const thisYear = db.requests.filter(r => r.employeeId === e.id && r.id !== req.id && r.status === 'approved' && (r.decidedOn || '').startsWith(year)).length;
  const active = db.requests.filter(r => r.employeeId === e.id && r.id !== req.id && balance(r) > 0);
  const limit = round2(e.gross / 3);
  const remainingFund = round2((db.settings.fundSize || 0) - outstandingTotal());
  const cutoff = addMonthsToDate(today(), 3);
  return [
    { rule: 'Amount ≤ 1/3 of gross salary', ok: amount > 0 && amount <= limit, detail: `Requested ${amount}, limit ${limit}` },
    { rule: 'Repaid within 3 months', ok: Number.isInteger(req.months) && req.months >= 1 && req.months <= 3, detail: `${req.months} month(s)` },
    { rule: 'At most 3rd advance this calendar year', ok: thisYear < 3, detail: `${thisYear} already approved in ${year}` },
    { rule: 'No advance still being repaid', ok: active.length === 0, detail: active.length ? `Outstanding balance ${active.map(balance).join(', ')}` : 'None outstanding' },
    { rule: 'Probation completed', ok: !!e.probationDone, detail: e.probationDone ? 'Yes' : 'Still on probation' },
    { rule: 'Not serving notice', ok: !e.servingNotice, detail: e.servingNotice ? 'Serving notice' : 'No' },
    { rule: 'Contract has more than 3 months left', ok: !e.contractEnd || e.contractEnd > cutoff, detail: e.contractEnd ? `Ends ${e.contractEnd}` : 'Permanent / no end date' },
    { rule: 'Enough money left in the advance fund', ok: amount <= remainingFund, detail: `Remaining fund ${remainingFund}` },
  ];
}

// ---------- state for the UI ----------
function view() {
  const ym = thisMonth();
  const requests = db.requests.map(r => ({
    ...r,
    paid: paidTotal(r), balance: balance(r), dueNow: dueNow(r, ym), overdue: isOverdue(r),
    checks: r.status === 'pending' ? policyChecks(r, r.amount) : undefined,
  }));
  const outstanding = outstandingTotal();
  return {
    today: today(), month: ym, settings: db.settings, employees: db.employees, requests,
    summary: {
      pending: requests.filter(r => r.status === 'pending').length,
      active: requests.filter(r => r.balance > 0).length,
      outstanding, remainingFund: round2((db.settings.fundSize || 0) - outstanding),
      overdue: requests.filter(r => r.overdue).length,
    },
    backups: fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse(),
  };
}

// ---------- validation helpers ----------
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const need = (cond, msg) => { if (!cond) throw new HttpError(400, msg); };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const num = v => round2(Number(v));

function cleanEmployee(b, existingId) {
  const e = {
    id: existingId || id(),
    staffNo: String(b.staffNo || '').trim(), name: String(b.name || '').trim(),
    position: String(b.position || '').trim(), phone: String(b.phone || '').trim(),
    employedOn: b.employedOn || '', gross: num(b.gross),
    probationDone: !!b.probationDone, contractEnd: b.contractEnd || null, servingNotice: !!b.servingNotice,
  };
  need(e.staffNo && e.name, 'Staff number and name are required');
  need(e.gross > 0, 'Gross salary must be greater than 0');
  need(!e.employedOn || isDate(e.employedOn), 'Invalid employment date');
  need(!e.contractEnd || isDate(e.contractEnd), 'Invalid contract end date');
  need(!db.employees.some(x => x.staffNo.toLowerCase() === e.staffNo.toLowerCase() && x.id !== e.id), 'Staff number already exists');
  return e;
}
function validDb(d) {
  return d && typeof d === 'object' && Array.isArray(d.employees) && Array.isArray(d.requests) && d.settings && typeof d.settings === 'object';
}

// ---------- API ----------
async function api(method, parts, body, res) {
  const [resource, rid, action] = parts;
  const findReq = () => { const r = db.requests.find(x => x.id === rid); if (!r) throw new HttpError(404, 'Request not found'); return r; };

  if (method === 'GET' && resource === 'state') return view();

  if (method === 'GET' && resource === 'backup') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="salary-advance-backup-${today()}.json"` });
    res.end(JSON.stringify(db, null, 2));
    return null;
  }

  if (method === 'POST' && resource === 'restore') {
    const incoming = rid ? JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, path.basename(rid)), 'utf8')) : body;
    need(validDb(incoming), 'That file is not a valid salary advance backup');
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `pre-restore-${Date.now()}.json`));
    db = incoming; saveDb(db); return view();
  }

  if (method === 'PUT' && resource === 'settings') {
    const fund = num(body.fundSize);
    need(fund >= 0, 'Fund size must be 0 or more');
    db.settings = { ...db.settings, fundSize: fund, companyName: String(body.companyName || db.settings.companyName || '').trim() };
    saveDb(db); return view();
  }

  if (resource === 'employees') {
    if (method === 'POST') { db.employees.push(cleanEmployee(body)); saveDb(db); return view(); }
    if (method === 'PUT') {
      const i = db.employees.findIndex(x => x.id === rid); if (i < 0) throw new HttpError(404, 'Employee not found');
      db.employees[i] = cleanEmployee(body, rid); saveDb(db); return view();
    }
  }

  if (resource === 'requests') {
    if (method === 'POST' && !rid) {
      const r = {
        id: id(), employeeId: body.employeeId, amount: num(body.amount), months: Number(body.months),
        purpose: String(body.purpose || '').trim(), otherLoans: String(body.otherLoans || '').trim(),
        requestedOn: isDate(body.requestedOn) ? body.requestedOn : today(), status: 'pending', payments: [], schedule: [],
      };
      need(db.employees.some(e => e.id === r.employeeId), 'Choose an employee');
      need(r.amount > 0, 'Amount must be greater than 0');
      need([1, 2, 3].includes(r.months), 'Repayment period must be 1, 2 or 3 months');
      db.requests.push(r); saveDb(db); return view();
    }
    const r = findReq();
    if (method === 'POST' && action === 'approve') {
      need(r.status === 'pending', 'Only pending requests can be approved');
      const amount = body.amount != null && body.amount !== '' ? num(body.amount) : r.amount;
      need(amount > 0 && amount <= r.amount, 'Approved amount must be between 0 and the requested amount');
      const failing = policyChecks(r, amount).filter(c => !c.ok);
      if (failing.length) throw new HttpError(409, 'Cannot approve: ' + failing.map(c => c.rule).join('; '));
      const start = isDate(body.firstDeduction + '-01') ? body.firstDeduction : addMonths(thisMonth(), 1);
      Object.assign(r, { status: 'approved', approvedAmount: amount, decidedOn: today(), schedule: buildSchedule(amount, r.months, start) });
      saveDb(db); return view();
    }
    if (method === 'POST' && action === 'reject') {
      need(r.status === 'pending', 'Only pending requests can be rejected');
      Object.assign(r, { status: 'rejected', decidedOn: today(), rejectReason: String(body.reason || '').trim() });
      saveDb(db); return view();
    }
    if (method === 'POST' && action === 'deduct') {
      const amt = dueNow(r);
      need(amt > 0, 'Nothing is due for deduction this payroll month');
      r.payments.push({ id: id(), date: today(), amount: amt, kind: 'deduction', month: thisMonth() });
      saveDb(db); return view();
    }
    if (method === 'POST' && action === 'repay') {
      const amt = num(body.amount);
      need(r.status === 'approved', 'Advance is not active');
      need(amt > 0 && amt <= balance(r), `Amount must be between 0 and the balance (${balance(r)})`);
      r.payments.push({ id: id(), date: isDate(body.date) ? body.date : today(), amount: amt, kind: 'early', note: String(body.note || '') });
      saveDb(db); return view();
    }
    if (method === 'DELETE' && action === 'payment') {
      const pid = parts[3];
      r.payments = r.payments.filter(p => p.id !== pid);
      saveDb(db); return view();
    }
  }
  throw new HttpError(404, 'Not found');
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const server = http.createServer((req, res) => {
  // Reject requests whose Host header isn't local (blocks DNS-rebinding from web pages)
  if (!ALLOWED_HOSTS.has(req.headers.host)) { res.writeHead(403); return res.end('Forbidden'); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'sa') { res.writeHead(403); return res.end('Forbidden'); }
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 20e6) req.destroy(); });
    req.on('end', async () => {
      try {
        dailyBackup();
        const body = raw ? JSON.parse(raw) : {};
        const out = await api(req.method, url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent), body, res);
        if (out !== null) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }
      } catch (err) {
        const code = err.code && Number.isInteger(err.code) ? err.code : 500;
        if (code === 500) console.error(err);
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: code === 500 ? 'Unexpected error: ' + err.message : err.message }));
      }
    });
    return;
  }

  const file = path.join(PUBLIC_DIR, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000);
server.listen(PORT, HOST, () => console.log(`Salary Advance Manager running at http://${HOST}:${PORT}  (local only - close this window to stop)`));
