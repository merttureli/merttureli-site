/* Component catalog runtime (docs/design/catalog.html).

   Each <figure class="pv"> holds one <script type="text/html" class="demo">.
   That markup is rendered in an iframe that loads the real site CSS for its
   profile, with <base> set so paths read exactly as they do on the page:
     data-profile  site (index.html, projects/*), web (websites.html), studio (next/)
     data-bg       site/web: paper | dark | sunken    studio: paper | paper2 | ink
     data-pad      stage padding (CSS), default "40px clamp(16px, 4vw, 40px)"
     data-height   fixed height in px, for fixed or absolutely placed components
     data-js       real page scripts to load by name, space separated: media-playback -> js/media-playback.js
     data-behavior a demo-only animation the page's own JS normally drives
     data-stage-css demo-only CSS (spacing between the preview edge and the
                   component), kept out of the snippet so it copies clean
     data-label    the caption in the preview bar
   The demo text is also the "HTML" tab of the snippet, so what you see is what
   you copy. Other snippet tabs sit beside it as <script type="text/plain"
   title="tab name"> blocks inside .code (data-from="N" reuses demo N).
   Tab names and script names are not written as paths so the link checker
   (tools/checks/links.py) does not try to resolve them. */
(() => {
  const DS = '_ds/mert-t-reli-design-system-56763c60-2006-4913-8e27-d9c1c8053e6d/tokens/';
  const TOKENS = ['colors', 'typography', 'spacing', 'layout', 'effects', 'motion', 'base'].map(n => DS + n + '.css');
  const PROFILES = {
    // the stylesheet order of the built index.html
    site: { base: '../../', html: '', body: 'depth-design', palette: true,
      css: ['css/rocket.css', 'css/interaction-polish.css', 'css/website-entry.css', 'css/fonts.css', ...TOKENS,
        'css/mobile.css', 'css/depth.css', 'css/site-palette.css', 'css/static-interactions.css'],
      bg: { paper: ['var(--paper)', ''], dark: ['var(--ink-900)', 'on-dark'], sunken: ['var(--surface-sunken)', ''] } },
    // the stylesheet order of websites.html
    web: { base: '../../', html: 'js', body: 'depth-design website-page', palette: true,
      css: ['css/fonts.css', ...TOKENS, 'css/interaction-polish.css', 'css/websites.css', 'css/site-palette.css'],
      bg: { paper: ['var(--surface-page)', ''], dark: ['var(--ink-900)', 'on-dark'], sunken: ['var(--surface-sunken)', ''] } },
    studio: { base: '../../next/', html: '', body: '', palette: false,
      css: ['css/tokens.css', 'css/studio.css'],
      bg: { paper: ['var(--paper)', ''], paper2: ['var(--paper-2)', ''], ink: ['var(--ink)', 'is-ink'] } }
  };
  // css/tokens.css needs no entry: css/fonts.css @imports it.

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let palette = 'original';

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function dedent(text) {
    const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
    const pad = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return lines.map(l => l.slice(pad)).join('\n');
  }

  /* --------------------------------------------------------- previews */
  function srcdoc(fig, markup) {
    const p = PROFILES[fig.dataset.profile] || PROFILES.site;
    const [bg, bgClass] = p.bg[fig.dataset.bg || 'paper'] || p.bg.paper;
    const pad = fig.dataset.pad || '40px clamp(16px, 4vw, 40px)';
    const fixed = fig.dataset.height ? 'height:100vh;box-sizing:border-box;overflow:hidden;' : '';
    const css = p.css.map(h => '<link rel="stylesheet" href="' + h + '">').join('');
    const js = (fig.dataset.js || '').split(' ').filter(Boolean).map(s => '<script src="js/' + s + '.js"><\/script>').join('');
    const theme = p.palette ? ' data-card-theme="' + palette + '"' : '';
    const stage = 'html,body{margin:0;min-height:0!important;height:auto;background:' + bg + '}html{overflow:hidden}' +
      '.cat-stage{position:relative;' + fixed + 'padding:' + pad + '}.cat-stage.is-ink{color:var(--paper)}' + (fig.dataset.stageCss || '');
    return '<!doctype html><html lang="en" class="' + p.html + '"' + theme + '><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + new URL(p.base, location.href).href + '">' + css +
      '<style>' + stage + '</style></head><body class="' + p.body + '"><div class="cat-stage ' + bgClass + '">' +
      markup + '</div>' + js + '</body></html>';
  }

  const BEHAVIORS = {
    // studio.js swaps which word of each drift slot is shown
    drift(doc, win) {
      const slots = [...doc.querySelectorAll('.slot')];
      slots.forEach(s => s.querySelector('i') && s.querySelector('i').classList.add('on'));
      if (reduced.matches) return;
      let n = 0;
      win.setInterval(() => {
        n++;
        slots.forEach((s, k) => {
          if ((n + k) % 2) return;
          const words = [...s.querySelectorAll('i')];
          const on = words.findIndex(w => w.classList.contains('on'));
          words[on].classList.remove('on');
          words[(on + 1) % words.length].classList.add('on');
        });
      }, 1800);
    },
    // studio.js scrolls the name; here a plain loop shows the motion
    marquee(doc) {
      const track = doc.querySelector('.marquee__track');
      const items = doc.querySelectorAll('.marquee__item').length || 4;
      if (track && !reduced.matches) track.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(' + (-100 / items) + '%,0,0)' }], { duration: 9000, iterations: Infinity });
    },
    // studio.js shows the round menu button once the top bar scrolls away
    shown(doc) { doc.querySelectorAll('.menu-btn').forEach(b => b.classList.add('is-shown')); }
  };

  function mount(fig) {
    if (fig.dataset.mounted) return;
    fig.dataset.mounted = '1';
    const demo = fig.querySelector('script.demo');
    const frame = fig.querySelector('iframe');
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument, win = frame.contentWindow;
      if (!doc) return;
      // links in a preview never navigate the frame away
      doc.addEventListener('click', e => { if (e.target.closest('a[href], form')) e.preventDefault(); }, true);
      const stage = doc.querySelector('.cat-stage');
      const size = () => {
        if (fig.dataset.height) frame.style.height = fig.dataset.height + 'px';
        else if (stage) frame.style.height = Math.max(40, Math.ceil(stage.getBoundingClientRect().height)) + 'px';
      };
      size();
      if (stage && win.ResizeObserver) new win.ResizeObserver(size).observe(stage);
      (fig.dataset.behavior || '').split(' ').filter(Boolean).forEach(b => BEHAVIORS[b] && BEHAVIORS[b](doc, win));
      requestAnimationFrame(() => { frame.classList.add('is-ready'); fig.classList.add('is-ready'); });
      if (doc.fonts) doc.fonts.ready.then(size);
    });
    frame.srcdoc = srcdoc(fig, demo.textContent);
  }

  function buildPreview(fig) {
    const label = fig.dataset.label || '';
    fig.insertAdjacentHTML('afterbegin',
      '<div class="pv__bar"><p class="pv__label mono"><span>' + esc(label) + '</span></p>' +
      '<div class="pv__w" role="group" aria-label="Preview width">' +
      '<button type="button" data-w="" aria-pressed="true">Fill</button>' +
      '<button type="button" data-w="768" aria-pressed="false">768</button>' +
      '<button type="button" data-w="390" aria-pressed="false">390</button></div></div>' +
      '<div class="pv__stage"><div class="pv__frame"><iframe title="' + esc(label || 'Component preview') + '" loading="eager"></iframe></div>' +
      '<p class="pv__skel mono">Rendering</p></div>');
    const stageEl = fig.querySelector('.pv__stage'), frameBox = fig.querySelector('.pv__frame');
    fig.querySelectorAll('.pv__w button').forEach(b => b.addEventListener('click', () => {
      fig.querySelectorAll('.pv__w button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      frameBox.style.maxWidth = b.dataset.w ? b.dataset.w + 'px' : '';
      stageEl.classList.toggle('is-narrow', !!b.dataset.w);
    }));
  }

  /* ------------------------------------------------------------- code */
  function highlight(src) {
    // a small HTML highlighter: comments, tag names, attribute names and values
    const span = (c, t) => '<span class="' + c + '">' + esc(t) + '</span>';
    const re = /<!--[\s\S]*?-->|<\/?[\w-]+|\/?>|"[^"]*"|'[^']*'|[^\s<>"'=\/]+|\s+|[\s\S]/g;
    let out = '', inTag = false, m;
    while ((m = re.exec(src))) {
      const t = m[0];
      if (t.startsWith('<!--')) out += span('m', t);
      else if (/^<\/?[\w-]/.test(t)) { inTag = true; out += span('p', t[1] === '/' ? '</' : '<') + span('t', t.replace(/^<\/?/, '')); }
      else if (inTag && (t === '>' || t === '/>')) { inTag = false; out += span('p', t); }
      else if (inTag && (t[0] === '"' || t[0] === "'")) out += span('s', t);
      else if (inTag && /^[^\s=]/.test(t)) out += span('a', t);
      else out += esc(t);
    }
    return out;
  }

  function buildCode(box, demos) {
    const parts = [...box.querySelectorAll('script[title]')];
    const tabs = parts.map(s => {
      const from = s.dataset.from;
      const text = from != null && demos[+from] ? demos[+from].textContent : s.textContent;
      return { name: s.title, text: dedent(text) };
    });
    if (!tabs.length) return;
    const id = box.closest('.c').id;
    box.insertAdjacentHTML('afterbegin',
      '<div class="code__bar"><div class="code__tabs" role="tablist">' +
      tabs.map((t, i) => '<button type="button" role="tab" id="' + id + '-t' + i + '" aria-controls="' + id + '-p' + i + '" aria-selected="' + (i === 0) + '">' + esc(t.name) + '</button>').join('') +
      '</div><button type="button" class="copy" aria-label="Copy snippet">Copy</button></div>' +
      tabs.map((t, i) => '<pre role="tabpanel" id="' + id + '-p' + i + '" aria-labelledby="' + id + '-t' + i + '"' + (i ? ' hidden' : '') + ' tabindex="0"><code>' + highlight(t.text) + '</code></pre>').join(''));
    let cur = 0;
    const btns = box.querySelectorAll('.code__tabs button'), pres = box.querySelectorAll('pre');
    btns.forEach((b, i) => b.addEventListener('click', () => {
      cur = i;
      btns.forEach((x, k) => x.setAttribute('aria-selected', String(k === i)));
      pres.forEach((p, k) => { p.hidden = k !== i; });
    }));
    const copy = box.querySelector('.copy');
    copy.addEventListener('click', () => {
      const text = tabs[cur].text;
      const done = () => { copy.textContent = 'Copied'; copy.classList.add('is-done'); setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('is-done'); }, 1400); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback(text) && done());
      else if (fallback(text)) done();
    });
  }
  function fallback(text) {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove(); return ok;
  }

  /* -------------------------------------------------------------- nav */
  // The index is built from the sections, so adding a component needs no nav edit.
  function buildNav() {
    const html = [...document.querySelectorAll('.sect[data-part]')].map(sect => {
      const cs = [...sect.querySelectorAll('.c[id]')];
      const n = document.querySelector('[data-count="' + sect.dataset.part + '"]');
      if (n) n.textContent = String(cs.length).padStart(2, '0') + ' components';
      return '<div class="side__group"><p class="mono"><span>' + esc(sect.dataset.title) + '</span><span>' + esc(sect.dataset.sub || '') + '</span></p>' +
        cs.map(c => '<a class="nav" href="#' + c.id + '"><b>' + esc(c.dataset.n || '') + '</b>' + esc(c.querySelector('.c__name').textContent) + '</a>').join('') + '</div>';
    }).join('');
    document.querySelectorAll('[data-nav]').forEach(n => { n.innerHTML = html; });
  }
  buildNav();

  // Component ids work as links: catalog.html#T13 (or #t13) goes to the T13 section.
  function alias() {
    const n = location.hash.slice(1).toUpperCase();
    if (!/^[ST]\d\d$/.test(n)) return;
    const c = document.querySelector('.c[data-n="' + n + '"]');
    if (!c) return;
    history.replaceState(null, '', '#' + c.id);
    c.scrollIntoView();
    // previews above it grow as they mount: land again once they settle
    if (document.readyState !== 'complete') window.addEventListener('load', () => setTimeout(() => c.scrollIntoView(), 300), { once: true });
  }
  alias();
  window.addEventListener('hashchange', alias);

  /* ------------------------------------------------------------- boot */
  const figs = [...document.querySelectorAll('figure.pv')];
  figs.forEach(buildPreview);
  document.querySelectorAll('.c').forEach(c => {
    const box = c.querySelector('.code');
    if (box) buildCode(box, [...c.querySelectorAll('script.demo')]);
  });

  // Render previews as they near the viewport, then fill in the rest when idle.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { mount(e.target); io.unobserve(e.target); } }), { rootMargin: '900px 0px' });
    figs.forEach(f => io.observe(f));
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 400));
    window.addEventListener('load', () => {
      let i = 0;
      const step = () => { while (i < figs.length && figs[i].dataset.mounted) i++; if (i < figs.length) { mount(figs[i]); idle(step); } };
      setTimeout(() => idle(step), 1500);
    });
  } else figs.forEach(mount);

  // Palette: the four looks of css/site-palette.css, applied to every site preview.
  document.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', () => {
    palette = b.dataset.palette;
    document.querySelectorAll('[data-palette]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.palette === palette)));
    figs.forEach(f => {
      if (!PROFILES[f.dataset.profile] || !PROFILES[f.dataset.profile].palette) return;
      const d = f.querySelector('iframe').contentDocument;
      if (d && d.documentElement) d.documentElement.setAttribute('data-card-theme', palette);
    });
  }));

  // Sidebar: mark the component in view.
  const links = new Map([...document.querySelectorAll('.side a.nav')].map(a => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window && links.size) {
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.remove('is-on'));
      const a = links.get(e.target.id);
      if (!a) return;
      a.classList.add('is-on');
      const side = a.closest('.side'), r = a.getBoundingClientRect();
      if (side && (r.top < 80 || r.bottom > innerHeight - 80)) side.scrollTop += r.top - innerHeight / 2;
    }), { rootMargin: '-35% 0px -60% 0px' });
    document.querySelectorAll('.c[id]').forEach(c => spy.observe(c));
  }
  // The phone index closes after a pick.
  document.querySelectorAll('.bar__menu a').forEach(a => a.addEventListener('click', () => a.closest('details').removeAttribute('open')));
})();
