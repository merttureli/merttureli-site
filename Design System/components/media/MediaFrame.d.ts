import * as React from "react";

/**
 * The image container: ratio box, grain, optional scrim and mono caption.
 * With no `src` it renders the grey placeholder used before real photography lands.
 */
export interface MediaFrameProps extends React.HTMLAttributes<HTMLElement> {
  /** Omit to render the placeholder field. */
  src?: string;
  /** Also used as the placeholder label. */
  alt?: string;
  /** CSS aspect-ratio. @default "3 / 2" */
  ratio?: string;
  /** @default "var(--radius-md)" */
  radius?: string;
  /** @default "cover" */
  fit?: "cover" | "contain";
  /** Overlay gradient for type placed on the image. @default "none" */
  scrim?: "none" | "hero" | "bottom" | "flat";
  /** @default true */
  grain?: boolean;
  /** Slow 4% scale on hover. @default false */
  hoverZoom?: boolean;
  /** Numeral shown at full ink before the caption. */
  index?: string | number;
  caption?: React.ReactNode;
  /** Content overlaid on the image. */
  children?: React.ReactNode;
}
export declare function MediaFrame(props: MediaFrameProps): JSX.Element;
