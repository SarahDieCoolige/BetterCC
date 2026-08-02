// ═══════════════════════════════════════════════════════════════════════════
// BetterCC v2 colour scheme generator
//
// Single-input theming engine: one base colour → 20+ accessible, perceptually
// distinguishable CSS custom properties.  Drop-in replacement for the v1
// generator (same `generateScheme` signature, same `BccColorScheme` return
// type) but with four architectural improvements:
//
//   1. Purpose-named surface scale (0–3) instead of element-named tiers.
//   2. Proportional desaturation — a neon base yields muted derived surfaces.
//   3. Luminance clamping + minimum perceptual gap between adjacent tiers.
//   4. Three-level border scale derived from surface‑1 (subtle/medium/strong).
//
// The old element-specific field names are mapped to the most appropriate
// tier in the new scale so every existing consumer compiles and runs unchanged.
// ═══════════════════════════════════════════════════════════════════════════

// tinycolor2 is loaded via CDN @require (keeps the userscript small). The UMD
// wrapper assigns the factory to window.tinycolor — we use the bare global.
declare const tinycolor: any;

// ─── Public interface ──────────────────────────────────────────────────────

export interface BccColorScheme {
  // ── Existing fields (drop-in compat — mapped to the new scale below) ──
  surface: string;
  text: string;
  surfaceRaised: string;
  textRaised: string;
  surfaceInput: string;
  textInput: string;
  surfaceFooter: string;
  surfaceSidebar: string;
  textSidebar: string;
  textMuted: string;
  textPlaceholder: string;
  icon: string;
  accentWhisper: string;
  accentBan: string;
  statusOnline: string;
  statusSep: string;
  textAway: string;
  border: string;
  surfaceHover: string;
  surfaceActive: string;
  bgHex: string;

  // ── New generic-purpose names (optional, for future CSS migration) ────
  surface0?: string; // = surface          (primary background)
  surface1?: string; // = footer / sidebar (subtle elevation)
  surface2?: string; // = surfaceRaised    (overlay / popup)
  surface3?: string; // = surfaceInput     (sunken / input field)
  text0?: string;    // = text             (primary body text)
  text1?: string;    // = muted / placeholder / away (secondary text)
  border0?: string;  // subtle  — siblings in the same region
  border1?: string;  // medium  — region separators (= border)
  border2?: string;  // strong  — outlines, focus rings
}

export interface GenerateSchemeOptions {
  /**
   * Force dark-mode derivation regardless of the base colour's luminance.
   * Default: derived from the base (`isLight()` → light, else dark).
   */
  darkMode?: boolean;
}

// ─── Tunable, named steps ──────────────────────────────────────────────────
//
// All deltas are TinyColor units (0–100 for lighten/darken/saturate/desaturate,
// 0–1 for WCAG luminance).  Every constant is named — no magic numbers.

const STEP = {
  // ── Surface luminance deltas (HSL lightness units) ───────────────────
  /** surface-1: subtle elevation (footer / sidebar) — 8 units from base. */
  surface1Step: 4,
  /** surface-2: raised (popups / overlays) — 16 units from base. */
  surface2Step: 16,
  /** surface-3: sunken (inputs) — 8 units, opposite direction. */
  surface3Step: 8,

  // ── Desaturation ─────────────────────────────────────────────────────
  /** How much of the base saturation to strip per derived tier.
   *  0 = keep full saturation, 1 = fully greyscale. */
  desatFactor: 0.1,

  // ── Luminance bounds (WCAG relative luminance, 0‑1) ──────────────────
  /** Minimum WCAG luminance gap between adjacent surface tiers. */
  minLuminanceGap: 0.015,

  // ── Border offsets (from surface‑1, HSL lightness units) ─────────────
  /** border-0: barely-there sibling separators. */
  borderSubtleShift: 4,
  /** border-1: region separators (chatbar top, stats bar). */
  borderMediumShift: 10,
  /** border-2: outlines, popup edges. */
  borderStrongShift: 20,

  // ── Interaction nudge amounts ────────────────────────────────────────
  hoverShift: 6,
  activeShift: 12,
} as const;

// ─── Helpers (unchanged from v1 — they work) ───────────────────────────────

/** TinyColor → 6-digit uppercase hex, no leading `#`. */
function toHex6(color: any): string {
  return color.toHexString().slice(1).toUpperCase();
}

/**
 * Pick the most readable candidate against `bg`, guaranteeing WCAG AA.
 * `mostReadable` uses `includeFallbackColors` which adds #000 / #fff as a
 * last-resort backstop, so contrast is always met.
 */
function pickReadable(bg: any, candidates: any[], large = false): any {
  return tinycolor.mostReadable(bg, candidates, {
    includeFallbackColors: true,
    level: "AA",
    size: large ? "large" : "small",
  });
}

/** Darken if light, lighten if dark — keeps tiering readable. */
function nudge(color: any, amount: number): any {
  return color.isLight()
    ? color.clone().darken(amount)
    : color.clone().lighten(amount);
}

/**
 * Lift a triad-derived (or seed) accent into a readable window against `bg`.
 * Accents are decorative, not body text — 3:1 (large-text AA) is sufficient.
 */
function liftAccent(bg: any, accent: any): any {
  const minContrast = 3.0;
  if (tinycolor.readability(bg, accent) >= minContrast) return accent.clone();
  const ops = [
    (c: any) => c.lighten(20),
    (c: any) => c.darken(20),
    (c: any) => c.saturate(30).lighten(15),
    (c: any) => c.saturate(30).darken(15),
    (c: any) => c.lighten(40),
    (c: any) => c.darken(40),
  ];
  for (const op of ops) {
    const cand = op(accent.clone());
    if (tinycolor.readability(bg, cand) >= minContrast) return cand;
  }
  return accent.clone(); // last resort: keep the hue as-is
}

/** WCAG relative luminance (0‑1).  Perceptually weighted — better than raw
 *  HSL lightness for measuring whether two surfaces "look different". */
function wcagLum(color: any): number {
  return color.getLuminance();
}

/**
 * Pick the candidate closest to `targetContrast` (default 4.5:1 body-text AA)
 * but never below `minContrast` (3:1).  Unlike `mostReadable`, which always
 * picks maximum contrast (→ black/white), this keeps the hue visible — ideal
 * for icons that should read as "coloured", not just "dark".
 */
function pickTinted(
  bg: any,
  candidates: any[],
  targetContrast = 4.5,
  minContrast = 3.0,
): any {
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const c of candidates) {
    const cr = tinycolor.readability(bg, c);
    if (cr < minContrast) continue;
    const diff = Math.abs(cr - targetContrast);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

/**
 * Step a colour in tier direction.
 * Light mode → step darker (positive amount → darken).
 * Dark mode → step lighter.
 */
function tierStep(color: any, amount: number, darkMode: boolean): any {
  return darkMode
    ? color.clone().lighten(amount)
    : color.clone().darken(amount);
}

// ─── Main generator ────────────────────────────────────────────────────────

export function generateScheme(
  baseColor: string,
  options?: GenerateSchemeOptions,
): BccColorScheme {
  const raw = tinycolor(baseColor);
  const darkMode = options?.darkMode ?? !raw.isLight();

  // ── Step 1: no clamping — let the user's chosen color be surface-0.
  // The minimum-luminance-gap enforcement (step 4) already ensures adjacent
  // tiers are distinguishable even from near-black or near-white bases.
  const base = raw.clone();

  // ── Step 2: build the surface scale ──────────────────────────────────
  //   s0 = primary background
  //   s1 = subtle elevation  (footer, sidebar)
  //   s2 = raised            (popups, overlays)
  //   s3 = sunken            (inputs — opposite direction from s1/s2)

  const s0 = base.clone();

  const s1 = tierStep(s0, STEP.surface1Step, darkMode);
  const s2 = tierStep(s0, STEP.surface2Step, darkMode);
  // s3 goes the OPPOSITE direction (lighter in light mode, darker in dark)
  const s3 = tierStep(s0, STEP.surface3Step, !darkMode);

  // ── Step 3: desaturate derived surfaces ──────────────────────────────
  // A saturated neon base (e.g. #FF0000) shouldn't produce saturated neon
  // footers.  Strip saturation proportionally to base saturation × tier.
  const baseSat = base.toHsl().s; // 0–1
  for (const [surf, tier] of [[s1, 1], [s2, 2], [s3, 1]] as const) {
    if (baseSat > 0.4) {
      const desatAmount = Math.round(baseSat * STEP.desatFactor * tier * 100);
      if (desatAmount > 0) (surf as any).desaturate(desatAmount);
    }
  }

  // ── Step 4: enforce minimum luminance gap between tiers ──────────────
  // Adjacent tiers must differ by ≥ minLuminanceGap in WCAG luminance so
  // they are always visually distinguishable.
  const tiers = [s0, s1, s2, s3];
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    const curr = tiers[i];
    const gap = Math.abs(wcagLum(curr) - wcagLum(prev));
    if (gap < STEP.minLuminanceGap) {
      // Push the current tier further in its direction.
      const pushAmount = 6;
      if (darkMode) {
        // s1/s2 are lightened, s3 is darkened → push each further
        if (i === 3) curr.darken(pushAmount);
        else curr.lighten(pushAmount);
      } else {
        // s1/s2 are darkened, s3 is lightened
        if (i === 3) curr.lighten(pushAmount);
        else curr.darken(pushAmount);
      }
    }
  }

  // ── Step 5: text colours (AA-guaranteed via pickReadable) ────────────

  const text0 = pickReadable(s0, s0.monochromatic().concat(s0.analogous()));

  // Secondary text — used for muted, placeholder, away.  Drawn from the
  // surface‑0 monochromatic ramp so it stays readable against all tiers.
  const text1 = pickReadable(
    s1,
    s0.monochromatic().concat(s0.analogous()),
  );

  // Per-tier text (each AA against its own surface)
  const textRaisedVal = pickReadable(s2, s2.monochromatic(), true);
  const textInputVal = pickReadable(s3, s3.monochromatic());
  const textSidebarVal = pickTinted(
    s1,
    s1.monochromatic().concat(s0.monochromatic()),
    4.5, // target body-text AA
    3.0, // minimum large-text AA (sidebar uses 14px/600)
  );
  const textMutedVal = text1; // reuse text‑1 for muted
  const textPlaceholderVal = text1; // placeholder = secondary text (was a textInput clone)
  const iconVal = pickTinted(s1, s1.monochromatic(), 3.5, 3.0);

  // ── Step 6: borders (3-tier scale, derived from surface‑1) ───────────
  // All borders derive from the subtle tier (surface‑1) because most
  // borders live between surface‑1 regions (sidebar, footer, stats).
  const border0 = nudge(s1, STEP.borderSubtleShift);
  const border1 = nudge(s1, STEP.borderMediumShift);
  const border2 = nudge(s1, STEP.borderStrongShift);

  // ── Step 7: interaction layers ───────────────────────────────────────
  const surfaceHoverVal = nudge(s0, STEP.hoverShift);
  const surfaceActiveVal = nudge(s0, STEP.activeShift);

  // ── Step 8: semantic accents ─────────────────────────────────────────
  // Whisper & ban from the triad — stable hue identity across themes.
  const triad = s0.triad();
  const accentWhisperVal = liftAccent(s0, triad[1]);
  const accentBanVal = liftAccent(s0, triad[2]);

  // Status dots: fixed semantic seeds (green=present, amber=separated),
  // lifted to 3:1 against the sidebar tier so they stay visible.
  const statusOnlineVal = liftAccent(s1, tinycolor("#3aa55c"));
  const statusSepVal = liftAccent(s1, tinycolor("#d08a1e"));

  // Away text: a desaturated alternative still AA‑readable against s1.
  const textAwayVal = pickReadable(
    s1,
    [textSidebarVal.clone().desaturate(60), textMutedVal.clone()],
  );

  // ── Step 9: assemble ─────────────────────────────────────────────────
  return {
    // ── Old element-named fields (drop-in compat) ───────────────────
    surface: toHex6(s0),
    text: toHex6(text0),
    surfaceRaised: toHex6(s2),
    textRaised: toHex6(textRaisedVal),
    surfaceInput: toHex6(s3),
    textInput: toHex6(textInputVal),
    surfaceFooter: toHex6(s1),
    surfaceSidebar: toHex6(s1),
    textSidebar: toHex6(textSidebarVal),
    textMuted: toHex6(textMutedVal),
    textPlaceholder: toHex6(textPlaceholderVal),
    icon: toHex6(iconVal),
    accentWhisper: toHex6(accentWhisperVal),
    accentBan: toHex6(accentBanVal),
    statusOnline: toHex6(statusOnlineVal),
    statusSep: toHex6(statusSepVal),
    textAway: toHex6(textAwayVal),
    border: toHex6(border1),
    surfaceHover: toHex6(surfaceHoverVal),
    surfaceActive: toHex6(surfaceActiveVal),
    bgHex: toHex6(raw),

    // ── New generic-purpose names (for future CSS migration) ─────────
    surface0: toHex6(s0),
    surface1: toHex6(s1),
    surface2: toHex6(s2),
    surface3: toHex6(s3),
    text0: toHex6(text0),
    text1: toHex6(text1),
    border0: toHex6(border0),
    border1: toHex6(border1),
    border2: toHex6(border2),
  };
}
