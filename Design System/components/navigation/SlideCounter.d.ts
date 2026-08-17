import * as React from "react";

/**
 * Position indicator for hero sliders and galleries — the `01 / 03` device from the references.
 */
export interface SlideCounterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 1-based. @default 1 */
  current?: number;
  /** @default 3 */
  total?: number;
  /** @default false */
  inverse?: boolean;
  /** `fraction` = 01/03, `steps` = 01 02 03 with the active one enlarged, `dots` = filled dots. @default "fraction" */
  variant?: "fraction" | "steps" | "dots";
  onPrev?: () => void;
  onNext?: () => void;
  /** (index1Based) => void — steps and dots only. */
  onSelect?: (index: number) => void;
}
export declare function SlideCounter(props: SlideCounterProps): JSX.Element;
