window.WorkScreen = function WorkScreen({ onNavigate, onOpen }) {
  const { SiteHeader, DisplayHeading, Rule, Meta } = window.DS;
  const [hover, setHover] = React.useState(null);
  const rows = window.SITE.work;
  return (
    <div>
      <SiteHeader items={window.SITE.nav} active="work" onNavigate={onNavigate} />
      <section style={{ padding: "var(--space-10) var(--page-margin) var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <Meta wide tone="strong">Index / 2023 — 2025</Meta>
        <DisplayHeading level={2} as="h1">Work</DisplayHeading>
        <p style={{ maxWidth: "var(--measure-narrow)", fontSize: "var(--fs-body-lg)", lineHeight: "var(--lh-body)", color: "var(--text-muted)" }}>Everything in one list, in the order it was made. Discipline is a note, not a filter.</p>
      </section>
      <section style={{ padding: "0 var(--page-margin) var(--space-9)", position: "relative" }}>
        <Rule label="Project" right="Year" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((w) => (
            <a key={w.id} href="#" onClick={(e) => { e.preventDefault(); onOpen(w); }}
              onMouseEnter={() => setHover(w.id)} onMouseLeave={() => setHover(null)}
              style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) 200px 96px", alignItems: "center", gap: "var(--space-5)",
                padding: "var(--space-6) 0", borderBottom: "1px solid var(--line-hairline)", textDecoration: "none", border: "none",
                borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--line-hairline)",
                opacity: hover && hover !== w.id ? 0.42 : 1, transition: "opacity var(--t-hover)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", color: "var(--text-meta)" }}>{w.index}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 500, letterSpacing: "var(--ls-title)", textTransform: "uppercase", color: "var(--text-display)",
                transform: hover === w.id ? "translateX(10px)" : "none", transition: "transform var(--dur-3) var(--ease-out)" }}>{w.title}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{w.discipline}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", color: "var(--text-meta)", textAlign: "right" }}>{w.year}</span>
            </a>
          ))}
        </div>
        <div style={{ position: "fixed", right: "var(--page-margin)", top: "50%", width: 260, height: 325, pointerEvents: "none",
          opacity: hover ? 1 : 0, transform: hover ? "translateY(-50%)" : "translateY(-46%)",
          transition: "opacity var(--dur-3) var(--ease-out), transform var(--dur-3) var(--ease-out)", zIndex: "var(--z-rail)" }}>
          {rows.map((w) => (
            <div key={w.id} style={{ position: "absolute", inset: 0, opacity: hover === w.id ? 1 : 0, transition: "opacity var(--dur-3) var(--ease-out)" }}>
              <window.Plate gradient={w.plate} radius="var(--radius-md)" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
