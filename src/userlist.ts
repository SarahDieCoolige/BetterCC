// ─── v3 userlist: parse / diff / sort (spec §2.4) ──────────────────────────
//
// Source: unsafeWindow.cha / cha_my — a flat array of alternating
// [name, status, name, status, ..., ""] pairs, terminated by an empty string.
// Status flags are combinable substrings: "hR" registered, "h" guest, "S" sep,
// "A" away (e.g. "hRS" = registered + sep).
//
// The parse/diff/sort logic here is pure (array in, array out). The store-
// wiring shim — overriding upstream set_uinfo1 to parse + diff + emit — lives
// separately and is a thin hook (not unit-testable; no jsdom in this suite).

import type { User } from "./store";

// ─── parseUserlist ────────────────────────────────────────────────────────

/**
 * Parse a flat cha_my array into User[]. Stops at the first empty-string entry
 * (the upstream terminator). Status flags are decoded by substring presence:
 * "hR"/"R" → registered, "h" without "R" → guest, "S" → sep, "A" → away.
 */
export function parseUserlist(chaMy: string[]): User[] {
  const users: User[] = [];
  for (let i = 0; i + 1 < chaMy.length; i += 2) {
    const name = chaMy[i];
    if (name === "") break; // terminator — upstream pads beyond this
    const status = chaMy[i + 1] ?? "";
    users.push(decodeStatus(name, status));
  }
  return users;
}

/** Decode combinable status flags into a User's boolean fields. */
function decodeStatus(name: string, status: string): User {
  const registered = status.includes("R");
  // "h" marks the human/guest tier; "hR" is a registered human, so guest is
  // "h" present without the registered "R".
  const guest = status.includes("h") && !registered;
  return {
    name,
    key: name.toLowerCase(),
    registered,
    guest,
    sep: status.includes("S"),
    away: status.includes("A"),
  };
}

// ─── diffUserlists ────────────────────────────────────────────────────────

export interface UserlistDiff {
  added: string[];
  removed: string[];
}

/**
 * Diff two User snapshots by name. Names are unique within a channel, so set
 * difference by name is the diff key — a status change (e.g. user goes away)
 * is NOT an add/remove; the sidebar re-renders the row in place.
 */
export function diffUserlists(oldList: User[], newList: User[]): UserlistDiff {
  const oldNames = new Set(oldList.map((u) => u.name));
  const newNames = new Set(newList.map((u) => u.name));
  const added: string[] = [];
  const removed: string[] = [];
  for (const u of newList) if (!oldNames.has(u.name)) added.push(u.name);
  for (const u of oldList) if (!newNames.has(u.name)) removed.push(u.name);
  return { added, removed };
}

// ─── sortUsers ────────────────────────────────────────────────────────────

const LOCALE = "de";
// Phonebook collation maps ä→ae, ö→oe, ü→ue (DIN 5007-1): the standard German
// ordering where umlauts sort with their base vowel. sensitivity: "base" makes
// it case- and accent-insensitive for the primary ordering.
const SORT_OPTS: Intl.CollatorOptions = {
  sensitivity: "base",
  collation: "phonebk",
};

/**
 * Sort users alphabetically (German, umlaut-aware), pinned-to-top. Pinned users
 * form a leading section (itself sorted), then the unpinned remainder (sorted).
 * Returns a new array; does not mutate the input.
 */
export function sortUsers(users: User[], pinned: Set<string>): User[] {
  const cmp = new Intl.Collator(LOCALE, SORT_OPTS);
  return [...users].sort((a, b) => {
    // Pinned-first partition, then alphabetical within each section.
    const pa = pinned.has(a.key) ? 0 : 1;
    const pb = pinned.has(b.key) ? 0 : 1;
    return pa - pb || cmp.compare(a.name, b.name);
  });
}

// ─── parseAw — global userlist from aw.js (spec §cross-channel) ─────────────
//
// Source: https://images.chatcity.de/script/aw.js — JS source of the form
//   var cha = new Array(
//   <!--Tabelle-->
//   "Channel","count","name name2^id ...",
//   ...
//   "");
// 3-element stride: [channel, count, space-separated user list], terminated by
// an empty string. Guest users carry a "^id" suffix (e.g. "SomeGuest^12345")
// that is stripped; everyone else gets neutral status (aw.js has no flags).

// Extracts the quoted string literals that make up the cha array. Anchored on
// "new Array(" so non-aw.js input yields nothing; the <!--Tabelle--> comment
// inside the literal is skipped because it is not a quoted string.
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;

/**
 * Parse the raw aw.js response into a Map of channel name → users. The user
 * count element is informational — users are read from the space-separated
 * list. Empty channels are kept with an empty array. Defensive: any input
 * that is not aw.js-shaped returns an empty Map.
 */
export function parseAw(raw: string): Map<string, User[]> {
  const channels = new Map<string, User[]>();
  const arrayStart = raw.indexOf("new Array(");
  if (arrayStart === -1) return channels;
  const body = raw.slice(arrayStart);
  const literals = body.match(STRING_LITERAL);
  if (!literals) return channels;
  for (let i = 0; i + 2 < literals.length; i += 3) {
    const channel = literals[i].slice(1, -1);
    if (channel === "") break; // "" terminator — trailing entries are garbage
    channels.set(channel, parseAwUsers(literals[i + 2].slice(1, -1)));
  }
  return channels;
}

/** Split the space-separated user list (trailing spaces included) into Users. */
function parseAwUsers(raw: string): User[] {
  const users: User[] = [];
  for (const entry of raw.split(" ")) {
    if (entry === "") continue;
    users.push(decodeAwEntry(entry));
  }
  return users;
}

/**
 * Decode one user-list entry. A trailing "^id" marks a guest — the suffix is
 * stripped and guest: true is set. Everything else is neutral (all flags
 * false): aw.js carries no status flags.
 */
function decodeAwEntry(entry: string): User {
  const guestMatch = entry.match(/\^(\d+)$/);
  const name = guestMatch ? entry.slice(0, guestMatch.index) : entry;
  return {
    name,
    key: name.toLowerCase(),
    registered: false,
    guest: guestMatch !== null,
    sep: false,
    away: false,
  };
}

// ─── channelAbbrev — unified abbreviation (spec §abbreviation) ──────────────

/**
 * Shorten a channel name to a sidebar badge. Known channels are hardcoded;
 * unknown future channels fall back to the generic algorithm:
 *  1. Strip hyphens
 *  2. Short names (≤3) returned as-is
 *  3. CamelCase names (no hyphens, internal uppercase) use first 2 chars +
 *     remaining internal capitals: "EroRsp" → "ErR"
 *  4. Hyphenated / plain names use first-3-char truncation: "Chatcity" → "Cha"
 *  5. Trailing digit replaces 3rd char: "Erotik2" → "Er2"
 *  6. Positive `index` extends the abbreviation by one char per step for
 *     collision resolution (callers pass the occurrence index of channels
 *     sharing a base, e.g. Herzschmerz = 1 → "Hers").
 */
export function channelAbbrev(name: string, index: number): string {
  const hadHyphens = name.includes("-");
  const stripped = name.replace(/-/g, "");

  // 1. Hardcoded known channels (case-insensitive) — these are the only ones
  //    that have a non-trivial abbreviation. All other channels fall through
  //    to the generic algorithm below.
  switch (stripped.toLowerCase()) {
    case "mod":
      return "MOD";
    case "zauberwald":
      return "Zaub";
    case "bizarretalk":
      return "BizT";
    case "herzklopfen":
      return "HerzK";
    case "knuddelecke":
      return "KnudE";
    case "hexensabbat":
      return "HexS";
    case "bluemchensex":
      return "Bluem";
    case "manstreet":
      return "ManS";
    case "fortysomething":
      return "Forty";
    case "trauminsel":
      return "Traum";
    case "streikchannel":
      return "Streik";
    case "goldenfifty":
      return "Golden";
    case "herzschmerz":
      return "HerzS";
    case "nerdkultur":
      return "NerdK";
    case "query":
      return "Query";
    case "gaycruising":
      return "Gay";
    case "womencorner":
      return "WoCo";
    case "erorsp":
      return "EroR";
    case "erotik":
      return "Ero";
    case "erotik2":
      return "Ero2";
    case "erotik3":
      return "Ero3";
    case "erotik4":
      return "Ero4";
    case "registriert":
      return "Reg";
    case "chatcity":
      return "CC";
    case "international":
      return "Intl";
    case "baklava":
      return "Bak";
  }

  // 2. If shorter than 3 chars, return as-is: "MOD" → "MOD"
  if (stripped.length <= 3) return stripped;

  let abbrev: string;

  // 3. CamelCase detection — only for non-hyphenated names (hyphenated names
  //    like "Bizarre-Talk" should NOT trigger this branch; their internal caps
  //    come from the hyphen boundary, not a true camelCase word).
  if (!hadHyphens) {
    const internalCaps = stripped.slice(1).replace(/[^A-Z]/g, "");
    if (internalCaps.length > 0) {
      // "EroRsp" → "Er" + "R" → "ErR"
      abbrev = stripped[0].toUpperCase() + stripped[1].toLowerCase() + internalCaps;
    } else {
      // 4. Plain truncation: "Chatcity" → "Cha"
      abbrev = stripped[0].toUpperCase() + stripped.slice(1, 3).toLowerCase();
    }
  } else {
    // 4. Hyphenated name: "Women-Corner" → "WomenCorner" → "Wom"
    abbrev = stripped[0].toUpperCase() + stripped.slice(1, 3).toLowerCase();
  }

  // 5. Trailing digit replaces 3rd char: "Erotik2" → "Er2"
  const digitMatch = stripped.match(/(\d+)$/);
  if (digitMatch) {
    abbrev = stripped[0].toUpperCase() + stripped.slice(1, 2).toLowerCase() + digitMatch[1];
  }

  // 6. Collision extension: index 1+ extends by one char
  if (index > 0 && index < stripped.length - 2) {
    abbrev = stripped[0].toUpperCase() + stripped.slice(1, 3 + index).toLowerCase();
  }

  return abbrev;
}
