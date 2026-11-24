/* Low Light: the night clock. A half dial from 20:00 (left) to 05:00 (right), nine even hours.
   The times are read from the lists in the page, so the lists stay the one source of the program. */

const START = 20 * 60, SPAN = 9 * 60;
const NS = 'http://www.w3.org/2000/svg';
const mins = s => { const [h, m] = s.split(':').map(Number); let t = h * 60 + m; if (t < 12 * 60) t += 24 * 60; return t - START; };
const deg = m => 180 * m / SPAN;
const el = (name, attrs = {}, text) => { const n = document.createElementNS(NS, name); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; };

export function createClock() {
  const root = document.getElementById('clock'), dial = document.getElementById('dial');
  if (!root || !dial) return { build() {} };
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const nights = panels.map(p => ({
    name: p.dataset.night, date: p.dataset.date, note: p.dataset.note,
    items: [...p.querySelectorAll('.sched li')].map(li => ({ li, key: li.dataset.key, t: mins(li.querySelector('time').getAttribute('datetime')), until: li.dataset.until ? mins(li.dataset.until) : null })),
  }));
  let current = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));

  // the parts that turn, and the words in the middle
  const svg = el('svg', { 'aria-hidden': 'true', focusable: 'false' });
  const hub = document.createElement('div'); hub.className = 'dial-hub';
  const hand = document.createElement('div'); hand.className = 'dial-hand'; hub.appendChild(hand);
  const marks = {};
  nights[0].items.forEach((it, i) => { const m = document.createElement('div'); m.className = 'dial-mark'; m.dataset.key = it.key; m.innerHTML = `<b>${i + 1}</b>`; hub.appendChild(m); marks[it.key] = m; });
  const read = document.createElement('div'); read.className = 'dial-read';
  read.innerHTML = '<p class="dial-night"></p><p class="dial-date"></p><p class="dial-note"></p>';
  dial.append(svg, hub, read);
  let watch = null;

  function build() {
    const W = dial.clientWidth; if (!W) return;
    const small = W < 520, padX = small ? 16 : 34, top = 16;
    const R = Math.min((W - padX * 2) / 2, 470), cx = W / 2, cy = R + top, H = cy + 34;
    dial.style.height = H + 'px'; dial.style.setProperty('--R', R + 'px'); dial.style.setProperty('--cy', cy + 'px');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';
    const at = (m, r) => { const a = Math.PI * (1 - m / SPAN); return [cx + Math.cos(a) * r, cy - Math.sin(a) * r]; };
    const half = r => `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    svg.append(el('line', { class: 'dial-base', x1: cx - R - padX + 2, y1: cy, x2: cx + R + padX - 2, y2: cy }));
    svg.append(el('path', { class: 'dial-in', d: half(R * 0.6) }));
    svg.append(el('path', { class: 'dial-arc', d: half(R) }));
    for (let m = 0; m <= SPAN; m += 30) {
      const hour = m % 60 === 0, [x1, y1] = at(m, R), [x2, y2] = at(m, R - (hour ? 13 : 6));
      if (m > 0 && m < SPAN) svg.append(el('line', { class: 'dial-tick' + (hour ? '' : ' s'), x1, y1, x2, y2 }));
      if (hour) {
        const label = String((20 + m / 60) % 24).padStart(2, '0');
        let [x, y] = at(m, R - (small ? 27 : 32));
        if (m === 0 || m === SPAN) y = cy - 13;                         // the two ends sit on the base line: lift them clear of it
        svg.append(el('text', { class: 'dial-hour', x, y }, label));
      }
    }
    svg.append(el('text', { class: 'dial-end', x: cx - R, y: cy + 22, 'text-anchor': 'start' }, 'DUSK'));
    svg.append(el('text', { class: 'dial-end', x: cx + R, y: cy + 22, 'text-anchor': 'end' }, 'DAWN'));
    watch = el('path', { class: 'dial-watch', d: half(R), pathLength: SPAN });
    svg.append(watch);
    apply(current, true);
  }

  function apply(i, instant) {
    const n = nights[i], w = n.items.find(it => it.key === 'watch') || n.items[n.items.length - 1];
    if (instant) dial.setAttribute('data-instant', ''); else dial.removeAttribute('data-instant');
    hand.style.setProperty('--a', deg(w.t) + 'deg');
    for (const it of n.items) if (marks[it.key]) marks[it.key].style.setProperty('--a', deg(it.t) + 'deg');
    if (watch) { const end = w.until == null ? SPAN : w.until; watch.style.strokeDasharray = `${end - w.t} ${SPAN * 2}`; watch.style.strokeDashoffset = -w.t; }
    read.children[0].textContent = n.name; read.children[1].textContent = n.date; read.children[2].textContent = n.note;
  }

  function select(i, focus) {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === current ? 'true' : 'false'); t.tabIndex = k === current ? 0 : -1; });
    panels.forEach((p, k) => { p.hidden = k !== current; });
    apply(current, false);
    if (focus) tabs[current].focus();
  }

  tabs.forEach((t, i) => t.addEventListener('click', () => select(i, false)));
  root.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') select(current + 1, true);
    else if (k === 'ArrowLeft' || k === 'ArrowUp') select(current - 1, true);
    else if (k === 'Home') select(0, true);
    else if (k === 'End') select(tabs.length - 1, true);
    else return;
    e.preventDefault();
  });
  // pointing at a line of the list lights its mark on the dial
  nights.forEach(n => n.items.forEach(it => {
    const on = v => { it.li.toggleAttribute('data-on', v); marks[it.key] && marks[it.key].toggleAttribute('data-on', v); };
    it.li.addEventListener('pointerenter', () => on(true));
    it.li.addEventListener('pointerleave', () => on(false));
  }));

  return { build, select };
}
