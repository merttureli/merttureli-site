/* Low Light: the RSVP. Everything happens in the page: the pass at the side fills in as the form is
   answered, the form is checked, and then the pass is confirmed. Nothing is sent or stored. */
import { fitText } from './type.js';

const $ = id => document.getElementById(id);
const NIGHTS = { thu: 'Thu 12', fri: 'Fri 13', sat: 'Sat 14' };
const TAU = Math.PI * 2;
const frac = v => v - Math.floor(v);
const hash = (a, b) => frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);
const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* The constellation: a small round chart with the alphabet around its rim. Each letter of the name is a
   star on its own letter's bearing; the stars of one word are joined in the order they are spelled. */
function chart(svg, name) {
  const c = 120, RIM = 116, AZ = 104, IN = 92;
  const words = plain(name).split(/[^A-Z]+/).filter(Boolean);
  const used = new Set(words.join(''));
  let out = `<circle class="rim" cx="${c}" cy="${c}" r="${RIM}"/><circle class="rim2" cx="${c}" cy="${c}" r="${IN}"/>`;
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * TAU - TAU / 4, ch = String.fromCharCode(65 + i);
    const b = a + TAU / 52;
    out += `<line class="tick" x1="${(c + Math.cos(b) * RIM).toFixed(1)}" y1="${(c + Math.sin(b) * RIM).toFixed(1)}" x2="${(c + Math.cos(b) * (RIM - 5)).toFixed(1)}" y2="${(c + Math.sin(b) * (RIM - 5)).toFixed(1)}"/>`;
    out += `<text class="az${used.has(ch) ? ' on' : ''}" x="${(c + Math.cos(a) * AZ).toFixed(1)}" y="${(c + Math.sin(a) * AZ).toFixed(1)}">${ch}</text>`;
    if (used.has(ch)) out += `<circle class="dot" cx="${(c + Math.cos(a) * (IN + 1)).toFixed(1)}" cy="${(c + Math.sin(a) * (IN + 1)).toFixed(1)}" r="1.6"/>`;
  }
  if (!words.length) {
    out += `<text class="hint" x="${c}" y="${c - 3}">YOUR STARS</text><text class="hint" x="${c}" y="${c + 11}">GO HERE</text>`;
    svg.innerHTML = out; return;
  }
  let n = 0, links = '', stars = '';
  for (const word of words) {
    let prev = null;
    [...word].forEach((ch, k) => {
      const code = ch.charCodeAt(0) - 65;
      const a = (code + (hash(n + 1, code + 3) - 0.5) * 0.7) / 26 * TAU - TAU / 4;
      const r = 20 + 62 * hash(n + 7, code + 1);
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      if (prev) { const len = Math.hypot(x - prev.x, y - prev.y); links += `<line class="link" x1="${prev.x.toFixed(1)}" y1="${prev.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="--i:${n};--len:${len.toFixed(1)}"/>`; }
      if (k === 0) { const s = 6.4, t = 1.5; stars += `<path class="star" style="--i:${n}" d="M${x.toFixed(1)} ${(y - s).toFixed(1)}l${t} ${s - t} ${s - t} ${t} ${-(s - t)} ${t} ${-t} ${s - t} ${-t} ${-(s - t)} ${-(s - t)} ${-t} ${s - t} ${-t}Z"/>`; }
      else stars += `<circle class="star" style="--i:${n}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.7 + 1.5 * hash(n, 9)).toFixed(1)}"/>`;
      prev = { x, y }; n++;
    });
  }
  svg.innerHTML = out + links + stars;
}

export function createRsvp({ reduced }) {
  const form = $('rsvp-form'), pass = $('pass');
  if (!form || !pass) return { refit() {} };
  const state = { nights: new Set(), people: 2, scope: false };
  const name = $('name'), email = $('email'), less = $('people-less'), more = $('people-more'), out = $('people'), scope = $('scope');
  const chips = [...form.querySelectorAll('.chip[data-night]')];
  const err = { nights: $('err-nights'), name: $('err-name'), email: $('err-email') };
  Object.values(err).forEach(e => e.setAttribute('role', 'alert'));
  const svg = $('pass-chart'), passName = $('pass-name');

  function refit() {
    const text = name.value.trim() || 'Your name';
    fitText(passName, text, { width: passName.clientWidth, size: 64, maxSize: 104 });
  }
  function render() {
    const text = name.value.trim();
    $('pass-name-text').textContent = text || 'Your name';
    passName.textContent = (text || 'Your name').toUpperCase();
    refit();
    chart(svg, text);
    let h = 0; for (const ch of plain(text)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    $('pass-no').textContent = String(text ? 1000 + (h % 9000) : 0).padStart(4, '0');
    $('pass-admit').textContent = state.people;
    $('pass-scope').textContent = state.scope ? 'Yes' : 'No';
    pass.querySelectorAll('.punch').forEach(p => p.toggleAttribute('data-on', state.nights.has(p.dataset.night)));
    out.textContent = state.people;
    less.setAttribute('aria-disabled', state.people <= 1 ? 'true' : 'false');
    more.setAttribute('aria-disabled', state.people >= 6 ? 'true' : 'false');
  }

  chips.forEach(c => c.addEventListener('click', () => {
    const k = c.dataset.night, on = !state.nights.has(k);
    on ? state.nights.add(k) : state.nights.delete(k);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (state.nights.size) err.nights.textContent = '';
    render();
  }));
  less.addEventListener('click', () => { if (state.people > 1) { state.people--; render(); } });
  more.addEventListener('click', () => { if (state.people < 6) { state.people++; render(); } });
  scope.addEventListener('click', () => {
    state.scope = !state.scope;
    scope.setAttribute('aria-checked', state.scope ? 'true' : 'false');
    scope.querySelector('.toggle-state').textContent = state.scope ? 'Yes' : 'No';
    render();
  });
  name.addEventListener('input', () => { if (name.value.trim().length > 1) clear('name'); render(); });
  email.addEventListener('input', () => { if (okEmail()) clear('email'); });

  const okEmail = () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
  function clear(k) { err[k].textContent = ''; if (k !== 'nights') (k === 'name' ? name : email).removeAttribute('aria-invalid'); }
  function fail(k, msg, field) { err[k].textContent = msg; if (field) field.setAttribute('aria-invalid', 'true'); }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let first = null;
    if (!state.nights.size) { fail('nights', 'Pick at least one night.'); first = first || chips[0]; } else clear('nights');
    if (name.value.trim().length < 2) { fail('name', 'A name is needed for the pass.', name); first = first || name; } else clear('name');
    if (!okEmail()) { fail('email', email.value.trim() ? 'That does not look like an email address.' : 'An email address is needed.', email); first = first || email; } else clear('email');
    if (first) { first.focus(); return; }
    confirm();
  });

  function confirm() {
    const order = Object.keys(NIGHTS).filter(k => state.nights.has(k)).map(k => NIGHTS[k]);
    render();
    pass.dataset.state = 'confirmed';
    $('pass-status').textContent = 'Sample pass. Nothing was sent.';
    $('pass-done').textContent = `${name.value.trim()}, you are down for ${list(order)}: ${state.people} ${state.people === 1 ? 'person' : 'people'}, ${state.scope ? 'one telescope' : 'no telescope'}. This is a sample site, so nothing was sent and no place is held.`;
    $('pass-after').hidden = false;
    form.setAttribute('data-locked', ''); form.inert = true;
    pass.focus({ preventScroll: true });
    pass.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }
  $('pass-edit').addEventListener('click', () => {
    pass.dataset.state = 'draft';
    $('pass-status').textContent = 'Draft. It fills in as you answer.';
    $('pass-after').hidden = true;
    form.removeAttribute('data-locked'); form.inert = false;
    name.focus();
  });

  render();
  return { refit };
}
