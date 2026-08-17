import React from "react";
import { MediaFrame } from "../media/MediaFrame.jsx";

export function WorkCard({ index, title, discipline, year, src, alt, ratio = "4 / 5", href, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      href={href || "#"}
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", textDecoration: "none", border: "none", ...style }}
    >
      <MediaFrame src={src} alt={alt || title} ratio={ratio} hoverZoom radius="var(--radius-md)" />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)" }}>
          <span style={{ color: "var(--text-display)" }}>{index}</span>
          <span>{discipline}</span>
        </div>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fs-title-3)", fontWeight: 500, letterSpacing: "var(--ls-title)", lineHeight: 1.14, textTransform: "uppercase", color: "var(--text-display)", display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
          {title}
          <span style={{ display: "inline-block", transform: hover ? "translateX(4px)" : "none", transition: "transform var(--t-hover)", fontSize: "0.7em", color: "var(--text-muted)" }}>→</span>
        </h3>
        {year && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", color: "var(--text-meta)" }}>{year}</span>}
      </div>
    </a>
  );
}
