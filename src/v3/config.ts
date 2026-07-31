// ─── v3 config: typed GM-storage wrapper (spec §2.5) ──────────────────────
//
// A thin typed read/write layer over GM.getValue/GM.setValue, keyed via the
// existing getUserKey() helper (so keys stay user-scoped: {user}_{key}, or
// gast_{key} for guests). Keys are UNCHANGED from the old path (rollback
// safety, A6): color, colorscheme, ban, pinned, whisper, plus the flag bcc_v3.
//
// The GM boundary is a side-effecting seam (no jsdom in the test suite), so the
// pure contract this module exposes — the known keys, their defaults, and the
// round-trip — is what's pinned. The actual GM calls are exercised against an
// in-memory fake in tests/config.test.ts.

import { getUserKey } from "../utils";

/** Every known GM key (suffix; user-scoping is applied by getUserKey). */
export const KNOWN_KEYS = [
  "color",
  "colorscheme",
  "ban",
  "pinned",
  "whisper",
  "bcc_v3",
] as const;
export type ConfigKey = (typeof KNOWN_KEYS)[number];

/** Documented defaults, returned by getConfig when nothing is stored. */
export const DEFAULTS: Record<ConfigKey, unknown> = {
  color: "6AAED8",
  colorscheme: null, // regenerated from color on load (theme bridge T3)
  ban: [],
  pinned: [],
  whisper: "", // "" = no superwhisper target
  bcc_v3: false,
};

/**
 * Read a config value (user-scoped). Returns the documented default when
 * nothing is stored (or the caller's fallback, if given).
 */
export async function getConfig<T = unknown>(
  key: ConfigKey,
  fallback?: T,
): Promise<T> {
  const def = fallback ?? (DEFAULTS[key] as unknown as T);
  return (await GM.getValue(getUserKey(key), def)) as T;
}

/** Write a config value (user-scoped). */
export async function setConfig<T = unknown>(
  key: ConfigKey,
  value: T,
): Promise<void> {
  await GM.setValue(getUserKey(key), value);
}
