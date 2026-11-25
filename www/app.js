(() => {
  /* splash: plays ~3s, tap to skip */
  const sp = document.getElementById('splash');
  if (sp) {
    let gone = false;
    const out = () => {
      if (gone) return; gone = true;
      sp.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.18)' }],
        { duration: 600, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' })
        .onfinish = () => { sp.remove(); window.dispatchEvent(new Event('splash-done')); };
    };
    sp.onclick = out; setTimeout(out, 3200);
  }
})();
(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const money = (n, whole) => new Intl.NumberFormat(cfg.LOCALE || 'en-IN', {
    style: 'currency', currency: cfg.CURRENCY || 'INR', maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: 0
  }).format(n);
  const m0 = n => money(n, true);
  const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const add = (p, ...k) => { k.forEach(n => n && p.append(n)); return p; };
  const later = (fn, ms = 60) => setTimeout(fn, ms);

  const CATS = {
    expense: [['Food','🍜'],['Rent','🏠'],['EMI','💳'],['Transport','🚌'],['Bills','💡'],['Shopping','🛍️'],['Health','💊'],['Fun','🎬'],['Other','📦']],
    income: [['Salary','💼'],['Bonus','🎁'],['EMI','💳'],['Other','➕']]
  };
  const LIMIT = { Rent: 30, Food: 12, EMI: 20, Transport: 5, Bills: 5, Shopping: 5, Health: 5, Fun: 5, Other: 5 };
  const iconFor = (type, c) => ((CATS[type] || []).find(x => x[0] === c) || [0, '•'])[1];

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    $('#authMsg').textContent = 'Set SUPABASE_URL and SUPABASE_ANON_KEY in www/config.js.';
    $('#authBtn').disabled = true; return;
  }
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let user = null, inApp = false, mode = 'login', type = 'expense', cat = 'Food', lkind = 'lent', lf = 'all', tab = 'home';
  let month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  let txs = [], loans = [], budgets = [], shares = [], splitGroups = [], splitErr = '', groupErr = '', budgetErr = '', editingTx = null, editingLoan = null;
  let flexLoans = [], flexPayments = [], flexErr = '', loanMode = 'emi', paymentLoan = null;
  let signingUp = false, recovering = false, editingSplit = null;

  const show = id => $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const setBusy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
  const say = (el, t, ok) => { el.textContent = ''; void el.offsetWidth; el.textContent = t; el.classList.toggle('ok', !!ok); };
  function seg(id, attr, cb) {
    $$(`#${id} button`).forEach((b, i) => b.onclick = () => {
      $(`#${id}`).dataset.i = i; $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset[attr]);
    });
  }

  /* ---------- auth ---------- */
  seg('authSeg', 'mode', m => {
    mode = m; $('#authBtn span').textContent = m === 'login' ? 'Log in' : 'Create account';
    $('#password').autocomplete = m === 'login' ? 'current-password' : 'new-password'; $('#authMsg').textContent = '';
  });
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('#email').value.trim(), password = $('#password').value;
    if (!email || password.length < 6) return say($('#authMsg'), 'Enter an email and a password of at least 6 characters.');
    setBusy($('#authBtn'), true);
    const signup = mode === 'signup'; signingUp = signup;
    const res = signup ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
    if (signup && res.data?.session) await sb.auth.signOut();
    signingUp = false;
    setBusy($('#authBtn'), false);
    if (res.error) return say($('#authMsg'), res.error.message);
    if (signup) { $('#authSeg button[data-mode="login"]').click(); $('#password').value = ''; say($('#authMsg'), res.data.session ? 'Account created. Please log in.' : 'Account created. Confirm your email if required, then log in.', true); }
  };
  $('#logout').onclick = async () => { closeSheets(); await cancelReminders(); await sb.auth.signOut(); };
  sb.auth.onAuthStateChange((_e, session) => { if (signingUp || recovering) return; setTimeout(() => {
    if (session) { user = session.user; if (!inApp) { inApp = true; enterApp(); } }
    else { closeSheets(); user = null; inApp = false; document.body.classList.remove('in-app'); show('auth'); }
  }, 0); });
  $('#forgotPassword').onclick = () => { $('#authForm').hidden = true; $('#authSeg').hidden = true; $('#forgotPassword').hidden = true; $('#recoveryForm').hidden = false; $('#recoveryEmail').value = $('#email').value.trim(); $('#recoveryMsg').textContent = ''; };
  $('#recoveryBack').onclick = () => { $('#recoveryForm').hidden = true; $('#authForm').hidden = false; $('#authSeg').hidden = false; $('#forgotPassword').hidden = false; };
  $('#sendRecovery').onclick = async () => {
    const email = $('#recoveryEmail').value.trim(); if (!email) return say($('#recoveryMsg'), 'Enter your email address.');
    setBusy($('#sendRecovery'), true); const { error } = await sb.auth.resetPasswordForEmail(email); setBusy($('#sendRecovery'), false);
    say($('#recoveryMsg'), error ? error.message : 'If the account exists, a recovery email has been sent.', !error);
  };
  $('#recoveryForm').onsubmit = async e => {
    e.preventDefault(); const email = $('#recoveryEmail').value.trim(), token = $('#recoveryCode').value.trim(), password = $('#recoveryPassword').value;
    if (!email || !token || password.length < 6) return say($('#recoveryMsg'), 'Enter your email, recovery code, and a password of at least 6 characters.');
    setBusy($('#recoverSave'), true); recovering = true;
    let recoverySession = false;
    try {
      const verified = await sb.auth.verifyOtp({ email, token, type: 'recovery' }); if (verified.error) return say($('#recoveryMsg'), verified.error.message);
      recoverySession = true;
      const updated = await sb.auth.updateUser({ password }); if (updated.error) return say($('#recoveryMsg'), updated.error.message);
      $('#recoveryForm').reset(); $('#recoveryBack').click(); $('#email').value = email; say($('#authMsg'), 'Password changed. Please log in.', true);
    } catch (error) { say($('#recoveryMsg'), error.message || 'Could not reset password.'); }
    finally { if (recoverySession) await sb.auth.signOut(); recovering = false; setBusy($('#recoverSave'), false); }
  };
  function enterApp() {
    $('#authForm').reset(); $('#authMsg').textContent = '';
    document.body.classList.add('in-app'); show('shell'); switchTab('home'); loadAll();
  }

  /* ---------- data ---------- */
  async function loadTx() {
    $('#monthLabel').textContent = month.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const { data, error } = await sb.from('transactions').select('*').gte('date', ymd(month)).lt('date', ymd(next))
      .order('date', { ascending: false }).order('created_at', { ascending: false });
    if (error) { $('#list').replaceChildren(h('p', 'empty', 'Could not load entries: ' + error.message)); return; }
    txs = data;
  }
  async function loadLoans() {
    const [fixed, flexible, payments] = await Promise.all([sb.from('loans').select('*').order('created_at', { ascending: false }), sb.from('flexible_loans').select('*').order('created_at', { ascending: false }), sb.from('flexible_loan_payments').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })]);
    loans = fixed.data || []; loanErr = fixed.error ? fixed.error.message : '';
    flexLoans = flexible.data || []; flexPayments = payments.data || []; flexErr = (flexible.error || payments.error)?.message || '';
  }
  async function loadBudgets() {
    const { data, error } = await sb.from('category_budgets').select('*').eq('month', ymd(month));
    budgets = data || []; budgetErr = error ? error.message : '';
  }
  async function loadShares() {
    const [old, groups] = await Promise.all([sb.from('split_shares').select('*').order('created_at', { ascending: false }), sb.from('split_groups').select('*').order('created_at', { ascending: false })]);
    shares = old.data || []; splitErr = old.error ? old.error.message : '';
    splitGroups = groups.data || []; groupErr = groups.error ? groups.error.message : '';
  }
  let loanErr = '';
  async function loadAll(animate = true) {
    await Promise.all([loadTx(), loadLoans(), loadBudgets(), loadShares()]);
    if (user && localStorage.getItem('payday-reminders-' + user.id) === 'on') {
      try { await scheduleReminders(); } catch (e) { console.warn('Could not schedule reminders', e); }
    }
    renderHome(animate); if (tab === 'loans') renderLoans(false); if (tab === 'save') renderSave(false);
  }
  $('#prev').onclick = () => { month.setMonth(month.getMonth() - 1); loadAll(); };
  $('#next').onclick = () => { month.setMonth(month.getMonth() + 1); loadAll(); };

  /* ---------- tabs ---------- */
  function switchTab(t) {
    tab = t;
    const names = ['home', 'loans', 'save', 'splitTab', 'budgetTab'];
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#nav i').style.transform = `translateX(${names.indexOf(t) * 100}%)`;
    $$('.tab').forEach(x => x.classList.toggle('on', x.id === t));
    $('#monthBar').style.visibility = t === 'loans' || t === 'splitTab' ? 'hidden' : 'visible';
    $('.screen.active')?.scrollTo(0, 0);
    if (t === 'home') renderHome(true); if (t === 'loans') renderLoans(true); if (t === 'save') renderSave(true);
  }
  $$('#nav button').forEach(b => b.onclick = () => switchTab(b.dataset.t));
  window.addEventListener('splash-done', () => { if (inApp) switchTab(tab); });

  /* ---------- helpers ---------- */
  function countUp(el, to, f = m0) {
    const from = +el.dataset.cur || 0; el.dataset.cur = to;
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? f(from + (to - from) * e) : (f === m0 ? money(to) : f(to));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const bar = (pct, cls, limit) => {
    const b = h('div', 'bar ' + (cls || '')), i = h('i'); b.append(i);
    if (limit != null) { const m = h('em'); m.style.left = Math.min(100, limit) + '%'; b.append(m); }
    later(() => i.style.width = Math.max(0, Math.min(100, pct)) + '%'); return b;
  };
  const stats = () => {
    const inc = txs.filter(t => t.type === 'income').reduce((a, t) => a + Number(t.amount), 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0);
    return { inc, exp, left: inc - exp };
  };
  function daysLeft() {
    const now = new Date();
    if (now.getFullYear() !== month.getFullYear() || now.getMonth() !== month.getMonth()) return 0;
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  }
  function dayLabel(s) {
    const d = new Date(s + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - d) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
  }

  /* ---------- home ---------- */
  function renderHome(animate) {
    const { inc, exp, left } = stats(), over = left < 0;
    $('#fill').style.height = '0'; later(() => $('#fill').style.height = (inc > 0 ? Math.max(0, Math.min(1, left / inc)) * 100 : 0) + '%');
    $('#tank').classList.toggle('over', over);
    $('#leftLabel').textContent = over ? 'Over by' : 'Left to spend';
    $('#leftAmt').classList.toggle('over', over);
    countUp($('#leftAmt'), Math.abs(left)); countUp($('#incAmt'), inc); countUp($('#expAmt'), exp);
    const d = daysLeft();
    $('#perDay').textContent = d && left > 0 ? m0(left / d) : '-';
    $('#daysLeft').textContent = d ? `for ${d} day${d > 1 ? 's' : ''}` : 'past month';

    renderBudgets();
    renderSplits();
    const list = $('#list'); list.innerHTML = '';
    if (!txs.length) return list.append(h('p', 'empty', 'Nothing logged this month. Tap + to add your salary, then your expenses.'));
    let last = '', i = 0;
    txs.forEach(t => {
      if (t.date !== last) { last = t.date; list.append(h('div', 'day', dayLabel(t.date))); }
      const row = h('div', 'item' + (animate ? ' enter' : '')); row.style.setProperty('--i', i++);
      const meta = add(h('div', 'meta'), h('b', 0, t.note || t.category), h('small', 0, t.note ? t.category : (t.type === 'income' ? 'Income' : 'Expense') + ' · No note'));
      const edit = h('button', 'del icon-action'); edit.setAttribute('aria-label', 'Edit ' + (t.note || t.category));
      edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-.8L19 8.2 15.8 5 4.8 16zM14.5 6.3l3.2 3.2"/></svg>'; edit.onclick = () => openEntry(t);
      const del = h('button', 'del icon-action'); del.setAttribute('aria-label', 'Delete ' + (t.note || t.category));
      const trash = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'; del.innerHTML = trash;
      del.onclick = async () => {
        if (!window.confirm('Delete this transaction?')) return;
        row.classList.add('removing');
        const { error } = await sb.from('transactions').delete().eq('id', t.id);
        if (error) { row.classList.remove('removing'); return alert(error.message); }
        later(() => { txs = txs.filter(x => x.id !== t.id); renderHome(false); if (tab === 'save') renderSave(false); }, 300);
      };
      add(row, add(h('div', 'ico'), iconFor(t.type, t.category) && document.createTextNode(iconFor(t.type, t.category))), meta,
        h('div', 'amt ' + (t.type === 'income' ? 'in' : 'out'), (t.type === 'income' ? '+' : '−') + money(Number(t.amount))), edit, del);
      list.append(row);
    });
  }

  function renderSplits() {
    const box = $('#splits'); box.replaceChildren();
    box.append(h('h2', 'pg', 'Split expenses'));
    if (groupErr) box.append(h('p', 'empty', 'Could not load group splits: ' + groupErr + '. Run the latest supabase.sql.'));
    splitGroups.forEach(group => {
      const card = h('div', 'card split-card'), people = group.payments;
      const total = people.reduce((sum, p) => sum + p.cents, 0), base = Math.floor(total / people.length), extra = total % people.length;
      const balances = people.map((p, i) => ({ name: p.name, cents: p.cents - base - (i < extra ? 1 : 0) }));
      add(card, h('h3', 0, group.title), h('p', 'small', 'Total ' + money(total / 100) + ' · Split equally between ' + people.length));
      people.forEach(p => card.append(h('p', 'split-line', p.name + ' paid ' + money(p.cents / 100))));
      const debtors = balances.filter(p => p.cents < 0), creditors = balances.filter(p => p.cents > 0);
      if (!debtors.length) card.append(h('p', 'small', 'Everyone is even.'));
      debtors.forEach(debtor => creditors.forEach(creditor => {
        const amount = Math.min(-debtor.cents, creditor.cents);
        if (amount > 0) { card.append(h('p', 'split-settlement', debtor.name + ' pays ' + creditor.name + ' ' + money(amount / 100))); debtor.cents += amount; creditor.cents -= amount; }
      }));
      const del = h('button', 'act', 'Delete');
      del.onclick = async () => {
        if (!window.confirm('Delete this split?')) return;
        setBusy(del, true); const { error } = await sb.from('split_groups').delete().eq('id', group.id);
        if (error) { setBusy(del, false); return alert(error.message); } await loadShares(); renderSplits();
      };
      const edit = h('button', 'act', 'Edit'); edit.onclick = () => openSplit(group);
      card.append(add(h('div', 'btns'), edit, del)); box.append(card);
    });
    if (splitErr) return box.append(h('p', 'empty', 'Could not load splits: ' + splitErr + '. Run the latest supabase.sql.'));
    if (!shares.length) { if (!splitGroups.length && !groupErr) box.append(h('p', 'empty', 'Tap + to create a split and see who owes whom.')); return; }
    box.append(h('h3', 'list-title', 'Previous shared expenses'));
    const outstanding = shares.filter(s => !s.settled).reduce((sum, s) => sum + Number(s.amount), 0);
    box.append(h('p', 'small', 'Outstanding: ' + money(outstanding)));
    shares.forEach(s => {
      const card = h('div', 'card'), action = h('button', 'act', s.settled ? 'Reopen' : 'Mark settled');
      action.onclick = async () => {
        setBusy(action, true);
        const { error } = await sb.from('split_shares').update({ settled: !s.settled }).eq('id', s.id);
        if (error) { setBusy(action, false); return alert(error.message); }
        await loadShares(); renderSplits();
      };
      add(card, h('b', 0, s.description), h('p', 'small', s.person + ' · ' + money(Number(s.amount)) + (s.settled ? ' · Settled' : ' · Owes you')), action); box.append(card);
    });
  }
  function refreshSplitRemove() { $$('#splitPeople .split-person button').forEach(b => { b.hidden = $$('#splitPeople .split-person').length <= 2; }); }
  function addSplitPerson(payment = null) {
    const row = h('div', 'split-person'), person = h('input'), amount = h('input'), remove = h('button', 'act', 'Remove');
    person.placeholder = 'Name'; person.maxLength = 40; person.setAttribute('aria-label', 'Person name');
    amount.type = 'number'; amount.min = '0'; amount.step = '0.01'; amount.placeholder = 'Paid'; amount.setAttribute('aria-label', 'Amount paid');
    if (payment) { person.value = payment.name; amount.value = (payment.cents / 100).toFixed(2); }
    remove.type = 'button'; remove.onclick = () => { row.remove(); refreshSplitRemove(); }; add(row, person, amount, remove); $('#splitPeople').append(row); refreshSplitRemove();
  }
  function openSplit(group = null) {
    editingSplit = group; $('#splitDescription').value = group ? group.title : ''; $('#splitMsg').textContent = '';
    $('#splitSave span').textContent = group ? 'Update split' : 'Save split';
    $('#splitPeople').replaceChildren(); if (group) group.payments.forEach(addSplitPerson); else { addSplitPerson(); addSplitPerson(); }
    $('#overlay').classList.add('open'); $('#splitSheet').classList.add('open');
  }
  $('#splitAddPerson').onclick = () => addSplitPerson();
  $('#splitSave').onclick = async () => {
    const description = $('#splitDescription').value.trim();
    const people = $$('#splitPeople .split-person').map(row => ({ name: row.children[0].value.trim(), raw: row.children[1].value }));
    if (!description || people.length < 2 || people.some(p => !p.name || !/^\d+(\.\d{1,2})?$/.test(p.raw) || !Number.isSafeInteger(Math.round(Number(p.raw) * 100))) || new Set(people.map(p => p.name.toLowerCase())).size !== people.length || people.every(p => Number(p.raw) === 0)) return say($('#splitMsg'), 'Enter a title, at least two different names, and valid amounts paid (use 0 if needed).');
    setBusy($('#splitSave'), true);
    const values = { title: description, payments: people.map(p => ({ name: p.name, cents: Math.round(Number(p.raw) * 100) })) };
    const { error } = editingSplit ? await sb.from('split_groups').update(values).eq('id', editingSplit.id) : await sb.from('split_groups').insert(values);
    setBusy($('#splitSave'), false); if (error) return say($('#splitMsg'), error.message);
    closeSheets(); await loadShares(); renderSplits();
  };

  function renderBudgets() {
    const box = $('#budgets'); box.replaceChildren();
    const title = add(h('div', 'budget-title'), h('h2', 'list-title', 'Category budgets'));
    box.append(title);
    if (budgetErr) return box.append(h('p', 'empty', 'Could not load budgets: ' + budgetErr + '. Run the latest supabase.sql.'));
    if (!budgets.length) return box.append(h('p', 'empty', 'Tap + to set monthly limits for your expense categories.'));
    const card = h('div', 'card');
    budgets.forEach(b => {
      const spent = txs.filter(t => t.type === 'expense' && t.category === b.category).reduce((sum, t) => sum + Number(t.amount), 0);
      const limit = Number(b.amount), pct = spent / limit * 100;
      card.append(add(h('div', 'cat'), add(h('div', 'h'), h('span', 0, iconFor('expense', b.category) + ' ' + b.category), h('b', 0, money(spent) + ' / ' + money(limit))), bar(pct, pct > 100 ? 'cat over' : 'cat'), h('small', 'small', pct > 100 ? money(spent - limit) + ' over budget' : money(limit - spent) + ' left')));
    });
    box.append(card);
  }
  function openBudgets() {
    const fields = $('#budgetFields'); fields.replaceChildren();
    CATS.expense.forEach(([name, icon]) => {
      const label = h('label', 'budget-field', icon + ' ' + name), input = h('input');
      input.type = 'number'; input.inputMode = 'decimal'; input.min = '0'; input.step = '0.01'; input.placeholder = 'No limit'; input.dataset.category = name;
      const current = budgets.find(b => b.category === name); if (current) input.value = current.amount;
      label.append(input); fields.append(label);
    });
    $('#budgetMsg').textContent = ''; $('#budgetMonth').textContent = month.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    $('#overlay').classList.add('open'); $('#budgetSheet').classList.add('open');
  }
  $('#budgetSave').onclick = async () => {
    const inputs = $$('#budgetFields input');
    if (inputs.some(i => i.value !== '' && (!Number.isFinite(Number(i.value)) || Number(i.value) <= 0))) return say($('#budgetMsg'), 'Enter a positive amount, or leave a category blank.');
    setBusy($('#budgetSave'), true);
    const period = ymd(month), rows = inputs.filter(i => i.value !== '').map(i => ({ user_id: user.id, month: period, category: i.dataset.category, amount: Number(i.value) }));
    const removed = inputs.filter(i => i.value === '').map(i => i.dataset.category);
    let error;
    if (rows.length) ({ error } = await sb.from('category_budgets').upsert(rows, { onConflict: 'user_id,month,category' }));
    if (!error && removed.length) ({ error } = await sb.from('category_budgets').delete().eq('month', period).in('category', removed));
    setBusy($('#budgetSave'), false);
    if (error) { await loadBudgets(); return say($('#budgetMsg'), error.message); }
    closeSheets(); await loadBudgets(); renderBudgets();
  };

  /* ---------- loans ---------- */
  const rem = l => Math.max(0, l.total_emis - l.paid_emis) * Number(l.emi);
  const closed = l => l.paid_emis >= l.total_emis;
  const overdue = l => !closed(l) && l.next_due < ymd(new Date());
  function nextMonth(s) {
    const d = new Date(s + 'T00:00:00'), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d);
  }
  function dueFromStart(start, offset) {
    const date = new Date(start + 'T00:00:00'), day = date.getDate();
    date.setDate(1); date.setMonth(date.getMonth() + offset);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate())); return ymd(date);
  }
  const fmtDue = s => new Date(s + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
  const flexPaid = l => flexPayments.filter(p => p.loan_id === l.id).reduce((sum, p) => sum + Number(p.amount), 0);

  const notifications = () => window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.LocalNotifications;
  async function cancelReminders() {
    const plugin = notifications(); if (!plugin) return;
    try {
      const pending = await plugin.getPending();
      const ours = pending.notifications.filter(n => n.extra && n.extra.paydayLoanReminder);
      if (ours.length) await plugin.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    } catch (e) { console.warn('Could not cancel reminders', e); }
  }
  async function scheduleReminders() {
    const plugin = notifications(); if (!plugin || loanErr) return;
    await cancelReminders();
    const reminders = loans.filter(l => !closed(l)).map(l => {
      const at = new Date(l.next_due + 'T09:00:00'); at.setDate(at.getDate() - 1);
      let hash = 0; for (const c of l.id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
      return { id: (hash & 0x7fffffff) || 1, title: 'EMI due tomorrow', body: (l.kind === 'lent' ? 'Receive from ' : 'Pay ') + l.person + ': ' + money(Number(l.emi)), schedule: { at }, extra: { paydayLoanReminder: true } };
    }).filter(n => n.schedule.at > new Date());
    if (reminders.length) await plugin.schedule({ notifications: reminders });
  }
  async function toggleReminders(button, status) {
    const plugin = notifications();
    if (!plugin) { status.textContent = 'Reminders are available in the Android app.'; return; }
    if (localStorage.getItem('payday-reminders-' + user.id) === 'on') {
      localStorage.removeItem('payday-reminders-' + user.id); await cancelReminders(); renderLoans(false); return;
    }
    try {
      const permission = await plugin.requestPermissions();
      if (permission.display !== 'granted') { status.textContent = 'Allow notifications in your Android settings.'; return; }
      localStorage.setItem('payday-reminders-' + user.id, 'on'); await scheduleReminders(); renderLoans(false);
    } catch (e) { localStorage.removeItem('payday-reminders-' + user.id); status.textContent = 'Could not schedule reminders: ' + e.message; }
  }

  async function payEmi(l, btn) {
    setBusy(btn, true);
    const lent = l.kind === 'lent';
    if (l.start_date && l.start_date > ymd(new Date())) { setBusy(btn, false); return alert('This loan has not started yet.'); }
    const u = await sb.from('loans').update({ paid_emis: l.paid_emis + 1, next_due: l.start_date ? dueFromStart(l.start_date, l.paid_emis + 1) : nextMonth(l.next_due) }).eq('id', l.id).eq('paid_emis', l.paid_emis).select('id');
    if (u.error) { setBusy(btn, false); return; }
    if (!u.data.length) { setBusy(btn, false); await loadLoans(); renderLoans(false); return alert('This loan changed. Please review it and try again.'); }
    await sb.from('transactions').insert({
      type: lent ? 'income' : 'expense', amount: l.emi, category: 'EMI',
      note: (lent ? 'EMI received from ' : 'EMI paid to ') + l.person, date: ymd(new Date())
    });
    const cur = month.getFullYear() * 12 + month.getMonth(), now = new Date().getFullYear() * 12 + new Date().getMonth();
    if (cur !== now) { month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0); }
    await loadAll(false); renderLoans(false);
  }

  function renderLoans(animate) {
    const box = $('#loanBody'); box.innerHTML = '';
    box.append(h('h2', 'pg', 'Loans'));
    if (loanErr) return box.append(h('p', 'empty', 'Could not load loans: ' + loanErr + '. Run supabase.sql in Supabase.'));
    const reminderStatus = h('p', 'small', 'Get a reminder at 9 AM one day before an EMI is due.');
    const reminderButton = h('button', 'act', localStorage.getItem('payday-reminders-' + user.id) === 'on' ? 'Turn off reminders' : 'Enable EMI reminders');
    reminderButton.onclick = () => toggleReminders(reminderButton, reminderStatus); box.append(add(h('div', 'reminder-row'), reminderStatus, reminderButton));
    if (flexErr) box.append(h('p', 'empty', 'Could not load flexible loans: ' + flexErr + '. Run the latest supabase.sql.'));
    const sum = k => loans.filter(l => l.kind === k).reduce((a, l) => a + rem(l), 0) + flexLoans.filter(l => l.kind === k).reduce((a, l) => a + Math.max(0, Number(l.principal) - flexPaid(l)), 0);
    const tile = (lbl, cls, v) => { const b = h('b', cls, '0'); countUp(b, v); return add(h('div', 'card'), h('span', 'label', lbl), b); };
    box.append(add(h('div', 'tiles'), tile("You'll receive", 'mint', sum('lent')), tile('You owe', 'coral', sum('borrowed'))));
    if (!loans.length && !flexLoans.length) return box.append(h('p', 'empty', 'No loans yet. Tap + to track money you lent or borrowed.'));

    const chips = h('div', 'fchips');
    [['all', 'All'], ['lent', 'I lent'], ['borrowed', 'I borrowed']].forEach(([k, t]) => {
      const c = h('button', 'chip' + (lf === k ? ' on' : ''), t);
      c.onclick = () => { lf = k; renderLoans(false); }; chips.append(c);
    });
    box.append(chips);
    flexLoans.filter(l => lf === 'all' || l.kind === lf).forEach(l => {
      const paid = flexPaid(l), remaining = Math.max(0, Number(l.principal) - paid), card = h('div', 'card');
      add(card, h('h3', 0, l.person), h('p', 'small', (l.kind === 'lent' ? 'You lent ' : 'You borrowed ') + money(Number(l.principal)) + ' · Flexible payments'),
        h('p', 0, 'Remaining ' + money(remaining)), bar(paid / Number(l.principal) * 100, l.kind === 'lent' ? '' : 'out'));
      const history = h('details'); history.append(h('summary', 0, 'Payment history'));
      const entries = flexPayments.filter(p => p.loan_id === l.id);
      if (!entries.length) history.append(h('p', 'small', 'No payments yet.'));
      entries.forEach(p => history.append(h('p', 'small', p.date + ' · ' + money(Number(p.amount))))); card.append(history);
      const pay = h('button', 'act', remaining ? 'Record payment' : 'Fully settled'); pay.disabled = !remaining;
      pay.onclick = () => { paymentLoan = l; $('#flexAmount').value = ''; $('#flexDate').value = ymd(new Date()); $('#flexPaymentInfo').textContent = l.person + ' · Remaining ' + money(remaining); $('#flexPaymentMsg').textContent = ''; $('#overlay').classList.add('open'); $('#flexPaymentSheet').classList.add('open'); };
      card.append(pay); box.append(card);
    });
    loans.filter(l => lf === 'all' || l.kind === lf).forEach((l, i) => {
      const lent = l.kind === 'lent', od = overdue(l), done = closed(l);
      const card = h('div', 'card' + (animate ? ' pop-in' : '')); card.style.setProperty('--i', i);
      const tag = h('span', 'tag' + (done ? ' ok' : od ? ' bad' : ''), done ? 'Closed ✓' : (od ? 'Overdue · ' : 'Due ') + fmtDue(l.next_due));
      add(card,
        add(h('div', 'lh'), h('div', 'av ' + l.kind, l.person[0].toUpperCase()),
          add(h('div', 'lm'), h('b', 0, l.person), h('small', 0, `${lent ? 'You lent' : 'You borrowed'} · ${money(Number(l.emi))}/month`)), tag),
        add(h('div', 'lr'), h('span', 0, `${l.paid_emis} of ${l.total_emis} EMIs`), add(h('span'), document.createTextNode('Remaining '), h('b', 0, money(rem(l))))),
        bar(l.paid_emis / l.total_emis * 100, lent ? '' : 'out'));
      const pay = h('button', 'act' + (done ? ' done' : ''), done ? 'Fully settled' : lent ? 'Mark received' : 'Mark paid');
      pay.disabled = done || !!(l.start_date && l.start_date > ymd(new Date())); pay.onclick = () => payEmi(l, pay);
      const x = h('button', 'act x', 'Delete');
      x.onclick = async () => {
        if (!window.confirm('Delete this loan?')) return;
        const { error } = await sb.from('loans').delete().eq('id', l.id); if (error) return alert(error.message); await loadLoans();
        if (localStorage.getItem('payday-reminders-' + user.id) === 'on') { try { await scheduleReminders(); } catch (e) { console.warn(e); } }
        renderLoans(false);
      };
      const edit = h('button', 'act', 'Edit'); edit.onclick = () => openLoan(l);
      card.append(add(h('div', 'btns'), pay, edit, x)); box.append(card);
    });
  }

  /* ---------- savings ---------- */
  function renderSave(animate) {
    const box = $('#saveBody'); box.innerHTML = '';
    box.append(h('h2', 'pg', 'Savings'));
    const { inc, exp, left } = stats();
    if (!inc) return box.append(h('p', 'empty', 'Add your salary for this month to see how much you can save.'));

    const frac = Math.max(0, Math.min(1, left / inc)), goal = Math.round(inc * 0.2);
    const pct = h('div', 'big', '0%'); pct.style.marginBottom = '4px'; countUp(pct, Math.round(frac * 100), v => Math.round(v) + '%');
    const ring = h('div'); ring.innerHTML = '<svg class="ring" width="124" height="124" viewBox="0 0 124 124"><circle class="t" cx="62" cy="62" r="52"/><circle class="v" cx="62" cy="62" r="52"/></svg>';
    later(() => ring.querySelector('.v').style.strokeDashoffset = 327 * (1 - frac));
    const note = h('div', 'small'); note.style.fontSize = '13px';
    note.textContent = left > 0 ? `A good target is ${m0(goal)} (20% of salary).` : 'You have spent more than your salary this month.';
    box.append(add(h('div', 'card'), add(h('div', 'ringbox'), ring, add(h('div'), h('div', 'label', 'Salary still unspent'), pct, note))));

    const by = {}; txs.filter(t => t.type === 'expense').forEach(t => by[t.category] = (by[t.category] || 0) + Number(t.amount));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const S = 2.5; // bar scale: 40% of salary fills the bar
    if (top.length) {
      const c = add(h('div', 'card'), h('p', 'ttl', 'Where your salary went'));
      top.slice(0, 6).forEach(([name, v]) => {
        const p = v / inc * 100, lim = LIMIT[name] || 5;
        c.append(add(h('div', 'cat'), add(h('div', 'h'), h('span', 0, iconFor('expense', name) + ' ' + name), h('b', 0, Math.round(p) + '%')),
          bar(p * S, 'cat' + (p > lim ? ' over' : ''), lim * S)));
      });
      c.append(h('small', 'small', 'Green marker = suggested limit. Red bars are over it.')); box.append(c);
    }

    const flex = top.find(([n]) => ['Food', 'Shopping', 'Fun', 'Transport', 'Other'].includes(n));
    if (flex) {
      const [fname, fv] = flex, sl = h('input'); sl.type = 'range'; sl.min = 0; sl.max = 40; sl.value = 15;
      const out = h('div'); out.style.cssText = 'font-size:14px;line-height:1.6';
      const upd = () => { const p = +sl.value, m = fv * p / 100;
        out.replaceChildren(document.createTextNode(`Cut ${fname.toLowerCase()} by ${p}% → save `), Object.assign(h('b', 'mint', m0(m)), {}), document.createTextNode(' a month, '), h('b', 'mint', m0(m * 12)), document.createTextNode(' a year')); };
      sl.oninput = upd; upd();
      box.append(add(h('div', 'card'), h('p', 'ttl', `What if you spend less on ${fname.toLowerCase()}?`), sl, out));
    }

    const tips = [];
    tips.push(['⚡', 'Pay yourself first', `Move 20% of your salary (${m0(goal)}) to savings on payday, then spend what is left.`]);
    top.filter(([n, v]) => v / inc * 100 > (LIMIT[n] || 5)).slice(0, 2).forEach(([n, v]) => {
      const lim = LIMIT[n] || 5, save = v - inc * lim / 100;
      tips.push(['🎯', `${n} is ${Math.round(v / inc * 100)}% of your salary`, `A suggested limit is ${lim}%. Staying at the limit saves about ${m0(save)} a month.`]);
    });
    loans.filter(l => l.kind === 'lent' && overdue(l)).slice(0, 2).forEach(l =>
      tips.push(['🔔', `Collect from ${l.person}`, `An EMI of ${m0(Number(l.emi))} is overdue. Getting it back adds to your savings.`]));
    const emiOut = loans.filter(l => l.kind === 'borrowed' && !closed(l)).reduce((a, l) => a + Number(l.emi), 0);
    if (emiOut) {
      const r = emiOut / inc * 100;
      tips.push(['📈', r > 40 ? `EMIs take ${Math.round(r)}% of your salary` : 'Clear the costliest loan first',
        r > 40 ? 'Above 40% is risky. Avoid new loans and put extra cash on the one with the highest interest.' : 'Put any extra cash on the loan with the highest interest rate.']);
    }
    const c = h('div', 'card');
    tips.forEach(([ic, t, d]) => c.append(add(h('div', 'tip'), h('div', 'ico', ic), add(h('div'), h('b', 0, t), h('p', 0, d)))));
    box.append(c);
  }

  /* ---------- sheets ---------- */
  const closeSheets = () => { $('#overlay').classList.remove('open'); $$('.sheet').forEach(s => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }); document.activeElement.blur(); };
  $('#overlay').onclick = closeSheets;
  $('#fab').onclick = () => tab === 'loans' ? openLoan() : tab === 'splitTab' ? openSplit() : tab === 'budgetTab' ? openBudgets() : openEntry();

  function openMenuSheet(id) {
    closeSheets(); $('#overlay').classList.add('open'); $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false');
  }
  $('#menuOpen').onclick = () => openMenuSheet('#menuSheet');
  $('#testNotification').onclick = async () => {
    const button = $('#testNotification'), msg = $('#testNotificationMsg'), plugin = notifications();
    if (!plugin) return say(msg, 'Test notifications are available in the installed Android app.');
    setBusy(button, true);
    try {
      const permission = await plugin.requestPermissions();
      if (permission.display !== 'granted') return say(msg, 'Allow notifications in your Android settings.');
      await plugin.schedule({ notifications: [{ id: 2147483646, title: 'Payday test notification', body: 'Notifications are working on this device.', schedule: { at: new Date(Date.now() + 3000) } }] });
      say(msg, 'Test scheduled. Check your notification shade in a few seconds.', true);
    } catch (error) { say(msg, error.message || 'Could not send the test notification.'); }
    finally { setBusy(button, false); }
  };
  $('#menuClose').onclick = closeSheets;
  $('#profileClose').onclick = closeSheets;
  $('#menuProfile').onclick = () => {
    $('#profileName').value = user.user_metadata?.display_name || '';
    $('#profileEmail').value = user.email || '';
    $('#profileMsg').textContent = ''; $('#passwordForm').reset(); $('#passwordMsg').textContent = ''; openMenuSheet('#profileSheet'); $('#profileName').focus();
  };
  $('#profileForm').onsubmit = async e => {
    e.preventDefault(); const name = $('#profileName').value.trim();
    if (!name) return say($('#profileMsg'), 'Enter your display name.');
    setBusy($('#profileSave'), true);
    try {
      const { data, error } = await sb.auth.updateUser({ data: { display_name: name } });
      if (error) return say($('#profileMsg'), error.message);
      user = data.user; say($('#profileMsg'), 'Profile saved.', true);
    } catch (error) { say($('#profileMsg'), error.message || 'Could not save your profile.'); }
    finally { setBusy($('#profileSave'), false); }
  };
  $('#passwordForm').onsubmit = async e => {
    e.preventDefault();
    const password = $('#newPassword').value, confirmation = $('#confirmPassword').value, msg = $('#passwordMsg');
    if (password.length < 6) return say(msg, 'Use at least 6 characters.');
    if (password !== confirmation) return say(msg, 'Passwords do not match.');
    setBusy($('#passwordSave'), true);
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) return say(msg, error.message);
      $('#passwordForm').reset(); say(msg, 'Password changed.', true);
    } catch (error) { say(msg, error.message || 'Could not change your password.'); }
    finally { setBusy($('#passwordSave'), false); }
  };

  function renderChips() {
    const box = $('#chips'); box.innerHTML = '';
    CATS[type].forEach(([n, e]) => {
      const c = h('button', 'chip' + (n === cat ? ' on' : ''), e + ' ' + n); c.type = 'button';
      c.onclick = () => { cat = n; renderChips(); }; box.append(c);
    });
  }
  seg('typeSeg', 'type', t => { type = t; cat = CATS[t][0][0]; renderChips(); });
  function openEntry(entry = null) {
    editingTx = entry; type = entry ? entry.type : 'expense'; cat = entry ? entry.category : CATS[type][0][0];
    $('#typeSeg').dataset.i = type === 'expense' ? 0 : 1; $$('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
    $('#saveBtn span').textContent = entry ? 'Update entry' : 'Save entry';
    $('#curSym').textContent = (0).toLocaleString(cfg.LOCALE || 'en-IN', { style: 'currency', currency: cfg.CURRENCY || 'INR', minimumFractionDigits: 0 }).replace(/[\d\s.,]/g, '');
    $('#amount').value = entry ? entry.amount : ''; $('#note').value = entry ? (entry.note || '') : ''; $('#sheetMsg').textContent = ''; $('#date').value = entry ? entry.date : ymd(new Date());
    renderChips(); $('#overlay').classList.add('open'); $('#sheet').classList.add('open'); setTimeout(() => $('#amount').focus(), 380);
  }
  $('#saveBtn').onclick = async () => {
    const amount = parseFloat($('#amount').value.replace(/,/g, ''));
    if (!(amount > 0)) return say($('#sheetMsg'), 'Enter an amount greater than 0.');
    setBusy($('#saveBtn'), true);
    const date = $('#date').value || ymd(new Date());
    const values = { type, amount, category: cat, note: $('#note').value.trim() || null, date };
    const { error } = editingTx ? await sb.from('transactions').update(values).eq('id', editingTx.id) : await sb.from('transactions').insert(values);
    setBusy($('#saveBtn'), false);
    if (error) return say($('#sheetMsg'), error.message);
    closeSheets(); const d = new Date(date + 'T00:00:00'); month = new Date(d.getFullYear(), d.getMonth(), 1); loadAll(false);
  };

  seg('loanSeg', 'k', k => { lkind = k; });
  seg('loanModeSeg', 'mode', m => { loanMode = m; $('#flexLoanFields').hidden = m !== 'flexible'; $('#emiLoanFields').hidden = m === 'flexible'; });
  function openLoan(loan = null) {
    editingLoan = loan; lkind = loan ? loan.kind : 'lent';
    loanMode = 'emi'; $('#loanModeSeg').dataset.i = 0; $$('#loanModeSeg button').forEach(b => { b.classList.toggle('on', b.dataset.mode === 'emi'); b.disabled = !!loan; });
    $('#flexLoanFields').hidden = true; $('#emiLoanFields').hidden = false; $('#lPrincipal').value = '';
    $('#loanSeg').dataset.i = lkind === 'lent' ? 0 : 1; $$('#loanSeg button').forEach(b => b.classList.toggle('on', b.dataset.k === lkind));
    $('#loanSave span').textContent = loan ? 'Update loan' : 'Save loan';
    $('#lPerson').value = loan ? loan.person : ''; $('#lEmi').value = loan ? loan.emi : ''; $('#lTotal').value = loan ? loan.total_emis : ''; $('#lPaid').value = loan ? loan.paid_emis : ''; $('#lDue').value = loan ? (loan.start_date || loan.next_due) : ymd(new Date()); $('#lDue').disabled = !!loan; $('#lDue').parentElement.firstChild.textContent = loan && !loan.start_date ? 'Existing next due date' : 'Loan start date'; $('#loanMsg').textContent = '';
    $('#overlay').classList.add('open'); $('#loanSheet').classList.add('open'); setTimeout(() => $('#lPerson').focus(), 380);
  }
  $('#loanSave').onclick = async () => {
    if (loanMode === 'flexible') {
      const person = $('#lPerson').value.trim(), principal = Number($('#lPrincipal').value);
      if (!person || !Number.isFinite(principal) || principal <= 0) return say($('#loanMsg'), 'Enter a name and a loan amount greater than zero.');
      setBusy($('#loanSave'), true);
      const { error } = await sb.from('flexible_loans').insert({ kind: lkind, person, principal });
      setBusy($('#loanSave'), false); if (error) return say($('#loanMsg'), error.message);
      closeSheets(); await loadLoans(); renderLoans(true); return;
    }
    const person = $('#lPerson').value.trim(), emi = parseFloat($('#lEmi').value.replace(/,/g, '')),
      total = parseInt($('#lTotal').value, 10), paid = parseInt($('#lPaid').value || '0', 10), due = $('#lDue').value;
    const msg = $('#loanMsg');
    if (!person) return say(msg, 'Enter the person or lender name.');
    if (!(emi > 0)) return say(msg, 'Enter the EMI amount.');
    if (!(total > 0)) return say(msg, 'Enter the total number of EMIs.');
    if (!(paid >= 0) || paid > total) return say(msg, 'Paid EMIs cannot be more than total EMIs.');
    if (!due) return say(msg, 'Pick the loan start date.');
    setBusy($('#loanSave'), true);
    const start = editingLoan ? editingLoan.start_date : due;
    const values = { kind: lkind, person, emi, total_emis: total, paid_emis: paid, next_due: start ? dueFromStart(start, paid) : editingLoan.next_due };
    if (!editingLoan) values.start_date = start;
    const { error } = editingLoan ? await sb.from('loans').update(values).eq('id', editingLoan.id) : await sb.from('loans').insert(values);
    setBusy($('#loanSave'), false);
    if (error) return say(msg, error.message);
    closeSheets(); await loadLoans();
    if (localStorage.getItem('payday-reminders-' + user.id) === 'on') { try { await scheduleReminders(); } catch (e) { console.warn(e); } }
    renderLoans(true);
  };
  $('#flexPaymentSave').onclick = async () => {
    const amount = Number($('#flexAmount').value), date = $('#flexDate').value;
    if (!paymentLoan || !Number.isFinite(amount) || amount <= 0 || !date) return say($('#flexPaymentMsg'), 'Enter a valid amount and date.');
    setBusy($('#flexPaymentSave'), true);
    const { error } = await sb.rpc('record_flexible_payment', { p_loan: paymentLoan.id, p_amount: amount, p_date: date });
    setBusy($('#flexPaymentSave'), false); if (error) return say($('#flexPaymentMsg'), error.message);
    closeSheets(); const d = new Date(date + 'T00:00:00'); month = new Date(d.getFullYear(), d.getMonth(), 1); await loadAll(false);
  };
  // Confirm successful startup so the updater can retain the new bundle.
  if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.CapacitorUpdater) {
    window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady().catch(error => console.warn('Live update initialization failed', error));
  }
})();
