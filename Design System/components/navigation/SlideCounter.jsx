import React from "react";
import { Icon } from "../core/Icon.jsx";

export function SlideCounter({ current = 1, total = 3, inverse = false, variant = "fraction", onPrev, onNext, onSelect, style, ...rest }) {
  const pad = (n) => String(n).padStart(2, "0");
  const dim = inverse ? "var(--paper-a45)" : "var(--text-meta)";
  const on = inverse ? "var(--paper)" : "var(--text-display)";
  const arrow = (name, fn) => (
    <button onClick={fn} aria-label={name} style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", display: "grid", placeItems: "center", opacity: 0.75, transition: "opacity var(--t-hover)" }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)} onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.75)}>
      <Icon name={name} size={16} inverse={inverse} />
    </button>
  );
  return (
    <div {...rest} style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", ...style }}>
      {variant !== "dots" && onPrev && arrow("chevron-left", onPrev)}
      {variant === "dots" ? (
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          {Array.from({ length: total }, (_, i) => (
            <button key={i} onClick={() => onSelect && onSelect(i + 1)} aria-label={"Slide " + (i + 1)}
              style={{ width: 7, height: 7, padding: 0, borderRadius: "var(--radius-pill)", cursor: "pointer",
                border: "1px solid " + (inverse ? "var(--paper)" : "var(--ink-900)"),
                background: i + 1 === current ? (inverse ? "var(--paper)" : "var(--ink-900)") : "transparent",
                transition: "background var(--t-hover)" }} />
          ))}
        </div>
      ) : variant === "steps" ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
          {Array.from({ length: total }, (_, i) => (
            <button key={i} onClick={() => onSelect && onSelect(i + 1)}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", letterSpacing: "var(--ls-caps)",
                fontSize: i + 1 === current ? 16 : 10, color: i + 1 === current ? on : dim, transition: "color var(--t-hover)" }}>
              {pad(i + 1)}
            </button>
          ))}
        </div>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--space-2)" }}>
          <span style={{ fontSize: 22, color: on, letterSpacing: "0.04em" }}>{pad(current)}</span>
          <span style={{ color: dim }}>/</span>
          <span style={{ color: dim }}>{pad(total)}</span>
        </span>
      )}
      {variant !== "dots" && onNext && arrow("chevron-right", onNext)}
    </div>
  );
}
