/* Keep decorative videos quiet until they are useful to the visitor. */
(() => {
  const videos = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let settings = { motion: true, ...window.PortfolioMediaSettings }, scheduled = false, ready = false;
  const blocked = () => document.hidden || reduced.matches || settings.motion === false || !!document.querySelector('dialog[open]');

  function load(video, state) {
    if (state.loaded || blocked()) return;
    const sources = video.querySelectorAll('source[data-src]');
    for (const source of sources) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
    }
    state.loaded = true;
    if (sources.length) video.load();
  }
  function sync(video, state) {
    const play = !blocked() && state.visible && video.isConnected;
    if (!play) { if (!video.paused) video.pause(); return; }
    load(video, state);
    if (!video.paused || state.starting) return;
    state.starting = true;
    const attempt = video.play();
    Promise.resolve(attempt).catch(() => {}).finally(() => {
      state.starting = false;
      if (blocked() || !state.visible || !video.isConnected) video.pause();
    });
  }
  const visibleObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = videos.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting;
      sync(entry.target, state);
    }
  }) : null;
  const loadObserver = visibleObserver ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = videos.get(entry.target);
      if (!state) continue;
      state.near = entry.isIntersecting;
      if (state.near) load(entry.target, state);
    }
  }, { rootMargin: '300px 0px' }) : null;

  function refresh(next) {
    if (next) settings = { ...settings, ...next };
    if (!ready) return;
    for (const [video] of videos) if (!video.isConnected) {
      video.pause(); visibleObserver?.unobserve(video); loadObserver?.unobserve(video); videos.delete(video);
    }
    for (const video of document.querySelectorAll('video')) {
      if (videos.has(video)) continue;
      const state = { visible: !visibleObserver, near: !loadObserver, loaded: false, starting: false };
      videos.set(video, state);
      video.autoplay = false; video.muted = true; video.loop = true; video.playsInline = true;
      visibleObserver?.observe(video); loadObserver?.observe(video);
    }
    for (const [video, state] of videos) {
      if (state.near) load(video, state);
      sync(video, state);
    }
  }
  function queueRefresh() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; refresh(); });
  }
  window.PortfolioMedia = { refresh };
  function boot() {
    ready = true;
    new MutationObserver(queueRefresh).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', () => refresh());
    reduced.addEventListener('change', () => refresh());
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
