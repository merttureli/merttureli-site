/* ============================================================
   FIGURES
   Four of Mert's six projects have no photography and no camera is
   coming today. So those projects are drawn instead: every figure
   below is authored from the real engineering (real parts, real
   measured numbers, real geometry) rather than from a photograph.
   Vector-drawn on canvas, so they are sharp at any size, weigh
   nothing, and cannot be mistaken for stock imagery.

   A figure is declared in markup and nothing else:
     <div class="figure" data-fig="hall"></div>

   The framework handles the parts that are easy to get wrong:
     . device-pixel scaling, including for screen-space text
     . frame zero painted synchronously, so a figure is never an
       empty box in a background tab where rAF does not fire
     . animation started immediately and *then* paused by an
       observer, never started from one
     . no ticking latch: a dropped frame cannot wedge it forever
     . colours read from the CSS custom properties at mount, so the
       same figure works on the dark title sheet and the light
       detail sheets with no second copy
     . prefers-reduced-motion renders one static, complete frame
   ============================================================ */
(function () {
'use strict';

var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
var TAU = Math.PI * 2;
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var ease = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
var mix = function (a, b, k) { return a + (b - a) * k; };

/* ---------- theme ---------------------------------------------------
   Read the tokens rather than hard-coding hexes, so a figure inherits
   whichever sheet it was dropped onto. */
function palette() {
  var cs = getComputedStyle(document.documentElement);
  var g = function (n, f) { return (cs.getPropertyValue(n) || '').trim() || f; };
  var dark = document.documentElement.dataset.theme !== 'light';
  return {
    dark: dark,
    ink: g('--ink', '#EAE7E1'),
    dim: g('--dim', '#93908A'),
    faint: g('--faint', '#4A4950'),
    rule: g('--rule', '#232227'),
    hot: g('--accent', '#FF5D1F'),
    ok: g('--ok', '#3FBF8F'),
    bg: g('--bg', '#08080A'),
    /* body shading range for solids, per polarity */
    solidLo: dark ? '#16161B' : '#DFE5EE',
    solidHi: dark ? '#2E2E36' : '#F6F8FB',
    cool: dark ? '#4FA8E8' : '#1D6FB8',
    warm: dark ? '#FF7A3D' : '#C0362B',
    ghost: dark ? 'rgba(255,255,255,.07)' : 'rgba(16,30,56,.07)'
  };
}

/* ---------- drawing kit ---------------------------------------------
   World units in, device pixels out. Every figure declares a design
   space (e.g. 200x130) and draws in it; the kit fits that space to
   whatever the element measures. Line widths divide by the scale so a
   1-unit rule stays a hairline at any size. */
function makeKit(ctx, st, C) {
  var K = {
    ctx: ctx, C: C,
    get S() { return st.S; },

    dash: function (d) { ctx.setLineDash(d || []); return K; },

    line: function (x1, y1, x2, y2, c, w) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = c; ctx.lineWidth = (w || 1) / st.S; ctx.stroke(); return K;
    },
    path: function (pts, c, w, fill, close) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        ctx[i ? 'lineTo' : 'moveTo'](pts[i][0], pts[i][1]);
      }
      if (close) ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (c) { ctx.strokeStyle = c; ctx.lineWidth = (w || 1) / st.S; ctx.stroke(); }
      return K;
    },
    rect: function (x, y, w, h, c, lw, fill) {
      ctx.beginPath(); ctx.rect(x, y, w, h);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (c) { ctx.strokeStyle = c; ctx.lineWidth = (lw || 1) / st.S; ctx.stroke(); }
      return K;
    },
    round: function (x, y, w, h, r, c, lw, fill) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (c) { ctx.strokeStyle = c; ctx.lineWidth = (lw || 1) / st.S; ctx.stroke(); }
      return K;
    },
    circ: function (x, y, r, c, lw, fill) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (c) { ctx.strokeStyle = c; ctx.lineWidth = (lw || 1) / st.S; ctx.stroke(); }
      return K;
    },
    arc: function (x, y, r, a0, a1, c, w) {
      ctx.beginPath(); ctx.arc(x, y, r, a0, a1);
      ctx.strokeStyle = c; ctx.lineWidth = (w || 1) / st.S; ctx.stroke(); return K;
    },
    /* arrowhead pointing along ang */
    head: function (x, y, ang, c, size) {
      var z = size || 4.4;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - z * Math.cos(ang - .38), y - z * Math.sin(ang - .38));
      ctx.lineTo(x - z * Math.cos(ang + .38), y - z * Math.sin(ang + .38));
      ctx.closePath(); ctx.fillStyle = c; ctx.fill(); return K;
    },
    /* line with a head on the far end */
    vec: function (x1, y1, x2, y2, c, w, size) {
      K.line(x1, y1, x2, y2, c, w);
      K.head(x2, y2, Math.atan2(y2 - y1, x2 - x1), c, size); return K;
    },
    /* proper dimension: witness lines, inward arrows, gap for the value */
    dim: function (x1, y1, x2, y2, label, c, px, off) {
      c = c || C.dim; off = off == null ? 0 : off;
      var ang = Math.atan2(y2 - y1, x2 - x1);
      var nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off;
      var ax = x1 + nx, ay = y1 + ny, bx = x2 + nx, by = y2 + ny;
      if (off) { K.line(x1, y1, ax + nx * .18, ay + ny * .18, c, .8); K.line(x2, y2, bx + nx * .18, by + ny * .18, c, .8); }
      K.line(ax, ay, bx, by, c, .8);
      K.head(ax, ay, ang + Math.PI, c, 3.4); K.head(bx, by, ang, c, 3.4);
      if (label) K.text(label, (ax + bx) / 2, (ay + by) / 2, c, px || 9.5, 'center', 'middle', C.bg);
      return K;
    },
    hatch: function (x, y, w, h, c, step, lw) {
      step = step || 4;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      for (var i = -h; i < w + h; i += step) K.line(x + i, y + h, x + i + h, y, c, lw || .7);
      ctx.restore(); return K;
    },
    /* screen-space text anchored at a world point.
       setTransform must carry DPR: resetting to the identity here is
       the classic bug that renders labels at half size in the wrong
       quadrant of a DPR-scaled canvas. */
    text: function (s, x, y, c, px, align, base, halo, weight) {
      ctx.save();
      ctx.setTransform(st.DPR, 0, 0, st.DPR, 0, 0);
      ctx.font = (weight || 500) + ' ' + (px || 10) + 'px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = align || 'left';
      ctx.textBaseline = base || 'middle';
      var sx = st.CX + x * st.S, sy = st.CY + y * st.S;
      if (halo) {
        ctx.lineWidth = 3.4; ctx.strokeStyle = halo;
        ctx.lineJoin = 'round'; ctx.strokeText(s, sx, sy);
      }
      ctx.fillStyle = c; ctx.fillText(s, sx, sy);
      ctx.restore(); return K;
    },
    /* leader line to a balloon, the way a part is called out */
    balloon: function (x, y, tx, ty, n, c) {
      c = c || C.dim;
      K.line(x, y, tx, ty, c, .8); K.circ(x, y, 1.1, null, 0, c);
      K.circ(tx, ty, 4.6, c, .9, C.bg);
      K.text(String(n), tx, ty, c, 8.4, 'center', 'middle'); return K;
    },
    lin: function (x0, y0, x1, y1, stops) {
      var g = ctx.createLinearGradient(x0, y0, x1, y1);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      return g;
    },
    /* a shaded cylinder/disc, lit from the upper left like every CAD view */
    disc: function (x, y, r, c) {
      var g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, C.solidHi); g.addColorStop(1, C.solidLo);
      K.circ(x, y, r, c || C.ink, 1, g); return K;
    },
    sphere: function (x, y, r, hex) {
      var g = ctx.createRadialGradient(x - r * .34, y - r * .34, r * .05, x, y, r);
      g.addColorStop(0, '#fff'); g.addColorStop(.24, hex); g.addColorStop(.8, hex);
      g.addColorStop(1, 'rgba(0,0,0,.45)');
      K.circ(x, y, r, null, 0, g); return K;
    },
    /* small inset plot frame; returns a point mapper */
    plot: function (x, y, w, h, opts) {
      opts = opts || {};
      K.rect(x, y, w, h, C.rule, .8, opts.fill || C.ghost);
      if (opts.grid !== false) {
        K.dash([1.6, 2.2]);
        for (var i = 1; i < 4; i++) K.line(x, y + h * i / 4, x + w, y + h * i / 4, C.faint, .6);
        K.dash([]);
      }
      return function (u, v) { return [x + u * w, y + h - v * h]; };
    }
  };
  return K;
}

/* ---------- mount ---------------------------------------------------- */
function mount(el, spec) {
  var C = palette();
  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  el.appendChild(cv);
  var ctx = cv.getContext('2d');
  if (!ctx) { el.classList.add('nofig'); return; }

  var st = { W: 0, H: 0, S: 1, CX: 0, CY: 0, DPR: 1 };
  var K = makeKit(ctx, st, C);
  var world = spec.world || [200, 130];
  var S = spec.init ? spec.init(C) : {};
  S.t = 0;

  function measure() {
    st.DPR = Math.min(devicePixelRatio || 1, 2);
    st.W = el.clientWidth; st.H = el.clientHeight;
    if (!st.W || !st.H) return;
    cv.width = Math.round(st.W * st.DPR);
    cv.height = Math.round(st.H * st.DPR);
    ctx.setTransform(st.DPR, 0, 0, st.DPR, 0, 0);
    st.S = Math.min(st.W / world[0], st.H / world[1]);
    st.CX = st.W * .5;
    st.CY = st.H * .5 + (spec.originY || 0) * st.S;
  }

  function paint() {
    /* Self-correcting. The first synchronous measure can land before layout
       has settled (a web font still loading is enough), which leaves the
       canvas backing store at a stale size. Relying on ResizeObserver alone
       to fix that means trusting a callback that is throttled in background
       tabs and absent in older browsers: when it does not arrive, the figure
       renders at the wrong resolution permanently. Comparing two cached
       integers per frame costs nothing and removes the dependency. */
    if (el.clientWidth !== st.W || el.clientHeight !== st.H) measure();
    if (!st.W || !st.H) return;
    ctx.setTransform(st.DPR, 0, 0, st.DPR, 0, 0);
    ctx.clearRect(0, 0, st.W, st.H);
    ctx.save();
    ctx.translate(st.CX, st.CY);
    ctx.scale(st.S, st.S);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    try { spec.draw(K, S); }
    catch (e) { console.error('figure "' + (el.dataset.fig || '?') + '" draw:', e); }
    ctx.restore();
    /* labels draw in screen space and reset the transform themselves */
    if (spec.labels) {
      try { spec.labels(K, S); }
      catch (e) { console.error('figure labels:', e); }
    }
  }

  /* Several independent nudges to repaint, because any one of them can fail
     to arrive: the observer is the fast path, load and fonts.ready cover the
     late-layout case, and window resize covers browsers without the observer.
     paint() re-measures itself, so extra calls are harmless. */
  if (window.ResizeObserver) new ResizeObserver(paint).observe(el);
  addEventListener('resize', paint);
  addEventListener('load', paint);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint).catch(function () {});

  measure();
  paint();                                   // frame zero, synchronously

  /* data-static="1800": drive the state machine to a chosen moment, paint
     that frame, and never start the loop. The homepage uses this so every
     project card carries a real drawing while the page still has exactly
     one moving element on it. The case study mounts the same figure live.
     The interesting frame is rarely t=0: the rig has not reached steady
     state yet, and the bend specimen is not yet loaded. */
  if (el.dataset.static != null) {
    var ms = +el.dataset.static || 0;
    if (spec.step) {
      for (var i = 0, n = Math.round(ms / 16); i < n; i++) {
        S.t += 16;
        try { spec.step(S, 16, C); } catch (e) { console.error('figure static step:', e); break; }
      }
    }
    paint();
    return;
  }

  if (reduced || !spec.step) {
    /* One complete static frame. For figures whose interest is the
       finished state, jump there instead of freezing at t=0. */
    if (reduced && spec.settle) { spec.settle(S); paint(); }
    return;
  }

  var last = performance.now(), running = false, raf = 0;
  function tick(now) {
    var dt = Math.min(now - last, 48); last = now;
    S.t += dt;
    try { spec.step(S, dt, C); } catch (e) { console.error('figure step:', e); running = false; }
    paint();
    /* Assign the handle from the same place that decides to continue, so
       there is no separate flag that can latch and strand the loop. */
    raf = running ? requestAnimationFrame(tick) : 0;
  }
  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  start();                                   // start, then let the observer pause
  new IntersectionObserver(function (es) {
    es[0].isIntersecting ? start() : stop();
  }, { rootMargin: '140px' }).observe(el);

  /* optional drag */
  if (spec.drag) {
    el.classList.add('grab');
    var dragging = false, a0 = 0, v0 = 0;
    var ang = function (e) {
      var r = cv.getBoundingClientRect();
      return Math.atan2(e.clientY - r.top - st.CY, e.clientX - r.left - st.CX);
    };
    el.addEventListener('pointerdown', function (e) {
      dragging = true; el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
      a0 = ang(e); v0 = spec.drag.get(S);
      spec.drag.begin && spec.drag.begin(S);
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      spec.drag.set(S, v0 + (ang(e) - a0));
      paint();
    });
    var release = function () {
      if (!dragging) return;
      dragging = false; el.classList.remove('dragging');
      spec.drag.end && spec.drag.end(S);
      paint();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  /* optional click-to-toggle */
  if (spec.toggle) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () { spec.toggle(S); paint(); });
  }
}

/* ====================================================================
   FIG . INDEXER            Robo-Catcher dual-chamber feeder
   Two pockets on one drum 180 degrees apart, so one loads while the
   other discharges. Motion unchanged from the version Mert signed off:
   1050ms dwell, 760ms index, one half turn per cycle, draggable.
   ==================================================================== */
var R = 54, PITCH = 30, RP = 13, RB = 10, LIGHT = -2.3;
var DWELL = 1050, INDEX = 760;

var indexer = {
  world: [200, 225], originY: 5, drag: null,
  init: function () {
    return {
      rot: -Math.PI / 2, base: -Math.PI / 2, phase: 'dwell', pt: 0, cycles: 0,
      pockets: [{ off: 0, ball: false }, { off: Math.PI, ball: true }],
      transit: null, falling: [], manual: false
    };
  },
  settle: function (S) { S.rot = -Math.PI / 2 + Math.PI; S.cycles = 1; },
  top: function (S) {
    var best = 0, bd = 9;
    for (var i = 0; i < S.pockets.length; i++) {
      var a = ((S.pockets[i].off + S.rot + Math.PI / 2) % TAU + TAU) % TAU;
      var d = Math.min(a, TAU - a);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  },
  step: function (S, dt) {
    if (!S.manual) {
      S.pt += dt;
      if (S.phase === 'dwell') {
        var ti = indexer.top(S), bi = 1 - ti;
        if (S.pt > 140 && S.pockets[bi].ball) {
          var a = S.pockets[bi].off + S.rot; S.pockets[bi].ball = false;
          S.falling.push({ x: PITCH * Math.cos(a), y: PITCH * Math.sin(a), vy: .02 });
          window.MTSound && MTSound.thunk();
        }
        if (S.pt > 200 && !S.pockets[ti].ball && !S.transit) {
          var b = S.pockets[ti].off + S.rot;
          S.transit = { x: 0, y: -R - 8, y0: -R - 8, tx: PITCH * Math.cos(b), ty: PITCH * Math.sin(b), t: 0 };
        }
        if (S.pt >= DWELL && !S.transit) {
          S.phase = 'index'; S.pt = 0; S.base = S.rot;
          window.MTSound && MTSound.click();
        }
      } else {
        var k = Math.min(S.pt / INDEX, 1);
        S.rot = S.base + Math.PI * ease(k);
        if (k >= 1) {
          S.phase = 'dwell'; S.pt = 0; S.cycles++; S.rot = S.base + Math.PI;
          window.MTSound && MTSound.click(.11);
        }
      }
    }
    if (S.transit) {
      S.transit.t += dt / 300;
      var kk = Math.min(S.transit.t, 1), e2 = kk * kk;
      S.transit.x += (S.transit.tx - S.transit.x) * .22;
      S.transit.y = S.transit.y0 + (S.transit.ty - S.transit.y0) * e2;
      if (kk >= 1) {
        S.pockets[indexer.top(S)].ball = true; S.transit = null;
        window.MTSound && MTSound.thunk();
      }
    }
    for (var i = S.falling.length - 1; i >= 0; i--) {
      var b2 = S.falling[i];
      b2.vy += .0016 * dt; b2.y += b2.vy * dt; b2.x += (b2.x > 0 ? 1 : -1) * .012 * dt;
      if (b2.y > 240) S.falling.splice(i, 1);
    }
  },
  draw: function (K, S) {
    var C = K.C;
    K.dash([13, 4, 2.4, 4]);
    K.line(-R - 30, 0, R + 30, 0, C.faint, 1);
    K.line(0, -R - 52, 0, R + 52, C.faint, 1);
    K.dash([]);

    var cw = 15, top = -R - 52;
    K.line(-cw, top, -cw, -R - 8, C.dim, 1.35);
    K.line(cw, top, cw, -R - 8, C.dim, 1.35);
    for (var i = 0; i < 2; i++) K.circ(0, -R - 20 - i * (RB * 2 + 1.5), RB, C.faint, 1.1);
    K.line(-cw, R + 8, -cw - 8, R + 38, C.dim, 1.35);
    K.line(cw, R + 8, cw + 8, R + 38, C.dim, 1.35);

    K.ctx.save();
    K.ctx.shadowColor = 'rgba(0,0,0,.5)'; K.ctx.shadowBlur = 12; K.ctx.shadowOffsetY = 4;
    K.disc(0, 0, R);
    K.ctx.restore();
    K.circ(0, 0, R - 5.5, C.rule, 1);
    K.dash([5, 4]); K.circ(0, 0, PITCH, C.ghost, 1); K.dash([]);

    S.pockets.forEach(function (p) {
      var a = p.off + S.rot, px = PITCH * Math.cos(a), py = PITCH * Math.sin(a);
      K.line(0, 0, px, py, C.rule, 1.1);
      K.circ(px, py, RP, null, 0, C.dark ? 'rgba(0,0,0,.5)' : 'rgba(16,30,56,.13)');
      K.arc(px, py, RP - .6, LIGHT + 1.1, LIGHT + TAU - 1.1, C.ghost, 1.2);
      K.circ(px, py, RP, C.ink, 1.2);
      if (p.ball) K.sphere(px, py, RB, C.hot);
    });
    K.disc(0, 0, 6.5);

    if (S.transit) K.sphere(S.transit.x, S.transit.y, RB, C.hot);
    S.falling.forEach(function (b) { K.sphere(b.x, b.y, RB, C.hot); });

    var ar = R + 15;
    K.arc(0, 0, ar, -1.85, -.5, C.hot, 1.25);
    K.head(ar * Math.cos(-.5), ar * Math.sin(-.5), -.5 + Math.PI / 2, C.hot, 5);

    var dy = R + 28;
    K.dim(-PITCH, dy, PITCH, dy, null, C.dim);
    K.line(-PITCH, PITCH * .2, -PITCH, dy + 5, C.faint, .8);
    K.line(PITCH, PITCH * .2, PITCH, dy + 5, C.faint, .8);
  },
  labels: function (K, S) {
    var C = K.C;
    K.text('⌀ 60 PITCH', 0, R + 40, C.dim, 10, 'center');
    var deg = (((-S.rot - Math.PI / 2) * 180 / Math.PI) % 360 + 360) % 360;
    K.text('θ = ' + deg.toFixed(1).padStart(5, '0') + '°', -R - 38, -R - 44, C.hot, 11);
    K.text('CYCLE ' + String(S.cycles).padStart(3, '0'), -R - 38, -R - 28, C.dim, 10);
    K.text(S.manual ? 'MANUAL' : 'AUTO INDEX', R + 38, -R - 44, S.manual ? C.hot : C.dim, 10, 'right');
    K.text('2 POCKET . 180° STEP', R + 38, -R - 28, C.dim, 10, 'right');
  }
};
indexer.drag = {
  get: function (S) { return S.rot; },
  begin: function (S) { S.manual = true; },
  set: function (S, v) { S.rot = v; },
  end: function (S) {
    S.manual = false;
    S.rot = Math.round((S.rot + Math.PI / 2) / Math.PI) * Math.PI - Math.PI / 2;
    S.phase = 'dwell'; S.pt = 0; S.base = S.rot;
    window.MTSound && MTSound.click(.09);
  }
};

/* ====================================================================
   FIG . RIG                Benchtop thermal resistance rig
   Section through the hot box. A calibrated heat-flux sensor reads
   actual W/m2 through the specimen instead of inferring it from heater
   power, and the run is only accepted once the result holds steady.
   Numbers are the rig's real ones: ~55 C hot air, 0.1 C sensing,
   a 37 W physical heater ceiling, ~5% comparative accuracy.
   ==================================================================== */
var rig = {
  world: [212, 138], originY: 4,
  init: function () {
    return { q: 0, th: 22, tc: 22, trace: [], steady: false, hold: 0, seed: 0 };
  },
  settle: function (S) {
    S.th = 55; S.tc = 24.6; S.q = 38.4; S.steady = true;
    S.trace = []; for (var i = 0; i < 96; i++) {
      var k = i / 95; S.trace.push(38.4 * (1 - Math.exp(-k * 4.2)) + Math.sin(k * 22) * .5 * (1 - k));
    }
  },
  step: function (S, dt) {
    /* first-order approach to steady state, then a narrow acceptance band */
    var k = dt / 1000;
    S.th = mix(S.th, 55, k * .55);
    S.tc = mix(S.tc, 24.6, k * .5);
    S.seed += dt;
    var target = 38.4 + Math.sin(S.seed / 900) * .28;
    S.q = mix(S.q, target, k * .7);
    if (S.trace.length > 96) S.trace.shift();
    S.trace.push(S.q);
    var near = Math.abs(S.q - 38.4) < .45 && S.th > 54;
    S.hold = near ? S.hold + dt : 0;
    S.steady = S.hold > 1500;
    if (S.hold > 9000) { /* restart the run so the figure keeps telling its story */
      S.th = 23; S.tc = 22.4; S.q = 1.2; S.hold = 0; S.steady = false; S.trace = [];
    }
  },
  draw: function (K, S) {
    var C = K.C;
    var BX = -96, BY = -46, BW = 132, BH = 84, WALL = 7;

    /* --- foam enclosure, hatched wall */
    K.rect(BX, BY, BW, BH, C.dim, 1.2, C.dark ? 'rgba(255,255,255,.012)' : 'rgba(16,30,56,.02)');
    K.rect(BX + WALL, BY + WALL, BW - WALL * 2, BH - WALL * 2, C.dim, 1);
    K.ctx.save();
    K.ctx.beginPath();
    K.ctx.rect(BX, BY, BW, BH);
    K.ctx.rect(BX + WALL, BY + WALL, BW - WALL * 2, BH - WALL * 2);
    K.ctx.clip('evenodd');
    K.hatch(BX, BY, BW, BH, C.faint, 4.2, .6);
    K.ctx.restore();

    /* --- specimen, standing in the aperture */
    var SX = BX + 78, SW = 6;
    var g = K.lin(SX, 0, SX + SW, 0, [[0, C.solidHi], [1, C.solidLo]]);
    K.rect(SX, BY + WALL, SW, BH - WALL * 2, C.ink, 1.2, g);

    /* --- heater, coiled, on the hot side */
    var hx = BX + 22, hy = BY + BH - 22;
    K.ctx.beginPath();
    for (var i = 0; i <= 44; i++) {
      var u = i / 44, x = hx + u * 30, y = hy + Math.sin(u * Math.PI * 7) * 4;
      K.ctx[i ? 'lineTo' : 'moveTo'](x, y);
    }
    K.ctx.strokeStyle = C.warm; K.ctx.lineWidth = 1.5 / K.S; K.ctx.stroke();

    /* --- safety chain in series: one-shot thermal fuse + mechanical stat */
    var sy = BY + BH + 13;
    K.line(BX + 6, sy, BX + 26, sy, C.dim, .9);
    K.rect(BX + 26, sy - 3.2, 11, 6.4, C.dim, .9, C.bg);      // fuse
    K.line(BX + 28, sy, BX + 35, sy, C.warm, 1.1);
    K.line(BX + 37, sy, BX + 50, sy, C.dim, .9);
    K.circ(BX + 55, sy, 4.6, C.dim, .9, C.bg);                 // thermostat
    K.arc(BX + 55, sy, 2.4, Math.PI * .15, Math.PI * .85, C.warm, 1);
    K.line(BX + 60, sy, BX + 74, sy, C.dim, .9);
    K.vec(BX + 74, sy, hx + 2, hy + 8, C.dim, .9, 3.6);

    /* --- heat flow through the specimen, animated */
    var n = 5;
    for (var j = 0; j < n; j++) {
      var yy = BY + WALL + 10 + j * (BH - WALL * 2 - 20) / (n - 1);
      var ph = ((S.t / 1400) + j * .17) % 1;
      var x0 = BX + WALL + 6, x1 = BX + BW - WALL - 6;
      var xa = mix(x0, x1, ph * .96);
      K.line(x0, yy, x1, yy, C.ghost, .8);
      var a = 1 - Math.abs(ph - .5) * 1.2;
      K.ctx.globalAlpha = clamp(a, .15, 1);
      K.head(xa, yy, 0, C.warm, 3.6);
      K.ctx.globalAlpha = 1;
    }

    /* --- heat-flux sensor on the cold face, in a printed locating jig */
    var fx = SX + SW, fy = 2;
    K.rect(fx, fy - 9, 4.2, 18, C.hot, 1.2, C.dark ? 'rgba(255,93,31,.18)' : 'rgba(192,54,43,.14)');
    K.line(fx + 4.2, fy, fx + 16, fy, C.hot, .9);

    /* --- the four temperature sensors: two air, two surface */
    var pts = [[BX + 30, BY + 20, 'T1'], [SX - 12, BY + 62, 'T2'],
               [SX - 2.2, BY + 30, 'T3'], [SX + SW + 1.4, BY + 56, 'T4']];
    pts.forEach(function (p) {
      K.circ(p[0], p[1], 2.2, C.bg, .9, C.ok);
      K.circ(p[0], p[1], 3.8, C.ok, .7);
    });

    /* --- ambient side marker */
    K.dash([2.4, 3]);
    K.line(BX + BW + 6, BY + 8, BX + BW + 6, BY + BH - 8, C.faint, .8);
    K.dash([]);

    /* --- inset: flux settling into the acceptance band */
    var px = 46, py = -44, pw = 60, ph2 = 34;
    var map = K.plot(px, py, pw, ph2);
    var band = 38.4, tol = band * .01;
    var b0 = map(0, (band - tol) / 46)[1], b1 = map(0, (band + tol) / 46)[1];
    K.rect(px, b1, pw, b0 - b1, null, 0, C.dark ? 'rgba(63,191,143,.16)' : 'rgba(27,115,85,.13)');
    if (S.trace.length > 1) {
      K.ctx.beginPath();
      for (var t = 0; t < S.trace.length; t++) {
        var p2 = map(t / 95, clamp(S.trace[t] / 46, 0, 1));
        K.ctx[t ? 'lineTo' : 'moveTo'](p2[0], p2[1]);
      }
      K.ctx.strokeStyle = C.hot; K.ctx.lineWidth = 1.3 / K.S; K.ctx.stroke();
      var lastp = map((S.trace.length - 1) / 95, clamp(S.q / 46, 0, 1));
      K.circ(lastp[0], lastp[1], 1.9, null, 0, C.hot);
    }
    K.rect(px, py, pw, ph2, C.rule, .8);
  },
  labels: function (K, S) {
    var C = K.C;
    K.text('1 IN XPS FOAM WALL', -96, -52, C.dim, 9.5);
    K.text('HOT CHAMBER', -90, -34, C.warm, 9.5);
    K.text('≈ 55 °C AIR', -90, -24, C.dim, 9);
    K.text('SPECIMEN', -14, 44, C.ink, 9.5, 'center');
    K.text('AMBIENT', 44, -34, C.cool, 9.5);
    K.text('HEAT-FLUX SENSOR', 5, 2, C.hot, 9);
    K.text('CALIBRATED . W/m²', 5, 11, C.dim, 8.4);
    K.text('37 W CEILING . FUSE + STAT IN SERIES', -96, 54, C.dim, 8.8);
    K.text('4 × DIGITAL TEMP . ±0.1 °C', -96, 64, C.ok, 8.8);

    K.text('q  W/m²', 46, -49, C.dim, 8.6);
    K.text(S.q.toFixed(1), 106, -49, C.hot, 9.6, 'right');
    K.text('±1% BAND', 106, -6, C.ok, 8.2, 'right');
    K.text('T hot   ' + S.th.toFixed(1) + ' °C', 46, 6, C.dim, 9.4);
    K.text('T cold  ' + S.tc.toFixed(1) + ' °C', 46, 17, C.dim, 9.4);
    K.text(S.steady ? '● STEADY . RUN ACCEPTED' : '○ SETTLING',
      46, 30, S.steady ? C.ok : C.dim, 9.4);
  }
};

/* ====================================================================
   FIG . BEND               Three-point flexural loading
   Why a bespoke fixture exists at all. The specimen is carried on two
   supports and loaded at mid-span through a compliant nose, so it sees
   a clean three-point load and nothing else. Span and load are
   symbolic (L, P): the real span is not published here.
   ==================================================================== */
var bend = {
  world: [200, 132], originY: 6,
  init: function () { return { k: 0, dir: 1, peak: 0 }; },
  settle: function (S) { S.k = 1; },
  step: function (S, dt) {
    S.k += dt / 2200 * S.dir;
    if (S.k > 1) { S.k = 1; S.dir = -1; }
    if (S.k < 0) { S.k = 0; S.dir = 1; }
  },
  draw: function (K, S) {
    var C = K.C;
    var LH = 58, TH = 7, OVER = 16, DMAX = 15;
    var d = DMAX * ease(clamp(S.k, 0, 1));

    /* deflection of a simply supported beam under a central load,
       y ∝ s(3L² - 4s²). Normalised so mid-span is exactly 1. */
    function shape(x) {
      var u = (x + LH) / (2 * LH);
      if (u < 0 || u > 1) return null;
      var v = Math.min(u, 1 - u);
      return v * (3 - 4 * v * v);
    }
    function yAt(x) {
      var s = shape(x);
      if (s !== null) return d * s;
      /* overhangs stay straight, tangent to the beam at the support */
      var at = x < 0 ? -LH : LH, sgn = x < 0 ? -1 : 1;
      var h = .6, slope = (d * shape(at + sgn * h) - d * shape(at)) / (sgn * h);
      return d * shape(at) + slope * (x - at);
    }

    /* --- base rail */
    K.line(-92, 44, 92, 44, C.dim, 1.2);
    K.hatch(-92, 44, 184, 6, C.faint, 5, .6);

    /* --- two support posts, printed parts, called out in accent */
    [-LH, LH].forEach(function (sx) {
      K.path([[sx - 9, 44], [sx - 5, 12], [sx + 5, 12], [sx + 9, 44]], C.ink, 1.2,
        K.lin(sx - 9, 0, sx + 9, 0, [[0, C.solidHi], [1, C.solidLo]]), true);
      /* compliant contact radius at the top */
      K.circ(sx, 8.2, 4, C.hot, 1.3, C.dark ? 'rgba(255,93,31,.16)' : 'rgba(192,54,43,.12)');
    });

    /* --- specimen */
    var pts = [], i;
    for (i = -LH - OVER; i <= LH + OVER; i += 2) pts.push([i, yAt(i) + 4]);
    for (i = LH + OVER; i >= -LH - OVER; i -= 2) pts.push([i, yAt(i) + 4 - TH]);
    K.path(pts, C.ink, 1.3, C.dark ? 'rgba(233,230,224,.10)' : 'rgba(16,30,56,.07)', true);
    /* neutral axis */
    K.dash([5, 4]);
    K.ctx.beginPath();
    for (i = -LH - OVER; i <= LH + OVER; i += 2) {
      var yy = yAt(i) + 4 - TH / 2;
      K.ctx[i === -LH - OVER ? 'moveTo' : 'lineTo'](i, yy);
    }
    K.ctx.strokeStyle = C.faint; K.ctx.lineWidth = .8 / K.S; K.ctx.stroke();
    K.dash([]);

    /* --- load nose descending on mid-span */
    var ny = yAt(0) + 4 - TH - 4;
    K.circ(0, ny, 4, C.hot, 1.3, C.dark ? 'rgba(255,93,31,.16)' : 'rgba(192,54,43,.12)');
    K.path([[-6, ny - 4], [-3.5, ny - 30], [3.5, ny - 30], [6, ny - 4]], C.ink, 1.2,
      K.lin(-6, 0, 6, 0, [[0, C.solidHi], [1, C.solidLo]]), true);
    K.vec(0, ny - 46, 0, ny - 32, C.hot, 1.6, 5.4);

    /* --- reaction arrows at the supports */
    [-LH, LH].forEach(function (sx) { K.vec(sx, 30, sx, 15, C.dim, 1.1, 4); });

    /* --- span dimension */
    K.dim(-LH, 56, LH, 56, 'L', C.dim, 10);
    K.line(-LH, 46, -LH, 58, C.faint, .7);
    K.line(LH, 46, LH, 58, C.faint, .7);

    /* --- deflection dimension at mid-span */
    K.dash([2, 2.6]);
    K.line(-LH - OVER - 6, 4, 14, 4, C.faint, .7);
    K.dash([]);
    if (d > 1.4) K.dim(-LH - OVER - 2, 4, -LH - OVER - 2, 4 + d, null, C.hot, 9, 0);

    /* --- inset: load against deflection, drawn as it loads */
    var px = 30, py = -58, pw = 62, ph = 36;
    var map = K.plot(px, py, pw, ph);
    K.ctx.beginPath();
    var kk = clamp(S.k, 0, 1);
    for (var t = 0; t <= 40; t++) {
      var u = t / 40 * kk, p = map(u, ease(u) * .92);
      K.ctx[t ? 'lineTo' : 'moveTo'](p[0], p[1]);
    }
    K.ctx.strokeStyle = C.hot; K.ctx.lineWidth = 1.4 / K.S; K.ctx.stroke();
    var lp = map(kk, ease(kk) * .92);
    K.circ(lp[0], lp[1], 1.9, null, 0, C.hot);
    K.rect(px, py, pw, ph, C.rule, .8);

    /* --- callouts */
    K.balloon(-LH, 8.2, -LH - 22, -16, 1, C.hot);
    K.balloon(0, ny, 24, -12, 2, C.hot);
  },
  labels: function (K, S) {
    var C = K.C;
    K.text('P', 0, -74, C.hot, 12, 'center');
    K.text('SPECIMEN', -74, -2, C.dim, 9.4, 'right');
    K.text('δ', -78, 12, C.hot, 10, 'right');
    K.text('R', -58, 36, C.dim, 9.4, 'center');
    K.text('R', 58, 36, C.dim, 9.4, 'center');
    K.text('1  COMPLIANT SUPPORT', -80, -16, C.dim, 8.8);
    K.text('2  COMPLIANT LOAD NOSE', 30, -12, C.dim, 8.8);
    K.text('LOAD  P', 30, -63, C.dim, 8.6);
    K.text('DEFLECTION  δ', 92, -18, C.dim, 8.6, 'right');
    K.text('12 PRINTED PARTS . M3 THROUGHOUT . 0 MACHINED', -92, 68, C.dim, 8.8);
  }
};

/* ====================================================================
   FIG . HALL               Friction-free position sensing
   The whole reason the pedals have zero wear parts: the only thing
   crossing the gap is a magnetic field. An A1301 sits at ~2.5 V with
   no field applied and swings either side of it as the magnet on the
   pedal arm sweeps past. Nothing contacts anything.
   ==================================================================== */
var hall = {
  world: [200, 130], originY: 4,
  init: function () { return { a: 0, dir: 1 }; },
  settle: function (S) { S.a = .55; },
  step: function (S, dt) {
    S.a += dt / 2600 * S.dir;
    if (S.a > 1) { S.a = 1; S.dir = -1; }
    if (S.a < 0) { S.a = 0; S.dir = 1; }
  },
  draw: function (K, S) {
    var C = K.C;
    var PIV = [-46, 26], ARM = 62, SWING = .40;
    var ang = -Math.PI * .30 + (S.a - .5) * SWING;
    var tipx = PIV[0] + ARM * Math.cos(ang), tipy = PIV[1] + ARM * Math.sin(ang);

    /* --- frame rail the sensor is fixed to */
    K.line(-88, 44, 74, 44, C.dim, 1.2);
    K.hatch(-88, 44, 162, 6, C.faint, 5, .6);
    K.path([[-56, 44], [-56, 30], [-36, 30], [-36, 44]], C.dim, 1.1, null, false);

    /* --- pedal arm, pivoting */
    K.ctx.save();
    K.ctx.translate(PIV[0], PIV[1]);
    K.ctx.rotate(ang);
    K.round(-6, -5.5, ARM + 10, 11, 3, C.ink, 1.2,
      K.lin(0, -5.5, 0, 5.5, [[0, C.solidHi], [1, C.solidLo]]));
    /* footplate */
    K.path([[ARM - 4, -20], [ARM + 8, -22], [ARM + 8, 12], [ARM - 4, 10]], C.ink, 1.2,
      K.lin(ARM, -20, ARM, 12, [[0, C.solidHi], [1, C.solidLo]]), true);
    K.ctx.restore();
    K.circ(PIV[0], PIV[1], 5.2, C.ink, 1.3, C.solidLo);
    K.circ(PIV[0], PIV[1], 1.6, null, 0, C.dim);

    /* --- the magnet, carried on the arm, sweeping past the sensor */
    var MR = 30;
    var mx = PIV[0] + MR * Math.cos(ang - .34), my = PIV[1] + MR * Math.sin(ang - .34);
    K.ctx.save();
    K.ctx.translate(mx, my); K.ctx.rotate(ang);
    K.rect(-7, -4.6, 7, 9.2, C.ink, 1, C.dark ? '#B03A2E' : '#C0362B');   // N
    K.rect(0, -4.6, 7, 9.2, C.ink, 1, C.dark ? '#37506E' : '#5A7395');    // S
    K.ctx.restore();

    /* --- the sensor, fixed. Three leads, like the package. */
    var SX = 6, SY = -6;
    K.rect(SX, SY - 7, 9, 14, C.ink, 1.2, C.solidLo);
    for (var i = 0; i < 3; i++) K.line(SX + 2 + i * 2.5, SY + 7, SX + 2 + i * 2.5, SY + 15, C.dim, .9);
    K.arc(SX + 4.5, SY - 7, 4.5, Math.PI, TAU, C.faint, .8);

    /* --- field lines across the gap. This is the only thing that
           crosses it, which is the entire point of the figure. */
    var gap = Math.hypot(SX + 4.5 - mx, SY - my);
    var str = clamp(1 - Math.abs(S.a - .5) * 1.15, .18, 1);
    for (var f = 0; f < 4; f++) {
      var sp = (f + 1) / 5;
      var bow = (f - 1.5) * 7;
      K.ctx.beginPath();
      K.ctx.moveTo(mx, my);
      K.ctx.quadraticCurveTo((mx + SX) / 2, (my + SY) / 2 + bow, SX, SY);
      K.ctx.strokeStyle = C.cool;
      K.ctx.globalAlpha = str * (.16 + sp * .3);
      K.ctx.lineWidth = 1 / K.S;
      K.ctx.stroke();
      K.ctx.globalAlpha = 1;
    }
    /* air gap dimension, and a deliberate NO CONTACT note */
    K.dash([1.8, 2.2]);
    K.line(mx, my, SX, SY, C.faint, .7);
    K.dash([]);

    /* --- travel arc of the arm */
    K.dash([3, 3.4]);
    K.arc(PIV[0], PIV[1], ARM + 12, -Math.PI * .30 - SWING / 2, -Math.PI * .30 + SWING / 2, C.faint, .9);
    K.dash([]);
    K.head(PIV[0] + (ARM + 12) * Math.cos(-Math.PI * .30 + SWING / 2),
      PIV[1] + (ARM + 12) * Math.sin(-Math.PI * .30 + SWING / 2),
      -Math.PI * .30 + SWING / 2 + Math.PI / 2, C.faint, 3.6);

    /* --- inset: output voltage against pedal travel */
    var px = 26, py = -60, pw = 66, ph = 34;
    var map = K.plot(px, py, pw, ph);
    /* 2.5 V quiescent line */
    var mid = map(0, .5);
    K.dash([2, 2.4]); K.line(px, mid[1], px + pw, mid[1], C.faint, .7); K.dash([]);
    K.ctx.beginPath();
    for (var t = 0; t <= 48; t++) {
      var u = t / 48;
      var p = map(u, .5 + (u - .5) * .78);
      K.ctx[t ? 'lineTo' : 'moveTo'](p[0], p[1]);
    }
    K.ctx.strokeStyle = C.cool; K.ctx.lineWidth = 1.4 / K.S; K.ctx.stroke();
    var lp = map(S.a, .5 + (S.a - .5) * .78);
    K.circ(lp[0], lp[1], 2, null, 0, C.hot);
    K.line(lp[0], py, lp[0], py + ph, C.hot, .6);
    K.rect(px, py, pw, ph, C.rule, .8);

    K.balloon(mx, my, mx - 26, my - 22, 1, C.hot);
    K.balloon(SX + 4.5, SY, 6, 30, 2, C.hot);
  },
  labels: function (K, S) {
    var C = K.C;
    var v = 2.5 + (S.a - .5) * 1.56;
    K.text('1  MAGNET ON THE ARM', -96, -30, C.dim, 8.8);
    K.text('2  A1301 HALL SENSOR, FIXED', -20, 38, C.dim, 8.8);
    K.text('AIR GAP . NOTHING TOUCHES', -22, 50, C.hot, 9.2);
    K.text('V out', 26, -65, C.dim, 8.6);
    K.text(v.toFixed(3) + ' V', 92, -65, C.cool, 9.8, 'right');
    K.text('2.500 V QUIESCENT', 92, -41, C.faint, 8.2, 'right');
    K.text('PEDAL TRAVEL', 59, -20, C.dim, 8.4, 'center');
    K.text('USB HID AXIS   ' + String(Math.round(v / 5 * 1023)).padStart(4, '0') + ' / 1023',
      26, -6, C.ink, 9.2);
    K.text('WEAR PARTS     0', 26, 5, C.ok, 9.2);
    K.text('3 AXES . TEENSY 2.0 . NO DRIVER', -96, 62, C.dim, 8.8);
  }
};

/* ====================================================================
   FIG . PELTIER            Reversible thermoelectric stack
   One module, two jobs. Reverse the current and the direction of heat
   transport reverses with it, which is the whole product. Bench numbers
   from the voltage-sweep test: cold face about 11 C at 12 V with the
   fin stack around 53 C.
   ==================================================================== */
var peltier = {
  world: [200, 136], originY: 6,
  init: function () { return { mode: 0, sw: 1, user: false }; },   // mode 0 cool, 1 heat
  settle: function (S) { S.sw = 1; },
  step: function (S, dt) {
    if (!S.user) {
      S.phase = (S.phase || 0) + dt;
      if (S.phase > 5200) { S.phase = 0; S.mode = 1 - S.mode; S.sw = 0; }
    }
    S.sw = Math.min(1, (S.sw || 0) + dt / 700);
  },
  toggle: function (S) { S.user = true; S.mode = 1 - S.mode; S.sw = 0; },
  draw: function (K, S) {
    var C = K.C;
    var cool = S.mode === 0;
    var coldC = C.cool, hotC = C.warm;
    var faceC = cool ? coldC : hotC;

    /* --- the mug */
    K.path([[-26, -58], [-26, -18], [26, -18], [26, -58]], C.dim, 1.2, null, false);
    K.arc(0, -18, 26, Math.PI, TAU, C.ghost, 0);
    K.path([[26, -50], [38, -46], [38, -32], [26, -28]], C.dim, 1.2, null, false);
    /* the drink, tinted by mode */
    K.rect(-23, -46, 46, 27, null, 0,
      cool ? (C.dark ? 'rgba(79,168,232,.18)' : 'rgba(29,111,184,.14)')
           : (C.dark ? 'rgba(255,122,61,.18)' : 'rgba(192,54,43,.14)'));

    /* --- aluminium top plate */
    K.rect(-40, -18, 80, 7, C.ink, 1.2,
      K.lin(-40, 0, 40, 0, [[0, C.solidHi], [.5, C.solidLo], [1, C.solidHi]]));

    /* --- TEC: two ceramic plates, a row of pellets between */
    K.rect(-30, -11, 60, 3.4, C.ink, 1.1, C.solidLo);
    for (var i = 0; i < 9; i++) {
      var x = -27 + i * 6.2;
      K.rect(x, -7.6, 4.2, 8, C.faint, .8,
        i % 2 ? (C.dark ? '#2A3550' : '#C4CFE0') : (C.dark ? '#3A2A2A' : '#E0CFCB'));
    }
    K.rect(-30, .4, 60, 3.4, C.ink, 1.1, C.solidLo);

    /* --- heatsink and fins */
    K.rect(-36, 3.8, 72, 5, C.ink, 1.2, C.solidLo);
    for (var f = 0; f < 15; f++) {
      var fx = -34 + f * 4.7;
      K.rect(fx, 8.8, 2.4, 22, C.dim, .8, C.solidLo);
    }
    /* --- 40 mm blower */
    K.circ(52, 20, 13, C.ink, 1.2, C.solidLo);
    K.ctx.save();
    K.ctx.translate(52, 20);
    K.ctx.rotate(S.t / 260);
    for (var b = 0; b < 7; b++) {
      K.ctx.rotate(TAU / 7);
      K.path([[0, 0], [10, -3.4], [10, 2.2]], C.dim, .8, C.ghost, true);
    }
    K.ctx.restore();
    K.circ(52, 20, 3.4, C.ink, 1, C.solidLo);
    K.vec(36, 20, 26, 20, C.dim, 1, 3.8);

    /* --- heat transport, reversing with the mode */
    var up = !cool;
    var n = 4;
    for (var j = 0; j < n; j++) {
      var xx = -22 + j * 14.6;
      var ph = ((S.t / 1200) + j * .22) % 1;
      var y0 = up ? 4 : -14, y1 = up ? -14 : 4;
      var yy = mix(y0, y1, ph);
      K.ctx.globalAlpha = clamp(1 - Math.abs(ph - .5) * 1.3, .2, 1) * S.sw;
      K.head(xx, yy, up ? -Math.PI / 2 : Math.PI / 2, faceC, 4);
      K.ctx.globalAlpha = 1;
    }
    /* waste heat leaving the fins */
    for (var w = 0; w < 3; w++) {
      var wph = ((S.t / 1100) + w * .33) % 1;
      K.ctx.globalAlpha = clamp(1 - wph, .1, .8) * S.sw;
      K.head(-24 + w * 22, 32 + wph * 12, Math.PI / 2, cool ? hotC : coldC, 3.4);
      K.ctx.globalAlpha = 1;
    }

    /* --- current direction, the thing that actually changed */
    var cy = -3.6;
    K.line(-52, cy, -34, cy, C.dim, 1);
    K.circ(-58, cy, 5.4, C.dim, 1, C.bg);
    K.text(cool ? '→' : '←', -58, cy, C.hot, 10, 'center');
    K.line(34, cy + 8, 46, cy + 8, C.dim, 1);

    /* --- face temperature callouts */
    K.dash([2, 2.4]);
    K.line(-40, -14.5, -66, -14.5, C.faint, .7);
    K.line(-36, 6.2, -66, 6.2, C.faint, .7);
    K.dash([]);
  },
  labels: function (K, S) {
    var C = K.C;
    var cool = S.mode === 0;
    K.text(cool ? 'MODE  COOL' : 'MODE  HEAT', -96, -64, cool ? C.cool : C.warm, 11);
    K.text('TEC1-12703 . 12 V', -96, -53, C.dim, 8.8);
    K.text(cool ? '≈ 11 °C' : '≈ 48 °C', -68, -14.5, cool ? C.cool : C.warm, 9.6, 'right');
    K.text(cool ? '≈ 53 °C' : '≈ 14 °C', -68, 6.2, cool ? C.warm : C.cool, 9.6, 'right');
    K.text('COLD FACE', 34, -18, C.faint, 8.2);
    K.text('40 MM BLOWER', 68, 38, C.dim, 8.6, 'center');
    K.text('CLOSED LOOP . ±2 °F BAND', -96, 60, C.ok, 8.8);
    K.text('CLICK TO REVERSE THE CURRENT', 96, 60, C.dim, 8.6, 'right');
  }
};

/* ====================================================================
   FIG . PROGRAM            Union College Rocket Team, 2023 to 2026
   No mechanism here on purpose. The payload's internals are not
   published, so this figure plots the part of the story that is
   documented and externally citable: a team started from nothing, a
   budget grown sevenfold, and a national event won.
   ==================================================================== */
var program = {
  world: [200, 118], originY: 6,
  init: function () { return { k: 0 }; },
  settle: function (S) { S.k = 1; },
  step: function (S, dt) { S.k = Math.min(1, S.k + dt / 2600); },
  draw: function (K, S) {
    var C = K.C;
    var X0 = -80, X1 = 78, Y0 = 34, Y1 = -44;
    /* budget index: 100 at founding, 800 at 700% growth */
    var pts = [[0, 100], [.34, 190], [.58, 430], [.80, 690], [1, 800]];
    var mapx = function (u) { return mix(X0, X1, u); };
    var mapy = function (v) { return mix(Y0, Y1, (v - 100) / 700); };

    /* --- axes */
    K.line(X0, Y0, X1, Y0, C.dim, 1);
    K.line(X0, Y0, X0, Y1 - 4, C.dim, 1);
    K.dash([1.6, 2.6]);
    for (var i = 1; i <= 4; i++) {
      var y = mix(Y0, Y1, i / 4);
      K.line(X0, y, X1, y, C.faint, .6);
    }
    K.dash([]);
    /* year ticks */
    ['2023', '2024', '2025', '2026'].forEach(function (yr, i) {
      var x = mix(X0, X1, i / 3);
      K.line(x, Y0, x, Y0 + 3.4, C.dim, .9);
    });

    /* --- ghost of the finished curve.
       The live curve draws on from zero, so without this the figure is
       an empty pair of axes on frame zero, which is exactly what a
       background tab (where rAF never fires) would be left showing. */
    K.ctx.beginPath();
    for (var q = 0; q < pts.length; q++) {
      K.ctx[q ? 'lineTo' : 'moveTo'](mapx(pts[q][0]), mapy(pts[q][1]));
    }
    K.ctx.strokeStyle = C.faint; K.ctx.lineWidth = .9 / K.S;
    K.dash([2.6, 3]); K.ctx.stroke(); K.dash([]);

    /* --- the growth curve, drawn on */
    var kk = clamp(S.k, 0, 1);
    var area = [[X0, Y0]];
    K.ctx.beginPath();
    for (var t = 0; t <= 60; t++) {
      var u = t / 60 * kk;
      /* piecewise-linear through the marked points */
      var v = 100, j;
      for (j = 1; j < pts.length; j++) {
        if (u <= pts[j][0]) {
          var a = pts[j - 1], b = pts[j];
          v = mix(a[1], b[1], (u - a[0]) / (b[0] - a[0] || 1));
          break;
        }
        v = pts[j][1];
      }
      var x = mapx(u), y = mapy(v);
      area.push([x, y]);
      K.ctx[t ? 'lineTo' : 'moveTo'](x, y);
    }
    K.ctx.strokeStyle = C.hot; K.ctx.lineWidth = 1.6 / K.S; K.ctx.stroke();
    area.push([mapx(kk), Y0]);
    K.path(area, null, 0, C.dark ? 'rgba(255,93,31,.13)' : 'rgba(192,54,43,.10)', true);

    /* --- milestones */
    var ms = [
      [0, 100, 'FOUNDED'],
      [.34, 190, '12 TRAINED'],
      [.58, 430, 'NAR SECTION'],
      [1, 800, '1ST PLACE']
    ];
    ms.forEach(function (m) {
      if (kk < m[0] - .02) return;
      var x = mapx(m[0]), y = mapy(m[1]);
      var last = m[0] === 1;
      K.dash([2, 2.4]); K.line(x, y, x, Y1 - 8, C.faint, .7); K.dash([]);
      K.circ(x, y, last ? 3.4 : 2.4, C.bg, 1.1, last ? C.hot : C.dim);
      if (last) K.circ(x, y, 6.4, C.hot, .9);
    });
  },
  labels: function (K, S) {
    var C = K.C;
    var kk = clamp(S.k, 0, 1);
    K.text('BUDGET INDEX', -80, -50, C.dim, 8.8);
    K.text('700% GROWTH', 78, -50, C.hot, 9.4, 'right');
    ['2023', '2024', '2025', '2026'].forEach(function (yr, i) {
      K.text(yr, mix(-80, 78, i / 3), 43, C.dim, 8.6, 'center');
    });
    var ms = [[0, 100, 'FOUNDED', 'left'], [.34, 190, '12 TRAINED', 'center'],
              [.58, 430, 'NAR SECTION', 'center'], [1, 800, '1ST PLACE . BOR 2026', 'right']];
    ms.forEach(function (m) {
      if (kk < m[0] - .02) return;
      K.text(m[2], mix(-80, 78, m[0]), -38, m[0] === 1 ? C.hot : C.dim, 8.6, m[3]);
    });
    K.text('13 COMPETITION CREW . 12 TRAINED . NAR / TRIPOLI COMPLIANT', -80, 56, C.dim, 8.8);
  }
};

/* ---------- registry + auto-mount ----------------------------------- */
var FIGURES = { indexer: indexer, rig: rig, bend: bend, hall: hall, peltier: peltier, program: program };
window.MTFigures = FIGURES;

function boot() {
  var els = document.querySelectorAll('[data-fig]');
  for (var i = 0; i < els.length; i++) {
    var spec = FIGURES[els[i].dataset.fig];
    if (!spec) { console.warn('unknown figure:', els[i].dataset.fig); continue; }
    try { mount(els[i], spec); }
    catch (e) { console.error('figure mount failed:', els[i].dataset.fig, e); }
  }
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
})();
