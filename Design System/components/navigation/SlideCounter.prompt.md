Position indicator for hero sliders and galleries — always zero-padded, always mono.

```jsx
<SlideCounter current={1} total={3} inverse onPrev={prev} onNext={next} />
<SlideCounter variant="steps" current={2} total={3} onSelect={go} />
<SlideCounter variant="dots" current={1} total={4} onSelect={go} />
```

`fraction` bottom-left of a hero, `steps` centred above a subject, `dots` under a gallery.
