/**
 * Microsoft Clarity loader.
 *
 * Session replay and heatmaps. This is the layer that answers "did they read
 * the Robo-Catcher case study or bounce at the fold", which no amount of
 * pageview counting will tell you.
 *
 * Stays completely inert until a project id is set in analytics-config.js. It
 * also stays inert off the live domain, on a device marked as the owner's own
 * (mt_self, set by track.js via ?self=1), and when the browser sends Global
 * Privacy Control or Do Not Track.
 */
(function (cfg) {
  var id = cfg && cfg.clarity;
  if (!id) return;

  var HOSTS = ["merttureli.com", "www.merttureli.com"];
  if (HOSTS.indexOf(location.hostname) === -1) return;

  if (
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1" ||
    navigator.msDoNotTrack === "1"
  ) return;

  // The owner's own devices never load the replay, so recordings are visitors
  // only. A ?self flag in the address counts too, in case this runs before
  // track.js has stored it.
  try {
    var qs = new URLSearchParams(location.search).get("self");
    if (qs === "1" || (qs !== "0" && localStorage.getItem("mt_self") === "1")) return;
  } catch (e) { /* storage blocked: treat as a visitor */ }

  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", id);

  // Tag the replay with the application code so a recording can be traced back
  // to the company it came from without hunting through timestamps.
  try {
    var code = new URLSearchParams(location.search).get("r") || localStorage.getItem("mt_ref");
    if (code) window.clarity("set", "application", code);
  } catch (e) { /* no-op */ }
})(window.MT_ANALYTICS);
