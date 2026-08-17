window.HomeScreen = function HomeScreen({ onNavigate, onOpen }) {
  const { SiteHeader, DisplayHeading, Button, SlideCounter, ScrollCue, SocialRail, Meta, Rule, WorkCard, SpecList } = window.DS;
  const [slide, setSlide] = React.useState(0);
  const h = window.SITE.hero[slide];
  const go = (d) => setSlide((s) => (s + d + window.SITE.hero.length) % window.SITE.hero.length);

  return (
    <div>
      <section style={{ position: "relative", height: "min(880px, 100vh)", minHeight: 620, overflow: "hidden" }}>
        <window.Plate key={h.id} gradient={h.plate} scrim="var(--scrim-hero)" style={{ animation: "kb var(--dur-6) var(--ease-out) both" }} />
        <div className="on-dark" style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
          <SiteHeader items={window.SITE.nav} active="index" inverse floating onNavigate={onNavigate} />
          <SocialRail fixed inverse items={[{ name: "Instagram", icon: "instagram" }, { name: "LinkedIn", icon: "linkedin" }, { name: "Mail", icon: "mail" }]} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "var(--header-h) var(--page-margin) 0" }}>
            <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", maxWidth: 900, animation: "up var(--dur-4) var(--ease-out) both" }}>
              <Meta wide style={{ color: "var(--paper-a70)" }}>{h.meta}</Meta>
              <div>
                <DisplayHeading level={1} as="h1" treatment="inverse">{h.line1}</DisplayHeading>
                <DisplayHeading level={1} treatment="outline" style={{ color: "var(--paper)" }}>{h.line2}</DisplayHeading>
              </div>
              <p style={{ maxWidth: "var(--measure-narrow)", fontSize: "var(--fs-body-lg)", lineHeight: "var(--lh-body)", color: "var(--paper-a90)" }}>{h.lead}</p>
              <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
                <Button variant="glass" trailing="→" onClick={() => onNavigate("work")}>See the work</Button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 var(--page-margin) var(--space-7)" }}>
            <SlideCounter current={slide + 1} total={window.SITE.hero.length} inverse onPrev={() => go(-1)} onNext={() => go(1)} />
            <ScrollCue inverse onClick={() => window.scrollTo({ top: window.innerHeight * 0.92, behavior: "smooth" })} />
          </div>
        </div>
      </section>

      <section style={{ padding: "var(--section-y) var(--page-margin)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <Rule label="Statement" right="01" />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "var(--space-10)", alignItems: "start" }}>
          <window.Reveal>
            <DisplayHeading level={3}>Three disciplines, one habit of looking</DisplayHeading>
          </window.Reveal>
          <window.Reveal delay={120} style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <p style={{ fontSize: "var(--fs-body-lg)", lineHeight: "var(--lh-body)", color: "var(--text-body)", maxWidth: "var(--measure)" }}>{window.SITE.about.lead}</p>
            <SpecList dense items={window.SITE.about.specs.slice(0, 3)} />
          </window.Reveal>
        </div>
      </section>

      <section style={{ padding: "0 var(--page-margin) var(--section-y)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <Rule label="Selected work" right={String(window.SITE.work.length).padStart(3, "0")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-8) var(--space-6)" }}>
          {window.SITE.work.slice(0, 3).map((w, i) => (
            <window.Reveal key={w.id} delay={i * 90}>
              <PlateCard w={w} onOpen={onOpen} />
            </window.Reveal>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="link" trailing="→" onClick={() => onNavigate("work")}>All projects</Button>
        </div>
      </section>
    </div>
  );
};

window.PlateCard = function PlateCard({ w, onOpen, ratio }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onOpen(w); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", textDecoration: "none", border: "none" }}>
      <div style={{ position: "relative", aspectRatio: ratio || w.ratio, overflow: "hidden", borderRadius: "var(--radius-md)" }}>
        <window.Plate gradient={w.plate} style={{ transform: hover ? "scale(1.04)" : "scale(1)", transition: "transform var(--t-media)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-meta)" }}>
          <span style={{ color: "var(--text-display)" }}>{w.index}</span><span>{w.discipline}</span>
        </div>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fs-title-3)", fontWeight: 500, letterSpacing: "var(--ls-title)", textTransform: "uppercase", color: "var(--text-display)", display: "flex", gap: "var(--space-3)", alignItems: "baseline" }}>
          {w.title}<span style={{ fontSize: ".64em", color: "var(--text-muted)", transform: hover ? "translateX(4px)" : "none", transition: "transform var(--t-hover)", display: "inline-block" }}>→</span>
        </h3>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-meta)", letterSpacing: "var(--ls-caps)", color: "var(--text-meta)" }}>{w.year}</span>
      </div>
    </a>
  );
};
