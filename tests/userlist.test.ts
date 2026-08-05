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
import {
  parseUserlist,
  diffUserlists,
  sortUsers,
  parseAw,
  channelAbbrev,
  type User,
} from "../src/userlist";

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
    names.map((n) => ({
      name: n,
      key: n.toLowerCase(),
      registered: true,
      guest: false,
      sep: false,
      away: false,
    }));

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
    const newList: User[] = [
      { name: "X", key: "x", registered: true, guest: false, sep: false, away: true },
    ];
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

// ─── parseAw — aw.js JS source → Map<channel, User[]> ───────────────────────

describe("parseAw — aw.js JS source → Map<channel, User[]>", () => {
  it("parses 3-element stride tuples (channel, count, user list) into a map", () => {
    // Real aw.js shape: each tuple is "channel","count","name name ..." and the
    // user list string carries a trailing space; the array ends with "").
    const raw = [
      'var cha = new Array(',
      '"MOD","1","TestUser ",',
      '"Chatcity","1","SomeGuest^12345 ",',
      '"Erotik","2","Beta01_ GastUser ",',
      '"");',
    ].join("\n");
    const map = parseAw(raw);
    expect(map.size).toBe(3);
    expect([...map.keys()]).toEqual(["MOD", "Chatcity", "Erotik"]);
    expect(map.get("MOD")).toEqual([
      {
        name: "TestUser",
        key: "testuser",
        registered: false,
        guest: false,
        sep: false,
        away: false,
      },
    ]);
    expect(map.get("Chatcity")).toEqual([
      {
        name: "SomeGuest",
        key: "someguest",
        registered: false,
        guest: true,
        sep: false,
        away: false,
      },
    ]);
    expect(map.get("Erotik")).toEqual([
      {
        name: "Beta01_",
        key: "beta01_",
        registered: false,
        guest: false,
        sep: false,
        away: false,
      },
      {
        name: "GastUser",
        key: "gastuser",
        registered: false,
        guest: false,
        sep: false,
        away: false,
      },
    ]);
  });

  it("strips the ^id guest suffix and sets guest: true", () => {
    const map = parseAw('var cha = new Array("Chatcity","2","SomeGuest^12345 OtherGuest^678 ","");');
    expect(map.get("Chatcity")).toEqual([
      { name: "SomeGuest", key: "someguest", registered: false, guest: true, sep: false, away: false },
      { name: "OtherGuest", key: "otherguest", registered: false, guest: true, sep: false, away: false },
    ]);
  });

  it("marks users without ^id as neutral (all status flags false)", () => {
    // aw.js has no status flags — only the ^id suffix tells guest status.
    // Everyone else is neutral, even though they may actually be registered.
    const map = parseAw('var cha = new Array("EroRsp","2","Alpha Beta ","");');
    expect(map.get("EroRsp")).toEqual([
      { name: "Alpha", key: "alpha", registered: false, guest: false, sep: false, away: false },
      { name: "Beta", key: "beta", registered: false, guest: false, sep: false, away: false },
    ]);
  });

  it("keeps empty channels in the map with an empty user array", () => {
    const map = parseAw('var cha = new Array("Zauberwald","0","","Baklava","0","","");');
    expect(map.get("Zauberwald")).toEqual([]);
    expect(map.get("Baklava")).toEqual([]);
    expect(map.size).toBe(2);
  });

  it("stops at the empty-string terminator and ignores trailing garbage", () => {
    const raw = 'var cha = new Array("Erotik","1","Beta ","","Ghost","1","Nobody ","");';
    const map = parseAw(raw);
    expect(map.size).toBe(1);
    expect(map.has("Ghost")).toBe(false);
  });

  it("handles the <!--Tabelle--> comment that sits inside the real array literal", () => {
    const raw = [
      "var cha = new Array(",
      "<!--Tabelle-->",
      '"MOD","1","TestUser ",',
      '"Chatcity","1","SomeGuest^12345 ",',
      '"");',
    ].join("\n");
    const map = parseAw(raw);
    expect(map.size).toBe(2);
    expect(map.get("MOD")).toHaveLength(1);
    expect(map.get("Chatcity")).toEqual([
      { name: "SomeGuest", key: "someguest", registered: false, guest: true, sep: false, away: false },
    ]);
  });

  it("returns an empty map for non-aw.js input", () => {
    expect(parseAw("")).toEqual(new Map());
    expect(parseAw("var x = 42;")).toEqual(new Map());
    expect(parseAw("no array literal here")).toEqual(new Map());
  });
});

// ─── channelAbbrev — unified abbreviation (spec §abbreviation) ─────────────

describe("channelAbbrev — unified abbreviation (hyphens, digits, collisions)", () => {
  it("abbreviates to the first 3 chars with the first letter capitalized", () => {
    expect(channelAbbrev("Erotik", 0)).toBe("Ero");
    expect(channelAbbrev("Chatcity", 0)).toBe("Cha");
    expect(channelAbbrev("nerdkultur", 0)).toBe("Ner");
  });

  it("returns names of length ≤ 3 unchanged", () => {
    expect(channelAbbrev("MOD", 0)).toBe("MOD");
    expect(channelAbbrev("ab", 0)).toBe("ab");
  });

  it("strips hyphens before abbreviating", () => {
    expect(channelAbbrev("Women-Corner", 0)).toBe("Wom");
    expect(channelAbbrev("Bizarre-Talk", 0)).toBe("Biz");
    expect(channelAbbrev("Gay-Cruising", 0)).toBe("Gay");
    expect(channelAbbrev("Man-Street", 0)).toBe("Man");
  });

  it("preserves a trailing digit by replacing the third char", () => {
    expect(channelAbbrev("Erotik2", 0)).toBe("Er2");
    expect(channelAbbrev("Erotik3", 0)).toBe("Er3");
    expect(channelAbbrev("Erotik4", 0)).toBe("Er4");
    // Multi-digit suffixes are preserved wholesale.
    expect(channelAbbrev("Chat24", 0)).toBe("Ch24");
  });

  it("extends by one char per index to resolve collisions", () => {
    // Both share the "Her" base — index 0 alone would collide.
    expect(channelAbbrev("Herzklopfen", 0)).toBe("Her");
    expect(channelAbbrev("Herzschmerz", 0)).toBe("Her");
    // index 1 extends the second channel by one char → "Herz".
    expect(channelAbbrev("Herzschmerz", 1)).toBe("Herz");
    // Extension also applies to any channel when asked for.
    expect(channelAbbrev("Erotik", 1)).toBe("Erot");
  });

  it("ignores out-of-range or non-positive indexes", () => {
    expect(channelAbbrev("Erotik", 5)).toBe("Ero"); // 5 ≥ length-2 → no extension
    expect(channelAbbrev("Erotik", -1)).toBe("Ero");
  });

  it("handles camelCase names by using first-2-chars + internal capitals", () => {
    // EroRsp is the only real channel with genuine camelCase (no hyphens).
    // Its abbreviation should be "ErR", not "Ero" — the internal capital 'R'
    // is the distinguishing feature, and "Ero" would collide with Erotik.
    expect(channelAbbrev("EroRsp", 0)).toBe("ErR");
    // Non-hyphenated names without internal capitals still use truncation.
    expect(channelAbbrev("Erotik", 0)).toBe("Ero");
  });

  it("abbreviates all 26 real channels from aw.js", () => {
    // Channel list straight from https://images.chatcity.de/script/aw.js.
    // Herzschmerz carries index 1 — it collides with Herzklopfen at index 0.
    // EroRsp uses camelCase initials ("ErR") — no collision with Erotik.
    const channels: Array<[string, number, string]> = [
      ["MOD", 0, "MOD"],
      ["Registriert", 0, "Reg"],
      ["Chatcity", 0, "Cha"],
      ["Zauberwald", 0, "Zau"],
      ["Bizarre-Talk", 0, "Biz"],
      ["Herzklopfen", 0, "Her"],
      ["Knuddelecke", 0, "Knu"],
      ["Hexensabbat", 0, "Hex"],
      ["Bluemchensex", 0, "Blu"],
      ["Man-Street", 0, "Man"],
      ["Fortysomething", 0, "For"],
      ["Trauminsel", 0, "Tra"],
      ["Streik-Channel", 0, "Str"],
      ["Goldenfifty", 0, "Gol"],
      ["Herzschmerz", 1, "Herz"],
      ["nerdkultur", 0, "Ner"],
      ["query", 0, "Que"],
      ["Gay-Cruising", 0, "Gay"],
      ["Women-Corner", 0, "Wom"],
      ["EroRsp", 0, "ErR"],
      ["Erotik", 0, "Ero"],
      ["Erotik2", 0, "Er2"],
      ["Erotik3", 0, "Er3"],
      ["Erotik4", 0, "Er4"],
      ["International", 0, "Int"],
      ["Baklava", 0, "Bak"],
    ];
    for (const [name, index, expected] of channels) {
      expect(channelAbbrev(name, index)).toBe(expected);
    }
  });
});
