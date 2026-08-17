import * as React from "react";

/**
 * Mono caps action. Pill by default; `link` is the underlined inline form.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /** `glass` is for use over photography only. @default "solid" */
  variant?: "solid" | "outline" | "ghost" | "glass" | "link";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Renders an anchor instead of a button. */
  href?: string;
  /** @default false */
  disabled?: boolean;
  /** Icon or glyph after the label; nudges right on hover. */
  trailing?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
