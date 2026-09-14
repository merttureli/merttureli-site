/* Content stays visible. Only headings and media settle as they arrive. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet(), pending = new Set(), active = new Set();
  let settings = { motion: true, ...window.PortfolioDepthSettings };
  let ready = false, scheduled = false;
  const disabled = () => reduced.matches || settings.motion === false;
  const selector = '[data-reveal] h2, [data-reveal] h3, [data-reveal] h4, [data-depth-label], [data-depth-rule], .depth-portrait, .depth-stage, figure > div:first-child';
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      observer.unobserve(el); pending.delete(el); seen.add(el);
      if (disabled() || document.hidden || !el.animate) continue;
      const heading = /^H[2-4]$/.test(el.tagName);
      const label = el.hasAttribute('data-depth-label');
      const rule = el.hasAttribute('data-depth-rule');
      const target = rule ? el.querySelector('span[style*="flex: 1"]') : el;
      if (!target) continue;
      const frames = rule ? [ { transform: 'scaleX(.15)' }, { transform: 'scaleX(1)' } ] : label ? [
        { opacity: .65 }, { opacity: 1 }
      ] : [
        { opacity: heading ? .65 : .8, transform: `translateY(${heading ? 10 : 12}px)` },
        { opacity: 1, transform: 'translateY(0)' }
      ];
      const animation = target.animate(frames, {
        duration: label ? 320 : heading ? 440 : 500,
        delay: heading ? 60 : 0, easing: 'cubic-bezier(.22,1,.36,1)'
      });
      active.add(animation);
      animation.finished.catch(() => {}).finally(() => active.delete(animation));
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0 }) : null;

  function refresh(next) {
    if (next) settings = { ...settings, ...next };
    if (!ready) return;
    document.documentElement.dataset.depthMotion = disabled() ? 'off' : 'on';
    if (disabled()) {
      for (const animation of active) animation.cancel();
      active.clear(); observer?.disconnect(); pending.clear();
      return;
    }
    if (!observer) return;
    for (const el of pending) if (!el.isConnected) { observer.unobserve(el); pending.delete(el); }
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el) || pending.has(el) || el.closest('.depth-hero')) continue;
      const rect = el.getBoundingClientRect();
      // Initial and restored viewports are already readable, with no entrance delay.
      if (rect.top < innerHeight && rect.bottom > 0) { seen.add(el); continue; }
      pending.add(el); observer.observe(el);
    }
  }
  function queueRefresh() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; refresh(); });
  }
  window.PortfolioDepth = { refresh };
  function boot() {
    ready = true;
    new MutationObserver(queueRefresh).observe(document.body, { childList: true, subtree: true });
    reduced.addEventListener('change', () => refresh());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { for (const animation of active) animation.cancel(); active.clear(); }
    });
    refresh(window.PortfolioDepthSettings);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
