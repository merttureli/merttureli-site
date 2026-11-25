// maps.js: the map file each quickstart shows.
//
// The rudder pedals are the one model here that came straight from a STEP file through `import`, so their map
// is the real one (tools/cad/maps/rudder-pedals.json) with its notes dropped and "out" pointed at an example
// folder. The two screws its first rule skips are not in the shipped file; their names follow the six instances
// that are (20CHX-1 to -5 and -7).
// The other two models were converted from older files, so their map is written here from the JSON header:
// one rule per part, the CAD names it holds, and its explode vector where one is stored.
const SHCS = 'socket head cap screw_am_B18.3.1M - 3 x 0.5 x 20 Hex SHCS -- 20CHX-';
const RUDDER = {
  name: 'rudder-pedals', out: 'public/models/', formats: ['cadmesh'], up: 'y', origin: 'bottom', quality: 'medium', unmatched: 'keep',
  order: ['wallR', 'wallL', 'core', 'rocker', 'rodR', 'rodL', 'leverR', 'leverL'],
  parts: [
    { match: ['*20CHX-6', '*20CHX-8'], skip: true },
    { match: 'Pedal RIGHT*', name: 'leverR', sub: 'pedalR', color: '#e59f5c', label: 'Right pedal', deflection: 0.25, angle: 0.5 },
    { match: 'Pedal left and right print', name: 'leverL', sub: 'pedalL', color: '#e59f5c', label: 'Left pedal', deflection: 0.25, angle: 0.5 },
    { match: '*20CHX-7', name: 'leverR', sub: 'pedalR', material: 'darkMetal', deflection: 1.5, angle: 2.0 },
    { match: 'LEVER ARM', name: 'leverR', label: 'Right lever arm', color: '#c4c8ce', deflection: 0.25, angle: 0.5 },
    { match: ['*8_68-2', '*8_68-6', '*8_68-9'], name: 'leverR', material: 'steel', deflection: 2.0, angle: 2.0 },
    { match: ['*35 --22WN-3', '*35 --22WN-4', '*20 --20WN-4', '*20CHX-2', '*20CHX-3'], name: 'leverR', material: 'darkMetal', deflection: 1.5, angle: 2.0 },
    { match: '*20CHX-5', name: 'leverL', sub: 'pedalL', material: 'darkMetal', deflection: 1.5, angle: 2.0 },
    { match: 'LEVER ARM L', name: 'leverL', label: 'Left lever arm', color: '#c4c8ce', deflection: 0.25, angle: 0.5 },
    { match: ['*8_68-3', '*8_68-7', '*8_68-8'], name: 'leverL', material: 'steel', deflection: 2.0, angle: 2.0 },
    { match: ['*35 --22WN-2', '*35 --22WN-5', '*20 --20WN-3', '*20CHX-1', '*20CHX-4'], name: 'leverL', material: 'darkMetal', deflection: 1.5, angle: 2.0 },
    { match: 'alignment rod-2', name: 'rodR', label: 'Right link rod', material: 'steel', deflection: 0.9, angle: 1.3 },
    { match: 'alignment rod-1', name: 'rodL', label: 'Left link rod', material: 'steel', deflection: 0.9, angle: 1.3 },
    { match: ['Sensor lever', 'Center magnet holder'], name: 'rocker', label: 'Sensor lever', color: '#c4c8ce', deflection: 0.25, angle: 0.5 },
    { match: ['*8_68-4', '*8_68-5'], name: 'rocker', material: 'steel', deflection: 2.0, angle: 2.0 },
    { match: ['*35 --22WN-1', 'hex nut*', '*20 --20WN-1', '*20 --20WN-2'], name: 'rocker', material: 'darkMetal', deflection: 1.5, angle: 2.0 },
    { match: ['Middle support front', 'Middle support back'], name: 'core', label: 'Middle supports', color: '#c4c8ce', deflection: 0.25, angle: 0.5 },
    { match: '*8_68-1', name: 'core', material: 'steel', deflection: 2.0, angle: 2.0 },
    { match: ['*20 --20WN-5', '*20 --20WN-6'], name: 'core', material: 'darkMetal', deflection: 1.5, angle: 2.0 },
    { match: 'Rudder side wall R', name: 'wallR', label: 'Right side wall', color: '#393b41', deflection: 0.25, angle: 0.5 },
    { match: 'Rudder side wall', name: 'wallL', label: 'Left side wall', color: '#393b41', deflection: 0.25, angle: 0.5 },
  ],
};

export function mapFor(key, { meta }) {
  if (key === 'rudder-pedals') return { json: RUDDER, skipped: [SHCS + '6', SHCS + '8'], real: true };
  const src = meta.source;
  const json = {
    name: meta.name, out: 'public/models/', formats: ['cadmesh'], up: src.up, origin: src.origin, quality: src.quality || 'medium', explode: 1,
    parts: meta.parts.map(p => {
      const names = [...new Set(p.cad)], rule = { match: names.length === 1 ? names[0] : names, name: p.name };
      if (p.label && p.label !== p.name) rule.label = p.label;
      const mm = p.explode.map(v => Math.round(v * 1000));
      if (mm.some(Boolean)) rule.explode_mm = mm;
      if (p.id != null) rule.id = p.id;
      return rule;
    }),
  };
  return { json, skipped: [], real: false };
}
