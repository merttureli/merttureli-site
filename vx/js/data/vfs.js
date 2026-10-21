/* vfs.js — the console's virtual filesystem: a manifest of REAL files in this
   repository with their REAL byte sizes. Generated once by a script that ran
   fs.statSync over the repo (scratchpad/gen-vfs.cjs); nothing here is typed by
   hand, and the total is 73,635,536 bytes across 109 files.
   Regenerate with the script if assets change. Do not edit the FILES table.

   Layout (rooted at ~):
     ~/projects/01-hotbox … 06-therma-shift   README, motion files, renders and stills per project
     ~/photos/{acadia,beyond,pad,shop,robo-catcher}
     ~/cad/charger/{assembly.json,assembly.bin,charger-hybrid.step,assembly.glb}
     ~/docs/resume.pdf
   Every file node carries:
     name, size (bytes), repo (path from the repository root), href (the same
     path relative to the vx page, ../assets/...), and url (absolute, resolved
     from this module with import.meta.url so it works from any page depth).
   README nodes are text files whose content is quoted from index.html. */

/* [vfs path, repository path, bytes] — generated 2026-10-21 */
export const FILES = [
  ["~/projects/01-hotbox/hotbox-blurred-alpha.webm"                , "assets/motion/hotbox-blurred-alpha.webm"                          ,   1185927],
  ["~/projects/01-hotbox/hotbox-blurred-poster.jpg"                , "assets/motion/hotbox-blurred-poster.jpg"                          ,     11853],
  ["~/projects/01-hotbox/hotbox-blurred.mp4"                       , "assets/motion/hotbox-blurred.mp4"                                 ,    161773],
  ["~/projects/02-robo-catcher/robo-catcher-360-alpha.webm"        , "assets/motion/robo-catcher-360-alpha.webm"                        ,  10888733],
  ["~/projects/02-robo-catcher/robo-catcher-360-poster.png"        , "assets/motion/robo-catcher-360-poster.png"                        ,     93972],
  ["~/projects/02-robo-catcher/robo-catcher-360.mp4"               , "assets/motion/robo-catcher-360.mp4"                               ,   7291103],
  ["~/projects/02-robo-catcher/plates/assembly-dark.jpg"           , "assets/photos/cad-drawing-plates/assembly-dark.jpg"               ,     46289],
  ["~/projects/02-robo-catcher/plates/assembly-light.jpg"          , "assets/photos/cad-drawing-plates/assembly-light.jpg"              ,     53350],
  ["~/projects/02-robo-catcher/plates/feeder-dark.jpg"             , "assets/photos/cad-drawing-plates/feeder-dark.jpg"                 ,     39229],
  ["~/projects/02-robo-catcher/plates/feeder-light.jpg"            , "assets/photos/cad-drawing-plates/feeder-light.jpg"                ,     41346],
  ["~/projects/02-robo-catcher/plates/indexer-dark.jpg"            , "assets/photos/cad-drawing-plates/indexer-dark.jpg"                ,     38937],
  ["~/projects/02-robo-catcher/plates/indexer-light.jpg"           , "assets/photos/cad-drawing-plates/indexer-light.jpg"               ,     40872],
  ["~/projects/02-robo-catcher/plates/thrower-dark.jpg"            , "assets/photos/cad-drawing-plates/thrower-dark.jpg"                ,     62086],
  ["~/projects/02-robo-catcher/plates/thrower-light.jpg"           , "assets/photos/cad-drawing-plates/thrower-light.jpg"               ,     64025],
  ["~/projects/03-charger/charger-painted-wide-alpha.webm"         , "assets/motion/charger-painted-wide-alpha.webm"                    ,    483670],
  ["~/projects/03-charger/charger-painted-wide-poster.png"         , "assets/motion/charger-painted-wide-poster.png"                    ,    349513],
  ["~/projects/03-charger/charger-painted-wide.mp4"                , "assets/motion/charger-painted-wide.mp4"                           ,    193502],
  ["~/projects/03-charger/charger-square-alpha.webm"               , "assets/motion/charger-square-alpha.webm"                          ,   1605971],
  ["~/projects/03-charger/charger-square-poster.png"               , "assets/motion/charger-square-poster.png"                          ,     32322],
  ["~/projects/03-charger/charger-square.mp4"                      , "assets/motion/charger-square.mp4"                                 ,    945270],
  ["~/projects/03-charger/charger-wide-alpha.webm"                 , "assets/motion/charger-wide-alpha.webm"                            ,   4233913],
  ["~/projects/03-charger/charger-wide-poster.png"                 , "assets/motion/charger-wide-poster.png"                            ,    120308],
  ["~/projects/03-charger/charger-wide.mp4"                        , "assets/motion/charger-wide.mp4"                                   ,   5446355],
  ["~/projects/03-charger/renders/shockcord-beauty-render.jpg"     , "assets/photos/3d-model-renders/shockcord-beauty-render.jpg"       ,      9548],
  ["~/projects/03-charger/renders/shockcord-shot-sheet.jpg"        , "assets/photos/3d-model-renders/shockcord-shot-sheet.jpg"          ,     16004],
  ["~/projects/03-charger/stills/nose-cone-ejection-test.jpg"      , "assets/photos/video/nose-cone-ejection-test.jpg"                  ,     23279],
  ["~/projects/03-charger/stills/rocket-launch.jpg"                , "assets/photos/video/rocket-launch.jpg"                            ,     11982],
  ["~/projects/04-bend-fixture/bend-fixture-blurred-alpha.webm"    , "assets/motion/bend-fixture-blurred-alpha.webm"                    ,    568407],
  ["~/projects/04-bend-fixture/bend-fixture-blurred-poster.jpg"    , "assets/motion/bend-fixture-blurred-poster.jpg"                    ,     10738],
  ["~/projects/04-bend-fixture/bend-fixture-blurred.mp4"           , "assets/motion/bend-fixture-blurred.mp4"                           ,    101660],
  ["~/projects/05-rudder-pedals/rudder-pedals-mechanism-poster.jpg", "assets/motion/rudder-pedals-mechanism-poster.jpg"                 ,     61697],
  ["~/projects/05-rudder-pedals/rudder-pedals-mechanism.mp4"       , "assets/motion/rudder-pedals-mechanism.mp4"                        ,   2536775],
  ["~/projects/05-rudder-pedals/rudder-pedals-mechanism.webm"      , "assets/motion/rudder-pedals-mechanism.webm"                       ,    886845],
  ["~/projects/05-rudder-pedals/rudder-pedals-working-alpha.webm"  , "assets/motion/rudder-pedals-working-alpha.webm"                   ,   3334465],
  ["~/projects/05-rudder-pedals/rudder-pedals-working-poster.png"  , "assets/motion/rudder-pedals-working-poster.png"                   ,     97866],
  ["~/projects/05-rudder-pedals/rudder-pedals-working.mp4"         , "assets/motion/rudder-pedals-working.mp4"                          ,   4233070],
  ["~/projects/05-rudder-pedals/renders/a1301-hall-sensor.jpg"     , "assets/renders/rudder-pedals/a1301-hall-sensor.jpg"               ,     29885],
  ["~/projects/05-rudder-pedals/renders/pro-micro.jpg"             , "assets/renders/rudder-pedals/pro-micro.jpg"                       ,     46765],
  ["~/projects/05-rudder-pedals/pedals-hero.jpg"                   , "assets/photos/rudder-pedal-photography/pedals-hero.jpg"           ,      7584],
  ["~/projects/06-therma-shift/therma-shift-360-alpha.webm"        , "assets/motion/therma-shift-360-alpha.webm"                        ,   2022575],
  ["~/projects/06-therma-shift/therma-shift-360-noflow-alpha.webm" , "assets/motion/therma-shift-360-noflow-alpha.webm"                 ,   2268435],
  ["~/projects/06-therma-shift/therma-shift-360-noflow-poster.png" , "assets/motion/therma-shift-360-noflow-poster.png"                 ,     30368],
  ["~/projects/06-therma-shift/therma-shift-360-noflow.mp4"        , "assets/motion/therma-shift-360-noflow.mp4"                        ,   2120893],
  ["~/projects/06-therma-shift/therma-shift-360-poster.png"        , "assets/motion/therma-shift-360-poster.png"                        ,     20681],
  ["~/projects/06-therma-shift/therma-shift-360.mp4"               , "assets/motion/therma-shift-360.mp4"                               ,   1987725],
  ["~/projects/06-therma-shift/therma-shift-airflow-alpha.webm"    , "assets/motion/therma-shift-airflow-alpha.webm"                    ,   5474563],
  ["~/projects/06-therma-shift/therma-shift-airflow-poster.png"    , "assets/motion/therma-shift-airflow-poster.png"                    ,    504941],
  ["~/projects/06-therma-shift/therma-shift-airflow.mp4"           , "assets/motion/therma-shift-airflow.mp4"                           ,   1974124],
  ["~/photos/acadia/bridge-rail.jpg"                               , "assets/photos/acadia-road-trip-photography/bridge-rail.jpg"       ,     18582],
  ["~/photos/acadia/cove-blue.jpg"                                 , "assets/photos/acadia-road-trip-photography/cove-blue.jpg"         ,     22952],
  ["~/photos/acadia/forest-path.jpg"                               , "assets/photos/acadia-road-trip-photography/forest-path.jpg"       ,     59772],
  ["~/photos/acadia/granite-coast.jpg"                             , "assets/photos/acadia-road-trip-photography/granite-coast.jpg"     ,     43631],
  ["~/photos/acadia/jordan-bubbles.jpg"                            , "assets/photos/acadia-road-trip-photography/jordan-bubbles.jpg"    ,     25526],
  ["~/photos/acadia/jordan-shore.jpg"                              , "assets/photos/acadia-road-trip-photography/jordan-shore.jpg"      ,     29263],
  ["~/photos/acadia/lighthouse-close.jpg"                          , "assets/photos/acadia-road-trip-photography/lighthouse-close.jpg"  ,     17460],
  ["~/photos/acadia/lighthouse.jpg"                                , "assets/photos/acadia-road-trip-photography/lighthouse.jpg"        ,     19018],
  ["~/photos/acadia/overlook-laugh.jpg"                            , "assets/photos/acadia-road-trip-photography/overlook-laugh.jpg"    ,     20520],
  ["~/photos/acadia/overlook-look.jpg"                             , "assets/photos/acadia-road-trip-photography/overlook-look.jpg"     ,     23482],
  ["~/photos/acadia/overlook-sit.jpg"                              , "assets/photos/acadia-road-trip-photography/overlook-sit.jpg"      ,     25165],
  ["~/photos/acadia/pine-trail.jpg"                                , "assets/photos/acadia-road-trip-photography/pine-trail.jpg"        ,     51305],
  ["~/photos/acadia/pond-wide.jpg"                                 , "assets/photos/acadia-road-trip-photography/pond-wide.jpg"         ,     32909],
  ["~/photos/acadia/ridge-rock.jpg"                                , "assets/photos/acadia-road-trip-photography/ridge-rock.jpg"        ,     27295],
  ["~/photos/acadia/road-open.jpg"                                 , "assets/photos/acadia-road-trip-photography/road-open.jpg"         ,     20068],
  ["~/photos/acadia/road-trees.jpg"                                , "assets/photos/acadia-road-trip-photography/road-trees.jpg"        ,     32109],
  ["~/photos/acadia/road-yellow.jpg"                               , "assets/photos/acadia-road-trip-photography/road-yellow.jpg"       ,     32350],
  ["~/photos/acadia/sea-cliff.jpg"                                 , "assets/photos/acadia-road-trip-photography/sea-cliff.jpg"         ,     57160],
  ["~/photos/acadia/self-mirror.jpg"                               , "assets/photos/acadia-road-trip-photography/self-mirror.jpg"       ,     23023],
  ["~/photos/acadia/sky-wisps.jpg"                                 , "assets/photos/acadia-road-trip-photography/sky-wisps.jpg"         ,     11853],
  ["~/photos/acadia/stand-cliff.jpg"                               , "assets/photos/acadia-road-trip-photography/stand-cliff.jpg"       ,     42906],
  ["~/photos/acadia/summit-crew.jpg"                               , "assets/photos/acadia-road-trip-photography/summit-crew.jpg"       ,     20560],
  ["~/photos/acadia/summit-sun.jpg"                                , "assets/photos/acadia-road-trip-photography/summit-sun.jpg"        ,     30027],
  ["~/photos/acadia/summit-sunset.jpg"                             , "assets/photos/acadia-road-trip-photography/summit-sunset.jpg"     ,     17625],
  ["~/photos/acadia/sunset-lake.jpg"                               , "assets/photos/acadia-road-trip-photography/sunset-lake.jpg"       ,     30539],
  ["~/photos/acadia/sunset-poles.jpg"                              , "assets/photos/acadia-road-trip-photography/sunset-poles.jpg"      ,     14880],
  ["~/photos/beyond/lake-framed.jpg"                               , "assets/photos/beyond/lake-framed.jpg"                             ,    492200],
  ["~/photos/beyond/lighthouse.jpg"                                , "assets/photos/beyond/lighthouse.jpg"                              ,    174631],
  ["~/photos/beyond/moon-pines.jpg"                                , "assets/photos/beyond/moon-pines.jpg"                              ,    141531],
  ["~/photos/beyond/overlook.jpg"                                  , "assets/photos/beyond/overlook.jpg"                                ,    232221],
  ["~/photos/beyond/rosa-rugosa.jpg"                               , "assets/photos/beyond/rosa-rugosa.jpg"                             ,    246282],
  ["~/photos/beyond/stargazers.jpg"                                , "assets/photos/beyond/stargazers.jpg"                              ,    102716],
  ["~/photos/beyond/gallery/lake-framed-thumb.webp"                , "assets/photos/beyond/gallery/lake-framed-thumb.webp"              ,     60298],
  ["~/photos/beyond/gallery/lake-framed-view.webp"                 , "assets/photos/beyond/gallery/lake-framed-view.webp"               ,    425094],
  ["~/photos/beyond/gallery/lighthouse-thumb.webp"                 , "assets/photos/beyond/gallery/lighthouse-thumb.webp"               ,     19016],
  ["~/photos/beyond/gallery/lighthouse-view.webp"                  , "assets/photos/beyond/gallery/lighthouse-view.webp"                ,     91070],
  ["~/photos/beyond/gallery/moon-pines-thumb.webp"                 , "assets/photos/beyond/gallery/moon-pines-thumb.webp"               ,     14592],
  ["~/photos/beyond/gallery/moon-pines-view.webp"                  , "assets/photos/beyond/gallery/moon-pines-view.webp"                ,     64986],
  ["~/photos/beyond/gallery/rosa-rugosa-thumb.webp"                , "assets/photos/beyond/gallery/rosa-rugosa-thumb.webp"              ,     31084],
  ["~/photos/beyond/gallery/rosa-rugosa-view.webp"                 , "assets/photos/beyond/gallery/rosa-rugosa-view.webp"               ,    157066],
  ["~/photos/pad/charger-pad-band.jpg"                             , "assets/photos/charger-rocket-photography/charger-pad-band.jpg"    ,    330705],
  ["~/photos/pad/charger-pad-close.jpg"                            , "assets/photos/charger-rocket-photography/charger-pad-close.jpg"   ,     56490],
  ["~/photos/pad/charger-pad-tall.jpg"                             , "assets/photos/charger-rocket-photography/charger-pad-tall.jpg"    ,     77992],
  ["~/photos/shop/bench-build.jpg"                                 , "assets/photos/shop-and-machine-photography/bench-build.jpg"       ,     49317],
  ["~/photos/shop/field-test.jpg"                                  , "assets/photos/shop-and-machine-photography/field-test.jpg"        ,     62590],
  ["~/photos/shop/machine-field.jpg"                               , "assets/photos/shop-and-machine-photography/machine-field.jpg"     ,     76715],
  ["~/photos/shop/machine-net.jpg"                                 , "assets/photos/shop-and-machine-photography/machine-net.jpg"       ,     23453],
  ["~/photos/shop/uc-netframe.jpg"                                 , "assets/photos/shop-and-machine-photography/uc-netframe.jpg"       ,     35199],
  ["~/photos/shop/uc-team.jpg"                                     , "assets/photos/shop-and-machine-photography/uc-team.jpg"           ,     34831],
  ["~/photos/shop/uc-track.jpg"                                    , "assets/photos/shop-and-machine-photography/uc-track.jpg"          ,     27967],
  ["~/photos/robo-catcher/final-product.jpg"                       , "assets/photos/robo-catcher-photography/final-product.jpg"         ,     23137],
  ["~/photos/robo-catcher/flywheel-full.jpg"                       , "assets/photos/robo-catcher-photography/flywheel-full.jpg"         ,     33167],
  ["~/photos/robo-catcher/full-assembly.jpg"                       , "assets/photos/robo-catcher-photography/full-assembly.jpg"         ,     48326],
  ["~/photos/robo-catcher/full-feeder.jpg"                         , "assets/photos/robo-catcher-photography/full-feeder.jpg"           ,     20292],
  ["~/photos/robo-catcher/indexer-cross-section.jpg"               , "assets/photos/robo-catcher-photography/indexer-cross-section.jpg" ,     22489],
  ["~/photos/robo-catcher/working-on-electronics.jpg"              , "assets/photos/robo-catcher-photography/working-on-electronics.jpg",     71885],
  ["~/cad/charger/assembly.json"                                   , "assets/charger-explorer/assembly.json"                            ,     15030],
  ["~/cad/charger/assembly.bin"                                    , "assets/charger-explorer/assembly.bin"                             ,   2482932],
  ["~/cad/charger/charger-hybrid.step"                             , "assets/charger-explorer/cad/charger-hybrid.step"                  ,   3091026],
  ["~/cad/charger/assembly.glb"                                    , "assets/charger-explorer/assembly.glb"                             ,   1989280],
  ["~/docs/resume.pdf"                                             , "assets/Mert-Tureli-Resume.pdf"                                    ,    248752],
];
export const TOTAL_BYTES = 73635536;

/* Project folders: README text quoted from index.html, the case study page where one exists. */
export const PROJECTS = {
  "01-hotbox": {
    title: "HOTBOX: thermal test bench",
    index: "01",
    slug: "hotbox",
    meta: "SunThru, 2026 / Design, electronics, firmware, safety systems",
    text: "The company needed to rank glazing samples by insulating performance and had no way to measure it. I designed and built the whole bench: the insulated test chamber, the sensor stack, the electronics, the firmware, and the safety system that lets it run unattended overnight.",
    note: "IP protected. Only a blurred render exists.",
    page: null
  },
  "02-robo-catcher": {
    title: "Robo-Catcher",
    index: "02",
    slug: "robo-catcher",
    meta: "Senior capstone, 2025 / Twelve person team",
    text: "An automatic softball catching and return machine. I co-led the feeding subsystem and then took over all the electronics and firmware for the entire robot when the project needed someone to own it.",
    page: "projects/robo-catcher.html"
  },
  "03-charger": {
    title: "CHARGER: deployable sensor payload",
    index: "03",
    slug: "charger",
    meta: "Union College Rocket Team, 2026 / Captain and chief engineer / First place",
    text: "The competition entry that won its event at Battle of the Rockets 2026. I led the design and manufacture of the airframe and the deployable payload, and ran the team through design review, build, and launch day recovery.",
    page: "projects/charger.html"
  },
  "04-bend-fixture": {
    title: "Custom three-point bend fixture and data logger",
    index: "04",
    slug: "bend-fixture",
    meta: "SunThru, 2026 / Solo design",
    text: "Aerogel is too fragile for off the shelf flexural test fixtures, so I designed one. It is fully 3D printable, built from interlocking parts on a shared coordinate system, and sized for the lab's samples with gentle repeatable clamping.",
    note: "IP protected. Only a blurred render exists.",
    page: "projects/bend-fixture.html"
  },
  "05-rudder-pedals": {
    title: "Flight sim rudder pedals",
    index: "05",
    slug: "rudder-pedals",
    meta: "Personal project, 2026 / Solo",
    text: "A three axis fighter style rudder and toe brake set, designed in CAD and 3D printed, using contactless magnetic sensing so there is nothing to wear out. I wrote the USB HID firmware myself, so it is plug and play in any simulator with no drivers, custom calibration, and its own deadzone logic.",
    page: "projects/rudder-pedals.html"
  },
  "06-therma-shift": {
    title: "Therma-Shift coaster",
    index: "06",
    slug: "therma-shift",
    meta: "Personal project, 2026 / Solo",
    text: "A solid state coaster that actively heats or cools any mug or glass, built for a seed competition. Closed loop temperature control with thermal runaway cutoffs, in an aluminum topped form factor designed to work with drinkware people already own rather than a proprietary cup.",
    page: "projects/therma-shift.html"
  }
};

/* Extra links the console offers for a project (cat <project>, open <project>). */
export const PROJECT_LINKS = {
  '03-charger': [
    { label: 'DOWNLOAD STEP (3.1 MB)', repo: 'assets/charger-explorer/cad/charger-hybrid.step' },
    { label: 'DOWNLOAD GLB (2.0 MB)', repo: 'assets/charger-explorer/assembly.glb' },
    { label: 'OPEN THE EXPLORER', repo: 'assets/charger-explorer/index.html' },
  ],
};

/* The four roles, month ranges as published on index.html (TASECS reads "Summer 2024": June to August). */
export const roles = [
  { id: 'sunthru', name: 'Engineering intern', org: 'SunThru', place: 'Schenectady, NY', from: '2026-06', to: '2026-09', source: 'index.html: June 2026 to September 2026' },
  { id: 'ucrt', name: 'Founder and president', org: 'Union College Rocket Team', place: 'Schenectady, NY', from: '2023-08', to: '2026-06', source: 'index.html: August 2023 to June 2026' },
  { id: 'modufly', name: 'Founder', org: 'ModuFly', place: 'Schenectady, NY', from: '2024-09', to: '2026-01', source: 'index.html: September 2024 to January 2026' },
  { id: 'tasecs', name: 'Design engineer and materials intern', org: 'TASECS', place: 'Ankara, Turkey', from: '2024-06', to: '2024-08', source: 'index.html: Summer 2024' },
];

/* ---- tree construction and path helpers (plain data above, behaviour below) ---- */
const REPO_ROOT = new URL('../../../', import.meta.url);   // vx/js/data/ → repository root
const TYPE_BY_EXT = { webm: 'video / alpha where -alpha', mp4: 'video', png: 'image', jpg: 'image', webp: 'image', pdf: 'document', json: 'manifest', bin: 'geometry', step: 'cad', glb: 'gltf binary', html: 'page', md: 'text' };

function dir(name, parent) { return { type: 'dir', name, parent, children: Object.create(null) }; }
function ensureDir(root, segments) {
  let node = root;
  for (const s of segments) {
    if (!node.children[s]) node.children[s] = dir(s, node);
    node = node.children[s];
  }
  return node;
}
export const root = dir('~', null);
for (const [vpath, repo, size] of FILES) {
  const segs = vpath.split('/').slice(1);               // drop "~"
  const name = segs.pop();
  const parent = ensureDir(root, segs);
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  parent.children[name] = {
    type: 'file', name, parent, size, repo,
    ext, kind: TYPE_BY_EXT[ext] || 'file',
    href: '../' + repo,
    url: new URL(repo, REPO_ROOT).href,
  };
}
for (const [folder, p] of Object.entries(PROJECTS)) {
  const d = ensureDir(root, ['projects', folder]);
  d.project = { ...p, folder };
  d.page = p.page ? { href: '../' + p.page, url: new URL(p.page, REPO_ROOT).href } : null;
  d.links = (PROJECT_LINKS[folder] || []).map((l) => ({ label: l.label, href: '../' + l.repo, url: new URL(l.repo, REPO_ROOT).href }));
  const text = [p.title.toUpperCase(), p.meta, '', p.text, p.note ? '' : null, p.note || null].filter((l) => l !== null).join('\n');
  d.children.README = { type: 'file', name: 'README', parent: d, size: new TextEncoder().encode(text).length, text, ext: '', kind: 'text', repo: null, href: null, url: null };
}
Object.freeze(roles);

/* Path resolution. Paths may be absolute (~/x, /x) or relative to cwd; "." and ".." are honoured. */
export function pathOf(node) {
  const parts = [];
  for (let n = node; n; n = n.parent) parts.unshift(n.name);
  return parts.join('/');
}
export function resolve(path, cwd = root) {
  let node = cwd;
  const raw = (path || '').trim();
  if (!raw || raw === '.') return cwd;
  const parts = raw.split('/').filter(Boolean);
  if (raw.startsWith('~') || raw.startsWith('/')) { node = root; if (parts[0] === '~') parts.shift(); }
  for (const p of parts) {
    if (p === '.') continue;
    if (p === '..') { node = node.parent || root; continue; }
    if (node.type !== 'dir') return null;
    const child = node.children[p];
    if (!child) return null;
    node = child;
  }
  return node;
}
/* Children sorted: directories first, then files, each alphabetically. */
export function list(node) {
  if (!node || node.type !== 'dir') return [];
  return Object.values(node.children).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}
export function walk(node, fn, depth = 0) {
  fn(node, depth);
  if (node.type === 'dir') for (const c of list(node)) walk(c, fn, depth + 1);
}
/* Every node under a directory as a flat array (for completion and open by name). */
export function flatten(node = root) { const out = []; walk(node, (n) => { if (n !== node) out.push(n); }); return out; }
/* Recursive totals for a directory. */
export function totals(node) {
  let files = 0, dirs = 0, bytes = 0;
  walk(node, (n) => { if (n === node) return; if (n.type === 'dir') dirs++; else { files++; bytes += n.size; } });
  return { files, dirs, bytes };
}
/* Bytes formatted the way the site writes sizes: "2.48 MB", "484 KB", "351 B". */
export function formatSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}
/* Project folder by index ("03"), slug ("charger") or folder name ("03-charger"). */
export function project(key) {
  const k = String(key || '').toLowerCase().replace(/^~?\/?projects\//, '');
  const projects = list(resolve('~/projects'));
  return projects.find((d) => d.name === k || d.project?.slug === k || d.project?.index === k || d.project?.index === k.padStart(2, '0')) || null;
}
export const vfs = { root, roles, FILES, TOTAL_BYTES, resolve, pathOf, list, walk, flatten, totals, formatSize, project };
export default vfs;
