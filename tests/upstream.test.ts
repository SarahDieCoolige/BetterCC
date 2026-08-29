// Tests for the upstream getters that carry logic (src/upstream.ts).
// The trivial String() coercions are covered indirectly by the adapter tests
// (session, ulist-poll); isGuest decides the GM storage suffix ("gast" vs
// nick) and the session snapshot, so its flag semantics get pinned here.

import { describe, it, expect, beforeEach } from "vitest";
import { isGuest } from "../src/upstream";

// unsafeWindow is a GM API global — fake it as a plain object.
declare const unsafeWindow: any;
if (!(globalThis as any).unsafeWindow) {
  (globalThis as any).unsafeWindow = {};
}

describe("isGuest", () => {
  beforeEach(() => {
    delete (unsafeWindow as any).chat_ui;
  });

  it("treats any chat_ui without the R flag as guest", () => {
    // "h" is the live guest value (checked 2026-08); the other rows pin that
    // unknown flag combos without "R" stay guests, not just exact "h".
    for (const ui of ["h", "g", "hm", "x"]) {
      (unsafeWindow as any).chat_ui = ui;
      expect(isGuest(), `chat_ui=${ui}`).toBe(true);
    }
  });

  it("treats any chat_ui with the R flag as registered", () => {
    for (const ui of ["hR", "Rh", "R", "Ro"]) {
      (unsafeWindow as any).chat_ui = ui;
      expect(isGuest(), `chat_ui=${ui}`).toBe(false);
    }
  });

  it("defaults to guest when chat_ui is missing", () => {
    expect(isGuest()).toBe(true);
  });
});
