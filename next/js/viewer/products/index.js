// VIEWER REGISTRY: one line per product (docs/recipes/viewer.md). The key is the project slug
// (content/projects/<slug>.json); the module's default export is its viewer config.
//   hash   the home page address that opens it (default #3d-<slug>; case pages use #explore)
//   eager  fetch the model as soon as its trigger nears the viewport (else on hover, focus or touch)
// HOTBOX and the bend fixture never get a viewer (IP-limited).
export const PRODUCTS = {
  charger: { load: () => import('./charger.js'), hash: '#charger', eager: true },
  'therma-shift': { load: () => import('./therma-shift.js') },
  'robo-catcher': { load: () => import('./robo-catcher.js') },
  'rudder-pedals': { load: () => import('./rudder-pedals.js') },
};
