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
  let txs = [], loans = [];

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
    const res = mode === 'login' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    setBusy($('#authBtn'), false);
    if (res.error) return say($('#authMsg'), res.error.message);
    if (!res.data.session) say($('#authMsg'), 'Account created. Check your email to confirm it, then log in.', true);
  };
  $('#logout').onclick = () => sb.auth.signOut();
  sb.auth.onAuthStateChange((_e, session) => setTimeout(() => {
    if (session) { user = session.user; if (!inApp) { inApp = true; enterApp(); } }
    else { user = null; inApp = false; document.body.classList.remove('in-app'); show('auth'); }
  }, 0));
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
    const { data, error } = await sb.from('loans').select('*').order('created_at', { ascending: false });
    if (error) { loans = []; loanErr = error.message; } else { loans = data; loanErr = ''; }
  }
  let loanErr = '';
  async function loadAll(animate = true) {
    await Promise.all([loadTx(), loadLoans()]);
    renderHome(animate); if (tab === 'loans') renderLoans(false); if (tab === 'save') renderSave(false);
  }
  $('#prev').onclick = () => { month.setMonth(month.getMonth() - 1); loadAll(); };
  $('#next').onclick = () => { month.setMonth(month.getMonth() + 1); loadAll(); };

  /* ---------- tabs ---------- */
  function switchTab(t) {
    tab = t;
    const names = ['home', 'loans', 'save'];
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#nav i').style.transform = `translateX(${names.indexOf(t) * 100}%)`;
    $$('.tab').forEach(x => x.classList.toggle('on', x.id === t));
    $('#monthBar').style.visibility = t === 'loans' ? 'hidden' : 'visible';
    $('.screen.active')?.scrollTo(0, 0);
    if (t === 'home') renderHome(true); if (t === 'loans') renderLoans(true); if (t === 'save') renderSave(true);
  }
  $$('#nav button').forEach(b => b.onclick = () => switchTab(b.dataset.t));

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

    const list = $('#list'); list.innerHTML = '';
    if (!txs.length) return list.append(h('p', 'empty', 'Nothing logged this month. Tap + to add your salary, then your expenses.'));
    let last = '', i = 0;
    txs.forEach(t => {
      if (t.date !== last) { last = t.date; list.append(h('div', 'day', dayLabel(t.date))); }
      const row = h('div', 'item' + (animate ? ' enter' : '')); row.style.setProperty('--i', i++);
      const meta = add(h('div', 'meta'), h('b', 0, t.category), h('small', 0, t.note || (t.type === 'income' ? 'Income' : 'Expense')));
      const del = h('button', 'del', 'Delete'); let timer;
      del.onclick = async () => {
        if (!del.classList.contains('sure')) {
          del.classList.add('sure'); del.textContent = 'Sure?';
          timer = setTimeout(() => { del.classList.remove('sure'); del.textContent = 'Delete'; }, 2500); return;
        }
        clearTimeout(timer); row.classList.add('removing');
        const { error } = await sb.from('transactions').delete().eq('id', t.id);
        if (error) return row.classList.remove('removing');
        later(() => { txs = txs.filter(x => x.id !== t.id); renderHome(false); if (tab === 'save') renderSave(false); }, 300);
      };
      add(row, add(h('div', 'ico'), iconFor(t.type, t.category) && document.createTextNode(iconFor(t.type, t.category))), meta,
        h('div', 'amt ' + (t.type === 'income' ? 'in' : 'out'), (t.type === 'income' ? '+' : '−') + money(Number(t.amount))), del);
      list.append(row);
    });
  }

  /* ---------- loans ---------- */
  const rem = l => Math.max(0, l.total_emis - l.paid_emis) * Number(l.emi);
  const closed = l => l.paid_emis >= l.total_emis;
  const overdue = l => !closed(l) && l.next_due < ymd(new Date());
  function nextMonth(s) {
    const d = new Date(s + 'T00:00:00'), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d);
  }
  const fmtDue = s => new Date(s + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });

  async function payEmi(l, btn) {
    setBusy(btn, true);
    const lent = l.kind === 'lent';
    const u = await sb.from('loans').update({ paid_emis: l.paid_emis + 1, next_due: nextMonth(l.next_due) }).eq('id', l.id);
    if (u.error) { setBusy(btn, false); return; }
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
    if (loanErr) return box.append(h('p', 'empty', 'Could not load loans: ' + loanErr + '. Run supabase-loans.sql in Supabase.'));
    const sum = k => loans.filter(l => l.kind === k).reduce((a, l) => a + rem(l), 0);
    const tile = (lbl, cls, v) => { const b = h('b', cls, '0'); countUp(b, v); return add(h('div', 'card'), h('span', 'label', lbl), b); };
    box.append(add(h('div', 'tiles'), tile("You'll receive", 'mint', sum('lent')), tile('You owe', 'coral', sum('borrowed'))));
    if (!loans.length) return box.append(h('p', 'empty', 'No loans yet. Tap + to track money you lent or borrowed.'));

    const chips = h('div', 'fchips');
    [['all', 'All'], ['lent', 'I lent'], ['borrowed', 'I borrowed']].forEach(([k, t]) => {
      const c = h('button', 'chip' + (lf === k ? ' on' : ''), t);
      c.onclick = () => { lf = k; renderLoans(false); }; chips.append(c);
    });
    box.append(chips);
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
      pay.disabled = done; pay.onclick = () => payEmi(l, pay);
      const x = h('button', 'act x', 'Delete'); let timer;
      x.onclick = async () => {
        if (!x.classList.contains('sure')) {
          x.classList.add('sure'); x.textContent = 'Sure?'; timer = setTimeout(() => { x.classList.remove('sure'); x.textContent = 'Delete'; }, 2500); return;
        }
        clearTimeout(timer); await sb.from('loans').delete().eq('id', l.id); await loadLoans(); renderLoans(false);
      };
      card.append(add(h('div', 'btns'), pay, x)); box.append(card);
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
  const closeSheets = () => { $('#overlay').classList.remove('open'); $$('.sheet').forEach(s => s.classList.remove('open')); document.activeElement.blur(); };
  $('#overlay').onclick = closeSheets;
  $('#fab').onclick = () => tab === 'loans' ? openLoan() : openEntry();

  function renderChips() {
    const box = $('#chips'); box.innerHTML = '';
    CATS[type].forEach(([n, e]) => {
      const c = h('button', 'chip' + (n === cat ? ' on' : ''), e + ' ' + n); c.type = 'button';
      c.onclick = () => { cat = n; renderChips(); }; box.append(c);
    });
  }
  seg('typeSeg', 'type', t => { type = t; cat = CATS[t][0][0]; renderChips(); });
  function openEntry() {
    $('#curSym').textContent = (0).toLocaleString(cfg.LOCALE || 'en-IN', { style: 'currency', currency: cfg.CURRENCY || 'INR', minimumFractionDigits: 0 }).replace(/[\d\s.,]/g, '');
    $('#amount').value = ''; $('#note').value = ''; $('#sheetMsg').textContent = ''; $('#date').value = ymd(new Date());
    renderChips(); $('#overlay').classList.add('open'); $('#sheet').classList.add('open'); setTimeout(() => $('#amount').focus(), 380);
  }
  $('#saveBtn').onclick = async () => {
    const amount = parseFloat($('#amount').value.replace(/,/g, ''));
    if (!(amount > 0)) return say($('#sheetMsg'), 'Enter an amount greater than 0.');
    setBusy($('#saveBtn'), true);
    const date = $('#date').value || ymd(new Date());
    const { error } = await sb.from('transactions').insert({ type, amount, category: cat, note: $('#note').value.trim() || null, date });
    setBusy($('#saveBtn'), false);
    if (error) return say($('#sheetMsg'), error.message);
    closeSheets(); const d = new Date(date + 'T00:00:00'); month = new Date(d.getFullYear(), d.getMonth(), 1); loadAll(false);
  };

  seg('loanSeg', 'k', k => { lkind = k; });
  function openLoan() {
    ['lPerson', 'lEmi', 'lTotal', 'lPaid'].forEach(i => $('#' + i).value = ''); $('#lDue').value = ymd(new Date()); $('#loanMsg').textContent = '';
    $('#overlay').classList.add('open'); $('#loanSheet').classList.add('open'); setTimeout(() => $('#lPerson').focus(), 380);
  }
  $('#loanSave').onclick = async () => {
    const person = $('#lPerson').value.trim(), emi = parseFloat($('#lEmi').value.replace(/,/g, '')),
      total = parseInt($('#lTotal').value, 10), paid = parseInt($('#lPaid').value || '0', 10), due = $('#lDue').value;
    const msg = $('#loanMsg');
    if (!person) return say(msg, 'Enter the person or lender name.');
    if (!(emi > 0)) return say(msg, 'Enter the EMI amount.');
    if (!(total > 0)) return say(msg, 'Enter the total number of EMIs.');
    if (!(paid >= 0) || paid > total) return say(msg, 'Paid EMIs cannot be more than total EMIs.');
    if (!due) return say(msg, 'Pick the next due date.');
    setBusy($('#loanSave'), true);
    const { error } = await sb.from('loans').insert({ kind: lkind, person, emi, total_emis: total, paid_emis: paid, next_due: due });
    setBusy($('#loanSave'), false);
    if (error) return say(msg, error.message);
    closeSheets(); await loadLoans(); renderLoans(true);
  };
})();
