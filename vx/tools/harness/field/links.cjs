#!/usr/bin/env node
/*
 * links.cjs: every relative reference from the vx pages resolves to a file in the repo.
 *
 *   node links.cjs [--pages "vx/index.html,vx/lab/*.html"] [--root /home/user/merttureli-site]
 *
 * Static crawl, no browser. From each page it collects href, src, srcset, poster and xlink:href
 * attributes, the import map entries, inline scripts and styles; from every module or script it
 * reaches (transitively) the static imports and re-exports, string-literal dynamic import(),
 * new URL('...', import.meta.url), and from CSS url(...) and @import. Bare specifiers (three) go
 * through the page's import map. HTML pages under vx/ that a page links to are crawled too; targets
 * outside vx/ are only checked for existence. Comments are stripped before scanning JS.
 * Also reported, not gated: string literals in JS that look like asset paths ('../x.json', './y.bin')
 * and resolve neither against the module nor against the page (they may be built at run time);
 * dynamic imports whose argument is not a literal; targets that exist on disk but are not tracked
 * by git (they would 404 once the tree is committed and deployed); git-deleted files still referenced.
 *
 * Options
 *   --pages <globs>   comma list, * allowed in the file name (default vx/index.html,vx/lab/*.html)
 *   --strict          also fail on missing asset-path strings and untracked targets
 *   --out <dir>       default reports/field/probes/links      --root <dir>
 *
 * Writes report.json and links.md. Gate: no missing target from an attribute, import map, import,
 * export-from, literal dynamic import, new URL(import.meta.url), or CSS reference.
 * Exit 0 PASS, 1 FAIL, 2 NOT READY (no page matched), 3 harness error. One SUMMARY line last.
 */
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const L = require("./lib.cjs");

const o = L.args(__filename);
o.static = true;
const ROOT = path.resolve(o.root || L.ROOT);
const GLOBS = String(o.pages || "vx/index.html,vx/lab/*.html").split(",").map((s) => s.trim()).filter(Boolean);

function expand(glob) {
  const dir = path.join(ROOT, path.dirname(glob)), base = path.basename(glob);
  if (!base.includes("*")) return fs.existsSync(path.join(ROOT, glob)) ? [glob] : [];
  const re = new RegExp("^" + base.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.posix.join(path.dirname(glob), f)) : [];
}
/* JS without comments and regex literals; strings and template literals are kept intact. */
function stripJs(src) {
  let out = "", i = 0, q = null, prev = "";
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === "\\") { out += n || ""; i += 2; continue; } if (c === q) { q = null; prev = c; } i++; continue; }
    if (c === "'" || c === '"' || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; out += " "; continue; }
    if (c === "/" && n === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
    if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || /(?:return|typeof|case|in|of)$/.test(out.trimEnd()))) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== "\n") { const d = src[j]; if (d === "\\") { j += 2; continue; } if (d === "[") cls = true; else if (d === "]") cls = false; else if (d === "/" && !cls) break; j++; }
      if (src[j] === "/") { out += "/r/"; i = j + 1; while (/[a-z]/i.test(src[i] || "")) i++; prev = "/"; continue; }
    }
    out += c; if (!/\s/.test(c)) prev = c; i++;
  }
  return out;
}
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{|\$)/i;
function jsRefs(code) {
  const s = stripJs(code), refs = [], seen = new Set();
  const add = (kind, ref) => { const k = kind + " " + ref; if (!seen.has(k)) { seen.add(k); refs.push({ kind, ref }); } };
  for (const m of s.matchAll(/\bimport\s*(?:[\w*{}\s,$]+?\s*from\s*)?(['"])([^'"\n]+)\1/g)) add("import", m[2]);
  for (const m of s.matchAll(/\bexport\s*(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\s*(['"])([^'"\n]+)\1/g)) add("export-from", m[2]);
  for (const m of s.matchAll(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*[,)]/g)) add("dynamic-import", m[2]);
  for (const m of s.matchAll(/\bimport\s*\(\s*`([^`]*)`\s*[,)]/g)) m[1].includes("${") ? add("dynamic-nonliteral", "`" + m[1] + "`") : add("dynamic-import", m[1]);
  for (const m of s.matchAll(/\bimport\s*\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/g)) add("dynamic-nonliteral", m[1]);
  for (const m of s.matchAll(/new\s+URL\(\s*(['"`])([^'"`\n]+)\1\s*,\s*import\.meta\.url/g)) add("url-meta", m[2]);
  const hard = new Set(refs.map((r) => r.ref));
  for (const m of s.matchAll(/(['"])((?:\.\.?\/)[^'"\s]*?\.(?:json|bin|glb|gltf|png|jpe?g|webp|svg|ttf|woff2?|mp4|webm|js|mjs|css|html))\1/g)) if (!hard.has(m[2])) add("asset-string", m[2]);
  return refs;
}
function cssRefs(code) {
  const s = code.replace(/\/\*[\s\S]*?\*\//g, " "), refs = [];
  for (const m of s.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) refs.push({ kind: "css-url", ref: m[2].trim() });
  for (const m of s.matchAll(/@import\s+(['"])([^'"]+)\1/g)) refs.push({ kind: "css-import", ref: m[2] });
  return refs;
}
function htmlRefs(html) {
  const refs = [], scripts = [], styles = []; let importMap = null;
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  h = h.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (all, attrs, body) => { scripts.push({ attrs, body }); return `<script${attrs}></script>`; });
  h = h.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (all, body) => { styles.push(body); return ""; });
  for (const tag of h.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    for (const a of tag[2].matchAll(/(?:^|\s)(href|src|poster|xlink:href|srcset|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const name = a[1].toLowerCase(), v = (a[2] ?? a[3] ?? a[4] ?? "").trim();
      if (name === "style") { refs.push(...cssRefs(v)); continue; }
      if (name === "srcset") { for (const part of v.split(",")) { const u = part.trim().split(/\s+/)[0]; if (u) refs.push({ kind: "srcset", ref: u }); } continue; }
      const isNav = tag[1].toLowerCase() === "a" || tag[1].toLowerCase() === "area";
      refs.push({ kind: isNav ? "link" : `${tag[1].toLowerCase()}[${name}]`, ref: v });
    }
  }
  for (const s of scripts) {
    if (/type\s*=\s*["']?importmap/i.test(s.attrs)) { try { importMap = JSON.parse(s.body); } catch (e) { refs.push({ kind: "importmap-invalid", ref: String(e.message) }); } continue; }
    if (s.body.trim() && !/type\s*=\s*["']?(?:application\/(?:ld\+)?json|text\/(?:template|plain))/i.test(s.attrs)) refs.push(...jsRefs(s.body));
  }
  for (const s of styles) refs.push(...cssRefs(s));
  if (importMap && importMap.imports) for (const [k, v] of Object.entries(importMap.imports)) refs.push({ kind: "importmap", ref: v, spec: k });
  return { refs, importMap };
}
function tracked() {
  try {
    const t = new Set(execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\0").filter(Boolean));
    const st = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "-z"], { maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\0").filter(Boolean);
    return { t, deleted: new Set(st.filter((l) => /^(D.|.D) /.test(l)).map((l) => l.slice(3))), ok: true };
  } catch { return { t: new Set(), deleted: new Set(), ok: false }; }
}

L.run("links", o, async ({ dir, report }) => {
  const pages = [...new Set(GLOBS.flatMap(expand))];
  if (!pages.length) throw new L.NotReady(`no page matched ${GLOBS.join(", ")}`);
  const git = tracked();
  const missing = [], warnings = [], visited = new Map(), seenRef = new Set();
  let checked = 0;
  // A unit is one file reached from one page (import maps are per page).
  const queue = pages.map((p) => ({ file: p, page: p, via: null }));
  const importMaps = {};
  while (queue.length) {
    const { file, page, via } = queue.shift();
    const key = page + "|" + file; if (visited.has(key)) continue; visited.set(key, true);
    const abs = path.join(ROOT, file); if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const ext = path.extname(file).toLowerCase(), src = fs.readFileSync(abs, "utf8");
    let refs;
    if (ext === ".html" || ext === ".htm") { const r = htmlRefs(src); refs = r.refs; if (file === page) importMaps[page] = r.importMap; }
    else if (ext === ".css") refs = cssRefs(src);
    else if (ext === ".js" || ext === ".mjs") refs = jsRefs(src);
    else continue;
    for (const { kind, ref, spec } of refs) {
      if (kind === "dynamic-nonliteral") { warnings.push({ type: "non-literal dynamic import", from: file, ref }); continue; }
      if (kind === "importmap-invalid") { missing.push({ from: file, kind, ref, resolved: null }); continue; }
      if (!ref || SKIP.test(ref)) continue;
      let target, bare = false;
      if (/^[./]/.test(ref)) {
        const clean = ref.split("#")[0].split("?")[0]; if (!clean) continue;
        target = ref.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(file), clean));
      } else if (kind === "import" || kind === "export-from" || kind === "dynamic-import") {
        const map = (importMaps[page] && importMaps[page].imports) || {};
        const hit = Object.keys(map).filter((k) => ref === k || (k.endsWith("/") && ref.startsWith(k))).sort((a, b) => b.length - a.length)[0];
        if (!hit) { missing.push({ from: file, page, kind: "bare-specifier-unmapped", ref, resolved: null }); continue; }
        const mapped = map[hit] + ref.slice(hit.length); bare = true;
        target = mapped.startsWith("/") ? mapped.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(page), mapped.split("?")[0]));
      } else if (kind === "link" || kind.endsWith("[href]") || kind.endsWith("[src]") || kind === "srcset" || kind === "css-url") {
        target = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref.split("#")[0].split("?")[0]));   // bare relative name such as "app.js"
      } else continue;
      if (kind === "importmap" && ref.endsWith("/")) { if (!fs.existsSync(path.join(ROOT, target))) missing.push({ from: file, page, kind: "importmap-prefix", ref, resolved: target.replace(/\/?$/, "/") }); continue; }
      if (target.endsWith("/") || (fs.existsSync(path.join(ROOT, target)) && fs.statSync(path.join(ROOT, target)).isDirectory())) target = path.posix.join(target, "index.html");
      if (target.startsWith("..")) { warnings.push({ type: "outside the repo root", from: file, ref }); continue; }
      const exists = fs.existsSync(path.join(ROOT, target)) && fs.statSync(path.join(ROOT, target)).isFile();
      const rk = file + "|" + kind + "|" + target; if (seenRef.has(rk)) continue; seenRef.add(rk); checked++;
      if (kind === "asset-string") {
        const alt = path.posix.normalize(path.posix.join(path.posix.dirname(page), ref));
        if (!exists && !fs.existsSync(path.join(ROOT, alt))) warnings.push({ type: "asset-path string resolves nowhere", from: file, ref, tried: [target, alt] });
        continue;
      }
      if (!exists) { missing.push({ from: file, page, kind, ref, resolved: target, gitDeleted: git.deleted.has(target) || undefined, via: via || undefined }); continue; }
      if (git.ok && !git.t.has(target)) warnings.push({ type: "exists but untracked by git", from: file, ref, resolved: target });
      const tExt = path.extname(target).toLowerCase();
      const follow = [".js", ".mjs", ".css"].includes(tExt) && kind !== "link" ? true : (tExt === ".html" && target.startsWith("vx/"));
      if (follow) queue.push({ file: target, page: tExt === ".html" ? target : page, via: file });
      void bare;
    }
  }
  const uniq = (arr) => { const s = new Set(); return arr.filter((m) => { const k = JSON.stringify([m.from, m.ref, m.type || m.kind]); if (s.has(k)) return false; s.add(k); return true; }); };
  const miss = uniq(missing), warn = uniq(warnings);
  const strictBad = o.strict ? warn.filter((w) => /asset-path|untracked/.test(w.type)).length : 0;
  Object.assign(report, { root: ROOT, pages, filesScanned: [...new Set([...visited.keys()].map((k) => k.split("|")[1]))].length, files: [...new Set([...visited.keys()].map((k) => k.split("|")[1]))].sort(), refsChecked: checked, git: git.ok, missing: miss, warnings: warn, importMaps });
  const md = [`# links: ${miss.length} missing, ${warn.length} warnings`, "", `Pages: ${pages.join(", ")}`, `Files scanned: ${report.filesScanned}, references checked: ${checked}`, "",
    "## Missing targets", "", miss.length ? "| from | kind | ref | resolved |\n|---|---|---|---|\n" + miss.map((m) => `| ${m.from} | ${m.kind} | \`${m.ref}\` | ${m.resolved || "-"}${m.gitDeleted ? " (git rm)" : ""} |`).join("\n") : "None.", "",
    "## Warnings (not gated" + (o.strict ? "; --strict gates asset strings and untracked" : "") + ")", "", warn.length ? warn.map((w) => `- ${w.type}: ${w.from} -> \`${w.ref}\`${w.resolved ? " (" + w.resolved + ")" : ""}`).join("\n") : "None.", ""].join("\n");
  fs.writeFileSync(path.join(dir, "links.md"), md);
  return { pass: miss.length === 0 && strictBad === 0, detail: `${pages.length} pages, ${report.filesScanned} files, ${checked} refs / missing ${miss.length}${miss.length ? " (first: " + miss[0].from + " -> " + miss[0].ref + ")" : ""} / warnings ${warn.length}` };
}, /^links\.md$/);
