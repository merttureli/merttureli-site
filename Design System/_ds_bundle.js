/* @ds-bundle: {"format":4,"namespace":"MertTReliDesignSystem_56763c","components":[{"name":"DisplayHeading","sourcePath":"components/content/DisplayHeading.jsx"},{"name":"PullQuote","sourcePath":"components/content/PullQuote.jsx"},{"name":"SpecList","sourcePath":"components/content/SpecList.jsx"},{"name":"WorkCard","sourcePath":"components/content/WorkCard.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"Meta","sourcePath":"components/core/Meta.jsx"},{"name":"Rule","sourcePath":"components/core/Rule.jsx"},{"name":"Wordmark","sourcePath":"components/core/Wordmark.jsx"},{"name":"Caption","sourcePath":"components/media/Caption.jsx"},{"name":"Grain","sourcePath":"components/media/Grain.jsx"},{"name":"MediaFrame","sourcePath":"components/media/MediaFrame.jsx"},{"name":"NavLink","sourcePath":"components/navigation/NavLink.jsx"},{"name":"ScrollCue","sourcePath":"components/navigation/ScrollCue.jsx"},{"name":"SiteHeader","sourcePath":"components/navigation/SiteHeader.jsx"},{"name":"SlideCounter","sourcePath":"components/navigation/SlideCounter.jsx"},{"name":"SocialRail","sourcePath":"components/navigation/SocialRail.jsx"}],"sourceHashes":{"components/content/DisplayHeading.jsx":"6474637ca014","components/content/PullQuote.jsx":"bde1b1499211","components/content/SpecList.jsx":"d1e38a3df3c7","components/content/WorkCard.jsx":"6e0596b2a48c","components/core/Button.jsx":"5936f8d4db74","components/core/Icon.jsx":"0e2046f36aa7","components/core/Meta.jsx":"33cc3ea8efce","components/core/Rule.jsx":"2189bd331789","components/core/Wordmark.jsx":"1e163929a514","components/media/Caption.jsx":"a831ce07119d","components/media/Grain.jsx":"87f7192a4df4","components/media/MediaFrame.jsx":"ac71f3008b65","components/navigation/NavLink.jsx":"c3eb73c6abe2","components/navigation/ScrollCue.jsx":"48a63d428132","components/navigation/SiteHeader.jsx":"c6cd46856df8","components/navigation/SlideCounter.jsx":"8c8eaa29608f","components/navigation/SocialRail.jsx":"02617472e335","ui_kits/website/AboutScreen.jsx":"4108661e52a5","ui_kits/website/HomeScreen.jsx":"9e370611e760","ui_kits/website/Plate.jsx":"2ec4cbb5ebb2","ui_kits/website/ProjectScreen.jsx":"5d4f92484aa0","ui_kits/website/WorkScreen.jsx":"d2f89b58f808","ui_kits/website/data.js":"d6b7652d23ad"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MertTReliDesignSystem_56763c = window.MertTReliDesignSystem_56763c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/content/DisplayHeading.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  1: "var(--fs-display-1)",
  2: "var(--fs-display-2)",
  3: "var(--fs-display-3)",
  4: "var(--fs-title-1)"
};
function DisplayHeading({
  children,
  level = 2,
  as = "h2",
  treatment = "solid",
  weight = 500,
  caps = true,
  style,
  ...rest
}) {
  const Tag = as;
  const outline = treatment === "outline";
  return /*#__PURE__*/React.createElement(Tag, _extends({}, rest, {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: SIZES[level],
      fontWeight: weight,
      lineHeight: "var(--lh-display)",
      letterSpacing: "var(--ls-display)",
      textTransform: caps ? "uppercase" : "none",
      margin: 0,
      color: outline ? "transparent" : treatment === "inverse" ? "var(--paper)" : "var(--text-display)",
      WebkitTextStroke: outline ? "1px currentColor" : undefined,
      WebkitTextFillColor: outline ? "transparent" : undefined,
      textWrap: "balance",
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { DisplayHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/DisplayHeading.jsx", error: String((e && e.message) || e) }); }

// components/content/PullQuote.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PullQuote({
  children,
  attribution,
  inverse = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("blockquote", _extends({}, rest, {
    style: {
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-5)",
      maxWidth: "var(--measure)",
      ...style
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "var(--fs-title-1)",
      fontWeight: 300,
      lineHeight: 1.24,
      letterSpacing: "var(--ls-title)",
      color: inverse ? "var(--paper)" : "var(--text-display)",
      textWrap: "pretty"
    }
  }, children), attribution && /*#__PURE__*/React.createElement("footer", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: inverse ? "var(--paper-a70)" : "var(--text-meta)"
    }
  }, attribution));
}
Object.assign(__ds_scope, { PullQuote });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/PullQuote.jsx", error: String((e && e.message) || e) }); }

// components/content/SpecList.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SpecList({
  items = [],
  columns,
  dense = false,
  style,
  ...rest
}) {
  const cell = {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--fs-meta)",
    letterSpacing: "var(--ls-caps)",
    textTransform: "uppercase",
    lineHeight: "var(--lh-meta)"
  };
  return /*#__PURE__*/React.createElement("dl", _extends({}, rest, {
    style: {
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: dense ? "var(--space-2)" : "var(--space-3)",
      ...style
    }
  }), items.map((row, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "grid",
      gridTemplateColumns: columns || "minmax(64px, 120px) 1fr auto",
      gap: "var(--space-5)",
      alignItems: "baseline",
      paddingBottom: dense ? 0 : "var(--space-3)",
      borderBottom: dense ? "none" : "1px solid var(--line-hairline)"
    }
  }, /*#__PURE__*/React.createElement("dt", {
    style: {
      ...cell,
      color: "var(--text-meta)"
    }
  }, row.label), /*#__PURE__*/React.createElement("dd", {
    style: {
      ...cell,
      color: "var(--text-display)",
      margin: 0
    }
  }, row.value), row.aside != null && /*#__PURE__*/React.createElement("dd", {
    style: {
      ...cell,
      color: "var(--text-muted)",
      margin: 0,
      textAlign: "right"
    }
  }, row.aside))));
}
Object.assign(__ds_scope, { SpecList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/SpecList.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const PAD = {
  sm: "10px 18px",
  md: "14px 26px",
  lg: "18px 34px"
};
const FS = {
  sm: 10,
  md: 12,
  lg: 12
};
function Button({
  children,
  variant = "solid",
  size = "md",
  href,
  disabled = false,
  trailing,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const base = {
    fontFamily: "var(--font-mono)",
    fontSize: FS[size],
    letterSpacing: "var(--ls-caps)",
    textTransform: "uppercase",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: variant === "link" ? "0 0 6px" : PAD[size],
    borderRadius: variant === "link" ? 0 : "var(--radius-pill)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.32 : 1,
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "background var(--t-hover), color var(--t-hover), border-color var(--t-hover), opacity var(--t-hover)"
  };
  const skins = {
    solid: {
      background: hover && !disabled ? "var(--ink-700)" : "var(--ink-900)",
      color: "var(--paper)",
      border: "1px solid transparent"
    },
    outline: {
      background: hover && !disabled ? "var(--ink-900)" : "transparent",
      color: hover && !disabled ? "var(--paper)" : "var(--text-display)",
      border: "1px solid var(--line-strong)"
    },
    ghost: {
      background: hover && !disabled ? "var(--ink-a06)" : "transparent",
      color: "var(--text-display)",
      border: "1px solid transparent"
    },
    glass: {
      background: hover && !disabled ? "var(--paper-a18)" : "var(--paper-a08)",
      color: "var(--paper)",
      border: "1px solid var(--paper-a45)",
      backdropFilter: "var(--blur-glass)"
    },
    link: {
      background: "transparent",
      color: "var(--text-display)",
      border: "none",
      borderBottom: "1px solid " + (hover && !disabled ? "var(--line-strong)" : "var(--line-hairline)")
    }
  };
  const Tag = href ? "a" : "button";
  return /*#__PURE__*/React.createElement(Tag, _extends({}, rest, {
    href: href,
    disabled: Tag === "button" ? disabled : undefined,
    onClick: disabled ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...skins[variant],
      ...style
    }
  }), children, trailing && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      transform: hover ? "translateX(3px)" : "none",
      transition: "transform var(--t-hover)"
    }
  }, trailing));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CDN = "https://unpkg.com/lucide-static@0.544.0/icons/";
function Icon({
  name,
  size = 18,
  inverse = false,
  opacity = 1,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("img", _extends({
    src: CDN + name + ".svg",
    alt: "",
    "aria-hidden": "true",
    draggable: false
  }, rest, {
    style: {
      width: size,
      height: size,
      display: "block",
      opacity,
      filter: inverse ? "invert(1)" : "none",
      ...style
    }
  }));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Meta.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Meta({
  children,
  index,
  tone = "meta",
  mono = true,
  wide = false,
  style,
  ...rest
}) {
  const color = tone === "body" ? "var(--text-body)" : tone === "muted" ? "var(--text-muted)" : tone === "strong" ? "var(--text-display)" : "var(--text-meta)";
  return /*#__PURE__*/React.createElement("span", _extends({}, rest, {
    style: {
      fontFamily: mono ? "var(--font-mono)" : "var(--font-display)",
      fontSize: "var(--fs-meta)",
      fontWeight: 400,
      lineHeight: "var(--lh-meta)",
      letterSpacing: wide ? "var(--ls-caps-wide)" : "var(--ls-caps)",
      textTransform: "uppercase",
      color,
      display: "inline-flex",
      alignItems: "baseline",
      gap: "var(--space-3)",
      ...style
    }
  }), index != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-display)"
    }
  }, index), children);
}
Object.assign(__ds_scope, { Meta });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Meta.jsx", error: String((e && e.message) || e) }); }

// components/core/Rule.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Rule({
  label,
  right,
  strong = false,
  spacing = "var(--space-5)",
  style,
  ...rest
}) {
  const line = {
    flex: 1,
    height: 1,
    background: strong ? "var(--line-strong)" : "var(--line-hairline)"
  };
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      display: "flex",
      alignItems: "center",
      gap: spacing,
      width: "100%",
      ...style
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)",
      whiteSpace: "nowrap"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: line
  }), right && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)",
      whiteSpace: "nowrap"
    }
  }, right));
}
Object.assign(__ds_scope, { Rule });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Rule.jsx", error: String((e && e.message) || e) }); }

// components/core/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    fs: 12,
    ls: "0.32em"
  },
  md: {
    fs: 16,
    ls: "0.32em"
  },
  lg: {
    fs: 22,
    ls: "0.28em"
  },
  xl: {
    fs: 34,
    ls: "0.24em"
  }
};
function Wordmark({
  name = "MERT TÜRELI",
  size = "md",
  weight = 500,
  inverse = false,
  as = "span",
  style,
  ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({}, rest, {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: s.fs,
      fontWeight: weight,
      letterSpacing: s.ls,
      lineHeight: 1,
      textTransform: "uppercase",
      color: inverse ? "var(--paper)" : "var(--text-display)",
      display: "inline-block",
      whiteSpace: "nowrap",
      ...style
    }
  }), name);
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/media/Caption.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Caption({
  children,
  index,
  align = "left",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("p", _extends({}, rest, {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      justifyContent: align === "right" ? "flex-end" : "flex-start",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      lineHeight: "var(--lh-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)",
      ...style
    }
  }), index != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-display)"
    }
  }, index), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { Caption });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/media/Caption.jsx", error: String((e && e.message) || e) }); }

// components/media/Grain.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Grain({
  strength = "normal",
  blend = "multiply",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true"
  }, rest, {
    style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      backgroundImage: "var(--grain-url)",
      backgroundSize: "220px 220px",
      mixBlendMode: blend,
      opacity: strength === "strong" ? "var(--grain-opacity-strong)" : strength === "subtle" ? 0.14 : "var(--grain-opacity)",
      ...style
    }
  }));
}
Object.assign(__ds_scope, { Grain });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/media/Grain.jsx", error: String((e && e.message) || e) }); }

// components/media/MediaFrame.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function MediaFrame({
  src,
  alt = "",
  ratio = "3 / 2",
  radius = "var(--radius-md)",
  fit = "cover",
  scrim = "none",
  grain = true,
  hoverZoom = false,
  index,
  caption,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const scrims = {
    none: null,
    hero: "var(--scrim-hero)",
    bottom: "var(--scrim-bottom-up)",
    flat: "rgba(10,10,10,.28)"
  };
  return /*#__PURE__*/React.createElement("figure", _extends({}, rest, {
    style: {
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
      ...style
    }
  }), /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: "relative",
      aspectRatio: ratio,
      overflow: "hidden",
      borderRadius: radius,
      background: "var(--surface-sunken)"
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt,
    style: {
      width: "100%",
      height: "100%",
      objectFit: fit,
      transform: hoverZoom && hover ? "scale(1.04)" : "scale(1)",
      transition: "transform var(--t-media)"
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(150deg, var(--ink-100) 0%, var(--ink-050) 46%, var(--ink-200) 100%)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta-sm)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)"
    }
  }, alt || "Image")), scrims[scrim] && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      inset: 0,
      background: scrims[scrim]
    }
  }), grain && /*#__PURE__*/React.createElement(__ds_scope.Grain, {
    blend: src ? "overlay" : "multiply"
  }), children && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0
    }
  }, children)), (caption || index != null) && /*#__PURE__*/React.createElement("figcaption", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)"
    }
  }, index != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-display)"
    }
  }, index), caption));
}
Object.assign(__ds_scope, { MediaFrame });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/media/MediaFrame.jsx", error: String((e && e.message) || e) }); }

// components/content/WorkCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function WorkCard({
  index,
  title,
  discipline,
  year,
  src,
  alt,
  ratio = "4 / 5",
  href,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", _extends({
    href: href || "#"
  }, rest, {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)",
      textDecoration: "none",
      border: "none",
      ...style
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.MediaFrame, {
    src: src,
    alt: alt || title,
    ratio: ratio,
    hoverZoom: true,
    radius: "var(--radius-md)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: "var(--space-4)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-display)"
    }
  }, index), /*#__PURE__*/React.createElement("span", null, discipline)), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "var(--fs-title-3)",
      fontWeight: 500,
      letterSpacing: "var(--ls-title)",
      lineHeight: 1.14,
      textTransform: "uppercase",
      color: "var(--text-display)",
      display: "flex",
      alignItems: "baseline",
      gap: "var(--space-3)"
    }
  }, title, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      transform: hover ? "translateX(4px)" : "none",
      transition: "transform var(--t-hover)",
      fontSize: "0.7em",
      color: "var(--text-muted)"
    }
  }, "\u2192")), year && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      color: "var(--text-meta)"
    }
  }, year)));
}
Object.assign(__ds_scope, { WorkCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/content/WorkCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavLink.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function NavLink({
  children,
  href = "#",
  active = false,
  inverse = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const on = active || hover;
  return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    onClick: onClick
  }, rest, {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: "relative",
      display: "inline-block",
      padding: "2px 0 6px",
      fontFamily: "var(--font-display)",
      fontSize: "var(--fs-meta)",
      fontWeight: 500,
      letterSpacing: "var(--ls-nav)",
      textTransform: "uppercase",
      textDecoration: "none",
      border: "none",
      color: inverse ? on ? "var(--paper)" : "var(--paper-a70)" : on ? "var(--text-display)" : "var(--text-muted)",
      transition: "color var(--t-hover)",
      ...style
    }
  }), children, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      left: 0,
      bottom: 0,
      height: 1,
      width: on ? "100%" : "0%",
      background: inverse ? "var(--paper)" : "var(--line-strong)",
      transition: "width var(--dur-3) var(--ease-out)"
    }
  }));
}
Object.assign(__ds_scope, { NavLink });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavLink.jsx", error: String((e && e.message) || e) }); }

// components/navigation/ScrollCue.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ScrollCue({
  label,
  inverse = false,
  shape = "square",
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    "aria-label": label || "Scroll down"
  }, rest, {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-2)",
      width: shape === "square" ? 72 : "auto",
      height: shape === "square" ? 72 : "auto",
      padding: shape === "square" ? 0 : "var(--space-3) 0",
      cursor: "pointer",
      background: shape === "square" ? inverse ? "var(--paper-a08)" : "var(--paper)" : "transparent",
      border: shape === "square" ? "1px solid " + (inverse ? "var(--paper-a45)" : "var(--line-hairline)") : "none",
      borderRadius: 0,
      backdropFilter: inverse ? "var(--blur-glass)" : undefined,
      transition: "background var(--t-hover)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      transform: hover ? "translateY(3px)" : "none",
      transition: "transform var(--dur-3) var(--ease-out)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-down",
    size: 18,
    inverse: inverse
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta-sm)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: inverse ? "var(--paper-a70)" : "var(--text-meta)"
    }
  }, label));
}
Object.assign(__ds_scope, { ScrollCue });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/ScrollCue.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SiteHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SiteHeader({
  items = [],
  active,
  inverse = false,
  floating = false,
  onMenu,
  onNavigate,
  right,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({}, rest, {
    style: {
      position: floating ? "absolute" : "relative",
      top: floating ? 0 : undefined,
      left: 0,
      right: 0,
      zIndex: "var(--z-header)",
      height: "var(--header-h)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "var(--space-8)",
      padding: "0 var(--page-margin)",
      borderBottom: floating ? "none" : "1px solid " + (inverse ? "var(--line-inverse)" : "var(--line-hairline)"),
      ...style
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Wordmark, {
    size: "sm",
    inverse: inverse,
    as: "a",
    href: "#",
    style: {
      textDecoration: "none",
      border: "none"
    }
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-7)"
    }
  }, items.map(it => /*#__PURE__*/React.createElement(__ds_scope.NavLink, {
    key: it.id || it.label,
    href: it.href || "#",
    active: active === (it.id || it.label),
    inverse: inverse,
    onClick: onNavigate ? e => {
      e.preventDefault();
      onNavigate(it.id || it.label);
    } : undefined
  }, it.label)), right, /*#__PURE__*/React.createElement("button", {
    onClick: onMenu,
    "aria-label": "Menu",
    style: {
      display: "grid",
      placeItems: "center",
      width: 32,
      height: 32,
      background: "transparent",
      border: "none",
      cursor: "pointer",
      padding: 0,
      marginLeft: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "menu",
    size: 20,
    inverse: inverse
  }))));
}
Object.assign(__ds_scope, { SiteHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SiteHeader.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SlideCounter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SlideCounter({
  current = 1,
  total = 3,
  inverse = false,
  variant = "fraction",
  onPrev,
  onNext,
  onSelect,
  style,
  ...rest
}) {
  const pad = n => String(n).padStart(2, "0");
  const dim = inverse ? "var(--paper-a45)" : "var(--text-meta)";
  const on = inverse ? "var(--paper)" : "var(--text-display)";
  const arrow = (name, fn) => /*#__PURE__*/React.createElement("button", {
    onClick: fn,
    "aria-label": name,
    style: {
      background: "transparent",
      border: "none",
      padding: 4,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      opacity: 0.75,
      transition: "opacity var(--t-hover)"
    },
    onMouseEnter: e => e.currentTarget.style.opacity = 1,
    onMouseLeave: e => e.currentTarget.style.opacity = 0.75
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: name,
    size: 16,
    inverse: inverse
  }));
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-4)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      ...style
    }
  }), variant !== "dots" && onPrev && arrow("chevron-left", onPrev), variant === "dots" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-3)"
    }
  }, Array.from({
    length: total
  }, (_, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => onSelect && onSelect(i + 1),
    "aria-label": "Slide " + (i + 1),
    style: {
      width: 7,
      height: 7,
      padding: 0,
      borderRadius: "var(--radius-pill)",
      cursor: "pointer",
      border: "1px solid " + (inverse ? "var(--paper)" : "var(--ink-900)"),
      background: i + 1 === current ? inverse ? "var(--paper)" : "var(--ink-900)" : "transparent",
      transition: "background var(--t-hover)"
    }
  }))) : variant === "steps" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-6)"
    }
  }, Array.from({
    length: total
  }, (_, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => onSelect && onSelect(i + 1),
    style: {
      background: "transparent",
      border: "none",
      padding: 0,
      cursor: "pointer",
      fontFamily: "var(--font-mono)",
      letterSpacing: "var(--ls-caps)",
      fontSize: i + 1 === current ? 16 : 10,
      color: i + 1 === current ? on : dim,
      transition: "color var(--t-hover)"
    }
  }, pad(i + 1)))) : /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "baseline",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      color: on,
      letterSpacing: "0.04em"
    }
  }, pad(current)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: dim
    }
  }, "/"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: dim
    }
  }, pad(total))), variant !== "dots" && onNext && arrow("chevron-right", onNext));
}
Object.assign(__ds_scope, { SlideCounter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SlideCounter.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SocialRail.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SocialRail({
  items = [],
  inverse = false,
  position = "right",
  fixed = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      position: fixed ? "absolute" : "relative",
      zIndex: "var(--z-rail)",
      top: fixed ? "50%" : undefined,
      transform: fixed ? "translateY(-50%)" : undefined,
      right: fixed && position === "right" ? "var(--space-5)" : undefined,
      left: fixed && position === "left" ? "var(--space-5)" : undefined,
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
      ...style
    }
  }), items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it.name,
    href: it.href || "#",
    "aria-label": it.name,
    style: {
      width: 36,
      height: 36,
      display: "grid",
      placeItems: "center",
      borderRadius: "var(--radius-pill)",
      border: "1px solid " + (inverse ? "var(--paper-a18)" : "var(--line-hairline)"),
      background: inverse ? "var(--paper-a08)" : "var(--paper)",
      backdropFilter: inverse ? "var(--blur-glass)" : undefined,
      transition: "background var(--t-hover), border-color var(--t-hover)"
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = inverse ? "var(--paper-a18)" : "var(--ink-050)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = inverse ? "var(--paper-a08)" : "var(--paper)";
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: it.icon,
    size: 15,
    inverse: inverse
  }))));
}
Object.assign(__ds_scope, { SocialRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SocialRail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/AboutScreen.jsx
try { (() => {
window.AboutScreen = function AboutScreen({
  onNavigate,
  contact
}) {
  const {
    SiteHeader,
    DisplayHeading,
    Rule,
    Meta,
    SpecList,
    Button,
    Caption
  } = window.DS;
  const a = window.SITE.about;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SiteHeader, {
    items: window.SITE.nav,
    active: contact ? "contact" : "about",
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "var(--space-10) var(--page-margin) var(--space-8)",
      display: "grid",
      gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)",
      gap: "var(--space-10)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    wide: true,
    tone: "strong"
  }, contact ? "Contact" : "About"), /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 2,
    as: "h1"
  }, contact ? "Get in touch" : "Mert Türeli"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-title-3)",
      lineHeight: 1.4,
      color: "var(--text-display)",
      maxWidth: "var(--measure)"
    }
  }, a.lead), a.body.map((t, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    style: {
      fontSize: "var(--fs-body)",
      lineHeight: "var(--lh-body)",
      color: "var(--text-body)",
      maxWidth: "var(--measure)"
    }
  }, t)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      marginTop: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "solid",
    trailing: "\u2192",
    href: "mailto:hello@merttureli.com"
  }, "hello@merttureli.com"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline"
  }, "Download CV"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "4 / 5",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    gradient: "linear-gradient(150deg,#23262b,#cdd0d3)"
  })), /*#__PURE__*/React.createElement(Caption, {
    index: "00"
  }, "Portrait / 2025"))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "0 var(--page-margin) var(--space-10)",
      display: "grid",
      gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)",
      gap: "var(--space-10)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Facts",
    right: "05"
  }), /*#__PURE__*/React.createElement(SpecList, {
    items: a.specs
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Elsewhere"
  }), /*#__PURE__*/React.createElement(SpecList, {
    dense: true,
    items: [{
      label: "Instagram",
      value: "@merttureli"
    }, {
      label: "LinkedIn",
      value: "/in/merttureli"
    }, {
      label: "Email",
      value: "hello@merttureli.com"
    }],
    columns: "minmax(64px,110px) 1fr"
  }))));
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/AboutScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/HomeScreen.jsx
try { (() => {
window.HomeScreen = function HomeScreen({
  onNavigate,
  onOpen
}) {
  const {
    SiteHeader,
    DisplayHeading,
    Button,
    SlideCounter,
    ScrollCue,
    SocialRail,
    Meta,
    Rule,
    WorkCard,
    SpecList
  } = window.DS;
  const [slide, setSlide] = React.useState(0);
  const h = window.SITE.hero[slide];
  const go = d => setSlide(s => (s + d + window.SITE.hero.length) % window.SITE.hero.length);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      position: "relative",
      height: "min(880px, 100vh)",
      minHeight: 620,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    key: h.id,
    gradient: h.plate,
    scrim: "var(--scrim-hero)",
    style: {
      animation: "kb var(--dur-6) var(--ease-out) both"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "on-dark",
    style: {
      position: "relative",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(SiteHeader, {
    items: window.SITE.nav,
    active: "index",
    inverse: true,
    floating: true,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(SocialRail, {
    fixed: true,
    inverse: true,
    items: [{
      name: "Instagram",
      icon: "instagram"
    }, {
      name: "LinkedIn",
      icon: "linkedin"
    }, {
      name: "Mail",
      icon: "mail"
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      padding: "var(--header-h) var(--page-margin) 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    key: h.id,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)",
      maxWidth: 900,
      animation: "up var(--dur-4) var(--ease-out) both"
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    wide: true,
    style: {
      color: "var(--paper-a70)"
    }
  }, h.meta), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 1,
    as: "h1",
    treatment: "inverse"
  }, h.line1), /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 1,
    treatment: "outline",
    style: {
      color: "var(--paper)"
    }
  }, h.line2)), /*#__PURE__*/React.createElement("p", {
    style: {
      maxWidth: "var(--measure-narrow)",
      fontSize: "var(--fs-body-lg)",
      lineHeight: "var(--lh-body)",
      color: "var(--paper-a90)"
    }
  }, h.lead), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      marginTop: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "glass",
    trailing: "\u2192",
    onClick: () => onNavigate("work")
  }, "See the work")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      padding: "0 var(--page-margin) var(--space-7)"
    }
  }, /*#__PURE__*/React.createElement(SlideCounter, {
    current: slide + 1,
    total: window.SITE.hero.length,
    inverse: true,
    onPrev: () => go(-1),
    onNext: () => go(1)
  }), /*#__PURE__*/React.createElement(ScrollCue, {
    inverse: true,
    onClick: () => window.scrollTo({
      top: window.innerHeight * 0.92,
      behavior: "smooth"
    })
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "var(--section-y) var(--page-margin)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Statement",
    right: "01"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
      gap: "var(--space-10)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement(window.Reveal, null, /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 3
  }, "Three disciplines, one habit of looking")), /*#__PURE__*/React.createElement(window.Reveal, {
    delay: 120,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-body-lg)",
      lineHeight: "var(--lh-body)",
      color: "var(--text-body)",
      maxWidth: "var(--measure)"
    }
  }, window.SITE.about.lead), /*#__PURE__*/React.createElement(SpecList, {
    dense: true,
    items: window.SITE.about.specs.slice(0, 3)
  })))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "0 var(--page-margin) var(--section-y)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Selected work",
    right: String(window.SITE.work.length).padStart(3, "0")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "var(--space-8) var(--space-6)"
    }
  }, window.SITE.work.slice(0, 3).map((w, i) => /*#__PURE__*/React.createElement(window.Reveal, {
    key: w.id,
    delay: i * 90
  }, /*#__PURE__*/React.createElement(PlateCard, {
    w: w,
    onOpen: onOpen
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    trailing: "\u2192",
    onClick: () => onNavigate("work")
  }, "All projects"))));
};
window.PlateCard = function PlateCard({
  w,
  onOpen,
  ratio
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onOpen(w);
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)",
      textDecoration: "none",
      border: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: ratio || w.ratio,
      overflow: "hidden",
      borderRadius: "var(--radius-md)"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    gradient: w.plate,
    style: {
      transform: hover ? "scale(1.04)" : "scale(1)",
      transition: "transform var(--t-media)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-meta)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-display)"
    }
  }, w.index), /*#__PURE__*/React.createElement("span", null, w.discipline)), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontSize: "var(--fs-title-3)",
      fontWeight: 500,
      letterSpacing: "var(--ls-title)",
      textTransform: "uppercase",
      color: "var(--text-display)",
      display: "flex",
      gap: "var(--space-3)",
      alignItems: "baseline"
    }
  }, w.title, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: ".64em",
      color: "var(--text-muted)",
      transform: hover ? "translateX(4px)" : "none",
      transition: "transform var(--t-hover)",
      display: "inline-block"
    }
  }, "\u2192")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      color: "var(--text-meta)"
    }
  }, w.year)));
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Plate.jsx
try { (() => {
// Photographic stand-in. Real photography drops in as <Plate src="../../assets/photography/x.jpg" />.
window.Plate = function Plate({
  gradient,
  src,
  scrim,
  radius = 0,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      borderRadius: radius,
      background: gradient || "var(--ink-200)",
      ...style
    }
  }, src && /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }), scrim && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      inset: 0,
      background: scrim
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      inset: 0,
      backgroundImage: "var(--grain-url)",
      backgroundSize: "220px 220px",
      mixBlendMode: "overlay",
      opacity: "var(--grain-opacity)"
    }
  }), children);
};
window.Reveal = function Reveal({
  children,
  delay = 0,
  y = 22,
  style
}) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      opacity: on ? 1 : 0,
      transform: on ? "none" : `translateY(${y}px)`,
      transition: "opacity var(--dur-4) var(--ease-out), transform var(--dur-4) var(--ease-out)",
      ...style
    }
  }, children);
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Plate.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ProjectScreen.jsx
try { (() => {
window.ProjectScreen = function ProjectScreen({
  onNavigate,
  onOpen,
  item
}) {
  const {
    SiteHeader,
    DisplayHeading,
    Rule,
    Meta,
    SpecList,
    PullQuote,
    Button,
    Caption
  } = window.DS;
  const p = window.SITE.project;
  const title = item && item.title || p.title;
  const discipline = item && item.discipline || p.discipline;
  const year = item && item.year || p.year;
  const plate = item && item.plate || "linear-gradient(150deg,#1b1e22,#c2c5c8)";
  const next = window.SITE.work.find(w => w.title !== title);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      position: "relative",
      height: "min(620px, 78vh)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    gradient: plate,
    scrim: "var(--scrim-hero)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "on-dark",
    style: {
      position: "relative",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(SiteHeader, {
    items: window.SITE.nav,
    active: "work",
    inverse: true,
    floating: true,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      alignItems: "flex-end",
      padding: "var(--header-h) var(--page-margin) var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-5)",
      animation: "up var(--dur-4) var(--ease-out) both"
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    wide: true,
    style: {
      color: "var(--paper-a70)"
    }
  }, discipline, " / ", year), /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 2,
    as: "h1",
    treatment: "inverse"
  }, title))))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "var(--space-9) var(--page-margin)",
      display: "grid",
      gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)",
      gap: "var(--space-10)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--fs-title-3)",
      lineHeight: 1.4,
      color: "var(--text-display)",
      maxWidth: "var(--measure)"
    }
  }, p.lead), p.body.map((t, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    style: {
      fontSize: "var(--fs-body)",
      lineHeight: "var(--lh-body)",
      color: "var(--text-body)",
      maxWidth: "var(--measure)"
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Specification"
  }), /*#__PURE__*/React.createElement(SpecList, {
    items: p.specs
  }))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "0 var(--page-margin) var(--space-9)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "4 / 3",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    gradient: "linear-gradient(140deg,#2a2d33,#b7babe)"
  })), /*#__PURE__*/React.createElement(Caption, {
    index: "01"
  }, "Iteration five, quarter scale")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "4 / 3",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    gradient: "linear-gradient(140deg,#14171a,#9ca1a6)"
  })), /*#__PURE__*/React.createElement(Caption, {
    index: "02"
  }, "Load frame, 3.8 g limit"))), /*#__PURE__*/React.createElement("section", {
    className: "on-dark",
    style: {
      background: "var(--ink-900)",
      padding: "var(--space-9) var(--page-margin)",
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      inset: 0,
      backgroundImage: "var(--grain-url)",
      backgroundSize: "220px",
      mixBlendMode: "overlay",
      opacity: 0.22
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement(PullQuote, {
    inverse: true,
    attribution: "Design notes / March 2025"
  }, "The optimiser is not designing the part. It is showing you where the forces already go."))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "var(--space-9) var(--page-margin) var(--space-10)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Next",
    right: next ? next.index : "02"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 3,
    style: {
      cursor: "pointer"
    },
    onClick: () => next && onOpen(next)
  }, next ? next.title : "Next project"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    trailing: "\u2192",
    onClick: () => next && onOpen(next)
  }, "Open"))));
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ProjectScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/WorkScreen.jsx
try { (() => {
window.WorkScreen = function WorkScreen({
  onNavigate,
  onOpen
}) {
  const {
    SiteHeader,
    DisplayHeading,
    Rule,
    Meta
  } = window.DS;
  const [hover, setHover] = React.useState(null);
  const rows = window.SITE.work;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SiteHeader, {
    items: window.SITE.nav,
    active: "work",
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "var(--space-10) var(--page-margin) var(--space-8)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    wide: true,
    tone: "strong"
  }, "Index / 2023 \u2014 2025"), /*#__PURE__*/React.createElement(DisplayHeading, {
    level: 2,
    as: "h1"
  }, "Work"), /*#__PURE__*/React.createElement("p", {
    style: {
      maxWidth: "var(--measure-narrow)",
      fontSize: "var(--fs-body-lg)",
      lineHeight: "var(--lh-body)",
      color: "var(--text-muted)"
    }
  }, "Everything in one list, in the order it was made. Discipline is a note, not a filter.")), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "0 var(--page-margin) var(--space-9)",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement(Rule, {
    label: "Project",
    right: "Year"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, rows.map(w => /*#__PURE__*/React.createElement("a", {
    key: w.id,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onOpen(w);
    },
    onMouseEnter: () => setHover(w.id),
    onMouseLeave: () => setHover(null),
    style: {
      display: "grid",
      gridTemplateColumns: "72px minmax(0,1fr) 200px 96px",
      alignItems: "center",
      gap: "var(--space-5)",
      padding: "var(--space-6) 0",
      borderBottom: "1px solid var(--line-hairline)",
      textDecoration: "none",
      border: "none",
      borderBottomWidth: 1,
      borderBottomStyle: "solid",
      borderBottomColor: "var(--line-hairline)",
      opacity: hover && hover !== w.id ? 0.42 : 1,
      transition: "opacity var(--t-hover)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      color: "var(--text-meta)"
    }
  }, w.index), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "clamp(24px, 3vw, 40px)",
      fontWeight: 500,
      letterSpacing: "var(--ls-title)",
      textTransform: "uppercase",
      color: "var(--text-display)",
      transform: hover === w.id ? "translateX(10px)" : "none",
      transition: "transform var(--dur-3) var(--ease-out)"
    }
  }, w.title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, w.discipline), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      letterSpacing: "var(--ls-caps)",
      color: "var(--text-meta)",
      textAlign: "right"
    }
  }, w.year)))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      right: "var(--page-margin)",
      top: "50%",
      width: 260,
      height: 325,
      pointerEvents: "none",
      opacity: hover ? 1 : 0,
      transform: hover ? "translateY(-50%)" : "translateY(-46%)",
      transition: "opacity var(--dur-3) var(--ease-out), transform var(--dur-3) var(--ease-out)",
      zIndex: "var(--z-rail)"
    }
  }, rows.map(w => /*#__PURE__*/React.createElement("div", {
    key: w.id,
    style: {
      position: "absolute",
      inset: 0,
      opacity: hover === w.id ? 1 : 0,
      transition: "opacity var(--dur-3) var(--ease-out)"
    }
  }, /*#__PURE__*/React.createElement(window.Plate, {
    gradient: w.plate,
    radius: "var(--radius-md)"
  }))))));
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/WorkScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/data.js
try { (() => {
window.SITE = {
  nav: [{
    id: "index",
    label: "Index"
  }, {
    id: "work",
    label: "Work"
  }, {
    id: "about",
    label: "About"
  }, {
    id: "contact",
    label: "Contact"
  }],
  hero: [{
    id: 1,
    line1: "Built",
    line2: "and flown",
    lead: "Aerospace engineering, a pilot's logbook, and a camera. One portfolio, three ways of looking at the same thing.",
    plate: "linear-gradient(150deg, #1a1c1f 0%, #4a4f56 46%, #b9bcc0 100%)",
    meta: "Ísafjörður / 66°04′ N"
  }, {
    id: 2,
    line1: "Ten",
    line2: "thousand feet",
    lead: "Cross-country VFR, mostly at first light, mostly with the window open.",
    plate: "linear-gradient(160deg, #0f1114 0%, #3b4149 40%, #9aa1a8 100%)",
    meta: "EGKB → EGHI / 2025"
  }, {
    id: 3,
    line1: "Frames",
    line2: "per second",
    lead: "Film when there is time, digital when there is not.",
    plate: "linear-gradient(130deg, #16181b 0%, #565b62 55%, #cfd2d5 100%)",
    meta: "Portra 400 / FM2"
  }],
  work: [{
    id: "w1",
    index: "01",
    title: "Wing rib topology",
    discipline: "Engineering",
    year: "2025",
    ratio: "4 / 5",
    plate: "linear-gradient(140deg,#2b2e33,#c6c9cc)"
  }, {
    id: "w2",
    index: "02",
    title: "First light, EGKB",
    discipline: "Aviation",
    year: "2025",
    ratio: "4 / 5",
    plate: "linear-gradient(140deg,#1d2024,#a9aeb3)"
  }, {
    id: "w3",
    index: "03",
    title: "Coastline series",
    discipline: "Photography",
    year: "2024",
    ratio: "4 / 5",
    plate: "linear-gradient(140deg,#343840,#d2d5d8)"
  }, {
    id: "w4",
    index: "04",
    title: "Composite lay-up rig",
    discipline: "Engineering",
    year: "2024",
    ratio: "4 / 5",
    plate: "linear-gradient(140deg,#22252a,#b0b4b8)"
  }, {
    id: "w5",
    index: "05",
    title: "Night circuits",
    discipline: "Aviation",
    year: "2024",
    ratio: "4 / 5",
    plate: "linear-gradient(140deg,#101215,#8f959b)"
  }, {
    id: "w6",
    index: "06",
    title: "Kitchen, 06:40",
    discipline: "Photography",
    year: "2023",
    ratio: "4 / 5",
    plate: "linear-gradient(140deg,#3a3e45,#dcdfe1)"
  }],
  project: {
    index: "01",
    title: "Wing rib topology",
    discipline: "Engineering",
    year: "2025",
    lead: "A structural study of a light-aircraft wing rib, reduced by topology optimisation until only the load paths remained. The result is 31% lighter than the machined baseline and takes the same limit load.",
    body: ["The brief was narrow: keep the spar interface and the skin attachment untouched, and remove everything else that is not carrying load. That constraint makes the problem readable — the optimiser is not designing the part, it is showing you where the forces already go.", "Six iterations, each one printed at quarter scale before committing to the aluminium. The photographs below are of the fifth, which failed in the way the model said it would, at the load the model said it would."],
    specs: [{
      label: "Discipline",
      value: "Structural / FEA",
      aside: "2025"
    }, {
      label: "Method",
      value: "Topology optimisation",
      aside: "Altair"
    }, {
      label: "Material",
      value: "AL 7075-T6",
      aside: "2.81 g/cm³"
    }, {
      label: "Mass",
      value: "−31%",
      aside: "vs baseline"
    }, {
      label: "Limit load",
      value: "3.8 g",
      aside: "1.5 factor"
    }]
  },
  about: {
    lead: "I am an engineer, a pilot and a photographer, in the order I picked them up.",
    body: ["The engineering pays for the flying and the flying finds the pictures. In practice the three are one habit: get close to the thing, understand how it holds together, then decide what is worth keeping in frame.", "Based in London. Available for structural and mechanical design work, and for commissions in aviation, landscape and food photography. I travel often, and most of what ends up here was made somewhere other than home."],
    specs: [{
      label: "Engineering",
      value: "MEng Aerospace",
      aside: "Structures / FEA"
    }, {
      label: "Licence",
      value: "PPL(A) SEP",
      aside: "Night rating"
    }, {
      label: "Hours",
      value: "412",
      aside: "PIC 260"
    }, {
      label: "Bodies",
      value: "Nikon FM2 · Fuji X-T5",
      aside: "35 / 50 / 85"
    }, {
      label: "Based",
      value: "London, UK",
      aside: "Will travel"
    }]
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/data.js", error: String((e && e.message) || e) }); }

__ds_ns.DisplayHeading = __ds_scope.DisplayHeading;

__ds_ns.PullQuote = __ds_scope.PullQuote;

__ds_ns.SpecList = __ds_scope.SpecList;

__ds_ns.WorkCard = __ds_scope.WorkCard;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Meta = __ds_scope.Meta;

__ds_ns.Rule = __ds_scope.Rule;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Caption = __ds_scope.Caption;

__ds_ns.Grain = __ds_scope.Grain;

__ds_ns.MediaFrame = __ds_scope.MediaFrame;

__ds_ns.NavLink = __ds_scope.NavLink;

__ds_ns.ScrollCue = __ds_scope.ScrollCue;

__ds_ns.SiteHeader = __ds_scope.SiteHeader;

__ds_ns.SlideCounter = __ds_scope.SlideCounter;

__ds_ns.SocialRail = __ds_scope.SocialRail;

})();
