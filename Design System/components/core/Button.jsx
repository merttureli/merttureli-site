import React from "react";

const PAD = { sm: "10px 18px", md: "14px 26px", lg: "18px 34px" };
const FS = { sm: 10, md: 12, lg: 12 };

export function Button({ children, variant = "solid", size = "md", href, disabled = false, trailing, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const base = {
    fontFamily: "var(--font-mono)", fontSize: FS[size], letterSpacing: "var(--ls-caps)",
    textTransform: "uppercase", lineHeight: 1, display: "inline-flex", alignItems: "center",
    gap: "var(--space-3)", padding: variant === "link" ? "0 0 6px" : PAD[size],
    borderRadius: variant === "link" ? 0 : "var(--radius-pill)", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.32 : 1, textDecoration: "none", whiteSpace: "nowrap",
    transition: "background var(--t-hover), color var(--t-hover), border-color var(--t-hover), opacity var(--t-hover)",
  };
  const skins = {
    solid: { background: hover && !disabled ? "var(--ink-700)" : "var(--ink-900)", color: "var(--paper)", border: "1px solid transparent" },
    outline: { background: hover && !disabled ? "var(--ink-900)" : "transparent", color: hover && !disabled ? "var(--paper)" : "var(--text-display)", border: "1px solid var(--line-strong)" },
    ghost: { background: hover && !disabled ? "var(--ink-a06)" : "transparent", color: "var(--text-display)", border: "1px solid transparent" },
    glass: { background: hover && !disabled ? "var(--paper-a18)" : "var(--paper-a08)", color: "var(--paper)", border: "1px solid var(--paper-a45)", backdropFilter: "var(--blur-glass)" },
    link: { background: "transparent", color: "var(--text-display)", border: "none", borderBottom: "1px solid " + (hover && !disabled ? "var(--line-strong)" : "var(--line-hairline)") },
  };
  const Tag = href ? "a" : "button";
  return (
    <Tag
      {...rest}
      href={href}
      disabled={Tag === "button" ? disabled : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...skins[variant], ...style }}
    >
      {children}
      {trailing && <span style={{ display: "inline-flex", transform: hover ? "translateX(3px)" : "none", transition: "transform var(--t-hover)" }}>{trailing}</span>}
    </Tag>
  );
}
