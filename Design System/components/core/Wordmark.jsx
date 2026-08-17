import React from "react";

const SIZES = { sm: { fs: 12, ls: "0.32em" }, md: { fs: 16, ls: "0.32em" }, lg: { fs: 22, ls: "0.28em" }, xl: { fs: 34, ls: "0.24em" } };

export function Wordmark({ name = "MERT TÜRELI", size = "md", weight = 500, inverse = false, as = "span", style, ...rest }) {
  const s = SIZES[size] || SIZES.md;
  const Tag = as;
  return (
    <Tag
      {...rest}
      style={{
        fontFamily: "var(--font-display)", fontSize: s.fs, fontWeight: weight,
        letterSpacing: s.ls, lineHeight: 1, textTransform: "uppercase",
        color: inverse ? "var(--paper)" : "var(--text-display)",
        display: "inline-block", whiteSpace: "nowrap", ...style,
      }}
    >{name}</Tag>
  );
}
