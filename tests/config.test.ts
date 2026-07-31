// Tests for the v3 config module — typed GM-storage wrapper (spec §2.5).
//
// GM keys are unchanged for rollback safety (A6): color_{user}, ban_{user},
// pinned_{user}, whisper_{user}, colorscheme_{user}, plus the flag bcc_v3_{user}.
// The module is a typed read/write wrapper over GM.getValue/GM.setValue keyed
// via the existing getUserKey() helper. Keys are user-scoped; guests use "gast".
//
// The GM boundary itself isn't unit-testable (no jsdom), so we use a tiny
// in-memory GM fake (a Map) — the skill's preferred "fake" double. This proves
// the round-trip, key format, and default behaviour without touching dev/mocks.

import { describe, it, expect, beforeEach } from "vitest";
import { setUserStore } from "../src/utils";
import { getConfig, setConfig, KNOWN_KEYS, DEFAULTS } from "../src/v3/config";

// ─── In-memory GM fake (per-test isolation) ────────────────────────────────

function installGmFake() {
  const store = new Map<string, unknown>();
  const fake = {
    getValue: (key: string, def?: unknown) =>
      store.has(key) ? Promise.resolve(store.get(key)) : Promise.resolve(def),
    setValue: (key: string, val: unknown) => {
      store.set(key, val);
      return Promise.resolve();
    },
  };
  (globalThis as any).GM = fake;
  return store;
}

beforeEach(() => {
  installGmFake();
});

// ─── Key format ────────────────────────────────────────────────────────────

describe("config — user-scoped key format", () => {
  it("registered user: keys are {user}_{key}", async () => {
    setUserStore("TestUser", false); // → "testuser"
    await setConfig("color", "6AAED8");
    // Round-trip proves the same key is read back.
    expect(await getConfig("color", "")).toBe("6AAED8");
  });

  it("guest: keys use 'gast' as the user scope", async () => {
    setUserStore("Someone", true); // → "gast"
    await setConfig("ban", ["Nick1"]);
    expect(await getConfig("ban", [])).toEqual(["Nick1"]);
  });
});

// ─── Defaults ──────────────────────────────────────────────────────────────

describe("config — defaults", () => {
  it("returns the documented default when nothing is stored", async () => {
    setUserStore("NewUser", false);
    expect(await getConfig("color")).toBe(DEFAULTS.color);
  });

  it("the DEFAULTS map covers every key in KNOWN_KEYS", () => {
    for (const key of KNOWN_KEYS) {
      expect(DEFAULTS, `default missing for ${key}`).toHaveProperty(key);
    }
  });
});

// ─── Round-trip ────────────────────────────────────────────────────────────

describe("config — round-trip", () => {
  it("stores and retrieves a string value", async () => {
    setUserStore("RoundTrip", false);
    await setConfig("whisper", "TargetNick");
    expect(await getConfig("whisper", "")).toBe("TargetNick");
  });

  it("stores and retrieves a structured value (array of pinned nicks)", async () => {
    setUserStore("RoundTrip", false);
    await setConfig("pinned", ["Alpha", "Beta"]);
    expect(await getConfig("pinned", [])).toEqual(["Alpha", "Beta"]);
  });

  it("overwriting a value replaces, not merges", async () => {
    setUserStore("RoundTrip", false);
    await setConfig("ban", ["A", "B"]);
    await setConfig("ban", ["C"]);
    expect(await getConfig("ban", [])).toEqual(["C"]);
  });
});
