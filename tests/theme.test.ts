// Tests for the v3 theme bridge — the pure, DOM-free core (spec §6.4/§6.5).
//
// The DOM writes (`root.style.setProperty`) and GM calls are side-effectful
// boundaries that aren't unit-testable here (no jsdom in this suite; spec §7.1
// reserves jsdom for later). What IS pure and worth pinning down:
//   1. The `--bcc-*` name mapping (spec §6.1) — every role → its CSS var
//   2. The storage shape — what gets cached under `colorscheme_{user}`
//   3. The cache-hit rule — when a stored scheme can be reused vs regenerated
//
// These three are the contract the DOM bridge depends on; the bridge itself is
// a thin shim over them (kept minimal, like applyThemeToIframe in utils.ts).

import { describe, it, expect } from "vitest";
import { generateScheme } from "../src/scheme";
import { schemeToCssVars, schemeToStorage, matchesStoredBase, BCC_CSS_VARS } from "../src/theme";

// ─── 1. The --bcc-* name mapping (spec §6.1) ──────────────────────────────

describe("schemeToCssVars — --bcc-* mapping", () => {
  it("produces an entry for every spec §6.1 role", () => {
    const scheme = generateScheme("6AAED8");
    const vars = schemeToCssVars(scheme);
    // The 17 roles from spec §6.1 / BccColorScheme.
    const expected: Record<string, keyof typeof scheme> = {
      "--bcc-surface": "surface",
      "--bcc-text": "text",
      "--bcc-surface-raised": "surfaceRaised",
      "--bcc-text-raised": "textRaised",
      "--bcc-surface-input": "surfaceInput",
      "--bcc-text-input": "textInput",
      "--bcc-surface-footer": "surfaceFooter",
      "--bcc-surface-sidebar": "surfaceSidebar",
      "--bcc-text-sidebar": "textSidebar",
      "--bcc-text-muted": "textMuted",
      "--bcc-text-placeholder": "textPlaceholder",
      "--bcc-icon": "icon",
      "--bcc-accent-whisper": "accentWhisper",
      "--bcc-accent-ban": "accentBan",
      "--bcc-border": "border",
      "--bcc-surface-hover": "surfaceHover",
      "--bcc-surface-active": "surfaceActive",
    };
    for (const [varName, role] of Object.entries(expected)) {
      expect(vars, `missing var ${varName}`).toHaveProperty(varName);
      // Values carry a leading # so the browser reads them as colors.
      expect(vars[varName]).toBe("#" + scheme[role]);
    }
  });

  it("BCC_CSS_VARS lists exactly the 20 spec roles, no more, no less", () => {
    expect(BCC_CSS_VARS).toHaveLength(20);
    // No duplicate var names.
    expect(new Set(BCC_CSS_VARS).size).toBe(20);
    // All in the --bcc-* namespace (spec A9).
    for (const v of BCC_CSS_VARS) expect(v.startsWith("--bcc-")).toBe(true);
  });

  it("is pure — same scheme in, same record out", () => {
    const scheme = generateScheme("3A5FCD");
    expect(schemeToCssVars(scheme)).toEqual(schemeToCssVars(scheme));
  });
});

// ─── 2. Storage shape (spec §6.5 — cache under colorscheme_{user}) ─────────

describe("schemeToStorage — cache shape", () => {
  it("tags the cache with the base hex so load can detect a stale cache", () => {
    const scheme = generateScheme("6AAED8");
    const stored = schemeToStorage(scheme);
    expect(stored.bgHex).toBe("6AAED8");
  });

  it("round-trips the full scheme so a cache hit needs no regeneration", () => {
    const scheme = generateScheme("FF6600");
    const stored = schemeToStorage(scheme);
    // Every role is preserved verbatim (the cache is the applied scheme).
    for (const role of [
      "surface",
      "text",
      "surfaceRaised",
      "textRaised",
      "surfaceInput",
      "textInput",
      "surfaceFooter",
      "surfaceSidebar",
      "textSidebar",
      "textMuted",
      "textPlaceholder",
      "icon",
      "accentWhisper",
      "accentBan",
      "border",
      "surfaceHover",
      "surfaceActive",
    ] as const) {
      expect(stored[role]).toBe(scheme[role]);
    }
  });
});

// ─── 3. Cache-hit rule (regenerate if base changed) ───────────────────────

describe("matchesStoredBase — when to reuse vs regenerate", () => {
  it("returns true when the stored cache was built from the same base", () => {
    const stored = schemeToStorage(generateScheme("6AAED8"));
    expect(matchesStoredBase(stored, "6AAED8")).toBe(true);
  });

  it("returns false when the user picked a new base color", () => {
    const stored = schemeToStorage(generateScheme("6AAED8"));
    expect(matchesStoredBase(stored, "FF6600")).toBe(false);
  });

  it("is case-insensitive on the hex (storage is uppercased; user input varies)", () => {
    const stored = schemeToStorage(generateScheme("6AAED8"));
    expect(matchesStoredBase(stored, "6aaed8")).toBe(true);
  });

  it("returns false when nothing is cached yet (null/undefined)", () => {
    expect(matchesStoredBase(null, "6AAED8")).toBe(false);
    expect(matchesStoredBase(undefined, "6AAED8")).toBe(false);
  });
});
