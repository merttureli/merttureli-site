// CHARGER study model. Raw WebGL, no library: the real flight-model geometry,
// quantized to 16-bit, lit like a white plaster model on a black plate.
const VS = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uProj, uView, uModel; uniform vec3 uC, uH; uniform float uOff, uShift, uShiftY;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 p = uC + aPos * uH; p.y += uOff;
  vec4 w = uModel * vec4(p, 1.0);
  vW = w.xyz; vN = mat3(uModel) * aNor;
  gl_Position = uProj * uView * w;
  gl_Position.x += uShift * gl_Position.w; gl_Position.y += uShiftY * gl_Position.w;
}`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vW;
uniform float uAlpha, uTone; uniform vec3 uEye;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 key = normalize(vec3(-0.75, 0.55, 0.45));
  vec3 fill = normalize(vec3(0.8, -0.1, 0.35));
  float hemi = 0.5 + 0.5 * n.y;
  float d = max(dot(n, key), 0.0);
  float f = max(dot(n, fill), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float l = 0.025 + 0.10 * hemi + 1.0 * d + 0.07 * f + 0.10 * rim;
  vec3 c = vec3(uTone) * l;
  c = pow(c, vec3(1.0 / 1.85));
  gl_FragColor = vec4(c * uAlpha, uAlpha);
}`;
const LVS = `
attribute vec3 aPos;
uniform mat4 uProj, uView, uModel; uniform vec3 uC, uH; uniform float uOff, uShift, uShiftY;
void main(){ vec3 p = uC + aPos * uH; p.y += uOff; gl_Position = uProj * uView * uModel * vec4(p, 1.0); gl_Position.x += uShift * gl_Position.w; gl_Position.y += uShiftY * gl_Position.w; }`;
const LFS = `precision mediump float; uniform float uAlpha; void main(){ gl_FragColor = vec4(vec3(0.92) * uAlpha, uAlpha); }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u, aPos: gl.getAttribLocation(p, 'aPos'), aNor: gl.getAttribLocation(p, 'aNor') };
}

const m4 = {
  persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), r = 1 / (n - f); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + f) * r, -1, 0, 0, 2 * n * f * r, 0]; },
  look(e, c) {
    let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
    let x = [z[2], 0, -z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const d = (a) => -(a[0] * e[0] + a[1] * e[1] + a[2] * e[2]);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, d(x), d(y), d(z), 1];
  },
  // Rz(tilt) * Ry(spin)
  model(spin, tilt) {
    const cy = Math.cos(spin), sy = Math.sin(spin), cz = Math.cos(tilt), sz = Math.sin(tilt);
    return [cz * cy, sz * cy, -sy, 0, -sz, cz, 0, 0, cz * sy, sz * sy, cy, 0, 0, 0, 0, 1];
  }
};

function normals(pos, idx, vStart, vCount, iStart, iCount, c, h) {
  const out = new Float32Array(vCount * 3), P = i => [c[0] + pos[(vStart + i) * 3] / 32767 * h[0], c[1] + pos[(vStart + i) * 3 + 1] / 32767 * h[1], c[2] + pos[(vStart + i) * 3 + 2] / 32767 * h[2]];
  for (let k = iStart; k < iStart + iCount; k += 3) {
    const a = idx[k], b = idx[k + 1], d = idx[k + 2], A = P(a), B = P(b), D = P(d);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const j of [a, b, d]) { out[j * 3] += n[0]; out[j * 3 + 1] += n[1]; out[j * 3 + 2] += n[2]; }
  }
  for (let i = 0; i < vCount; i++) { const l = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]) || 1; out[i * 3] /= l; out[i * 3 + 1] /= l; out[i * 3 + 2] /= l; }
  return out;
}

export async function createStudy(canvas, opts = {}) {
  const base = opts.base || 'assets/model/';
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'low-power' });
  if (!gl) throw Error('no-webgl');
  const [meta, buf] = await Promise.all([
    fetch(base + 'charger-study.json').then(r => r.json()),
    fetch(base + 'charger-study.bin').then(r => { if (!r.ok) throw Error('model'); return r.arrayBuffer(); })
  ]);
  const S = meta.sections;
  const pos = new Int16Array(buf, S.pos[0], S.pos[1] / 2);
  const idx = new Uint16Array(buf, S.idx[0], S.idx[1] / 2 | 0);
  const wire = new Int16Array(buf, S.wire[0], S.wire[1] / 2);
  const C = meta.center, H = meta.half;
  const nor = new Float32Array(pos.length);
  for (const p of meta.parts) if (p.v) nor.set(normals(pos, idx, p.v[0], p.v[1], p.i[0], p.i[1], C, H), p.v[0] * 3);

  const mesh = compile(gl, VS, FS), line = compile(gl, LVS, LFS);
  const mk = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const bPos = mk(gl.ARRAY_BUFFER, pos), bNor = mk(gl.ARRAY_BUFFER, nor), bIdx = mk(gl.ELEMENT_ARRAY_BUFFER, idx), bWire = mk(gl.ARRAY_BUFFER, wire);
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);

  const state = { shift: 0, shiftY: 0, ruler: null, spin: opts.spin ?? 0.6, tilt: opts.tilt ?? 0, explode: 0, elev: opts.elev ?? 0.16, zoom: opts.zoom ?? 1 };
  const parts = meta.parts.map(p => ({ ...p, cy: (p.y[0] + p.y[1]) / 2000 }));

  function offset(p, t) { return p.cy * (p.exterior ? 0.2 : 0.62) * t; }

  function draw() {
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const asp = w / h, fov = 0.42, t = state.explode;
    let lo = 1e9, hi = -1e9;
    for (const p of parts) { const o = offset(p, t); lo = Math.min(lo, p.y[0] / 1000 + o); hi = Math.max(hi, p.y[1] / 1000 + o); }
    const len = hi - lo, mid = (hi + lo) / 2;
    const fitV = (len / 2) / Math.tan(fov / 2), fitH = (0.2 / 2) / Math.tan(fov / 2) / asp;
    const dist = Math.max(fitV * 1.1, fitH * 1.2) / state.zoom;
    const tgt = [0, mid * Math.cos(state.tilt), 0];
    const eye = [-mid * Math.sin(state.tilt) * 0, tgt[1] + Math.sin(state.elev) * dist, Math.cos(state.elev) * dist];
    const proj = m4.persp(fov, asp, dist * 0.2, dist * 3), view = m4.look(eye, tgt), model = m4.model(state.spin, state.tilt);
    // Project nose tip and tail of the airframe for the dimension line.
    const mul = (m, v) => [0, 1, 2, 3].map(r => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
    const nose = parts.find(p => p.id === 0), tail = parts.find(p => p.id === 2);
    if (nose && tail) {
      const sy = (y) => { const c = mul(proj, mul(view, mul(model, [0, y, 0, 1]))); return 0.5 - 0.5 * (c[1] / c[3] + state.shiftY); };
      const top = nose.y[1] / 1000 + offset(nose, t), bot = tail.y[0] / 1000 + offset(tail, t);
      state.ruler = { top: sy(top), bottom: sy(bot), inches: (top - bot) / 1.141386 * 37 };
    }
    const shellA = 1 - Math.min(1, t * 1.6);
    const setCommon = (pr) => {
      gl.useProgram(pr.p);
      gl.uniformMatrix4fv(pr.u.uProj, false, proj); gl.uniformMatrix4fv(pr.u.uView, false, view); gl.uniformMatrix4fv(pr.u.uModel, false, model);
      gl.uniform3fv(pr.u.uC, C); gl.uniform3fv(pr.u.uH, H); gl.uniform1f(pr.u.uShift, state.shift); gl.uniform1f(pr.u.uShiftY, state.shiftY);
    };
    // Solid pass
    setCommon(mesh); gl.uniform3fv(mesh.u.uEye, eye);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.enableVertexAttribArray(mesh.aPos); gl.vertexAttribPointer(mesh.aPos, 3, gl.SHORT, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.enableVertexAttribArray(mesh.aNor); gl.vertexAttribPointer(mesh.aNor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    const drawPart = (p, a) => {
      gl.uniform1f(mesh.u.uOff, offset(p, t)); gl.uniform1f(mesh.u.uAlpha, a); gl.uniform1f(mesh.u.uTone, p.exterior ? 0.93 : 1.0);
      // Each part indexes its own vertex block, so rebind the attribute base per part.
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.vertexAttribPointer(mesh.aPos, 3, gl.SHORT, true, 0, p.v[0] * 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, bNor); gl.vertexAttribPointer(mesh.aNor, 3, gl.FLOAT, false, 0, p.v[0] * 12);
      gl.drawElements(gl.TRIANGLES, p.i[1], gl.UNSIGNED_SHORT, p.i[0] * 2);
    };
    gl.disable(gl.BLEND); gl.depthMask(true);
    for (const p of parts) if (p.v && (!p.exterior || shellA > 0.995)) drawPart(p, 1);
    if (shellA > 0.005 && shellA <= 0.995) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      for (const p of parts) if (p.v && p.exterior) drawPart(p, shellA);
      gl.depthMask(true);
    }
    gl.disableVertexAttribArray(mesh.aNor);
    // Edge pass: the shell becomes a drawing as the parts separate.
    const lineA = Math.min(1, t * 1.4) * 0.3;
    if (lineA > 0.01) {
      setCommon(line); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, bWire); gl.enableVertexAttribArray(line.aPos);
      for (const p of parts) if (p.w) {
        gl.uniform1f(line.u.uOff, offset(p, t)); gl.uniform1f(line.u.uAlpha, lineA);
        gl.vertexAttribPointer(line.aPos, 3, gl.SHORT, true, 0, p.w[0] * 6);
        gl.drawArrays(gl.LINES, 0, p.w[1]);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }

  function resize(dprCap = 1.75) {
    const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  return { gl, state, draw, resize, parts };
}
