/*
 * Sheet drag-vs-scroll gesture state machine.
 *
 * Pure logic behind BottomSheet's drag-to-dismiss, extracted so the
 * gesture rules are unit-testable. The component feeds it touch
 * positions; it answers "is this gesture a dismiss pull or a content
 * scroll, and what should the sheet do this frame?"
 *
 * Rules that fix the scroll/dismiss conflicts:
 * - Intent is decided ONCE per gesture, at the first movement past
 *   INTENT_SLOP — downward + scroller at top = dismiss, anything
 *   else = scroll — and is then locked until the finger lifts.
 *   (Deciding at touchstart and re-evaluating direction mid-gesture
 *   let a scroll flip into a dismiss halfway through.)
 * - The scroller's position is read at classification time, not at
 *   touchstart, so content scrolled within the gesture counts.
 * - A dismiss drag reversed above its start clamps the sheet at home
 *   and keeps consuming the gesture: iOS ignores a switch back to
 *   native scrolling once moves have been preventDefault'ed, so
 *   flipping intent there would just leave a dead gesture.
 */

/** Dismiss when dragged past this fraction of the sheet height... */
export const DISMISS_FRACTION = 0.35;
/** ...or flicked faster than this (px/ms) with meaningful travel. */
export const DISMISS_VELOCITY = 0.55;
export const DISMISS_MIN_TRAVEL = 24;
/** Movement (px) required before a gesture's intent is classified. */
export const INTENT_SLOP = 8;

export type SheetDragIntent = "undecided" | "scroll" | "dismiss";

export interface SheetDragState {
  readonly startY:   number;
  readonly lastY:    number;
  readonly lastT:    number;
  readonly dy:       number;
  readonly velocity: number;
  readonly intent:   SheetDragIntent;
}

export interface SheetDragMoveEffect {
  readonly state: SheetDragState;
  /** px to translate the sheet this frame; null = leave native scroll alone. */
  readonly translateY: number | null;
  readonly preventDefault: boolean;
}

export type SheetDragRelease = "dismiss" | "settle" | "none";

export function dragStart(y: number, t: number): SheetDragState {
  return { startY: y, lastY: y, lastT: t, dy: 0, velocity: 0, intent: "undecided" };
}

export function dragMove(
  state: SheetDragState,
  y: number,
  t: number,
  scrollTop: number,
): SheetDragMoveEffect {
  const dy = y - state.startY;

  let intent = state.intent;
  if (intent === "undecided") {
    if (Math.abs(dy) < INTENT_SLOP) {
      return { state: { ...state, dy }, translateY: null, preventDefault: false };
    }
    intent = dy > 0 && scrollTop <= 0 ? "dismiss" : "scroll";
  }

  if (intent === "scroll") {
    return {
      state: { ...state, dy, intent },
      translateY: null,
      preventDefault: false,
    };
  }

  const dt = t - state.lastT;
  const velocity = dt > 0 ? (y - state.lastY) / dt : state.velocity;
  return {
    state: { ...state, dy, intent, lastY: y, lastT: t, velocity },
    translateY: Math.max(0, dy),
    preventDefault: true,
  };
}

export function dragEnd(
  state: SheetDragState,
  sheetHeight: number,
): SheetDragRelease {
  if (state.intent !== "dismiss") return "none";

  const h = sheetHeight || 1;
  const shouldDismiss =
    state.dy > h * DISMISS_FRACTION ||
    (state.velocity > DISMISS_VELOCITY && state.dy > DISMISS_MIN_TRAVEL);

  return shouldDismiss ? "dismiss" : "settle";
}
