window.ProjectScreen = function ProjectScreen({ onNavigate, onOpen, item }) {
  const { SiteHeader, DisplayHeading, Rule, Meta, SpecList, PullQuote, Button, Caption } = window.DS;
  const p = window.SITE.project;
  const title = (item && item.title) || p.title;
  const discipline = (item && item.discipline) || p.discipline;
  const year = (item && item.year) || p.year;
  const plate = (item && item.plate) || "linear-gradient(150deg,#1b1e22,#c2c5c8)";
  const next = window.SITE.work.find((w) => w.title !== title);
  return (
    <div>
      <section style={{ position: "relative", height: "min(620px, 78vh)", overflow: "hidden" }}>
        <window.Plate gradient={plate} scrim="var(--scrim-hero)" />
        <div className="on-dark" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
          <SiteHeader items={window.SITE.nav} active="work" inverse floating onNavigate={onNavigate} />
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", padding: "var(--header-h) var(--page-margin) var(--space-8)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", animation: "up var(--dur-4) var(--ease-out) both" }}>
              <Meta wide style={{ color: "var(--paper-a70)" }}>{discipline} / {year}</Meta>
              <DisplayHeading level={2} as="h1" treatment="inverse">{title}</DisplayHeading>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "var(--space-9) var(--page-margin)", display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: "var(--space-10)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <p style={{ fontSize: "var(--fs-title-3)", lineHeight: 1.4, color: "var(--text-display)", maxWidth: "var(--measure)" }}>{p.lead}</p>
          {p.body.map((t, i) => <p key={i} style={{ fontSize: "var(--fs-body)", lineHeight: "var(--lh-body)", color: "var(--text-body)", maxWidth: "var(--measure)" }}>{t}</p>)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <Rule label="Specification" />
          <SpecList items={p.specs} />
        </div>
      </section>

      <section style={{ padding: "0 var(--page-margin) var(--space-9)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: "var(--radius-md)", overflow: "hidden" }}><window.Plate gradient="linear-gradient(140deg,#2a2d33,#b7babe)" /></div>
          <Caption index="01">Iteration five, quarter scale</Caption>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: "var(--radius-md)", overflow: "hidden" }}><window.Plate gradient="linear-gradient(140deg,#14171a,#9ca1a6)" /></div>
          <Caption index="02">Load frame, 3.8 g limit</Caption>
        </div>
      </section>

      <section className="on-dark" style={{ background: "var(--ink-900)", padding: "var(--space-9) var(--page-margin)", position: "relative", overflow: "hidden" }}>
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "var(--grain-url)", backgroundSize: "220px", mixBlendMode: "overlay", opacity: 0.22 }} />
        <div style={{ position: "relative" }}>
          <PullQuote inverse attribution="Design notes / March 2025">The optimiser is not designing the part. It is showing you where the forces already go.</PullQuote>
        </div>
      </section>

      <section style={{ padding: "var(--space-9) var(--page-margin) var(--space-10)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <Rule label="Next" right={next ? next.index : "02"} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-8)" }}>
          <DisplayHeading level={3} style={{ cursor: "pointer" }} onClick={() => next && onOpen(next)}>{next ? next.title : "Next project"}</DisplayHeading>
          <Button variant="outline" trailing="→" onClick={() => next && onOpen(next)}>Open</Button>
        </div>
      </section>
    </div>
  );
};
