// Reserve: quantity, email, confirmation. Checked in the page; nothing is sent anywhere.
import { makeSeg } from './seg.js';

const PRICE = 240, MAX = 4;

export function createReserve() {
  const form = document.getElementById('reserve-form');
  if (!form) return;
  const card = form.closest('.card'), done = document.getElementById('done');
  const minus = document.getElementById('qty-minus'), plus = document.getElementById('qty-plus');
  const qtySeg = makeSeg(document.getElementById('qty-seg')), totalSeg = makeSeg(document.getElementById('total-seg')), leftSeg = makeSeg(document.getElementById('left-seg'));
  const qtyOut = document.getElementById('qty-out'), totalText = document.getElementById('total-text'), leftText = document.getElementById('left-text');
  const email = document.getElementById('email'), err = document.getElementById('email-err');
  let qty = 1, left = 14;

  function render(say = false) {
    qtySeg(qty); totalSeg(qty * PRICE); leftSeg(left);
    minus.disabled = qty <= 1; plus.disabled = qty >= Math.min(MAX, left);
    leftText.textContent = `${left} sets left`;
    if (say) { qtyOut.textContent = `${qty} ${qty === 1 ? 'set' : 'sets'}`; totalText.textContent = `total $${qty * PRICE}`; }
  }
  minus.addEventListener('click', () => { if (qty > 1) { qty--; render(true); } if (minus.disabled) plus.focus(); });
  plus.addEventListener('click', () => { if (qty < Math.min(MAX, left)) { qty++; render(true); } if (plus.disabled) minus.focus(); });

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
    render(); email.focus();
  });
  render();
}
