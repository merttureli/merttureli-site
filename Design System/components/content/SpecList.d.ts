import * as React from "react";

export interface SpecRow {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional right-aligned secondary value (units, alternate figure). */
  aside?: React.ReactNode;
}

/**
 * Technical key/value rows — the spec-sheet device from the reference boards.
 */
export interface SpecListProps extends React.HTMLAttributes<HTMLDListElement> {
  items: SpecRow[];
  /** grid-template-columns override. @default "minmax(64px, 120px) 1fr auto" */
  columns?: string;
  /** Drops the hairlines and tightens the rhythm. @default false */
  dense?: boolean;
}
export declare function SpecList(props: SpecListProps): JSX.Element;
