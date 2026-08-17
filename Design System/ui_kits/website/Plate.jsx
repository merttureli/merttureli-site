// Photographic stand-in. Real photography drops in as <Plate src="../../assets/photography/x.jpg" />.
window.Plate = function Plate({ gradient, src, scrim, radius = 0, children, style }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, background: gradient || "var(--ink-200)", ...style }}>
      {src && <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {scrim && <span style={{ position: "absolute", inset: 0, background: scrim }} />}
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "var(--grain-url)", backgroundSize: "220px 220px", mixBlendMode: "overlay", opacity: "var(--grain-opacity)" }} />
      {children}
    </div>
  );
};

window.Reveal = function Reveal({ children, delay = 0, y = 22, style }) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{ opacity: on ? 1 : 0, transform: on ? "none" : `translateY(${y}px)`, transition: "opacity var(--dur-4) var(--ease-out), transform var(--dur-4) var(--ease-out)", ...style }}>{children}</div>
  );
};
