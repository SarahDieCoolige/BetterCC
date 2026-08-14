// ─── v3 theme bridge (spec §6.4 / §6.5) ────────────────────────────────────
//
// Connects the pure `generateScheme()` engine to the DOM and the sync store:
//   scheme → --bcc-* on .bcc-shell     (applyScheme)
//   color/scheme_v2 → store (get/set)  (initTheme, setColor, setSchemeVersion)
//
// No scheme cache: the store seeds the base color sync at boot, and the
// scheme is regenerated from it (microseconds) — no promise dance needed.

import { generateScheme, enableV2Scheme, disableV2Scheme, type BccColorScheme } from "./scheme";
import { applyThemeToIframe } from "./utils";
import { get, set, react } from "./store";

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

// ─── DOM + store bridge (thin shems, not unit-tested) ───────────────────

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
 * orders buildShell() before initTheme(), so the shell exists by the time
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

// ─── Store-driven theme API ──────────────────────────────────────────────

/**
 * Select the scheme generator by the stored `scheme_v2` flag, regenerate from
 * the stored `color`, and apply. Called by reacts on both keys and by
 * injectIntoChatframe on reconnect.
 */
export function applyCurrentScheme(): void {
  if (get("scheme_v2")) enableV2Scheme();
  else disableV2Scheme();
  const scheme = generateScheme(get("color"));
  applyScheme(scheme);
}

/**
 * Wire the theme to the store. Registers reacts so any change to `color` or
 * `scheme_v2` re-applies the scheme. Call once at init (after initStore).
 */
export function initTheme(): void {
  react("color", applyCurrentScheme);
  react("scheme_v2", applyCurrentScheme);
}

/** Persist a new base color and let the react re-apply the scheme. */
export async function setColor(hex: string): Promise<void> {
  await set("color", hex);
}

/** Toggle between v1 and v2 scheme generators at runtime. */
export function toggleSchemeVersion(): Promise<void> {
  return setSchemeVersion(!get("scheme_v2"));
}

/** Set the scheme generator version (v1 stable / v2 experimental). The
 *  initTheme reacts re-apply the scheme. */
export async function setSchemeVersion(v2: boolean): Promise<void> {
  await set("scheme_v2", v2);
}
