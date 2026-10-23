#!/usr/bin/env node
/*
 * a11y.cjs: keyboard trail, structure, live regions and small-text contrast of the field page.
 *
 *   node a11y.cjs [--page vx/index.html] [--viewport 1440x900] [options]
 *
 * Pass 1 (plain URL): one h1; a skip link that is the first Tab stop and points at an element that
 * exists; images without alt; canvases that are neither aria-hidden nor role=img with a label;
 * every element with a visible text node under 12 px on a dark background (relative luminance
 * under 0.2), its colour composited through ancestor opacity and backgrounds, against WCAG 4.5:1;
 * then the keyboard trail: Tab from the top until focus cycles, recording each stop's role and
 * accessible name (Chromium's accessibility tree over CDP) and whether focus is visible: the focused
 * computed style is compared with the same element's style at rest (outline, box-shadow, border
 * colour, background, colour, underline, position on screen for skip links).
 * Pass 2 (--live-query, default autolaunch=1&speed=1): live regions ([aria-live] not off, role
 * status/log/alert/timer/marquee) and role=img aria-labels are watched for --live-seconds (5) while
 * the flight runs; text changes are timed.
 *
 * Options
 *   --page <path>  --query <qs>  --viewport WxH (1440x900)  --reduced
 *   --live-query <qs>      default autolaunch=1&speed=1       --live-seconds <s>  default 5
 *   --max-tabs <n>         default 300                        --ignore <css>  skip matching text
 *   --any-page             skip the field-page readiness check (labs)
 *   --out <dir>            default reports/field/probes/a11y   --root <dir>
 *
 * Writes report.json and trail.png (full page, tab stops numbered in order at their rest positions;
 * red = no visible focus, no name, or off screen when focused; stops hidden at rest inside a scrolled
 * container, such as the lower part of the panel's rail, are listed in keyboard.notDrawn instead).
 * Gates: exactly one h1; skip link first and its target exists; every tabbable element reached;
 * every stop named and with visible focus; no img without alt; no unlabelled canvas; no live region
 * or role=img label changing faster than 1 Hz (two changes closer than 950 ms); no small text on a
 * dark background under 4.5:1. Exit 0 PASS, 1 FAIL, 2 NOT READY (not the field page), 3 harness
 * error. One SUMMARY line last.
 */
const path = require("path");
const fs = require("fs");
const L = require("./lib.cjs");

const o = L.args(__filename);
const PAGE = (o.page || "vx/index.html").replace(/^\.?\//, "");
const VP = L.viewports(o.viewport || "1440x900")[0];
const LIVE_S = L.num(o["live-seconds"], 5), MAX_TABS = L.num(o["max-tabs"], 300);
const LIVE_Q = typeof o["live-query"] === "string" ? o["live-query"] : "autolaunch=1&speed=1";
const IGNORE = typeof o.ignore === "string" ? o.ignore : "";

L.run("a11y", o, async ({ dir, report, base, browser }) => {
  const url = L.withQuery(PAGE, o.query);
  report.page = url; report.viewport = `${VP.width}x${VP.height}`;
  const { ctx, page, log } = await L.openPage(browser, { viewport: VP, reducedMotion: o.reduced ? "reduce" : "no-preference" });
  try {
    const resp = await page.goto(base + url, { waitUntil: "load", timeout: 60000 }).catch(() => null);
    if (!resp || resp.status() >= 400) throw new L.NotReady(`${PAGE} did not load (HTTP ${resp && resp.status()})`);
    await page.waitForTimeout(2500);
    if (!o["any-page"]) L.assertField(await L.fieldState(page), PAGE);
    await page.evaluate(`window.__sel = ${selector.toString()}`);
    report.structure = await page.evaluate(structure, IGNORE);
    // Keyboard trail.
    const rest = await page.evaluate(markTabbables);
    const cdp = await ctx.newCDPSession(page);
    await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
    const trail = []; let firstKey = null;
    for (let i = 0; i < Math.min(MAX_TABS, rest.length * 2 + 10); i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(focusInfo);
      if (!f) { trail.push({ step: i + 1, body: true }); if (trail.filter((t) => t.body).length > 1) break; continue; }
      f.ax = await axName(cdp);
      f.step = i + 1;
      const key = f.idx ?? f.sel;
      if (firstKey === null) firstKey = key; else if (key === firstKey) break;
      trail.push(f);
    }
    const reached = new Set(trail.filter((t) => t.idx !== undefined && t.idx !== null).map((t) => t.idx));
    const unreached = rest.filter((r) => !reached.has(r.idx)).map((r) => r.sel + (r.name ? ` "${r.name}"` : ""));
    const stops = trail.filter((t) => !t.body);
    report.keyboard = {
      tabbables: rest.length, stops: stops.length, unreached,
      unnamed: stops.filter((t) => !(t.ax && t.ax.name)).map((t) => t.sel),
      noVisibleFocus: stops.filter((t) => !t.visible).map((t) => t.sel),
      offScreen: stops.filter((t) => !t.onScreen).map((t) => t.sel),
      trail: stops.map((t) => ({ n: t.step, sel: t.sel, role: t.ax && t.ax.role, name: t.ax && t.ax.name, visible: t.visible, via: t.via, onScreen: t.onScreen })),
    };
    const s = report.structure;
    const firstStop = stops[0];
    report.skipLink = { found: s.skip, firstStop: firstStop ? firstStop.sel : null, isFirst: !!(s.skip && firstStop && firstStop.isSkip), targetExists: !!(s.skip && s.skip.targetExists) };
    // Trail picture.
    // draw at the rest positions (scroll containers back at the top), focus position for things off screen at rest (skip links)
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); for (const e of document.querySelectorAll("*")) if (e.scrollTop) e.scrollTop = 0; window.scrollTo(0, 0); });
    const full = await page.screenshot({ fullPage: true });
    const byIdx = new Map(rest.map((r) => [r.idx, r]));
    const drawn = stops.map((t) => { const r0 = byIdx.get(t.idx); const atRest = r0 && r0.docRect[0] + r0.docRect[2] > 0 && r0.docRect[1] + r0.docRect[3] > 0; return { n: t.step, r: atRest ? r0.docRect : t.docRect, skip: !!(r0 && r0.clipped), ok: !!(t.visible && t.ax && t.ax.name && t.onScreen) }; });
    report.keyboard.notDrawn = drawn.filter((d) => d.skip).map((d) => d.n);
    const png = await page.evaluate(drawTrail, { b64: full.toString("base64"), stops: drawn.filter((d) => !d.skip) });
    fs.writeFileSync(path.join(dir, "trail.png"), Buffer.from(png.split(",")[1], "base64"));
    report.trailImage = path.join(dir, "trail.png");
    report.errorsPass1 = L.cleanLog(log);
  } finally { await ctx.close().catch(() => {}); }
  // Pass 2: live regions while the flight runs.
  const live = await L.openPage(browser, { viewport: VP, reducedMotion: o.reduced ? "reduce" : "no-preference" });
  try {
    const url2 = L.withQuery(PAGE, LIVE_Q, o.query);
    await live.page.goto(base + url2, { waitUntil: "load", timeout: 60000 });
    await live.page.waitForTimeout(3000);
    await live.page.evaluate(`window.__sel = ${selector.toString()}`);
    report.live = await live.page.evaluate(watchLive, LIVE_S * 1000);
    report.live.url = url2;
    report.errorsPass2 = L.cleanLog(live.log);
  } finally { await live.ctx.close().catch(() => {}); }
  // Gates.
  const s = report.structure, k = report.keyboard, lv = report.live;
  const fastLive = lv.regions.filter((r) => r.minIntervalMs !== null && r.minIntervalMs < 950);
  report.gates = {
    oneH1: s.h1.length === 1, skipLinkFirst: report.skipLink.isFirst, skipTargetExists: report.skipLink.targetExists,
    allTabbablesReached: k.unreached.length === 0, allStopsNamed: k.unnamed.length === 0, focusVisibleEverywhere: k.noVisibleFocus.length === 0,
    imagesHaveAlt: s.imgNoAlt.length === 0, canvasesLabelled: s.canvasBad.length === 0,
    liveRegionsAtMost1Hz: fastLive.length === 0, smallTextContrast: s.contrastFails.length === 0,
    noPageErrors: report.errorsPass1.pageErrors.length + report.errorsPass2.pageErrors.length === 0,
  };
  const fails = Object.entries(report.gates).filter(([, v]) => v === false).map(([g]) => g);
  return { pass: fails.length === 0, detail: `${fails.length ? "failed " + fails.join(",") + " / " : ""}h1 ${s.h1.length} / tab ${k.stops}/${k.tabbables} reached, ${k.unreached.length} unreached, ${k.noVisibleFocus.length} no focus ring, ${k.unnamed.length} unnamed / live regions ${lv.regions.length}, fastest ${lv.fastestMs ?? "-"} ms / small-text contrast fails ${s.contrastFails.length} of ${s.smallTextChecked} / img no alt ${s.imgNoAlt.length} / canvases unlabelled ${s.canvasBad.length}` };
}, /^trail\.png$/);

async function axName(cdp) {
  try {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "document.activeElement" });
    const { node } = await cdp.send("DOM.describeNode", { objectId: result.objectId });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { backendNodeId: node.backendNodeId, fetchRelatives: false });
    const n = nodes.find((x) => !x.ignored) || nodes[0];
    return { role: n && n.role && n.role.value, name: n && n.name ? String(n.name.value || "").trim() : "" };
  } catch (e) { return { role: null, name: null, error: String(e.message).slice(0, 80) }; }
}

/* ---- in-page ---- */
function selector(e) {
  if (!e || e === document.body) return "body";
  const id = e.id ? "#" + e.id : "", cls = typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  const extra = e.dataset && (e.dataset.act || e.dataset.value || e.dataset.ctl) ? `[${e.dataset.act ? "data-act=" + e.dataset.act : e.dataset.value ? "data-value=" + e.dataset.value : "data-ctl=" + e.dataset.ctl}]` : "";
  return e.tagName.toLowerCase() + id + cls + extra;
}
function structure(ignore) {
  const sel = window.__sel;
  const h1 = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim().replace(/\s+/g, " "));
  const tabbable = (e) => e.tabIndex >= 0 && !e.disabled && !e.closest("[inert]") && e.getClientRects().length > 0;
  const firstLink = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].find(tabbable);
  let skip = null;
  if (firstLink && firstLink.tagName === "A" && /^#./.test(firstLink.getAttribute("href") || "")) {
    const id = decodeURIComponent(firstLink.getAttribute("href").slice(1));
    skip = { text: firstLink.textContent.trim(), href: firstLink.getAttribute("href"), targetExists: !!(document.getElementById(id) || document.getElementsByName(id)[0]), looksLikeSkip: /skip|jump|main/i.test(firstLink.textContent) };
  }
  const hidden = (e) => !!e.closest("[aria-hidden='true']");
  const imgNoAlt = [...document.querySelectorAll("img:not([alt])")].filter((i) => !hidden(i)).map((i) => sel(i) + " " + (i.getAttribute("src") || "").slice(-60));
  const canvasBad = [...document.querySelectorAll("canvas")].filter((c) => !hidden(c) && !(c.getAttribute("role") === "img" && (c.getAttribute("aria-label") || c.getAttribute("aria-labelledby")))).map((c) => sel(c) + ` role=${c.getAttribute("role")} label=${c.getAttribute("aria-label")}`);
  const liveRegions = document.querySelectorAll("[aria-live]:not([aria-live='off']), [role=status], [role=log], [role=alert], [role=timer], [role=marquee]").length;
  // small text contrast
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const bgOf = (e) => {
    const chain = []; let uncertain = null;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); const c = parse(cs.backgroundColor); if (cs.backgroundImage && cs.backgroundImage !== "none") uncertain = uncertain || "background-image on " + sel(n); if (c && c[3] > 0) { chain.push(c); if (c[3] >= 1) break; } }
    let bg = [255, 255, 255, 1]; for (let i = chain.length - 1; i >= 0; i--) bg = over(chain[i], bg);
    return { bg, uncertain };
  };
  const canvases = [...document.querySelectorAll("canvas, video")].map((c) => ({ c, r: c.getBoundingClientRect() }));
  const fails = []; let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const e = t.parentElement; if (!e || seen.has(e) || !t.nodeValue.trim()) continue; seen.add(e);
    if (hidden(e) || (ignore && e.closest(ignore)) || e.closest("script,style,noscript,[disabled],[aria-disabled='true']")) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if (cs.visibility === "hidden" || cs.display === "none" || r.width <= 1 || r.height <= 1) continue;
    const fs = parseFloat(cs.fontSize); if (!(fs < 12)) continue;
    let fg = parse(cs.color); if (!fg) continue;
    let op = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    const { bg, uncertain } = bgOf(e); if (lum(bg) >= 0.2) continue;
    fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    checked++;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const overCanvas = canvases.some(({ c, r: q }) => !e.contains(c) && cx >= q.left && cx <= q.right && cy >= q.top && cy <= q.bottom);
    if (ratio < 4.5) fails.push({ sel: sel(e), text: t.nodeValue.trim().slice(0, 40), fontPx: fs, fg: fg.slice(0, 3).map(Math.round), bg: bg.slice(0, 3).map(Math.round), ratio: +ratio.toFixed(2), bgUncertain: uncertain || (overCanvas ? "drawn over a canvas" : null) });
  }
  return { h1, skip, imgNoAlt, canvasBad, liveRegions, smallTextChecked: checked, contrastFails: fails };
}
function markTabbables() {
  const sel = window.__sel;
  const els = [...document.querySelectorAll("a[href], area[href], button, input:not([type=hidden]), select, textarea, summary, iframe, [tabindex], [contenteditable=true], audio[controls], video[controls]")]
    .filter((e) => e.tabIndex >= 0 && !e.disabled && !e.closest("[inert]") && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden");
  const props = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "borderTopColor", "borderBottomColor", "backgroundColor", "color", "textDecorationLine"];
  window.__rest = new Map();
  return els.map((e, i) => {
    e.dataset.a11yI = String(i);
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    window.__rest.set(i, { style: Object.fromEntries(props.map((p) => [p, cs[p]])), rect: [r.left, r.top, r.width, r.height] });
    let clipped = false;   // hidden at rest inside a scrolled or clipped ancestor (the panel's rail scrolls on its own)
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const st = getComputedStyle(n); if (st.overflowY !== "visible" || st.overflowX !== "visible") { const q = n.getBoundingClientRect(); if (r.bottom <= q.top || r.top >= q.bottom || r.right <= q.left || r.left >= q.right) { clipped = true; break; } } }
    return { idx: i, sel: sel(e), name: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40), docRect: [r.left + scrollX, r.top + scrollY, r.width, r.height], clipped };
  });
}
function focusInfo() {
  const e = document.activeElement; if (!e || e === document.body || e === document.documentElement) return null;
  const idx = e.dataset && e.dataset.a11yI !== undefined ? Number(e.dataset.a11yI) : null;
  const cs = getComputedStyle(e), r = e.getBoundingClientRect(), rest = idx !== null ? window.__rest.get(idx) : null;
  const via = [];
  if (rest) {
    const s = rest.style;
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && (cs.outlineStyle !== s.outlineStyle || cs.outlineWidth !== s.outlineWidth || cs.outlineColor !== s.outlineColor)) via.push("outline");
    if (cs.boxShadow !== s.boxShadow && cs.boxShadow !== "none") via.push("box-shadow");
    if (cs.borderTopColor !== s.borderTopColor || cs.borderBottomColor !== s.borderBottomColor) via.push("border");
    if (cs.backgroundColor !== s.backgroundColor) via.push("background");
    if (cs.color !== s.color) via.push("color");
    if (cs.textDecorationLine !== s.textDecorationLine) via.push("underline");
    const wasOff = rest.rect[1] + rest.rect[3] <= 0 || rest.rect[0] + rest.rect[2] <= 0;
    if (wasOff && r.bottom > 0 && r.right > 0) via.push("moved on screen");
  } else if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) via.push("outline (no rest style)");
  const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  return { idx, sel: window.__sel(e), visible: via.length > 0, via, focusVisible: e.matches(":focus-visible"), onScreen, isSkip: e.tagName === "A" && /^#/.test(e.getAttribute("href") || "") && /skip|jump|main/i.test(e.textContent), docRect: [r.left + scrollX, r.top + scrollY, r.width, r.height] };
}
function watchLive(ms) {
  const q = "[aria-live]:not([aria-live='off']), [role=status], [role=log], [role=alert], [role=timer], [role=marquee]";
  const regions = [...document.querySelectorAll(q)].map((e) => ({ e, kind: "live", sel: window.__sel ? window.__sel(e) : e.tagName, last: e.textContent, times: [], samples: [] }));
  const labels = [...document.querySelectorAll("[role=img][aria-label]")].map((e) => ({ e, kind: "role=img label", sel: window.__sel ? window.__sel(e) : e.tagName, last: e.getAttribute("aria-label"), times: [], samples: [] }));
  const all = [...regions, ...labels];
  const obs = all.map((r) => { const m = new MutationObserver(() => { const now = r.kind === "live" ? r.e.textContent : r.e.getAttribute("aria-label"); if (now !== r.last) { r.last = now; r.times.push(performance.now()); if (r.samples.length < 6) r.samples.push(String(now).trim().slice(0, 80)); } }); m.observe(r.e, r.kind === "live" ? { childList: true, characterData: true, subtree: true } : { attributes: true, attributeFilter: ["aria-label"] }); return m; });
  return new Promise((res) => setTimeout(() => {
    obs.forEach((m) => m.disconnect());
    const out = all.map((r) => { let min = null; for (let i = 1; i < r.times.length; i++) { const d = r.times[i] - r.times[i - 1]; if (min === null || d < min) min = d; } return { sel: r.sel, kind: r.kind, politeness: r.e.getAttribute("aria-live") || r.e.getAttribute("role"), changes: r.times.length, rateHz: +(r.times.length / (ms / 1000)).toFixed(2), minIntervalMs: min === null ? null : Math.round(min), samples: r.samples }; });
    const mins = out.map((r) => r.minIntervalMs).filter((v) => v !== null);
    res({ seconds: ms / 1000, regions: out, fastestMs: mins.length ? Math.min(...mins) : null });
  }, ms));
}
async function drawTrail({ b64, stops }) {
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  g.font = "bold 12px monospace"; g.lineWidth = 2;
  for (const s of stops) {
    const [x, y, w, h] = s.r; const col = s.ok ? "#00e676" : "#ff1744";
    g.strokeStyle = col; g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = col; g.fillRect(x - 1, y - 15, 8 + 8 * String(s.n).length, 14); g.fillStyle = "#000"; g.fillText(String(s.n), x + 2, y - 4);
  }
  return c.toDataURL("image/png");
}
