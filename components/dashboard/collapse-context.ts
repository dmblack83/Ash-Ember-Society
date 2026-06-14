"use client";

import { createContext, useContext } from "react";

/*
 * A monotonically increasing counter the DashboardPager bumps on every
 * navigation (swipe / arrow / dot). Expandable widgets read it and
 * collapse themselves when it changes, so swiping away closes an open
 * card. Defaults to 0 so widgets render fine outside a pager.
 */
export const CollapseContext = createContext(0);

export function useCollapseSignal(): number {
  return useContext(CollapseContext);
}
