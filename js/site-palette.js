/* Display settings: palette and motion.
 *
 * Runs in <head> so the saved palette and motion state are on <html> before
 * first paint. The control itself is mounted into the page footer and the
 * mobile menu overlay, never floated over content. Both are found at runtime,
 * so this works whether the footer comes from the design-system runtime or
 * from static HTML, and it re-mounts if a re-render replaces the footer.
 *
 * Motion defaults to the visitor's prefers-reduced-motion setting until they
 * choose otherwise here. Other scripts read window.PortfolioDisplay.motion()
 * and listen for the "portfolio:motion" event on document.
 */
(() => {
  const root = document.documentElement;
  const paletteKey = 'mert-portfolio-palette-v1', motionKey = 'mert-portfolio-motion-v1';
  const names = ['original', 'green', 'slate', 'warm'];
  const labels = { original: 'Original', green: 'Card green', slate: 'Slate', warm: 'Warm', daily: 'Daily' };
  // Each swatch shows the palette's paper over its ink.
  const split = (paper, ink) => 'linear-gradient(135deg,' + paper + ' 50%,' + ink + ' 50%)';
  const swatches = {
    original: split('#ffffff', '#0a0a0a'), green: split('#e4e8dc', '#1c2520'),
    slate: split('#e3e9ec', '#202a34'), warm: split('#eee5d7', '#302820'),
    daily: 'conic-gradient(#ffffff 0 25%,#1c2520 0 50%,#e3e9ec 0 75%,#302820 0)'
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };

  let palette = Object.hasOwn(labels, read(paletteKey)) ? read(paletteKey) : 'original';
  let motionChoice = ['on', 'off'].includes(read(motionKey)) ? read(motionKey) : null;
  let saveFailed = false;
  const day = new Date();
  const dayIndex = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000);
  const motionOn = () => motionChoice ? motionChoice === 'on' : !reduce.matches;

  function applyPalette() {
    root.dataset.cardTheme = palette === 'daily' ? names[((dayIndex % names.length) + names.length) % names.length] : palette;
  }
  function applyMotion() {
    root.dataset.motion = motionOn() ? 'on' : 'off';
    document.dispatchEvent(new CustomEvent('portfolio:motion', { detail: { on: motionOn() } }));
  }
  applyPalette();
  root.dataset.motion = motionOn() ? 'on' : 'off';
  reduce.addEventListener('change', () => { if (!motionChoice) { applyMotion(); update(); } });

  const mounts = new Set();
  let uid = 0;
  function build(variant) {
    const id = 'site-display-' + (++uid);
    const el = document.createElement('div');
    el.className = 'site-display';
    el.dataset.variant = variant;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-labelledby', id + '-title');
    el.innerHTML =
      '<span class="site-display-title" id="' + id + '-title">Display</span>' +
      '<div class="site-display-row" role="group" aria-labelledby="' + id + '-palette">' +
        '<span class="site-display-label" id="' + id + '-palette">Palette</span>' +
        '<div class="site-display-options">' +
        Object.entries(labels).map(([key, label]) =>
          '<button type="button" data-palette="' + key + '" aria-pressed="false"><i aria-hidden="true" style="--swatch:' + swatches[key] + '"></i>' + label + '</button>'
        ).join('') +
        '</div>' +
      '</div>' +
      '<div class="site-display-row">' +
        '<span class="site-display-label" id="' + id + '-motion">Motion</span>' +
        '<button type="button" role="switch" class="site-display-switch" data-motion-toggle aria-checked="true" aria-labelledby="' + id + '-motion"><span aria-hidden="true"></span><b>On</b></button>' +
      '</div>' +
      '<p class="site-display-note">Daily picks one palette per day. Your choice stays saved on this device.</p>';
    el.addEventListener('click', e => {
      const p = e.target.closest('button[data-palette]');
      if (p) {
        palette = p.dataset.palette;
        applyPalette();
        if (!write(paletteKey, palette)) saveFailed = true;
        update();
        return;
      }
      if (e.target.closest('[data-motion-toggle]')) {
        motionChoice = motionOn() ? 'off' : 'on';
        if (!write(motionKey, motionChoice)) saveFailed = true;
        applyMotion();
        update();
      }
    });
    return el;
  }
  function update() {
    const on = motionOn();
    for (const el of mounts) {
      el.querySelectorAll('button[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.palette === palette)));
      const sw = el.querySelector('[data-motion-toggle]');
      sw.setAttribute('aria-checked', String(on));
      // Write text only when it changes: a write is a DOM mutation, and boot()'s observer would
      // call back here, which looped forever (and woke other observers every frame).
      const label = sw.querySelector('b'), text = on ? 'On' : 'Off';
      if (label.textContent !== text) label.textContent = text;
      const note = saveFailed && el.querySelector('.site-display-note'), noteText = 'This browser cannot save your choice. It applies to this page only.';
      if (note && note.textContent !== noteText) note.textContent = noteText;
    }
  }

  // One control per slot. A slot is re-filled if its host is replaced.
  const slots = {
    footer: { el: null, host: () => { const f = [...document.querySelectorAll('footer')].filter(f => !f.closest('#mt-menu')).pop(); return f && (f.querySelector(':scope > div') || f); } },
    menu: { el: null, host: () => document.getElementById('mt-menu') }
  };
  function mountAll() {
    for (const [variant, slot] of Object.entries(slots)) {
      const host = slot.host();
      if (!host) continue;
      if (slot.el && host.contains(slot.el)) continue;
      if (!slot.el) { slot.el = build(variant); mounts.add(slot.el); }
      host.appendChild(slot.el);
    }
    update();
  }

  window.PortfolioDisplay = { motion: motionOn, palette: () => palette };

  function boot() {
    mountAll();
    let pending = false;
    // A timer rather than rAF so a background tab still repairs the mount.
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; mountAll(); }, 0);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
