#!/usr/bin/env node
/**
 * Static render of the runtime pages.
 *
 * src/index.html and src/projects/*.html are <x-dc> templates: support.js (the
 * dc-runtime) loads React and the design-system bundle renders the
 * <x-import> components in the browser. This script loads each template in
 * Chromium, lets the runtime and React mount, and writes the rendered DOM as a
 * plain HTML page with no runtime, no React and no third-party requests:
 *
 *   src/index.html          -> <out>/index.html
 *   src/projects/<x>.html   -> <out>/projects/<x>.html
 *
 * While a page renders:
 *   - The server answers /index.html and /projects/<x>.html from src/, and
 *     every other path from the repo, so the templates see the tree they were
 *     written for.
 *   - Nothing leaves 127.0.0.1. React 18.3.1 comes from tools/prerender/vendor
 *     through window.__resources, which the runtime honours (and which also
 *     stops it re-fetching the page).
 *   - Every script except support.js, the design-system bundle and React is
 *     answered with an empty body. Those are the islands (site-palette.js,
 *     mobile-nav.js, media-playback.js, depth-motion.js, shader-bg.js, the
 *     photography loader, interaction-polish.js, the CHARGER launcher, the
 *     walkthrough, track.js, clarity.js, ...). Their script tags stay in the
 *     page, in order and with their attributes, and run on the static page
 *     exactly as they ran on the runtime page; they must not run here or their
 *     DOM changes would be baked into the snapshot.
 *   - The design-system bundle gets a few lines appended that tag Button,
 *     SiteHeader, SocialRail and ScrollCue with data-ds-* attributes, so
 *     css/static-interactions.css can rebuild their React hover states.
 *
 * Then, in the page: lucide icons from unpkg become data: URIs (same SVG
 * bytes, so they render identically), the runtime scripts are removed, the
 * design-system font file is swapped for css/fonts.css with preloads, and
 * css/static-interactions.css is linked last.
 *
 *   node tools/prerender/prerender.js --root . --out .
 *
 * Normally run through python3 tools/build.py.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");

const args = { root: process.cwd(), out: null, port: "0", pages: "", playwright: "" };
for (let i = 2; i < process.argv.length; i++) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(process.argv[i]);
  if (!m || !(m[1] in args)) { console.error("unknown option " + process.argv[i]); process.exit(2); }
  args[m[1]] = m[2] !== undefined ? m[2] : process.argv[++i];
}
const ROOT = path.resolve(args.root);
const SRC = path.join(ROOT, "src");
const OUT = path.resolve(args.out || ROOT);
const VENDOR = path.join(__dirname, "vendor");

function loadPlaywright() {
  const tries = [args.playwright, process.env.PLAYWRIGHT_PATH, path.join(__dirname, "node_modules", "playwright"),
                 "playwright", "/opt/node22/lib/node_modules/playwright"].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  console.error("Playwright not found. Run `npm install` in tools/prerender, then `npx playwright install chromium`.");
  process.exit(2);
}

const DS = "_ds/mert-t-reli-design-system-56763c60-2006-4913-8e27-d9c1c8053e6d/";
const REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";
const LUCIDE = "https://unpkg.com/lucide-static@0.544.0/icons/";
const FONT_PRELOADS = ["assets/fonts/space-grotesk-latin.woff2", "assets/fonts/ibm-plex-mono-400-latin.woff2"];

// Scripts the render needs. Anything else is an island and gets an empty body.
const ALLOWED_SCRIPTS = new Set(["/support.js", "/" + DS + "_ds_bundle.js",
  "/tools/prerender/vendor/react.production.min.js", "/tools/prerender/vendor/react-dom.production.min.js"]);

// Appended to the design-system bundle for the render only. Each wrapper adds
// data attributes through the component's own ...rest spread; the DOM is
// otherwise exactly what the component renders. data-ds-hover lists the
// hover changes the component would make that its style prop does not
// override (the style prop is spread last, so it wins over the hover skin).
const BUNDLE_PATCH = `
;(function () {
  var ns = window.MertTReliDesignSystem_56763c;
  if (!ns || !window.React) return;
  function wrap(name, extra) {
    var C = ns[name];
    if (!C) return;
    var W = function (props) { return React.createElement(C, Object.assign({}, props, extra(props || {}))); };
    W.displayName = name;
    ns[name] = W;
  }
  function has(s, keys) { return !!s && keys.some(function (k) { return s[k] !== undefined; }); }
  wrap("Button", function (p) {
    var v = p.variant || "solid", s = p.style, fx = [];
    if (p.disabled) return { "data-ds-button": v };
    if (/^(solid|outline|ghost|glass)$/.test(v) && !has(s, ["background", "backgroundColor"])) fx.push("bg");
    if (v === "outline" && !has(s, ["color"])) fx.push("color");
    if (v === "link" && !has(s, ["border", "borderBottom", "borderBottomColor", "borderColor"])) fx.push("border");
    if (p.trailing) fx.push("trail");
    return { "data-ds-button": v, "data-ds-hover": fx.join(" ") };
  });
  wrap("SiteHeader", function (p) { return { "data-ds-header": p.inverse ? "inverse" : "plain" }; });
  wrap("SocialRail", function (p) { return { "data-ds-rail": p.inverse ? "inverse" : "plain" }; });
  wrap("ScrollCue", function () { return { "data-ds-scrollcue": "" }; });
})();
`;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
};

// /index.html and /projects/<x>.html come from src/; everything else from the repo.
function resolveFile(rel) {
  if (rel === "/" || rel === "/index.html") return path.join(SRC, "index.html");
  const m = /^\/projects\/([\w-]+\.html)$/.exec(rel);
  if (m && fs.existsSync(path.join(SRC, "projects", m[1]))) return path.join(SRC, "projects", m[1]);
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
  return file.startsWith(ROOT) ? file : null;
}

function serve(port) {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { res.writeHead(400); return res.end(); }
    const file = resolveFile(rel);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
                         "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(port), "127.0.0.1", () => resolve(server));
  });
}

function pageList() {
  if (args.pages) return args.pages.split(",").filter(Boolean);
  const cases = fs.readdirSync(path.join(SRC, "projects")).filter(f => f.endsWith(".html")).sort();
  return ["index.html", ...cases.map(f => "projects/" + f)];
}

function lucideIcons() {
  const out = {};
  for (const f of fs.readdirSync(path.join(VENDOR, "lucide"))) {
    if (!f.endsWith(".svg")) continue;
    const svg = fs.readFileSync(path.join(VENDOR, "lucide", f), "utf8");
    out[f.replace(/\.svg$/, "")] = "data:image/svg+xml," + encodeURIComponent(svg);
  }
  return out;
}

async function render(browser, origin, pagePath, icons) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await context.addInitScript(([r, rd]) => {
    window.__resources = { [r]: "/tools/prerender/vendor/react.production.min.js",
                           [rd]: "/tools/prerender/vendor/react-dom.production.min.js" };
  }, [REACT_URL, REACT_DOM_URL]);
  const bundle = fs.readFileSync(path.join(ROOT, DS, "_ds_bundle.js"), "utf8") + BUNDLE_PATCH;
  await context.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    const type = req.resourceType();
    if (type === "script") {
      if (url.pathname === "/" + DS + "_ds_bundle.js")
        return route.fulfill({ status: 200, contentType: "text/javascript", body: bundle });
      if (ALLOWED_SCRIPTS.has(url.pathname)) return route.continue();
      return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    }
    if (type === "document" && !req.isNavigationRequest()) return route.abort();
    if (/^(image|media|font)$/.test(type)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", e => problems.push("page error: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) problems.push("console: " + m.text()); });

  await page.goto(origin + "/" + pagePath, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const root = document.getElementById("dc-root");
    return root && root.querySelector("h1, h2") && !document.querySelector("x-dc, x-import, .sc-placeholder, .sc-missing")
      && document.querySelector('script[src*="_ds_bundle.js"]');
  }, null, { timeout: 30000 });
  // settle: the DOM must stop changing before it is written out
  let last = "";
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(150);
    const now = await page.evaluate(() => document.documentElement.outerHTML);
    if (now === last) break;
    last = now;
  }

  const html = await page.evaluate(([icons, LUCIDE, DS, FONT_PRELOADS]) => {
    const fail = msg => { throw new Error(msg); };
    const prefix = location.pathname.split("/").length > 2 ? "../" : "";
    const head = document.head;

    // icons: the same SVG bytes, inline
    for (const img of document.querySelectorAll("img[src^='" + LUCIDE + "']")) {
      const name = img.getAttribute("src").slice(LUCIDE.length).replace(/\.svg$/, "");
      img.setAttribute("src", icons[name] || fail("no vendored lucide icon: " + name));
    }
    // React sets `muted` as a property only; keep the template's attribute
    for (const v of document.querySelectorAll("video")) if (v.muted && !v.hasAttribute("muted")) v.setAttribute("muted", "");

    // drop a node and the line break the template had in front of it
    const drop = node => {
      const prev = node.previousSibling;
      if (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev.remove();
      node.remove();
    };
    // the runtime, React and the design-system bundle go
    for (const s of document.querySelectorAll("script[src]")) {
      const src = s.getAttribute("src");
      if (/(^|\/)support\.js$/.test(src) || src.includes("tools/prerender/vendor/") || src.includes("_ds_bundle.js")) drop(s);
    }
    const logic = document.querySelector("script[data-dc-script]") || fail("no page-logic script");
    drop(logic);
    // the runtime's "hide the raw template" rule and empty helmet placeholders
    for (const st of document.querySelectorAll("style"))
      if (st.textContent === "x-dc{display:none!important}" || !st.textContent.trim()) st.remove();
    // editor bookkeeping the runtime stamps on every template node
    for (const el of document.querySelectorAll("[data-dc-tpl]")) el.removeAttribute("data-dc-tpl");

    // The runtime prepends its base stylesheet (placeholder and print rules) to
    // <head>. Put it just before the first stylesheet instead: site-palette.js
    // stays the first thing in <head> and <meta charset> stays in the first
    // 1024 bytes, and the cascade order is unchanged.
    const base = [...head.querySelectorAll("style")].find(st => st.textContent.includes(".sc-placeholder{"));
    if (base) {
      const firstSheet = [...head.children].find(el => el !== base && (el.tagName === "STYLE" || (el.tagName === "LINK" && el.rel === "stylesheet")));
      firstSheet.before(base, "\n");
    }
    const palette = head.querySelector("script[src$='js/site-palette.js']");
    if (palette && head.firstElementChild !== palette) fail("site-palette.js is not first in <head>");

    // fonts: self-hosted file in place of the token file (same cascade slot)
    const fontLink = head.querySelector("link[rel=stylesheet][href$='" + DS + "tokens/fonts.css']") || fail("no tokens/fonts.css link");
    fontLink.setAttribute("href", prefix + "css/fonts.css");
    // _ds/.../styles.css is nothing but @imports of the eight token files the
    // links just before it already load, in the same order, so it changes no
    // computed value. It would also pull tokens/fonts.css, and with it Google
    // Fonts, back in. It goes.
    const dsStyles = head.querySelector("link[rel=stylesheet][href$='" + DS + "styles.css']") || fail("no styles.css link");
    if (dsStyles.previousElementSibling?.getAttribute("href") !== prefix + DS + "tokens/base.css") fail("styles.css no longer follows the token links");
    dsStyles.remove();
    const viewport = head.querySelector("meta[name=viewport]") || fail("no viewport meta");
    let at = viewport;
    for (const f of FONT_PRELOADS) {
      const l = document.createElement("link");
      l.rel = "preload"; l.setAttribute("href", prefix + f); l.setAttribute("as", "font");
      l.setAttribute("type", "font/woff2"); l.setAttribute("crossorigin", "");
      at.after("\n", l); at = l;
    }
    // React-only hover states, rebuilt in CSS; last so it wins ties
    const hover = document.createElement("link");
    hover.rel = "stylesheet"; hover.setAttribute("href", prefix + "css/static-interactions.css");
    head.append(hover, "\n");

    if (document.querySelector("x-dc, x-import, .sc-placeholder, .sc-missing, .sc-unresolved, .sc-logic-error")) fail("unrendered template left in page");
    if (document.querySelector("script[src*='unpkg.com'], link[href*='googleapis']")) fail("third-party reference left in page");
    return "<!DOCTYPE html>\n" + document.documentElement.outerHTML + "\n";
  }, [icons, LUCIDE, DS, FONT_PRELOADS]);

  await context.close();
  if (problems.length) throw new Error(pagePath + ":\n  " + problems.join("\n  "));
  return html;
}

// Dropping styles.css (see render) is only safe while it holds nothing but the
// token imports.
function assertStylesCssIsImportsOnly() {
  const css = fs.readFileSync(path.join(ROOT, DS, "styles.css"), "utf8").trim().split(/\r?\n/);
  const want = ["fonts", "colors", "typography", "spacing", "layout", "effects", "motion", "base"]
    .map(t => '@import url("tokens/' + t + '.css");');
  if (css.join("\n") !== want.join("\n")) {
    console.error(DS + "styles.css changed: it is no longer just the token imports. Update prerender.js.");
    process.exit(1);
  }
}

(async () => {
  assertStylesCssIsImportsOnly();
  const { chromium } = loadPlaywright();
  const server = await serve(args.port);
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const icons = lucideIcons();
  let failed = false;
  try {
    for (const p of pageList()) {
      try {
        const html = await render(browser, origin, p, icons);
        const dest = path.join(OUT, p);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, html);
        console.log("rendered %s (%s KB)", dest.startsWith(ROOT + path.sep) ? path.relative(ROOT, dest) : dest, (html.length / 1024).toFixed(1));
      } catch (e) {
        failed = true;
        console.error("FAILED " + p + ": " + e.message);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(failed ? 1 : 0);
})();
