import * as React from "react";

/**
 * A single portfolio entry: numeral, image, title, discipline. Cards are borderless and shadowless —
 * the image edge is the card edge.
 */
export interface WorkCardProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Two-digit numeral, e.g. "04". */
  index?: string | number;
  title: React.ReactNode;
  /** Engineering / Aviation / Photography. */
  discipline?: React.ReactNode;
  year?: React.ReactNode;
  src?: string;
  alt?: string;
  /** @default "4 / 5" */
  ratio?: string;
  href?: string;
}
export declare function WorkCard(props: WorkCardProps): JSX.Element;
