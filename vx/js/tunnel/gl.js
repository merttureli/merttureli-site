/* Thin WebGL2 layer for the tunnel: context and extension probe, program
   compilation with a define prefix, render targets and ping-pong pairs, a single
   fullscreen triangle, and bookkeeping so destroy() can release everything.
   No library: the solver owns its own state. */
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
  /* A texture with a framebuffer on it. */
  function target(w, h, role) {
    const tex = texture(w, h, fmt[role]);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    framebuffers.add(fbo);
    const t = { tex, fbo, w, h, role, complete: status === gl.FRAMEBUFFER_COMPLETE };
    return t;
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
    const probe = target(4, 4, 'vel'), probe2 = target(4, 4, 'scalar32'), probe3 = target(4, 4, 'dye');
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

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`tunnel shader: ${log}`);
    }
    return s;
  }
  const vert = shader(gl.VERTEX_SHADER, VERT);

  /* Compile `source` behind the shared prelude. `defines` is a list such as
     ['KIND_VEL']; PACKED is added from the storage path. Returns {prog, u}
     where u maps every active uniform name (arrays without their [0]) to its location. */
  function program(source, defines = []) {
    const all = (packed ? ['PACKED'] : []).concat(defines);
    const head = '#version 300 es\n' + all.map(d => `#define ${d}\n`).join('');
    const frag = shader(gl.FRAGMENT_SHADER, head + PRELUDE + source);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`tunnel program: ${log}`);
    }
    const u = Object.create(null);
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    const p = { prog, u };
    programs.add(p);
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
    for (const p of programs) gl.deleteProgram(p.prog);
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
    gl, packed, float32: !!extFloat && !packed,
    path: packed ? 'PACKED RGBA8' : extFloat ? 'FLOAT (RG16F / R32F / RGBA16F)' : 'HALF FLOAT (RG16F / R16F / RGBA16F)',
    texture, target, pair, release, program, use, tex, draw, clearCanvas, readBytes, rendererString, destroy,
    loseContextExt: gl.getExtension('WEBGL_lose_context'),
  };
}
