import React from "react";

export function Meta({ children, index, tone = "meta", mono = true, wide = false, style, ...rest }) {
  const color = tone === "body" ? "var(--text-body)" : tone === "muted" ? "var(--text-muted)" : tone === "strong" ? "var(--text-display)" : "var(--text-meta)";
  return (
    <span
      {...rest}
      style={{
        fontFamily: mono ? "var(--font-mono)" : "var(--font-display)",
        fontSize: "var(--fs-meta)", fontWeight: 400, lineHeight: "var(--lh-meta)",
        letterSpacing: wide ? "var(--ls-caps-wide)" : "var(--ls-caps)",
        textTransform: "uppercase", color,
        display: "inline-flex", alignItems: "baseline", gap: "var(--space-3)", ...style,
      }}
    >
      {index != null && <span style={{ color: "var(--text-display)" }}>{index}</span>}
      {children}
    </span>
  );
}
