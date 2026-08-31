// ─── Settings modal — pure helpers (T10) ───────────────────────────────────
//
// The testable core of the settings modal: draft shape, validation, dirty
// detection, pinned dedup, and the export/import round-trip. No DOM, no GM, no
// store, no side effects — unit-tested directly (tests/settings.test.ts). The
// modal shell, panel builders, and instant-apply write helpers live in
// settings.ts and import from here.

import { generateScheme as generateV1, type BccColorScheme } from "./scheme-v1";
import { generateScheme as generateV2 } from "./scheme-v2";
import type { BccHealthState, ConnState, FreshnessState } from "./health-core";
import {
  STATUS_TEXT,
  retryText,
  formatAgo,
  bootDisplayFor,
  invalidSettingsText,
  reportStateLines,
  PERSIST_FAILED_TEXT,
  STALE_LABEL_ULIST,
  STALE_LABEL_AW,
  STALE_LABEL_STATS,
  INFO_OK,
  INFO_SETTINGS_VALID,
  INFO_INJECTION_DEGRADED,
  INFO_NEVER,
  INFO_LABEL_STATUS,
  INFO_LABEL_LAST_MESSAGE,
  INFO_LABEL_BOOT,
  INFO_LABEL_SEND_PATH,
  INFO_LABEL_INJECTION,
  INFO_LABEL_SETTINGS,
  INFO_LABEL_PERSIST,
} from "./health-strings";
import { isStringArray, isZoomStep } from "./store";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** The panel's current applied values (a mirror of GM state). Compared against
 *  the open-time snapshot (`loaded`) to drive the Undo button. Covers every
 *  persisted store key, so export/import/reset/undo are complete, including
 *  the two keys without modal controls (compact toggles via the chatbar
 *  chevron, ban has no feature UI yet). */
export interface SettingsDraft {
  color: string; // hex without "#", e.g. "6AAED8"
  schemeV2: boolean; // generator version (v1 stable / v2 experimental)
  pinned: string[]; // pinned names; order = array order
  whisper: string; // superwhisper target, "" = none
  sendOnEnter: boolean; // true (default) = Enter sends
  hoverPreview: boolean; // true (default) = hover preview on
  compact: boolean; // true = collapsed chatbar (chevron in footer.ts)
  ban: string[]; // superban list (T12, not built yet; stays [])
  zoom: number; // font-size slider step (spec: font-size-slider)
  idcardTheme: boolean; // ID-family pages restyled (WIP, opt-in)
}

/** Versioned export format for backup. */
export interface ExportBlob {
  _format: "bettercc-settings";
  version: 1;
  exportedAt: string; // ISO timestamp
  user: string; // chat_nick at export time
  settings: Record<string, unknown>; // every persisted store key, snake_case names
}

/** Result of an import operation. */
export type ImportResult = { ok: true; draft: SettingsDraft } | { ok: false; error: string };

// ═══════════════════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════════════════

/** Returns a fresh draft populated with all defaults. */
export function defaultDraft(): SettingsDraft {
  return {
    color: "6AAED8",
    schemeV2: false,
    pinned: [],
    whisper: "",
    sendOnEnter: true,
    hoverPreview: true,
    compact: false,
    ban: [],
    zoom: 1,
    idcardTheme: false,
  };
}

/**
 * Compute the scheme a given (color, version) would produce, without touching
 * the live generator switch. Used by the Erscheinungsbild preview so picking a
 * color or toggling v1/v2 shows the result without re-theming the page.
 */
export function schemeForPreview(base: string, useV2: boolean): BccColorScheme {
  return useV2 ? generateV2(base) : generateV1(base);
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

/** Validate a hex color value. Returns null if OK, else an error string. */
export function validateColor(hex: string): string | null {
  return /^[0-9A-Fa-f]{6}$/.test(hex.replace(/^#/, "")) ? null : "Kein gültiger Hex-Wert";
}

/** True when the draft is self-consistent (e.g. valid color hex). */
export function isDraftValid(draft: SettingsDraft): boolean {
  return validateColor(draft.color) === null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dirty detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when `draft` differs from `loaded` in any field.
 * Pinned is compared by content + order (deep array compare).
 */
export function isDirty(loaded: SettingsDraft, draft: SettingsDraft): boolean {
  return (
    loaded.color !== draft.color ||
    loaded.schemeV2 !== draft.schemeV2 ||
    loaded.whisper !== draft.whisper ||
    loaded.sendOnEnter !== draft.sendOnEnter ||
    loaded.hoverPreview !== draft.hoverPreview ||
    loaded.compact !== draft.compact ||
    loaded.zoom !== draft.zoom ||
    loaded.idcardTheme !== draft.idcardTheme ||
    !pinnedEqual(loaded.pinned, draft.pinned) ||
    !pinnedEqual(loaded.ban, draft.ban)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Deduplication
// ═══════════════════════════════════════════════════════════════════════════

/** Case-insensitive deduplication of pinned names; preserves first occurrence order. */
export function dedupPinned(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (name === "" || seen.has(lower)) continue;
    seen.add(lower);
    result.push(name);
  }
  return result;
}

/** Append a name to a pinned list, lowercased + deduped, order preserved.
 *  Pinned entries are keys, not display names: sidebar.ts togglePin stores
 *  user.key (name.toLowerCase()), and every consumer looks them up by the
 *  lowercased key. Storing a proper-case entry would never match, so a typed
 *  name is normalized to its key form here. */
export function addPinned(list: string[], name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return list;
  return dedupPinned([...list, trimmed.toLowerCase()]);
}

/** Remove the case-insensitive name match from a pinned list (new array). */
export function removePinned(list: string[], name: string): string[] {
  const lower = name.toLowerCase();
  return list.filter((n) => n.toLowerCase() !== lower);
}

/** True when two pinned lists are equal by content and order. */
export function pinnedEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Draft-from-config mapping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map raw config values into a SettingsDraft.
 * Pins the pinned array so the caller can copy it independently.
 * Pure — no side effects, no GM_*, no DOM.
 */
export function draftFromConfig(raw: {
  color?: unknown;
  scheme_v2?: unknown;
  pinned?: unknown;
  whisper?: unknown;
  send_on_enter?: unknown;
  hover_preview?: unknown;
  compact?: unknown;
  ban?: unknown;
  zoom?: unknown;
  idcard_theme?: unknown;
}): SettingsDraft {
  return {
    color: typeof raw.color === "string" ? raw.color.replace(/^#/, "") : defaultDraft().color,
    schemeV2: typeof raw.scheme_v2 === "boolean" ? raw.scheme_v2 : defaultDraft().schemeV2,
    pinned: isStringArray(raw.pinned) ? [...raw.pinned] : [],
    whisper: typeof raw.whisper === "string" ? raw.whisper : defaultDraft().whisper,
    sendOnEnter:
      typeof raw.send_on_enter === "boolean" ? raw.send_on_enter : defaultDraft().sendOnEnter,
    hoverPreview:
      typeof raw.hover_preview === "boolean" ? raw.hover_preview : defaultDraft().hoverPreview,
    compact: typeof raw.compact === "boolean" ? raw.compact : defaultDraft().compact,
    ban: isStringArray(raw.ban) ? [...raw.ban] : [],
    zoom: isZoomStep(raw.zoom) ? raw.zoom : defaultDraft().zoom,
    idcardTheme:
      typeof raw.idcard_theme === "boolean" ? raw.idcard_theme : defaultDraft().idcardTheme,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Export / Import
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Config-key to draft-field mapping.
 * Config keys are snake_case; export blob uses these same names.
 */
const DRAFT_TO_CONFIG: Record<keyof SettingsDraft, string> = {
  color: "color",
  schemeV2: "scheme_v2",
  pinned: "pinned",
  whisper: "whisper",
  sendOnEnter: "send_on_enter",
  hoverPreview: "hover_preview",
  compact: "compact",
  ban: "ban",
  zoom: "zoom",
  idcardTheme: "idcard_theme",
};

/** Config key back to draft field name — derived as the inverse of
 *  DRAFT_TO_CONFIG so the two maps can't drift. */
const CONFIG_TO_DRAFT: Record<string, keyof SettingsDraft> = Object.fromEntries(
  Object.entries(DRAFT_TO_CONFIG).map(([d, c]) => [c, d as keyof SettingsDraft]),
);

/** Serialize a draft into a versioned export blob. */
export function serializeExport(draft: SettingsDraft, user: string): ExportBlob {
  const settings: Record<string, unknown> = {};
  for (const [draftKey, configKey] of Object.entries(DRAFT_TO_CONFIG)) {
    settings[configKey] = draft[draftKey as keyof SettingsDraft];
  }
  return {
    _format: "bettercc-settings",
    version: 1,
    exportedAt: new Date().toISOString(),
    user,
    settings,
  };
}

/** Build the export filename: bettercc-backup-{user}-{YYYY-MM-DD}.json.
 *  Empty user falls back to "gast" (matches the GM key suffix for guests). */
export function exportFileName(user: string, dateStr: string): string {
  return "bettercc-backup-" + (user || "gast") + "-" + dateStr + ".json";
}

/**
 * Parse a JSON string into a SettingsDraft (full-replace semantics).
 * Validates _format and version; coerces each field type; drops unknown keys;
 * fills missing keys with defaults. Returns an error result for structural
 * problems (malformed JSON, wrong format/version).
 */
export function parseImport(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Ungültiges JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Kein gültiges Objekt" };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj._format !== "bettercc-settings") {
    return { ok: false, error: 'Falsches Format: erwartet "bettercc-settings"' };
  }

  if (obj.version !== 1) {
    return { ok: false, error: "Nicht unterstützte Version (erwartet 1)" };
  }

  // Build a fresh draft from defaults, overriding only present + validly-typed fields
  const defaults = defaultDraft();
  const rawSettings = obj.settings;
  if (typeof rawSettings !== "object" || rawSettings === null || Array.isArray(rawSettings)) {
    return { ok: false, error: 'Fehlendes oder ungültiges "settings"-Objekt' };
  }

  const settings = rawSettings as Record<string, unknown>;
  const draft: SettingsDraft = { ...defaults };

  for (const [configKey, draftKey] of Object.entries(CONFIG_TO_DRAFT)) {
    if (!(configKey in settings)) continue; // missing key → keep default
    const value = settings[configKey];
    if (coerceField(draftKey, value, draft)) continue; // coerced successfully
    // wrong type → keep default (already set from defaultDraft)
  }

  return { ok: true, draft };
}

/**
 * Try to coerce a single imported value into the draft. Returns true if the
 * value was valid and written; false if the type was wrong (caller keeps default).
 */
function coerceField(key: keyof SettingsDraft, value: unknown, draft: SettingsDraft): boolean {
  switch (key) {
    case "color":
      if (typeof value === "string" && validateColor(value) === null) {
        draft.color = value.replace(/^#/, "");
        return true;
      }
      return false;
    case "schemeV2":
      if (typeof value === "boolean") {
        draft.schemeV2 = value;
        return true;
      }
      return false;
    case "pinned":
      if (isStringArray(value)) {
        draft.pinned = value;
        return true;
      }
      return false;
    case "whisper":
      if (typeof value === "string") {
        draft.whisper = value;
        return true;
      }
      return false;
    case "sendOnEnter":
      if (typeof value === "boolean") {
        draft.sendOnEnter = value;
        return true;
      }
      return false;
    case "hoverPreview":
      if (typeof value === "boolean") {
        draft.hoverPreview = value;
        return true;
      }
      return false;
    case "compact":
      if (typeof value === "boolean") {
        draft.compact = value;
        return true;
      }
      return false;
    case "ban":
      if (isStringArray(value)) {
        draft.ban = value;
        return true;
      }
      return false;
    case "zoom":
      if (isZoomStep(value)) {
        draft.zoom = value;
        return true;
      }
      return false;
    case "idcardTheme":
      if (typeof value === "boolean") {
        draft.idcardTheme = value;
        return true;
      }
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Info tab: diagnostics rows + bug-report text
// ═══════════════════════════════════════════════════════════════════════════

/** One read-only row in the Info tab. `bad` tints the value as a problem. */
export interface InfoRow {
  key: string;
  val: string;
  bad?: boolean;
}

/** "vor 12 s" / "vor 3 min" / "nie" (stamp 0 = the source never delivered). */
export function ageOrNever(stamp: number, now: number): string {
  if (stamp <= 0) return INFO_NEVER;
  return "vor " + formatAgo(Math.max(0, now - stamp));
}

/** Connection + freshness rows for the Info tab. */
export function connInfoRows(conn: ConnState, freshness: FreshnessState, now: number): InfoRow[] {
  const status =
    conn.phase === "connecting" && conn.attempt > 0
      ? retryText(conn.attempt)
      : STATUS_TEXT[conn.phase];
  return [
    { key: INFO_LABEL_STATUS, val: status, bad: conn.phase !== "connected" },
    { key: INFO_LABEL_LAST_MESSAGE, val: ageOrNever(conn.lastMessageAt, now) },
    { key: STALE_LABEL_ULIST, val: ageOrNever(freshness.ulistAt, now) },
    { key: STALE_LABEL_AW, val: ageOrNever(freshness.awAt, now) },
    { key: STALE_LABEL_STATS, val: ageOrNever(freshness.statsAt, now) },
  ];
}

/** BetterCC self-check rows (bccHealth facts). Each row states its
 *  broken-condition once; val and bad both follow from it. */
export function healthInfoRows(health: BccHealthState): InfoRow[] {
  const checkRow = (key: string, broken: boolean, problem: string, ok: string): InfoRow => ({
    key,
    val: broken ? problem : ok,
    bad: broken,
  });
  return [
    checkRow(
      INFO_LABEL_BOOT,
      health.bootError !== null,
      health.bootError ? (bootDisplayFor(health.bootError) ?? health.bootError) : "",
      INFO_OK,
    ),
    checkRow(
      INFO_LABEL_SEND_PATH,
      health.sendPathBroken !== null,
      health.sendPathBroken ?? "",
      INFO_OK,
    ),
    checkRow(INFO_LABEL_INJECTION, health.injectionDegraded, INFO_INJECTION_DEGRADED, INFO_OK),
    checkRow(
      INFO_LABEL_SETTINGS,
      health.invalidSettings.length > 0,
      invalidSettingsText(health.invalidSettings),
      INFO_SETTINGS_VALID,
    ),
    checkRow(INFO_LABEL_PERSIST, health.persistFailed, PERSIST_FAILED_TEXT, INFO_OK),
  ];
}

/** Facts for the Info tab's copy-for-bug-report button. Assembled impurely
 *  in settings.ts (GM_info, location, navigator); rendered purely here.
 *  English keys on purpose: the report is pasted into GitHub issues, not
 *  read in the UI (same contract as buildErrorReport in health-ui.ts). */
export interface DiagnosticsFields {
  version: string;
  manager: string;
  user: string;
  channel: string;
  storageKey: string;
  url: string;
  userAgent: string;
  time: string;
  conn: ConnState;
  bccHealth: BccHealthState;
  freshness: FreshnessState;
}

/** Plain-text diagnostics block, one fact per line. */
export function buildDiagnosticsText(f: DiagnosticsFields): string {
  return [
    "BetterCC v" + f.version,
    "manager: " + f.manager,
    "user: " + f.user,
    "channel: " + f.channel,
    "storage-key: " + f.storageKey,
    "url: " + f.url,
    "ua: " + f.userAgent,
    "time: " + f.time,
    ...reportStateLines(f.conn, f.bccHealth, f.freshness),
  ].join("\n");
}
