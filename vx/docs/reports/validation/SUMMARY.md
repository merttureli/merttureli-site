# Validation summary (publish phase output, saved by the orchestrator)

## validate:L2 limits
- At the gate's own settings (D 24 cells, inflow edge 5.3 D ahead) the Re 100 cylinder reads C_D 1.473 and St 0.172 once saturated: +12 % and +5 % against unconfined 2D values (C_D 1.320, St 0.165).
- With domain and grid effects removed the lattice gives Re 100 C_D 1.318 (-0.1 %), St 0.161 (-2.4 %); Re 200 C_D 1.333 (+0.2 %), St 0.191 (-3.6 %): drag within about 1 %, Strouhal number 2 to 4 % low.
- Steady Re 20 and 40 (corrected): C_D 2 to 3 % low, recirculation length 1 to 3 % long; raw at D 16 with the edges 4 to 8 D away the bubble is up to 11 % long.
- The inflow edge holds u and rho fixed: 8 D ahead of a cylinder it raises C_D 6 to 9 % above the unbounded-upstream value (Re 100 to 20); the effect falls off as about the inverse square of the distance.
- The lateral edges are open at fixed pressure: domain height moves the Re 100 and 200 drag by at most 1.4 and 1.2 % between 8 and 32 D (and raises the Re 20 and 40 drag by 6.5 and 4.3 %), so wall-blockage corrections and blockage-based ranges do not apply.
- Grid: the Re 100 drag falls about 2 % per step from D 16 to 24 to 32 cells and 0.7 % from 32 to 48, so cylinder drag at 16 to 39 cells carries a grid error of several percent; steady Re 20 and 40 drag converges to 0.3 % by D 24.
- Forces need 38 to 53 D/u after a reset for a shedding cylinder and 12 to 51 D/u (drag within 1 %) for steady flow; the 2,000-step developed flag is 6 D/u at D 16.
- The rocket stand-in at alpha 5 deg, Re 3000 sheds: single C_N and C_m readings scatter by sd about 22 % and 65 % around their means; only means over a chord pass or longer are meaningful, and those settle after about 1.5 chord passes, not after 2,000 steps.
- The default equilibrium inflow edge admits u_in - (rho - 1)/3: behind a 1.5 % pressure rise it delivered 87 % of u_in (Schaefer-Turek channel).
- Schaefer-Turek 2D-1 needs a parabolic inflow 2 D ahead of the cylinder, which the uniform inflow edge cannot impose: with the edge as it is C_D is 3.4 to 4.7 % low, L_a 7 to 8 % short, dp 9 to 10 % low at D 20 to 40; with the benchmark inlet (test build of the transcription) C_D is +3.8 / +1.7 / +1.4 % at D 20 / 30 / 40 and dp within 0.4 %.
- Smagorinsky and the stabilisers together shift the Re 100 cylinder drag by about 1 % at D 16 (plain BGK -1.3 %, Smagorinsky off -0.5 %); they are not the source of the larger errors.
- SwiftShader ran the engine at 0.6 to 1.5 MCUPS on the shared host (9 to 25 steps/s on these grids); step and frame rates under software GL are not representative.

## validate:L1 limits
- Straight grid-aligned walls are second order: observed order 1.89 to 2.00 in exact diffusive scaling; profile L2 error 0.05 to 0.08 percent at 16 cells across, 0.003 to 0.005 percent at 64 (tau 0.8, Re 10); curved staircase walls not covered by L1.
- The effective bounce-back wall sits (3 - 16 Lambda)/(12 H) cells inside the fluid, about 1/(4 H) at the page's tau0 (both collisions).
- nu = (tau - 1/2)/3 holds within 0.13 percent at Ma 0.02 (tau 0.55 to 1.0) and within 0.6 percent at tau 0.505 with the regularized collision.
- Compressibility error scales as Ma^2: at u_in 0.10 the profile error is 0.15 percent and a pressure drop over 6 channel heights reads 3 percent high; at u_in 0.03 both are under 0.3 percent.
- At the page's tau0 (0.502 to 0.504) the scheme needs its stabilizers: plain BGK with the contract edges goes chaotic even in a Re 10 channel; the regularized collision or the absorbing layer keeps it steady.
- At u_in 0.10 and Re 3,000, grid-scale noise of about 15 percent of u_in fills the tier-1 free stream and the wall cells run at 1.3 to 1.7 nu0 (effective Re 1,800 to 2,300); at tier 3 1.14 nu0 (Re 2,600); at the pad speed u_in 0.03 the noise is absent and the wall cells carry 9 percent extra.
- The speed floor raises the viscosity 8 to 20 times (up to 92 times) in 2 to 13 percent of the fluid cells at u_in 0.10 (tier 1, alpha 0 to 10); local |u| reaches 0.18 to 0.24 (local Ma 0.32 to 0.42).
- The inflow edge delivers 95 to 97 percent of u_in at alpha 5 to 10 and 52 to 61 percent of the cross-flow at u_in 0.10, so coefficients referred to u_in read about 7 to 11 percent low.
- Force reduction counts every wall link once and matches a float64 sum to 2e-5; momentum exchange equals the discrete momentum balance to 6e-5; a square's C_D is grid-independent within 0.3 percent from 5 to 20 cells.
- Float32 storage biases a steady flow by 6e-6 to 2.4e-5 of u_max (tau 0.8 to 0.6) and floors a slow H 64 channel (tau 0.6) at 2.2e-4 to 2.4e-4.
- SwiftShader step rates are software GL and not representative of a GPU: 1.4 to 3.6 million cell updates per second unloaded; 11 to 17 steps/s at tier 1 and 4 steps/s at tier 3 under the shared load of this campaign.

## validate:F1 limits
- Barrowman code matches the 1966 NARAM-8 equations to 1e-6 and the TIR-33 JAVELIN worked example to 0.12 percent; this validates the implementation, not the method (subsonic, small angle, linear).
- Nose CP is taken on the 0.232 m nose part including its 32 mm shoulder; on the 0.200 m exposed ogive the vehicle CP is 32.94 in, not 33.10 in, and the margin 0.06 cal lower.
- The 0.466 L ogive rule sits 0.6 to 0.8 percent aft of Barrowman's exact tangent-ogive CP at this fineness (under 1 mm).
- The fin normal-force slope is incompressible; at the peak Mach 0.26 the compressible Diederich form (OpenRocket eq. 3.40) gives 1.3 percent more.
- The 4.15 cal margin uses the PAGE CG of 22 in from the 37 in design; a part-wise estimate of the 46.5 in CAD airframe puts the CG at 27.1 to 27.2 in at the page mass, a margin near 2.2 cal.
- The slender-rod pitch inertia is 17 to 26 percent above a part-wise CAD estimate at the same mass and CG; the 30 m/s pitch frequency could be 4.75 to 6.46 rad/s against the printed 5.76 rad/s (0.92 Hz).
- The printed damping ratio (0.094 at 98 ft/s) is Mandell's one-degree-of-freedom value; the simulated oscillation decays as zeta 0.142 at constant speed in coast and 0.39 to 1.0 while the motor burns.
- Jet damping omits the variable-mass I-dot term and is about 5 times too large (21 percent of the damping at rail exit instead of about 5); it changes the simulated decay by under 2 percent.
- Pitch damping is Mandell's linear C_mq (-891 per rad in the q A d (omega d / 2V) normalization at liftoff); OpenRocket's documented crossflow estimate is about 1.3 percent of it in flight, so OpenRocket or RocketPy comparisons will show weaker damping by design.
- Rail exit speed 46.6 ft/s is sampled at the first 1 ms step past the rail top; the exact crossing is 46.4 ft/s; with the CAD rail-button stations (24.6 and 41.9 in from the nose) it would be 43.4 ft/s.
- RK4 at 1 ms: apogee and max speed are converged to 1e-5; event-driven quantities are first order in dt (rail exit speed 0.26 percent and rail-exit angle of attack 0.24 percent at 1 ms).
- An independent scipy DOP853 integration with the same forces agrees within 0.004 percent on apogee and 0.001 percent on max speed, and the no-drag vertical flight matches the closed form within 0.002 percent; neither tests the force model.
- Constant sea-level density: ISA raises apogee 0.38 percent (3.9 ft) from a sea-level site and 1.3 percent (13.6 ft) from a 1,000 ft site; the cd fit absorbs it (0.641 with ISA instead of 0.634).
- Apogee sensitivity: impulse plus or minus 3 percent gives plus or minus 4.2 percent (44 ft); mass plus or minus 5 percent gives minus 5.5 or plus 5.7 percent; cd plus or minus 10 percent gives minus 3.1 or plus 3.3 percent.
- Rail exit speed sensitivity: 1.3 to 1.5 percent for impulse plus or minus 3 percent, 2.6 to 2.8 percent for mass plus or minus 5 percent, 0.01 percent for cd plus or minus 10 percent.
- There is no CHARGER flight data; the fitted cd 0.634 reproduces the page's simulated apogee of the 37 in design, not a measurement, so absolute apogee accuracy is unknown.

## validate:F2 limits
- An independent 6-DOF code (RocketPy 1.13.0, same inputs) reproduces the still-air flight: apogee within 0.006 percent, max speed within 0.004 percent, time to apogee within 0.005 percent, max acceleration within 0.02 percent.
- Both codes use Barrowman, so their 0.002 cal agreement on the static margin (4.145 cal) checks the arithmetic, not the method or the PAGE CG.
- In a 10 mph crosswind the weathercock angle at burnout agrees within 0.01 deg (9.40 against 9.41 deg) and the upwind drift within 0.8 percent once two errors in RocketPy's burn-phase equations are corrected. As distributed, RocketPy turns 0.42 deg further and drifts 9 percent further.
- Angle of attack after the 5 m/s gust: peak 7.25 deg against 7.37 deg (1.7 percent, the flight model's body-lift term). Pitch histories differ by 0.12 to 0.13 deg RMS, at most 0.4 deg.
- Pitch frequency agrees within 0.5 percent in coast and within 0.01 percent during the burn. Damping agrees within 2.3 percent in coast and within 8 percent during the burn, where the flight model's jet damping is 5.1 times the variable-mass value.
- The printed damping ratio (Mandell one degree of freedom) is about 20 percent below the decay both codes simulate: 0.103 against 0.128 at 212 ft/s.
- Rail exit speed reads 0.34 percent high because it is taken at the first 1 ms step past the rail top.
- Constant sea-level density puts apogee 0.37 percent (3.9 ft) below an ISA atmosphere. Earth rotation changes apogee by under 1 mm.
- The rail release rule matters in a crosswind: releasing at the forward button instead of the aft button turns the rocket 0.33 deg further by burnout and adds 2.9 m of upwind drift. Neither model has tip-off.
- The fitted cd 0.634 is not a prediction. A component drag estimate for the CAD airframe (OpenRocket method) gives cd 0.44 to 0.66 and an apogee of 1,027 to 1,159 ft (central 1,061 ft) against the page's 1,033 ft.
- A 6-DOF model adds nothing for a planar wind with no cant: RocketPy's motion stayed in the pitch plane to under 1e-12 deg.

## validate:L3 limits
- Moving-wall term, wall moving along itself: Magnus lift is within 6 percent of Mittal and Kumar (2003) at spin 0.5 to 1.5 (Re 200, 20 and 32 cells per diameter) and 7 percent high against Kang et al. (1999) at Re 100, spin 1 (St -0.6 percent); drag is 5 to 14 percent high. At spin 2 lift is 11 percent low at 20 cells and 3 percent low at 32; at spin 3 it is 31 percent low, with a spurious unsteady flow (SIM).
- Moving-wall term, wall moving normal to itself (how setBodyRate pitches the section): it produces 2.0 to 2.5 times the physical force (plate plunge and pitch tests, confirmed on the engine), so the lattice's pitch damping and flick response are not quantitative, not even as 2D numbers (SIM).
- 2D flat plate at Re 1000 (48 cells per chord): lift slope 5.14 per rad, 82 percent of 2 pi and 5 percent under a 2D Navier-Stokes reference; drag within 3 percent of that reference up to 15 deg; pressure difference within 1 percent of thin-airfoil theory at mid-chord at 4 deg; above 15 deg, lift and drag 18 to 26 percent high (SIM).
- At the page's Re 3000 the plate's lift slope depends on the grid: 3.61, 4.59 and 4.93 per rad at chord 32, 48 and 64 cells, against 2 pi = 6.28. The default regularised collision lowers it by 11 percent against BGK with Smagorinsky (5.13 at chord 48). Section forces at the page's cell counts carry errors of 10 to 40 percent before any 2D or 3D question (SIM).
- The CHARGER section's centre of pressure is 15 to 18 in from the nose at 2 to 15 deg on both page grids. That is 11 to 18 in ahead of Barrowman's 29 to 33 in and ahead of the 22 in CG, so the 2D section is unstable where the rocket is stable by 4.1 calibres; grid or domain size does not change this (SIM).
- In the page's domain the section's C_N at 5 to 15 deg is about 1.7 times its value in a domain 3.2 times taller (confinement). Used as a 3D coefficient, as the panel does, it is 16 to 35 times Barrowman's, and at the pad inflow floor (u_in 0.03, Re 900) it is higher again (C_N 28.1 at 5 deg against 17.3) (SIM).
- In 2D the fins add normal force mostly as extra circulation on the body, acting 18 to 26 in from the nose rather than at the fins (43.6 in); the fin cells carry 0 to 10 percent of it. Neither a finite-wing (Helmbold, Diederich) nor a slender-body correction turns the section into a 3D stability number (SIM, STD).
- Pitch damping from the section has the right sign, but its 2D magnitude (-dC_m/d(qD/V) 598 to 922 with fins, 761 to 1423 without) is unrelated to Barrowman's C_mq (445 and 88) and falls when fins are added (SIM).
- Software GL (SwiftShader) ran the engine at 1.9 to 9.4 MCUPS on this shared host (13 to 153 steps per second on 320 x 192 to 512 x 160 grids). The page's tier 3 needs about 470 MCUPS, which takes a graphics card (SIM).

## fix:flight

### Fixed
- Jet damping now includes the variable-mass dI/dt term (F1 B04 and F2 G06; I checked both against their evidence). barrowman.jetDamping(mdot, xNozzle, xcg, xProp) returns mdot*((xNozzle-xcg)^2 - (xProp-xcg)^2), citing Thomson 1961 and the RocketPy EoM v0 nozzle term. Without xProp it falls back to the old formula. aeroLoads and computeDerived both pass model.xProp. Effect: the jet term at T+0.249 s drops from 0.0177 to 0.00346 N m s, and the jet share of pitch damping from 21 to 4.9 percent.
- The damping ratio and natural frequency now use the two-degree-of-freedom short period (F1 B06, F2 E09). derived.dampingRatio and derived.naturalFrequency return omega_n = sqrt(C1/I + Z C2/I) and zeta = (C2/I + Z)/(2 omega_n), with Z = (q A C_Na + T)/(m V). This is the value the page and panel already read, so they pick it up with no page edit: 0.138 at 98 ft/s at liftoff mass, against 0.096 for Mandell. Mandell's values remain as dampingRatioMandell and naturalFrequencyMandell. I also added dampingRatio2, naturalFrequency2 and shortPeriod(V, t) for the full breakdown.
- Rail events no longer snap to the 1 ms grid (F1 C02, C10, C12 and F2 B01). A new exported crossing() helper finds the exact crossing inside a step from travel and speed at both ends (cubic Hermite with Newton). The rail exit time and speed are interpolated to that crossing. The step that passes the aft button is split there: rail-constrained before, free after. predictRailExit uses the same interpolation. state.railExitTime and state.railClearTime are new.
- Nose length default changed from 0.232 to 0.200 m, the exposed tangent ogive (F1 A05). I verified it: the CAD profile is within 0.253 mm of a 0.200 m ogive, against 2.53 mm for a 0.232 m one. main.js passes only the fins, so the new default reaches the page without editing main.js. Nose CP becomes 3.67 in, vehicle CP 32.94 in, margin 4.09 cal and body-lift centroid 24.22 in.
- Rail buttons now default to the CAD stations, assembly parts 10 and 11 (F1 C13): aftButtonFromAft 0.1156 m and buttonSpacing 0.4407 m. FIELD 1 says shape and dimensions come from the CAD, and the page's stations belong to the 37 in design. CAD_RAIL_BUTTONS and PAGE_RAIL_BUTTONS are exported, along with BUTTON_SPACING. AFT_BUTTON_FROM_AFT keeps its name with the CAD value. Rail exit speed becomes 43.31 ft/s, or 46.43 ft/s with the PAGE stations.
- CG (F1 F02, the major input defect): engine side only. I exported CG_ESTIMATE_CAD (0.690 m, 0.688 to 0.692 m at the page mass, 0.669 to 0.700 m unscaled, tagged EST) and added derived.staticMarginAt(x), staticMarginCadCg (2.16 cal) and staticMarginCadCgRange (2.01 to 2.47 cal). This lets a page print the margin as a range with the reason. The default CG stays at the PAGE 22 in: FIELD 1 binds it, and the owner still has to answer it, together with the open vx-length flag.
- Tests: I updated the hand vehicle CP to 0.836687 m (was 0.840665 m with the 0.232 m nose) and the finless CP check. I added four tests: CAD rail stations with rail exit speed against an independent 10 microsecond RK4 integration (17 ppm), jet damping against the hand formula, two-degree-of-freedom zeta against the log decrement (0.1440 against 0.1436), and the CG estimate.
- vx/lab/flight.html: the note now states the CAD CG estimate, the CAD rail stations and the exposed nose length, and the centroid reads 24.22 in. I added derived rows for the margin at the CAD CG estimate (EST) and for Mandell zeta next to the two-degree-of-freedom zeta.
- Runner fixes in the scratchpad: validation/F1/variants.mjs no longer throws on jetIdot now that the engine already carries the term. The bridge_run.py copy takes the engine's own release time instead of the hard-coded 0.27 s. I wrote fix-phase copies of the F1 runner (with references read from ENG.DEFAULTS) and of indep.py (nose 0.200 m, variable-mass jet damping, CAD or PAGE rail stations).

### Skipped
- Part-wise pitch inertia (F1 F01, minor, EST). A part-wise inertia only matches the CAD CG (0.69 m), and the CG default is waiting on the owner. Pairing it with the 22 in CG would mix two different mass models. The limit stands: the slender rod reads I 17 to 26 percent high, so omega_n at 30 m/s could be 4.75 to 6.46 rad/s against 5.77 rad/s.
- Switching the default CG, and printing the margin range and its reason on the page (rest of F1 F02). FIELD 1 binds the CG default, the owner question is still open, and the page files (index.html, main.js, story.js) are outside this area. The engine now supplies derived.staticMarginCadCg and its range.
- L2 cylinder gate distance from the inflow edge (lattice-lab.js validateCylinder and shaders.js): lattice area, not flight.
- L3 page domain confinement (lattice.js TIERS together with geom SPAN_FRACTION). This is not a cheap fix: it needs 3.2 times the cells at every tier, or a page decision to print only the pressure picture. Shrinking the body in geom.js alone would cut D to about 12 cells. I left geom.js unchanged.
- Liftoff still lands on the 1 ms grid: the engine starts moving 0.9 ms late. This leaves a 13 microsecond offset in rail exit time and 1.7e-5 in speed. It is not in the defect list and is negligible.
- vx/js/validation/f1-flight.mjs is outside the files I may edit. It hard-codes the 0.232 m nose in its A10 hand reference and the PAGE stations in C11, so it now reports A10 and C11 as FAIL against the fixed engine (38/40). The one-line fixes are 0.466 * ENG.DEFAULTS.noseLength, and a goal built from ENG.DEFAULTS.aftButtonFromAft and buttonSpacing. The fixed copy (fix-flight/runners/f1-flight-fixphase.mjs) passes 42/42. Its B06 label still says Mandell.
- Page copy that is now wrong or stale is outside this area and needs an owner pass. vx/index.html: the Rail buttons row says '2 in, 22 in PAGE'. Method 05 says the case study and CAD agree on the 22 in CG, which the CAD estimate contradicts. The zeta30 row needs a 'two-degree-of-freedom short period' label. The static placeholders 4.15 / 33.10 / 24.42 / 0.094 / 46.6 are overwritten live by main.js with 4.09 / 32.94 / 24.22 / 0.138 / 43.3. vx/README.md repeats the 4.15 cal and 22 in CG agreement.
- F2 E09 still fails, narrowly. The printed zeta is the frozen-coefficient two-degree-of-freedom value: 0.1440 against RocketPy's fitted coast decay 0.1304, +10.4 percent against a 10 percent tolerance (before: -19.9 percent). Against the engine's own constant-speed decay it is -0.09 percent. The gap comes from the speed falling 73 to 57 m/s across the fit window (roughly 6 percent by a slowly-varying-oscillator estimate) and RocketPy's axial drag (2.3 percent, as in E02).
- F2 E11 (gust omega_d against corrected RocketPy) moved from +1.97 to +2.03 percent against a 2 percent tolerance. The F2 attribution puts this on body lift and the drag axis, which are modeling choices; the fixes did not cause it.
- F2 G01: the bridge's S0 step models the old jet damping, so it no longer reproduces the engine (0.075 deg). Its J1 step (engine equations plus variable-mass jet) now matches the engine at 0.000 deg RMS in both cases.
- F1 B07 (time-varying linear model): not rerun. B05, B06 and the F2 E cases cover the same physics after the fix.

### Rerun
Before = benchmark phase, reproduced unchanged in fix-flight/before. After = fixed engine. Each comparison uses the same inputs on both sides; the nose (0.232 to 0.200 m) and rail-button (PAGE to CAD) inputs changed with the fix.

F1 (runners: f1-flight-fixphase.mjs, f1_jet_after.mjs, indep_fix.py + compare_indep.mjs)
| Case | Before | After |
| A05 nose CP vs CAD L-V/A 0.09285 m | 0.10811 m, +16.4 %, FAIL | 0.09320 m, +0.37 %, PASS |
| A10 vehicle CP / margin at PAGE CG | 33.10 in / 4.145 cal | 32.94 in / 4.087 cal (hand 0.836687 m, error 0) |
| Body-lift centroid | 24.42 in | 24.22 in |
| B03 share of a pitch rate the burn removes, in vacuum | 15.4 % (old formula) | 3.18 %; engine vs variable-mass closed form -5.9e-10 |
| B04 jet C2 at T+0.249 s | 0.0177 vs 0.00346 N m s, +412 %, FAIL | 0.003459 vs 0.003459, PASS; jet share 21 to 4.9 %; Mandell zeta 0.121 to 0.102 |
| B05 fitted zeta vs 2-DOF at 31.5 m/s | 0.14205 vs 0.14194 (+0.08 %) | 0.14412 vs 0.14399 (+0.09 %) |
| B06 printed zeta vs simulated decay | 0.1027, -27.7 %, FAIL | 0.14399, -0.09 %, PASS (Mandell 0.1046, -27.4 %) |
| C02 rail exit speed at dt 2/1/0.5/0.25 ms | 14.2764/14.2012/14.1643/14.1645; 1 vs 0.25 ms +0.259 % | 13.19967/13.19965/13.19947/13.19943; +0.0017 % |
| C04 crosswind alpha at rail exit, 1 vs 0.25 ms | -0.243 % | -0.125 % (the runner samples the first grid point after the event) |
| C05 crosswind pitch at T+3 s, 1 vs 0.25 ms | -0.082 % | -0.0006 % |
| C06 gust peak alpha, 1 vs 0.25 ms | -0.175 % | -0.089 % (gust starts at the step end) |
| C10 rail release | at the first 1 ms step past the threshold | split step: 0.266255 s vs exact 0.266242 s |
| C11 no-drag rail exit vs closed form | 14.2204 vs 14.1665, +0.381 % | PAGE stations +0.0016 %; CAD stations 13.2110 vs 13.2108, +0.0017 % |
| C12 rail exit vs exact scipy crossing | 14.2012 vs 14.1526, +0.343 %, FAIL | PAGE 14.15285 vs 14.15263, +0.0016 %; CAD 13.19965 vs 13.19943, +0.0017 %, PASS |
| C13 rail stations | PAGE stations on the CAD airframe, 46.6 vs 43.4 ft/s, FAIL | CAD stations by default, 43.31 ft/s |
| D04 10 mph wind vs scipy | apogee +0.0032 %, downrange -0.17 %, pitch T+3 -12.296 vs -12.309 deg | apogee -0.0009 %, downrange -0.006 %, pitch T+3 -12.3899 vs -12.3906 deg |
| D05 gust vs scipy | downrange -0.13 %, pitch T+3 -4.045 vs -4.051 deg | downrange -0.085 %, pitch T+3 -4.1535 vs -4.1574 deg |
| C01/C03/C08/D01/E sensitivities | pass | identical values, pass |
| Still-air apogee / CD_FIT | 1032.99 ft / 0.6339 | 1032.99 ft / 0.6339 (unchanged) |

F2 (RocketPy 1.13.0; RPc = RocketPy with its two errors corrected; pipeline rerun in fix-flight/F2-after)
| Case | Before | After |
| A03 nose CP vs RocketPy exact ogive | +0.6 mm | +0.74 mm |
| A05 static margin | 4.1453 vs 4.1429 cal | 4.0866 vs 4.0837 cal |
| B01 rail exit vs RocketPy exact | 14.2012 vs 14.1527, +0.343 % | 13.19965 vs 13.19948, +0.0013 % |
| B03 rail exit time | 0.249 s recorded | 0.235537 vs 0.235531 s |
| B06 still-air apogee | -0.0055 % | -0.0055 % |
| C04 / C06 wind pitch at burnout / T+3 vs RPc | +0.011 / +0.037 deg | -0.020 / -0.036 deg |
| C08 / C10 wind downrange / apogee vs RPc | -0.83 % / +0.065 % | +0.12 % / +0.034 % |
| C14 wind RMS pitch vs RPc | 0.126 deg | 0.141 deg |
| D02 gust peak alpha vs RPc | -1.7 % | -1.7 % |
| D06 / D08 gust pitch T+3 / downrange vs RPc | -0.006 deg / -0.31 % | -0.046 deg / +0.66 % |
| E02 coast zeta vs RocketPy | 0.1311 vs 0.1282, +2.3 % | 0.1334 vs 0.1304, +2.3 % (drag axis) |
| E05 boost omega_d vs RPc | -0.009 % | +0.10 % |
| E07 boost zeta vs RPc | 0.1099 vs 0.1015, +8.35 %, FAIL | 0.1081 vs 0.1034, +4.48 %, PASS |
| E09 printed zeta vs RocketPy coast decay | 0.1027 vs 0.1282, -19.9 %, FAIL | 0.1440 vs 0.1304, +10.4 %, FAIL against 10 % (frozen-coefficient value) |
| E10 printed omega_n | -4.2 % | -3.5 % |
| E11 gust omega_d vs RPc | +1.97 % | +2.03 % (tolerance 2 %) |
| G06 jet C2 at T+0.258 s | 0.01787 vs 0.00349 N m s (x5.12) | 0.003492 vs 0.00349 (+0.06 %) |
| Bridge J1 (engine + variable-mass jet) vs engine | n/a | 0.000 deg RMS pitch |

The cases against RocketPy as distributed (C03, C05, C07, C13, D05, D07, D13, E06) still fail because of RocketPy's own burn-phase errors. Totals: F2 analysis 53 pass, 10 fail plus G01, 16 informational. Fixed F1 runner copy 42/42. Repo F1 runner 38/40 (A10 and C11 references are stale, see skipped). flight.test.mjs 26/26. Step rate: about 53,000 to 127,000 RK4 steps/s in node; RocketPy 1.6 to 4.5 s per flight.

## fix:lattice

### Fixed
- L1 D1 (medium), outflow edge unstable at tau near 1/2: outflow and inflowNeq cells now carry the neighbour's non-equilibrium part projected on its second-order Hermite moment (Latt et al. 2008) instead of the raw copy (shaders.js STEP_FRAG). Plain BGK at tau 0.505 is now steady to 120,000 and 200,000 steps. All 9 stabiliser settings at tau 0.505 are steady (before: 5 failed).
- L1 D2 (high), grid-scale noise at u_in 0.10 and Re 3000: added a speed cap U_CAP 0.05 in setInflow. A faster request runs at the cap, and the body rate is scaled by the same factor so the reduced rate is kept. RE_TARGET is now 1500 at U_REF 0.05, which keeps the page's tau0; stats.re now reads 900 to 1,500. Benches can raise the cap with setStabilisers({speedCap}) or createLattice({speedCap}). Noise beside the body fell from 18 to 19 percent of u_in to under 0.04 percent. Wall cells now run at 1.10, 1.19 and 1.25 nu0 at alpha 0, 5 and 10 (before 1.31 to 1.69).
- L1 D4 (low), float32 accuracy floor: both precision paths now store and compute f_i - w_i (shifted rho - 1 and shifted f_eq; Lehmann et al. 2022). fields.storage = 'f - w', and the L1 and L2 readers were updated. GPU against the float64 port now agrees to 1.8e-6 and 3.4e-6 (before 5.6e-6 and 2.8e-5). The H64 channel now converges to the wall theory (L2 1.41e-4, order 1.96).
- L3 defect 1 (major), pitch rate acting as transpiration: setBodyRate now defaults to a body-frame model. The walls are at rest, the edges get the local free stream u_in - Omega x r, and Coriolis, centrifugal, Euler and frame-acceleration forces (du_in/dt + Omega x u_in) are added by Guo forcing. The regularised collision keeps the first moment -F/2. setBodyRate(omega, 'wall') keeps the moving-wall model for spinning cylinders, and the lab and l3-lift.js use it for cylinders. The frame-acceleration term turned out to be required: without it the plate pitch ratio was 1.44 and an empty rotating domain drifted by 29 percent of u_in. Plate pitch ratio is now 0.380 against theory 0.5 (before 1.189), the same on the GPU engine (0.379). The remaining shortfall is listed under skipped.
- L2 defect 1 (moderate), gate stopped before shedding saturated: validateCylinder now runs 60,000 steps and averages whole saturated cycles (l2-analysis.js analyseUnsteady). It reports saturated, error, pass and passed against unconfined 2D references (CYLINDER_REF, Parvar et al. 2023 Table 1) with 5, 5 and 15 percent tolerances.
- L2 defect 3 (moderate), gate cylinder too close to the inflow edge: the default layout is now 768 x 192 with the cylinder 16 D behind the inflow edge (layout=contract keeps FIELD.md's 512 x 192). Saturated result: C_D 1.3690 (+3.7 percent), St 0.1638 (-0.7 percent), C_L amplitude 0.3229 (+1.5 percent). It passes.
- L2 defect 5 (minor), developed flag too early: forces now count as developed only after the free stream has travelled 1.5 body lengths since the last reset or inflow jump (DEV_PASSES). Added force.mean, the developed means over the last chord pass, plus stats.travelPasses, omega and omegaTarget. Engine check: developed at step 3,150 against 3,120 expected.
- Lab and runner support: the lab's rate slider uses wall mode for the cylinder and frame mode otherwise. The readout shows the speed cap and the body-rate mode. Lab defaults and labels now say 0.05 and Re 1500. The stabiliser note in lattice.html was updated. The lattice.js header now carries BODY RATE, DEVELOPED, inflow-edge, measured section CP and post-fix stability gate sections. The L1 eddy runner records the speed that actually runs.

### Skipped
- L1 D3 and L2 defect 4 (low and moderate), the inflow edge is a pressure anchor rather than a velocity inlet: documented in the header. inflowNeq is the velocity inlet for benches. Referring c_n and c_m to the delivered speed needs a second readback and a panel change (vx/js/panel is outside this area). Delivered speed one cell inside the edge is now 97.9 and 96.3 percent of u_in at alpha 5 and 10.
- L2 defect 2 (moderate), the gate's reference window in the page copy: vx/index.html and vx/README.md are outside this area, and copy changes go to the owner. The gate's own reference values in lattice-lab.js were replaced. Stale page copy: the 1.450 / 0.169 figures and the 1.35-1.55 / 0.16-0.18 window (now 1.369 / 0.164 against 1.320 / 0.165), Re 3,000 (now 900 to 1,500), and u_in 0.03 to 0.10 (runs 0.03 to 0.05).
- L3 defect 3 (major), the CP / CM LATTICE 2D panel rows and 'as a cross-check' in the Method: the files are vx/index.html, vx/js/panel/panel.js and vx/js/main.js, all outside this area, and copy goes to the owner. The engine header now states the measured CP (15 to 18 in against Barrowman's 29 to 33 in) and says the section is not a cross-check.
- L2 defect 6 and L3 defect 2 (minor), staircase walls and Magnus lift above spin 1.5: Bouzidi interpolated bounce-back needs per-link wall distances, a second cell texture and an API addition, so it is not cheap. The page caps wall speed at 0.05. The wall-mode Magnus regression run is unchanged (C_L 2.6623 against 2.6622 before).
- L3 defect 4 (minor), the page domain is 0.47 rocket lengths tall: the tier grids are fixed by the contract (FIELD 4 and 5), and a square domain costs 3.2 times the cells. Documented.
- L3 defect 5 (minor), the regularised collision costs lift: the collision was not changed. At the page's new top Re of 1500 the cost is 4.1 percent of the plate lift slope (5.087 against 5.302). At Re 3000 it is 10.2 percent on the fixed engine.
- L3 defect 1, the remaining part: plate pitch-rate lift reaches only 75 percent of the thin-airfoil value (ratio 0.380 against 0.5 at c/4, 0.125 against 0.25 at c/2). Its dependence on the pivot is correct (5.26 per chord against the static slope 5.18). The shortfall does not change with grid (chord 32 and 48), Re (1000 and 3000) or domain size (12 and 24 chords). The frame forcing passes two exact checks: an empty rotating domain holds to 0.9 percent of u_in, and a spinning cylinder's torque matches the moving-wall case to 0.5 percent. The cause was not found. The section's pitch damping is not a damping derivative, and this is documented.

### Rerun
case | reference (source) | before | after | verdict
L1 D1: BGK tau 0.505, H16, Re 10, no stabilisers (D505-plain+none) | steady parabola, wall theory L2 2.4e-3 (Ginzburg and d'Humieres 2003) | unsteady: max|u| 68.5 u_in, L2 0.118 at 120k steps | steady to 120k steps: L2 2.44e-3, max|u| 1.50 u_in | pass
L1 D1: B-plain-t0.505, 200k steps | same | max|u| 48.9 u_in, L2 0.110 | steady, L2 2.44e-3 | pass
L1 D1: B-contract-t0.505 (BGK + Smagorinsky) | same | max|u| 9.41 u_in, L2 0.024 | steady, L2 2.59e-3 | pass
L1 verdict 23: 9 stabiliser settings at tau 0.505 | all steady | 5 of 9 unsteady | 0 of 9 (plain BGK nu +5.1 percent from curvature; regularised -0.01 percent) | pass
L1 D4: GPU vs float64 port, H16, tau 0.8 / 0.6 | float64 port, same edge rule (L1 lbm_ref.py; FIX lbm_ref_fix.py) | 5.6e-6 / 2.8e-5 of u_max | 1.8e-6 / 3.4e-6 | pass (tolerance 1e-5)
L1 D4: H64 channel, tau 0.6 | wall theory L2 1.4e-4, order 2 | L2 2.37e-4, stopped at the 2,300 s cap after 147,456 steps; order 1.21 | L2 1.41e-4, converged at 20,480 steps (167 s); orders 2.00 and 1.96 | pass
L1 D2: page section tier 1, alpha 0 | wall cells within 20 percent of nu0; noise below 2 percent of u_in (L1 D2 targets) | u_in 0.10: wall 1.31 nu0, effective Re 2,283 vs stated 3,000, noise 19 percent, stress/velocity strain 4.1, 1,045 floor cells | cap 0.05: wall 1.105 nu0, effective Re 1,358 vs stated 1,500, noise 0.006 percent, strain ratio 0.98, 0 floor cells | pass
L1 D2: alpha 5 | same | wall 1.57 nu0, Re 1,910, noise 18 percent, strain ratio 3.7, 3,679 floor cells | wall 1.19 nu0, Re 1,263, noise 0.015 percent, strain ratio 0.98, 0 floor cells | pass
L1 D2: alpha 10 | same | wall 1.69 nu0, Re 1,771, 8,137 floor cells, max|u| 0.241 | wall 1.25 nu0, Re 1,199, noise 0.033 percent, 10 floor cells, max|u| 0.171 (leeward vortex, local Ma 0.30) | noise pass; wall 5 points over the limit
L1 D3 (not fixed): speed one cell inside the inflow edge, alpha 5 / 10 | u_in | 96.8 / 95.0 percent (u_in 0.10) | 97.9 / 96.3 percent (u_in 0.05) | fail, documented
Stability gate: stand-in, tier 3, alpha 15, 20k steps | no bad cell (validateStability) | u 0.10 Re 3000: clean, max|u| 0.355, max|rho-1| 0.159; plain BGK+Smag blew up within 8k steps | new default u 0.05 Re 1500: clean 0.185 / 0.069; plain BGK+Smag clean 0.255 / 0.083; u 0.10 Re 3000 clean 0.279 / 0.126 | pass
L2: cylinder gate, Re 100, D 24 | unconfined 2D C_D 1.320, St 0.165, C_L amp 0.318 (Parvar et al. 2023, Table 1); tolerances 5 / 5 / 15 percent | printed 1.4504 / 0.1694 / 0.319 at 20k steps, unsaturated, 5.3 D upstream; saturated 1.4731 / 0.1720 / 0.359 | default layout (16 D upstream), saturated: 1.3690 (+3.7) / 0.1638 (-0.7) / 0.3229 (+1.5); contract layout: 1.4733 / 0.1720 / 0.3593 | pass (default); contract fails C_D, documented
L2: gate GPU vs transcription, far layout, 12k steps | 1e-3 | n/a | max |dC| 5.3e-5 | pass
L2: developed flag | stationary one-pass means after about 1.5 chord passes (L2 section 9) | 2,000 steps = 0.59 chord passes (tier 1, u 0.10); one-pass C_m 31 to 53 percent low | 1.5 passes (10,137 steps at tier 1 at the cap); engine check: developed at 3,150 vs 3,120 expected; force.mean from 5,250 vs 5,230 | pass
L3 D1: plate pitch rate, pivot c/4, chord 48, Re 1000 | (dc_l/dQ)/(dc_l/dalpha) = 0.5 (thin-airfoil, Anderson ch. 4) | 1.189 | 0.380 | fail at 15 percent (-24 percent; was +138)
L3 D1: pivot c/2 | 0.25 | 0.638 | 0.125 | fail (-50 percent; was +155)
L3 D1: dc_m about c/4 per dQ | -0.324 (theory with the measured slope) | -0.711 | -0.246 | 0.078 off (was 0.385)
L3 D1: pivot slope of dc_l/dQ | equals the static slope, 5.18 | 10.6 per chord | 5.26 per chord | pass
L3 D1: engine on SwiftShader, chord 32 (pqg-qc) | 0.5 | 1.184 | 0.379 (transcription 0.379) | fail, same shortfall
L3 D1: robustness | n/a | n/a | Re 3000: 0.375; 24-chord domain: 0.363 | not grid, Re or confinement
Rotating frame: empty domain, Omega 1e-4 | rigid rotation plus uniform stream | n/a | 0.9 percent of u_in, |rho-1| < 5e-5 (without the frame-acceleration term: 29 percent) | pass
Rotating frame: spinning cylinder in still fluid | moving-wall torque 0.08410 (exact for this case); 2D theory 0.0804 | n/a | 0.08452 (0.5 percent off) | pass
L3: section pitch damping -dC_m/d(qD/V), alpha 5 | 2D thin plate 23.6; Barrowman C_mq 445 / 88 | page grid: fins 695, no fins 1,423 (u 0.10) | 1,379 / 1,417 (u 0.10); 2,015 / 1,679 at the cap; tall domain 733 / 749 (before 795 / 954) | informative; not a damping derivative
L3 regression: Magnus Re 200, spin 1 (wall mode) | C_L 2.688 (Mittal and Kumar 2003) | C_L 2.6622, C_D 1.1860, St 0.18958 | 2.6623, 1.1859, 0.18958 | unchanged
L3 D5 (collision not changed): plate lift slope, regularised vs BGK+Smag | same-grid BGK+Smag | Re 3000: 4.586 vs 5.134 (-10.7 percent) | Re 3000: 4.531 vs 5.047 (-10.2); Re 1500 (page top): 5.087 vs 5.302 (-4.1) | documented
Equivalence of the fixed engine | GPU vs CPU transcription | n/a | pitching plate 4.2e-5; plate 5.7e-5; Magnus 6.9e-4; CHARGER with rates 5.7e-4 until round-off divergence at step 1,550 | pass
Flight tests (node vx/js/flight/flight.test.mjs) | 26 tests | n/a | 26/26 passed | pass

## Page-ready paragraph, limits, contradicted statements, open defects

PAGE-READY PARAGRAPH (Method 07, to replace the gate paragraph that starts "The lattice's gate is a cylinder 24 cells across"; check-writing.py clean):

Both models were checked against published references, closed forms and an independent code (lab: Validation). The flight model's Barrowman terms matched the 1966 equations to 1e-6 SIM and Centuri's JAVELIN worked example to 0.12 percent SIM. RocketPy 1.13.0, a six-degree-of-freedom code flown with the same inputs, landed within 0.006 percent of the apogee SIM and within 0.02° of the weathercock angle in a crosswind of 10 mph EST SIM. That checks the arithmetic, not the inputs: the 22 in CG comes from the 37 in three-fin design PAGE, and a part-wise estimate of the CAD airframe puts it near 27.2 in EST, which would cut the margin from 4.09 cal SIM to about 2.2 cal EST. The lattice reproduced channel flow at second order in the grid spacing SIM. With domain and grid effects removed, a cylinder at a Reynolds number of 100 STD gave a drag coefficient of 1.318 and a Strouhal number of 0.161 SIM, against 1.320 and 0.165 in published 2D results (Parvar et al. 2023, Table 1) STD. The gate, a cylinder 24 cells across placed 16 diameters behind the inflow edge EST, read 1.369 and 0.164 SIM. The rocket's section did not agree with Barrowman: its center of pressure sat 15 to 18 in from the nose SIM, ahead of the CG, where Barrowman puts it at 29 to 33 in SIM, and no standard 3D correction closed the gap. So the section shows the air, and its forces are not a check on the flight model. The runs used software rendering (SwiftShader) and float32 CPU copies of the lattice step, so their speeds say nothing about a graphics card.
(Sources: F1 A06 to A19; F2 B06 and C04 re-run after the flight fix, -9.474 against -9.454 deg; F1 F02 with derived.staticMarginCadCg 2.16 cal, range 2.01 to 2.47; L1 rows 6 to 8 and L1-F3; L2 section 5; the fix-lattice gate in the default 768 x 192 layout, saturated; L3 section 5.)

NOTE: SUMMARY.md was NOT written. This environment blocks a subagent from writing report .md files, so its content is below.

LIMITS THE PAGE MUST STATE (the full list of 25 lattice and 17 flight limits is on the lab page):
(1) The inflow is now capped at u_in 0.05, so the lattice Re runs from 900 to 1,500, not 3,000. The real rocket is near 3e5. The wall cells carry 10 to 25 percent extra viscosity (effective Re 1,200 to 1,360).
(2) The section is a 2D picture. Its CP sits 15 to 18 in from the nose against Barrowman's 29 to 33 in, at any grid or domain. As a 3D coefficient its C_N is 16 to 35 times Barrowman's, and the page's domain inflates it about 1.7 times.
(3) Pitch rate now runs in the body frame. A pitching plate gets 0.380 of its lift slope per unit Qc/V against 0.5 from theory. The section's damping (1,379) is not the rocket's C_mq (445), so the ?lab "lattice flies it" damping is not quantitative.
(4) One cell inside the inflow edge the speed is 97.9 / 96.3 percent of u_in at alpha 5 / 10, so c_n and c_m read about 4 / 8 percent low.
(5) Forces count as developed after 1.5 body lengths of travel (10,137 steps at tier 1) and are shown as chord-pass means. Single readings scatter by about 22 percent (C_N) and 66 percent (C_m).
(6) Gate: 1.369 (+3.7 %) and 0.164 (-0.7 %) in the default layout. The contract layout reads 1.473 (+11.6 %) and 0.172 (+4.2 %). Blockage ranges do not apply because the side edges are open.
(7) Staircase walls give a grid error of several percent at 16 to 39 cells across.
(8) SwiftShader ran 0.6 to 9.4 MCUPS, while tier 3 needs about 470.
(9) The CG comes from the 37 in design. The CAD estimate is 27.1 to 27.2 in, giving a margin of 2.16 cal (2.01 to 2.47) against 4.09.
(10) The slender-rod inertia is 17 to 26 percent high, so the pitch frequency may read 7 to 11 percent low.
(11) The printed zeta is now the 2-DOF value, within 0.1 percent of the simulated decay. Zeta is 0.39 to 1.0 during the burn; Mandell reads 27 percent low.
(12) Rail exit is 43.3 ft/s with the CAD rail buttons. The case study's stations would give 46.4.
(13) Barrowman and RocketPy agreeing validates the implementation, not the method. The fin slope is incompressible: 1.3 percent low at Mach 0.26.
(14) cd 0.634 is fitted to the 37 in design's simulated apogee. A component estimate gives 0.44 to 0.66 and 1,027 to 1,159 ft. There is no flight data.
(15) ISA instead of constant density would add 0.38 percent (3.9 ft) of apogee.
(16) Apogee sensitivity: impulse ±3 % gives +4.2 / -4.3 %; mass ±5 % gives -5.5 / +5.7 %; cd ±10 % gives -3.1 / +3.3 %.

PAGE STATEMENTS THE VALIDATION CONTRADICTS (vx/index.html, quoted; changing them is the owner's call):
- Appendix: "The lattice runs at 900 to 2,800 ... So the lattice is a cross-check".
- Method intro: "measures the force on the section as a cross-check".
- Method 02: "Its walls use halfway bounce-back with the moving-wall term, so the body's pitch rate reaches the air (Ladd 1994)". Now body frame; the moving-wall model over-read 2.0 to 2.5 times.
- Method 02: "set for a lattice Reynolds number of 3,000 at an inflow of 0.10 lattice units". Now 1,500 at 0.05, same tau0.
- Method 02: "The outflow edges hold the density at 1 and extrapolate the rest (Guo, Zheng and Shi 2002)". Now regularized after Latt et al. 2008.
- Method 02: "Until those first steps are over ... the panel's lattice readouts show a dash". Now waits for 1.5 body lengths of travel.
- Method 02: "They are a cross-check, not an input".
- Method 03: "set for a Reynolds number of 3,000 at an inflow u_in of 0.10 ... about 2,800 at CHARGER's peak airspeed".
- Method 03: "once developed (after about 2,300 steps)" and "where Barrowman gives 33.1 in". Now 32.94 in.
- Method 03: "held between 0.03 and 0.10". Runs at most 0.05.
- Method 07: "for 12 percent blockage the gate takes a drag coefficient of 1.35 to 1.55 and a Strouhal number of 0.16 to 0.18" and "1.450 ... 0.169 ... after 20,000 steps, both inside the ranges". Those values were pre-saturation; saturated they are 1.473 / 0.172 (+11.6 / +4.2 % against unconfined); the gate now reads 1.369 / 0.164.
- Glossary: "shown for the picture and as a cross-check".
- Configuration: "Reynolds number 900 to 2,800 ... set for 3,000 at u_in 0.10" and "Inflow speed 0.03 to 0.10". The rail-exit row should say the CAD rail buttons are used.
- Static HTML fallbacks that main.js overwrites with live values: 4.15 (live 4.09), 4.64 (4.58), 33.10 (32.94), 4.26 (3.67), 24.42 (24.22), 0.094 (0.138), 46.6 (43.3).
- Also: vx/README.md lines 8, 10, 25 and 120; panel.js lines 109 to 111 (the CP / LATTICE 2D and CM / LATTICE 2D rows); the main.js line 682 comment; the flight.js header claim that the lattice moment carries moving-wall damping.

OPEN DEFECTS NOT FIXED:
Lattice:
- Major: page copy and the panel rows (owner).
- Major: body-frame pitch-rate lift is 24 to 50 percent short; cause not found.
- Moderate: the inflow edge is a pressure anchor, so coefficients read 4 to 8 percent low.
- Minor: staircase walls, and Magnus lift 11 to 31 percent low above spin 1.5.
- Minor: the domain is 0.47 rocket lengths tall.
- Minor: the regularized collision costs 4 % of lift slope at Re 1,500 and 10 % at Re 3,000.
- Minor: wall cells at 1.25 nu0 at alpha 10.
- Minor: the developed flag is 1.5 D/u for cylinders.
Flight:
- Major: the CG needs a measurement from the owner.
- Minor: inertia estimate (EST).
- Minor: stale flight.js header comment.
- Marginal fails, not model defects: F2 E09 +10.4 % (tolerance 10 %) and E11 +2.03 % (tolerance 2 %).
Runner state: the F2 bridge's S0 end still carries the pre-fix jet term. Its J1 variant reproduces the fixed engine to 0.000 deg; the lab page shows G01 against J1 and says so.

WHAT WAS BUILT:
- vx/lab/validation.html shows one table per track: case, reference and source (short label, full citations under each table), measured value with any pre-fix value marked "before", error, tolerance, and result. It also has the measured limits, the open defects, the two fix phases, the methods (two paragraphs per track), links to the bench pages, and a filter (all / fail only / measured after the fix).
- The page renders from vx/js/data/validation.js (export const VALIDATION: run date 2026-10-23, run windows per track, the software-GL note, 351 rows). Current results: 230 pass, 91 fail, 30 informational. Benchmark phase: L1 26/4, L2 43/33, L3 42/44, F1 50/7/13, F2 52/11/16.
- The data file is generated by the scratchpad script publish/gen_validation.py from the per-case JSON.
- vx/lab/index.html gained a 06 Validation entry. No commits.

## Files

/home/user/merttureli-site/vx/lab/validation.html
/home/user/merttureli-site/vx/js/data/validation.js
/home/user/merttureli-site/vx/lab/index.html
/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/publish/gen_validation.py
/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/validation/lab
/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/reports/validation/lab/index
/tmp/claude-0/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/scratchpad/publish/shots

## Harness

node harness/check.cjs vx/lab/validation.html --out reports/validation/lab --steps 3 --viewports 1440x900,390x844: CLEAN (main and reduced-motion passes at both viewports; no console errors, page errors or failed requests; overflow-x false at both widths; LCP 44 to 112 ms; 21 headings). node harness/check.cjs vx/lab/index.html --out reports/validation/lab/index, same options: CLEAN (overflow-x false at both widths; the new 06 Validation row renders at desktop and phone). The first run of the validation page flagged overflow-x at 390 px: the header h1 and nav were 46 px too wide. The narrow layout now sets the h1 at 10 px with caps spacing, and the re-run was CLEAN. I looked at all 16 harness PNGs plus targeted shots in scratchpad publish/shots (summary table, limits, defects, fix phases, an L1 FIX row with its before value, phone card view with the Fail filter on L3, F1 with the after-fix filter). Text is legible; FAIL badges use livery orange with paper text; tables become cards on the phone, with no horizontal scroll. One defect from the screenshots was fixed: the row-count text was styled as a filter pill. The sticky fieldset was replaced by a radiogroup div, which is static on the phone. check-writing.py was clean on the page and on all rendered data text. node --check passed on the inline module and the data file.

