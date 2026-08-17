import * as React from "react";

/** Hairline divider, optionally captioned at one or both ends. The main structural device. */
export interface RuleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Caps label before the line. */
  label?: React.ReactNode;
  /** Caps label after the line. */
  right?: React.ReactNode;
  /** Full-ink 1px rule instead of the 12% hairline. @default false */
  strong?: boolean;
  /** Gap between label and line. @default "var(--space-5)" */
  spacing?: string;
}
export declare function Rule(props: RuleProps): JSX.Element;
