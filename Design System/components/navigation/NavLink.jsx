import React from "react";

export function NavLink({ children, href = "#", active = false, inverse = false, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const on = active || hover;
  return (
    <a
      href={href}
      onClick={onClick}
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", display: "inline-block", padding: "2px 0 6px",
        fontFamily: "var(--font-display)", fontSize: "var(--fs-meta)", fontWeight: 500,
        letterSpacing: "var(--ls-nav)", textTransform: "uppercase", textDecoration: "none", border: "none",
        color: inverse ? (on ? "var(--paper)" : "var(--paper-a70)") : (on ? "var(--text-display)" : "var(--text-muted)"),
        transition: "color var(--t-hover)", ...style,
      }}
    >
      {children}
      <span aria-hidden="true" style={{ position: "absolute", left: 0, bottom: 0, height: 1, width: on ? "100%" : "0%", background: inverse ? "var(--paper)" : "var(--line-strong)", transition: "width var(--dur-3) var(--ease-out)" }} />
    </a>
  );
}
