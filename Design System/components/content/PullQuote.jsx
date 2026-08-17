import React from "react";

export function PullQuote({ children, attribution, inverse = false, style, ...rest }) {
  return (
    <blockquote {...rest} style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-5)", maxWidth: "var(--measure)", ...style }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-title-1)", fontWeight: 300, lineHeight: 1.24, letterSpacing: "var(--ls-title)", color: inverse ? "var(--paper)" : "var(--text-display)", textWrap: "pretty" }}>{children}</p>
      {attribution && (
        <footer style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: inverse ? "var(--paper-a70)" : "var(--text-meta)" }}>{attribution}</footer>
      )}
    </blockquote>
  );
}
