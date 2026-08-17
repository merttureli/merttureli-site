import React from "react";
import { Wordmark } from "../core/Wordmark.jsx";
import { NavLink } from "./NavLink.jsx";
import { Icon } from "../core/Icon.jsx";

export function SiteHeader({ items = [], active, inverse = false, floating = false, onMenu, onNavigate, right, style, ...rest }) {
  return (
    <header
      {...rest}
      style={{
        position: floating ? "absolute" : "relative", top: floating ? 0 : undefined, left: 0, right: 0,
        zIndex: "var(--z-header)", height: "var(--header-h)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-8)",
        padding: "0 var(--page-margin)",
        borderBottom: floating ? "none" : "1px solid " + (inverse ? "var(--line-inverse)" : "var(--line-hairline)"),
        ...style,
      }}
    >
      <Wordmark size="sm" inverse={inverse} as="a" href="#" style={{ textDecoration: "none", border: "none" }} />
      <nav style={{ display: "flex", alignItems: "center", gap: "var(--space-7)" }}>
        {items.map((it) => (
          <NavLink
            key={it.id || it.label}
            href={it.href || "#"}
            active={active === (it.id || it.label)}
            inverse={inverse}
            onClick={onNavigate ? (e) => { e.preventDefault(); onNavigate(it.id || it.label); } : undefined}
          >{it.label}</NavLink>
        ))}
        {right}
        <button
          onClick={onMenu}
          aria-label="Menu"
          style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "transparent", border: "none", cursor: "pointer", padding: 0, marginLeft: "var(--space-2)" }}
        >
          <Icon name="menu" size={20} inverse={inverse} />
        </button>
      </nav>
    </header>
  );
}
