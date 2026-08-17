The site header — wordmark left, caps nav right, menu glyph last. 88px tall with a hairline; `floating inverse` when it sits over a photographic hero.

```jsx
<SiteHeader
  items={[{ id: "work", label: "Work" }, { id: "about", label: "About" }, { id: "contact", label: "Contact" }]}
  active="work" floating inverse onNavigate={setPage}
/>
```
