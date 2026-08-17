import * as React from "react";

/** Standalone mono caption for images not wrapped in a MediaFrame. */
export interface CaptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
  index?: string | number;
  /** @default "left" */
  align?: "left" | "right";
}
export declare function Caption(props: CaptionProps): JSX.Element;
