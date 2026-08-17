import * as React from "react";

export interface SiteHeaderItem { id?: string; label: React.ReactNode; href?: string }

/**
 * The site header: wordmark left, caps nav and menu button right. 88px tall, hairline underneath —
 * or borderless and floating over a photographic hero.
 */
export interface SiteHeaderProps extends React.HTMLAttributes<HTMLElement> {
  items?: SiteHeaderItem[];
  /** id (or label) of the current item. */
  active?: string;
  /** White type, for floating over imagery. @default false */
  inverse?: boolean;
  /** Absolute-position over the hero with no border. @default false */
  floating?: boolean;
  onMenu?: () => void;
  onNavigate?: (id: string) => void;
  /** Extra node before the menu button (locale switch, search). */
  right?: React.ReactNode;
}
export declare function SiteHeader(props: SiteHeaderProps): JSX.Element;
