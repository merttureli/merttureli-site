// cadProduct(): a viewer config (docs/recipes/viewer.md) for one cadmesh file in next/assets/3d/.
// Every part of the file becomes a viewer part: its label from the file, its explode vector from the
// file (metres, the showreel's exploded offset), its Group as the object the shell moves. Pass any
// config field to replace a default, and `parts` to edit the list:
//
//   export default cadProduct({ slug: 'my-thing', file: 'my-thing.json', title: 'My thing',
//     parts: list => list.map(p => ({ ...p, group: 'body' })) });
//
// The result's prefetch() fetches the file (once); build() decodes it (on idle, before the first open).
import { fetchCadMesh, buildCadMesh } from '../cad/cadmesh.js';

const ASSETS = new URL('../../assets/3d/', import.meta.url).href;

export function cadProduct({ file, materials, parts: edit, ...config }) {
  let dataP = null;
  const prefetch = () => {
    if (!dataP) { dataP = fetchCadMesh(ASSETS + file); dataP.catch(() => { dataP = null; }); }
    return dataP;
  };
  return {
    prefetch,
    async build(ctx) {
      const { THREE } = ctx;
      const data = await prefetch();
      const cad = buildCadMesh(THREE, data.meta, data.buf, { materials });
      let list = data.meta.parts.filter(p => !p.referenceOnly).map(p => ({
        id: p.name, label: p.label || p.name, obj: cad.parts[p.name], explode: p.explode, exterior: p.exterior !== false,
      }));
      if (edit) list = edit(list, cad, ctx);
      return { model: cad.group, parts: list, cad, dispose: () => cad.dispose() };
    },
    ...config,
  };
}
