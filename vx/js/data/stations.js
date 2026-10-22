/* The eight stops of the stack walk, nose to tail.
   Grouping follows ARCHITECTURE.md section 5. Every y is the mean of the member
   parts' bounds centres from assembly.json, in metres (bounds are millimetres,
   the explorer scales by 0.001). Azimuth is 35 deg per stop so the camera
   corkscrews down the rocket; it is measured from the livery's front angle, the
   side the CHARGER lettering faces. Reference envelopes 3 and 4 are never drawn.
   Part ids are the explorer's ids (assembly.json); labels come from
   part-stories.js at runtime, the station label is the stop's own name.
   Body tubes 1 and 2 are listed with their stations so the callouts can name
   them, but the renderer keeps them translucent so the interior reads. */
export const STATIONS = [
  { index: 0, id: 'nose',      label: 'Nose cone',  partIds: [0],                           y:  0.4547, azimuth: 0 },
  { index: 1, id: 'camera',    label: 'Camera',     partIds: [17, 15, 14],                  y:  0.3388, azimuth: 35 },
  { index: 2, id: 'pcb',       label: 'PCB stack',  partIds: [23, 24, 25, 1],               y:  0.1984, azimuth: 70 },
  { index: 3, id: 'battery',   label: 'Battery',    partIds: [13, 10],                      y: -0.0464, azimuth: 105 },
  { index: 4, id: 'coupler',   label: 'Coupler',    partIds: [21, 27, 28, 29, 16, 20, 22],  y: -0.0842, azimuth: 140 },
  { index: 5, id: 'altimeter', label: 'Altimeter',  partIds: [26, 12, 2],                   y: -0.3981, azimuth: 175 },
  { index: 6, id: 'motor',     label: 'Motor',      partIds: [11, 5, 18, 6, 7, 8, 9],       y: -0.5338, azimuth: 210 },
  { index: 7, id: 'cap',       label: 'Screw cap',  partIds: [19],                          y: -0.5912, azimuth: 245 },
];

/* Parts whose centre lies within this many metres of the current station's y
   read as context (solid, half opacity); everything further away is edges only. */
export const BAND_M = 0.08;
export const AZIMUTH_STEP_DEG = 35;
/* Ids that are never drawn (earlier assembly envelopes kept in the file for comparison). */
export const HIDDEN_IDS = [3, 4];
/* The exterior tubes stay translucent during the walk so what is inside them reads. */
export const TUBE_IDS = [1, 2];

/* Map part id -> array of station indexes that list it (a part can appear in one station only today,
   but the structure allows more). */
export function stationsOfParts(stations = STATIONS) {
  const map = new Map();
  for (const s of stations) for (const id of s.partIds) {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(s.index);
  }
  return map;
}
export function stationOfPart(id, stations = STATIONS) {
  return stations.find(s => s.partIds.includes(id)) || null;
}
export default STATIONS;
