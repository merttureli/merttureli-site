// The three CAD models on the page. Everything else about them is read from their own files at run time.
// `step` is the stem of the stand-in STEP file the quickstart shows; `part` is the part the load example turns.
export const MODELS = {
  'robo-catcher': { file: 'robo-catcher', title: 'Robo-Catcher', step: 'robo-catcher', part: 'indexer', yaw: -0.62, pitch: 0.34 },
  'rudder-pedals': { file: 'rudder-pedals', title: 'Rudder pedals', step: 'rudder-pedals', part: 'rocker', yaw: 0.95, pitch: 0.3 },
  // CHARGER is only a still in the Models table: framed on its avionics bay (part pivots from y -0.11 to 0.36 m),
  // a long, thin interior with no stored explode vectors, it read as two plain tubes at 1-bit, so it has no tab.
  'charger': { file: 'charger-explorer', title: 'CHARGER', step: 'charger', part: 'payload', yaw: 0.2, pitch: 0.12, lay: -0.93, frame: [-0.11, 0.36] },
};
export const ORDER = ['robo-catcher', 'rudder-pedals', 'charger'];
export const modelUrl = key => new URL(`../../../next/assets/3d/${MODELS[key].file}.json`, import.meta.url).href;

// The header of a model, fetched once. `jsonBytes` is the size of the JSON on the wire; meta.bytes is the .bin.
const metas = new Map();
export function loadMeta(key) {
  if (!metas.has(key)) {
    metas.set(key, fetch(modelUrl(key)).then(async r => {
      if (!r.ok) throw new Error(`${MODELS[key].file}.json ${r.status}`);
      const buf = await r.arrayBuffer();
      const meta = JSON.parse(new TextDecoder().decode(buf));
      return { key, meta, jsonBytes: buf.byteLength };
    }));
  }
  return metas.get(key);
}
