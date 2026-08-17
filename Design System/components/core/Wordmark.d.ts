import * as React from "react";

/**
 * The brand signature: the full name set in letter-spaced display caps.
 * No logo mark exists — this component IS the mark.
 */
export interface WordmarkProps extends React.HTMLAttributes<HTMLElement> {
  /** Text of the mark. Only change for sub-brands. @default "MERT TÜRELI" */
  name?: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg" | "xl";
  /** @default 500 */
  weight?: 300 | 400 | 500 | 600 | 700;
  /** Render in paper white, for use over photography. @default false */
  inverse?: boolean;
  /** @default "span" */
  as?: keyof JSX.IntrinsicElements;
}
export declare function Wordmark(props: WordmarkProps): JSX.Element;
