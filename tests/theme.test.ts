// Tests for the v3 theme bridge — the pure, DOM-free core (spec §6.4/§6.5).
//
// The DOM writes (`root.style.setProperty`) and GM calls are side-effectful
// boundaries that aren't unit-testable here (no jsdom in this suite; spec §7.1
// reserves jsdom for later). What IS pure and worth pinning down:
//   1. The `--bcc-*` name mapping (spec §6.1) — every role → its CSS var
//
// The cache shape and cache-hit rule were deleted with the colorscheme GM key
// (migration T6/S4). initTheme/setColor/applyCurrentScheme are thin store
// shims — tested via integration, not unit.

import { describe, it, expect } from "vitest";
import { generateScheme } from "../src/scheme";
import { schemeToCssVars, BCC_CSS_VARS } from "../src/theme";

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

  it("BCC_CSS_VARS lists exactly the 18 spec roles, no more, no less", () => {
    expect(BCC_CSS_VARS).toHaveLength(18);
    // No duplicate var names.
    expect(new Set(BCC_CSS_VARS).size).toBe(18);
    // All in the --bcc-* namespace (spec A9).
    for (const v of BCC_CSS_VARS) expect(v.startsWith("--bcc-")).toBe(true);
  });

  it("is pure — same scheme in, same record out", () => {
    const scheme = generateScheme("3A5FCD");
    expect(schemeToCssVars(scheme)).toEqual(schemeToCssVars(scheme));
  });
});
