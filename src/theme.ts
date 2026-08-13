// ─── v3 theme bridge (spec §6.4 / §6.5) ────────────────────────────────────
//
// Connects the pure `generateScheme()` engine to the DOM and GM storage:
//   scheme → --bcc-* on .bcc-shell     (applyScheme)
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
// The v2 theme engine is deleted; v3 is the only path. The cache format
// differs from the old HSL-string cache (v3 stores hex roles), so a user
// upgrading from v2 will regenerate the cache once on first v3 load — by
// design, since each path only trusts its own cache shape.

import {
  generateScheme,
  enableV2Scheme,
  disableV2Scheme,
  isV2Scheme,
  type BccColorScheme,
} from "./scheme";
import { applyThemeToIframe, getUserKey } from "./utils";
import { getConfig, setConfig } from "./config";
import { emit } from "./store";

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
  ["textAway", "--bcc-text-away"],
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
 *
 * Structurally identical to BccColorScheme — it's a type alias, not an
 * extension, so the storage shape can diverge from the paint shape later
 * without touching call sites.
 */
export type StoredScheme = BccColorScheme;

/** Snapshot a scheme for storage, tagged with its base hex (cache-key). */
export function schemeToStorage(scheme: BccColorScheme): StoredScheme {
  return { ...scheme };
}

/**
 * Cache-hit rule: a stored scheme is reusable iff it was built from the same
 * base the user currently has stored. Case-insensitive (storage is uppercased;
 * picker input may be lowercase). `null`/`undefined` (nothing cached yet, or
 * first run / after the base color changed) → regenerate.
 */
export function matchesStoredBase(
  stored: StoredScheme | null | undefined,
  baseHex: string,
): boolean {
  if (!stored || typeof stored.bgHex !== "string") return false;
  return stored.bgHex.toUpperCase() === baseHex.toUpperCase();
}

// ─── DOM + GM bridge (thin shems, not unit-tested) ────────────────────────

/**
 * Apply a scheme to the page: write every `--bcc-*` to `.bcc-shell`, then
 * mirror the base bg/fg into the chat iframe.
 *
 * WHY .bcc-shell, not :root — the live ChatCity page periodically clears
 * `:root`'s inline style (correlated with the chat_info_friends XHR and with
 * user-popup opens). When our vars lived on `:root`, that clear wiped them
 * and the cascade fell back to the (blue) defaults in v3.css — the "theme
 * resets to default blue" bug. `.bcc-shell` is our own element; upstream
 * never touches it, so vars set here survive a `:root` clear. The v2 code
 * papered over this with a MutationObserver that re-asserted the vars after
 * each clear; owning the element is the clean fix that replaces that hack.
 *
 * Falls back to `documentElement` only if the shell isn't built yet (initV3
 * orders buildShell() before loadTheme(), so the shell exists by the time
 * this runs in practice — the fallback is defensive).
 *
 * The iframe vars stay under their old names (`--chatBackground`/
 * `--chatText`) on the iframe's own `:root` — iframe.css is untouched and the
 * iframe is a black box (spec §6.4). The iframe is a separate document, so a
 * parent-page `:root` clear never reaches it (which is why the chatframe
 * kept its colors while the rest of the UI reset).
 */
export function applyScheme(scheme: BccColorScheme): void {
  const target = document.querySelector(".bcc-shell") as HTMLElement | null;
  const root = target ?? document.documentElement;
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
  emit({ type: "config", key: "color" });
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

// ─── Scheme-version toggle (live switching without page reload) ────────────

/**
 * Set the scheme generator version explicitly (v1 stable / v2 experimental),
 * regenerate from the stored base color, persist the cache, and apply live.
 * `toggleSchemeVersion` delegates here; Save calls this with the draft value.
 */
export async function setSchemeVersion(v2: boolean): Promise<void> {
  await setConfig("scheme_v2", v2);
  if (v2) enableV2Scheme();
  else disableV2Scheme();
  const base = (await getConfig("color", "6AAED8")) as string;
  const scheme = generateScheme(base);
  const schemeKey = getUserKey("colorscheme");
  await GM.setValue(schemeKey, schemeToStorage(scheme));
  applyScheme(scheme);
  emit({ type: "config", key: "scheme_v2" });
}

/**
 * Toggle between v1 and v2 scheme generators at runtime, regenerate fresh,
 * apply with CSS transitions, and persist the preference to GM storage.
 *
 * Called from the footer pill: no page reload needed.
 */
export function toggleSchemeVersion(): Promise<void> {
  return setSchemeVersion(!getSchemeVersion());
}

/** Query whether the v2 scheme generator is currently active. */
export function getSchemeVersion(): boolean {
  return isV2Scheme();
}
