// ─── v3 theme bridge (spec §6.4 / §6.5) ────────────────────────────────────
//
// Connects the pure `generateScheme()` engine to the DOM and GM storage:
//   scheme → --bcc-* on :root          (applyScheme)
//   base hex → color_{user}            (saveColor)
//   scheme cache → colorscheme_{user}  (saveScheme)
//   load: read base; reuse cache or regenerate (loadTheme)
//
// The pure pieces (the --bcc-* map, storage shape, cache-hit rule) live here
// too and are unit-tested directly — the DOM/GM calls themselves are thin
// shems, like applyThemeToIframe in utils.ts, and aren't unit-tested.
//
// GM keys are unchanged from the old theme.ts (spec §6.5: no data migration):
//   color_{user}        — base hex string, the source of truth
//   colorscheme_{user}  — cached BccColorScheme (regenerated if base changes)
// Old and v3 paths never run together (flag-gated), so the cache-format
// difference (v3 stores hex roles, old stored HSL strings) is harmless: each
// path only trusts its own cache.

import { generateScheme, type BccColorScheme } from "../scheme";
import { applyThemeToIframe } from "../utils";

// ─── Pure: the --bcc-* name map (spec §6.1) ───────────────────────────────

/**
 * Every paint role → its `--bcc-*` var, in spec §6.1 order. Single source of
 * truth: the var list, the mapping, and the test all read from this.
 * `bgHex` is deliberately absent — it is storage metadata, not a paint role.
 */
const BCC_ROLE_VARS: ReadonlyArray<readonly [keyof BccColorScheme, string]> = [
  ["surface", "--bcc-surface"],
  ["text", "--bcc-text"],
  ["surfaceRaised", "--bcc-surface-raised"],
  ["textRaised", "--bcc-text-raised"],
  ["surfaceInput", "--bcc-surface-input"],
  ["textInput", "--bcc-text-input"],
  ["surfaceFooter", "--bcc-surface-footer"],
  ["surfaceSidebar", "--bcc-surface-sidebar"],
  ["textSidebar", "--bcc-text-sidebar"],
  ["textMuted", "--bcc-text-muted"],
  ["textPlaceholder", "--bcc-text-placeholder"],
  ["icon", "--bcc-icon"],
  ["accentWhisper", "--bcc-accent-whisper"],
  ["accentBan", "--bcc-accent-ban"],
  ["border", "--bcc-border"],
  ["surfaceHover", "--bcc-surface-hover"],
  ["surfaceActive", "--bcc-surface-active"],
] as const;

/** The 17 `--bcc-*` var names, in spec §6.1 order. */
export const BCC_CSS_VARS: readonly string[] = BCC_ROLE_VARS.map(([, v]) => v);

/**
 * Translate a scheme into its `--bcc-*` → value record. Values carry a leading
 * `#` so the browser reads them as hex colors. `bgHex` is intentionally NOT
 * emitted as a styled var (storage metadata, not a paint role).
 */
export function schemeToCssVars(scheme: BccColorScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, varName] of BCC_ROLE_VARS) {
    out[varName] = "#" + scheme[role];
  }
  return out;
}

// ─── Pure: storage shape (spec §6.5) ──────────────────────────────────────

/**
 * The cached scheme persisted under `colorscheme_{user}`. `bgHex` tags the base
 * the cache was built from so `loadTheme` can detect a stale cache when the
 * user picks a new color.
 */
export interface StoredScheme extends BccColorScheme {}

/** Snapshot a scheme for storage, tagged with its base hex (cache-key). */
export function schemeToStorage(scheme: BccColorScheme): StoredScheme {
  return { ...scheme };
}

/**
 * Cache-hit rule: a stored scheme is reusable iff it was built from the same
 * base the user currently has stored. Case-insensitive (storage is uppercased;
 * picker input may be lowercase). `null`/`undefined` (nothing cached yet, or
 * first run after a flag flip) → regenerate.
 */
export function matchesStoredBase(stored: StoredScheme | null | undefined, baseHex: string): boolean {
  if (!stored || typeof stored.bgHex !== "string") return false;
  return stored.bgHex.toUpperCase() === baseHex.toUpperCase();
}

// ─── DOM + GM bridge (thin shems, not unit-tested) ────────────────────────

/**
 * Apply a scheme to the page: write every `--bcc-*` to `:root`, then mirror
 * the base bg/fg into the chat iframe. The iframe vars stay under their old
 * names (`--chatBackground`/`--chatText`) — iframe.css is untouched and the
 * iframe is a black box (spec §6.4).
 */
export function applyScheme(scheme: BccColorScheme): void {
  const root = document.documentElement;
  for (const [varName, value] of Object.entries(schemeToCssVars(scheme))) {
    root.style.setProperty(varName, value);
  }
  // Mirror only base bg/fg into the iframe — it consumes its own vars.
  applyThemeToIframe("#" + scheme.surface, "#" + scheme.text);
}

/**
 * Persist the user's chosen base color under `color_{user}` (source of truth)
 * and regenerate + cache + apply the scheme for it.
 *
 * `colorKey`/`schemeKey` are the already-user-scoped GM keys
 * (`{user}_color` / `{user}_colorscheme`), matching the old path.
 */
export async function saveColor(
  baseHex: string,
  colorKey: string,
  schemeKey: string,
): Promise<BccColorScheme> {
  await GM.setValue(colorKey, baseHex);
  const scheme = generateScheme(baseHex);
  await GM.setValue(schemeKey, schemeToStorage(scheme));
  applyScheme(scheme);
  return scheme;
}

/**
 * Load the theme on init. Reads the stored base color; if the cached scheme
 * matches it, applies the cache directly (no regeneration); otherwise
 * regenerates from `generateScheme` and refreshes the cache. Defaults to
 * `defaultBase` on first run.
 */
export async function loadTheme(
  colorKey: string,
  schemeKey: string,
  defaultBase = "6AAED8",
): Promise<BccColorScheme> {
  const base = (await GM.getValue(colorKey, defaultBase)) as string;
  await GM.setValue(colorKey, base); // persist the default on first run

  const stored = (await GM.getValue(schemeKey, null)) as StoredScheme | null;
  if (matchesStoredBase(stored, base) && stored) {
    applyScheme(stored);
    return stored;
  }

  const scheme = generateScheme(base);
  await GM.setValue(schemeKey, schemeToStorage(scheme));
  applyScheme(scheme);
  return scheme;
}
