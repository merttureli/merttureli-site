// Live hero rocket. Bundled to assets/rocket/rocket-live.js by tools/rocket-hero/build.sh.
// Draws only when asked (roll changed or resized); the page owns the loop.
import { Texture, SRGBColorSpace, RepeatWrapping } from 'three';
import { makeView, buildModel, VIEW } from './scene.js';

export { VIEW };

function loadImage(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img.decode().then(() => img);
}

export async function mountLive({ canvas, base = 'assets/rocket/', dpr = 1 }) {
  const [meta, buf, img] = await Promise.all([
    fetch(base + 'charger-live.json').then(r => { if (!r.ok) throw Error('model'); return r.json(); }),
    fetch(base + 'charger-live.bin').then(r => { if (!r.ok) throw Error('model'); return r.arrayBuffer(); }),
    loadImage(base + 'livery.webp')
  ]);
  if (buf.byteLength !== meta.bytes) throw Error('model size');
  const map = new Texture(img);
  map.colorSpace = SRGBColorSpace; map.wrapS = RepeatWrapping; map.anisotropy = 4; map.needsUpdate = true;
  const v = makeView({ canvas });
  v.model.add(buildModel(meta, buf, map));
  let roll = 0, w = 0, h = 0, lost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; api.redraw(); });
  const api = {
    size(cssW, cssH) {
      const nw = Math.max(1, Math.round(cssW * dpr)), nh = Math.max(1, Math.round(cssH * dpr));
      if (nw === w && nh === h) return false;
      w = nw; h = nh; v.renderer.setPixelRatio(1); v.renderer.setSize(w, h, false);
      return true;
    },
    draw(deg) { roll = deg; if (lost) return; v.setRoll(deg); v.render(); },
    redraw() { api.draw(roll); },
    get lost() { return lost; },
    dispose() { v.renderer.dispose(); }
  };
  v.renderer.compile(v.scene, v.camera); // compile up front so the first scroll frame does not stall
  return api;
}
