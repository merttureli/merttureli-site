import * as React from "react";

/** Film-grain overlay layer. Absolutely positioned — put it inside a relative parent. */
export interface GrainProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default "normal" */
  strength?: "subtle" | "normal" | "strong";
  /** `multiply` over light fields, `overlay` over photography. @default "multiply" */
  blend?: "multiply" | "overlay" | "soft-light" | "normal";
}
export declare function Grain(props: GrainProps): JSX.Element;
