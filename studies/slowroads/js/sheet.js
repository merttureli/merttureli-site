/* The contact sheet. One frame is circled in grease pencil. Choosing a frame moves the circle to it and lays a
   larger print beside the sheet (below it on a phone), never over it; "Put it back", Escape or the same frame
   again takes the print away. */

export function initSheet({ still }) {
  const sheet = document.querySelector('.sheet'), strip = document.getElementById('strip');
  if (!sheet || !strip) return;
  const frames = [...strip.querySelectorAll('.frame')], grease = document.getElementById('grease');
  const blowup = document.getElementById('blowup'), img = document.getElementById('blowup-img'), cap = document.getElementById('blowup-cap'), close = document.getElementById('blowup-close');
  let open = null, marked = strip.querySelector('.frame.is-marked') || null;

  /* frame box relative to the sheet's padding box, untouched by the sheet's own slight tilt */
  function box(el) {
    let x = 0, y = 0, n = el;
    while (n && n !== sheet) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function circle(frame, animate) {
    if (!grease) return;
    if (!frame) { grease.classList.remove('is-on'); return; }
    const b = box(frame), padX = b.w * 0.1, padY = b.h * 0.13;
    grease.style.left = (b.x - padX) + 'px'; grease.style.top = (b.y - padY) + 'px';
    grease.style.width = (b.w + padX * 2) + 'px'; grease.style.height = (b.h + padY * 2) + 'px';
    grease.setAttribute('preserveAspectRatio', 'none');
    grease.classList.add('is-on');
    if (animate && !still) { grease.classList.remove('is-drawing'); void grease.getBoundingClientRect(); grease.classList.add('is-drawing'); }
  }
  /* The print lies beside the sheet. If it is not on screen (a phone, where it lies below), bring it into view. */
  function place() {
    const r = blowup.getBoundingClientRect();
    if (r.top < 8 || r.bottom > window.innerHeight - 8) blowup.scrollIntoView({ block: r.height > window.innerHeight - 16 ? 'start' : 'nearest', behavior: still ? 'auto' : 'smooth' });
  }
  function show(frame) {
    const src = frame.querySelector('img'), tall = frame.classList.contains('frame--tall');
    if (open) open.setAttribute('aria-expanded', 'false');
    open = frame; marked = frame;
    frames.forEach(f => f.classList.toggle('is-marked', f === frame));
    frame.setAttribute('aria-expanded', 'true');
    blowup.classList.toggle('is-tall', tall);
    img.width = src.naturalWidth || (tall ? 520 : 520); img.height = src.naturalHeight || (tall ? 780 : 346);
    img.src = src.currentSrc || src.src;
    img.alt = src.alt.replace(/^Frame \d+(, shot upright)?: /, 'Enlarged: ');
    cap.textContent = frame.dataset.cap || '';
    blowup.hidden = false;
    blowup.classList.remove('is-in'); void blowup.offsetWidth; blowup.classList.add('is-in');
    place(); circle(frame, true);
  }
  function hide(focusBack) {
    if (!open) return;
    const was = open; open = null;
    was.setAttribute('aria-expanded', 'false');
    blowup.hidden = true; blowup.classList.remove('is-in');
    if (focusBack) was.focus({ preventScroll: true });
  }

  frames.forEach(frame => frame.addEventListener('click', () => { if (open === frame) hide(false); else show(frame); }));
  close.addEventListener('click', () => hide(true));
  (document.getElementById('lightbox') || sheet).addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) { e.preventDefault(); hide(true); return; }
    const i = frames.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: frames.length - 1 }[e.key];
    if (to !== undefined && frames[to]) { e.preventDefault(); frames[to].focus(); }
  });

  const refit = () => circle(marked, false);
  refit();
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(refit, 120); };
  if ('ResizeObserver' in window) new ResizeObserver(later).observe(sheet);
  window.addEventListener('load', later);
}
