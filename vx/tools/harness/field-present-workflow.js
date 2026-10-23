export const meta = {
  name: 'field-present',
  description: 'Five presentation lenses review the field study for non-engineers, then one synthesis into a ranked plan',
  phases: [{ title: 'Review' }, { title: 'Synthesize' }],
}
const S = (process.env.VX_SCRATCH || '/tmp/vx-scratch')
const REV = { type: 'object', properties: { lens: { type: 'string' }, report: { type: 'string' }, proposals: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' }, where: { type: 'string' }, effort: { type: 'string' }, risk: { type: 'string' }, verify: { type: 'string' } }, required: ['title', 'what', 'why', 'where', 'effort', 'risk', 'verify'] } }, cut: { type: 'array', items: { type: 'string' } } }, required: ['lens', 'report', 'proposals', 'cut'] }
const PLAN = { type: 'object', properties: { planPath: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { rank: { type: 'number' }, title: { type: 'string' }, area: { type: 'string' }, effort: { type: 'string' }, summary: { type: 'string' } }, required: ['rank', 'title', 'area', 'effort', 'summary'] } }, doNot: { type: 'array', items: { type: 'string' } } }, required: ['planPath', 'items', 'doNot'] }
const common = `Read ${S}/BRIEF.md (who the owner is, his design system), ${S}/PRESENTATION.md (the task and the rules), then skim ${S}/FIELD.md and ${S}/reports/field/modules.md. Repo /home/user/merttureli-site. Read-only: do not edit the repo. Use Playwright on the real page as PRESENTATION.md says and look at the screenshots you take. No emoji, no exclamation marks.`
phase('Review')
const lenses = ['first-timer', 'story', 'cinematic', 'brand', 'recruiter']
const reviews = await parallel(lenses.map((l) => () => agent(`${common}\n\nYOUR LENS: ${l} (see PRESENTATION.md). Write your review to ${S}/reports/present/${l}.md with your screenshots next to it, then return through StructuredOutput: lens, report, proposals (ranked, at most ten), cut (things the page should drop or hide, one line each).`, { label: `lens:${l}`, phase: 'Review', schema: REV, model: 'opus' })))
phase('Synthesize')
const plan = await agent(`${common}\n\nSYNTHESIS. Read the five reviews in ${S}/reports/present/ and their proposals (JSON): ${JSON.stringify(reviews.filter(Boolean).map(r => ({ lens: r.lens, proposals: r.proposals, cut: r.cut }))).slice(0, 60000)}\nWrite ${S}/PRESENTATION-PLAN.md as PRESENTATION.md describes: at most twelve ranked items with area, effort, dependencies, verification, and a do-not list. Be decisive. Return through StructuredOutput.`, { label: 'synthesize', phase: 'Synthesize', schema: PLAN, model: 'opus' })
return plan
