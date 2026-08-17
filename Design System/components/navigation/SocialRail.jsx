import React from "react";
import { Icon } from "../core/Icon.jsx";

export function SocialRail({ items = [], inverse = false, position = "right", fixed = false, style, ...rest }) {
  return (
    <div
      {...rest}
      style={{
        position: fixed ? "absolute" : "relative", zIndex: "var(--z-rail)",
        top: fixed ? "50%" : undefined, transform: fixed ? "translateY(-50%)" : undefined,
        right: fixed && position === "right" ? "var(--space-5)" : undefined,
        left: fixed && position === "left" ? "var(--space-5)" : undefined,
        display: "flex", flexDirection: "column", gap: "var(--space-3)", ...style,
      }}
    >
      {items.map((it) => (
        <a
          key={it.name}
          href={it.href || "#"}
          aria-label={it.name}
          style={{
            width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: "var(--radius-pill)",
            border: "1px solid " + (inverse ? "var(--paper-a18)" : "var(--line-hairline)"),
            background: inverse ? "var(--paper-a08)" : "var(--paper)",
            backdropFilter: inverse ? "var(--blur-glass)" : undefined,
            transition: "background var(--t-hover), border-color var(--t-hover)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = inverse ? "var(--paper-a18)" : "var(--ink-050)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = inverse ? "var(--paper-a08)" : "var(--paper)"; }}
        >
          <Icon name={it.icon} size={15} inverse={inverse} />
        </a>
      ))}
    </div>
  );
}
