'use strict';
let S = null, tab = 'dashboard', editing = null;
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = ym => new Date(ym + '-01T00:00').toLocaleString(undefined, { month: 'short', year: 'numeric' });
const emp = id => S.employees.find(e => e.id === id) || { name: '(deleted)', staffNo: '' };

async function call(method, url, body) {
  const r = await fetch('/api/' + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sa' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
async function act(method, url, body, msg) {
  try { S = await call(method, url, body); render(); if (msg) toast(msg); return true; }
  catch (e) { toast(e.message, true); return false; }
}
function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = err ? 'err' : ''; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', err ? 6000 : 2500); }
const formData = f => Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, v]).concat([...f.querySelectorAll('input[type=checkbox]')].map(c => [c.name, c.checked])));

$('#nav').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; editing = null; document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b)); render(); };

function statusPill(r) {
  if (r.status === 'pending') return '<span class="pill warn">Pending</span>';
  if (r.status === 'rejected') return '<span class="pill bad">Rejected</span>';
  if (r.balance <= 0) return '<span class="pill ok">Repaid</span>';
  return r.overdue ? '<span class="pill bad">Overdue</span>' : '<span class="pill">Active</span>';
}

// ---------- views ----------
function dashboard() {
  const s = S.summary;
  const due = S.requests.filter(r => r.dueNow > 0);
  const pend = S.requests.filter(r => r.status === 'pending');
  const totalDue = due.reduce((a, r) => a + r.dueNow, 0);
  return `
  <div class="tiles">
    <div class="tile"><div class="k">Pending requests</div><div class="v">${s.pending}</div></div>
    <div class="tile"><div class="k">Active advances</div><div class="v">${s.active}</div></div>
    <div class="tile"><div class="k">Total outstanding</div><div class="v">${money(s.outstanding)}</div></div>
    <div class="tile"><div class="k">Remaining advance fund</div><div class="v" style="color:${s.remainingFund < 0 ? 'var(--bad)' : 'inherit'}">${money(s.remainingFund)}</div><div class="k">of ${money(S.settings.fundSize)}</div></div>
    <div class="tile"><div class="k">Overdue</div><div class="v" style="color:${s.overdue ? 'var(--bad)' : 'inherit'}">${s.overdue}</div></div>
  </div>
  <div class="card"><h2>Due for deduction — ${monthName(S.month)} payroll <span class="muted">(${money(totalDue)} total)</span></h2>
    ${due.length ? `<div class="wrap"><table><tr><th>Staff no.</th><th>Name</th><th class="n">Deduct now</th><th class="n">Balance</th><th></th><th></th></tr>
    ${due.map(r => `<tr><td>${esc(emp(r.employeeId).staffNo)}</td><td>${esc(emp(r.employeeId).name)}</td><td class="n">${money(r.dueNow)}</td><td class="n">${money(r.balance)}</td><td>${statusPill(r)}</td>
      <td><button class="b p" data-deduct="${r.id}">Record deduction</button></td></tr>`).join('')}</table></div>` : '<p class="muted">Nobody is due for deduction this month.</p>'}
  </div>
  <div class="card"><h2>Pending requests</h2>${pend.length ? requestTable(pend) : '<p class="muted">No pending requests.</p>'}</div>`;
}

function requestTable(list) {
  return `<div class="wrap"><table><tr><th>Date</th><th>Employee</th><th class="n">Amount</th><th>Months</th><th>Purpose</th><th>Status</th><th></th></tr>
  ${list.map(r => `<tr><td>${esc(r.requestedOn)}</td><td>${esc(emp(r.employeeId).name)}<div class="muted">${esc(emp(r.employeeId).staffNo)}</div></td>
    <td class="n">${money(r.amount)}${r.status === 'approved' && r.approvedAmount !== r.amount ? `<div class="muted">approved ${money(r.approvedAmount)}</div>` : ''}</td>
    <td>${r.months}</td><td>${esc(r.purpose)}</td><td>${statusPill(r)}${r.rejectReason ? `<div class="muted">${esc(r.rejectReason)}</div>` : ''}</td>
    <td class="row"><button class="b" data-review="${r.id}">${r.status === 'pending' ? 'Review' : 'Open'}</button><button class="b" data-print="${r.id}">Print form</button></td></tr>`).join('')}</table></div>`;
}

function requests() {
  if (editing && editing.startsWith('req:')) return review(S.requests.find(r => r.id === editing.slice(4)));
  const list = [...S.requests].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.requestedOn.localeCompare(a.requestedOn));
  return `<div class="card"><h2>New advance request</h2>
    ${S.employees.length ? `<form class="grid" id="newReq">
      <label>Employee<select name="employeeId" required><option value="">— choose —</option>${S.employees.map(e => `<option value="${e.id}">${esc(e.staffNo)} · ${esc(e.name)}</option>`).join('')}</select></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0" required></label>
      <label>Repayment months<select name="months"><option>1</option><option>2</option><option selected>3</option></select></label>
      <label>Date of request<input name="requestedOn" type="date" value="${S.today}"></label>
      <label style="grid-column:1/-1">Purpose<input name="purpose"></label>
      <label style="grid-column:1/-1">Other outstanding loans (lender, balance)<input name="otherLoans"></label>
      <div><button class="b p">Record as pending</button></div></form>` : '<p class="muted">Add employees first.</p>'}
  </div>
  <div class="card"><h2>All requests</h2>${list.length ? requestTable(list) : '<p class="muted">None yet.</p>'}</div>`;
}

function review(r) {
  const e = emp(r.employeeId);
  const failing = (r.checks || []).filter(c => !c.ok);
  return `<div class="card"><div class="row"><button class="b" data-back>← Back</button><button class="b" data-print="${r.id}">Print application form</button></div></div>
  <div class="card"><h2>${esc(e.name)} <span class="muted">${esc(e.staffNo)} · ${esc(e.position)}</span> ${statusPill(r)}</h2>
    <p>Requested <b>${money(r.amount)}</b> over <b>${r.months}</b> month(s) on ${esc(r.requestedOn)}. Gross salary ${money(e.gross)} (1/3 = ${money(e.gross / 3)}).<br>
    Purpose: ${esc(r.purpose) || '—'}<br>Other outstanding loans: ${esc(r.otherLoans) || 'None declared'}</p>
    ${r.status === 'pending' ? `
      <h2>Policy checks</h2><ul class="checks">${r.checks.map(c => `<li class="${c.ok ? 'ok' : 'bad'}">${esc(c.rule)} <span class="muted">— ${esc(c.detail)}</span></li>`).join('')}</ul>
      ${failing.length ? `<p class="checks"><span class="bad">Approval is blocked while ${failing.length} rule(s) fail. You can approve a lower amount if only the amount/fund rules fail, or reject.</span></p>` : ''}
      <form class="grid" id="approve" data-id="${r.id}">
        <label>Amount to approve (≤ requested)<input name="amount" type="number" step="0.01" min="0" max="${r.amount}" value="${r.amount}"></label>
        <label>First deduction month<input name="firstDeduction" type="month" value="${nextMonth()}"></label>
        <div class="row" style="align-self:end"><button class="b p" id="approveBtn">Approve</button></div>
      </form>
      <p class="muted" id="approveNote"></p>
      <form class="row" id="reject" data-id="${r.id}" style="margin-top:12px"><input name="reason" placeholder="Reason for rejection" style="flex:1"><button class="b r">Reject</button></form>`
    : r.status === 'approved' ? advanceDetail(r) : ''}
  </div>`;
}
function nextMonth() { const [y, m] = S.month.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function advanceDetail(r) {
  let cum = 0;
  return `<p>Approved <b>${money(r.approvedAmount)}</b> on ${esc(r.decidedOn)} · Paid ${money(r.paid)} · <b>Balance ${money(r.balance)}</b></p>
  <div class="wrap"><table><tr><th>Month</th><th class="n">Scheduled</th><th>Status</th></tr>
  ${r.schedule.map(s => { cum += s.due; const covered = r.paid + 0.005 >= cum; const past = s.month < S.month;
    return `<tr><td>${monthName(s.month)}</td><td class="n">${money(s.due)}</td><td>${covered ? '<span class="pill ok">Paid</span>' : past ? '<span class="pill bad">Overdue</span>' : s.month === S.month ? '<span class="pill warn">Due this payroll</span>' : '<span class="pill">Upcoming</span>'}</td></tr>`; }).join('')}</table></div>
  <h2 style="margin-top:14px">Payments</h2>
  ${r.payments.length ? `<div class="wrap"><table><tr><th>Date</th><th>Type</th><th class="n">Amount</th><th></th></tr>${r.payments.map(p => `<tr><td>${esc(p.date)}</td><td>${p.kind === 'deduction' ? 'Payroll deduction ' + monthName(p.month) : 'Early repayment'}${p.note ? ' · ' + esc(p.note) : ''}</td><td class="n">${money(p.amount)}</td><td><button class="b r" data-undo="${r.id}/${p.id}">Undo</button></td></tr>`).join('')}</table></div>` : '<p class="muted">No payments yet.</p>'}
  ${r.balance > 0 ? `<div class="row" style="margin-top:12px">
    <button class="b p" data-deduct="${r.id}" ${r.dueNow > 0 ? '' : 'disabled'}>Record deduction ${r.dueNow > 0 ? money(r.dueNow) : '(nothing due this month)'}</button>
    <form class="row" id="repay" data-id="${r.id}"><input name="amount" type="number" step="0.01" min="0" max="${r.balance}" placeholder="Early repayment amount" required><input name="date" type="date" value="${S.today}"><input name="note" placeholder="Note (e.g. cash)"><button class="b">Record early repayment</button></form></div>` : ''}`;
}

function advances() {
  if (editing && editing.startsWith('req:')) return review(S.requests.find(r => r.id === editing.slice(4)));
  const list = S.requests.filter(r => r.status === 'approved').sort((a, b) => (b.balance > 0) - (a.balance > 0) || b.decidedOn.localeCompare(a.decidedOn));
  return `<div class="card"><h2>Approved advances</h2>${list.length ? `<div class="wrap"><table><tr><th>Employee</th><th>Approved</th><th class="n">Amount</th><th class="n">Paid</th><th class="n">Balance</th><th class="n">Due now</th><th>Status</th><th></th></tr>
  ${list.map(r => `<tr><td>${esc(emp(r.employeeId).name)}<div class="muted">${esc(emp(r.employeeId).staffNo)}</div></td><td>${esc(r.decidedOn)}</td><td class="n">${money(r.approvedAmount)}</td><td class="n">${money(r.paid)}</td><td class="n"><b>${money(r.balance)}</b></td><td class="n">${money(r.dueNow)}</td><td>${statusPill(r)}</td>
    <td class="row">${r.dueNow > 0 ? `<button class="b p" data-deduct="${r.id}">Record deduction</button>` : ''}<button class="b" data-review="${r.id}">Open</button></td></tr>`).join('')}</table></div>` : '<p class="muted">No approved advances yet.</p>'}</div>`;
}

function employees() {
  const e = editing && editing.startsWith('emp:') ? S.employees.find(x => x.id === editing.slice(4)) : null;
  const v = e || { probationDone: true };
  return `<div class="card"><h2>${e ? 'Edit employee' : 'Add employee'}</h2>
  <form class="grid" id="empForm" data-id="${e ? e.id : ''}">
    <label>Staff number<input name="staffNo" required value="${esc(v.staffNo)}"></label>
    <label>Full name<input name="name" required value="${esc(v.name)}"></label>
    <label>Position<input name="position" value="${esc(v.position)}"></label>
    <label>Phone<input name="phone" value="${esc(v.phone)}"></label>
    <label>Date of employment<input name="employedOn" type="date" value="${esc(v.employedOn)}"></label>
    <label>Monthly gross salary<input name="gross" type="number" step="0.01" min="0" required value="${esc(v.gross)}"></label>
    <label>Contract end date (blank = permanent)<input name="contractEnd" type="date" value="${esc(v.contractEnd)}"></label>
    <label class="chk"><input type="checkbox" name="probationDone" ${v.probationDone ? 'checked' : ''}> Probation completed</label>
    <label class="chk"><input type="checkbox" name="servingNotice" ${v.servingNotice ? 'checked' : ''}> Serving notice</label>
    <div class="row"><button class="b p">${e ? 'Save changes' : 'Add employee'}</button>${e ? '<button type="button" class="b" data-back>Cancel</button>' : ''}</div>
  </form></div>
  <div class="card"><h2>Employees (${S.employees.length})</h2>${S.employees.length ? `<div class="wrap"><table><tr><th>Staff no.</th><th>Name</th><th>Position</th><th>Phone</th><th>Employed</th><th class="n">Gross</th><th>Status</th><th></th></tr>
  ${[...S.employees].sort((a, b) => a.name.localeCompare(b.name)).map(x => `<tr><td>${esc(x.staffNo)}</td><td>${esc(x.name)}</td><td>${esc(x.position)}</td><td>${esc(x.phone)}</td><td>${esc(x.employedOn)}</td><td class="n">${money(x.gross)}</td>
    <td>${x.probationDone ? '' : '<span class="pill warn">Probation</span> '}${x.servingNotice ? '<span class="pill bad">Notice</span> ' : ''}${x.contractEnd ? `<span class="pill">Contract to ${esc(x.contractEnd)}</span>` : ''}</td>
    <td><button class="b" data-editemp="${x.id}">Edit</button></td></tr>`).join('')}</table></div>` : '<p class="muted">No employees yet.</p>'}</div>`;
}

function settings() {
  return `<div class="card"><h2>Advance fund</h2><form class="grid" id="settings">
    <label>Company name (shown on the printed form)<input name="companyName" value="${esc(S.settings.companyName)}"></label>
    <label>Total advance fund set by management<input name="fundSize" type="number" step="0.01" min="0" value="${esc(S.settings.fundSize)}"></label>
    <div style="align-self:end"><button class="b p">Save</button></div></form></div>
  <div class="card"><h2>Backup &amp; restore</h2>
    <p class="muted">Records live only on this laptop in the <code>data</code> folder. A copy is made automatically every day (last 90 kept). Keep a downloaded backup on a USB stick in a safe place.</p>
    <div class="row"><a class="b p" href="/api/backup" style="text-decoration:none;padding:6px 12px;border-radius:6px">Download backup</a>
      <label class="b" style="flex-direction:row;cursor:pointer;color:var(--ink)">Restore from file…<input type="file" id="restoreFile" accept=".json" hidden></label></div>
    <h2 style="margin-top:16px">Automatic copies</h2>
    ${S.backups.length ? `<div class="wrap"><table>${S.backups.slice(0, 30).map(b => `<tr><td>${esc(b)}</td><td><button class="b" data-restore="${esc(b)}">Restore this copy</button></td></tr>`).join('')}</table></div>` : '<p class="muted">None yet.</p>'}
    <p class="muted">Every restore first saves the current records as a "pre-restore" copy, so a restore can itself be undone.</p></div>`;
}

function render() {
  $('#app').innerHTML = { dashboard, requests, advances, employees, settings }[tab]();
  const ap = $('#approve');
  if (ap) {
    const r = S.requests.find(x => x.id === ap.dataset.id);
    const upd = () => { // live re-check of amount-related rules when the boss lowers the amount
      const amt = Number(ap.amount.value), e = emp(r.employeeId);
      const others = r.checks.filter(c => !/Amount|fund/.test(c.rule)).filter(c => !c.ok);
      const fundLeft = S.summary.remainingFund;
      const probs = [...others.map(c => c.rule)];
      if (!(amt > 0 && amt <= r.amount)) probs.push('Amount must be > 0 and ≤ requested');
      if (amt > e.gross / 3 + 0.001) probs.push(`Amount ≤ 1/3 of gross (${money(e.gross / 3)})`);
      if (amt > fundLeft + 0.001) probs.push(`Remaining fund (${money(fundLeft)})`);
      $('#approveBtn').disabled = probs.length > 0;
      $('#approveNote').textContent = probs.length ? 'Blocked by: ' + probs.join('; ') : 'All rules pass for this amount.';
    };
    ap.amount.oninput = upd; upd();
  }
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-deduct],[data-review],[data-print],[data-back],[data-editemp],[data-undo],[data-restore]');
  if (!t) return;
  const d = t.dataset;
  if (d.deduct) act('POST', `requests/${d.deduct}/deduct`, {}, 'Deduction recorded');
  else if (d.review) { editing = 'req:' + d.review; if (tab === 'dashboard') { tab = 'requests'; document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); } render(); }
  else if (d.print) window.open('/print.html?id=' + d.print, '_blank');
  else if ('back' in d) { editing = null; render(); }
  else if (d.editemp) { editing = 'emp:' + d.editemp; render(); scrollTo(0, 0); }
  else if (d.undo) { if (confirm('Remove this payment?')) { const [rid, pid] = d.undo.split('/'); act('DELETE', `requests/${rid}/payment/${pid}`, null, 'Payment removed'); } }
  else if (d.restore) { if (confirm(`Replace ALL current records with the copy "${d.restore}"?`)) act('POST', 'restore/' + encodeURIComponent(d.restore), {}, 'Restored'); }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, b = formData(f);
  if (f.id === 'newReq') { if (await act('POST', 'requests', b, 'Request recorded as pending')) f.reset(); }
  else if (f.id === 'approve') { if (confirm(`Approve ${money(b.amount)}?`)) act('POST', `requests/${f.dataset.id}/approve`, b, 'Approved'); }
  else if (f.id === 'reject') { if (confirm('Reject this request?')) act('POST', `requests/${f.dataset.id}/reject`, b, 'Rejected'); }
  else if (f.id === 'repay') act('POST', `requests/${f.dataset.id}/repay`, b, 'Early repayment recorded');
  else if (f.id === 'empForm') { if (await act(f.dataset.id ? 'PUT' : 'POST', 'employees' + (f.dataset.id ? '/' + f.dataset.id : ''), b, 'Employee saved')) { editing = null; render(); } }
  else if (f.id === 'settings') act('PUT', 'settings', b, 'Settings saved');
});

document.addEventListener('change', async e => {
  if (e.target.id !== 'restoreFile' || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (confirm('Replace ALL current records with this backup file?')) act('POST', 'restore', data, 'Restored from file');
  } catch { toast('That file could not be read as a backup', true); }
  e.target.value = '';
});

call('GET', 'state').then(s => { S = s; render(); }).catch(e => $('#app').textContent = e.message);
