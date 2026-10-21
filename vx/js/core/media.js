/* Near-viewport media streamer.
   The site ships about 73 MB of motion. Nothing is attached until it is within
   1.5 viewports, sources are detached again beyond 3 viewports, only the videos
   actually intersecting the viewport play, and the governor can turn autoplay
   off entirely (tier 0 or reduced motion shows posters). Markup contract:
     <video poster="..." muted loop playsinline preload="none" data-stream>
       <source data-src="...-alpha.webm" type="video/webm">
       <source data-src="....mp4" type="video/mp4">
     </video>
   Emits media:state { attached, playing, bytes } whenever something changes. */
import { bus } from './bus.js';
import { governor } from './governor.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const registry = new Map(); // video -> { near, visible, attached, bytes }
const state = { attached: 0, playing: 0, bytes: 0, count: 0 };
const MAX_PLAYING = [0, 1, 2, 4];       // concurrent playing videos per tier
let nearObs, visObs, ro;

function blocked() { return reduced.matches || governor.tier === 0 || document.hidden; }
function attach(video, s) {
  if (s.attached) return;
  const sources = video.querySelectorAll('source[data-src]');
  for (const src of sources) { src.src = src.dataset.src; src.removeAttribute('data-src'); }
  s.attached = true; state.attached++;
  if (sources.length) video.load();
  video.addEventListener('loadedmetadata', () => { s.w = video.videoWidth; s.h = video.videoHeight; video.dataset.decoded = `${s.w}x${s.h}`; publish(); }, { once: true });
}
function detach(video, s) {
  if (!s.attached) return;
  video.pause();
  for (const src of video.querySelectorAll('source[src]')) { src.dataset.src = src.src; src.removeAttribute('src'); }
  video.removeAttribute('src'); video.load();
  s.attached = false; s.playing = false; state.attached--;
}
function sync() {
  let playing = 0;
  const cap = MAX_PLAYING[governor.tier] ?? 4;
  const entries = [...registry.entries()].sort((a, b) => (a[1].distance ?? 1e9) - (b[1].distance ?? 1e9));
  for (const [video, s] of entries) {
    if (!video.isConnected) continue;
    const shouldPlay = !blocked() && s.visible && s.attached && playing < cap;
    if (shouldPlay) {
      playing++;
      if (video.paused && !s.starting) {
        s.starting = true;
        Promise.resolve(video.play()).catch(() => {}).finally(() => { s.starting = false; });
      }
      s.playing = true;
    } else if (!video.paused) { video.pause(); s.playing = false; }
    else s.playing = false;
  }
  state.playing = playing;
  publish();
}
function publish() {
  state.count = registry.size;
  if (performance.getEntriesByType) {
    let bytes = 0;
    for (const e of performance.getEntriesByType('resource')) if (/\.(webm|mp4)(\?|$)/.test(e.name)) bytes += e.transferSize || 0;
    state.bytes = bytes;
  }
  bus.emit('media:state', state);
}
function register(video) {
  if (registry.has(video)) return;
  const s = { near: false, visible: false, attached: false, playing: false, distance: null };
  registry.set(video, s);
  video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = false;
  nearObs?.observe(video); visObs?.observe(video);
}
export const media = {
  state,
  scan(root = document) { for (const v of root.querySelectorAll('video[data-stream]')) register(v); publish(); },
  register,
  release(video) { const s = registry.get(video); if (!s) return; detach(video, s); nearObs?.unobserve(video); visObs?.unobserve(video); registry.delete(video); publish(); },
  refresh: sync,
  destroy() { for (const [v, s] of registry) detach(v, s); registry.clear(); nearObs?.disconnect(); visObs?.disconnect(); ro?.disconnect(); },
};
if ('IntersectionObserver' in window) {
  nearObs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const s = registry.get(e.target); if (!s) continue;
      s.near = e.isIntersecting;
      s.distance = Math.abs(e.boundingClientRect.top + e.boundingClientRect.height / 2 - innerHeight / 2);
      if (s.near && !blocked()) attach(e.target, s);
    }
    sync();
  }, { rootMargin: '150% 0px' });
  // Beyond three viewports the sources are detached so the decoder and memory are released.
  const farObs = new IntersectionObserver((entries) => {
    for (const e of entries) { const s = registry.get(e.target); if (s && !e.isIntersecting) detach(e.target, s); }
    sync();
  }, { rootMargin: '300% 0px' });
  visObs = new IntersectionObserver((entries) => {
    for (const e of entries) { const s = registry.get(e.target); if (!s) continue; s.visible = e.isIntersecting; s.distance = Math.abs(e.boundingClientRect.top + e.boundingClientRect.height / 2 - innerHeight / 2); }
    sync();
  }, { threshold: 0.05 });
  const origObserve = nearObs.observe.bind(nearObs);
  nearObs.observe = (el) => { origObserve(el); farObs.observe(el); };
  const origUnobserve = nearObs.unobserve.bind(nearObs);
  nearObs.unobserve = (el) => { origUnobserve(el); farObs.unobserve(el); };
  const origDisconnect = nearObs.disconnect.bind(nearObs);
  nearObs.disconnect = () => { origDisconnect(); farObs.disconnect(); };
}
document.addEventListener('visibilitychange', sync);
reduced.addEventListener('change', () => { if (reduced.matches) for (const [v, s] of registry) detach(v, s); sync(); });
governor.subscribe(() => { if (governor.tier === 0) for (const [v, s] of registry) detach(v, s); else for (const [v, s] of registry) if (s.near) attach(v, s); sync(); });
export default media;
