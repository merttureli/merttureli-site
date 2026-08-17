import React from "react";

const SIZES = { 1: "var(--fs-display-1)", 2: "var(--fs-display-2)", 3: "var(--fs-display-3)", 4: "var(--fs-title-1)" };

export function DisplayHeading({ children, level = 2, as = "h2", treatment = "solid", weight = 500, caps = true, style, ...rest }) {
  const Tag = as;
  const outline = treatment === "outline";
  return (
    <Tag
      {...rest}
      style={{
        fontFamily: "var(--font-display)", fontSize: SIZES[level], fontWeight: weight,
        lineHeight: "var(--lh-display)", letterSpacing: "var(--ls-display)",
        textTransform: caps ? "uppercase" : "none", margin: 0,
        color: outline ? "transparent" : treatment === "inverse" ? "var(--paper)" : "var(--text-display)",
        WebkitTextStroke: outline ? "1px currentColor" : undefined,
        WebkitTextFillColor: outline ? "transparent" : undefined,
        textWrap: "balance", ...style,
      }}
    >{children}</Tag>
  );
}
