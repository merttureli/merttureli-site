/* Slow Roads. Four small modules, no build step:
   prints.js  loose prints: pick up, move, let go (mouse, touch, keyboard), drop in and develop
   road.js    the hand-drawn route that draws with the scroll, and the stamps that land as it reaches a stop
   sheet.js   the contact sheet: circle a frame, see it larger in place
   post.js    the envelope and the postcard. Nothing is sent anywhere. */
import { initPrints } from './prints.js';
import { initRoads } from './road.js';
import { initSheet } from './sheet.js';
import { initPost } from './post.js';

const still = document.documentElement.classList.contains('still');
window.slowRoadsReady = true;
initPrints({ still });
initRoads({ still });
initSheet({ still });
initPost({ still });

// The way back is a luggage tag that says this is a sample site. It stays pinned to the top left corner of the
// window; once the page moves, a strip of the desk (body::before in the CSS) slides under it, so the tag never
// lies over a heading, a print or a field passing by.
{
  const root = document.documentElement;
  root.classList.add('pinned');
  const edge = () => root.classList.toggle('is-veiled', window.scrollY > 4);
  addEventListener('scroll', edge, { passive: true });
  edge();
}
