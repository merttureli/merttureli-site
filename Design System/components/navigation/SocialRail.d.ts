import * as React from "react";

export interface SocialRailItem { name: string; /** Lucide icon name. */ icon: string; href?: string }

/** Vertical stack of circular icon links, pinned to a page edge over the hero. */
export interface SocialRailProps extends React.HTMLAttributes<HTMLDivElement> {
  items?: SocialRailItem[];
  /** @default false */
  inverse?: boolean;
  /** @default "right" */
  position?: "left" | "right";
  /** Pin to the vertical centre of the nearest positioned ancestor. @default false */
  fixed?: boolean;
}
export declare function SocialRail(props: SocialRailProps): JSX.Element;
