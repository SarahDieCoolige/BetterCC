// Tests for the sidebar merge logic (cross-channel pinned users, spec
// §Sidebar Behavior / §Merge rules). Pure functions in src/sidebar.ts:
//
//   mergeUserlists(current, globalChannels, pinned)  — cha_my wins for the
//     current channel; pinned users from aw.js are added only when NOT already
//     present in cha_my (by user key).
//
//   abbrevChannels(channels) — collision-aware channel abbreviations for the
//     cross-channel badges (Herzklopfen → "Her", Herzschmerz → "Herz").
//
// No DOM in this suite (vitest runs without jsdom) — only the pure pieces are
// pinned here; the DOM rendering (badge <span>, diff-and-patch) is exercised
// manually via the dev server.

import { describe, it, expect } from "vitest";
import { mergeUserlists, abbrevChannels, type User } from "../src/sidebar";

function user(name: string, overrides: Partial<User> = {}): User {
  return {
    name,
    key: name.toLowerCase(),
    registered: false,
    guest: false,
    sep: false,
    away: false,
    ...overrides,
  };
}

// ─── mergeUserlists — cha_my wins, pinned cross-channel users added ─────────

describe("mergeUserlists — current-channel + pinned cross-channel users", () => {
  it("maps every current-channel user to channel null", () => {
    const current = [user("Alice"), user("Bob")];
    const merged = mergeUserlists(current, new Map(), new Set());
    expect(merged).toEqual([
      { user: current[0], channel: null },
      { user: current[1], channel: null },
    ]);
  });

  it("adds pinned users from other channels with their channel name", () => {
    const current = [user("Alice")];
    const globalChannels = new Map([
      ["Erotik", [user("Bob")]],
      ["Women-Corner", [user("Cara"), user("Dave")]], // Dave is unpinned
    ]);
    const merged = mergeUserlists(current, globalChannels, new Set(["bob", "cara"]));
    expect(merged).toHaveLength(3);
    expect(merged).toContainEqual({ user: current[0], channel: null });
    expect(merged).toContainEqual({ user: user("Bob"), channel: "Erotik" });
    expect(merged).toContainEqual({ user: user("Cara"), channel: "Women-Corner" });
  });

  it("does not add unpinned cross-channel users", () => {
    const merged = mergeUserlists(
      [],
      new Map([["Erotik", [user("Bob"), user("Dave")]]]),
      new Set(["dave"]),
    );
    expect(merged).toEqual([{ user: user("Dave"), channel: "Erotik" }]);
  });

  it("never duplicates a current-channel user from the global snapshot — cha_my wins", () => {
    // The same user is in cha_my (with real status flags) AND in the aw.js
    // snapshot (neutral). cha_my is authoritative: the entry appears once,
    // carrying the cha_my data — the aw.js copy is discarded.
    const current = [user("Alice", { away: true })];
    const globalChannels = new Map([["Erotik", [user("Alice")]]]);
    const merged = mergeUserlists(current, globalChannels, new Set(["alice"]));
    expect(merged).toEqual([{ user: current[0], channel: null }]);
  });

  it("adds a pinned user listed in multiple channels only once (first channel wins)", () => {
    const globalChannels = new Map([
      ["Erotik", [user("Dave")]],
      ["Women-Corner", [user("Dave")]],
    ]);
    const merged = mergeUserlists([], globalChannels, new Set(["dave"]));
    expect(merged).toEqual([{ user: user("Dave"), channel: "Erotik" }]);
  });

  it("returns pinned cross-channel users even with an empty current list", () => {
    const merged = mergeUserlists([], new Map([["Erotik", [user("Bob")]]]), new Set(["bob"]));
    expect(merged).toEqual([{ user: user("Bob"), channel: "Erotik" }]);
  });

  it("returns [] when nothing matches (no current users, no pinned cross-channel users)", () => {
    const merged = mergeUserlists([], new Map([["Erotik", [user("Bob")]]]), new Set(["nobody"]));
    expect(merged).toEqual([]);
  });
});

// ─── abbrevChannels — collision-aware badge abbreviations ───────────────────

describe("abbrevChannels — channel abbreviation badges with collision indices", () => {
  it("keeps the base abbreviation for channels with distinct bases", () => {
    const badges = abbrevChannels(["Erotik", "Women-Corner", "MOD"]);
    expect(badges.get("Erotik")).toBe("Ero");
    expect(badges.get("Women-Corner")).toBe("WoCo");
    expect(badges.get("MOD")).toBe("MOD");
  });

  it("uses the hardcoded badge names for known channels even when they share a word stem", () => {
    const badges = abbrevChannels(["Herzklopfen", "Herzschmerz"]);
    expect(badges.get("Herzklopfen")).toBe("HerzK");
    expect(badges.get("Herzschmerz")).toBe("HerzS");
  });

  it("still extends progressively on a three-way collision for unknown channels", () => {
    // Indices are assigned in sorted channel order: Herzchen (0), Herzklopfen
    // and Herzschmerz are hardcoded, so only Herzchen uses the fallback shape.
    const badges = abbrevChannels(["Herzklopfen", "Herzschmerz", "Herzchen"]);
    expect(badges.get("Herzchen")).toBe("Her");
    expect(badges.get("Herzklopfen")).toBe("HerzK");
    expect(badges.get("Herzschmerz")).toBe("HerzS");
  });

  it("does not treat digit-suffixed channels as collisions (Erotik vs Erotik2)", () => {
    const badges = abbrevChannels(["Erotik", "Erotik2", "Erotik3"]);
    expect(badges.get("Erotik")).toBe("Ero");
    expect(badges.get("Erotik2")).toBe("Ero2");
    expect(badges.get("Erotik3")).toBe("Ero3");
  });

  it("assigns indices in sorted channel order (deterministic regardless of input order)", () => {
    const a = abbrevChannels(["Herzschmerz", "Herzklopfen"]);
    const b = abbrevChannels(["Herzklopfen", "Herzschmerz"]);
    expect(a.get("Herzklopfen")).toBe("HerzK");
    expect(a.get("Herzschmerz")).toBe("HerzS");
    expect(b.get("Herzklopfen")).toBe("HerzK");
    expect(b.get("Herzschmerz")).toBe("HerzS");
  });

  it("dedupes duplicate channel names", () => {
    const badges = abbrevChannels(["Erotik", "Erotik"]);
    expect(badges.size).toBe(1);
    expect(badges.get("Erotik")).toBe("Ero");
  });

  it("returns an empty map for no channels", () => {
    expect(abbrevChannels([]).size).toBe(0);
  });
});
