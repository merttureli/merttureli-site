// Rudder pedals on the viewer shell. STUB: the model from next/assets/3d/rudder-pedals.json with basic orbit, its
// parts and labels as the file has them. The product agent fills this in (groups, cards, cut, tour,
// controls, update): docs/recipes/viewer.md.
import { cadProduct } from '../cad-product.js';

export default cadProduct({
  slug: 'rudder-pedals',
  file: 'rudder-pedals.json',
  name: 'Rudder pedals 3D model',
  title: 'Rudder pedals',
  eyebrow: 'Interactive / The CAD model',
});
