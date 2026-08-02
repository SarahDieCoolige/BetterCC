// ═══════════════════════════════════════════════════════════════════════════
// Shared color helpers used by both scheme generators (scheme-v1, scheme-v2).
//
// Pure functions over the `tinycolor` CDN global — no DOM, no GM, no side
// effects. Extracted so a fix lands once and the two generators can't drift.
// Both generators are kept (v1 stable, v2 experimental); only the shared
// backbone lives here.
// ═══════════════════════════════════════════════════════════════════════════

declare const tinycolor: any;

/** Normalize a tinycolor instance to a 6-digit uppercase hex string (no leading #). */
export function toHex6(color: any): string {
  // toHexString() always returns "#RRGGBB" for valid colors.
  return color.toHexString().slice(1).toUpperCase();
}

/**
 * Pick the most readable of `candidates` against `bg`, guaranteeing WCAG AA.
 * `mostReadable` uses `includeFallbackColors` which adds #000 / #fff as a
 * last-resort backstop, so contrast is always met.
 */
export function pickReadable(bg: any, candidates: any[], large = false): any {
  return tinycolor.mostReadable(bg, candidates, {
    includeFallbackColors: true,
    level: "AA",
    size: large ? "large" : "small",
  });
}

/** Darken if the surface is light, lighten if dark — keeps tiering readable. */
export function nudge(color: any, amount: number): any {
  return color.isLight() ? color.clone().darken(amount) : color.clone().lighten(amount);
}

/**
 * Lift a triad-derived accent into a readable window against `bg`.
 *
 * Accents are decorative (whisper/ban labels), not body text: hue-identity and
 * distinctiveness matter more than strict AA. But the spec still wants 3:1
 * (large-text AA). For a mid-tone surface, raw triad members are near the base
 * in luminance and clear neither bar. So instead of discarding the triad hue
 * for a black/white fallback (which collapses whisper and ban to the same
 * color), we keep the hue and push its luminance until it clears 3:1.
 */
export function liftAccent(bg: any, accent: any): any {
  const minContrast = 3.0; // large-text AA
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
