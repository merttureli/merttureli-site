// SHOWCASE clips: turntable videos on the lineup tiles and the case pages.
// Markup: <video data-clip="hover|view" muted loop playsinline preload="none" poster="...">
//           <source data-src="full.webm" data-src-sm="phone.webm" type="video/webm"></video>
// "hover": plays while a fine pointer is over its tile (or the tile has focus); on touch it
//          plays while most of it is on screen.
// "view":  plays while on screen. A [data-clip-toggle] button (aria-controls = video id) pauses it.
// Reduced motion or Save-Data: nothing loads, the poster stays (toggles stay hidden).
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const phone = matchMedia('(max-width: 760px)').matches;
  const videos = [...document.querySelectorAll('video[data-clip]')];
  if (!videos.length || reduced || saveData) return;

  const state = new Map();
  const load = (v) => {
    const s = state.get(v);
    if (s.loaded) return;
    s.loaded = true;
    v.querySelectorAll('source[data-src]').forEach(src => {
      src.src = (phone && src.dataset.srcSm) || src.dataset.src;
      src.removeAttribute('data-src');
    });
    v.load();
  };
  const sync = (v) => {
    const s = state.get(v);
    const want = !document.hidden && !s.userPaused && (s.mode === 'hover' && fine ? s.hovered : s.visible);
    if (want) { load(v); const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    else if (!v.paused) v.pause();
  };

  const io = new IntersectionObserver(es => es.forEach(e => {
    const s = state.get(e.target);
    s.visible = e.intersectionRatio >= s.need;
    sync(e.target);
  }), { threshold: [0, 0.25, 0.6, 1] });

  videos.forEach(v => {
    const mode = v.dataset.clip || 'view';
    state.set(v, { mode, loaded: false, visible: false, hovered: false, userPaused: false, need: mode === 'hover' ? 0.6 : 0.25 });
    io.observe(v);
    if (mode === 'hover' && fine) {
      const tile = v.closest('.tile') || v.parentElement;
      const on = () => { state.get(v).hovered = true; sync(v); };
      const off = () => { state.get(v).hovered = false; sync(v); };
      tile.addEventListener('pointerenter', on);
      tile.addEventListener('pointerleave', off);
      tile.addEventListener('focusin', on);
      tile.addEventListener('focusout', off);
    }
  });

  document.querySelectorAll('[data-clip-toggle]').forEach(btn => {
    const v = document.getElementById(btn.getAttribute('aria-controls'));
    if (!v || !state.has(v)) return;
    btn.hidden = false;
    const label = btn.querySelector('span');
    btn.addEventListener('click', () => {
      const s = state.get(v);
      s.userPaused = !s.userPaused;
      btn.setAttribute('aria-pressed', String(s.userPaused));
      if (label) label.textContent = s.userPaused ? 'Play' : 'Pause';
      sync(v);
    });
  });

  document.addEventListener('visibilitychange', () => videos.forEach(sync));
})();
