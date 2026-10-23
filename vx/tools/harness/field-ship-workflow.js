export const meta = {
  name: 'field-ship',
  description: 'Shipping confidence: runtime device and network matrix plus a static compatibility and performance review',
  phases: [{ title: 'Sweep' }],
}
const S = (process.env.VX_SCRATCH || '/tmp/vx-scratch')
const OUT = { type: 'object', properties: { track: { type: 'string' }, report: { type: 'string' }, defects: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, what: { type: 'string' }, severity: { type: 'string' }, fix: { type: 'string' } }, required: ['where', 'what', 'severity', 'fix'] } }, notes: { type: 'string' } }, required: ['track', 'report', 'defects', 'notes'] }
const common = `Read ${S}/SHIPPING.md first, then the reports it names. Repo /home/user/merttureli-site; read-only for the repo (write scripts and reports under ${S}/reports/ship/ and ${S}/ship/). No emoji, no exclamation marks. Return through StructuredOutput: track, report (path), defects (severity, file and line where you can locate it, fix), notes.`
phase('Sweep')
const out = await parallel([
  () => agent(`${common}\n\nYOUR TRACK: C1, the runtime matrix. Budget the soak at 30 minutes in the background while you run the rest.`, { label: 'ship:C1', phase: 'Sweep', schema: OUT, model: 'opus' }),
  () => agent(`${common}\n\nYOUR TRACK: C2, the static compatibility and performance review, plus the ?bench=1 spec.`, { label: 'ship:C2', phase: 'Sweep', schema: OUT, model: 'opus' }),
])
return out.filter(Boolean)
