import * as React from "react";

/**
 * Lucide glyph, loaded from CDN as a flat SVG. No brand icon set was supplied —
 * Lucide's 1.5px stroke is the closest match to the reference boards (see readme.md → Iconography).
 */
export interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Lucide icon name, kebab-case, e.g. "menu" | "arrow-down" | "chevron-left" | "search" | "plus". */
  name: string;
  /** Pixel box. @default 18 */
  size?: number;
  /** Invert to paper white, for use over photography or dark plates. @default false */
  inverse?: boolean;
  /** @default 1 */
  opacity?: number;
}
export declare function Icon(props: IconProps): JSX.Element;
