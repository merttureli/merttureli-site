import React from "react";

export function SpecList({ items = [], columns, dense = false, style, ...rest }) {
  const cell = { fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", lineHeight: "var(--lh-meta)" };
  return (
    <dl {...rest} style={{ margin: 0, display: "flex", flexDirection: "column", gap: dense ? "var(--space-2)" : "var(--space-3)", ...style }}>
      {items.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: columns || "minmax(64px, 120px) 1fr auto", gap: "var(--space-5)", alignItems: "baseline", paddingBottom: dense ? 0 : "var(--space-3)", borderBottom: dense ? "none" : "1px solid var(--line-hairline)" }}>
          <dt style={{ ...cell, color: "var(--text-meta)" }}>{row.label}</dt>
          <dd style={{ ...cell, color: "var(--text-display)", margin: 0 }}>{row.value}</dd>
          {row.aside != null && <dd style={{ ...cell, color: "var(--text-muted)", margin: 0, textAlign: "right" }}>{row.aside}</dd>}
        </div>
      ))}
    </dl>
  );
}
