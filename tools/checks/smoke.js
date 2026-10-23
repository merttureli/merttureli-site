#!/usr/bin/env node
/**
 * Smoke-load pages in headless Chromium and report what went wrong.
 *
 *   node tools/checks/smoke.js --base http://127.0.0.1:8987/ \
 *     --pages index.html,next/#reel-coaster --widths 390,1440 [--shots DIR]
 *
 * Normally run through `python3 tools/check.py --only smoke`, which serves the
 * repo and passes --base. Prints one JSON object on stdout:
 *   { results: [{ page, width, consoleErrors, pageErrors, failed, httpErrors,
 *                 external, blocked, ms, lab? }] }
 * lab = { ok, why } for next/lab pages that publish window.labReport.
 *
 * Every context blocks clarity.ms, bing.com, workers.dev and formspree.io, so no
 * analytics or form post ever leaves the machine. Attempts are still counted.
 */
"use strict";

const PW = process.env.PLAYWRIGHT || "/opt/node22/lib/node_modules/playwright";
const BLOCKED = /(^|\.)(clarity\.ms|bing\.com|workers\.dev|formspree\.io)$/i;
const HEIGHTS = { 390: 844, 860: 1180, 1440: 900, 1920: 1080 };

function args(argv) {
  const o = { widths: "390,1440", pages: "index.html", concurrency: "4", settle: "800", shots: "" };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error("unknown argument " + argv[i]);
    if (m[1] === "help") { o.help = true; continue; }
    o[m[1]] = m[2] !== undefined ? m[2] : argv[++i];
  }
  return o;
}

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function load(browser, base, page, width, opts) {
  const origin = new URL(base).origin;
  const r = { page, width, consoleErrors: [], pageErrors: [], failed: [], httpErrors: [], external: {}, blocked: {}, ms: 0 };
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHTS[width] || 900 }, serviceWorkers: "block" });
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url());
    if (BLOCKED.test(u.hostname)) { r.blocked[u.hostname] = (r.blocked[u.hostname] || 0) + 1; return route.abort("blockedbyclient"); }
    if (route.request().method() === "POST" && u.origin !== origin) return route.abort("blockedbyclient");
    return route.continue();
  });
  const p = await ctx.newPage();
  const blockedUrl = u => { try { return BLOCKED.test(new URL(u).hostname); } catch (e) { return false; } };
  p.on("console", m => {
    if (m.type() !== "error") return;
    const loc = m.location() || {};
    if (blockedUrl(loc.url || "") || /ERR_BLOCKED_BY_CLIENT/.test(m.text())) return;
    r.consoleErrors.push(m.text().slice(0, 300) + (loc.url ? "  @ " + loc.url.replace(origin, "") + ":" + (loc.lineNumber + 1) : ""));
  });
  p.on("pageerror", e => r.pageErrors.push(String(e && e.stack || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)));
  // a frame that is gone (removed iframe) can make req.frame() throw: that is a subframe too
  const subframe = req => { try { return req.frame() !== p.mainFrame(); } catch (e) { return true; } };
  p.on("requestfailed", req => {
    const u = req.url();
    if (blockedUrl(u)) return;
    const err = (req.failure() || {}).errorText || "failed";
    // media elements cancel range requests by design when they switch source or pause
    if (/ERR_ABORTED/.test(err) && ["media", "other"].includes(req.resourceType())) return;
    // ERR_ABORTED is a cancel, never a missing file (that is an HTTP 404, still caught below). In a
    // subframe it happens by design: the lazy study iframe is removed on scroll-away
    // (js/home-websites.js) or pointed at another study, cancelling whatever it was still fetching
    if (/ERR_ABORTED/.test(err) && subframe(req)) return;
    r.failed.push({ url: u.replace(origin, ""), err, type: req.resourceType(), local: u.startsWith(origin) });
  });
  p.on("response", res => {
    const u = res.url();
    if (res.status() >= 400) r.httpErrors.push({ url: u.replace(origin, ""), status: res.status(), local: u.startsWith(origin) });
  });
  p.on("request", req => {
    const u = new URL(req.url());
    if (u.origin !== origin && !BLOCKED.test(u.hostname) && /^https?:$/.test(u.protocol)) r.external[u.hostname] = (r.external[u.hostname] || 0) + 1;
  });
  const t0 = Date.now();
  try {
    await p.goto(base + page, { waitUntil: "load", timeout: 30000 });
    await p.waitForTimeout(+opts.settle);
    // scroll through once so lazy media and scroll-driven code run
    await p.evaluate(async () => {
      const step = Math.max(400, innerHeight * 0.9);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise(res => setTimeout(res, 80));
      }
      scrollTo(0, 0);
    });
    await p.waitForTimeout(400);
    // showreel lab pages made from templates/actor/lab.html.tmpl publish window.labReport
    // when their interface checks finish; wait for it and record the verdict
    if (/(^|\/)lab\//.test(page) && await p.evaluate(() => /\blabReport\b/.test(document.documentElement.innerHTML))) {
      // poll: stop early when the page throws (the report will never come)
      const until = Date.now() + 90000;
      let ready = false;
      while (Date.now() < until && !(ready = await p.evaluate(() => !!window.labReport))) {
        if (r.pageErrors.length) break;
        await p.waitForTimeout(250);
      }
      r.lab = ready ? await p.evaluate(() => {
        const rep = window.labReport;
        const bad = (rep.checks || []).filter(c => !c.ok).map(c => c.name + (c.note ? " (" + c.note + ")" : ""));
        return { ok: !!rep.ok, why: bad.length ? bad.length + " failed: " + bad.join("; ").slice(0, 300) : (rep.errors || []).join("; ").slice(0, 300) };
      }) : { ok: false, why: r.pageErrors.length ? "the lab threw before its report (page error above)" : "window.labReport never appeared (90 s)" };
    }
    if (opts.shots) {
      const name = page.replace(/[^\w.-]+/g, "_") + "--" + width + ".png";
      await p.screenshot({ path: require("path").join(opts.shots, name) });
    }
  } catch (e) {
    r.pageErrors.push("load: " + String(e.message || e).split("\n")[0]);
  }
  r.ms = Date.now() - t0;
  await ctx.close();
  return r;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help || !o.base) {
    console.log("usage: node tools/checks/smoke.js --base URL --pages a.html,b/ [--widths 390,1440] [--shots DIR]");
    process.exit(o.help ? 0 : 2);
  }
  let chromium;
  try { ({ chromium } = require(PW)); } catch (e) {
    console.log(JSON.stringify({ error: "Playwright not found at " + PW + " (set PLAYWRIGHT=path)" }));
    process.exit(3);
  }
  if (o.shots) require("fs").mkdirSync(o.shots, { recursive: true });
  const browser = await chromium.launch();
  const jobs = [];
  for (const page of o.pages.split(",").filter(Boolean)) for (const w of o.widths.split(",")) jobs.push([page, +w]);
  const results = [];
  try {
    await pool(jobs, +o.concurrency, async ([page, w]) => {
      results.push(await load(browser, o.base, page, w, o));
      process.stderr.write(`[${results.length}/${jobs.length}] ${page} ${w}\n`);
    });
  } finally {
    await browser.close();
  }
  results.sort((a, b) => a.page.localeCompare(b.page) || a.width - b.width);
  console.log(JSON.stringify({ results }));
}

main().catch(e => { console.log(JSON.stringify({ error: String(e.stack || e) })); process.exit(2); });
