/* LATTICE: a D2Q9 lattice Boltzmann engine on three.js render targets.
   FIELD.md section 4 is the contract; section 2 holds the sign conventions.

   Model (lattice units: one cell, one step; c_s^2 = 1/3; STD, Chen and Doolen 1998)
     BGK collision, Smagorinsky subgrid viscosity C = 0.12 (STD, Hou, Sterling,
     Chen and Doolen 1996), nu = (tau0 - 0.5) / 3. Single pull pass: gather,
     bounce-back, collide, write, into three RGBA32F textures through one MRT
     draw (WebGLRenderTarget count 3, NearestFilter, no depth); without float32
     render targets RGBA16F (stats.precision says which). Both paths store and
     compute f_i - w_i (shaders.js storage note; fields.storage 'f - w').
     Stabilisers, documented because the contract's model alone did not pass its
     own gate (see MACH_K and STARTUP_TAU below):
       regularised collision (STD, Latt and Chopard 2006), on by default: the
         non-equilibrium part is projected on its second-order moment before
         relaxing, which removes the ghost modes that grow at tau0 near 0.504;
       a local viscosity floor where |u| > 0.15 (EST), off elsewhere;
       a start-up viscosity that eases from tau 0.75 to tau0 over 2,000 steps
         after a reset (EST).
     Walls: halfway bounce-back. Body rate (setBodyRate, see BODY RATE below): by
     default in the body frame (walls at rest, the free stream at the edges turning
     with -omega x (r - r_cg), Coriolis, centrifugal and Euler accelerations by Guo
     forcing, STD, Guo, Zheng and Shi 2002); mode 'wall' keeps Ladd's moving-wall
     term (STD, Ladd 1994), u_w = omega x (r - r_cg), for a spinning cylinder.
     Outer edges: equilibrium at rho 1 and the local free stream where it enters;
     elsewhere zero-gradient velocity with rho held at 1 and the neighbour's
     non-equilibrium part projected on its second-order Hermite moment (STD, Latt,
     Chopard, Malaspinas, Deville and Michler 2008). Option inflowNeq
     (setStabilisers): inflow cells take u_in with the inward neighbour's density and
     projected non-equilibrium part (Guo, Zheng and Shi 2002); see EDGES.
     Force: momentum exchange per wall link (Galilean-corrected, STD, Wen et al.
     2014), accumulated per cell in the spare channels of the third texture,
     reduced by 2 x 2 halving passes to 1 x 1 and read back with
     renderer.readRenderTargetPixelsAsync at 10 Hz. Never a synchronous read.
     A readback issued before reset(), setTier() or setSection() is dropped when it
     lands (generation counter), so lattice.force always belongs to the current
     grid and section.
     Dye: RG16F at twice the grid (once at tier 1), semi-Lagrangian, smoke rake
     along the inflow direction. Views composited into an RGBA8 texture
     (lattice.texture) with alpha 0 inside the solid.

   Numbers (tags as in FIELD.md):
     grids and steps per frame by tier, TIERS below (contract)
     u_in = clamp(0.03 + 0.05 V / 70 m/s, 0.03, 0.10) lattice units is what the page
       asks for (contract, inflowFor(V); the 0.03 floor keeps the smoke moving on
       the pad); the flow runs at min(u_in, U_CAP 0.05), with the body rate scaled
       alike so the reduced rate q D / V is kept (setInflow, U_CAP for the evidence)
     tau0 = 0.5 + 3 u_ref D_cells / Re with Re 1500 at u_ref 0.05, the same tau0 as
       the contract's Re 3000 at 0.10: Re = u_in D_cells / nu then runs from 900 on
       the pad to 1500 at the cap (SIM). With the lab rocket (D 38.9 cells at tier 3)
       tau0 = 0.50389; with the page section at tier 1 (D 19.46) 0.50195.
     The real rocket at 70 m/s is near Re 3e5 (D 0.068 m CAD, nu 1.5e-5 m^2/s STD
       sea-level air); the lattice is a Reynolds-scaled model and says so.

   EDGES AND WHAT c_n, c_m AND THE CENTRE OF PRESSURE MEAN (SIM, measured on the lab's
   rocket stand-in at 512 x 160, u_in 0.10, 3,000 steps, SwiftShader, before the fix phase
   of 2026-10-23 brought the speed cap, the regularised outflow and the body frame; the
   mechanism is unchanged).
     Inflow edge. An inflow cell set to the equilibrium at rho 1 is a pressure anchor, not
     a velocity inlet: it admits about u_in - (rho_inside - 1) / 3 per unit length, so a
     pressure rise behind it lowers the inflow that arrives (validation tracks L1, D3, and
     L2, defect 4: 95 to 97 percent of u_in one cell inside at 5 to 10 deg on the page
     section and about half the imposed cross-flow; 87 percent in a walled channel with a
     1.5 percent pressure rise). c_n, c_m and the Reynolds number are referred to u_in
     and the nominal alpha, so at 5 and 10 deg they read about 7 and 11 percent low
     against the dynamic pressure that arrives. Where the inflow speed must be exact
     (a channel benchmark) use inflowNeq, which lets rho float (track L2: 100.8 percent).
     Confinement. The edges sit 0.16 cols from a body 0.66 cols long, and at incidence
     two of them feed the cross-flow u_in sin(alpha) along their whole length. The body
     splits the domain, so the fluid fed in under it has to leave around its ends: the
     windward half becomes a plenum above stagnation pressure. One cell inside the
     inflow edge C_p is 0.88 at 5 deg, 1.65 at 10 deg and 2.50 at 15 deg, the edge
     cell itself holds 0, and only half the imposed cross-flow gets in (u_y 0.0091
     against 0.0174 at 10 deg). c_n is inflated (34 at 10 deg; a 2D flat plate of the
     same length gives 2 pi sin(alpha) L / D = 19, STD thin-airfoil theory). The
     pressure view saturates over the windward half above about 5 deg.
     What does not cure it here: inflow cells at the neighbour's density (option
     inflowNeq) remove the edge jump but let the plenum rise further (C_p 3.3 to 3.9
     under the body at 10 deg, c_n 100); a taller domain with the body at 0.40 cols and
     rows = cols / 2 (blockage 0.8 sin alpha) still holds C_p 1.1 at the windward edge
     at 15 deg with that option; a point-vortex far-field correction (Thomas and Salas
     1986) and pressure-anchored side inlets were tried and failed (unstable feedback;
     an inverted windward pressure). The interference scales with chord over domain
     height (about 4 here), so the cure is a domain several chords tall, which the
     tier budget does not allow; the grid and the body's 0.66-cols layout are FIELD 4
     and 5, shared with vx/js/geom.
     2D section. Even unconfined, a 2D section through the pitch plane is an
     infinitely long extrusion of the outline: aerodynamically a slender airfoil of
     chord L (17.4 D) with the fins as a thickening near its trailing edge. It carries
     lift along its whole chord with the centre of pressure near the quarter chord
     (thin-airfoil theory, STD, Anderson, Fundamentals of Aerodynamics, ch. 4), while
     the 3D body of revolution carries its body lift on the nose and the fins carry
     the rest (Barrowman 1967). The lattice's centre of pressure therefore sits ahead
     of Barrowman's, and c_m about the PAGE CG is positive (destabilising) at every
     alpha once the circulation has built up: +44 at 5 deg, +66 at 10 deg and +82 at
     15 deg here, +33 at 5 deg in the taller domain above; negative only in the first
     few hundred steps after a reset, before the circulation forms. So c_n, c_m and
     xcpCells are 2D section values for the flow picture, not the 3D rocket's; above
     about 5 deg they are dominated by the confinement as well. A caller that lets the
     lattice fly the rocket shows what a 2D section would do: it diverges.
     Measured (validation track L3, section 5, page CAD section, 512 x 160 and 1024 x 320):
     the section's centre of pressure sits 15 to 18 in from the nose at 2 to 15 deg against
     Barrowman's 29 to 33 in, ahead of the 22 in CG at every angle, grid and domain size
     (15.6 in at 5 deg in a 1024 x 1024 domain); the fin increment acts near 18.7 in, not at
     the fins, with 1 percent of its force on the fin links; used as 3D coefficients the
     section's C_N is 21 times Barrowman's at 5 deg; slender-body theory for the body plus a
     Diederich finite-wing factor on the fin increment still puts the centre of pressure at
     15.6 in. In the page's domain (0.47 rocket lengths tall) C_N at 5 to 15 deg is about
     1.7 times its value in a domain 3.2 times taller. These numbers are not a cross-check
     of Barrowman; they describe the 2D flow picture.

   FORCES: WHAT A 2D SECTION CANNOT MEASURE, AND WHEN THE NUMBERS ARE SHOWN
     Fin links (measured, not shipped). A review asked for the fin links' share as a
     cross-check a section could make. An experimental fin-weighted reduction measured it
     (SIM, SwiftShader): on the page's CAD section at tier 1 the fin links carried c_n -3.8
     at 5 deg and -4.8 at 15 deg, toward the windward side, with c_m +32 and +41
     (destabilising); on the lab's stand-in at 10 deg, +0.1 to +1.6 in the contract domain
     and about 0 (-0.5 to +0.8) in a domain four times taller. The fins sit near the
     trailing edge of a section that lifts like an airfoil, in the downwash of its own
     circulation, so not even their share reproduces Barrowman's restoring fin force; and
     their centre of pressure lands on the fin chord by construction (44.7 in from the nose
     against Barrowman's 43.64 in), which measures nothing. The reduction was removed. A
     pitch-plane section gives the flow and the pressure on the fins, not a stability
     number.
     Body rate. setBodyRate's target is approached at OMEGA_SLEW_U of wall speed per step.
     With the moving-wall coupling the engine used before the fix phase, a step change (a
     flick) at full speed rang the domain's acoustic modes for 700 steps and more (c_m
     swinging -140 to +290 about a base of +50, the centre of pressure leaving the body;
     tier 1, hold at 5 deg, SIM); with the ramp the same flicks moved c_m without the
     ringing. The ramp stays for the body frame, whose rotating edge stream would
     otherwise jump as well; see BODY RATE.
     A jump above OMEGA_JUMP_U also marks the forces undeveloped until the rate has
     arrived and one acoustic crossing of the domain length (cols / c_s steps,
     SETTLE_CROSSINGS) has passed.
     Bounds. A centre of pressure outside the body's own columns, nose tip to tail, is
     reported as null.
     Step rate. stats.stepsPerSecond is the completed-work rate between the force readbacks
     that resolved in the last RATE_SPAN_MS (stats.rateSource 'completed'), else the steps
     issued in the 1 Hz window ('issued'), never for the first window after the stats
     window (re)opens, and null until one of them exists.

   BODY RATE (setBodyRate; validation track L3, defect 1, and the fix phase of 2026-10-23, SIM)
     Before the fix the rate was a moving-wall velocity on the static mask (Ladd's term).
     Where that velocity is normal to the wall, along most of a long body pitching about
     its CG, it acts as transpiration, so a flat plate given a uniform wall velocity lifted
     2.0 to 2.5 times as much as the same plate at the equivalent incidence, and the
     pitch-rate lift of a plate, (dc_l/dQ) / (dc_l/dalpha), read 1.19 with the pivot at the
     quarter chord and 0.64 at mid-chord against 0.5 and 0.25 from thin-airfoil theory
     (STD, Anderson, Fundamentals of Aerodynamics, ch. 4). The default is now the body frame
     (shaders.js STEP_FRAG): walls at rest, the edges at u_in - omega x (r - r_cg), and the
     Coriolis, centrifugal, Euler and frame accelerations by Guo forcing. Measured on the CPU
     transcription of the step, which matches the engine on SwiftShader to 4e-5 in the force
     coefficients over 2,000 steps of a pitching plate:
       an empty domain turning at 1e-4 rad per step keeps the rigid rotation plus the
         uniform stream to 0.9 percent of u_in with |rho - 1| under 5e-5 (without the frame
         acceleration term the interior departs by 29 percent of u_in);
       plate, chord 48, 12 chords tall, Re 1000: (dc_l/dQ) / (dc_l/dalpha) 0.38 (pivot c/4)
         and 0.125 (c/2) against 0.5 and 0.25; dc_l/dQ falls with the pivot at 5.26 per chord
         against the static slope 5.18 (thin-airfoil theory: equal), so the remaining error
         is a shortfall of 0.64 in dc_l/dQ that does not depend on the pivot. It does not
         move with the grid (chord 32: 0.379, on the engine itself under SwiftShader as on
         the transcription), the Reynolds number (Re 3000: 0.375) or the domain (24 chords
         tall, 6 upstream: 0.363), so it is not resolution or confinement; it is not
         explained here;
       a cylinder spinning in still fluid gives the same torque in the body frame as with
         the moving wall, which is exact for it (0.08452 against 0.08410, 0.5 percent; 2D
         theory 4 pi mu R^2 Omega = 0.0804).
     Mode 'wall' keeps the moving wall for a spinning cylinder, where the wall moves along
     itself (Magnus lift within 6 percent of Mittal and Kumar 2003 at spin 0.5 to 1.5, track
     L3). On the page section the rate response is a 2D section's: at alpha 5 deg
     -dC_m/d(qD/V) is 1,380 (u_in 0.10) and 2,010 (u_in 0.05) on the page grid and 730 in a
     domain 3.2 times taller, against 24 for a 2D thin plate the length of the rocket pitching
     about the same CG and Barrowman's C_mq 445 for the 3D rocket. The thin-plate value is a
     near cancellation that the plate's 25 percent pitch-rate shortfall above breaks, and the
     section's length (17.4 D) multiplies that by (L / D)^3; so it is not a damping derivative
     of the rocket and must not feed the flight (the lab's LATTICE FLIES IT shows what such a
     section would do).

   DEVELOPED (force.developed, stats.developed, force.mean)
     Forces count as developed once the start-up viscosity has eased back (STARTUP_STEPS),
     the inflow and the body rate have reached their targets, a body-rate jump has settled
     (SETTLE_CROSSINGS) and the free stream has travelled DEV_PASSES = 1.5 body lengths since
     the last reset or inflow jump (validation track L2, section 9: 2,000 steps was 0.6 chord
     passes for the page section at u_in 0.10, when its one-pass C_m mean was still 31 to 53
     percent below its later mean; after 1.5 passes it was within 0 to 10 percent). At the
     page grids that is 10,100 steps at tier 1 and 20,300 at tier 3 at the 0.05 cap, about
     1.7 times longer at the 0.03 floor. force.mean holds the means over the last chord
     pass of developed windows.

   Grid frame: +x from nose to tail (column 0 upstream of the nose), +y the body's
   +x side; inflow direction (cos alpha, sin alpha) with alpha from section 2.
   Mask rows: row 0 is grid y = 0 (bottom of the texture), index row * cols + col.
   Moments (force.mz, force.cm) are positive in the flight convention (positive
   raises theta), so a restoring moment at positive alpha reads negative and
   xcpCells = xcg - mz / fy (contract). xcpCells is null until the flow is developed
   (force.developed, see devRun), below |alpha| 1 deg or |c_n| 1 (XCP_MIN_ALPHA,
   XCP_MIN_CN) and outside the body's columns. Grid: createLattice(renderer, {cols,
   rows, tier}) takes cols x rows as the grid at that tier and scales it by the tier
   table on setTier (fixedGrid: true pins it); without cols and rows the grid is
   TIERS[tier].

   The engine never listens to the pointer and owns no animation loop: the
   caller drives frame(dt) from its own requestAnimationFrame. Each frame() that runs
   reports governor.work(tier), so the governor steps the tier back up only on frames
   the lattice actually ran in (core/governor.js, Work), never on an idle page while
   the stage is off screen or the flow is paused. */
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { governor } from '../core/governor.js';
import * as S from './shaders.js';

/* Tier table (FIELD.md section 4). rake: smoke lines across the domain height. */
export const TIERS = Object.freeze({
  3: Object.freeze({ cols: 1024, rows: 320, steps: 24, dyeScale: 2, rake: 28 }),
  2: Object.freeze({ cols: 768, rows: 240, steps: 16, dyeScale: 2, rake: 22 }),
  1: Object.freeze({ cols: 512, rows: 160, steps: 8, dyeScale: 1, rake: 16 }),
  0: Object.freeze({ cols: 0, rows: 0, steps: 0, dyeScale: 0, rake: 0 }),
});
export const VIEWS = Object.freeze(['smoke', 'pressure', 'vorticity', 'speed']);
export const SMAGORINSKY_C = 0.12;   /* STD, Hou et al. 1996 (contract value) */
export const RE_TARGET = 1500;       /* lattice Reynolds number at U_REF: the same tau0 as the contract's Re 3000 at
                                        u_in 0.10 (tau0 = 0.5 + 3 u D / Re), now at the top speed that runs (U_CAP) */
export const U_REF = 0.05;           /* lattice units, the top of the inflow range that runs (= U_CAP) */
export const U_CAP = 0.05;           /* lattice units: the highest inflow speed that runs. The contract's range goes to
                                        0.10 (FIELD 4), but at 0.10 the flow passes the nose shoulder at local Mach
                                        0.3 and more and grid-scale noise of 15 percent of u_in fills the domain at the
                                        page's tau0 (validation track L1, D2: wall cells at 1.3 to 1.7 nu0); at 0.05 the
                                        local Mach number stays under 0.18 and the noise is gone (wall cells 1.19 nu0).
                                        A faster request runs at the cap with the body rate scaled alike (setInflow). */
export const ALPHA_MAX = 35 * Math.PI / 180;   /* rad, edge treatment holds to here (contract) */
export const MACH_FLOOR = 2;         /* default slope of the local speed floor, tau per lattice unit (see MACH_K) */

const FRAME_BUDGET_MS = 48;   /* ms; CPU issue time per frame before steps are shed (contract), also the frame
                                 interval above which the step count backs off (a GPU that cannot keep up) */
const SHED_DOWN = 0.75;       /* step-scale factor per frame while the frame interval is over budget */
const SHED_UP = 1.08;         /* recovery factor per frame once the interval is under 60 percent of budget */
const READ_PERIOD_MS = 100;   /* force readback at 10 Hz (contract) */
const STATS_PERIOD_MS = 1000; /* lattice:stats at 1 Hz (contract) */
const REF_FRAME_S = 1 / 60;   /* s; the tier's steps are per 60 Hz frame, a faster display runs fewer per frame */
const U_MAX = 0.12;           /* lattice units; above this the lattice Mach number passes 0.2 */
const RAKE_DECAY = 1.0;       /* rake smoke e-folds over this many domain widths of freestream travel */
const WALL_DECAY = 0.35;      /* wall dye e-folds over this many domain widths */
const WALL_DYE = 0.9;         /* wall dye level held in the cells that touch the solid */
const XCP_MIN_CN = 1.0;       /* below this |c_n| the centre of pressure is undefined (returns null) */
const XCP_MIN_ALPHA = 1 * Math.PI / 180;   /* rad; below this |alpha| as well. Measured on the page's CAD section
                                 at tier 1 (512 x 160, u_in 0.03, alpha 0, 2,000 to 4,300 steps, SIM): a steady
                                 c_n of -0.12 to -0.40 and c_m of +0.5 to +0.9 from the rail buttons, which make
                                 the mask asymmetric, with xcp wandering from 300 to 410 cells. At alpha 5 the same
                                 section gives c_n 24.5, so 1 deg (about 5) keeps that offset under a few percent.
                                 A 0/0 centre of pressure is reported as null, never as a number. */
const PAUSE_MS = 1000;        /* ms: an interval longer than this and than 4 frame averages, after one that was not, is a
                                 pause in framing (stage off screen, tab hidden), unless the caller says so first
                                 (frame(dt, {resumed: true})). Two long intervals in a row are slow frames (software GL)
                                 and count: the frame average, the step shedding and the 1 Hz stats all see them. */
const EMA_CAP_MS = 4000;      /* ms: the longest interval the frame average takes in, so one stall cannot hold the
                                 step count down for long */
const RATE_SPAN_MS = 2500;    /* ms: stepsPerSecond is the work completed between the force readbacks that resolved in
                                 this span (lattice steps at issue over resolve time: a fenced rate on any device) */
const RATE_MIN_SPAN_MS = 800; /* ms: and only once those readbacks span at least this; null until then */
const OMEGA_SLEW_U = 2e-5;    /* lattice units of wall speed at the far end of the body, per step: setBodyRate's target is
                                 approached at this rate (EST; about 1.1e-7 rad per step per step at tier 1), so a flick
                                 arrives as a ramp instead of an acoustic pulse, as the inflow does (SLEW) */
const OMEGA_JUMP_U = 2e-3;    /* lattice units of wall speed: a setBodyRate change larger than this (a flick) restarts the
                                 settling below; the page's per-frame changes in flight are under 2e-4 */
const OMEGA_ARRIVED_U = 5e-4; /* lattice units of wall speed: the body rate counts as arrived within this of its target */
const RIM_D = 0.06;           /* the views' ink rim around the solid: this many body diameters wide (cell texture b) */
const RIM_MIN = 1, RIM_MAX = 3;   /* cells, its narrowest and widest */
const DEV_PASSES = 1.5;       /* forces count as developed only after the free stream has travelled this many body
                                 lengths since the last reset or inflow jump (validation track L2, section 9: the
                                 rocket stand-in's one-pass means settle after about 1.5 chord passes; a cylinder's
                                 steady drag needs 12 to 51 D/u, its shedding 38 to 53 D/u) */
const SETTLE_CROSSINGS = 1;   /* after a body-rate jump the forces count as developed again only once the rate has
                                 arrived and this many acoustic crossings of the domain length (cols / c_s steps) have
                                 passed (EST, see FORCES in the header) */
const SLEW = 1e-4;            /* lattice units per step per component: the boundary inflow approaches the setInflow
                                 target at this rate, so a jump in alpha or speed arrives as a ramp instead of a
                                 pressure wave (EST; 0.03 to 0.10 takes 700 steps, the page's boost needs about 3e-5) */
const ARRIVED = 5 * SLEW;     /* the boundary inflow counts as arrived within this of its target, per component */
const STARTUP_TAU = 0.75;     /* relaxation time right after a reset (nu 0.083) */
const STARTUP_STEPS = 2000;   /* steps over which it eases back to tau0 (EST). A reset starts the tunnel already
                                 running (uniform inflow, the impulsive start of a model dropped into the stream);
                                 the extra viscosity damps the pressure pulse the walls throw off in the first steps,
                                 which at tau0 = 0.504 would otherwise grow. Starting from still air instead sends a
                                 plane wave of rho - 1 = u / c_s (0.17 at u 0.10) through the domain. */
const MACH_U = 0.15;          /* lattice units (local Mach 0.26): above this local speed the viscosity floor rises */
const MACH_K = MACH_FLOOR;    /* tau per lattice unit of speed above MACH_U (EST): at |u| 0.30, tau >= 0.80. */
/* Stability gate history (rocket stand-in, tier 3 grid, alpha 15 deg, u_in 0.10, SwiftShader, SIM):
     plain BGK + Smagorinsky, contract edges (copy outflow): blew up at Re 3000, 2000, 1000 and 500
       within 2,000 to 4,500 steps; regularised alone at Re 3000: 2,500 steps;
     with the final edges and no stabiliser: Re 3000, 1500, 750 and 375 all blew up within 8,000 steps;
     regularised + speed floor: 5,000 steps clean, then the copy outflow let mass pile up (rho - 1
       reached 0.2), so outflow edges hold rho at 1;
     + positivity + absorbing edges: 14,000 steps, then backflow through the top outflow edge;
     + backflow removal: 20,000 steps clean, max |u| 0.355, max |rho - 1| 0.159.
   Fix phase (2026-10-23; CPU transcription of the step, which matches the engine to 1e-3, SIM): with the
   regularised outflow edge, the body frame and the shifted storage, the gate at the regime the page now
   runs (u_in 0.05 at the cap, Re 1500, tau0 0.50389) is clean for 20,000 steps with every stabiliser on
   (max |u| 0.185, max |rho - 1| 0.069) and also with plain BGK + Smagorinsky and every stabiliser off
   (0.255, 0.083); the old setting (u_in 0.10, Re 3000) is clean with the stabilisers (0.279, 0.126). The
   stabilisers stay on by default: at Re 1500 the regularised collision costs a flat plate 4 percent of
   its lift slope against BGK + Smagorinsky (5.09 against 5.30 per rad, chord 48; 10 percent at Re 3000).
   The cylinder gate (Re 100, tau0 0.536, |u| < 0.07) runs with every stabiliser on: the regularised
   collision touches only the non-hydrodynamic modes, the speed floor never engages below |u| 0.15,
   and the 10-cell absorbing edges start 73 cells or more from the cylinder. */
const SPONGE_FRAC = 0.05;     /* absorbing layer width as a fraction of the rows (16 cells at tier 3), EST */
const SPONGE_MIN = 8;         /* cells, the narrowest layer */
const SPONGE_TAU = 0.9;       /* relaxation time at the edge itself (nu 0.13), EST */
const SELFTEST_TOL = 2e-3;    /* tolerance on f1 after one step of uniform flow (half float carries 1e-3 of 1) */
const SELFTEST_U = 0.08;      /* lattice units: the self-test's uniform flow along +x. f1 - w1 is then 0.029, so a
                                 target that never renders (reads 0) fails on either path (f0 - 4/9 at u 0.05 was
                                 -0.0017, inside the tolerance) */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Inflow speed in lattice units for an airspeed in m/s (contract formula). */
export function inflowFor(V) { return clamp(0.03 + 0.05 * ((Number(V) || 0) / 70), 0.03, 0.10); }
/* Molecular relaxation time for a lattice Reynolds number at reference speed uRef. */
export function tauFor(re, uRef, dCells) { return 0.5 + 3 * uRef * dCells / Math.max(1, re); }
/* Pitch rate q (rad/s, flight convention) to the body rate setBodyRate expects,
   matching the reduced rate q D / V between flight and lattice. Returns 0 below
   2 m/s, where the inflow floor makes the mapping meaningless. */
export function pitchRateToLattice(q, V, dMeters, dCells, uIn) {
  if (!(V > 2) || !(dCells > 0)) return 0;
  return q * dMeters * uIn / (V * dCells);
}

/* IEEE half to float, for the RGBA16F readback path. */
function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

export function createLattice(renderer, options = {}) {
  /* {cols, rows} (contract, FIELD 4): the grid at the starting tier. The other tiers keep its
     proportions and scale it by the tier table, so setTier() still swaps the grid (the page
     passes TIERS[tier] and gets TIERS[t] after a change). {fixedGrid: true} keeps exactly
     this grid at every tier; the validation gates use one grid and never change tier. */
  const customGrid = Number(options.cols) > 0 && Number(options.rows) > 0;
  const fixedGrid = customGrid && options.fixedGrid === true;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tier = Number.isInteger(options.tier) ? clamp(options.tier, 0, 3) : (reducedMotion ? 0 : governor.tier);
  const baseTier = tier >= 1 ? tier : 3;   /* the tier the custom grid belongs to (tier 0 starts at the top grid) */

  const stats = {
    grid: [0, 0], dye: [0, 0], tier, stepsPerFrame: 0, stepsPerSecond: null, msPerFrame: 0, issueMs: 0, developed: false,
    precision: 'none', re: 0, tau0: 0, tauNow: 0, nu: 0, uIn: 0.05, uNow: 0, alpha: 0, alphaDeg: 0, dCells: 0,
    steps: 0, shed: 0, stepScale: 1, nanResets: 0, rateSource: null, view: 'smoke', smagorinsky: SMAGORINSKY_C, regularised: options.regularised !== false, machK: Number.isFinite(options.machK) ? options.machK : MACH_K,
    sponge: options.sponge !== false, positive: options.positive !== false, inflowNeq: options.inflowNeq === true,
    speedCap: Number.isFinite(options.speedCap) ? clamp(options.speedCap, 0.005, U_MAX) : U_CAP, uRequested: 0.05, bodyRate: 'frame', travelPasses: 0, omega: 0, omegaTarget: 0,
    fallback: null, lost: false, forceReadback: true,
  };
  const api = {
    ready: null, fallback: null, stats, texture: null, force: null, stepsPerFrame: null,
    get tier() { return tier; },
    get grid() { return { cols: grid.cols, rows: grid.rows, dyeScale: grid.dyeScale }; },
    get fields() { return fieldsView(); },
    setSection, setInflow, setBodyRate, setView, setTier, frame, step, render, reset, sampleForce, check, sync,
    setViscosity, setSmagorinsky, setRegularised, setMachFloor, setStabilisers, resources, destroy,
  };
  const noop = () => {};
  const grid = { cols: 0, rows: 0, dyeScale: 2, rake: 28 };
  let destroyed = false;
  let fA = null, fB = null, macro = null, dyeA = null, dyeB = null, view = null, chain = [];
  let cellTex = null;
  let stepCarry = 0, lastFrameAt = 0, frameEma = 0, stepScale = 1, lastLong = false, windowFresh = true;
  let work = 0;        /* every step ever issued (never reset): the step rate counts completed work by it */
  const window1 = { start: 0, frames: 0, steps: 0, issue: 0 };
  const fence = [];    /* {t, work}: force readbacks as they resolved, newest last (RATE_SPAN_MS) */
  let fenceEpoch = 0;  /* readbacks issued before the stats window last (re)opened do not count */

  /* ---------------------------------------------------------- capability */
  const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  const isGL2 = !!gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!isGL2) return fail('no-webgl2');
  const hasF32 = renderer.extensions.has('EXT_color_buffer_float');
  const hasF16 = hasF32 || renderer.extensions.has('EXT_color_buffer_half_float');
  if (!hasF16) return fail('no-float');

  function fail(reason) {
    api.fallback = reason; stats.fallback = reason;
    api.ready = Promise.resolve({ fallback: reason, precision: 'none' });
    for (const k of ['setSection', 'setInflow', 'setBodyRate', 'setView', 'setTier', 'frame', 'step', 'render', 'reset', 'setViscosity', 'setSmagorinsky', 'setRegularised', 'setMachFloor', 'setStabilisers']) api[k] = noop;
    api.sampleForce = () => Promise.resolve(null);
    api.check = () => Promise.resolve(null);
    api.sync = () => Promise.resolve(false);
    api.resources = () => ({ targets: 0, materials: 0, textures: 0, geometries: 0 });
    api.destroy = () => { destroyed = true; };
    return api;
  }

  /* ---------------------------------------------------------- GL objects */
  let half = !hasF32 || options.precision === 'half';   /* float16 deviation path (the option forces it, for testing) */
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(quad);
  mesh.frustumCulled = false;
  scene.add(mesh);
  scene.matrixWorldAutoUpdate = false;

  const materials = [];
  function material(fragmentShader, uniforms) {
    const m = new THREE.RawShaderMaterial({
      vertexShader: S.VERT, fragmentShader, uniforms, glslVersion: THREE.GLSL3,
      depthTest: false, depthWrite: false,
    });
    materials.push(m);
    return m;
  }
  const u = (value) => ({ value });
  let mats = null;
  function buildMaterials() {
    for (const m of materials) m.dispose();
    materials.length = 0;
    mats = {
      init: material(S.INIT_FRAG, { tCell: u(null), uU: u(new THREE.Vector2()), uOmega: u(0), uCg: u(new THREE.Vector2()), uFrame: u(1) }),
      step: material(S.STEP_FRAG, {
        tF0: u(null), tF1: u(null), tF2: u(null), tCell: u(null), uU: u(new THREE.Vector2()),
        uTau0: u(0.51), uC2: u(SMAGORINSKY_C * SMAGORINSKY_C), uOmega: u(0), uCg: u(new THREE.Vector2()), uAccum: u(0), uReg: u(0),
        uMachU: u(MACH_U), uMachK: u(0), uSpongeW: u(0), uSpongeTau: u(SPONGE_TAU), uPositive: u(1), uInflowNeq: u(0),
        uOmegaDot: u(0), uFrame: u(1), uAccel: u(new THREE.Vector2()),
      }),
      macro: material(S.MACRO_FRAG, { tF0: u(null), tF1: u(null), tF2: u(null), tCell: u(null), uOmega: u(0), uFrame: u(1), uCg: u(new THREE.Vector2()) }),
      dye: material(S.DYE_FRAG, {
        tDye: u(null), tMacro: u(null), tCell: u(null), uGrid: u(new THREE.Vector2()), uScale: u(2), uSteps: u(0),
        uDecay: u(new THREE.Vector2(1, 1)), uFlow: u(new THREE.Vector2(1, 0)), uSpacing: u(12), uWidth: u(0.6), uWallDye: u(WALL_DYE), uInit: u(0),
      }),
      composite: material(S.COMPOSITE_FRAG, {
        tMacro: u(null), tDye: u(null), tCell: u(null), uGrid: u(new THREE.Vector2()), uOut: u(new THREE.Vector2()),
        uView: u(0), uUin: u(0.05), uD: u(24),
      }),
      reduce0: material(S.REDUCE0_FRAG, { tF2: u(null), tCell: u(null), uCount: u(countScale()) }),
      reduce: material(S.REDUCE_FRAG, { tSrc: u(null), uCount: u(countScale()) }),
      probe0: material(S.PROBE0_FRAG, { tF0: u(null), tF1: u(null), tF2: u(null), tCell: u(null), uCount: u(countScale()) }),
      probe: material(S.PROBE_FRAG, { tSrc: u(null), uCount: u(countScale()) }),
    };
  }

  const targets = new Set();
  function target(w, h, opts) {
    const t = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      depthBuffer: false, stencilBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, ...opts,
    });
    targets.add(t);
    return t;
  }
  function dropTarget(t) { if (t) { t.dispose(); targets.delete(t); } }
  const stateType = () => (half ? THREE.HalfFloatType : THREE.FloatType);
  /* The reduction chain is float32 whenever float32 targets render (also when the state is
     forced to float16 for testing); only without them does it fall back to float16, where
     the counts travel as means (countScale 0.25 per level, see shaders.js) */
  const chainType = () => (hasF32 ? THREE.FloatType : THREE.HalfFloatType);
  const countScale = () => (hasF32 ? 1 : 0.25);
  const countMul = () => (hasF32 ? 1 : Math.pow(4, chain.length));

  /* Allocates (or resizes) every target for the current grid. The view target
     keeps its object so lattice.texture stays valid across tier changes. */
  function allocate() {
    const { cols, rows, dyeScale } = grid;
    const dw = cols * dyeScale, dh = rows * dyeScale;
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    if (!fA || fA.texture.type !== stateType()) {
      dropTarget(fA); dropTarget(fB);
      fA = target(cols, rows, { count: 3, type: stateType(), format: THREE.RGBAFormat });
      fB = target(cols, rows, { count: 3, type: stateType(), format: THREE.RGBAFormat });
    } else { fA.setSize(cols, rows); fB.setSize(cols, rows); }
    if (!macro) macro = target(cols, rows, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, ...lin });
    else macro.setSize(cols, rows);
    if (!dyeA) {
      dyeA = target(dw, dh, { type: THREE.HalfFloatType, format: THREE.RGFormat, ...lin });
      dyeB = target(dw, dh, { type: THREE.HalfFloatType, format: THREE.RGFormat, ...lin });
    } else { dyeA.setSize(dw, dh); dyeB.setSize(dw, dh); }
    if (!view) { view = target(dw, dh, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, ...lin }); api.texture = view.texture; }
    else view.setSize(dw, dh);
    for (const t of chain) dropTarget(t);
    chain = [];
    let w = cols, h = rows;
    do {
      w = Math.ceil(w / 2); h = Math.ceil(h / 2);
      chain.push(target(w, h, { type: chainType(), format: THREE.RGBAFormat }));
    } while (w > 1 || h > 1);
    stats.grid = [cols, rows]; stats.dye = [dw, dh];
  }
  /* Frees the GPU memory (tier 0, or a lost context); the objects stay so
     three re-creates them on the next use. */
  function releaseGPU() { for (const t of targets) t.dispose(); }

  /* ------------------------------------------------------------ section */
  let sectionSource = null;
  const section = { cols: 0, rows: 0, dCells: 24, cgX: 0, cgY: 0, solidCells: 0, links: 0, clippedEdge: 0, xMin: NaN, xMax: NaN, rMax: 1 };
  let gen = 0;         /* generation: bumped by reset(), a grid change and a new section; a force readback
                          issued under an older generation is dropped when it lands */
  let cellData = null;

  function normaliseCg(cg, cols, rows) {
    if (Array.isArray(cg)) return [Number(cg[0]), Number(cg[1] ?? rows / 2)];
    if (cg && typeof cg === 'object') return [Number(cg.x ?? cg.col), Number(cg.y ?? cg.row ?? rows / 2)];
    if (Number.isFinite(cg)) return [cg, rows / 2];
    return [cols / 2, rows / 2];
  }
  /* The section for the current grid: from a builder, or resampled (nearest)
     from a section built at another size, with dCells and the centre scaled. */
  function sectionFor(cols, rows) {
    let s = typeof sectionSource === 'function' ? sectionSource({ cols, rows }) : sectionSource;
    if (!s || !s.mask) return null;
    const sc = s.cols | 0, sr = s.rows | 0;
    let [cx, cy] = normaliseCg(s.cgCell, sc, sr);
    let mask = s.mask, d = Number(s.dCells) || 0;
    if (sc !== cols || sr !== rows) {
      const out = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        const rr = Math.min(sr - 1, Math.floor((r + 0.5) * sr / rows));
        for (let c = 0; c < cols; c++) out[r * cols + c] = mask[rr * sc + Math.min(sc - 1, Math.floor((c + 0.5) * sc / cols))];
      }
      mask = out; d *= cols / sc; cx *= cols / sc; cy *= rows / sr;
    }
    return { mask, dCells: d, cgX: cx, cgY: cy };
  }
  /* Cell texture: r = 255 inside the solid, g = bit k-1 set when the neighbour
     x - e_k is solid (fluid cells only), b = the views' rim coverage (255 inside the
     solid and within RIM_D body diameters of it, fading over the next cell; the
     composite draws it in ink, see shaders.js). Edge rows and columns stay fluid.
     The solid's column extent (xMin to xMax, nose tip to tail) bounds the centre of
     pressure, and its distance from the CG (rMax) scales the body-rate slew. */
  function applySection() {
    const { cols, rows } = grid;
    const s = sectionFor(cols, rows);
    const solid = new Uint8Array(cols * rows);
    let clipped = 0;
    if (s) for (let i = 0; i < solid.length; i++) solid[i] = s.mask[i] ? 1 : 0;
    for (let c = 0; c < cols; c++) for (const r of [0, rows - 1]) { if (solid[r * cols + c]) clipped++; solid[r * cols + c] = 0; }
    for (let r = 0; r < rows; r++) for (const c of [0, cols - 1]) { if (solid[r * cols + c]) clipped++; solid[r * cols + c] = 0; }
    if (!cellData || cellData.length !== cols * rows * 4) cellData = new Uint8Array(cols * rows * 4);
    else cellData.fill(0);
    const E = S.D2Q9.e;
    let solids = 0, links = 0, xMin = Infinity, xMax = -Infinity;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, o = i * 4;
      cellData[o + 3] = 255;
      if (solid[i]) {
        cellData[o] = 255; solids++;
        if (c < xMin) xMin = c; if (c + 1 > xMax) xMax = c + 1;
        continue;
      }
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) continue;
      let bits = 0;
      for (let k = 1; k <= 8; k++) if (solid[(r - E[k][1]) * cols + (c - E[k][0])]) { bits |= 1 << (k - 1); links++; }
      cellData[o + 1] = bits;
    }
    /* rim: distance from each fluid cell near the wall to the nearest solid cell centre,
       stamped from the solid cells that touch fluid */
    const rimR = clamp(RIM_D * (s && s.dCells > 0 ? s.dCells : 0), RIM_MIN, RIM_MAX), reach = Math.ceil(rimR + 0.5);
    const near = new Float32Array(cols * rows).fill(Infinity);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!solid[i]) continue;
      cellData[i * 4 + 2] = 255;
      let edge = false;
      for (let k = 1; k <= 8 && !edge; k++) {
        const cc = c + E[k][0], rr = r + E[k][1];
        if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && !solid[rr * cols + cc]) edge = true;
      }
      if (!edge) continue;
      for (let dy = -reach; dy <= reach; dy++) {
        const rr = r + dy;
        if (rr < 0 || rr >= rows) continue;
        for (let dx = -reach; dx <= reach; dx++) {
          const cc = c + dx, j = rr * cols + cc;
          if (cc < 0 || cc >= cols || solid[j]) continue;
          const dd = Math.hypot(dx, dy);
          if (dd < near[j]) near[j] = dd;
        }
      }
    }
    for (let i = 0; i < near.length; i++) if (near[i] < Infinity) cellData[i * 4 + 2] = Math.round(255 * clamp(rimR + 0.5 - near[i], 0, 1));
    if (!cellTex || cellTex.image.width !== cols || cellTex.image.height !== rows) {
      if (cellTex) cellTex.dispose();
      cellTex = new THREE.DataTexture(cellData, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
      cellTex.minFilter = THREE.LinearFilter; cellTex.magFilter = THREE.LinearFilter;
      cellTex.wrapS = cellTex.wrapT = THREE.ClampToEdgeWrapping;
      cellTex.generateMipmaps = false; cellTex.flipY = false; cellTex.unpackAlignment = 1;
    } else cellTex.image.data = cellData;
    cellTex.needsUpdate = true;
    const cgX = s ? s.cgX : cols / 2;
    if (!solids) { xMin = xMax = NaN; }
    Object.assign(section, {
      cols, rows, dCells: s ? s.dCells : 0, cgX, cgY: s ? s.cgY : rows / 2, solidCells: solids, links, clippedEdge: clipped,
      xMin, xMax, rMax: solids ? Math.max(1, cgX - xMin, xMax - cgX) : Math.max(1, cols / 2),
    });
    stats.dCells = section.dCells;
    gen++;               /* readbacks in flight belong to the previous section */
    updateViscosity();
  }

  /* ---------------------------------------------------------- parameters */
  /* omega slews toward omegaTarget (setBodyRate). uReq is the inflow the caller asked for, uIn the one that
     runs (at most visc.speedCap, see U_CAP); rateScale = uIn / uReq scales the body rate with it, so the
     reduced rate omega D / u stays what the caller set. frame: body-frame rotation (true) or moving wall. */
  const flow = { uIn: 0.05, uReq: 0.05, rateScale: 1, alpha: 0, omega: 0, omegaTarget: 0, omegaReq: 0, frame: true, view: 0 };
  const visc = { mode: 're', re: RE_TARGET, uRef: U_REF, tau0: 0.51, c: SMAGORINSKY_C, reg: options.regularised !== false, machK: Number.isFinite(options.machK) ? options.machK : MACH_K, sponge: options.sponge !== false, positive: options.positive !== false, inflowNeq: options.inflowNeq === true,
    speedCap: Number.isFinite(options.speedCap) ? clamp(options.speedCap, 0.005, U_MAX) : U_CAP };
  function updateViscosity() {
    const d = section.dCells > 0 ? section.dCells : 24;
    if (visc.mode === 're') visc.tau0 = tauFor(visc.re, visc.uRef, d);
    visc.tau0 = Math.max(0.5 + 1e-5, visc.tau0);
    const nu = (visc.tau0 - 0.5) / 3;
    stats.tau0 = visc.tau0; stats.nu = nu;
    stats.re = nu > 0 ? flow.uIn * d / nu : Infinity;
  }

  /* -------------------------------------------------------------- passes */
  let depth = 0, saved = null;
  function begin() {
    if (depth++ > 0) return;
    saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear };
    renderer.autoClear = false;
  }
  function end() {
    if (--depth > 0) return;
    renderer.setRenderTarget(saved.target);
    renderer.autoClear = saved.autoClear;
    saved = null;
  }
  function pass(mat, rt) {
    mesh.material = mat;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
  }
  function setVec(v, x, y) { v.value.set(x, y); }
  const targetVec = () => [flow.uIn * Math.cos(flow.alpha), flow.uIn * Math.sin(flow.alpha)];
  const inflow = { x: 0, y: 0 };      /* boundary inflow now, slewing toward targetVec() */
  function advanceInflow() {
    const [tx, ty] = targetVec();
    inflow.x += clamp(tx - inflow.x, -SLEW, SLEW);
    inflow.y += clamp(ty - inflow.y, -SLEW, SLEW);
  }

  let accumSteps = 0, accumReset = true, pendingDye = 0, sinceReset = STARTUP_STEPS;
  /* Developed flow: the start-up viscosity has eased back to tau0 (STARTUP_STEPS after a reset), the
     boundary inflow has reached its setInflow target, the body rate has reached its setBodyRate
     target, and since the last body-rate jump (a flick) the rate has been there for settleSteps().
     devRun counts consecutive developed steps; a force window is developed when every step in it
     was (force.developed, stats.developed). Before that the forces carry the start-up or the flick
     transient (c_n about 100 at step 100; after a flick the acoustic ripples cross the whole domain)
     and callers should show a dash. */
  let devRun = 0;
  let travel = 0;      /* cells of free-stream travel since the last reset or inflow jump (DEV_PASSES) */
  const meanBuf = [];  /* developed force windows of the current generation, newest last (force.mean) */
  /* body length in cells: the solid's column extent (nose tip to tail), else the reference length */
  const bodyLength = () => (section.solidCells > 0 && section.xMax > section.xMin ? section.xMax - section.xMin : Math.max(1, section.dCells || 1));
  let quiet = 0;       /* steps since the body rate last jumped or was still ramping */
  const omegaSlew = () => OMEGA_SLEW_U / Math.max(1, section.rMax);
  const omegaArrived = () => Math.abs(flow.omegaTarget - flow.omega) * section.rMax <= OMEGA_ARRIVED_U;
  const settleSteps = () => Math.round(SETTLE_CROSSINGS * grid.cols * Math.sqrt(3));
  /* tau0 with the start-up easing (smoothstep from STARTUP_TAU down to tau0) */
  function tauNow() {
    if (sinceReset >= STARTUP_STEPS || STARTUP_TAU <= visc.tau0) return visc.tau0;
    const t = sinceReset / STARTUP_STEPS, w = 1 - t * t * (3 - 2 * t);
    return visc.tau0 + (STARTUP_TAU - visc.tau0) * w;
  }
  function initState() {
    const m = mats.init;
    m.uniforms.tCell.value = cellTex;
    m.uniforms.uOmega.value = -flow.omega; m.uniforms.uFrame.value = flow.frame ? 1 : 0;
    setVec(m.uniforms.uCg, section.cgX, section.cgY);
    setVec(m.uniforms.uU, inflow.x, inflow.y);
    pass(m, fA);
    accumSteps = 0; accumReset = true;
  }
  function stepOnce() {
    const m = mats.step.uniforms;
    m.tF0.value = fA.textures[0]; m.tF1.value = fA.textures[1]; m.tF2.value = fA.textures[2];
    m.tCell.value = cellTex;
    const ix0 = inflow.x, iy0 = inflow.y;
    advanceInflow();
    setVec(m.uU, inflow.x, inflow.y);
    m.uTau0.value = tauNow(); m.uC2.value = visc.c * visc.c; m.uReg.value = visc.reg ? 1 : 0;
    m.uMachK.value = visc.machK; m.uMachU.value = MACH_U;
    m.uSpongeW.value = visc.sponge ? Math.max(SPONGE_MIN, Math.round(SPONGE_FRAC * grid.rows)) : 0;
    m.uPositive.value = visc.positive ? 1 : 0;
    m.uInflowNeq.value = visc.inflowNeq ? 1 : 0;
    const dw = omegaSlew(), was = flow.omega;
    flow.omega += clamp(flow.omegaTarget - flow.omega, -dw, dw);
    m.uOmega.value = -flow.omega;                 /* flight rate (clockwise in the grid) to counter-clockwise */
    m.uOmegaDot.value = -(flow.omega - was);      /* the Euler term of the body frame, same sense */
    /* minus the frame's acceleration in body axes: du_in/dt + Omega x u_in (Omega counter-clockwise in the grid) */
    m.uAccel.value.set(inflow.x - ix0 + m.uOmega.value * -inflow.y, inflow.y - iy0 + m.uOmega.value * inflow.x);
    m.uFrame.value = flow.frame ? 1 : 0;
    stats.omega = flow.omega;
    setVec(m.uCg, section.cgX, section.cgY);
    m.uAccum.value = (!half && !accumReset) ? 1 : 0;
    pass(mats.step, fB);
    const t = fA; fA = fB; fB = t;
    accumReset = false; accumSteps++; pendingDye++; stats.steps++; window1.steps++; sinceReset++; work++;
    stats.uNow = Math.hypot(inflow.x, inflow.y); stats.tauNow = m.uTau0.value;
    const [tx, ty] = targetVec();
    quiet = omegaArrived() ? quiet + 1 : 0;
    const arrived = Math.abs(tx - inflow.x) <= ARRIVED && Math.abs(ty - inflow.y) <= ARRIVED;
    travel = arrived ? travel + Math.hypot(inflow.x, inflow.y) : 0;
    stats.travelPasses = travel / bodyLength();
    devRun = sinceReset >= STARTUP_STEPS && arrived && quiet >= settleSteps() && travel >= DEV_PASSES * bodyLength() ? devRun + 1 : 0;
    stats.developed = devRun > 0;
  }
  function dyePass(init) {
    const m = mats.dye.uniforms;
    m.tDye.value = dyeA.texture; m.tMacro.value = macro.texture; m.tCell.value = cellTex;
    setVec(m.uGrid, grid.cols, grid.rows);
    m.uScale.value = grid.dyeScale;
    m.uSteps.value = pendingDye;
    const travel = pendingDye * flow.uIn;
    setVec(m.uDecay, Math.exp(-travel / (RAKE_DECAY * grid.cols)), Math.exp(-travel / (WALL_DECAY * grid.cols)));
    const ang = Math.hypot(inflow.x, inflow.y) > 1e-6 ? Math.atan2(inflow.y, inflow.x) : flow.alpha;   /* rake follows the inflow as it is now */
    setVec(m.uFlow, Math.cos(ang), Math.sin(ang));
    m.uSpacing.value = grid.rows / Math.max(1, grid.rake);
    m.uWidth.value = Math.max(0.55, 1.2 / grid.dyeScale);
    m.uInit.value = init ? 1 : 0;
    pass(mats.dye, dyeB);
    const t = dyeA; dyeA = dyeB; dyeB = t;
    pendingDye = 0;
  }
  function renderViews() {
    const mm = mats.macro.uniforms;
    mm.tF0.value = fA.textures[0]; mm.tF1.value = fA.textures[1]; mm.tF2.value = fA.textures[2];
    mm.tCell.value = cellTex; mm.uOmega.value = -flow.omega; mm.uFrame.value = flow.frame ? 1 : 0; setVec(mm.uCg, section.cgX, section.cgY);
    pass(mats.macro, macro);
    if (pendingDye > 0) dyePass(false);
    const c = mats.composite.uniforms;
    c.tMacro.value = macro.texture; c.tDye.value = dyeA.texture; c.tCell.value = cellTex;
    setVec(c.uGrid, grid.cols, grid.rows); setVec(c.uOut, grid.cols * grid.dyeScale, grid.rows * grid.dyeScale);
    c.uView.value = flow.view; c.uUin.value = flow.uIn; c.uD.value = section.dCells > 0 ? section.dCells : 24;
    pass(mats.composite, view);
  }
  function reduceChain(first, firstUniforms, next) {
    for (const [k, v] of Object.entries(firstUniforms)) first.uniforms[k].value = v;
    pass(first, chain[0]);
    for (let i = 1; i < chain.length; i++) { next.uniforms.tSrc.value = chain[i - 1].texture; pass(next, chain[i]); }
    return chain[chain.length - 1];
  }
  function readTarget(rt, index = 0, x = 0, y = 0) {
    const h = rt.texture.type === THREE.HalfFloatType;
    const buf = h ? new Uint16Array(4) : new Float32Array(4);
    return renderer.readRenderTargetPixelsAsync(rt, x, y, 1, 1, buf, undefined, index)
      .then((b) => (h ? Array.from(b, halfToFloat) : Array.from(b)));
  }

  /* -------------------------------------------------------------- force */
  let live = false, lost = false, readsInFlight = 0, lastRead = 0;
  const autoNaNReset = options.autoResetOnNaN !== false;
  function sampleForce() {
    if (!live || lost || destroyed || tier === 0) return Promise.resolve(api.force);
    if (accumSteps === 0 || readsInFlight > 3) return Promise.resolve(api.force);
    begin();
    const last = reduceChain(mats.reduce0, { tF2: fA.textures[2], tCell: cellTex }, mats.reduce);
    end();
    const n = half ? 1 : accumSteps;
    const meta = {
      gen, steps: n, uIn: flow.uIn, alpha: flow.alpha, d: section.dCells, cgX: section.cgX, xMin: section.xMin, xMax: section.xMax,
      issued: performance.now(), stepIndex: stats.steps, work, countMul: countMul(), developed: devRun >= accumSteps,
      span: accumSteps,
    };
    accumSteps = 0; accumReset = true;
    readsInFlight++;
    let p;
    try { p = readTarget(last); } catch (err) { readsInFlight--; stats.forceReadback = false; return Promise.resolve(api.force); }
    return p.then((v) => {
      readsInFlight--;
      if (destroyed) return null;
      /* completed work for the step rate: a monotonic count, so it holds across generations */
      const t = performance.now();
      if (meta.issued >= fenceEpoch) fence.push({ t, work: meta.work });
      while (fence.length > 3 && t - fence[0].t > RATE_SPAN_MS) fence.shift();
      if (meta.gen !== gen) return api.force;   /* issued before a reset, a grid change or a new section */
      stats.forceReadback = true;
      const f = forceFrom(v, meta);
      if (!f.finite && autoNaNReset) { stats.nanResets++; reset(); return api.force; }
      f.mean = chordMean(f, meta);
      api.force = f;
      return f;
    }, () => { readsInFlight--; stats.forceReadback = false; return api.force; });
  }
  /* force.mean: the means of the developed force windows over the last chord pass (body length
     over u_in steps, newest first), with their coefficients and centre of pressure under the same
     rules as below; null until one chord pass of developed windows has been read. A lifting or
     shedding section's forces swing widely inside a chord pass (validation track L2, section 9:
     the rocket stand-in's one-pass C_N and C_m means scatter by 13 and 27 percent, single windows
     far more), so a mean over a pass is the number to show. Windows are weighted by the steps
     they cover; an undeveloped window, a reset or a new section starts the mean again. */
  function chordMean(f, m) {
    if (!f.developed || !f.finite) { meanBuf.length = 0; return null; }
    if (meanBuf.length && meanBuf[0].gen !== m.gen) meanBuf.length = 0;
    meanBuf.push({ gen: m.gen, fx: f.fx, fy: f.fy, mz: f.mz, w: Math.max(1, m.span || m.steps) });
    const need = bodyLength() / Math.max(1e-4, m.uIn);
    let n = 0, sx = 0, sy = 0, sm = 0, i = meanBuf.length - 1;
    for (; i >= 0 && n < need; i--) { const b = meanBuf[i]; n += b.w; sx += b.fx * b.w; sy += b.fy * b.w; sm += b.mz * b.w; }
    if (i > 8) meanBuf.splice(0, i - 8);
    if (n < need) return null;
    const g = forceFrom([sx / n, sy / n, sm / n, 0], { ...m, steps: 1, countMul: 0 });
    return { fx: g.fx, fy: g.fy, mz: g.mz, cx: g.cx, cn: g.cn, cm: g.cm, cd: g.cd, cl: g.cl, xcpCells: g.xcpCells, steps: n, passes: n * m.uIn / bodyLength() };
  }
  /* Coefficients use the dynamic pressure at the inflow; with no inflow (u_in <= 1e-4)
     they are null, as is xcpCells. finite reports the field's force sums only. A centre of
     pressure outside the body's own columns (xMin to xMax, nose tip to tail) is null. */
  function forceFrom(v, m) {
    const [sx, sy, sm, rawLinks] = v;
    const fx = sx / m.steps, fy = sy / m.steps, mz = sm / m.steps;
    const has = m.uIn > 1e-4;
    const d = m.d > 0 ? m.d : 1;
    const qd = has ? 0.5 * m.uIn * m.uIn * d : NaN;   /* dynamic pressure x D, rho_ref = 1 */
    const ca = Math.cos(m.alpha), sa = Math.sin(m.alpha);
    const coef = (x) => (has && Number.isFinite(x) ? x : null);
    const onBody = (x) => (Number.isFinite(x) && x >= m.xMin && x <= m.xMax ? x : null);
    const cn = coef(fy / qd);
    const issued = m.issued;
    return {
      fx, fy, mz,
      cx: coef(fx / qd), cn, cm: coef(mz / (qd * d)),
      cd: coef((fx * ca + fy * sa) / qd), cl: coef((-fx * sa + fy * ca) / qd),
      xcpCells: m.developed && cn !== null && Math.abs(cn) >= XCP_MIN_CN && Math.abs(m.alpha) >= XCP_MIN_ALPHA ? onBody(m.cgX - mz / fy) : null,
      links: Math.round(rawLinks * m.countMul), steps: m.steps, step: m.stepIndex, uIn: m.uIn, alpha: m.alpha, dCells: m.d, developed: !!m.developed,
      finite: Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sm),
      get age_ms() { return performance.now() - issued; },
    };
  }

  /* Validation probe: counts non-finite or out-of-range fluid cells and the
     extremes of |u| and |rho - 1| over the whole field (async readback). */
  function check() {
    if (!live || lost || destroyed) return Promise.resolve(null);
    begin();
    const last = reduceChain(mats.probe0, { tF0: fA.textures[0], tF1: fA.textures[1], tF2: fA.textures[2], tCell: cellTex }, mats.probe);
    end();
    const step = stats.steps, k = countMul();
    return readTarget(last).then(([bad, cells, maxSpeed, maxDrho]) => ({ bad: Math.round(bad * k), cells: Math.round(cells * k), maxSpeed, maxDrho, step }), () => null);
  }

  /* Resolves once the GPU has finished every lattice command issued so far
     (an async one-texel readback behind a fence). For benches and gates. */
  function sync() {
    if (!live || lost || destroyed || tier === 0) return Promise.resolve(false);
    return readTarget(fA, 0, 0, 0).then(() => true, () => false);
  }

  /* ------------------------------------------------------------ lifecycle */
  function gridForTier(t) {
    const spec = TIERS[t] || TIERS[1];
    if (fixedGrid) return { cols: options.cols | 0, rows: options.rows | 0, dyeScale: spec.dyeScale || 2, rake: spec.rake || 28 };
    if (customGrid) {
      const k = spec.cols / TIERS[baseTier].cols;
      return { cols: Math.max(8, Math.round((options.cols | 0) * k)), rows: Math.max(8, Math.round((options.rows | 0) * k)), dyeScale: spec.dyeScale, rake: spec.rake };
    }
    return { cols: spec.cols, rows: spec.rows, dyeScale: spec.dyeScale, rake: spec.rake };
  }
  function configure(t) {
    const g = gridForTier(t > 0 ? t : 1);
    const changed = g.cols !== grid.cols || g.rows !== grid.rows || g.dyeScale !== grid.dyeScale || !fA;
    Object.assign(grid, g);
    if (changed) { gen++; allocate(); applySection(); }
    return changed;
  }
  function reset() {
    if (!mats || destroyed || lost || tier === 0) return;
    begin();
    gen++;                               /* readbacks in flight belong to the old state */
    [inflow.x, inflow.y] = targetVec();  /* uniform inflow: the tunnel is already running */
    flow.omega = flow.omegaTarget;       /* and the body already turning: the start-up covers both */
    sinceReset = 0; quiet = 0; travel = 0; meanBuf.length = 0;
    stats.uNow = Math.hypot(inflow.x, inflow.y); stats.tauNow = tauNow();
    initState();
    devRun = 0; stats.developed = false;
    pendingDye = 0;
    dyePass(true);
    renderViews();
    end();
    stats.steps = 0;
    api.force = null;
  }

  /* Self-test: after init and one step of uniform flow u = (SELFTEST_U, 0) every
     interior fluid cell holds the equilibrium, so f1 = w1 (1 + 3 u + 4.5 u^2 - 1.5 u^2)
     (stored as f1 - w1 on the float16 path). A target that does not render
     (incomplete framebuffer) reads back wrong: float32 drops to float16, float16 to
     'no-float'. The flow is fixed, not the caller's inflow, so the expected value is
     far from what an all-zero read gives on either path; reset() puts the caller's
     inflow back afterwards. */
  async function selfTest() {
    const w1 = 1 / 9, ux = SELFTEST_U;
    const expect = w1 * (3 * ux + 3 * ux * ux);   /* stored as f1 - w1 on both paths (shaders.js STORAGE) */
    inflow.x = ux; inflow.y = 0;
    sinceReset = STARTUP_STEPS;
    begin(); initState(); stepOnce(); end();
    const v = await readTarget(fA, 0, grid.cols >> 1, Math.min(2, grid.rows - 1));   /* an interior cell far from the body */
    if (options.debug) console.log('[lattice] self-test', half ? 'rgba16f' : 'rgba32f', 'read', v, 'expect', expect);
    return Number.isFinite(v[1]) && Math.abs(v[1] - expect) < SELFTEST_TOL;
  }
  async function boot() {
    buildMaterials();
    configure(tier);
    let ok = false;
    try { ok = await selfTest(); } catch (err) { ok = false; if (options.debug) console.log('[lattice] self-test threw', String(err && err.stack || err)); }
    if (!ok && !half && !destroyed) {
      half = true;
      buildMaterials();
      dropTarget(fA); dropTarget(fB); fA = fB = null;
      configure(tier);
      try { ok = await selfTest(); } catch (err) { ok = false; if (options.debug) console.log('[lattice] float16 self-test threw', String(err && err.stack || err)); }
    }
    if (destroyed) return { fallback: null, precision: 'none' };
    if (!ok) {
      releaseGPU();
      api.texture = null;
      api.fallback = stats.fallback = 'no-float';
      return { fallback: 'no-float', precision: 'none' };
    }
    stats.precision = half ? 'rgba16f-dev' : 'rgba32f';
    live = true;
    if (tier === 0) releaseGPU();
    else reset();
    return { fallback: null, precision: stats.precision };
  }
  api.ready = boot().catch((err) => {
    console.warn('[lattice] start-up failed, running without the lattice', err);
    api.fallback = stats.fallback = 'no-float';
    return { fallback: 'no-float', precision: 'none' };
  });

  /* --------------------------------------------------------------- public */
  function setSection(s) {
    sectionSource = s || null;
    if (!mats || destroyed) return;
    applySection();   /* a section built at another size is resampled to the grid */
    if (live && tier > 0 && !lost) { begin(); renderViews(); end(); }
  }
  /* uIn: the inflow speed the caller asks for, lattice units; alpha: rad. The flow runs at
     min(uIn, speed cap) (U_CAP, setStabilisers({speedCap})), and the body rate is scaled by the
     same factor, so the reduced rate omega D / u the caller set is kept (setBodyRate). */
  function setInflow(uIn, alpha) {
    flow.uReq = clamp(Number(uIn) || 0, 0, U_MAX);
    flow.uIn = Math.min(flow.uReq, visc.speedCap);
    flow.rateScale = flow.uReq > 1e-9 ? flow.uIn / flow.uReq : 1;
    flow.alpha = clamp(Number(alpha) || 0, -ALPHA_MAX, ALPHA_MAX);
    stats.uIn = flow.uIn; stats.uRequested = flow.uReq; stats.alpha = flow.alpha; stats.alphaDeg = flow.alpha * 180 / Math.PI;
    retargetOmega();
    updateViscosity();
  }
  /* omegaLU: pitch rate in lattice units (rad per step) for the inflow the caller asked for,
     flight convention: positive raises theta, which turns the body clockwise in the grid
     frame. mode: 'frame' (default) turns the grid with the body (walls at rest, the free
     stream at the edges and the fictitious forces carry the rotation; right for any body
     that turns as a whole, such as a pitching section) or 'wall' (moving-wall velocity on
     the static mask, Ladd 1994; right only where that velocity is tangent to the wall,
     such as a spinning cylinder). See shaders.js STEP_FRAG and BODY RATE in the header.
     The rate follows its target at OMEGA_SLEW_U of wall speed per step; a change of more
     than OMEGA_JUMP_U of wall speed at the far end of the body (a flick), or a change of
     mode, marks the forces undeveloped until the rate has arrived and settleSteps() have
     passed. */
  function setBodyRate(omegaLU, mode) {
    flow.omegaReq = Number(omegaLU) || 0;
    if (mode === 'wall' || mode === 'frame') {
      const frame = mode === 'frame';
      if (frame !== flow.frame) { flow.frame = frame; quiet = 0; devRun = 0; stats.developed = false; }
      stats.bodyRate = mode;
    }
    retargetOmega();
  }
  function retargetOmega() {
    const w = flow.omegaReq * flow.rateScale;
    if (Math.abs(w - flow.omegaTarget) * section.rMax > OMEGA_JUMP_U) { quiet = 0; devRun = 0; stats.developed = false; }
    flow.omegaTarget = w;
    stats.omegaTarget = w;
  }
  function setView(name) {
    const i = VIEWS.indexOf(name);
    if (i < 0) return;
    flow.view = i; stats.view = name;
    if (live && tier > 0 && !lost) { begin(); renderViews(); end(); }
  }
  function setTier(t) {
    t = clamp(Math.round(Number(t) || 0), 0, 3);
    if (t === tier) return;
    const was = tier;
    tier = t; stats.tier = t;
    if (!mats || destroyed) return;
    if (t === 0) { releaseGPU(); return; }
    const changed = configure(t);
    if (live && (changed || was === 0)) reset();
  }
  /* Viscosity: { re, uRef } keeps Re fixed at uRef (tau0 follows the section),
     or { tau0 } fixes the relaxation time. */
  function setViscosity(v = {}) {
    if (Number.isFinite(v.tau0)) { visc.mode = 'tau'; visc.tau0 = v.tau0; }
    else if (Number.isFinite(v.re)) { visc.mode = 're'; visc.re = v.re; if (Number.isFinite(v.uRef)) visc.uRef = v.uRef; }
    updateViscosity();
  }
  function setSmagorinsky(c) { visc.c = Math.max(0, Number(c) || 0); stats.smagorinsky = visc.c; }
  function setRegularised(on) { visc.reg = !!on; stats.regularised = visc.reg; }
  /* Local speed floor on tau (see shaders.js): k in tau per lattice unit above MACH_U, 0 turns it off. */
  function setMachFloor(k) { visc.machK = Math.max(0, Number(k) || 0); stats.machK = visc.machK; }
  /* Stabiliser and edge switches for the lab and the gates: { sponge, positive, inflowNeq }
     booleans (inflowNeq: inflow cells at the neighbour's density, see EDGES in the header) and
     speedCap, the highest inflow speed that runs (lattice units, U_CAP by default; the
     validation benches raise it to test the Mach number trend). */
  function setStabilisers(o = {}) {
    if ('sponge' in o) visc.sponge = !!o.sponge;
    if ('positive' in o) visc.positive = !!o.positive;
    if ('inflowNeq' in o) visc.inflowNeq = !!o.inflowNeq;
    if ('speedCap' in o) {
      visc.speedCap = clamp(Number(o.speedCap) || U_CAP, 0.005, U_MAX);
      setInflow(flow.uReq, flow.alpha);
    }
    stats.sponge = visc.sponge; stats.positive = visc.positive; stats.inflowNeq = visc.inflowNeq; stats.speedCap = visc.speedCap;
  }

  function step(n = 1) {
    if (!live || destroyed || lost || tier === 0) return 0;
    n = Math.max(0, Math.floor(n));
    begin();
    for (let i = 0; i < n; i++) stepOnce();
    end();
    return n;
  }
  /* Draws the current state into lattice.texture without stepping (advects
     the dye over any steps taken through step()). */
  function render() {
    if (!live || destroyed || lost || tier === 0) return;
    begin(); renderViews(); end();
  }

  /* frame(dtSeconds, {resumed}): one frame of the caller's loop. resumed: true says the caller
     had stopped framing and this is its first frame since (it then reopens the stats window and
     keeps the gap out of the frame average); without it a pause is told from a slow frame by
     PAUSE_MS (see there). */
  function frame(dt, opts) {
    if (!live || destroyed || lost || tier === 0) return;
    const now = performance.now();
    const iv = lastFrameAt ? now - lastFrameAt : Infinity;
    const long = lastFrameAt > 0 && iv > Math.max(PAUSE_MS, 4 * frameEma);
    const resumed = !lastFrameAt || !!(opts && opts.resumed === true) || (long && !lastLong);
    lastLong = long;
    const base = Number.isFinite(api.stepsPerFrame) && api.stepsPerFrame > 0 ? api.stepsPerFrame : (TIERS[tier] || TIERS[1]).steps;
    const scale = Number.isFinite(dt) && dt > 0 ? clamp(dt / REF_FRAME_S, 0.25, 1) : 1;
    /* back off when frames arrive slower than the budget (GPU-bound), recover when they are quick;
       every interval but a pause feeds the average, slow frames included */
    if (!resumed) frameEma = frameEma ? frameEma * 0.8 + Math.min(iv, EMA_CAP_MS) * 0.2 : Math.min(iv, EMA_CAP_MS);
    if (frameEma > FRAME_BUDGET_MS) stepScale = Math.max(1 / base, stepScale * SHED_DOWN);
    else if (frameEma && frameEma < 0.6 * FRAME_BUDGET_MS) stepScale = Math.min(1, stepScale * SHED_UP);
    /* 1 Hz stats over the frames that started since the window opened. A pause reopens it (and
       drops the completed-work samples, which would count the gap); the window is reported once
       it is a full period old, before this frame's own steps are issued, so the steps counted are
       the ones issued inside the span. */
    if (resumed) {
      Object.assign(window1, { start: now, frames: 0, steps: 0, issue: 0 });
      fence.length = 0; fenceEpoch = now; windowFresh = true;
    } else if (now - window1.start >= STATS_PERIOD_MS) emitStats(now);
    const want = base * scale;
    stepCarry += want * stepScale;
    const n = Math.max(0, Math.floor(stepCarry));
    stepCarry -= n;
    stats.stepsPerFrame = base; stats.stepScale = stepScale;
    begin();
    let done = 0;
    for (; done < n; done++) {
      if (done > 0 && performance.now() - now > FRAME_BUDGET_MS) break;
      stepOnce();
    }
    stats.shed += Math.max(0, Math.round(want - done));
    renderViews();
    end();
    if (now - lastRead >= READ_PERIOD_MS) { lastRead = now; sampleForce(); }
    window1.frames++; window1.issue += performance.now() - now;
    lastFrameAt = now;
    governor.work(tier);   /* this frame ran the tier's work: only such frames can step the tier back up */
  }
  /* stepsPerSecond: the completed-work rate between the force readbacks of the last RATE_SPAN_MS
     (fenced: a readback resolves only after the GPU has run every step issued before it), else
     the steps issued in this window, but never for the first window after a (re)open, when a
     command queue without backpressure takes steps far faster than the GPU runs them. */
  function emitStats(now) {
    const span = Math.max(1, now - window1.start);
    const a = fence[0], b = fence[fence.length - 1];
    const fenced = fence.length >= 3 && b.t - a.t >= RATE_MIN_SPAN_MS && now - b.t < 2 * RATE_SPAN_MS ? (b.work - a.work) * 1000 / (b.t - a.t) : null;
    const issued = windowFresh ? null : window1.steps * 1000 / span;
    stats.stepsPerSecond = fenced !== null ? Math.round(fenced) : issued !== null ? Math.round(issued) : null;
    stats.rateSource = fenced !== null ? 'completed' : issued !== null ? 'issued' : null;
    stats.msPerFrame = window1.frames > 0 ? span / window1.frames : 0;
    stats.issueMs = window1.issue / Math.max(1, window1.frames);
    Object.assign(window1, { start: now, frames: 0, steps: 0, issue: 0 });
    windowFresh = false;
    bus.emit('lattice:stats', {
      grid: stats.grid.slice(), stepsPerSecond: stats.stepsPerSecond, force: api.force,
      msPerFrame: stats.msPerFrame, precision: stats.precision, re: stats.re, tier,
    });
  }

  function fieldsView() {
    if (!fA) return null;
    return {
      velocity: { texture: macro.texture, channels: 'rg', units: 'lattice units (cells per step)' },
      density: { texture: macro.texture, channels: 'b', units: 'rho - 1' },
      vorticity: { texture: macro.texture, channels: 'a', units: 'per step, counter-clockwise in the grid' },
      dye: { texture: dyeA.texture, channels: 'rg', units: 'rake smoke, wall dye (0..1)' },
      distributions: fA.textures, storage: S.STORAGE,
      cells: cellTex,
    };
  }
  function resources() {
    return { targets: targets.size, materials: materials.length, textures: cellTex ? 1 : 0, geometries: destroyed ? 0 : 1 };
  }

  /* context loss: stop, then rebuild the state when the browser restores it */
  const canvas = renderer.domElement;
  const onLost = () => { lost = true; stats.lost = true; };
  const onRestored = () => { lost = false; stats.lost = false; if (cellTex) cellTex.needsUpdate = true; if (live && tier > 0) reset(); };
  canvas?.addEventListener?.('webglcontextlost', onLost);
  canvas?.addEventListener?.('webglcontextrestored', onRestored);

  function destroy() {
    if (destroyed) return;
    destroyed = true; live = false;
    canvas?.removeEventListener?.('webglcontextlost', onLost);
    canvas?.removeEventListener?.('webglcontextrestored', onRestored);
    for (const t of targets) t.dispose();
    targets.clear();
    for (const m of materials) m.dispose();
    materials.length = 0;
    quad.dispose();
    if (cellTex) cellTex.dispose();
    cellTex = null; fA = fB = macro = dyeA = dyeB = view = null; chain = [];
    api.texture = null; api.force = null;
  }

  return api;
}

export default createLattice;
