import { describe, test, expect } from "vitest";
import {
  dragStart,
  dragMove,
  dragEnd,
  INTENT_SLOP,
  DISMISS_MIN_TRAVEL,
  type SheetDragState,
} from "../sheet-drag";

/** Walk a gesture through a series of moves, returning the final state. */
function run(
  state: SheetDragState,
  moves: Array<{ y: number; t: number; scrollTop: number }>,
): SheetDragState {
  let s = state;
  for (const m of moves) {
    s = dragMove(s, m.y, m.t, m.scrollTop).state;
  }
  return s;
}

describe("intent classification", () => {
  test("downward pull with list at top becomes a dismiss drag", () => {
    const s = dragStart(300, 0);
    const fx = dragMove(s, 300 + INTENT_SLOP + 1, 16, 0);

    expect(fx.state.intent).toBe("dismiss");
    expect(fx.preventDefault).toBe(true);
    expect(fx.translateY).toBeGreaterThan(0);
  });

  test("downward pull while list is scrolled stays a native scroll", () => {
    const s = dragStart(300, 0);
    const fx = dragMove(s, 300 + INTENT_SLOP + 1, 16, 240);

    expect(fx.state.intent).toBe("scroll");
    expect(fx.preventDefault).toBe(false);
    expect(fx.translateY).toBeNull();
  });

  test("upward move is a scroll even when the list is at top", () => {
    const s = dragStart(300, 0);
    const fx = dragMove(s, 300 - INTENT_SLOP - 1, 16, 0);

    expect(fx.state.intent).toBe("scroll");
    expect(fx.preventDefault).toBe(false);
  });

  test("movement within the slop stays undecided and untouched", () => {
    const s = dragStart(300, 0);
    const fx = dragMove(s, 300 + INTENT_SLOP - 1, 16, 0);

    expect(fx.state.intent).toBe("undecided");
    expect(fx.preventDefault).toBe(false);
    expect(fx.translateY).toBeNull();
  });
});

describe("intent is locked for the rest of the gesture", () => {
  test("scroll-up then reverse below start does NOT become a dismiss", () => {
    // The reported bug: scroll the list within one gesture, reverse
    // direction, and the sheet started sliding closed mid-scroll.
    const s0 = dragStart(300, 0);
    const s1 = run(s0, [
      { y: 200, t: 16, scrollTop: 0 },   // classified as scroll
      { y: 100, t: 32, scrollTop: 100 }, // list scrolled natively
      { y: 350, t: 48, scrollTop: 0 },   // reversed past start, back at top
    ]);
    const fx = dragMove(s1, 400, 64, 0);

    expect(fx.state.intent).toBe("scroll");
    expect(fx.preventDefault).toBe(false);
    expect(fx.translateY).toBeNull();
  });

  test("dismiss drag reversed above start clamps at home, stays a drag", () => {
    const s0 = dragStart(300, 0);
    const s1 = dragMove(s0, 400, 16, 0).state; // dismiss drag begins
    const fx = dragMove(s1, 250, 32, 0);       // reversed above start

    expect(fx.state.intent).toBe("dismiss");
    expect(fx.translateY).toBe(0);
    // Keep consuming the gesture — flipping back to native scroll
    // mid-gesture is ignored by iOS and leaves a dead gesture.
    expect(fx.preventDefault).toBe(true);
  });
});

describe("release outcomes", () => {
  const HEIGHT = 700;

  test("scroll gestures release with no sheet action", () => {
    const s0 = dragStart(300, 0);
    const s1 = dragMove(s0, 200, 16, 0).state;

    expect(dragEnd(s1, HEIGHT)).toBe("none");
  });

  test("undecided (tap-like) gestures release with no sheet action", () => {
    expect(dragEnd(dragStart(300, 0), HEIGHT)).toBe("none");
  });

  test("drag past the height fraction dismisses", () => {
    const s0 = dragStart(100, 0);
    const s1 = run(s0, [
      { y: 200, t: 50, scrollTop: 0 },
      { y: 400, t: 300, scrollTop: 0 }, // slow: dy=300 > 700*0.35=245
    ]);

    expect(dragEnd(s1, HEIGHT)).toBe("dismiss");
  });

  test("fast flick with real travel dismisses", () => {
    const s0 = dragStart(100, 0);
    const s1 = run(s0, [
      { y: 120, t: 16, scrollTop: 0 },
      { y: 100 + DISMISS_MIN_TRAVEL + 20, t: 48, scrollTop: 0 }, // ~1.4 px/ms
    ]);

    expect(dragEnd(s1, HEIGHT)).toBe("dismiss");
  });

  test("short slow drag settles back", () => {
    const s0 = dragStart(100, 0);
    const s1 = run(s0, [
      { y: 140, t: 100, scrollTop: 0 },
      { y: 180, t: 400, scrollTop: 0 }, // dy=80, slow
    ]);

    expect(dragEnd(s1, HEIGHT)).toBe("settle");
  });
});
