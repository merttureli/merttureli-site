window.AboutScreen = function AboutScreen({ onNavigate, contact }) {
  const { SiteHeader, DisplayHeading, Rule, Meta, SpecList, Button, Caption } = window.DS;
  const a = window.SITE.about;
  return (
    <div>
      <SiteHeader items={window.SITE.nav} active={contact ? "contact" : "about"} onNavigate={onNavigate} />
      <section style={{ padding: "var(--space-10) var(--page-margin) var(--space-8)", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "var(--space-10)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <Meta wide tone="strong">{contact ? "Contact" : "About"}</Meta>
          <DisplayHeading level={2} as="h1">{contact ? "Get in touch" : "Mert Türeli"}</DisplayHeading>
          <p style={{ fontSize: "var(--fs-title-3)", lineHeight: 1.4, color: "var(--text-display)", maxWidth: "var(--measure)" }}>{a.lead}</p>
          {a.body.map((t, i) => <p key={i} style={{ fontSize: "var(--fs-body)", lineHeight: "var(--lh-body)", color: "var(--text-body)", maxWidth: "var(--measure)" }}>{t}</p>)}
          <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
            <Button variant="solid" trailing="→" href="mailto:hello@merttureli.com">hello@merttureli.com</Button>
            <Button variant="outline">Download CV</Button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <window.Plate gradient="linear-gradient(150deg,#23262b,#cdd0d3)" />
          </div>
          <Caption index="00">Portrait / 2025</Caption>
        </div>
      </section>
      <section style={{ padding: "0 var(--page-margin) var(--space-10)", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "var(--space-10)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <Rule label="Facts" right="05" />
          <SpecList items={a.specs} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <Rule label="Elsewhere" />
          <SpecList dense items={[{ label: "Instagram", value: "@merttureli" }, { label: "LinkedIn", value: "/in/merttureli" }, { label: "Email", value: "hello@merttureli.com" }]} columns="minmax(64px,110px) 1fr" />
        </div>
      </section>
    </div>
  );
};
