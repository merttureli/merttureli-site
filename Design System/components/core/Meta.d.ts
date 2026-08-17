import * as React from "react";

/** Tiny letter-spaced technical label — eyebrows, spec keys, dates, coordinates. */
export interface MetaProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  /** Optional leading numeral, e.g. "01" — rendered at full ink. */
  index?: string | number;
  /** @default "meta" */
  tone?: "meta" | "muted" | "body" | "strong";
  /** Mono is the default technical voice; false uses the display face. @default true */
  mono?: boolean;
  /** Widest tracking, for section eyebrows. @default false */
  wide?: boolean;
}
export declare function Meta(props: MetaProps): JSX.Element;
