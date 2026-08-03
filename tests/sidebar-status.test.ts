// Tests for the sidebar status helpers (pure functions in src/sidebar.ts).
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
import { getStatusClasses, type User } from "../src/sidebar";

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

// ─── getStatusClasses (row-level: sep/away styling) ────────────────────────

describe("getStatusClasses — CSS class list for a user row", () => {
  it("returns only the base class for a present user", () => {
    expect(getStatusClasses(user())).toBe("bcc-userrow");
  });

  it("returns only the base class for an away user (away dims the name, not the row)", () => {
    expect(getStatusClasses(user({ away: true }))).toBe("bcc-userrow");
  });

  it("adds bcc-sep for a sep user", () => {
    expect(getStatusClasses(user({ sep: true }))).toBe("bcc-userrow bcc-sep");
  });

  it("adds bcc-sep for a sep+away user (sep drives the row class; away is name-only)", () => {
    expect(getStatusClasses(user({ sep: true, away: true }))).toBe("bcc-userrow bcc-sep");
  });
});
