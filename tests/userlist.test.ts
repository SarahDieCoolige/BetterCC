// Tests for the v3 userlist parser/differ/sorter (spec §2.4).
//
// Source data is unsafeWindow.cha / cha_my: a flat array of alternating
// [name, status, name, status, ..., ""] pairs, terminated by an empty string.
// Status flags (combinable substrings): "hR" registered, "h" guest, "S" sep,
// "A" away — e.g. "hRS" = registered + sep.
//
// The parse/diff/sort logic is pure (array in, array out, no DOM/WS/GM), so it
// is the bulk of the testable data-layer surface. The store-wiring
// (override set_uinfo1, emit) is a thin shim, not unit-tested here.

import { describe, it, expect } from "vitest";
import { parseUserlist, diffUserlists, sortUsers, type User } from "../src/userlist";

// ─── parseUserlist ─────────────────────────────────────────────────────────

describe("parseUserlist — cha_my flat array → User[]", () => {
  it("parses alternating name/status pairs into User objects", () => {
    const chaMy = ["CoolerNick", "hR", "GastUser", "h", ""];
    const users = parseUserlist(chaMy);
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({
      name: "CoolerNick",
      key: "coolernick",
      registered: true,
      guest: false,
      sep: false,
      away: false,
    });
    expect(users[1]).toEqual({
      name: "GastUser",
      key: "gastuser",
      registered: false,
      guest: true,
      sep: false,
      away: false,
    });
  });

  it("stops at the empty-string terminator (ignores trailing garbage)", () => {
    const chaMy = ["Alpha", "hR", "", "hR", "Ghost", "hR"];
    expect(parseUserlist(chaMy)).toHaveLength(1);
  });

  it("decodes combinable status flags (hRS = registered + sep)", () => {
    const users = parseUserlist(["Mod", "hRS", "AwayOne", "hRA", "SepAway", "hSA", ""]);
    expect(users[0]).toMatchObject({ name: "Mod", registered: true, sep: true });
    expect(users[1]).toMatchObject({ name: "AwayOne", registered: true, away: true });
    // "hSA" has the guest tier "h" without registered "R" → guest; sep + away too.
    expect(users[2]).toMatchObject({
      name: "SepAway",
      guest: true,
      registered: false,
      sep: true,
      away: true,
    });
  });

  it("returns [] for an empty or terminator-only array", () => {
    expect(parseUserlist([])).toEqual([]);
    expect(parseUserlist([""])).toEqual([]);
    expect(parseUserlist(["", "hR"])).toEqual([]);
  });

  it("treats an odd trailing name (no status) as a complete user with no flags", () => {
    // Real upstream always pairs, but the parser must not throw on a dangling name.
    const users = parseUserlist(["Solo", ""]);
    expect(users).toEqual([
      { name: "Solo", key: "solo", registered: false, guest: false, sep: false, away: false },
    ]);
  });
});

// ─── diffUserlists ─────────────────────────────────────────────────────────

describe("diffUserlists — {added, removed} by name", () => {
  const mk = (names: string[]): User[] =>
    names.map((n) => ({ name: n, key: n.toLowerCase(), registered: true, guest: false, sep: false, away: false }));

  it("reports users present in new but not old as added", () => {
    const d = diffUserlists(mk(["A", "B"]), mk(["A", "B", "C"]));
    expect(d.added).toEqual(["C"]);
    expect(d.removed).toEqual([]);
  });

  it("reports users present in old but not new as removed", () => {
    const d = diffUserlists(mk(["A", "B", "C"]), mk(["A", "C"]));
    expect(d.removed).toEqual(["B"]);
    expect(d.added).toEqual([]);
  });

  it("handles simultaneous add and remove", () => {
    const d = diffUserlists(mk(["A", "B"]), mk(["B", "C"]));
    expect(d.added).toEqual(["C"]);
    expect(d.removed).toEqual(["A"]);
  });

  it("no changes → empty added and removed", () => {
    const d = diffUserlists(mk(["A", "B"]), mk(["B", "A"]));
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it("diffs by name regardless of status changes (status is re-rendered, not a diff key)", () => {
    const oldList: User[] = [
      { name: "X", key: "x", registered: true, guest: false, sep: false, away: false },
    ];
    const newList: User[] = [{ name: "X", key: "x", registered: true, guest: false, sep: false, away: true }];
    const d = diffUserlists(oldList, newList);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

// ─── sortUsers — German-umlaut-aware, pinned-to-top ────────────────────────

describe("sortUsers — German-umlaut sort with pinned-to-top", () => {
  it("sorts names alphabetically with German locale (ä/ö/ü near their base vowel)", () => {
    const users = parseUserlist([
      "Zebra",
      "hR",
      "Aaron",
      "hR",
      "Ägid",
      "hR",
      "Ober",
      "hR",
      "Öster",
      "hR",
      "Maus",
      "hR",
      "über",
      "hR",
      "",
    ]);
    const sorted = sortUsers(users, new Set()).map((u) => u.name);
    // German DIN-style: ä≈a, ö≈o, ü≈u — Ägid follows Aaron, Öster follows Ober, über follows u-base.
    expect(sorted).toEqual(["Aaron", "Ägid", "Maus", "Ober", "Öster", "über", "Zebra"]);
  });

  it("is case-insensitive", () => {
    const users = parseUserlist(["bob", "hR", "Alice", "hR", "charlie", "hR", "Beta", "hR", ""]);
    expect(sortUsers(users, new Set()).map((u) => u.name)).toEqual([
      "Alice",
      "Beta",
      "bob",
      "charlie",
    ]);
  });

  it("pinned users sort to the very top, ahead of all unpinned", () => {
    const users = parseUserlist(["Zorro", "hR", "Alice", "hR", "Middle", "hR", "Aaron", "hR", ""]);
    const pinned = new Set(["zorro", "aaron"]);
    const sorted = sortUsers(users, pinned).map((u) => u.name);
    // Pinned first (themselves sorted), then the rest sorted.
    expect(sorted).toEqual(["Aaron", "Zorro", "Alice", "Middle"]);
  });

  it("pinned section sorts internally, then unpinned section sorts internally", () => {
    const users = parseUserlist(["P2", "hR", "U2", "hR", "P1", "hR", "U1", "hR", ""]);
    const sorted = sortUsers(users, new Set(["p2", "p1"]));
    expect(sorted.map((u) => u.name)).toEqual(["P1", "P2", "U1", "U2"]);
  });

  it("empty pinned set → plain alphabetical", () => {
    const users = parseUserlist(["Charlie", "hR", "Alpha", "hR", "Bravo", "hR", ""]);
    expect(sortUsers(users, new Set()).map((u) => u.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("pins users by key (lowercase) so mixed-case names match pinned set", () => {
    // User name is "Sariam" (capital S), pinned set has the lowercased key "sariam".
    // sortUsers must match via user.key, not user.name, so the mixed-case name
    // still lands in the pinned section.
    const users = parseUserlist(["Sariam", "hR", "Beta", "hR", "alpha", "hR", ""]);
    const pinned = new Set(["sariam"]);
    const sorted = sortUsers(users, pinned).map((u) => u.name);
    expect(sorted).toEqual(["Sariam", "alpha", "Beta"]);
  });
});
