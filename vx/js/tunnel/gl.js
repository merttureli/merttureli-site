/* Thin WebGL2 layer for the tunnel: context and extension probe, program
   compilation with a define prefix, render targets and ping-pong pairs, a single
   fullscreen triangle, and bookkeeping so destroy() can release everything.
   No library: the solver owns its own state.

   Program builds come in two halves so the driver compiles while the page
   does something else: program() only issues the compile and the link and
   returns at once; finish() reads LINK_STATUS and the uniform table, the one
   call that waits for the driver. linked() asks, without waiting, whether
   finish() would return at once (KHR_parallel_shader_compile; null without
   it: then a fence() issued after the links, polled with fenceDone(), says
   when the driver has worked through them). No status is read anywhere else
   on the build path: each read is a round trip that stalls the main thread
   until the driver has caught up. */
import { VERT, PRELUDE } from './shaders.js';

const CONTEXT_ATTRIBUTES = {
  alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
  preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false,
};

/* Returns null when WebGL2 is unavailable. `forcePacked` is the lab's `?enc=1`
   switch that exercises the RGBA8 path on hardware that has float targets. */
export function createGL(canvas, { forcePacked = false } = {}) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES); } catch { gl = null; }
  if (!gl) return null;

  const extFloat = forcePacked ? null : gl.getExtension('EXT_color_buffer_float');
  const extHalf = forcePacked || extFloat ? null : gl.getExtension('EXT_color_buffer_half_float');
  let packed = !extFloat && !extHalf;
  const L = gl.LINEAR, N = gl.NEAREST;

  /* [internalFormat, format, type, filter] per logical texture role. */
  const FORMATS = () => packed ? {
    vel: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, N],
    scalar: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, N],
    scalar32: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, N],
    dye: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, L],
    bytes: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, N],
  } : {
    vel: [gl.RG16F, gl.RG, gl.HALF_FLOAT, L],
    scalar: [gl.R16F, gl.RED, gl.HALF_FLOAT, N],
    /* pressure keeps 32 bits where the full float extension allows it: half-float
       spacing at |p| > 256 is 0.25, the size of one step's gradient */
    scalar32: extFloat ? [gl.R32F, gl.RED, gl.FLOAT, N] : [gl.R16F, gl.RED, gl.HALF_FLOAT, N],
    dye: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, L],
    bytes: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, N],
  };
  let fmt = FORMATS();

  const textures = new Set(), framebuffers = new Set(), programs = new Set();

  function texture(w, h, [internal, format, type, filter]) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures.add(t);
    return t;
  }
  /* A texture with a framebuffer on it. `check` reads the completeness status,
     a blocking round trip: only the format probe below asks for it; field
     targets reuse a format the probe has already proven, so `complete` is
     null on them. */
  function target(w, h, role, check = false) {
    const tex = texture(w, h, fmt[role]);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = check ? gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE : null;
    framebuffers.add(fbo);
    return { tex, fbo, w, h, role, complete };
  }
  function release(t) {
    if (!t) return;
    if (t.fbo) { gl.deleteFramebuffer(t.fbo); framebuffers.delete(t.fbo); }
    if (t.tex) { gl.deleteTexture(t.tex); textures.delete(t.tex); }
    t.fbo = null; t.tex = null;
  }
  /* Ping-pong pair: read from .read, draw into .write, then swap(). */
  function pair(w, h, role) {
    const d = { read: target(w, h, role), write: target(w, h, role), w, h, role,
      swap() { const r = d.read; d.read = d.write; d.write = r; },
      release() { release(d.read); release(d.write); } };
    return d;
  }

  /* Probe: a float path whose targets are not actually complete falls back to
     packed before any field is allocated. */
  if (!packed) {
    const probe = target(4, 4, 'vel', true), probe2 = target(4, 4, 'scalar32', true), probe3 = target(4, 4, 'dye', true);
    const ok = probe.complete && probe2.complete && probe3.complete;
    release(probe); release(probe2); release(probe3);
    if (!ok) { packed = true; fmt = FORMATS(); }
  }

  /* Fullscreen triangle on attribute 0. */
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.CULL_FACE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  /* Issue a compile; its status is read only if the link fails (finish). */
  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  const vert = shader(gl.VERTEX_SHADER, VERT);
  const extParallel = gl.getExtension('KHR_parallel_shader_compile');

  /* Issue the compile and link of `source` behind the shared prelude and return
     at once. `defines` is a list such as ['KIND_VEL']; PACKED is added from the
     storage path. Returns {prog, frag, u: null}; finish(p) fills u. */
  function program(source, defines = []) {
    const all = (packed ? ['PACKED'] : []).concat(defines);
    const head = '#version 300 es\n' + all.map(d => `#define ${d}\n`).join('');
    const frag = shader(gl.FRAGMENT_SHADER, head + PRELUDE + source);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    const p = { prog, frag, u: null };
    programs.add(p);
    return p;
  }
  /* true when finish(p) would not wait, false while the driver is still on it,
     null when the driver cannot say (no KHR_parallel_shader_compile). */
  function linked(p) {
    if (p.u) return true;
    if (!extParallel) return null;
    return gl.getProgramParameter(p.prog, extParallel.COMPLETION_STATUS_KHR) === true;
  }
  /* A fence behind everything issued so far, and a poll that never waits: the
     status only changes between tasks, so poll it once per frame. A lost
     context or a failed wait counts as done, so no caller polls forever. */
  function fence() { const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); return f; }
  function fenceDone(f) {
    if (!f || gl.isContextLost()) return true;
    const r = gl.clientWaitSync(f, 0, 0);
    if (r === gl.TIMEOUT_EXPIRED) return false;
    gl.deleteSync(f);
    return true;
  }
  /* Read the link result (waits for the driver if it is not done) and map every
     active uniform name (arrays without their [0]) to its location in p.u.
     Throws with the compile and link logs when the driver rejected the GLSL. */
  function finish(p) {
    if (p.u) return p;
    if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = [gl.getShaderInfoLog(p.frag), gl.getShaderInfoLog(vert), gl.getProgramInfoLog(p.prog)]
        .map((l) => (l || '').replace(/\0/g, '').trim()).filter(Boolean).join(' / ');
      gl.deleteShader(p.frag); p.frag = null;
      gl.deleteProgram(p.prog);
      programs.delete(p);
      throw new Error(`tunnel program: ${log || 'link failed'}`);
    }
    gl.deleteShader(p.frag); p.frag = null;
    const u = Object.create(null);
    const n = gl.getProgramParameter(p.prog, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p.prog, i);
      if (!info) continue;
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p.prog, info.name);
    }
    p.u = u;
    return p;
  }

  let current = null;
  function use(p) { if (current !== p) { gl.useProgram(p.prog); current = p; } return p.u; }
  function tex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  /* Draw the current program into a target ({fbo, w, h}) or the canvas (null). */
  function draw(t) {
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function clearCanvas() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  /* Read an RGBA8 target back as bytes without stalling the GPU: the pixels go
     into a pixel pack buffer, a fence marks the command, and the bytes are
     copied out once the fence has signalled. Resolves with `out`. */
  function readBytes(t, out) {
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, out.byteLength, gl.STREAM_READ);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (gl.isContextLost()) { reject(new Error('context lost')); return; }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) { setTimeout(poll, 4); return; }
        gl.deleteSync(sync);
        if (status === gl.WAIT_FAILED) { gl.deleteBuffer(pbo); reject(new Error('fence wait failed')); return; }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.deleteBuffer(pbo);
        resolve(out);
      };
      poll();
    });
  }
  function rendererString() {
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch { return 'unknown'; }
  }
  function destroy() {
    for (const p of programs) { if (p.frag) gl.deleteShader(p.frag); gl.deleteProgram(p.prog); }
    programs.clear();
    for (const f of framebuffers) gl.deleteFramebuffer(f);
    framebuffers.clear();
    for (const t of textures) gl.deleteTexture(t);
    textures.clear();
    gl.deleteShader(vert);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    gl, packed, float32: !!extFloat && !packed, parallel: !!extParallel,
    path: packed ? 'PACKED RGBA8' : extFloat ? 'FLOAT (RG16F / R32F / RGBA16F)' : 'HALF FLOAT (RG16F / R16F / RGBA16F)',
    texture, target, pair, release, program, linked, finish, fence, fenceDone, use, tex, draw, clearCanvas, readBytes, rendererString, destroy,
    loseContextExt: gl.getExtension('WEBGL_lose_context'),
  };
}
