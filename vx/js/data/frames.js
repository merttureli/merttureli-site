/* frames.js — the asset manifest for the contact sheet.
   Every dimension below was read from the file with ImageMagick
   (`identify -format '%f %w %h'`) on 2026-10-21 and re-verified against stat
   and identify the same day during review (35 of 35 match, byte sizes 11.9 KB
   to 330.7 KB); none of the files carries an EXIF orientation, so the stored
   size is the displayed size. The loupe still trusts the decoded bitmap over
   this table and warns once if they ever disagree. The alt text was written
   from looking at each frame. Paths are relative to THIS file and are resolved
   against import.meta.url so the manifest works from vx/, vx/lab/ or anywhere
   else the module is mounted. */

const PHOTOS = '../../../assets/photos/';
const resolve = (rel) => new URL(PHOTOS + rel, import.meta.url).href;

/* Rolls, in sheet order. `count` is the number of frames the roll contributes. */
export const rolls = [
  { id: 'ACADIA', number: 1, label: 'ACADIA ROAD TRIP', count: 26, dir: 'acadia-road-trip-photography/' },
  { id: 'BEYOND', number: 2, label: 'BEYOND', count: 6, dir: 'beyond/' },
  { id: 'PAD', number: 3, label: 'CHARGER ON THE PAD', count: 3, dir: 'charger-rocket-photography/' },
];

/* "summit-sunset" -> "Summit sunset" */
function titleFrom(file) {
  const stem = file.replace(/\.[a-z0-9]+$/i, '').replace(/-/g, ' ');
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/* [file, w, h, alt, thumbFile?, thumbW?, thumbH?] per roll. The thumb, where one
   exists, is the lighter file the cell shows; src is always the full jpg the loupe
   samples and the viewer opens. */
const ACADIA = [
  ['sunset-poles.jpg', 520, 346, 'Sun setting behind a transmission tower and power lines, a dark treeline below, shot through a car window.'],
  ['overlook-laugh.jpg', 520, 346, 'A person in a dark jacket sitting on granite at an overlook with his tongue out, forest and the sea behind.'],
  ['cove-blue.jpg', 520, 346, 'A wooded headland with a low rock shoreline over blue water under a grey sky.'],
  ['road-yellow.jpg', 520, 346, 'A two-lane road with double yellow lines through trees, a STOP AHEAD marking on the asphalt and a warning sign on the right.'],
  ['sky-wisps.jpg', 520, 346, 'Streaked high clouds over a dark silhouetted treeline.'],
  ['lighthouse-close.jpg', 520, 346, 'A white lighthouse tower rising behind a red-roofed keeper’s house, visitors on the path in front.'],
  ['road-trees.jpg', 520, 346, 'A tree-lined road with double yellow lines, cars ahead and utility poles along the right side.'],
  ['jordan-bubbles.jpg', 520, 346, 'A rippled pond under a cloudy sky with two rounded mountains on the far shore.'],
  ['overlook-sit.jpg', 520, 346, 'A person in a brown Rocky Mountain t-shirt sitting on granite, looking out over forest toward the sea.'],
  ['granite-coast.jpg', 520, 346, 'Granite boulders with tufts of grass at the shore, water behind.'],
  ['ridge-rock.jpg', 520, 346, 'A bare granite ridge dropping toward a lake and forested valley under a bright sky.'],
  ['summit-sunset.jpg', 520, 346, 'A curly-haired person seen from behind on a summit, looking out over lakes and forest toward the sea with the low sun on the water.'],
  ['overlook-look.jpg', 520, 346, 'A person in black sitting on a granite ledge, looking out over forest toward the sea under a cloudy sky.'],
  ['pond-wide.jpg', 520, 346, 'A lake with rounded hills behind, pink wild roses and a rocky shore in the foreground.'],
  ['jordan-shore.jpg', 520, 346, 'A rocky shoreline with people on the rocks and two rounded mountains across the lake.'],
  ['forest-path.jpg', 520, 346, 'A dead, hollowed spruce trunk in a mossy conifer forest with fallen branches.'],
  ['pine-trail.jpg', 520, 346, 'A trail through spruce forest past large glacial boulders, a blue blaze on the near tree.'],
  ['lighthouse.jpg', 520, 346, 'A white lighthouse and red-roofed keeper’s house above the sea, shrubs in the foreground.'],
  ['sunset-lake.jpg', 520, 780, 'Sunset over layered clouds with the sun reflecting on a distant bay, a lake and dark treeline in the foreground.'],
  ['summit-crew.jpg', 520, 346, 'Three friends on a summit at golden hour, one taking the photo, forest and sea behind.'],
  ['self-mirror.jpg', 520, 346, 'A self-portrait in a car’s side mirror holding a compact camera, a passenger smiling in the back seat.'],
  ['sea-cliff.jpg', 520, 780, 'A dark layered rock cliff dropping into blue sea under a pale sky.'],
  ['summit-sun.jpg', 520, 346, 'Two people on a bare granite summit in bright sun, one crouching to take a photo, lakes and forest below.'],
  ['road-open.jpg', 520, 346, 'A straight two-lane highway running into the distance between trees, two cars ahead, shot through the windshield.'],
  ['bridge-rail.jpg', 520, 346, 'Boats on a grey bay seen through the rails of a bridge.'],
  ['stand-cliff.jpg', 520, 780, 'A person in an orange t-shirt standing on a granite block, looking out over scrub to a bay under a clear blue sky.'],
];
const BEYOND = [
  ['stargazers.jpg', 1280, 1600, 'Two people in silhouette sitting under a starry sky with the Milky Way, the sea behind them.'],
  ['moon-pines.jpg', 1280, 1600, 'A crescent moon beside soft-focus spruce branches against a warm dusk sky.', 'gallery/moon-pines-thumb.webp', 512, 640],
  ['overlook.jpg', 1280, 1600, 'The back of a curly-haired head, looking out over a green forested valley toward a bay.'],
  ['lake-framed.jpg', 1280, 1600, 'A lake and two rounded mountains framed by dark spruce branches, boulders in the foreground.', 'gallery/lake-framed-thumb.webp', 512, 640],
  ['rosa-rugosa.jpg', 1280, 1600, 'Pink beach roses in sharp focus in front of a soft-focus lake and rounded hills.', 'gallery/rosa-rugosa-thumb.webp', 512, 640],
  ['lighthouse.jpg', 1280, 1600, 'A white lighthouse with a black lantern and a red-roofed house, seen through bare branches above the sea.', 'gallery/lighthouse-thumb.webp', 512, 640],
];
const PAD = [
  ['charger-pad-tall.jpg', 520, 693, 'CHARGER in its orange livery on the launch rail, seen from the fin end looking up the rocket, sponsor banners behind.'],
  ['charger-pad-close.jpg', 520, 693, 'CHARGER standing on pad one in a green field between sponsor banners, a number 1 pad marker beside it.'],
  ['charger-pad-band.jpg', 1920, 823, 'CHARGER vertical on pad one at Battle of the Rockets, Culpeper, Virginia, the CHARGER / UCRC / 2026 lettering readable, banners either side.'],
];

/* The roll counts the sheet prints are the lists' real lengths, so a frame added or removed above can never leave a stale "26 FRAMES". */
const LISTS = { ACADIA, BEYOND, PAD };
for (const r of rolls) {
  if (r.count !== LISTS[r.id].length) console.warn(`[frames] roll ${r.id} declares ${r.count} frames, the list has ${LISTS[r.id].length}`);
  r.count = LISTS[r.id].length;
}

function build(roll, list) {
  return list.map(([file, w, h, alt, thumbFile, tw, th], i) => ({
    roll: roll.id,
    rollNumber: roll.number,
    rollLabel: roll.label,
    rollCount: roll.count,
    rollIndex: i + 1,               // 1-based position inside the roll
    index: 0,                       // 1-based position on the sheet, filled below
    file,
    title: titleFrom(file),
    alt,
    w, h,                           // native pixels of src, from identify
    src: resolve(roll.dir + file),
    thumb: resolve(roll.dir + (thumbFile || file)),
    tw: tw || w, th: th || h,       // pixels of the thumb file, for <img width height>
  }));
}

export const frames = [
  ...build(rolls[0], ACADIA),
  ...build(rolls[1], BEYOND),
  ...build(rolls[2], PAD),
];
frames.forEach((f, i) => { f.index = i + 1; });

export const CELLS = 36;            // a 36-exposure sheet: cell 00 is the leader
export default frames;
