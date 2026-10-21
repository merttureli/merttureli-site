/* mission.js — every date, figure and sentence the launch-weekend timeline and
   the flight-event ladder draw.

   Rule: nothing in this file that is not on index.html or projects/charger.html.
   Every entry quotes the sentence it came from in `source`. Anything this file
   computed rather than copied (a season drawn as months, a year inferred from
   the launch it precedes, 75 % of the simulated apogee, points arithmetic)
   carries `derived: true` and says how in `derivation`.

   Dates are ISO strings at the precision the page gives: 'YYYY-MM' when the page
   names a month, 'YYYY-MM-DD' when it names a day. Hours are decimal hours of
   the day (16 = 16:00). Nothing here is a coordinate; the modules compute every
   pixel from these values. */

const INDEX = 'index.html';
const CHARGER = 'projects/charger.html';

/* ---- the month axis ---------------------------------------------------- */
export const AXIS = {
  start: '2023-08',
  end: '2026-09',
  source: `${INDEX}: the earliest role start is "August 2023 to June 2026" (Union College Rocket Team) and the latest role end is "June 2026 to September 2026" (SunThru).`,
};

/* ---- the four roles, as published in the Experience section ------------ */
export const ROLES = [
  {
    id: 'ucrt', org: 'Union College Rocket Team', title: 'Founder and president', place: 'Schenectady, NY',
    start: '2023-08', end: '2026-06',
    sentence: 'Started the team from nothing and built it to competition standard. Led the twelve person competition team as captain, trained new members through build labs, and owned safety compliance for high power launches.',
    source: `${INDEX}: "Founder and president / Union College Rocket Team / Schenectady, NY / August 2023 to June 2026"`,
  },
  {
    id: 'tasecs', org: 'TASECS', title: 'Design engineer and materials intern', place: 'Ankara, Turkey',
    start: '2024-06', end: '2024-08',
    derived: true,
    derivation: 'The page says "Summer 2024" and names no months; the band is drawn June to August 2024.',
    sentence: 'Aerospace thermal management. Designed high efficiency HVAC valve components, ran material stress and fatigue analysis supporting two national fighter and jet trainer programs, and selected aerospace grade materials for printed prototypes, including cooling upgrades for high ambient temperature operation.',
    source: `${INDEX}: "Design engineer and materials intern / TASECS / Ankara, Turkey / Summer 2024"`,
  },
  {
    id: 'modufly', org: 'ModuFly', title: 'Founder', place: 'Schenectady, NY',
    start: '2024-09', end: '2026-01',
    sentence: 'Co-founded a startup around a modular interlocking rocket system for STEM education. Raised $70,000 in seed funding, starting with a $10,000 prize at the SparkLabs competition and then a further $60,000 from private investors.',
    source: `${INDEX}: "Founder / ModuFly / Schenectady, NY / September 2024 to January 2026"`,
  },
  {
    id: 'sunthru', org: 'SunThru', title: 'Engineering intern', place: 'Schenectady, NY',
    start: '2026-06', end: '2026-09',
    sentence: 'SunThru is a Union College spin-out developing silica aerogel inserts that give double pane windows triple pane performance. I worked on both prototypes and production equipment.',
    source: `${INDEX}: "Engineering intern / SunThru / Schenectady, NY / June 2026 to September 2026"`,
  },
];

/* ---- rocket milestones on the month axis -------------------------------- */
const REVIEWS = `${CHARGER}: "A preliminary review is due in December and a critical review in March, both presented live to judges and both scored."`;
export const MILESTONES = [
  {
    id: 'founded', label: 'Team founded', date: '2023-08',
    sentence: 'There was no rocket team at Union College when I started. I founded it, ran it as captain and chief engineer, trained new members through build labs, owned NAR and Tripoli safety compliance for high power launches, and grew the budget by seven hundred percent by writing funding proposals.',
    source: `${CHARGER}: "There was no rocket team at Union College when I started. I founded it, ran it as captain and chief engineer…"; dated by ${INDEX}: "Union College Rocket Team / Schenectady, NY / August 2023 to June 2026"`,
  },
  {
    id: 'pdr', label: 'Preliminary review', date: '2025-12',
    derived: true,
    derivation: 'The page gives the month. The year follows from the April 2026 launch the review precedes.',
    sentence: 'The rules do not accept a friction fit motor mount. There was no retention design at the preliminary review, so I drew a screw-on cap.',
    source: `${REVIEWS} Sentence: "${CHARGER}: The rules do not accept a friction fit motor mount. There was no retention design at the preliminary review, so I drew a screw-on cap."`,
  },
  {
    id: 'cdr', label: 'Critical review', date: '2026-03',
    derived: true,
    derivation: 'The page gives the month. The year follows from the April 2026 launch the review precedes.',
    sentence: 'Radio and antenna trades, a power budget, a software state list, flight simulations, mass with the motor installed. The judges expect all of it written down months before anything flies, and they score it twice.',
    source: `${REVIEWS} Sentence: "${CHARGER}: Radio and antenna trades, a power budget, a software state list, flight simulations, mass with the motor installed…"`,
  },
  {
    id: 'launch', label: 'Launch weekend, Culpeper, Virginia', date: '2026-04',
    sentence: 'Three attempts per team, and the range closes at four in the afternoon. Weather can take the whole weekend, and if it does the awards are decided on the December and March review scores alone.',
    source: `${CHARGER}: "Pad one, Culpeper, Virginia, April 2026" and the brief row "Where / Culpeper, Virginia, April 2026". Sentence: "Three attempts per team, and the range closes at four in the afternoon…"`,
  },
  {
    id: 'published', label: 'Standings published by Union College', date: '2026-04-23',
    sentence: 'Final standings, published by Union College on 23 April 2026 and listed by the competition organizer.',
    source: `${CHARGER}: "Final standings, published by Union College on 23 April 2026 and listed by the competition organizer."`,
  },
];

/* ---- the launch weekend on an hour scale -------------------------------- */
const LAUNCH_DAY = `${CHARGER}: "We got two clean flights away on the first day while the weather held, then put up the qualifying flight before noon on the second."`;
const RANGE_CLOSES = `${CHARGER}: "Three attempts per team, and the range closes at four in the afternoon."`;
export const WEEKEND = {
  date: '2026-04',
  place: 'Culpeper, Virginia',
  source: `${CHARGER}: "Pad one, Culpeper, Virginia, April 2026"`,
  track: {
    startHour: 8,
    endHour: 16,
    note: 'The track runs 08:00 to 16:00. 16:00 is published ("the range closes at four in the afternoon"); 08:00 is the track origin, not a published time. Events sit only where the page gives a time or a bound.',
  },
  days: [
    {
      id: 'day-one', label: 'Day one',
      events: [
        {
          id: 'd1-flights', label: 'Two clean flights', timed: false, from: 8, to: 16,
          derived: true,
          derivation: 'No time of day is published for either flight; the span covers the whole track and is drawn dashed.',
          sentence: 'We got two clean flights away on the first day while the weather held, then put up the qualifying flight before noon on the second.',
          source: LAUNCH_DAY,
        },
        {
          id: 'd1-close', label: 'Range closes', timed: true, at: 16,
          sentence: 'Three attempts per team, and the range closes at four in the afternoon.',
          source: RANGE_CLOSES,
        },
      ],
    },
    {
      id: 'day-two', label: 'Day two',
      events: [
        {
          id: 'd2-qualifying', label: 'Qualifying flight, before noon', timed: 'bound', from: 8, to: 12,
          derived: true,
          derivation: 'The page gives an upper bound, noon. The span runs from the track origin to 12:00; the 12:00 end is the published bound, the span itself is not a time.',
          sentence: 'We got two clean flights away on the first day while the weather held, then put up the qualifying flight before noon on the second.',
          source: LAUNCH_DAY,
        },
        {
          id: 'd2-close', label: 'Range closes', timed: true, at: 16,
          sentence: 'Three attempts per team, and the range closes at four in the afternoon.',
          source: `${RANGE_CLOSES} The closing time is a rule of the event and applies to both days; the second day is published as "put up the qualifying flight before noon on the second".`,
        },
      ],
    },
  ],
};

/* ---- final standings, as listed ----------------------------------------- */
export const STANDINGS = {
  source: `${CHARGER}: "Final standings, published by Union College on 23 April 2026 and listed by the competition organizer." followed by the five numbered rows.`,
  rows: [
    { place: '01', team: 'Union College Rocket Club' },
    { place: '02', team: 'Chantilly Aerospace Club Team 3' },
    { place: '03', team: 'Thomas Jefferson High School' },
    { place: '04', team: 'Spring Grove Area High School Team 2' },
    { place: '05', team: 'George Mason University' },
  ],
};

/* ---- the flight-event ladder ------------------------------------------- */
const WINDOW = `${CHARGER}: "Commercial G motor. Apogee at least seven hundred feet and no more than twelve hundred"`;
const NUMBERS = `${CHARGER}: "An Aerotech G77R-7 at a thrust to weight ratio of 8.17, with a G79 held as backup at 7.40. Simulated apogee 1,033 feet, targeted mid window rather than near either limit. Descent 13.8 feet per second under a 48 inch ripstop nylon canopy, against a limit of 15."`;
const SPEC_ROWS = `${CHARGER}: "Aerotech G77R-7, thrust to weight 8.17, burn 1.25 s" and "Simulated apogee 1,033 ft, descent 13.8 ft/s on a 48 in parachute"`;
const EVENT = `${CHARGER}: "The rocket flies a commercial G motor to between seven hundred and twelve hundred feet, drops the payload at apogee, and at seventy five percent of peak altitude the payload releases the nose cone, which has to reach the ground under fifteen feet per second on its own."`;
const POINTS_INTRO = `${CHARGER}: "The flight is worth two hundred and fifteen points, plus a tenth of a point per foot above seven hundred. Most of it sits on the data path rather than the rocket."`;

const APOGEE_FT = 1033;           // simulated apogee, ft (NUMBERS)
const FLOOR_FT = 700;             // window floor, ft (WINDOW)
const CEILING_FT = 1200;          // window ceiling, ft (WINDOW)
const RELEASE_FRACTION = 0.75;    // "seventy five percent of peak altitude" (EVENT)
const BONUS_PT_PER_FT = 0.1;      // "a tenth of a point per foot above seven hundred" (POINTS_INTRO)

export const LADDER = {
  honesty: 'As published in the case study. Simulated figures, not flight data. No altitude-time curve is published, so none is drawn.',
  scale: { minFt: 0, maxFt: 1300, tickFt: 100, labelFt: 500, note: 'The drawn scale. 1,300 ft keeps the 1,200 ft ceiling label clear of the top edge; it is not a figure from the page.' },
  windowFt: { floor: FLOOR_FT, ceiling: CEILING_FT, source: WINDOW },
  apogeeFt: { value: APOGEE_FT, simulated: true, source: NUMBERS },
  marks: [
    {
      id: 'pad', ft: 0, label: 'Pad', detail: 'Aerotech G77R-7 / T/W 8.17 / burn 1.25 s',
      sentence: 'An Aerotech G77R-7 at a thrust to weight ratio of 8.17, with a G79 held as backup at 7.40.',
      source: `${NUMBERS} Burn time from ${SPEC_ROWS}`,
    },
    {
      id: 'floor', ft: FLOOR_FT, label: 'Window floor', detail: 'at least seven hundred feet',
      sentence: 'Commercial G motor. Apogee at least seven hundred feet and no more than twelve hundred.',
      source: WINDOW,
    },
    {
      id: 'release', ft: Math.round(APOGEE_FT * RELEASE_FRACTION), label: 'Nose cone release', detail: '75 % of peak / must land under 15 ft/s on its own',
      derived: true,
      derivation: `${RELEASE_FRACTION} × ${APOGEE_FT.toLocaleString('en-US')} ft = ${(APOGEE_FT * RELEASE_FRACTION).toFixed(2)} ft, printed as ${Math.round(APOGEE_FT * RELEASE_FRACTION)} ft. The event is published; the altitude is arithmetic on the simulated apogee.`,
      sentence: 'The rocket flies a commercial G motor to between seven hundred and twelve hundred feet, drops the payload at apogee, and at seventy five percent of peak altitude the payload releases the nose cone, which has to reach the ground under fifteen feet per second on its own.',
      source: EVENT,
    },
    {
      id: 'apogee', ft: APOGEE_FT, label: 'Simulated apogee', detail: 'payload deploys at apogee',
      sentence: 'Simulated apogee 1,033 feet, targeted mid window rather than near either limit.',
      source: `${NUMBERS} Payload: ${CHARGER}: "Payload deploys from the rocket at apogee. 5 points"`,
    },
    {
      id: 'ceiling', ft: CEILING_FT, label: 'Window ceiling', detail: 'no more than twelve hundred feet',
      sentence: 'Commercial G motor. Apogee at least seven hundred feet and no more than twelve hundred.',
      source: WINDOW,
    },
  ],
  spans: [
    {
      id: 'descent', fromFt: APOGEE_FT, toFt: 0, label: 'Descent', detail: '13.8 ft/s against a 15 ft/s limit / 48 in parachute',
      sentence: 'Descent 13.8 feet per second under a 48 inch ripstop nylon canopy, against a limit of 15.',
      source: NUMBERS,
    },
    {
      id: 'camera', fromFt: Math.round(APOGEE_FT * RELEASE_FRACTION), toFt: 0, label: 'Camera films the ground', detail: 'from nose cone release until landing',
      derived: true,
      derivation: 'The span starts at the derived release altitude and ends at the ground.',
      sentence: 'With the nose cone gone the payload exposes a camera and films the ground until it lands.',
      source: `${CHARGER}: "With the nose cone gone the payload exposes a camera and films the ground until it lands." and "Camera captures the ground from nose cone release until landing. 50 points"`,
    },
  ],
  points: {
    source: POINTS_INTRO,
    rows: [
      { index: '01', value: 50, label: 'Camera captures the ground from nose cone release until landing', source: `${CHARGER}: "Camera captures the ground from nose cone release until landing. 50 points"` },
      { index: '02', value: 30, label: 'Ground station receives and displays telemetry live, at least ten packets after liftoff', source: `${CHARGER}: "Ground station receives and displays telemetry live, at least ten packets after liftoff. 30 points"` },
      { index: '03', value: 20, each: 4, label: 'Altitude, acceleration, rotation rate and temperature each plotted in real time', source: `${CHARGER}: "Altitude, acceleration, rotation rate and temperature each plotted in real time. 20 points each"` },
      { index: '04', value: 20, label: 'Descent rate calculated and displayed in real time', source: `${CHARGER}: "Descent rate calculated and displayed in real time. 20 points"` },
      { index: '05', value: 20, label: 'Nose cone released at seventy five percent of peak altitude', source: `${CHARGER}: "Nose cone released at seventy five percent of peak altitude. 20 points"` },
      { index: '06', value: 10, extra: 'plus a tenth of a point per foot above seven hundred', label: 'Apogee inside the window', source: `${CHARGER}: "Apogee inside the window. 10 points, plus a tenth of a point per foot above seven hundred"` },
      { index: '07', value: 5, label: 'Payload deploys from the rocket at apogee', source: `${CHARGER}: "Payload deploys from the rocket at apogee. 5 points"` },
    ],
    total: { value: 215, extra: 'plus a tenth of a point per foot above seven hundred', source: POINTS_INTRO },
    bonus: {
      derived: true,
      value: Math.round((APOGEE_FT - FLOOR_FT) * BONUS_PT_PER_FT * 10) / 10,
      label: 'At the simulated apogee',
      derivation: `(${APOGEE_FT.toLocaleString('en-US')} − ${FLOOR_FT}) ft × ${BONUS_PT_PER_FT} pt/ft = ${((APOGEE_FT - FLOOR_FT) * BONUS_PT_PER_FT).toFixed(1)} points, if the flight matched the simulation.`,
      source: POINTS_INTRO,
    },
  },
};

/* Everything above in one list, for the lab readout and the console. */
export function listSources() {
  const out = [];
  out.push({ group: 'axis', id: 'axis', text: `${AXIS.start} → ${AXIS.end}`, derived: false, source: AXIS.source });
  for (const r of ROLES) out.push({ group: 'role', id: r.id, text: `${r.start} – ${r.end} ${r.org}`, derived: !!r.derived, derivation: r.derivation, source: r.source });
  for (const m of MILESTONES) out.push({ group: 'milestone', id: m.id, text: `${m.date} ${m.label}`, derived: !!m.derived, derivation: m.derivation, source: m.source });
  for (const d of WEEKEND.days) for (const e of d.events) out.push({ group: 'weekend', id: e.id, text: `${d.label} / ${e.label}`, derived: !!e.derived, derivation: e.derivation, source: e.source });
  out.push({ group: 'standings', id: 'standings', text: STANDINGS.rows.map(r => `${r.place} ${r.team}`).join(' / '), derived: false, source: STANDINGS.source });
  for (const m of LADDER.marks) out.push({ group: 'ladder', id: m.id, text: `${m.ft.toLocaleString('en-US')} ft ${m.label}`, derived: !!m.derived, derivation: m.derivation, source: m.source });
  for (const s of LADDER.spans) out.push({ group: 'ladder', id: s.id, text: `${s.fromFt.toLocaleString('en-US')} → ${s.toFt} ft ${s.label}`, derived: !!s.derived, derivation: s.derivation, source: s.source });
  for (const p of LADDER.points.rows) out.push({ group: 'points', id: `points-${p.index}`, text: `${p.value}${p.each ? ` × ${p.each}` : ''} ${p.label}`, derived: false, source: p.source });
  out.push({ group: 'points', id: 'points-total', text: `${LADDER.points.total.value} total, ${LADDER.points.total.extra}`, derived: false, source: LADDER.points.total.source });
  out.push({ group: 'points', id: 'points-bonus', text: `+${LADDER.points.bonus.value} ${LADDER.points.bonus.label}`, derived: true, derivation: LADDER.points.bonus.derivation, source: LADDER.points.bonus.source });
  return out;
}
