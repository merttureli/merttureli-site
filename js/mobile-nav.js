/**
 * Mobile menu.
 *
 * The exported markup already contained a hamburger button, aria-label="Menu",
 * sitting off the right edge of a phone screen with no handler attached to it.
 * This wires it to a full-screen overlay built from the header's own links, so
 * the four section anchors stay reachable on a phone instead of being hidden by
 * css/mobile.css with nowhere else to go.
 *
 * Everything is a no-op above 860px, and the overlay is only built once the
 * design-system runtime has rendered the header.
 */
(function () {
  "use strict";

  var MOBILE = "(max-width: 860px)";
  var HEADER_OFFSET = 64;

  var MENU_BTN = 'header button[aria-label="Menu"]';

  function build() {
    var header = document.querySelector("header");
    var btn = document.querySelector(MENU_BTN);
    if (!header || !btn || document.getElementById("mt-menu")) return !!document.getElementById("mt-menu");

    var links = [].slice.call(document.querySelectorAll("header nav > a"))
      .map(function (a) { return { href: a.getAttribute("href"), text: a.textContent.trim() }; })
      .filter(function (l) { return l.href && l.href.charAt(0) === "#"; });
    if (!links.length) return false;

    var menu = document.createElement("div");
    menu.id = "mt-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", "Menu");
    menu.hidden = true;

    var close = document.createElement("button");
    close.id = "mt-menu-close";
    close.type = "button";
    close.setAttribute("aria-label", "Close menu");
    close.innerHTML = "&times;";
    menu.appendChild(close);

    links.forEach(function (l) {
      var a = document.createElement("a");
      a.href = l.href;
      a.textContent = l.text;
      menu.appendChild(a);
    });
    document.body.appendChild(menu);

    function open(on) {
      if (on) menu.hidden = false;
      menu.classList.toggle("on", on);
      document.body.classList.toggle("mt-lock", on);
      var b = document.querySelector(MENU_BTN);
      if (b) b.setAttribute("aria-expanded", on ? "true" : "false");
      // Kept out of the accessibility tree while closed, but only after the
      // fade has finished so the transition still has something to animate.
      if (!on) setTimeout(function () { if (!menu.classList.contains("on")) menu.hidden = true; }, 240);
    }

    // Delegated rather than bound to the button node. The design-system runtime
    // re-renders the header after this script first runs, which replaces the
    // button and silently drops any listener attached directly to it; that left
    // the hamburger dead exactly as it was before this file existed. Listening
    // on the document survives every re-render.
    btn.setAttribute("aria-expanded", "false");
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var hit = e.target.closest(MENU_BTN);
      if (!hit) return;
      // The same button is on screen at desktop widths, where the four links are
      // visible in the header and the overlay has no styling. Leaving it inert
      // there keeps desktop exactly as it was.
      if (!matchMedia(MOBILE).matches) return;
      e.preventDefault();
      open(!menu.classList.contains("on"));
    });

    menu.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (a && menu.contains(a)) {
        // Close first: the body is scroll-locked while the overlay is up, so a
        // plain anchor jump would land nowhere. Scrolling on the next frame,
        // after the lock is off, is what makes the link actually work.
        e.preventDefault();
        open(false);
        var target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        requestAnimationFrame(function () {
          var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET,
            behavior: reduce ? "auto" : "smooth",
          });
          if (history.replaceState) history.replaceState(null, "", a.getAttribute("href"));
        });
        return;
      }
      if (e.target === menu || e.target.id === "mt-menu-close") open(false);
    });

    addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("on")) open(false);
    });

    // Rotating the phone to landscape can cross the breakpoint, which would
    // leave the overlay up with no button to dismiss it.
    addEventListener("resize", function () {
      if (!matchMedia(MOBILE).matches) open(false);
    });
    return true;
  }

  // The header is rendered by the design-system bundle, so it is not
  // necessarily in the DOM at DOMContentLoaded. Retry briefly, then give up
  // rather than poll forever.
  function start() {
    if (build()) return;
    var tries = 0;
    var timer = setInterval(function () {
      if (build() || ++tries > 40) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
