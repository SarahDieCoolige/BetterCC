// Tests for the channel-selector pure parser (src/v3/channel-select.ts).
//
// parseChannels reads the upstream flat arrays (unsafeWindow.ccc / .ccg) and
// returns grouped channels for the header <select>. ccc is a flat 4-tuple array
// (name, flag, groupId, icon) iterated in strides of 4; ccg is (id, label)
// pairs. The arrays are pure data (no side effects), so the parser is fully
// unit-testable against the real fixture values copied in below.

import { describe, it, expect } from "vitest";
import { parseChannels } from "../src/channel-select";

// Real upstream values, copied verbatim from
// dev/fixture/ChatCity Chat_files/corder_kylr.js (so a change to the parser that
// breaks against the real data fails here).
const CCG = [1, "Klassik", 2, "Erotik", 3, "International"];
const CCC = [
  "Registriert",
  1,
  1,
  "userwelcome.gif",
  "Chatcity",
  1,
  1,
  "userwelcome.gif",
  "Zauberwald",
  1,
  1,
  "zauberwald.gif",
  "Bizarre-Talk",
  1,
  1,
  "bizzare.gif",
  "Herzklopfen",
  1,
  1,
  "herzklopfen.gif",
  "Knuddelecke",
  1,
  1,
  "knuddelecke.gif",
  "Hexensabbat",
  1,
  1,
  "userwelcome.gif",
  "Bluemchensex",
  1,
  1,
  "userwelcome.gif",
  "Man-Street",
  1,
  1,
  "userwelcome.gif",
  "Fortysomething",
  1,
  1,
  "userwelcome.gif",
  "Trauminsel",
  1,
  1,
  "trauminsel.gif",
  "Goldenfifty",
  1,
  1,
  "golden50.gif",
  "Herzschmerz",
  1,
  1,
  "herzschmerz.gif",
  "nerdkultur",
  1,
  1,
  "userwelcome.gif",
  "query",
  1,
  1,
  "userwelcome.gif",

  "Erotik",
  1,
  2,
  "erotik.gif",
  "Erotik2",
  1,
  2,
  "erotik2.gif",
  "Erotik3",
  1,
  2,
  "erotik_03.gif",
  "Erotik4",
  1,
  2,
  "erotik_04.gif",
  "Gay-Cruising",
  1,
  2,
  "gaycruising.gif",
  "Women-Corner",
  1,
  2,
  "womencorner.gif",
  "EroRsp",
  1,
  2,
  "erorsp.gif",

  "International",
  1,
  3,
  "userwelcome.gif",
  "Baklava",
  1,
  3,
  "userwelcome.gif",
];

// ─── Happy path: real fixture data ─────────────────────────────────────────

describe("parseChannels — real fixture data", () => {
  it("returns one group per ccg entry, in ccg order", () => {
    const groups = parseChannels(CCC, CCG);
    expect(groups.map((g) => g.label)).toEqual(["Klassik", "Erotik", "International"]);
  });

  it("carries the group id alongside the label", () => {
    const groups = parseChannels(CCC, CCG);
    expect(groups.map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it("collects all Klassik channels into the first group", () => {
    const groups = parseChannels(CCC, CCG);
    expect(groups[0].channels).toEqual([
      "Registriert",
      "Chatcity",
      "Zauberwald",
      "Bizarre-Talk",
      "Herzklopfen",
      "Knuddelecke",
      "Hexensabbat",
      "Bluemchensex",
      "Man-Street",
      "Fortysomething",
      "Trauminsel",
      "Goldenfifty",
      "Herzschmerz",
      "nerdkultur",
      "query",
    ]);
  });

  it("routes Erotik channels to group 2 and International to group 3", () => {
    const groups = parseChannels(CCC, CCG);
    expect(groups[1].channels).toEqual([
      "Erotik",
      "Erotik2",
      "Erotik3",
      "Erotik4",
      "Gay-Cruising",
      "Women-Corner",
      "EroRsp",
    ]);
    expect(groups[2].channels).toEqual(["International", "Baklava"]);
  });
});

// ─── Tolerance: missing / empty / malformed input ──────────────────────────

describe("parseChannels — tolerance", () => {
  it("returns an empty array when either argument is not an array", () => {
    expect(parseChannels(undefined as any, CCG)).toEqual([]);
    expect(parseChannels(CCC, undefined as any)).toEqual([]);
    expect(parseChannels(null as any, null as any)).toEqual([]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(parseChannels([], [])).toEqual([]);
  });

  it("skips tuples whose name is not a non-empty string", () => {
    // 4 tuples: valid, numeric-name (skip), empty-name (skip), valid.
    const ccc = [
      "Good",
      1,
      1,
      "x.gif",
      42,
      1,
      1,
      "x.gif",
      "",
      1,
      1,
      "x.gif",
      "AlsoGood",
      1,
      1,
      "x.gif",
    ];
    const groups = parseChannels(ccc, CCG);
    expect(groups[0].channels).toEqual(["Good", "AlsoGood"]);
  });

  it("skips a trailing partial tuple (length not a multiple of 4)", () => {
    // 4 valid tuples (16 elems) + 2 stray elems that must NOT be read as a tuple.
    const ccc = [
      "A",
      1,
      1,
      "x",
      "B",
      1,
      1,
      "x",
      "C",
      1,
      2,
      "x",
      "D",
      1,
      2,
      "x",
      "stray",
      1, // partial — incomplete tuple
    ];
    const groups = parseChannels(ccc, CCG);
    expect(groups[0].channels).toEqual(["A", "B"]);
    expect(groups[1].channels).toEqual(["C", "D"]);
  });

  it("emits a ccg group even if no channels reference it (empty channel list)", () => {
    const groups = parseChannels([], CCG);
    expect(groups.map((g) => g.label)).toEqual(["Klassik", "Erotik", "International"]);
    expect(groups.every((g) => g.channels.length === 0)).toBe(true);
  });
});
