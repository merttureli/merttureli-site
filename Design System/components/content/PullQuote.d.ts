import * as React from "react";

/** Light-weight display quote with a mono attribution line. */
export interface PullQuoteProps extends React.HTMLAttributes<HTMLQuoteElement> {
  children?: React.ReactNode;
  attribution?: React.ReactNode;
  /** For dark plates and photography. @default false */
  inverse?: boolean;
}
export declare function PullQuote(props: PullQuoteProps): JSX.Element;
