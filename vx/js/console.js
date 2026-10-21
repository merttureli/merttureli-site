/* console.js — the LCO console: a command line for the page.
   A native <dialog> anchored to the bottom of the viewport (or the same
   component rendered inline for the lab) with a ">_" prompt, a scrolling mono
   output log that virtualises past VIRTUAL_FROM entries, a suggestion strip fed
   by a subsequence fuzzy matcher, session history, and built-in file commands
   over the virtual filesystem in data/vfs.js (real files, real byte sizes).

   Opening: "/" when no input, textarea, select or contenteditable has focus,
   Ctrl/Cmd+K anywhere, any element carrying [data-console-open]. Escape closes.
   Focus returns to whatever opened it.

   Commands are plain objects { name, args, help, run(argv, io, ctx), complete? }.
     argv  tokens after the command name (quotes honoured)
     io    { print(text, {className}), table(rows, {head, align}), clear(), link(label, href, {note}), error(text), block(node) }
     ctx   { cwd, setCwd(node), vfs, console }
     complete(argText, ctx) → [{ label, help, insert }] for the suggestion strip
   Bus events: console:open {}, console:close {}, console:run {name, args, output, line}.

   Motion: the open slide is CSS only and collapses under prefers-reduced-motion
   and at governor tiers 0–1. There is no animation loop; the only rAF is a
   one-frame batch for log rendering. No WebGL, no network. */
import { bus } from './core/bus.js';
import { governor } from './core/governor.js';
import { vfs, root as VFS_ROOT, roles, resolve, pathOf, list, flatten, totals, formatSize, project } from './data/vfs.js';

export const HISTORY_KEY = 'vx-console-history';
const HISTORY_MAX = 200;        // lines kept in sessionStorage
const SUGGEST_MAX = 5;          // chips in the suggestion strip
const VIRTUAL_FROM = 500;       // log entries before the log is virtualised
const WINDOW = 300;             // entries kept in the DOM once virtualised
const CHUNK = 100;              // entries added when the reader scrolls toward an edge
const EDGE_ROWS = 12;           // rows of slack before an edge triggers a window shift
const MAX_ENTRIES = 5000;       // oldest entries dropped beyond this
const FIND_MAX = 12;            // results printed by `find`
const SEPARATORS = /[\s\-_/.:]/;
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
let uid = 0;

/* ---------- fuzzy matcher ----------
   Subsequence match of query inside target. Each matched character scores:
   +8 at the very start of the target (prefix), +6 at a word start (after a
   separator), +4 when it follows the previous match (run), and loses 0.5 per
   character skipped between matches. Longer targets lose 0.1 per surplus
   character so "ls" outranks "lsblk" for the query "ls". null = no match. */
export function fuzzyScore(query, target) {
  const q = String(query).toLowerCase(), t = String(target).toLowerCase();
  if (!q) return 0;
  let score = 0, from = 0, prev = -2;
  for (let i = 0; i < q.length; i++) {
    const idx = t.indexOf(q[i], from);
    if (idx < 0) return null;
    if (idx === 0) score += 8;
    else if (SEPARATORS.test(t[idx - 1])) score += 6;
    if (idx === prev + 1) score += 4;
    score -= (idx - from) * 0.5;
    prev = idx; from = idx + 1;
  }
  score -= (t.length - q.length) * 0.1;
  if (t === q) score += 10;
  return score;
}
export function fuzzyRank(query, items, key = (x) => x, limit = SUGGEST_MAX) {
  const out = [];
  for (const item of items) { const s = fuzzyScore(query, key(item)); if (s !== null) out.push({ item, score: s }); }
  out.sort((a, b) => b.score - a.score || String(key(a.item)).localeCompare(String(key(b.item))));
  return limit > 0 ? out.slice(0, limit) : out;
}
/* Shell-style tokens: whitespace separated, single or double quotes group. */
export function tokenize(line) {
  const out = []; let cur = '', quote = null, quoted = false;
  for (const ch of String(line)) {
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; quoted = true; continue; }
    if (/\s/.test(ch)) { if (cur || quoted) { out.push(cur); cur = ''; quoted = false; } continue; }
    cur += ch;
  }
  if (cur || quoted) out.push(cur);
  return out;
}
const inEditable = (t) => t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MONTHS_SHORT[+m - 1]} ${y}`; };

/* ---------- mount ---------- */
export function mountConsole({
  commands = [], inline = null, hotkeys = true, historyKey = HISTORY_KEY, banner = true,
  virtualFrom = VIRTUAL_FROM, suggestMax = SUGGEST_MAX, navigate = 'auto', placeholder = 'type help',
  live = true,   // false when the page relays results through its own live region (#announce) so screen readers hear them once
} = {}) {
  const id = `con-${++uid}`;
  const registry = new Map();
  const entries = [];                 // every log entry {text, className} | {table, head, align} | {link, note} | {node}
  const view = { start: 0, end: 0 };  // rendered slice of entries
  let rendered = { start: 0, end: 0 };
  let rowH = 20;                      // measured px per entry, used for the virtual spacers
  let follow = true;                  // the log sticks to its bottom until the reader scrolls up
  let dirty = false, renderRaf = 0, suppressScroll = false;
  let cwd = VFS_ROOT;
  let history = loadHistory(), histIndex = history.length, draft = '', walking = false;   // walking: Up/Down keep moving through history until the reader types
  let sug = { items: [], index: 0 };
  let opener = null, isOpen = false, bannered = false, runs = 0, lastRun = null;
  const config = { virtualFrom, suggestMax, navigate, hotkeys };

  /* --- DOM --- */
  const el = document.createElement(inline ? 'section' : 'dialog');
  el.className = inline ? 'con con--inline' : 'con';
  el.setAttribute('aria-label', 'Command console');
  el.id = id;
  el.innerHTML = `
    <div class="con-frame">
      <header class="con-head">
        <span class="con-mark" aria-hidden="true">&gt;_</span>
        <span class="con-title">Console</span>
        <span class="con-cwd" aria-label="Working directory">~</span>
        <span class="con-src">Src: this page / no rocket data</span>
        <button type="button" class="con-close" aria-label="Close console"><span aria-hidden="true">Esc</span></button>
      </header>
      <div class="con-log" role="log" aria-live="${live ? 'polite' : 'off'}" aria-label="Console output" tabindex="0">
        <div class="con-pad" aria-hidden="true"></div>
        <div class="con-lines"></div>
        <div class="con-pad" aria-hidden="true"></div>
      </div>
      <div class="con-suggest" role="listbox" id="${id}-suggest" aria-label="Suggestions"></div>
      <form class="con-prompt" autocomplete="off">
        <label class="con-ps1" for="${id}-input"><span aria-hidden="true">&gt;_</span><span class="sr-only">Command</span></label>
        <input class="con-input" id="${id}-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-suggest" aria-haspopup="listbox" placeholder="${placeholder}">
        <button type="submit" class="con-run">Run</button>
      </form>
      <footer class="con-foot"><span><kbd>Tab</kbd> accepts</span><span><kbd>Up</kbd> <kbd>Down</kbd> history</span><span><kbd>Esc</kbd> closes</span></footer>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const log = $('.con-log'), linesEl = $('.con-lines'), padTop = $('.con-pad'), padBottom = el.querySelectorAll('.con-pad')[1];
  const strip = $('.con-suggest'), form = $('.con-prompt'), input = $('.con-input'), cwdEl = $('.con-cwd'), closeBtn = $('.con-close');
  (inline || document.body).appendChild(el);

  /* --- log rendering with a virtual window --- */
  function buildEntry(e) {
    const line = document.createElement('div');
    line.className = 'con-line' + (e.className ? ' ' + e.className : '');
    if (e.table) {
      line.classList.add('con-line--table');
      const cols = Math.max(e.head ? e.head.length : 0, ...e.table.map((r) => r.length));
      const t = document.createElement('div');
      t.className = 'con-table'; t.setAttribute('role', 'table');
      t.style.setProperty('--con-cols', Array.from({ length: cols }, (_, i) => (i === cols - 1 ? 'minmax(0, 1fr)' : 'max-content')).join(' '));
      const addRow = (cells, role) => {
        const r = document.createElement('div'); r.setAttribute('role', 'row');
        for (let i = 0; i < cols; i++) {
          const c = document.createElement('span'); c.setAttribute('role', role);
          c.textContent = cells[i] ?? '';
          if (e.align && e.align[i] === 'r') c.classList.add('con-cell--r');
          r.appendChild(c);
        }
        t.appendChild(r);
      };
      if (e.head) addRow(e.head, 'columnheader');
      for (const row of e.table) addRow(row, 'cell');
      line.appendChild(t);
    } else if (e.link) {
      line.classList.add('con-line--link');
      const a = document.createElement('a');
      a.href = e.link.href; a.textContent = e.link.label;
      if (!e.link.href.startsWith('#')) { a.target = '_blank'; a.rel = 'noopener'; }
      line.appendChild(a);
      if (e.note) { const s = document.createElement('span'); s.textContent = ' ' + e.note; line.appendChild(s); }
    } else if (e.node) {
      line.classList.add('con-line--block');
      line.appendChild(e.node);
    } else {
      line.textContent = e.text;
    }
    return line;
  }
  function scheduleRender() {
    dirty = true;
    if (renderRaf) return;
    renderRaf = (document.hidden ? (fn) => setTimeout(fn, 0) : requestAnimationFrame)(() => { renderRaf = 0; if (dirty) render(); });
  }
  function render({ anchor = null } = {}) {
    dirty = false;
    const n = entries.length;
    const virtual = n > config.virtualFrom;
    if (!virtual) { view.start = 0; view.end = n; }
    else if (follow) { view.end = n; view.start = Math.max(0, n - WINDOW); }
    else { view.end = Math.min(view.end, n); view.start = Math.max(0, Math.min(view.start, view.end - WINDOW)); }
    const incremental = view.start === rendered.start && view.end >= rendered.end && rendered.end <= n && linesEl.childElementCount === rendered.end - rendered.start;
    const frag = document.createDocumentFragment();
    const from = incremental ? rendered.end : view.start;
    if (!incremental) linesEl.replaceChildren();
    for (let i = from; i < view.end; i++) frag.appendChild(buildEntry(entries[i]));
    linesEl.appendChild(frag);
    rendered = { start: view.start, end: view.end };
    padTop.style.height = `${Math.round(view.start * rowH)}px`;
    padBottom.style.height = `${Math.round((n - view.end) * rowH)}px`;
    const count = view.end - view.start;
    if (count > 0) rowH = Math.max(8, linesEl.offsetHeight / count);   // one layout read per render
    suppressScroll = true;
    if (anchor) {
      const elA = linesEl.children[anchor.index - view.start];
      if (elA) log.scrollTop = elA.offsetTop - anchor.delta;
    } else if (follow) log.scrollTop = log.scrollHeight;
    requestAnimationFrame(() => { suppressScroll = false; });
  }
  function onLogScroll() {
    if (suppressScroll) return;
    follow = log.scrollHeight - log.scrollTop - log.clientHeight < rowH * 1.5;
    const n = entries.length;
    if (n <= config.virtualFrom) return;
    const top = log.scrollTop, bottom = top + log.clientHeight;
    const topEdge = padTop.offsetHeight + rowH * EDGE_ROWS, bottomEdge = padTop.offsetHeight + linesEl.offsetHeight - rowH * EDGE_ROWS;
    if (top < topEdge && view.start > 0) {
      const index = view.start, elA = linesEl.children[0];
      const delta = elA ? elA.offsetTop - log.scrollTop : 0;
      view.start = Math.max(0, view.start - CHUNK); view.end = Math.min(n, view.start + WINDOW);
      render({ anchor: { index, delta } });
    } else if (bottom > bottomEdge && view.end < n) {
      const index = view.end - 1, elA = linesEl.children[linesEl.childElementCount - 1];
      const delta = elA ? elA.offsetTop - log.scrollTop : 0;
      view.end = Math.min(n, view.end + CHUNK); view.start = Math.max(0, view.end - WINDOW);
      render({ anchor: { index, delta } });
    }
  }
  function append(entry) {
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) { entries.splice(0, entries.length - MAX_ENTRIES); rendered = { start: 0, end: 0 }; linesEl.replaceChildren(); }
    scheduleRender();
  }
  function flush() { if (renderRaf) { (document.hidden ? clearTimeout : cancelAnimationFrame)(renderRaf); renderRaf = 0; } if (dirty) render(); }

  /* --- io given to commands; everything printed is also captured for console:run --- */
  function makeIo(captured) {
    const io = {
      print(text, { className } = {}) {
        for (const l of String(text ?? '').split('\n')) { append({ text: l, className }); captured.push(l); }
      },
      table(rows, { head = null, align = null } = {}) {
        const safe = rows.map((r) => r.map((c) => String(c ?? '')));
        append({ table: safe, head: head ? head.map(String) : null, align });
        if (head) captured.push(head.join('  '));
        for (const r of safe) captured.push(r.join('  '));
      },
      clear() { entries.length = 0; rendered = { start: 0, end: 0 }; linesEl.replaceChildren(); follow = true; dirty = true; scheduleRender(); captured.length = 0; },
      link(label, href, { note = '' } = {}) { append({ link: { label: String(label), href: String(href) }, note }); captured.push(`${label} → ${href}${note ? ' ' + note : ''}`); },
      error(text) { io.print(text, { className: 'con-line--err' }); },
      block(node, text = '') { append({ node }); if (text) captured.push(text); },
    };
    return io;
  }

  /* --- history (sessionStorage) --- */
  function loadHistory() {
    try { const v = JSON.parse(sessionStorage.getItem(historyKey) || '[]'); return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(-HISTORY_MAX) : []; } catch { return []; }
  }
  function saveHistory() { try { sessionStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* storage blocked: history lives in memory */ } }
  function pushHistory(line) {
    if (history[history.length - 1] !== line) history.push(line);
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    histIndex = history.length; draft = '';
    saveHistory();
  }
  function walkHistory(dir) {
    if (!history.length) return;
    if (!walking) { draft = input.value; histIndex = history.length; walking = true; }
    histIndex = Math.max(0, Math.min(history.length, histIndex + dir));
    input.value = histIndex === history.length ? draft : history[histIndex];
    input.setSelectionRange(input.value.length, input.value.length);
    refreshSuggestions();
    if (histIndex === history.length) walking = false;
  }

  /* --- suggestions --- */
  function pathCandidates(argText, { dirsOnly = false } = {}) {
    const slash = argText.lastIndexOf('/');
    const dirPart = slash >= 0 ? argText.slice(0, slash + 1) : '';
    const base = slash >= 0 ? argText.slice(slash + 1) : argText;
    const dirNode = dirPart ? resolve(dirPart, cwd) : cwd;
    if (!dirNode || dirNode.type !== 'dir') return [];
    const kids = list(dirNode).filter((k) => !dirsOnly || k.type === 'dir');
    const ranked = base ? fuzzyRank(base, kids, (k) => k.name, config.suggestMax) : kids.slice(0, config.suggestMax).map((item) => ({ item }));
    return ranked.map(({ item: k }) => ({
      label: k.type === 'dir' ? k.name + '/' : k.name,
      help: k.type === 'dir' ? 'dir' : formatSize(k.size),
      insert: dirPart + k.name + (k.type === 'dir' ? '/' : ''),
    }));
  }
  function computeSuggestions(value) {
    const trimmed = value.replace(/^\s+/, '');
    const sp = trimmed.search(/\s/);
    if (sp < 0) {
      if (!trimmed) return [];
      return fuzzyRank(trimmed, [...registry.values()], (c) => c.name, config.suggestMax)
        .map(({ item: c }) => ({ label: c.name, help: c.help || '', insert: c.name + (c.args ? ' ' : ''), kind: 'cmd' }));
    }
    const name = trimmed.slice(0, sp).toLowerCase(), cmd = registry.get(name);
    if (!cmd || typeof cmd.complete !== 'function') return [];
    const argText = trimmed.slice(sp).replace(/^\s+/, '');
    let items = [];
    try { items = cmd.complete(argText, ctx) || []; } catch { items = []; }
    return items.slice(0, config.suggestMax).map((it) => (typeof it === 'string' ? { label: it, help: '', insert: `${name} ${it}` } : { label: it.label, help: it.help || '', insert: `${name} ${it.insert ?? it.label}` }));
  }
  function refreshSuggestions() {
    sug = { items: computeSuggestions(input.value), index: 0 };
    strip.replaceChildren();
    sug.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'con-sug'; b.id = `${id}-opt-${i}`;
      b.setAttribute('role', 'option'); b.setAttribute('aria-selected', i === sug.index ? 'true' : 'false');
      b.innerHTML = '<b></b><span></span>';
      b.firstChild.textContent = it.label; b.lastChild.textContent = it.help;
      b.addEventListener('pointerdown', (e) => e.preventDefault());     // keep focus in the input
      b.addEventListener('click', () => { sug.index = i; accept(); });
      strip.appendChild(b);
    });
    input.setAttribute('aria-expanded', sug.items.length ? 'true' : 'false');
    if (sug.items.length) input.setAttribute('aria-activedescendant', `${id}-opt-0`); else input.removeAttribute('aria-activedescendant');
  }
  function moveSuggestion(dir) {
    if (!sug.items.length) return;
    sug.index = (sug.index + dir + sug.items.length) % sug.items.length;
    [...strip.children].forEach((b, i) => b.setAttribute('aria-selected', i === sug.index ? 'true' : 'false'));
    input.setAttribute('aria-activedescendant', `${id}-opt-${sug.index}`);
    strip.children[sug.index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function accept() {
    const it = sug.items[sug.index];
    if (!it) return;
    input.value = it.insert;
    input.setSelectionRange(input.value.length, input.value.length);
    refreshSuggestions();
  }

  /* --- open / close --- */
  function open() {
    if (isOpen) { input.focus({ preventScroll: true }); return; }
    if (!opener) opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    isOpen = true;
    if (!inline && !el.open) { try { el.showModal(); } catch { el.setAttribute('open', ''); } }
    el.dataset.open = '';
    if (banner && !bannered) { bannered = true; printBanner(); }
    flush();
    input.focus({ preventScroll: true });
    log.scrollTop = log.scrollHeight;
    bus.emit('console:open', {});
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    delete el.dataset.open;
    if (!inline && el.open) el.close();
    else if (inline && document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
    bus.emit('console:close', {});
    const o = opener; opener = null;
    if (o && o.isConnected) o.focus({ preventScroll: true });
  }
  function printBanner() {
    const t = totals(VFS_ROOT);
    const assets = flatten(VFS_ROOT).filter((n) => n.type === 'file' && n.repo).length;   // README nodes are quoted text, not repository files
    const io = makeIo([]);
    io.print('VX console / LCO position', { className: 'con-line--ok' });
    io.print(`Type help for commands. ~ holds ${assets} repository files in ${t.dirs} directories, ${formatSize(t.bytes)} measured with stat.`, { className: 'con-line--dim' });
  }

  /* --- running --- */
  function setCwd(node) { cwd = node; cwdEl.textContent = pathOf(node); }
  /* Name lookup for cat and open, strict to loose: an exact file or folder name
     anywhere in the tree, then a project by index, slug, folder, title or org
     when the fuzzy score clears FUZZY_MIN (a prefix or word-start hit, not a
     scattered subsequence). Files are never fuzzy matched: "cat xyz" must fail
     rather than print an unrelated file. */
  const FUZZY_MIN = 6;
  function findByName(name) {
    const key = String(name).toLowerCase();
    if (!key) return null;
    const exact = flatten(VFS_ROOT).find((n) => n.name.toLowerCase() === key);
    if (exact) return exact;
    const projects = list(resolve('~/projects')).filter((d) => d.project);
    const best = fuzzyRank(key, projects, (d) => `${d.name} ${d.project.title} ${d.project.meta}`, 1)[0];
    return best && best.score >= FUZZY_MIN ? best.item : null;
  }
  function go(url, io, { page = false } = {}) {
    if (config.navigate === false) { io.print('Navigation is off in this mount; the link above opens it.', { className: 'con-line--dim' }); return; }
    if (page) { location.href = url; return; }
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }
  const ctx = { get cwd() { return cwd; }, setCwd, vfs, get console() { return api; } };
  async function run(line, { echo = true } = {}) {
    const text = String(line ?? '').trim();
    if (!text) return null;
    if (echo) append({ text, className: 'con-line--cmd' });
    pushHistory(text);
    const argv = tokenize(text);
    const name = (argv.shift() || '').toLowerCase();
    const captured = [];
    const io = makeIo(captured);
    const cmd = registry.get(name);
    if (!cmd) {
      io.error(`Unknown command: ${name}`);
      const near = fuzzyRank(name, [...registry.keys()], (k) => k, 3).map((r) => r.item);
      io.print(near.length ? `Closest: ${near.join(', ')}. Type help for the list.` : 'Type help for the list.', { className: 'con-line--dim' });
    } else {
      try { await cmd.run(argv, io, ctx); }
      catch (err) { io.error(`Error: ${err && err.message ? err.message : err}`); console.error('[console]', err); }
    }
    flush();
    runs++;
    lastRun = { name, args: argv, output: captured.join('\n'), line: text };
    bus.emit('console:run', lastRun);
    return lastRun;
  }
  function register(cmd) {
    if (!cmd || typeof cmd.name !== 'string' || typeof cmd.run !== 'function') throw new Error('register(cmd) needs { name, run }');
    const name = cmd.name.toLowerCase();
    const entry = { ...cmd, name };
    registry.set(name, entry);
    if (isOpen) refreshSuggestions();
    return () => { if (registry.get(name) === entry) registry.delete(name); };
  }

  /* --- built-in commands --- */
  const pathComplete = (opts) => (argText) => pathCandidates(argText, opts);
  function catProject(d, io) {
    io.print(d.children.README.text);
    projectLinks(d, io);
  }
  function projectLinks(d, io) {
    if (d.page) io.link('Read the case study', d.page.url);
    for (const l of d.links) io.link(l.label, l.url);
  }
  function openProject(d, io) {
    const p = d.project;
    io.print(`${p.index} / ${p.title}`, { className: 'con-line--ok' });
    const target = document.getElementById(`${p.index}-${p.slug}`)
      || document.querySelector(`[data-manifest-row="${p.slug}"], [data-manifest-row="${p.index}"], #manifest [data-project="${p.slug}"]`);
    if (target) {
      io.print(`Scrolled to #${target.id || p.slug}`, { className: 'con-line--dim' });
      flush();
      if (!inline) close();
      target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (d.page) { io.link('Read the case study', d.page.url); go(d.page.url, io, { page: true }); return; }
    io.print(p.meta);
    io.print(p.text);
    if (p.note) io.print(p.note, { className: 'con-line--dim' });
    io.print('No case study page exists for this project.', { className: 'con-line--dim' });
  }
  function buildCalendar(year, io) {
    const wrap = document.createElement('div');
    wrap.className = 'con-cal';
    const head = document.createElement('div');
    head.className = 'con-cal-year';
    const yearRoles = roles.filter((r) => r.from.slice(0, 4) <= String(year) && String(year) <= r.to.slice(0, 4));
    head.textContent = `${year} / ${yearRoles.length} role${yearRoles.length === 1 ? '' : 's'} / + marks a day inside a role`;
    wrap.appendChild(head);
    const months = document.createElement('div');
    months.className = 'con-cal-months';
    let markedDays = 0;
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      const active = roles.filter((r) => r.from <= key && key <= r.to);
      const offset = (new Date(Date.UTC(year, m, 1)).getUTCDay() + 6) % 7;      // Monday-first column of the 1st
      const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      const month = document.createElement('section');
      month.className = 'con-cal-month';
      month.dataset.active = active.length ? 'true' : 'false';
      const orgs = active.map((r) => r.org).join(', ');
      month.setAttribute('aria-label', `${MONTHS[m]} ${year}: ${days} days${active.length ? `, every day marked, ${orgs}` : ', no role'}`);
      const h = document.createElement('div');
      h.className = 'con-cal-head';
      h.innerHTML = '<b></b><span></span>';
      h.firstChild.textContent = MONTHS[m];
      h.lastChild.textContent = active.length ? active.map((r) => r.id).join(' / ') : '';
      month.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'con-cal-grid';
      grid.setAttribute('aria-hidden', 'true');                                   // the month label above carries the summary
      for (const d of DOW) { const c = document.createElement('span'); c.className = 'con-cal-dow'; c.textContent = d; grid.appendChild(c); }
      for (let i = 0; i < 42; i++) {                                               // 6 rows × 7 keep every month the same height so weeks align
        const day = i - offset + 1;
        const c = document.createElement('span');
        c.className = 'con-cal-day';
        if (day >= 1 && day <= days) {
          const inRange = active.length > 0;
          c.dataset.in = inRange ? 'true' : 'false';
          c.innerHTML = '<span></span><i></i>';
          c.firstChild.textContent = String(day).padStart(2, ' ');
          c.lastChild.textContent = inRange ? '+' : ' ';
          if (inRange) markedDays++;
        } else c.textContent = '   ';
        grid.appendChild(c);
      }
      month.appendChild(grid);
      months.appendChild(month);
    }
    wrap.appendChild(months);
    const legend = document.createElement('div');
    legend.className = 'con-cal-legend';
    legend.setAttribute('aria-label', 'Legend');
    for (const r of roles) {
      const row = document.createElement('div');
      row.innerHTML = '<i>+</i> <b></b> <span></span>';
      row.querySelector('b').textContent = r.id.toLowerCase() === r.org.toLowerCase() ? r.org : `${r.id} / ${r.org}`;
      row.querySelector('span').textContent = `${r.name} / ${monthLabel(r.from)} – ${monthLabel(r.to)}`;
      legend.appendChild(row);
    }
    wrap.appendChild(legend);
    io.block(wrap, `cal ${year}: ${markedDays} marked days, roles ${yearRoles.map((r) => r.id).join(', ') || 'none'}`);
  }
  const builtins = [
    { name: 'help', args: '[command]', help: 'Every command, or one in detail',
      complete: (a) => fuzzyRank(a, [...registry.keys()], (k) => k, config.suggestMax).map((r) => r.item),
      run([name], io) {
        if (name) {
          const c = registry.get(name.toLowerCase());
          if (!c) return io.error(`No command named ${name}`);
          io.print(`${c.name} ${c.args || ''}`.trim(), { className: 'con-line--ok' });
          io.print(c.help || 'No help text.');
          return;
        }
        const rows = [...registry.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.name, c.args || '', c.help || '']);
        io.table(rows, { head: ['Command', 'Args', 'Help'] });
        io.print(`${rows.length} commands. Tab accepts a suggestion, Up and Down walk history, Esc closes.`, { className: 'con-line--dim' });
      } },
    { name: 'clear', args: '', help: 'Clear the log', run(_, io) { io.clear(); } },
    { name: 'history', args: '[clear]', help: 'Lines run this session',
      run([arg], io) {
        if (arg === 'clear') { history = []; histIndex = 0; saveHistory(); return io.print('History cleared.'); }
        if (!history.length) return io.print('Nothing yet.');
        io.table(history.map((l, i) => [String(i + 1).padStart(3, '0'), l]), { align: ['r', 'l'] });
      } },
    { name: 'pwd', args: '', help: 'Working directory', run(_, io) { io.print(pathOf(cwd)); } },
    { name: 'ls', args: '[path]', help: 'List a directory with byte sizes', complete: pathComplete({}),
      run([p], io) {
        const node = resolve(p || '.', cwd);
        if (!node) return io.error(`No such path: ${p}`);
        if (node.type === 'file') return io.table([[formatSize(node.size), node.name, node.kind]], { align: ['r', 'l', 'l'] });
        const kids = list(node);
        if (!kids.length) return io.print('Empty.');
        io.table(kids.map((k) => (k.type === 'dir' ? ['dir', k.name + '/', `${totals(k).files} files`] : [formatSize(k.size), k.name, k.kind])), { align: ['r', 'l', 'l'] });
        const t = totals(node);
        io.print(`${kids.length} entries / ${t.files} files / ${t.bytes.toLocaleString('en-US')} B`, { className: 'con-line--dim' });
      } },
    { name: 'cd', args: '[path]', help: 'Change directory (no path returns to ~)', complete: pathComplete({ dirsOnly: true }),
      run([p], io) {
        const node = resolve(p || '~', cwd);
        if (!node) return io.error(`No such directory: ${p}`);
        if (node.type !== 'dir') return io.error(`Not a directory: ${p}`);
        setCwd(node);
        io.print(pathOf(node), { className: 'con-line--dim' });
      } },
    { name: 'cat', args: '<file | project>', help: 'Print a README, or a file\'s size, type and link', complete: pathComplete({}),
      run([p], io) {
        if (!p) return io.error('Usage: cat <file>');
        const node = resolve(p, cwd) || project(p) || findByName(p);
        if (!node) return io.error(`No such file: ${p}`);
        if (node.type === 'dir') {
          if (node.project) return catProject(node, io);
          return io.error(`${node.name} is a directory. Try ls ${p}`);
        }
        if (node.text) { io.print(node.text); if (node.parent?.project) projectLinks(node.parent, io); return; }
        const proj = node.parent?.project || node.parent?.parent?.project;
        const rows = [['File', pathOf(node)], ['Size', `${node.size.toLocaleString('en-US')} B / ${formatSize(node.size)}`], ['Type', node.kind], ['Src', node.repo]];
        if (proj) rows.push(['Project', `${proj.index} / ${proj.title}`]);
        io.table(rows);
        io.link(`Open ${node.name}`, node.url, { note: 'new tab' });
      } },
    { name: 'open', args: '<path | project>', help: 'Open a file in a new tab, or go to a project',
      complete: (a) => {
        const projects = list(resolve('~/projects')).map((d) => ({ label: d.project.slug, help: d.project.index, insert: d.project.slug }));
        const ranked = a ? fuzzyRank(a, projects, (x) => x.label, config.suggestMax).map((r) => r.item) : projects;
        return [...ranked, ...pathCandidates(a)].slice(0, config.suggestMax);
      },
      run([p], io) {
        if (!p) return io.error('Usage: open <path | project>');
        const node = project(p) || resolve(p, cwd) || findByName(p);
        if (!node) return io.error(`Nothing named ${p}`);
        if (node.type === 'dir') {
          if (node.project) return openProject(node, io);
          setCwd(node);
          return registry.get('ls').run([], io);
        }
        if (node.text) return registry.get('cat').run([pathOf(node)], io);
        io.print(`${node.name} / ${formatSize(node.size)} / ${node.kind}`);
        io.link(`Open ${node.name}`, node.url, { note: 'new tab' });
        go(node.url, io);
      } },
    { name: 'tree', args: '[path]', help: 'Directory tree with sizes', complete: pathComplete({ dirsOnly: true }),
      run([p], io) {
        const node = resolve(p || '.', cwd);
        if (!node) return io.error(`No such path: ${p}`);
        if (node.type !== 'dir') return io.error(`Not a directory: ${p}`);
        const rows = [[pathOf(node), '']];
        const walkRows = (d, prefix) => {
          const kids = list(d);
          kids.forEach((k, i) => {
            const last = i === kids.length - 1;
            rows.push([`${prefix}${last ? '└── ' : '├── '}${k.name}${k.type === 'dir' ? '/' : ''}`, k.type === 'dir' ? '' : formatSize(k.size)]);
            if (k.type === 'dir') walkRows(k, prefix + (last ? '    ' : '│   '));
          });
        };
        walkRows(node, '');
        io.table(rows, { align: ['l', 'r'] });
        const t = totals(node);
        io.print(`${t.dirs} directories, ${t.files} files, ${t.bytes.toLocaleString('en-US')} B`, { className: 'con-line--dim' });
      } },
    { name: 'find', args: '<name>', help: 'Fuzzy search every path',
      run([q], io) {
        if (!q) return io.error('Usage: find <name>');
        const hits = fuzzyRank(q, flatten(VFS_ROOT), (n) => n.name, FIND_MAX);
        if (!hits.length) return io.print('No match.');
        io.table(hits.map(({ item: n }) => [n.type === 'dir' ? 'dir' : formatSize(n.size), pathOf(n)]), { align: ['r', 'l'] });
      } },
    { name: 'cal', args: '<year>', help: 'Twelve month grids, Monday first, + on days inside a role',
      complete: (a) => {
        const years = [...new Set(roles.flatMap((r) => [r.from.slice(0, 4), r.to.slice(0, 4)]))].map(Number);
        const all = []; for (let y = Math.min(...years); y <= Math.max(...years); y++) all.push(String(y));
        return (a ? all.filter((y) => y.startsWith(a)) : all).map((y) => ({ label: y, help: roles.filter((r) => r.from.slice(0, 4) <= y && y <= r.to.slice(0, 4)).length + ' roles', insert: y }));
      },
      run([y], io) {
        const year = parseInt(y, 10);
        if (!Number.isInteger(year) || year < 1970 || year > 2100) return io.error('Usage: cal <year>, for example cal 2026');
        buildCalendar(year, io);
      } },
  ];
  for (const c of builtins) register(c);
  for (const c of commands) register(c);

  /* --- listeners --- */
  function onKeydown(e) {
    if (e.defaultPrevented || !config.hotkeys) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); return; }
    if (e.key === '/' && !mod && !e.altKey && !inEditable(e.target)) {
      const other = e.target instanceof Element ? e.target.closest('dialog') : null;
      if (other && other !== el) return;                               // another dialog owns the keyboard
      e.preventDefault(); open();
    }
  }
  function onClick(e) {
    const t = e.target instanceof Element ? e.target.closest('[data-console-open]') : null;
    if (!t) return;
    e.preventDefault();
    opener = t;
    open();
  }
  function onInputKey(e) {
    if (e.key === 'Tab' && !e.shiftKey && sug.items.length) { e.preventDefault(); accept(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (walking || !input.value) walkHistory(dir);          // empty prompt, or already walking: history
      else if (sug.items.length) moveSuggestion(dir);          // typing with suggestions: move the selection
      else walkHistory(dir);                                   // typing with nothing to suggest: history with the draft kept
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'l' && e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); makeIo([]).clear(); return; }
    if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); follow = false; log.scrollTop = 0; }
    if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); follow = true; log.scrollTop = log.scrollHeight; }
  }
  function onSubmit(e) {
    e.preventDefault();
    const line = input.value;
    input.value = '';
    refreshSuggestions();
    follow = true;
    run(line);
  }
  function onDialogClose() { if (isOpen) close(); }
  function onCancel(e) { e.preventDefault(); close(); }     // Escape from anywhere inside the modal
  /* On phones the software keyboard shrinks the visual viewport but not the
     layout viewport; the console tracks the visual viewport so the prompt stays
     above the keys. */
  const vv = window.visualViewport;
  function onViewport() {
    if (!vv || inline) return;
    const gap = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    el.style.setProperty('--con-kb', `${gap}px`);
  }
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onClick);
  input.addEventListener('keydown', onInputKey);
  input.addEventListener('input', () => { walking = false; refreshSuggestions(); });
  input.addEventListener('focus', () => { if (inline && !isOpen) open(); });
  form.addEventListener('submit', onSubmit);
  log.addEventListener('scroll', onLogScroll, { passive: true });
  closeBtn.addEventListener('click', close);
  if (!inline) { el.addEventListener('close', onDialogClose); el.addEventListener('cancel', onCancel); vv?.addEventListener('resize', onViewport); vv?.addEventListener('scroll', onViewport); }
  const unsubTier = governor.subscribe(({ tier }) => { el.dataset.tier = String(tier); });
  setCwd(cwd);
  if (inline) { isOpen = true; el.dataset.open = ''; if (banner) { bannered = true; printBanner(); flush(); } }

  const api = {
    el, open, close, toggle() { isOpen && !inline ? close() : open(); }, run, register,
    unregister(name) { registry.delete(String(name).toLowerCase()); },
    configure(opts = {}) { Object.assign(config, opts); if (isOpen) refreshSuggestions(); scheduleRender(); },
    focus() { input.focus({ preventScroll: true }); },
    get commands() { return [...registry.values()].map((c) => ({ name: c.name, args: c.args || '', help: c.help || '' })); },
    get state() {
      return {
        open: isOpen, inline: !!inline, cwd: pathOf(cwd), entries: entries.length, rendered: [rendered.start, rendered.end],
        virtual: entries.length > config.virtualFrom, follow, rowH: +rowH.toFixed(1), history: history.length,
        suggestions: sug.items.map((s) => s.label), suggestionIndex: sug.index, runs, lastRun, tier: el.dataset.tier ?? null,
        virtualFrom: config.virtualFrom, suggestMax: config.suggestMax, hotkeys: config.hotkeys, navigate: config.navigate,
      };
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('click', onClick);
      vv?.removeEventListener('resize', onViewport); vv?.removeEventListener('scroll', onViewport);
      unsubTier();
      if (renderRaf) { (document.hidden ? clearTimeout : cancelAnimationFrame)(renderRaf); renderRaf = 0; }
      if (!inline && el.open) { isOpen = false; el.close(); }
      el.remove();
      registry.clear(); entries.length = 0;
    },
  };
  return api;
}
export default mountConsole;
