// Tests for zoom.ts: the pure scroll-fraction helper behind the page-wide
// text zoom.
//
// Zero imports from the store, DOM, or upstream. The fraction anchors the
// chatframe's reading position across a zoom change: the caller scales the
// frame from outside and scrolls it back to the same relative spot, so the
// autoscroll banner never trips on the geometry shift (chat.ts handles the
// reflow-resync for real user scrolls).

import { describe, it, expect } from "vitest";
import { scrollFraction } from "../src/zoom";

// ─── scrollFraction ─────────────────────────────────────────────────────

describe("scrollFraction", () => {
  it("returns 1 when the doc doesn't scroll (max <= 0)", () => {
    expect(scrollFraction(0, 0)).toBe(1);
    expect(scrollFraction(50, -5)).toBe(1);
  });

  it("returns 0 when st is 0", () => {
    expect(scrollFraction(0, 200)).toBe(0);
  });

  it("returns the mid fraction for a mid scroll", () => {
    expect(scrollFraction(100, 200)).toBe(0.5);
  });

  it("clamps to 1 when st exceeds max", () => {
    expect(scrollFraction(250, 200)).toBe(1);
  });

  it("clamps to 0 for negative st", () => {
    expect(scrollFraction(-50, 200)).toBe(0);
  });
});
