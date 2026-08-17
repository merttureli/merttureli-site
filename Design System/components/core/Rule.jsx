import React from "react";

export function Rule({ label, right, strong = false, spacing = "var(--space-5)", style, ...rest }) {
  const line = { flex: 1, height: 1, background: strong ? "var(--line-strong)" : "var(--line-hairline)" };
  return (
    <div {...rest} style={{ display: "flex", alignItems: "center", gap: spacing, width: "100%", ...style }}>
      {label && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)", whiteSpace: "nowrap" }}>{label}</span>
      )}
      <span style={line} />
      {right && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)", whiteSpace: "nowrap" }}>{right}</span>
      )}
    </div>
  );
}
