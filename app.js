(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const money = (n, whole) => new Intl.NumberFormat(cfg.LOCALE || 'en-IN', {
    style: 'currency', currency: cfg.CURRENCY || 'INR',
    maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: 0
  }).format(n);

  const CATS = {
    expense: [['Food','🍜'],['Rent','🏠'],['Transport','🚌'],['Bills','💡'],['Shopping','🛍️'],['Health','💊'],['Fun','🎬'],['Other','📦']],
    income: [['Salary','💼'],['Bonus','🎁'],['Other','➕']]
  };
  const iconFor = t => (CATS[t.type].find(c => c[0] === t.category) || [0, '•'])[1];

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    $('#authMsg').textContent = 'Set SUPABASE_URL and SUPABASE_ANON_KEY in www/config.js.';
    $('#authBtn').disabled = true;
    return;
  }
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let user = null, inApp = false, mode = 'login', type = 'expense', cat = 'Food';
  let month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  let txs = [];

  const show = id => $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const setBusy = (btn, on) => { btn.disabled = on; btn.classList.toggle('busy', on); };

  /* ---------- auth ---------- */
  $$('#authSeg button').forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    $('#authSeg').dataset.i = mode === 'login' ? 0 : 1;
    $$('#authSeg button').forEach(x => x.classList.toggle('on', x === b));
    $('#authBtn span').textContent = mode === 'login' ? 'Log in' : 'Create account';
    $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#authMsg').textContent = '';
  });

  const authMsg = (t, ok) => { const m = $('#authMsg'); m.textContent = ''; void m.offsetWidth; m.textContent = t; m.classList.toggle('ok', !!ok); };

  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('#email').value.trim(), password = $('#password').value;
    if (!email || password.length < 6) return authMsg('Enter an email and a password of at least 6 characters.');
    setBusy($('#authBtn'), true);
    const res = mode === 'login'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    setBusy($('#authBtn'), false);
    if (res.error) return authMsg(res.error.message);
    if (!res.data.session) authMsg('Account created. Check your email to confirm it, then log in.', true);
  };

  $('#logout').onclick = () => sb.auth.signOut();

  sb.auth.onAuthStateChange((_e, session) => {
    setTimeout(() => {
      if (session) { user = session.user; if (!inApp) { inApp = true; enterApp(); } }
      else { user = null; inApp = false; show('auth'); }
    }, 0);
  });

  function enterApp() {
    $('#authForm').reset(); $('#authMsg').textContent = '';
    show('home'); load(true);
  }

  /* ---------- data ---------- */
  async function load(animate) {
    $('#monthLabel').textContent = month.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const { data, error } = await sb.from('transactions').select('*')
      .gte('date', ymd(month)).lt('date', ymd(next))
      .order('date', { ascending: false }).order('created_at', { ascending: false });
    if (error) { $('#list').innerHTML = ''; const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Could not load entries: ' + error.message; $('#list').append(p); return; }
    txs = data; render(animate);
  }

  $('#prev').onclick = () => { month.setMonth(month.getMonth() - 1); load(true); };
  $('#next').onclick = () => { month.setMonth(month.getMonth() + 1); load(true); };

  /* ---------- render ---------- */
  const shown = {};
  function countUp(el, to) {
    const from = shown[el.id] || 0; shown[el.id] = to;
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? money(from + (to - from) * e, true) : money(to);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function dayLabel(s) {
    const d = new Date(s + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - d) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
  }

  function render(animate) {
    const inc = txs.filter(t => t.type === 'income').reduce((a, t) => a + Number(t.amount), 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0);
    const left = inc - exp, over = left < 0;
    $('#fill').style.height = (inc > 0 ? Math.max(0, Math.min(1, left / inc)) * 100 : 0) + '%';
    $('#tank').classList.toggle('over', over);
    $('#leftLabel').textContent = over ? 'Over by' : 'Left to spend';
    $('#leftAmt').classList.toggle('over', over);
    countUp($('#leftAmt'), Math.abs(left)); countUp($('#incAmt'), inc); countUp($('#expAmt'), exp);

    const list = $('#list'); list.innerHTML = '';
    if (!txs.length) {
      const p = document.createElement('p'); p.className = 'empty';
      p.textContent = 'Nothing logged this month. Tap + to add your salary, then your expenses.';
      list.append(p); return;
    }
    let lastDay = '', i = 0;
    txs.forEach(t => {
      if (t.date !== lastDay) {
        lastDay = t.date;
        const h = document.createElement('div'); h.className = 'day'; h.textContent = dayLabel(t.date); list.append(h);
      }
      const row = document.createElement('div'); row.className = 'item' + (animate ? ' enter' : '');
      row.style.setProperty('--i', i++);
      const ico = document.createElement('div'); ico.className = 'ico'; ico.textContent = iconFor(t);
      const meta = document.createElement('div'); meta.className = 'meta';
      const b = document.createElement('b'); b.textContent = t.category;
      const sm = document.createElement('small'); sm.textContent = t.note || (t.type === 'income' ? 'Income' : 'Expense');
      meta.append(b, sm);
      const amt = document.createElement('div'); amt.className = 'amt ' + (t.type === 'income' ? 'in' : 'out');
      amt.textContent = (t.type === 'income' ? '+' : '−') + money(Number(t.amount));
      const del = document.createElement('button'); del.className = 'del'; del.textContent = 'Delete';
      let timer;
      del.onclick = async () => {
        if (!del.classList.contains('sure')) {
          del.classList.add('sure'); del.textContent = 'Sure?';
          timer = setTimeout(() => { del.classList.remove('sure'); del.textContent = 'Delete'; }, 2500); return;
        }
        clearTimeout(timer); row.classList.add('removing');
        const { error } = await sb.from('transactions').delete().eq('id', t.id);
        if (error) { row.classList.remove('removing'); return; }
        setTimeout(() => { txs = txs.filter(x => x.id !== t.id); render(false); }, 300);
      };
      row.append(ico, meta, amt, del); list.append(row);
    });
  }

  /* ---------- add sheet ---------- */
  function renderChips() {
    const box = $('#chips'); box.innerHTML = '';
    CATS[type].forEach(([n, e]) => {
      const c = document.createElement('button'); c.type = 'button';
      c.className = 'chip' + (n === cat ? ' on' : ''); c.textContent = e + ' ' + n;
      c.onclick = () => { cat = n; renderChips(); };
      box.append(c);
    });
  }

  $$('#typeSeg button').forEach(b => b.onclick = () => {
    type = b.dataset.type; cat = CATS[type][0][0];
    $('#typeSeg').dataset.i = type === 'expense' ? 0 : 1;
    $$('#typeSeg button').forEach(x => x.classList.toggle('on', x === b));
    renderChips();
  });

  function openSheet() {
    $('#curSym').textContent = (0).toLocaleString(cfg.LOCALE || 'en-IN', { style: 'currency', currency: cfg.CURRENCY || 'INR', minimumFractionDigits: 0 }).replace(/[\d\s.,]/g, '');
    $('#amount').value = ''; $('#note').value = ''; $('#sheetMsg').textContent = '';
    $('#date').value = ymd(new Date());
    renderChips();
    $('#overlay').classList.add('open'); $('#sheet').classList.add('open');
    setTimeout(() => $('#amount').focus(), 380);
  }
  function closeSheet() { $('#overlay').classList.remove('open'); $('#sheet').classList.remove('open'); document.activeElement.blur(); }
  $('#fab').onclick = openSheet;
  $('#overlay').onclick = closeSheet;

  $('#saveBtn').onclick = async () => {
    const amount = parseFloat($('#amount').value.replace(/,/g, ''));
    const msg = $('#sheetMsg');
    if (!(amount > 0)) { msg.textContent = ''; void msg.offsetWidth; msg.textContent = 'Enter an amount greater than 0.'; return; }
    setBusy($('#saveBtn'), true);
    const date = $('#date').value || ymd(new Date());
    const { error } = await sb.from('transactions').insert({ type, amount, category: cat, note: $('#note').value.trim() || null, date });
    setBusy($('#saveBtn'), false);
    if (error) { msg.textContent = error.message; return; }
    closeSheet();
    const d = new Date(date + 'T00:00:00');
    month = new Date(d.getFullYear(), d.getMonth(), 1);
    load(false);
  };
})();
