Lucide glyph rendered as a flat CDN SVG. The system's whole icon vocabulary is about a dozen glyphs: `menu`, `x`, `search`, `arrow-down`, `arrow-up-right`, `chevron-left`, `chevron-right`, `plus`, `minus`.

```jsx
<Icon name="arrow-down" size={16} />
<Icon name="menu" size={20} inverse />   {/* over photography */}
```

Because it loads as an `<img>`, colour comes from `inverse` (invert filter), not `currentColor`. The system is monochrome, so that covers every case. Keep icons at 14–22px; they never carry meaning alone — pair with a caps label where the target isn't obvious.
