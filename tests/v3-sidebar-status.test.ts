// Tests for the sidebar status helpers (pure functions in src/v3/sidebar.ts).
//
// getStatusText and getStatusClasses translate a User's status flags into the
// row's text prefix and CSS class list. They're pure and exported, but were
// uncovered until now — these tests pin their precedence and output shape.

import { describe, it, expect } from "vitest";
import { getStatusText, getStatusClasses, type User } from "../src/v3/sidebar";

function user(overrides: Partial<User> = {}): User {
  return {
    name: "TestUser",
    registered: true,
    guest: false,
    sep: false,
    away: false,
    ...overrides,
  };
}

// ─── getStatusText ─────────────────────────────────────────────────────────

describe("getStatusText — text prefix for a user row", () => {
  it("returns empty string for a present (non-away, non-sep) user", () => {
    expect(getStatusText(user())).toBe("");
  });

  it("returns [A] prefix for an away user", () => {
    expect(getStatusText(user({ away: true }))).toBe("[A] ");
  });

  it("returns [S] prefix for a sep user", () => {
    expect(getStatusText(user({ sep: true }))).toBe("[S] ");
  });

  it("prefers [S] over [A] when both flags are set (sep wins)", () => {
    // Matches buildRow's getStatusText call: the if/else chain checks sep
    // first, so a sep+away user shows [S] not [A].
    expect(getStatusText(user({ sep: true, away: true }))).toBe("[S] ");
  });
});

// ─── getStatusClasses ──────────────────────────────────────────────────────

describe("getStatusClasses — CSS class list for a user row", () => {
  it("returns only the base class for a present user", () => {
    expect(getStatusClasses(user())).toBe("bcc-userrow");
  });

  it("adds bcc-away for an away user", () => {
    expect(getStatusClasses(user({ away: true }))).toBe("bcc-userrow bcc-away");
  });

  it("adds bcc-sep for a sep user", () => {
    expect(getStatusClasses(user({ sep: true }))).toBe("bcc-userrow bcc-sep");
  });

  it("adds both modifiers when both flags are set (order: away then sep)", () => {
    // Unlike getStatusText (which is exclusive), getStatusClasses is additive —
    // a sep+away user gets both classes. Pin the order so CSS specificity stays
    // predictable.
    expect(getStatusClasses(user({ sep: true, away: true }))).toBe(
      "bcc-userrow bcc-away bcc-sep",
    );
  });
});
