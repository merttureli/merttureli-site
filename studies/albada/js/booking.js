/* The booking: a month calendar, the basket, the passengers, a live total, then a boarding card.
   Nothing leaves the page: there is no fetch and the form has no action. Flight mornings, full
   mornings and prices are invented (see NOTES.md). */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PRICE = { shared: 175, private: 750 }, MAX_PAX = 8, MONTHS_AHEAD = 5;

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const longDate = d => `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
const money = n => n.toLocaleString('en-US');
const $ = id => document.getElementById(id);
/* aria-disabled, not disabled: the button keeps the keyboard focus when it reaches its limit */
const off = (btn, is) => { if (is) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled'); };

/* Thursday to Sunday, from tomorrow to the end of the fifth month ahead. Which mornings are full is a
   fixed function of the date, so the calendar looks the same on every visit that day. */
export function createSchedule(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD + 1, 0);
  const chance = d => { let x = (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) | 0;
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39); return ((x ^ (x >>> 15)) >>> 0) / 4294967296; };
  const stateOf = d => {
    if (d <= today) return 'past';
    if (d > last) return 'closed';
    if (![0, 4, 5, 6].includes(d.getDay())) return 'none';
    return chance(d) < ((d - today) / 864e5 < 12 ? 0.42 : 0.24) ? 'full' : 'open';
  };
  const nextOpen = from => { for (let d = from, i = 0; i < 400; i++, d = addDays(d, 1)) if (stateOf(d) === 'open') return d; return null; };
  return { today, first, last, stateOf, nextOpen };
}

const WHY = { past: 'in the past', closed: 'not open for booking yet', none: 'no flight', full: 'full', open: 'flight morning' };

export function initBooking({ reduce = false } = {}) {
  const form = $('bookForm'), body = $('calBody');
  if (!form || !body) return null;
  const sched = createSchedule(), firstOpen = sched.nextOpen(addDays(sched.today, 1)) || addDays(sched.today, 1);
  const state = { date: null, basket: 'shared', pax: 2, sharedPax: 2, cursor: firstOpen, y: firstOpen.getFullYear(), m: firstOpen.getMonth(), tried: false };
  const say = msg => { const s = $('bookStatus'); s.textContent = ''; requestAnimationFrame(() => { s.textContent = msg; }); };

  /* ----- calendar ----- */
  function drawMonth() {
    const { y, m } = state, n = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7;
    $('calMonth').textContent = `${MONTHS[m]} ${y}`;
    let html = '<tr>' + '<td></td>'.repeat(lead);
    for (let day = 1; day <= n; day++) {
      const d = new Date(y, m, day), k = keyOf(d), st = sched.stateOf(d), on = state.date === k;
      if (day > 1 && (lead + day - 1) % 7 === 0) html += '</tr><tr>';
      html += `<td role="gridcell"><button type="button" class="day${st === 'open' ? ' is-open' : ''}${st === 'full' ? ' is-full' : ''}" data-date="${k}" tabindex="-1" aria-pressed="${on}"${st === 'open' ? '' : ' aria-disabled="true"'} aria-label="${longDate(d)}, ${on ? 'your morning' : WHY[st]}"><span>${day}</span></button></td>`;
    }
    html += '<td></td>'.repeat((7 - (lead + n) % 7) % 7) + '</tr>';
    body.innerHTML = html;
    off($('calPrev'), new Date(y, m, 1) <= sched.first);
    off($('calNext'), new Date(y, m + 1, 1) > sched.last);
    rove();
  }
  const btnFor = d => body.querySelector(`[data-date="${keyOf(d)}"]`);
  function rove(focus) {
    body.querySelectorAll('.day[tabindex="0"]').forEach(b => { b.tabIndex = -1; });
    const b = btnFor(state.cursor);
    if (b) { b.tabIndex = 0; if (focus) b.focus(); }
  }
  function moveTo(d, focus = true) {
    if (d < sched.first) d = sched.first;
    if (d > sched.last) d = sched.last;
    state.cursor = d;
    if (d.getFullYear() !== state.y || d.getMonth() !== state.m) { state.y = d.getFullYear(); state.m = d.getMonth(); drawMonth(); }
    rove(focus);
  }
  function turn(by) {
    const first = new Date(state.y, state.m + by, 1);
    if (first < sched.first || first > sched.last) return;
    state.y = first.getFullYear(); state.m = first.getMonth();
    const chosen = state.date && fromKey(state.date), inMonth = d => d && d.getFullYear() === state.y && d.getMonth() === state.m;
    const open = sched.nextOpen(first);
    state.cursor = inMonth(chosen) ? chosen : inMonth(open) ? open : first > sched.today ? first : addDays(sched.today, 1);
    if (!inMonth(state.cursor)) state.cursor = first;
    drawMonth();
  }
  function choose(k) {
    const d = fromKey(k), st = sched.stateOf(d);
    state.cursor = d;
    if (st !== 'open') { rove(); say(`${longDate(d)}: ${WHY[st]}. Choose a morning with a dot.`); return; }
    state.date = k;
    body.querySelectorAll('.day').forEach(b => { const on = b.dataset.date === k, dd = fromKey(b.dataset.date);
      b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', `${longDate(dd)}, ${on ? 'your morning' : WHY[sched.stateOf(dd)]}`); });
    rove();
    setError('errDate', null, false);
    summary();
    say(`${longDate(d)} chosen. Lift-off at 07:15.`);
  }
  body.addEventListener('click', e => { const b = e.target.closest('.day'); if (b) choose(b.dataset.date); });
  body.addEventListener('keydown', e => {
    const c = state.cursor, dow = (c.getDay() + 6) % 7;
    const to = { ArrowLeft: addDays(c, -1), ArrowRight: addDays(c, 1), ArrowUp: addDays(c, -7), ArrowDown: addDays(c, 7), Home: addDays(c, -dow), End: addDays(c, 6 - dow),
      PageUp: new Date(c.getFullYear(), c.getMonth() - 1, Math.min(c.getDate(), new Date(c.getFullYear(), c.getMonth(), 0).getDate())),
      PageDown: new Date(c.getFullYear(), c.getMonth() + 1, Math.min(c.getDate(), new Date(c.getFullYear(), c.getMonth() + 2, 0).getDate())) }[e.key];
    if (!to) return;
    e.preventDefault(); moveTo(to);
  });
  body.addEventListener('focusin', e => { const b = e.target.closest('.day'); if (b && b.dataset.date !== keyOf(state.cursor)) { state.cursor = fromKey(b.dataset.date); rove(); } });
  $('calPrev').addEventListener('click', () => turn(-1));
  $('calNext').addEventListener('click', () => turn(1));

  /* ----- basket, passengers, total ----- */
  const total = () => state.basket === 'private' ? PRICE.private : PRICE.shared * state.pax;
  function summary() {
    const priv = state.basket === 'private';
    $('paxOut').textContent = state.pax;
    off($('paxLess'), priv || state.pax <= 1);
    off($('paxMore'), priv || state.pax >= MAX_PAX);
    $('paxNote').textContent = priv ? 'A private basket carries two.' : 'From one to eight in the shared basket.';
    $('sumDate').textContent = state.date ? longDate(fromKey(state.date)) : 'Not chosen yet';
    $('sumBasket').textContent = `${priv ? 'Private' : 'Shared'}, ${state.pax} ${state.pax === 1 ? 'passenger' : 'passengers'}`;
    $('sumTotal').textContent = money(total());
  }
  function setBasket(v) {
    if (v === state.basket) return;
    if (v === 'private') { state.sharedPax = state.pax; state.pax = 2; } else state.pax = state.sharedPax;
    state.basket = v;
    form.elements.basket.value = v;
    summary();
  }
  form.addEventListener('change', e => { if (e.target.name === 'basket') setBasket(e.target.value); });
  $('paxLess').addEventListener('click', () => { if (state.basket === 'shared' && state.pax > 1) { state.pax--; summary(); } });
  $('paxMore').addEventListener('click', () => { if (state.basket === 'shared' && state.pax < MAX_PAX) { state.pax++; summary(); } });
  document.querySelectorAll('[data-pick]').forEach(a => a.addEventListener('click', () => setBasket(a.dataset.pick)));

  /* ----- name, email, request ----- */
  const fName = $('fName'), fEmail = $('fEmail');
  const okName = () => fName.value.trim().length >= 2;
  const okEmail = () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fEmail.value.trim());
  function setError(id, input, bad) {
    $(id).hidden = !bad;
    if (input) { if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  }
  fName.addEventListener('input', () => { if (state.tried) setError('errName', fName, !okName()); });
  fEmail.addEventListener('input', () => { if (state.tried) setError('errEmail', fEmail, !okEmail()); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    state.tried = true;
    const badDate = !state.date, badName = !okName(), badEmail = !okEmail();
    setError('errDate', null, badDate); setError('errName', fName, badName); setError('errEmail', fEmail, badEmail);
    if (badDate || badName || badEmail) {
      const n = badDate + badName + badEmail;
      say(n === 1 ? 'One thing is missing.' : `${n} things are missing.`);
      if (badDate) { if (!btnFor(state.cursor)) moveTo(state.cursor, false); rove(true); } else (badName ? fName : fEmail).focus();
      return;
    }
    confirm();
  });

  function confirm() {
    const d = fromKey(state.date), name = fName.value.trim().replace(/\s+/g, ' '), email = fEmail.value.trim(), priv = state.basket === 'private';
    $('passHello').textContent = `Buenos días, ${name.split(' ')[0]}.`;
    $('passLede').textContent = 'Your morning is chosen. This is the boarding card you would get.';
    $('cName').textContent = name;
    $('cDate').textContent = `${longDate(d)}, ${d.getFullYear()}`;
    $('cBasket').textContent = priv ? 'Private' : 'Shared';
    $('cPax').textContent = state.pax;
    $('cTotal').textContent = `${money(total())} euros`;
    $('cRef').textContent = `ALB ${pad(d.getMonth() + 1)}${pad(d.getDate())} ${priv ? 'P' : 'S'}${state.pax}`;
    $('passSample').textContent = `This is a sample site, so nothing was sent and no flight is booked. If Albada were real, this card would be on its way to ${email}.`;
    form.hidden = true; $('book-h').hidden = true; $('book').classList.add('is-done');
    const pass = $('pass'); pass.hidden = false;
    $('passHello').focus({ preventScroll: true });
    $('book').scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    say('Boarding card shown. This is a sample, nothing was sent.');
  }
  $('passAgain').addEventListener('click', () => {
    $('pass').hidden = true; form.hidden = false; $('book-h').hidden = false; $('book').classList.remove('is-done');
    state.date = null; state.tried = false;
    state.y = state.cursor.getFullYear(); state.m = state.cursor.getMonth();
    drawMonth(); summary(); rove(true);
  });

  drawMonth(); summary();
  return { nextOpen: firstOpen, label: longDate(firstOpen) };
}
