The image container — ratio box with grain, optional scrim, and a mono caption line. Without `src` it renders the grey placeholder field, which is the correct state until real photography exists.

```jsx
<MediaFrame src="/photo.jpg" ratio="3 / 2" index="04" caption="Kraflá / 2025" hoverZoom />
<MediaFrame ratio="16 / 9" alt="Hero plate" scrim="hero" />
```

Radius defaults to 8px; use `var(--radius-xl)` for the big LUX-style panel treatment and `0` for full-bleed.
