// Shared by the hero rocket (assets/rocket/rocket-live.js) and the CHARGER explorer while it
// shows the seated rocket, so both draw the same object under the same light.
// Units are the explorer's: metres, rocket axis on +Y, nose up.

// Hero camera. The page tilts and moves a vertical canvas with CSS, so the camera never moves;
// only the roll about the rocket's own axis is drawn. FRONT turns the lettering to the camera,
// the same azimuth as the explorer's default view (direction 1, 0.22, 2.8).
export const VIEW = (() => {
  const v = { fov: 8, pitch: .1, front: Math.atan2(1, 2.8), top: .5707, bottom: -.6102, margin: 1.04, w: 216, h: 1200 };
  v.len = v.top - v.bottom;
  v.cy = (v.top + v.bottom) / 2;
  v.frame = v.len * v.margin;                                   // world height the canvas shows
  v.dist = v.frame / 2 / Math.tan(v.fov * Math.PI / 360);       // camera distance
  v.aspect = v.w / v.h;
  return v;
})();

// Dark studio, matte paint (the redesign prototype's live look). Positions are in the hero
// camera's frame: +Z toward the viewer, +Y along the rocket's nose.
export const HERO_RIG = [
  { type: 'hemi', sky: 0xa9b3c4, ground: 0x08080a, intensity: .32 },
  { type: 'dir', color: 0xfff3e6, intensity: 3.4, position: [-1.5, .45, .75] },
  { type: 'dir', color: 0xffffff, intensity: .9, position: [-.45, .25, 1.5] },
  { type: 'dir', color: 0xc9d6ff, intensity: 2.8, position: [1.7, .3, -.8] },
  { type: 'dir', color: 0xffe2cf, intensity: .18, position: [.8, -.6, .9] }
];
