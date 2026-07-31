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
    const pa = pinned.has(a.name) ? 0 : 1;
    const pb = pinned.has(b.name) ? 0 : 1;
    return pa - pb || cmp.compare(a.name, b.name);
  });
}
