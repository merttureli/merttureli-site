import React from "react";

const CDN = "https://unpkg.com/lucide-static@0.544.0/icons/";

export function Icon({ name, size = 18, inverse = false, opacity = 1, style, ...rest }) {
  return (
    <img
      src={CDN + name + ".svg"}
      alt=""
      aria-hidden="true"
      draggable={false}
      {...rest}
      style={{ width: size, height: size, display: "block", opacity, filter: inverse ? "invert(1)" : "none", ...style }}
    />
  );
}
