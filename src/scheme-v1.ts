// ═══════════════════════════════════════════════════════════════════════
// Pure color-scheme generator (spec §6.2).
//
// Translates a single base color into every `--bcc-*` role. This replaces the
// 130-line, DOM-mutating `theme.ts:setColors` with a function that has no
// side effects — the big testability win (spec §6).
//
// tinycolor2 is loaded via CDN @require (keeps the userscript small). The UMD
// wrapper assigns the factory to window.tinycolor — we use the bare global.
// Tests import the npm package directly (see tests/scheme.test.ts).
// ═══════════════════════════════════════════════════════════════════════

import { toHex6, pickReadable, nudge, liftAccent } from "./scheme-helpers";

declare const tinycolor: any;

/** Every `--bcc-*` role produced from one base color (spec §6.1). */
export interface BccColorScheme {
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
  /** Status-indicator accents for the userlist (large-text AA against the
   *  sidebar). Online = a green hue (present), sep = an amber hue (separated).
   *  Derived, not fixed hex, so they stay readable on any theme — the old
   *  fixed #3aa55c/#d08a1e vanished on green/amber sidebars. */
  /** Away/sep text color — the sidebar text nudged to lower contrast but still
   *  guaranteed AA-readable. Replaces raw opacity:.5 on away names, which fell
   *  below AA on some surfaces (the readable fix instead of the blend-in fix). */
  textAway: string;
  border: string;
  surfaceHover: string;
  surfaceActive: string;
  /** Raw base color as 6-digit uppercase hex, no leading `#` (storage value). */
  bgHex: string;
}

export interface GenerateSchemeOptions {
  /**
   * Force dark-mode derivation regardless of the base color's luminance.
   * Default: derived from the base (`isLight()` → light, else dark).
   */
  darkMode?: boolean;
}

// ─── Tunable, named steps (spec §6.3: no unnamed magic numbers) ─────────
//
// All deltas are TinyColor units (0–100 for lighten/darken/brighten,
// 0–1 for saturation/lightness multipliers). They are the *named* version of
// the thresholds that were hard-coded in the old setColors().
const STEP = {
  /** Footer/sidebar sit one tier below the main surface. */
  footerDarken: 15, // was: chatBg.darken(15) when light
  footerLighten: 5, // was: chatBg.lighten(5) when dark
  footerBrighten: 5,
  sidebarShift: 5, // ulistcolor = footercolor ± 5
  /** Input/raised fields are desaturated for legibility. */
  inputDarken: 10, // was: darken(10) on dark footers
  inputBrighten: 30, // was: brighten(30) on light footers
  /** Hover/active feedback layers. */
  hoverShift: 8,
  activeShift: 14,
  /** Border opacity-equivalent: a faint darkening of the surface. */
  borderDarken: 18,
  /** Accent candidates: saturation/luminance window for visibility. */
  accentMinLight: 35,
  accentMaxLight: 65,
} as const;

// ─── Main ──────────────────────────────────────────────────────────────

export function generateScheme(baseColor: string, options?: GenerateSchemeOptions): BccColorScheme {
  const surface = tinycolor(baseColor);
  const darkMode = options?.darkMode ?? !surface.isLight();

  // ── Main text on surface ───────────────────────────────────────────
  // Monochromatic + analogous shades give mostReadable a smooth ramp; the
  // WCAG level guarantees 4.5:1 body text.
  const text = pickReadable(surface, surface.monochromatic().concat(surface.analogous()));

  // ── Footer tier (one step below surface) ───────────────────────────
  const footer = darkMode
    ? surface.clone().lighten(STEP.footerLighten).brighten(STEP.footerBrighten)
    : surface.clone().darken(STEP.footerDarken).brighten(STEP.footerBrighten);

  // ── Sidebar tier (nudge from footer) ───────────────────────────────
  const sidebar = nudge(footer, STEP.sidebarShift);

  // ── Input / raised surfaces ────────────────────────────────────────
  // Input and raised share one tier today (both desaturated fields on the
  // same luminance step). Kept as two derivations from `inputBase` rather
  // than aliased, so a future divergence (e.g. raised lifted a notch) is a
  // localized edit here, not an uncovering of hidden duplication downstream.
  const inputBase = darkMode
    ? footer.clone().darken(STEP.inputDarken)
    : footer.clone().brighten(STEP.inputBrighten);
  const input = inputBase;
  const raised = inputBase;

  // ── Per-tier text colors (each AA against its own surface) ─────────
  const textRaised = pickReadable(raised, raised.monochromatic(), true);
  const textInput = pickReadable(input, input.monochromatic());
  const textSidebar = pickReadable(
    sidebar,
    sidebar.monochromatic().concat(surface.monochromatic()),
  );
  const textMuted = pickReadable(footer, surface.monochromatic().concat(surface.analogous()));
  // Placeholder is a softened input text (still legible).
  const textPlaceholder = textInput.clone();

  // ── Icon color (large-text AA: 3:1) ────────────────────────────────
  const icon = pickReadable(sidebar, surface.monochromatic(), true);

  // ── Accents (whisper/ban from triad, lifted to 3:1) ────────────────
  // Spec §6.3 retains the triad approach for accent hues.
  const triad = surface.triad();
  const accentWhisper = liftAccent(surface, triad[1]);
  const accentBan = liftAccent(surface, triad[2]);

  // Away text = sidebar text desaturated and pushed toward the muted tier,
  // but kept AA-readable against the sidebar (a real color, not opacity —
  // opacity:.5 dropped below AA on low-contrast surfaces).
  const textAway = pickReadable(sidebar, [textSidebar.clone().desaturate(60), textMuted.clone()]);

  // ── Interaction layers ─────────────────────────────────────────────
  const surfaceHover = nudge(surface, STEP.hoverShift);
  const surfaceActive = nudge(surface, STEP.activeShift);

  // ── Border (faint surface-derived divider) ─────────────────────────
  const border = surface.clone().darken(STEP.borderDarken);

  return {
    surface: toHex6(surface),
    text: toHex6(text),
    surfaceRaised: toHex6(raised),
    textRaised: toHex6(textRaised),
    surfaceInput: toHex6(input),
    textInput: toHex6(textInput),
    surfaceFooter: toHex6(footer),
    surfaceSidebar: toHex6(sidebar),
    textSidebar: toHex6(textSidebar),
    textMuted: toHex6(textMuted),
    textPlaceholder: toHex6(textPlaceholder),
    icon: toHex6(icon),
    accentWhisper: toHex6(accentWhisper),
    accentBan: toHex6(accentBan),
    textAway: toHex6(textAway),
    border: toHex6(border),
    surfaceHover: toHex6(surfaceHover),
    surfaceActive: toHex6(surfaceActive),
    bgHex: toHex6(surface),
  };
}
