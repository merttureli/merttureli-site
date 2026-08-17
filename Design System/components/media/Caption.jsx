import React from "react";

export function Caption({ children, index, align = "left", style, ...rest }) {
  return (
    <p {...rest} style={{ display: "flex", gap: "var(--space-4)", justifyContent: align === "right" ? "flex-end" : "flex-start", fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", lineHeight: "var(--lh-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)", ...style }}>
      {index != null && <span style={{ color: "var(--text-display)" }}>{index}</span>}
      <span>{children}</span>
    </p>
  );
}
