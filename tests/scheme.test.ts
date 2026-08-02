// Tests for the pure color-scheme generator.
//
// Production loads tinycolor2 via CDN @require (bare `tinycolor` global).
// Tests get the same global via tests/setup.ts (assigns the npm package to
// globalThis). Per spec §6.2 the function stays "pure, zero mocks".

import { describe, it, expect } from "vitest";
import tinycolorFactory from "tinycolor2";
import { generateScheme, type BccColorScheme } from "../src/scheme";
import { generateScheme as generateSchemeV2 } from "../src/scheme-v2";

// ─── Helpers ──────────────────────────────────────────────────────────

/** "FF6600" or "#FF6600" → luminance contrast ratio against a target. */
function contrastRatio(hexA: string, hexB: string): number {
  return tinycolorFactory(hexA).toRgbString() === ""
    ? -1
    : (tinycolorFactory.readability(tinycolorFactory(hexA), tinycolorFactory(hexB)) as number);
}

/** WCAG AA for body text is 4.5:1; large/icon text is 3:1. */
const AA_TEXT = 4.5;
const AA_LARGE = 3.0;

// ─── Shape ────────────────────────────────────────────────────────────

describe("generateScheme — output shape", () => {
  it("returns every --bcc-* role", () => {
    const s = generateScheme("6AAED8");
    const keys: (keyof BccColorScheme)[] = [
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
      "bgHex",
    ];
    for (const k of keys) {
      expect(s[k], `missing role ${k}`).toMatch(/^#?[0-9a-fA-F]{6}$/);
    }
  });

  it("normalizes bgHex to a 6-digit hex without leading #", () => {
    expect(generateScheme("6AAED8").bgHex).toBe("6AAED8");
    expect(generateScheme("#ff6600").bgHex).toBe("FF6600");
    expect(generateScheme("fff").bgHex).toBe("FFFFFF");
  });
});

// ─── Purity / idempotence ─────────────────────────────────────────────

describe("generateScheme — purity", () => {
  it("is idempotent for the same input", () => {
    const a = generateScheme("3A5FCD");
    const b = generateScheme("3A5FCD");
    expect(a).toEqual(b);
  });

  it("does not mutate the input string", () => {
    const input = "6AAED8";
    generateScheme(input);
    expect(input).toBe("6AAED8");
  });
});

// ─── Light vs dark ────────────────────────────────────────────────────

describe("generateScheme — light vs dark", () => {
  it("light mode: main text is dark on a light surface", () => {
    const s = generateScheme("EEEEEE"); // near-white base
    const cr = contrastRatio(s.surface, s.text);
    expect(cr).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("dark mode: main text is light on a dark surface", () => {
    const s = generateScheme("1A1A2E", { darkMode: true });
    const cr = contrastRatio(s.surface, s.text);
    expect(cr).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("explicit darkMode opt-in produces different footer than default for a mid base", () => {
    // For a mid-luminance base, auto-detection and explicit darkMode may agree
    // on the main text. The contract darkMode changes is surface *tiering*
    // direction (footer lightens in dark mode, darkens in light). Use a base
    // whose auto-detection is "light" so explicit darkMode visibly diverges.
    const base = "6AAED8";
    const auto = generateScheme(base);
    const forcedDark = generateScheme(base, { darkMode: true });
    expect(auto.surfaceFooter).not.toEqual(forcedDark.surfaceFooter);
  });
});

// ─── WCAG AA across roles ─────────────────────────────────────────────

describe("generateScheme — WCAG AA readability", () => {
  const bases = ["6AAED8", "FF6600", "1A1A2E", "EEEEEE", "2E7D32", "C2185B"];
  for (const base of bases) {
    it(`body text roles meet AA (4.5:1) for base ${base}`, () => {
      const s = generateScheme(base);
      // Main text on surface
      expect(contrastRatio(s.surface, s.text)).toBeGreaterThanOrEqual(AA_TEXT);
      // Input text on input surface
      expect(contrastRatio(s.surfaceInput, s.textInput)).toBeGreaterThanOrEqual(AA_TEXT);
      // Sidebar text on sidebar surface (large-text AA — 14px/600 qualifies)
      expect(contrastRatio(s.surfaceSidebar, s.textSidebar)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it(`raised/icon text meets large-text AA (3:1) for base ${base}`, () => {
      const s = generateScheme(base);
      expect(contrastRatio(s.surfaceRaised, s.textRaised)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(s.surfaceSidebar, s.icon)).toBeGreaterThanOrEqual(AA_LARGE);
    });
  }
});

// ─── Accent derivation ────────────────────────────────────────────────

describe("generateScheme — accent colors", () => {
  it("whisper and ban accents are distinct from each other and from base", () => {
    const s = generateScheme("6AAED8");
    expect(s.accentWhisper).not.toBe(s.accentBan);
    expect(s.accentWhisper.toLowerCase()).not.toBe(s.bgHex.toLowerCase());
    expect(s.accentBan.toLowerCase()).not.toBe(s.bgHex.toLowerCase());
  });

  it("accents are visible against the surface (>= 3:1)", () => {
    const s = generateScheme("6AAED8");
    expect(contrastRatio(s.surface, s.accentWhisper)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(s.surface, s.accentBan)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

// ─── Status colors (userlist accents, against the SIDEBAR) ─────────────

describe("generateScheme — userlist status colors", () => {
  it("statusOnline and statusSep are present and distinct from each other", () => {
    const s = generateScheme("6AAED8");
    expect(s.statusOnline).toBeTruthy();
    expect(s.statusSep).toBeTruthy();
    expect(s.statusOnline).not.toBe(s.statusSep);
  });

  it("status accents meet large-text AA (3:1) against the sidebar surface", () => {
    // The status dots/glyphs render on the sidebar, so their AA guarantee must
    // hold against surfaceSidebar — not surface. The old fixed-hex dots blended
    // into green/amber sidebars; deriving via liftAccent(sidebar, …) fixes that.
    for (const base of ["6AAED8", "AA0000", "3A5FCD", "FFD700", "2E8B57"]) {
      const s = generateScheme(base);
      expect(
        contrastRatio(s.surfaceSidebar, s.statusOnline),
        `online@${base}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(s.surfaceSidebar, s.statusSep), `sep@${base}`).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    }
  });

  it("textAway meets body-text AA against the sidebar (replaces raw opacity)", () => {
    // Away names used to be opacity:.5, which dropped below AA on low-contrast
    // surfaces. textAway is a derived real color guaranteed AA-readable.
    for (const base of ["6AAED8", "AA0000", "3A5FCD"]) {
      const s = generateScheme(base);
      expect(contrastRatio(s.surfaceSidebar, s.textAway), `away@${base}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });
});

// ─── Surface tiering ──────────────────────────────────────────────────

describe("generateScheme — surface tiers", () => {
  it("hover and active are distinct from the base surface", () => {
    const s = generateScheme("6AAED8");
    const set = new Set([
      s.surface.toLowerCase(),
      s.surfaceHover.toLowerCase(),
      s.surfaceActive.toLowerCase(),
    ]);
    expect(set.size).toBe(3);
  });

  it("border is a defined hex derived from the surface", () => {
    const s = generateScheme("6AAED8");
    expect(s.border).toMatch(/^#?[0-9a-fA-F]{6}$/);
    expect(s.border.toLowerCase()).not.toBe(s.surface.toLowerCase());
  });
});

describe("generateScheme — v2 improvements", () => {
  it("sidebar and footer are the same tier (intentional merge)", () => {
    const s = generateSchemeV2("6AAED8");
    expect(s.surfaceSidebar).toBe(s.surfaceFooter);
  });

  it("saturated base (red) produces desaturated derived surfaces", () => {
    const s = generateSchemeV2("FF0000");
    const surfaceSat = tinycolorFactory(s.surface).toHsl().s;
    const footerSat = tinycolorFactory(s.surfaceFooter).toHsl().s;
    // Derived surface should be less saturated than the base.
    expect(footerSat).toBeLessThan(surfaceSat);
  });

  it("near-black base still produces distinguishable surface tiers", () => {
    const s = generateSchemeV2("111111");
    const lum0 = tinycolorFactory(s.surface).getLuminance();
    const lum1 = tinycolorFactory(s.surfaceFooter).getLuminance();
    const lum2 = tinycolorFactory(s.surfaceRaised).getLuminance();
    // Adjacent tiers should differ by a perceptible amount.
    expect(Math.abs(lum1 - lum0)).toBeGreaterThan(0.01);
    expect(Math.abs(lum2 - lum1)).toBeGreaterThan(0.01);
  });

  it("near-white base still produces distinguishable surface tiers", () => {
    const s = generateSchemeV2("F0F0F0");
    const lum0 = tinycolorFactory(s.surface).getLuminance();
    const lum1 = tinycolorFactory(s.surfaceFooter).getLuminance();
    // Surface and footer should differ perceptibly.
    expect(lum0 - lum1).toBeGreaterThan(0.01);
  });
});
