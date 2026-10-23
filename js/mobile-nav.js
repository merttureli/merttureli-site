/**
 * Mobile menu.
 *
 * The exported markup already contained a hamburger button, aria-label="Menu",
 * sitting off the right edge of a phone screen with no handler attached to it.
 * This wires it to a full-screen overlay built from the header's own links, so
 * every header link stays reachable on a phone instead of being hidden by
 * css/mobile.css with nowhere else to go. The overlay also offers Email,
 * which the header does not carry.
 *
 * The overlay is a modal dialog: opening it moves focus inside, Tab is trapped,
 * Escape closes it, the page behind is inert, and focus returns to the trigger
 * on close. While closed it is hidden and inert, so it leaves no invisible tab
 * stops.
 *
 * Everything is a no-op above 860px (css/mobile.css also hides the button
 * there), and the overlay is only built once the design-system runtime has
 * rendered the header.
 */
(function () {
  "use strict";

  var MOBILE = "(max-width: 860px)";
  var HEADER_OFFSET = 64;
  var FADE_MS = 240;

  var MENU_BTN = 'header button[aria-label="Menu"]';
  var NAV_LINKS = "header nav > a";
  var FOCUSABLE = 'a[href], button:not([disabled])';

  // Resolved against this script's own URL so the same code works from the site
  // root ("js/mobile-nav.js") and from projects/ ("../js/mobile-nav.js").
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;
  function siteUrl(path) {
    try { return new URL("../" + path, SCRIPT_SRC || location.href).href; }
    catch (err) { return path; }
  }
  var EXTRA_LINKS = [
    { href: "mailto:merttureli0@gmail.com", text: "Email" },
  ];

  var menu = null;
  var closeBtn = null;
  var linkBox = null;
  var builtSig = "";
  var trigger = null;
  var hideTimer = 0;
  var inerted = [];
  var scheduled = false;

  function isOpen() { return !!menu && menu.classList.contains("on"); }

  // Two URLs are the same page when origin and path match, treating "/" and
  // "/index.html" as one document (GitHub Pages serves the first for the second).
  function pagePath(u) { return u.pathname.replace(/index\.html$/, ""); }
  function samePage(url) {
    return url.origin === location.origin && pagePath(url) === pagePath(location);
  }

  function headerLinks() {
    return [].slice.call(document.querySelectorAll(NAV_LINKS))
      .map(function (a) { return { href: a.href, text: a.textContent.trim() }; })
      .filter(function (l) { return l.href && l.text; });
  }

  function makeLink(l) {
    var a = document.createElement("a");
    a.href = l.href;
    a.textContent = l.text;
    return a;
  }

  function fill(links) {
    linkBox.textContent = "";
    links.forEach(function (l) { linkBox.appendChild(makeLink(l)); });
    var extra = document.createElement("div");
    extra.className = "mt-menu-extra";
    EXTRA_LINKS.forEach(function (l) { extra.appendChild(makeLink(l)); });
    linkBox.appendChild(extra);
  }

  function create() {
    menu = document.createElement("div");
    menu.id = "mt-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", "Menu");
    menu.hidden = true;
    menu.inert = true;

    closeBtn = document.createElement("button");
    closeBtn.id = "mt-menu-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close menu");
    closeBtn.innerHTML = "&times;";
    menu.appendChild(closeBtn);

    linkBox = document.createElement("nav");
    linkBox.setAttribute("aria-label", "Menu");
    menu.appendChild(linkBox);

    document.body.appendChild(menu);
    menu.addEventListener("click", onMenuClick);
  }

  // The runtime re-renders the header and drops attributes this script set on
  // the button, so they are re-applied on every sync.
  function syncButton() {
    var b = document.querySelector(MENU_BTN);
    if (!b) return;
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-controls", "mt-menu");
    b.setAttribute("aria-expanded", isOpen() ? "true" : "false");
  }

  // Builds the overlay once the header has links, and rebuilds its list if the
  // header's links change (any number of them). Idempotent and cheap, so it can
  // run on every DOM mutation.
  function sync() {
    scheduled = false;
    var links = headerLinks();
    if (links.length) {
      if (!menu) create();
      var sig = JSON.stringify(links);
      if (sig !== builtSig) {
        builtSig = sig;
        // Never swap the list out from under focus inside an open menu.
        var hadFocus = isOpen() && menu.contains(document.activeElement) && document.activeElement !== closeBtn;
        fill(links);
        if (hadFocus) closeBtn.focus();
      }
    }
    syncButton();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function setPageInert(on) {
    if (on) {
      inerted = [].slice.call(document.body.children).filter(function (el) {
        return el !== menu && !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName) && !el.inert;
      });
      inerted.forEach(function (el) { el.inert = true; });
    } else {
      inerted.forEach(function (el) { el.inert = false; });
      inerted = [];
    }
  }

  function open(on, returnFocus) {
    if (!menu || on === isOpen()) return;
    clearTimeout(hideTimer);
    if (on) {
      menu.hidden = false;
      menu.inert = false;
      setPageInert(true);
      void menu.offsetWidth; // commit display before .on so the fade plays
      menu.classList.add("on");
      document.body.classList.add("mt-lock");
      syncButton();
      closeBtn.focus();
    } else {
      menu.classList.remove("on");
      menu.inert = true;
      document.body.classList.remove("mt-lock");
      setPageInert(false);
      syncButton();
      if (returnFocus !== false) {
        var b = trigger && trigger.isConnected ? trigger : document.querySelector(MENU_BTN);
        if (b && b.offsetParent !== null) b.focus();
      }
      // Hidden only after the fade, so the transition still has something to animate.
      hideTimer = setTimeout(function () { if (!isOpen()) menu.hidden = true; }, FADE_MS);
    }
  }

  function scrollToHash(hash) {
    var id = decodeURIComponent(hash.slice(1));
    var target = id ? document.getElementById(id) : null;
    if (id && !target) return;
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: target ? target.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET : 0,
      behavior: reduce ? "auto" : "smooth",
    });
    if (history.replaceState) history.replaceState(null, "", hash);
  }

  function onMenuClick(e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (a && menu.contains(a)) {
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { url = null; }
      if (url && samePage(url) && url.hash) {
        // Close first: the body is scroll-locked while the overlay is up, so a
        // plain anchor jump would land nowhere. Scrolling on the next frame,
        // after the lock is off, is what makes the link actually work.
        e.preventDefault();
        open(false);
        requestAnimationFrame(function () { scrollToHash(url.hash); });
      } else {
        // Another page, a mailto: or the PDF: let the browser follow the link.
        // The menu still closes so the scroll lock cannot outlive it if the
        // visitor comes back through the bfcache.
        open(false, false);
      }
      return;
    }
    if (e.target === menu || e.target === closeBtn || (closeBtn && closeBtn.contains(e.target))) open(false);
  }

  function onKeydown(e) {
    if (!isOpen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      open(false);
      return;
    }
    if (e.key !== "Tab") return;
    var items = [].slice.call(menu.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var cur = document.activeElement;
    if (!menu.contains(cur)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && cur === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function start() {
    sync();
    // Delegated rather than bound to the button node. The design-system runtime
    // re-renders the header after this script first runs, which replaces the
    // button and silently drops any listener attached directly to it. Listening
    // on the document survives every re-render.
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var hit = e.target.closest(MENU_BTN);
      if (!hit) return;
      // The button is hidden at desktop widths, where the links are visible in
      // the header; this guards a stale click while crossing the breakpoint.
      if (!matchMedia(MOBILE).matches) return;
      e.preventDefault();
      if (!menu) sync();
      if (!menu) return;
      if (isOpen()) open(false);
      else { trigger = hit; open(true); }
    });
    document.addEventListener("keydown", onKeydown);

    // Rotating the phone to landscape can cross the breakpoint, which would
    // leave the overlay up with no button to dismiss it.
    addEventListener("resize", function () {
      if (!matchMedia(MOBILE).matches) open(false, false);
    });

    // Coming back through the bfcache after following a menu link: make sure the
    // closed overlay is really hidden and the page is not left inert or locked.
    addEventListener("pageshow", function () {
      if (menu && !isOpen()) {
        menu.hidden = true;
        document.body.classList.remove("mt-lock");
      }
    });

    // The header is rendered by the design-system bundle, so it can appear, and
    // be replaced, at any time. Observe for the life of the page rather than
    // polling against a deadline.
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
