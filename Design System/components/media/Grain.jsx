import React from "react";

export function Grain({ strength = "normal", blend = "multiply", style, ...rest }) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "var(--grain-url)", backgroundSize: "220px 220px",
        mixBlendMode: blend,
        opacity: strength === "strong" ? "var(--grain-opacity-strong)" : strength === "subtle" ? 0.14 : "var(--grain-opacity)",
        ...style,
      }}
    />
  );
}
