// Tests for chat.ts: the pure scroll-event classifier behind the
// autoscroll banner.
//
// Zero imports from the store, DOM, or upstream. The decision only ranks
// user direction while geometry is stable: a zoom or window resize shifts
// scrollTop and scrollHeight together, and reading that reflow as a
// scroll-up would trip the banner without user intent. The 1px tolerance
// mirrors the banner's own at-bottom check.

import { describe, it, expect } from "vitest";
import { scrollEventDecision } from "../src/chat";

// ─── Up ────────────────────────────────────────────────────────────────

describe("scrollEventDecision — up", () => {
  it("ranks up when st < lastSt and maxScroll unchanged", () => {
    expect(scrollEventDecision(100, 200, 500, 500)).toBe("up");
  });

  it("still ranks up when at the bottom (the caller's at-bottom check handles it)", () => {
    expect(scrollEventDecision(499, 500, 500, 500)).toBe("up");
  });
});

// ─── Down ──────────────────────────────────────────────────────────────

describe("scrollEventDecision — down", () => {
  it("ranks down when st >= lastSt and maxScroll unchanged", () => {
    expect(scrollEventDecision(300, 200, 500, 500)).toBe("down");
  });

  it("ranks down when st equals lastSt (no movement is not a reflow)", () => {
    expect(scrollEventDecision(200, 200, 500, 500)).toBe("down");
  });
});

// ─── Resync: maxScroll grew ─────────────────────────────────────────────

describe("scrollEventDecision — resync on maxScroll grown", () => {
  it("ranks resync when maxScroll grew, regardless of direction", () => {
    expect(scrollEventDecision(100, 200, 600, 500)).toBe("resync");
  });
});

// ─── Resync: maxScroll shrank ───────────────────────────────────────────

describe("scrollEventDecision — resync on maxScroll shrank", () => {
  it("ranks resync when maxScroll shrank, regardless of direction", () => {
    expect(scrollEventDecision(200, 100, 400, 500)).toBe("resync");
  });
});

// ─── Tolerance ──────────────────────────────────────────────────────────

describe("scrollEventDecision — tolerance", () => {
  it("treats a 1px maxScroll difference as unchanged (directional)", () => {
    expect(scrollEventDecision(100, 200, 500, 501)).toBe("up");
    expect(scrollEventDecision(200, 100, 500, 501)).toBe("down");
    expect(scrollEventDecision(100, 200, 500, 499)).toBe("up");
  });

  it("treats a 2px difference as a real reflow", () => {
    expect(scrollEventDecision(100, 200, 500, 498)).toBe("resync");
  });
});

// ─── Resync wins over direction ─────────────────────────────────────────

describe("scrollEventDecision — any st during resync", () => {
  it("a zoom-like shift (st down, max down) is resync, not a scroll-up", () => {
    // zooming out moves st and maxScroll together; this must never read as "up"
    expect(scrollEventDecision(50, 300, 400, 500)).toBe("resync");
  });

  it("resync wins even when st < lastSt and maxScroll grew", () => {
    expect(scrollEventDecision(100, 200, 500, 600)).toBe("resync");
  });
});
