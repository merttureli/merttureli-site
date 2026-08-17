import * as React from "react";

/**
 * The big statement type — tight caps at display scale, with a knockout-outline variant for photographic heroes.
 */
export interface DisplayHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children?: React.ReactNode;
  /** 1 is the hero scale; 4 is a section title. @default 2 */
  level?: 1 | 2 | 3 | 4;
  /** @default "h2" */
  as?: keyof JSX.IntrinsicElements;
  /** `outline` is the hairline knockout used over imagery. @default "solid" */
  treatment?: "solid" | "outline" | "inverse";
  /** @default 500 */
  weight?: 300 | 400 | 500 | 600 | 700;
  /** @default true */
  caps?: boolean;
}
export declare function DisplayHeading(props: DisplayHeadingProps): JSX.Element;
