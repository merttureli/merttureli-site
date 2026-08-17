import React from "react";
import { Icon } from "../core/Icon.jsx";

export function ScrollCue({ label, inverse = false, shape = "square", onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      aria-label={label || "Scroll down"}
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "var(--space-2)", width: shape === "square" ? 72 : "auto", height: shape === "square" ? 72 : "auto",
        padding: shape === "square" ? 0 : "var(--space-3) 0", cursor: "pointer",
        background: shape === "square" ? (inverse ? "var(--paper-a08)" : "var(--paper)") : "transparent",
        border: shape === "square" ? "1px solid " + (inverse ? "var(--paper-a45)" : "var(--line-hairline)") : "none",
        borderRadius: 0, backdropFilter: inverse ? "var(--blur-glass)" : undefined,
        transition: "background var(--t-hover)",
      }}
    >
      <span style={{ transform: hover ? "translateY(3px)" : "none", transition: "transform var(--dur-3) var(--ease-out)" }}>
        <Icon name="arrow-down" size={18} inverse={inverse} />
      </span>
      {label && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta-sm)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: inverse ? "var(--paper-a70)" : "var(--text-meta)" }}>{label}</span>
      )}
    </button>
  );
}
