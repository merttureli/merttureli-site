export const meta = {
  name: 'field-build-modules',
  description: 'Build CHARGER field study modules: build -> adversarial review -> fix, each with a lab page verified by the Playwright harness',
  phases: [{ title: 'Build' }, { title: 'Review' }, { title: 'Fix' }],
}
const SCRATCH = (process.env.VX_SCRATCH || '/tmp/vx-scratch')
const HARNESS = `${SCRATCH}/harness/check.cjs`
const BUILD = { type: 'object', properties: { id: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, labPage: { type: 'string' }, publicApi: { type: 'string' }, harnessSummary: { type: 'string' }, measurements: { type: 'string' }, loc: { type: 'number' }, notes: { type: 'string' } }, required: ['id', 'files', 'labPage', 'publicApi', 'harnessSummary', 'measurements', 'loc', 'notes'] }
const REVIEW = { type: 'object', properties: { id: { type: 'string' }, bugs: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, what: { type: 'string' }, severity: { type: 'string' }, fix: { type: 'string' } }, required: ['where', 'what', 'severity', 'fix'] } }, verdict: { type: 'string' } }, required: ['id', 'bugs', 'verdict'] }
const FIX = { type: 'object', properties: { id: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } }, skipped: { type: 'array', items: { type: 'string' } }, harnessSummary: { type: 'string' }, measurements: { type: 'string' } }, required: ['id', 'fixed', 'skipped', 'harnessSummary', 'measurements'] }
const common = `Read first, in this order: ${SCRATCH}/BRIEF.md (who Mert is, the design system, assets, constraints), then ${SCRATCH}/FIELD.md (the binding contract for this page: sign conventions, module APIs, tiers, honesty rule), then the entries you reuse in ${SCRATCH}/reports/modules.md (the assembly loader at the "vx/js/stage/loader.js" entry, instruments-draw helpers). Repo root is /home/user/merttureli-site; all work lives under vx/. Never modify files outside vx/, never modify another module's files, never edit vx/css/tokens.css or the reused core files (bus.js, governor.js, stage/loader.js, instruments-draw.js). Plain ES modules, no build step, no network dependencies except the vendored three.js through the import map. No emoji, no exclamation marks anywhere. Every module honours prefers-reduced-motion, survives a missing WebGL2 context without throwing, and cleans up through destroy(). Numbers carry their source tag (PAGE, CAD, EST, FIT, SIM, STD) wherever they are shown. The harness: node ${HARNESS} <labPage> --out <dir> --steps 3 --viewports 1440x900,390x844 (and once with --no-gl); it launches headless Chromium with SwiftShader, so frame times are software GL and not representative, but errors, 404s, overflow and screenshots are real. LOOK at the PNG files with the Read tool.`
phase('Build')
const results = await pipeline(
  args.modules,
  (m) => agent(`${common}

YOUR MODULE: ${m.id} — ${m.title}. Contract: FIELD.md section ${m.section} (plus section 2 for everyone).
Files you own (create exactly these; helper files allowed under the same directory with the same prefix): ${m.files.join(', ')}
Lab page: ${m.labPage} — a standalone bench mounting only this module, parameters as controls, a readout of internal state, styled with ../css/tokens.css in the site's mono meta style, dark stage. It is part of the deliverable.

Module brief:
${m.brief}

Process:
1. Read the contract sections and the files you depend on. Keep the sign convention of FIELD.md section 2 exactly.
2. Write the module. Comment the maths and every magic number with its unit and source tag. requestAnimationFrame only while something animates; stop when hidden.
3. node --check every JS file. Run the harness on the lab page into ${SCRATCH}/reports/field/${m.id} (both viewports, then --no-gl). Fix until CLEAN and the screenshots look finished and intentional. ${m.extraChecks || ''}
4. Return through StructuredOutput: id, files (absolute), labPage, publicApi (exports, methods, events, one line each), harnessSummary (final SUMMARY line and frame timing), measurements (the numbers the contract asks you to report, with tags), loc, notes (init order, required DOM, CSS hooks, known limits, anything the integrator must know).`, { label: `build:${m.id}`, phase: 'Build', schema: BUILD, model: 'opus' }),
  (built, m) => built ? agent(`${common}

You are an adversarial reviewer for module ${m.id} (${m.title}). Contract: FIELD.md section ${m.section}. Files: ${built.files.join(', ')}. Lab page: ${built.labPage}. Builder's API: ${built.publicApi}. Builder's measurements: ${built.measurements}

Try to break it. Read every line. Run node ${HARNESS} ${built.labPage} --out ${SCRATCH}/reports/field/${m.id}-review --steps 4 --viewports 1440x900,390x844 and look at the screenshots; then probe with your own Playwright script (require('/opt/node22/lib/node_modules/playwright'); serve the repo root with python3 -m http.server from /home/user/merttureli-site on a free port; headless Chromium args --use-angle=swiftshader --enable-unsafe-swiftshader for WebGL). Check: contract deviations (names, events, sign convention, tags, units); leaks after destroy(); hidden tab; resize storms; DPR 2; reduced motion; WebGL context loss; no WebGL2; keyboard reachability; contrast of informational text; NaN or Infinity at edge sizes and edge parameters (zero fins, zero speed, alpha +-35 degrees, dt 0); correctness of the physics or numerics against the contract's formulas (recompute one case by hand). ${m.reviewChecks || ''} Report only real, reproducible bugs or contract violations with file and line, severity (blocker, major, minor) and the concrete fix. If it is clean, say so. Return through StructuredOutput.`, { label: `review:${m.id}`, phase: 'Review', schema: REVIEW, model: 'opus' }).then(r => ({ built, review: r })) : null,
  (pair, m) => pair && pair.review && pair.review.bugs.length ? agent(`${common}

You are fixing module ${m.id} (${m.title}). Contract: FIELD.md section ${m.section}. Files: ${pair.built.files.join(', ')}. Lab page: ${pair.built.labPage}.
A reviewer found these issues (JSON): ${JSON.stringify(pair.review.bugs)}
Verify each (trust but check), fix every blocker and major and every minor that is cheap and safe, without widening scope. Re-run node --check and the harness into ${SCRATCH}/reports/field/${m.id}-fixed (both viewports) and look at the screenshots. If the module has tests or a validation mode, run them again and report the numbers. Return through StructuredOutput: id, fixed (one line each), skipped (with reason), harnessSummary, measurements.`, { label: `fix:${m.id}`, phase: 'Fix', schema: FIX, model: 'opus' }).then(f => ({ ...pair, fix: f })) : pair,
)
const summary = results.filter(Boolean).map(r => ({ id: r.built.id, files: r.built.files, labPage: r.built.labPage, publicApi: r.built.publicApi, notes: r.built.notes, measurements: (r.fix && r.fix.measurements) || r.built.measurements, harness: (r.fix && r.fix.harnessSummary) || r.built.harnessSummary, reviewVerdict: r.review ? r.review.verdict : 'no review', bugsFound: r.review ? r.review.bugs.length : 0, fixed: r.fix ? r.fix.fixed : [], skipped: r.fix ? r.fix.skipped : [] }))
log(`built ${summary.length}/${args.modules.length} modules`)
return summary
