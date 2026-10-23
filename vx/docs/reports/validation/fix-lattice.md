# Fix phase, area lattice

Engine: vx/js/lattice/lattice.js, shaders.js, lattice-lab.js (branch claude/charming-pascal-wgx7a3, uncommitted), 2026-10-23. Lattice units unless stated. Every after value below comes from the fixed engine: on SwiftShader where the run fits the budget, else from the CPU transcription of the fixed step (scratchpad validation/FIX/lbmfix.c), which matches the engine to 4e-5 in the force coefficients over 2,000 steps of a pitching plate, 5.3e-5 over 12,000 steps of the cylinder gate, 6.9e-4 over 3,000 steps of a spinning cylinder, and gives the same plate pitch ratio as the engine to four digits (0.3791). Per-case JSON: reports/validation/fix-lattice/ (L1/ for the GPU channel and page cases).

## What changed in the engine

1. Outflow (and inflowNeq) edge cells carry the neighbour's non-equilibrium part projected on its second-order Hermite moment (Latt, Chopard, Malaspinas, Deville and Michler 2008, Phys. Rev. E 77, 056703) instead of the raw copy (L1 D1).
2. Shifted storage and arithmetic on both precision paths: the textures hold f_i - w_i, rho - 1 is summed from them and f_eq - w_i is computed in shifted form (Lehmann et al. 2022, Phys. Rev. E 106, 015308) (L1 D4). Readers: fields.storage = 'f - w'.
3. Speed cap U_CAP 0.05: a faster setInflow runs at 0.05 with the body rate scaled alike (reduced rate kept); RE_TARGET 1500 at U_REF 0.05 keeps the page's tau0 (L1 D2). setStabilisers({speedCap}) and createLattice({speedCap}) raise it for benches.
4. Body rate in the body frame by default: walls at rest, edges at u_in - Omega x (r - r_cg), Coriolis, centrifugal, Euler and frame acceleration (du_in/dt + Omega x u_in) by Guo, Zheng and Shi 2002 forcing; setBodyRate(omega, 'wall') keeps the moving wall for spinning cylinders (L3 defect 1). The frame-acceleration term was found necessary in this phase: without it the far field of a steady pull-up is inconsistent (empty rotating domain departs by 29 percent of u_in; plate pitch ratio 1.44 and 1.25).
5. Developed flag after 1.5 body lengths of free-stream travel since the last reset or inflow jump; force.mean = means over the last chord pass (L2 defect 5).
6. Cylinder gate: run to saturation (60,000 steps), whole saturated cycles (l2-analysis.js), default layout 768 x 192 with the cylinder 16 D behind the inflow edge, references unconfined 2D values (L2 defects 1 and 3); layout=contract keeps FIELD.md's 512 x 192.

## Before and after

| case | reference (source) | before | after | tolerance | result |
|---|---|---|---|---|---|
| L1 D1: BGK, tau 0.505, H 16, Re 10, no stabiliser | steady parabola; wall theory L2 2.4e-3 (Ginzburg and d'Humieres 2003) | unsteady: max abs u 68.5 u_in, L2 0.118 at 120,000 steps | steady to 120,000 steps: L2 2.44e-3, max abs u 1.50 u_in | steady, L2 within 20 percent of 2.4e-3 | pass |
| L1 D1: same, 200,000 steps (B-plain) | as above | max abs u 48.9 u_in, L2 0.110 | steady, L2 2.44e-3 | as above | pass |
| L1 D1: BGK + Smagorinsky 0.12 (B-contract) | as above | max abs u 9.41 u_in, L2 0.024 | steady, L2 2.59e-3 | as above | pass |
| L1 verdict 23: nine stabiliser settings at tau 0.505 | every setting steady (L1 report) | 5 of 9 unsteady | 0 of 9 unsteady (plain BGK reads nu +5.1 percent from curvature, regularised -0.01 percent) | all steady | pass |
| L1 D4: GPU against float64 port, steady channel H 16, tau 0.8 / 0.6 | float64 CPU port of the same scheme (L1 lbm_ref.py; FIX lbm_ref_fix.py with the new outflow rule) | 5.6e-6 / 2.8e-5 of u_max | 1.8e-6 / 3.4e-6 | 1e-5 of u_max | pass (was fail at tau 0.6) |
| L1 D4: H 64 channel, tau 0.6, Re 10 | wall theory L2 1.4e-4; order 2 (He et al. 1997; Ginzburg and d'Humieres 2003) | L2 2.37e-4, stopped at the 2,300 s cap after 147,456 steps; order H 32 to 64: 1.21 | L2 1.41e-4, converged at 20,480 steps (167 s); order 2.00 and 1.96 | order 2 +- 0.3 | pass |
| L1 D2: page section tier 1, alpha 0 | wall cells within 20 percent of nu0, free-stream noise below 2 percent of u_in (L1 D2 targets) | u_in 0.10: wall 1.31 nu0, effective Re 2,283 (stated 3,000), noise beside the body 19 percent, stress strain 4.1 x velocity strain, 1,045 cells at the speed floor | cap 0.05: wall 1.105 nu0, effective Re 1,358 (stated 1,500), noise 0.006 percent, strain ratio 0.98, 0 floor cells | as stated | pass |
| L1 D2: alpha 5 | as above | wall 1.57 nu0, Re 1,910, noise 18 percent, strain ratio 3.7, 3,679 floor cells, max abs u 0.196 | wall 1.19 nu0, Re 1,263, noise 0.015 percent, strain ratio 0.98, 0 floor cells, max abs u 0.104 | as above | pass |
| L1 D2: alpha 10 | as above | wall 1.69 nu0, Re 1,771, 8,137 floor cells, max abs u 0.241 | wall 1.25 nu0, Re 1,199, noise 0.033 percent, 10 floor cells, max abs u 0.171 (leeward vortex core, local Ma 0.30) | as above | noise pass, wall 5 points over |
| L1 D3 (not fixed): speed one cell inside the inflow edge, alpha 5 / 10 | u_in (edge rule) | 96.8 / 95.0 percent (u_in 0.10) | 97.9 / 96.3 percent (u_in 0.05) | 2 percent | fail, documented |
| Stability gate: stand-in, tier 3, alpha 15, 20,000 steps | no bad cell (lattice-lab validateStability) | u_in 0.10, Re 3000: clean, max abs u 0.355, max abs (rho - 1) 0.159; plain BGK + Smagorinsky blew up within 8,000 steps | u_in 0.05, Re 1500 (the gate's new default): clean, 0.185, 0.069; plain BGK + Smagorinsky: clean, 0.255, 0.083; u_in 0.10, Re 3000: clean, 0.279, 0.126 | clean | pass |
| L2: cylinder gate, Re 100, D 24 | unconfined 2D C_D 1.320, St 0.165, C_L amplitude 0.318 (Parvar et al. 2023, arXiv:2303.09262, Table 1) | printed C_D 1.4504, St 0.1694, C_L amplitude 0.319 after 20,000 steps (unsaturated, 5.3 D behind the inflow edge, window 1.35 to 1.55 / 0.16 to 0.18); saturated 1.4731, 0.1720, 0.359 | default layout, saturated (10 cycles of 20): 1.3690 (+3.7 percent), 0.1638 (-0.7 percent), 0.3229 (+1.5 percent); contract layout saturated: 1.4733 (+11.6), 0.1720 (+4.2), 0.3593 (+13.0) | 5 / 5 / 15 percent (L2, set before its runs) | pass (default layout); contract layout fails C_D, documented |
| L2: developed flag | stationary forces (L2 section 9: one-pass means within 0 to 10 percent after 1.5 chord passes) | 2,000 steps after a reset = 0.59 chord passes (tier 1, u_in 0.10), one-pass C_m 31 to 53 percent low | 1.5 chord passes: 10,137 steps at tier 1 at the cap; engine check: developed at 3,150 steps against 3,120 expected, force.mean from 5,250 against 5,230 | flag at 1.5 passes | pass |
| L3 defect 1: plate pitch rate, pivot c/4, chord 48, Re 1000 | (dc_l/dQ) / (dc_l/dalpha) = 3/4 - h = 0.5 (thin-airfoil theory, Anderson ch. 4) | 1.189 | 0.380 | 15 percent | fail (-24 percent; was +138) |
| L3 defect 1: pivot c/2 | 0.25 (same) | 0.638 | 0.125 | 15 percent | fail (-50 percent; was +155) |
| L3 defect 1: dc_m about the c/4 pivot / dQ | -0.324 (thin-airfoil with the measured slope) | -0.711 | -0.246 | 0.05 absolute | fail (0.078 off; was 0.385) |
| L3 defect 1: dependence of dc_l/dQ on the pivot | equal to the static lift slope, 5.18 per rad (theory) | 10.6 per chord | 5.26 per chord | 10 percent | pass |
| L3 defect 1: engine on SwiftShader, chord 32 | 0.5 | 1.184 | 0.379 (transcription 0.379) | 15 percent | fail, same as above |
| L3 defect 1: robustness of the shortfall | none | | Re 3000: 0.375; domain 24 chords tall, 6 upstream: 0.363 | | not resolution, Re or confinement |
| Rotating frame, empty domain, Omega 1e-4 | rigid rotation plus uniform stream, uniform pressure (kinematics) | | 0.9 percent of u_in, abs (rho - 1) under 5e-5 (without the frame-acceleration term: 29 percent) | 2 percent | pass |
| Rotating frame, spinning cylinder in still fluid | moving-wall torque (exact here), 0.08410; 2D theory 4 pi mu R^2 Omega 0.0804 | | 0.08452 (0.5 percent) | 2 percent | pass |
| L3: section pitch damping -dC_m/d(qD/V), alpha 5, page grid | 2D thin plate as long as the rocket 23.6; Barrowman C_mq 445 (fins) and 88 (no fins) (L3 report) | fins 695, no fins 1,423 (u_in 0.10) | 1,379 and 1,417 (u_in 0.10); 2,015 and 1,679 at the cap; tall domain 733 and 749 (were 795 and 954) | informative | not a damping derivative (documented) |
| L3 regression: Magnus, Re 200, spin 1 (moving wall) | C_L 2.688 (Mittal and Kumar 2003, digitised) | C_L 2.6622, C_D 1.1860, St 0.18958 | 2.6623, 1.1859, 0.18958 | unchanged | pass |
| L3 defect 5 (not changed): regularised collision cost on the plate lift slope | BGK + Smagorinsky slope on the same grid | Re 3000: 4.586 against 5.134 (-10.7 percent) | Re 3000: 4.531 against 5.047 (-10.2); Re 1500, the page's new top: 5.087 against 5.302 (-4.1) | | documented |

Other checks: node vx/js/flight/flight.test.mjs 26/26; page harness CLEAN on vx/lab/lattice.html (1440 x 900 and 390 x 844, reduced motion, no WebGL) and vx/index.html (1440 x 900). The full 60,000-step gate was not run on SwiftShader (8 to 15 steps per second on this shared host, about two hours); the transcription stands in, with the 12,000-step GPU comparison above.

## Not fixed, and why

- L1 D3 / L2 defect 4 (inflow edge is a pressure anchor): documented in the lattice.js header (EDGES); inflowNeq is the velocity inlet for benches. Referring c_n and c_m to the delivered speed needs a second readback and a panel change (vx/js/panel, not in this area).
- L2 defect 2 and L3 defect 3 (page copy and the CP / CM LATTICE 2D rows): vx/index.html, vx/README.md, vx/js/panel/panel.js and vx/js/main.js are outside this area, and copy changes go to the owner. The engine header now states the measured CP (15 to 18 in against Barrowman's 29 to 33 in) and that the section is not a cross-check.
- L2 defect 6 and L3 defect 2 (staircase walls, Magnus above spin 1.5): interpolated bounce-back needs per-link wall distances from the geometry, a second cell texture and an API addition; not cheap. The page caps the wall speed at 0.05.
- L3 defect 4 (page domain 0.47 rocket lengths tall): the tier grids are FIELD 4 and 5 and a square domain costs 3.2 times the cells.
- L3 defect 5 (regularised collision): unchanged; at the page's new top Re of 1500 its cost is 4 percent.
- L3 defect 1, remainder: the pitch-rate lift reaches 75 percent of the thin-airfoil camber part, with the right pivot dependence; the cause was not found.

## Visible consequences and stale copy, for the owner

- The page's flow now runs at most u_in 0.05 (at top speed the smoke moves half as fast as before); the vorticity and pressure views lose the grid-scale noise; the vorticity view shows absolute vorticity in the turning body frame.
- force.developed comes later (1.5 chord passes), so the CP and CM lattice rows show a dash for longer.
- Stale page copy: Re 3,000 (now 900 to 1,500 by the page's own formula), u_in 0.03 to 0.10 (runs 0.03 to 0.05), the gate's 1.450 / 0.169 and the 1.35 to 1.55 / 0.16 to 0.18 window for 12 percent blockage (now 1.369 / 0.164 against unconfined 1.320 / 0.165), and "as a cross-check".
