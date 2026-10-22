/* Hangar: page behaviour and the heat haze.
   The haze is plain WebGL (no library): the headline is drawn into a texture
   once, and one small shader warps it inside a plume coming off CHARGER's motor.
   The three.js model loads later, only to replace the still render. */
(() => {
  'use strict';
  const d = document;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 760px)');
  const finePointer = matchMedia('(pointer: fine)').matches;

  // Exhaust position and direction inside .rocket-stage, measured from the
  // same camera that rendered the stills (see hero3d.js POSES).
  const EXHAUST = {
    wide: { x: 0.0691, y: 0.5032, dx: -0.9991, dy: 0.0417 },
    tall: { x: 0.3200, y: 0.9650, dx: -0.2327, dy: 0.9726 },
  };
  const pose = () => (phone.matches ? 'tall' : 'wide');

  /* ------------------------------------------------------------ nav */
  const nav = d.querySelector('.nav');
  const toggle = d.querySelector('.nav-toggle');
  const setMenu = open => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Menu';
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  d.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); toggle.focus(); } });
  let lastY = scrollY, ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('is-solid', y > 40);
      nav.classList.toggle('is-hidden', y > lastY && y > innerHeight * 0.9 && !nav.classList.contains('open') && !nav.contains(d.activeElement));
      lastY = y; ticking = false;
    });
  }, { passive: true });

  /* -------------------------------------------------- tagline blur-in */
  const tag = d.querySelector('.tagline');
  if (tag && !reduce) {
    let i = 0;
    const nodes = [...tag.childNodes];
    tag.textContent = '';
    for (const n of nodes) {
      if (n.nodeType === 3) {
        for (const part of n.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { tag.append(' '); continue; }
          const s = d.createElement('span'); s.className = 'w'; s.style.setProperty('--i', i++); s.textContent = part; tag.append(s);
        }
      } else { n.classList.add('w'); n.style.setProperty('--i', i++); tag.append(n); }
    }
  }
  const hero = d.querySelector('.hero');
  const ready = () => hero.classList.add('ready');
  (d.fonts && d.fonts.ready ? Promise.race([d.fonts.ready, new Promise(r => setTimeout(r, 900))]) : Promise.resolve()).then(() => requestAnimationFrame(ready));

  /* ---------------------------------------------------------- reveals */
  const revealables = d.querySelectorAll('[data-reveal], .spec');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealables.forEach(el => io.observe(el));
  } else revealables.forEach(el => el.classList.add('in'));

  /* -------------------------------------------------- magnetic buttons */
  if (finePointer && !reduce) {
    d.querySelectorAll('.btn-mag').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px,${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transition = 'transform .5s cubic-bezier(.2,.7,.1,1)'; b.style.transform = ''; setTimeout(() => (b.style.transition = ''), 500); });
    });
  }

  /* ========================================================= HEAT HAZE */
  const title = d.querySelector('.hero-title');
  const canvas = d.querySelector('.haze');
  const stage = d.querySelector('.rocket-stage');
  if (reduce || !title || !canvas) return;

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;uniform vec2 uRes;uniform float uTime;
uniform vec2 uO;uniform vec2 uD;uniform float uL;uniform float uW;uniform float uAmp;uniform float uRise;
varying vec2 v;
float h(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
void main(){
  vec2 px=vec2(v.x,1.-v.y)*uRes;
  vec2 r=px-uO;
  float s=dot(r,uD);
  float sn=clamp(s/uL,0.,1.);
  vec2 c=uD*max(s,0.)+vec2(0.,-uRise*uL*sn*sn);
  vec2 q=r-c;
  float w=uW*(.5+1.7*sn);
  float m=exp(-dot(q,q)/(w*w))*smoothstep(-.06,.04,s/uL)*(1.-smoothstep(.5,1.,sn));
  m=max(m,exp(-dot(r,r)/(uW*uW*1.4))*.7);
  float b=0.;
  if(m>.003){
    vec2 k=px/uW*vec2(3.2,4.4);
    vec2 flow=uD*uTime*3.4+vec2(0.,-uTime*2.6);
    float a=n(k-flow)+.5*n(k*2.07-flow*1.7+3.1);
    float e=n(k+vec2(7.3,3.1)-flow*1.1)+.5*n(k*2.31+vec2(1.7,9.2)-flow*1.9);
    vec2 dsp=(vec2(a,e)/1.5-.5)*2.*uAmp*m;
    b=(a/1.5-.5)*m;
    px+=dsp;
  }
  vec2 st=px/uRes;
  vec4 col=texture2D(uTex,st);
  if(m>.25){vec2 o=vec2(uAmp*.12*m)/uRes;col=(col*2.+texture2D(uTex,st+o)+texture2D(uTex,st-o))*.25;}
  col.rgb*=1.+b*.35;
  gl_FragColor=col;
}`;

  let gl, prog, tex, U = {}, layout = null, live = null, running = false, visible = true, failed = false;
  const textCanvas = d.createElement('canvas');
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };

  function initGL() {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const k of ['uTex', 'uRes', 'uTime', 'uO', 'uD', 'uL', 'uW', 'uAmp', 'uRise']) U[k] = gl.getUniformLocation(prog, k);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.clearColor(0, 0, 0, 0);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(); });
    return true;
  }

  const STRETCH = { '62.5%': 'extra-condensed', '75%': 'condensed', '87.5%': 'semi-condensed', '100%': 'normal', '112.5%': 'semi-expanded', '125%': 'expanded' };

  // Measure the DOM headline and paint the same letters into the texture.
  function measure() {
    const hr = hero.getBoundingClientRect(), tr = title.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const cs = getComputedStyle(title);
    const fs = parseFloat(cs.fontSize), ls = parseFloat(cs.letterSpacing) || 0, lh = parseFloat(cs.lineHeight) || fs * .82;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pad = Math.round(fs * 0.3);
    const x0 = tr.left - hr.left - pad, y0 = tr.top - hr.top - pad, w = tr.width + pad * 2, h = tr.height + pad * 2;
    Object.assign(canvas.style, { left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' });
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    canvas.width = textCanvas.width = W; canvas.height = textCanvas.height = H;
    const ctx = textCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#141518';
    ctx.font = `${cs.fontWeight} ${fs * dpr}px ${cs.fontFamily}`;
    if ('fontStretch' in ctx) ctx.fontStretch = STRETCH[cs.fontStretch] || 'normal';
    if ('letterSpacing' in ctx) ctx.letterSpacing = ls * dpr + 'px';
    ctx.textBaseline = 'alphabetic';
    const range = d.createRange();
    for (const line of title.querySelectorAll('.line')) {
      range.selectNodeContents(line);
      const r = range.getBoundingClientRect();
      const text = line.textContent.toUpperCase();
      const m = ctx.measureText(text);
      const A = m.fontBoundingBoxAscent ?? fs * dpr * .9, D = m.fontBoundingBoxDescent ?? fs * dpr * .22;
      const lineTop = (line.getBoundingClientRect().top - hr.top - y0) * dpr;
      const base = lineTop + (lh * dpr - (A + D)) / 2 + A;
      const left = (r.left - hr.left - x0) * dpr;
      const fit = (r.width * dpr) / (m.width || 1);
      ctx.save();
      ctx.translate(left, base);
      if (Math.abs(fit - 1) > 0.01) ctx.scale(fit, 1);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.viewport(0, 0, W, H);
    const tall = pose() === 'tall';
    layout = {
      dpr, x0, y0, W, H, fs,
      sx: sr.left - hr.left, sy: sr.top - hr.top, sw: sr.width, sh: sr.height,
      L: fs * (tall ? 2.0 : 2.9) * dpr, Wd: fs * (tall ? 0.46 : 0.42) * dpr, amp: fs * 0.032 * dpr, rise: tall ? 0.85 : 0.3,
    };
    if (live) live.size(sr.width, sr.height);
  }

  function draw(t, ex) {
    const L = layout;
    const ox = (L.sx + ex.x * L.sw - L.x0) * L.dpr, oy = (L.sy + ex.y * L.sh - L.y0) * L.dpr;
    gl.uniform1i(U.uTex, 0);
    gl.uniform2f(U.uRes, L.W, L.H);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uO, ox, oy);
    gl.uniform2f(U.uD, ex.dx, ex.dy);
    gl.uniform1f(U.uL, L.L); gl.uniform1f(U.uW, L.Wd); gl.uniform1f(U.uAmp, L.amp); gl.uniform1f(U.uRise, L.rise);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // live 3D: frozen if this device cannot keep up, so the haze stays smooth
  let liveCost = 0, liveFrames = 0, liveFrozen = false, lastEx = null;
  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    ptr.x += (ptr.tx - ptr.x) * 0.045; ptr.y += (ptr.ty - ptr.y) * 0.045;
    let ex = EXHAUST[pose()];
    if (live && !liveFrozen) {
      const t0 = performance.now();
      ex = live.update(t - live.t0, ptr.x, ptr.y);
      const cost = performance.now() - t0;
      if (liveFrames < 40) { liveCost += cost; liveFrames++; if (liveFrames === 40 && liveCost / 40 > 28) { liveFrozen = true; live.update(0, 0, 0, true); } }
      lastEx = ex;
    } else if (live && lastEx) ex = lastEx;
    draw(t, ex);
    requestAnimationFrame(frame);
  }
  function start() { if (running || failed || !visible || d.hidden || !layout) return; running = true; requestAnimationFrame(frame); }
  function stop() { running = false; }
  function fail() { failed = true; stop(); title.classList.remove('is-hazed'); canvas.classList.remove('is-on'); }

  let resizeTimer = 0, lastPose = pose();
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (failed) return;
      if (pose() !== lastPose) { lastPose = pose(); dropLive(); loadLive(); }
      measure(); if (!running) draw(performance.now() / 1000, EXHAUST[pose()]);
    }, 120);
  }

  async function boot() {
    try {
      if (!initGL()) return;
      if (d.fonts) await Promise.race([d.fonts.load(`800 100px Archivo`), new Promise(r => setTimeout(r, 2500))]);
      measure();
      draw(0, EXHAUST[pose()]);
      // swap in the same frame: canvas letters replace the DOM letters
      title.classList.add('is-hazed'); canvas.classList.add('is-on');
      new ResizeObserver(onResize).observe(hero);
      new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(hero);
      d.addEventListener('visibilitychange', () => (d.hidden ? stop() : start()));
      if (finePointer) hero.addEventListener('pointermove', e => { ptr.tx = (e.clientX / innerWidth - .5) * 2; ptr.ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
      start();
    } catch (err) { console.warn('haze off:', err); fail(); }
  }

  /* --------------------------------------------- live model, deferred */
  function dropLive() {
    if (!live) return;
    live.dispose(); live = null; liveFrozen = false; liveFrames = 0; liveCost = 0; lastEx = null;
    stage.classList.remove('is-live');
    const fresh = d.createElement('canvas'); fresh.setAttribute('aria-hidden', 'true');
    stage.querySelector('canvas').replaceWith(fresh);
  }
  let loading = false;
  function loadLive() {
    if (loading || live || failed || (navigator.connection && navigator.connection.saveData)) return;
    loading = true;
    const want = pose();
    import('./hero3d.js').then(async m => {
      const c = stage.querySelector('canvas');
      const h = await m.createHero(c, { poseName: want });
      if (want !== pose()) { h.dispose(); return; }
      const r = stage.getBoundingClientRect();
      h.size(r.width, r.height); h.update(0, 0, 0);
      h.t0 = performance.now() / 1000; ptr.x = ptr.y = 0;
      live = h;
      c.addEventListener('webglcontextlost', () => { if (live === h) dropLive(); }, { once: true });
      requestAnimationFrame(() => stage.classList.add('is-live'));
    }).catch(err => console.warn('live model off:', err)).finally(() => { loading = false; });
  }

  const begin = () => {
    boot();
    const idle = window.requestIdleCallback || (f => setTimeout(f, 600));
    const later = () => idle(() => loadLive(), { timeout: 2500 });
    if (d.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
  };
  begin();
})();
