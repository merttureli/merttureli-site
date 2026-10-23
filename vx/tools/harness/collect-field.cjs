// Collect agent results from workflow journals into reports/field/modules.md (for the integrator).
const fs = require('fs'); const path = require('path');
const base = '/root/.claude/projects/-home-user-merttureli-site/89c47636-e713-59a0-ab78-6864669d7dfa/subagents/workflows';
const out = path.join(__dirname, '..', 'reports', 'field', 'modules.md');
const runs = process.argv.slice(2);
let md = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '# Field study modules: builder, reviewer and fixer reports\n\n';
let n = 0;
for (const run of runs) {
  const j = path.join(base, run, 'journal.jsonl');
  if (!fs.existsSync(j)) { console.log('no journal', run); continue; }
  const labels = {};
  const lines = fs.readFileSync(j, 'utf8').split('\n');
  for (const line of lines) { let e; try { e = JSON.parse(line); } catch { continue; } if (e.type === 'started' && e.key) labels[e.key] = e.label || e.key; }
  for (const line of lines) {
    if (!line.trim()) continue; let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== 'result') continue;
    const label = labels[e.key] || e.label || e.agentId || 'agent';
    const r = e.result ?? e.value ?? e.output ?? e;
    const key = `## ${label}`;
    if (md.includes(key + '\n')) continue;
    md += `${key}\n\n` + '```json\n' + JSON.stringify(r, null, 1).slice(0, 20000) + '\n```\n\n';
    n++;
  }
}
fs.writeFileSync(out, md);
console.log('appended', n, 'results; file', md.length, 'chars');
