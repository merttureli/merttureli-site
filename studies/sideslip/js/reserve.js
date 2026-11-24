// Reserve: quantity, email, confirmation. Checked in the page; nothing is sent anywhere.
// The stepper buttons use aria-disabled, not disabled, so focus stays on a button that reaches its limit and
// repeated Enter on "+" stays at the limit. When the batch is out of sets the form cannot be sent and the batch
// lamps (bar and card) go dark with "batch 02 full".
import { makeSeg } from './seg.js';

const PRICE = 240, MAX = 4;

export function createReserve() {
  const form = document.getElementById('reserve-form');
  if (!form) return;
  const card = form.closest('.card'), done = document.getElementById('done');
  const minus = document.getElementById('qty-minus'), plus = document.getElementById('qty-plus'), go = document.getElementById('go');
  const qtySeg = makeSeg(document.getElementById('qty-seg')), totalSeg = makeSeg(document.getElementById('total-seg')), leftSeg = makeSeg(document.getElementById('left-seg'));
  const qtyOut = document.getElementById('qty-out'), totalText = document.getElementById('total-text'), leftText = document.getElementById('left-text');
  const qtyNote = document.getElementById('qty-note'), goNote = document.getElementById('go-note');
  const email = document.getElementById('email'), err = document.getElementById('email-err');
  const lamps = [...document.querySelectorAll('[data-batch-lamp]')], states = [...document.querySelectorAll('[data-batch-state]')];
  let qty = 1, left = 14;

  const off = b => b.getAttribute('aria-disabled') === 'true';
  function render(say = false) {
    const full = left <= 0;
    qty = full ? 0 : Math.max(1, Math.min(qty, MAX, left));
    qtySeg(qty); totalSeg(qty * PRICE); leftSeg(left);
    minus.setAttribute('aria-disabled', String(full || qty <= 1));
    plus.setAttribute('aria-disabled', String(full || qty >= Math.min(MAX, left)));
    go.disabled = full;
    for (const l of lamps) l.classList.toggle('lamp--green', !full);
    for (const s of states) s.textContent = full ? 'batch 02 full' : 'batch 02 open';
    qtyNote.textContent = full ? 'no sets left in this batch' : `up to ${Math.min(MAX, left)} per order`;
    goNote.textContent = full ? 'batch 02 is full: nothing to reserve' : 'sample site: nothing is sent';
    leftText.textContent = `${left} ${left === 1 ? 'set' : 'sets'} left`;
    if (say) { qtyOut.textContent = full ? 'batch 02 full, 0 sets' : `${qty} ${qty === 1 ? 'set' : 'sets'}`; totalText.textContent = `total $${qty * PRICE}`; }
  }
  minus.addEventListener('click', () => { if (!off(minus)) { qty--; render(true); } });
  plus.addEventListener('click', () => { if (!off(plus)) { qty++; render(true); } });

  const OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function check() {
    const v = email.value.trim();
    const msg = !v ? 'enter your email so the batch notice can reach you' : OK.test(v) ? '' : 'that email is missing something: check the @ and the part after it';
    err.hidden = !msg; err.querySelector('span').textContent = msg;
    email.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }
  email.addEventListener('input', () => { if (email.getAttribute('aria-invalid') === 'true') check(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (left <= 0 || qty < 1) return;
    if (!check()) { email.focus(); return; }
    left = Math.max(0, left - qty);
    document.getElementById('done-text').textContent = `${qty} ${qty === 1 ? 'set' : 'sets'} of the RP-3 from batch 02, $${qty * PRICE} when they ship. The notice would go to ${email.value.trim()}.`;
    card.classList.add('is-done'); done.hidden = false;
    render();
    document.getElementById('done-title').focus();
  });
  document.getElementById('again').addEventListener('click', () => {
    form.reset(); qty = 1; err.hidden = true; email.removeAttribute('aria-invalid');
    card.classList.remove('is-done'); done.hidden = true;
    render(true);
    (left > 0 ? email : minus).focus();
  });
  render();
}
