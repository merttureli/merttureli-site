import * as React from "react";

/** Caps navigation item with an underline that sweeps in on hover and stays for the active item. */
export interface NavLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode;
  href?: string;
  /** @default false */
  active?: boolean;
  /** For headers over photography. @default false */
  inverse?: boolean;
}
export declare function NavLink(props: NavLinkProps): JSX.Element;
