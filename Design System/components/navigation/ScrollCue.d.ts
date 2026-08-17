import * as React from "react";

/** The bottom-right scroll affordance — a 72px square with a down arrow that eases down on hover. */
export interface ScrollCueProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Optional caps label under the arrow. */
  label?: string;
  /** @default false */
  inverse?: boolean;
  /** `bare` drops the box. @default "square" */
  shape?: "square" | "bare";
  onClick?: () => void;
}
export declare function ScrollCue(props: ScrollCueProps): JSX.Element;
