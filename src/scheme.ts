// ═══════════════════════════════════════════════════════════════════════════
// Scheme generator — thin switcher between v1 (stable) and v2 (experimental).
//
// Defaults to v1.  Enable v2 via:
//   • URL param      ?schemev2           (dev / testing)
//   • Runtime call   enableV2Scheme()    (after reading GM config at init)
// ═══════════════════════════════════════════════════════════════════════════

import { generateScheme as v1 } from "./scheme-v1";
import { generateScheme as v2 } from "./scheme-v2";

let _v2 = typeof location !== "undefined" && new URLSearchParams(location.search).has("schemev2");

/** Call once at init (after reading the GM-stored flag) to enable v2. */
export function enableV2Scheme(): void {
  _v2 = true;
}

/** Disable v2 and return to v1. */
export function disableV2Scheme(): void {
  _v2 = false;
}

/** Query whether v2 is currently active. */
export function isV2Scheme(): boolean {
  return _v2;
}

/** Thin wrapper — delegates to the active generator. */
export const generateScheme: typeof v1 = (base, opts?) =>
  _v2 ? v2(base, opts as any) : v1(base, opts);

// Re-export the v1 interface (a subset of v2 — always compatible with both).
export type { BccColorScheme, GenerateSchemeOptions } from "./scheme-v1";
