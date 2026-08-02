// Tests for the sidebar status helpers (pure functions in src/v3/sidebar.ts).
//
// Status is encoded across THREE orthogonal signals so each is glanceable:
//   - DOT   → sep only. Sep = amber filled dot; everyone else = green dot.
//   - NAME  → away state. Away = dimmed name; present = normal name.
//   - [G]   → guest. A guest name renders with a " [G]" suffix; registered none.
//
// This separation means away and sep never compete for the same signal: a
// sep+away user has BOTH an amber dot AND a dimmed name. Guests are tagged in
// the text, not the dot.

import { describe, it, expect } from "vitest";
import { statusDotClass, isGuestTag, getStatusClasses, type User } from "../src/sidebar";

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

// ─── statusDotClass (dot = sep only) ───────────────────────────────────────

describe("statusDotClass — dot reflects ONLY sep", () => {
  it("returns the online class for a present non-sep user", () => {
    expect(statusDotClass(user())).toBe("bcc-dot-online");
  });

  it("returns the sep class for a sep user", () => {
    expect(statusDotClass(user({ sep: true }))).toBe("bcc-dot-sep");
  });

  it("returns the online class for an AWAY user (away is in the name, not the dot)", () => {
    expect(statusDotClass(user({ away: true }))).toBe("bcc-dot-online");
  });

  it("returns the online class for a GUEST (guest is a [G] tag, not the dot)", () => {
    expect(statusDotClass(user({ guest: true }))).toBe("bcc-dot-online");
  });

  it("returns the sep class for a sep+away user (sep wins the dot; away still dims the name)", () => {
    expect(statusDotClass(user({ sep: true, away: true }))).toBe("bcc-dot-sep");
  });
});

// ─── isGuest (drives the separate 'gast' chip element, not name text) ──────

describe("isGuestTag — whether the row should show a 'gast' chip", () => {
  it("returns false for a registered user (no chip)", () => {
    expect(isGuestTag(user())).toBe(false);
  });

  it("returns true for a guest (chip renders)", () => {
    expect(isGuestTag(user({ guest: true }))).toBe(true);
  });

  it("returns true for a guest even when away/sep (tier is independent)", () => {
    expect(isGuestTag(user({ guest: true, away: true }))).toBe(true);
    expect(isGuestTag(user({ guest: true, sep: true }))).toBe(true);
  });
});

// ─── getStatusClasses (row-level: away/sep opacity+italic) ─────────────────

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
    expect(getStatusClasses(user({ sep: true, away: true }))).toBe("bcc-userrow bcc-away bcc-sep");
  });
});
