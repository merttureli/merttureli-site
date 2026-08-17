import React from "react";
import { Grain } from "./Grain.jsx";

export function MediaFrame({ src, alt = "", ratio = "3 / 2", radius = "var(--radius-md)", fit = "cover", scrim = "none", grain = true, hoverZoom = false, index, caption, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const scrims = {
    none: null,
    hero: "var(--scrim-hero)",
    bottom: "var(--scrim-bottom-up)",
    flat: "rgba(10,10,10,.28)",
  };
  return (
    <figure {...rest} style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)", ...style }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ position: "relative", aspectRatio: ratio, overflow: "hidden", borderRadius: radius, background: "var(--surface-sunken)" }}
      >
        {src ? (
          <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: fit, transform: hoverZoom && hover ? "scale(1.04)" : "scale(1)", transition: "transform var(--t-media)" }} />
        ) : (
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "linear-gradient(150deg, var(--ink-100) 0%, var(--ink-050) 46%, var(--ink-200) 100%)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta-sm)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)" }}>{alt || "Image"}</span>
          </span>
        )}
        {scrims[scrim] && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: scrims[scrim] }} />}
        {grain && <Grain blend={src ? "overlay" : "multiply"} />}
        {children && <div style={{ position: "absolute", inset: 0 }}>{children}</div>}
      </div>
      {(caption || index != null) && (
        <figcaption style={{ display: "flex", gap: "var(--space-4)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)" }}>
          {index != null && <span style={{ color: "var(--text-display)" }}>{index}</span>}
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
