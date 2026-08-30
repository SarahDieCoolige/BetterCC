// ─── German health-status UI strings ─────────────────────────────────────────
//
// Verbatim from the approved copy list (docs/ideas/error-handling.md, 2026-08-17).
// Components import from here and never invent wording.
// "Neu laden" = WS-bounce reloadChat; "Seite neu laden" = full page reload.

import type { InvalidSetting } from "./health-core";

export const STATUS_BUTTON_TITLE = "Chat neu laden \u2014 {state}";

export const STATUS_TEXT = {
  connected: "verbunden",
  connecting: "verbinde\u2026",
  retry: "Versuch {n}",
  authdead: "Session abgelaufen",
} as const;

export function statusButtonTitle(state: string): string {
  return STATUS_BUTTON_TITLE.replace("{state}", state);
}

export function retryText(n: number): string {
  return STATUS_TEXT.retry.replace("{n}", String(n));
}

/** "12 s" / "3 min" — compact age used by stale tooltips and the Info tab. */
export function formatAgo(ageMs: number): string {
  const secs = Math.floor(ageMs / 1000);
  return secs < 60 ? secs + " s" : Math.floor(secs / 60) + " min";
}

// Auth-dead veil + card strings (T5).
export const CARD_AUTHDEAD_TITLE = "Session abgelaufen";
export const CARD_AUTHDEAD_TEXT =
  "L\u00e4sst sich nicht automatisch erneuern. Seite neu laden meldet dich direkt wieder an \u2014 dein Text bleibt erhalten.";
export const ACTION_PAGE_RELOAD = "Seite neu laden";
export const ACTION_LATER = "Sp\u00e4ter";

// Boot failure card (B1) + send-path broken card (B3) strings (T6).
export const CARD_BOOT_TITLE = "BetterCC konnte nicht starten";
export const BOOT_REASON_STRUCTURE =
  "Unerwartete Seitenstruktur \u2014 vermutlich hat ChatCity etwas ge\u00e4ndert.";
export const BOOT_REASON_WS = "Chat-WebSocket konnte nicht \u00fcbernommen werden.";
export const CARD_BOOT_RUNS_ON = "Der Chat l\u00e4uft weiter \u2014 nur ohne BetterCC.";
export const ACTION_COPY_DETAILS = "Details kopieren";
export const ACTION_CONTINUE_CHAT = "Weiter chatten";
export const CARD_SEND_BROKEN_TITLE = "Senden defekt";
export const CARD_SEND_BROKEN_TEXT =
  "ChatCity hat den Sendeweg ge\u00e4ndert. Hilft nur ein BetterCC-Update.";
export const ACTION_COPY_ERROR = "Fehler kopieren";

/** German card text for a store-latched code. The generic "error" code maps
 * to null: its card is rendered by handleBootFailure from the live error; a
 * later react can't recover that text from the code alone. */
export function bootDisplayFor(code: string): string | null {
  if (code === "structure-changed") return BOOT_REASON_STRUCTURE;
  if (code === "ws-takeover") return BOOT_REASON_WS;
  return null;
}

// Warning banner + offline hint strings (T7).
export const BANNER_OPTICS_TEXT =
  "Chat ohne BetterCC-Design \u2014 Senden l\u00e4uft normal, Neu laden behebt es";
export const ACTION_RELOAD = "Neu laden";

// Staleness marker tooltips (T10). Hover-only; the markers carry no text.
// Factual copy: the clock icon signals staleness, the tooltip just states
// how long ago the last successful refresh was.
export const STALE_LABEL_ULIST = "Nutzerliste";
export const STALE_LABEL_AW = "Globale Nutzerliste";
export const STALE_LABEL_STATS = "Statistiken";

export function staleText(label: string, ageMs: number): string {
  return label + " \u2014 zuletzt aktualisiert vor " + formatAgo(ageMs);
}

/** The three live-state lines shared by the diagnostics report (Info tab)
 *  and the error report (health cards). One source so the two cannot
 *  drift apart; unknown on purpose, the error path may hold partial
 *  state. */
export function reportStateLines(conn: unknown, bccHealth: unknown, freshness: unknown): string[] {
  return [
    "conn: " + JSON.stringify(conn),
    "bccHealth: " + JSON.stringify(bccHealth),
    "freshness: " + JSON.stringify(freshness),
  ];
}

// D4 settings notices (T11), riding the strip's transient slot. Invalid
// stored values are NOT written back or repaired: the notice names the raw
// key and the garbage value verbatim, the session runs on defaults until
// the user changes the setting.
export function invalidSettingsText(entries: InvalidSetting[]): string {
  const parts = entries.map((e) => e.key + ": " + formatStoredValue(e.value));
  const noun = entries.length === 1 ? "Ung\u00fcltige Einstellung" : "Ung\u00fcltige Einstellungen";
  return noun + " \u2014 " + parts.join(", ");
}

/** JSON form, capped so a huge garbage value cannot blow up the pill. */
function formatStoredValue(value: unknown): string {
  const s = JSON.stringify(value) ?? String(value);
  return s.length > 40 ? s.slice(0, 39) + "\u2026" : s;
}

export const PERSIST_FAILED_TEXT = "Speichern fehlgeschlagen \u2014 gilt nur bis zum Neuladen.";

// ─── Info tab (settings modal) strings ──────────────────────────────────────
// Read-only diagnostics rows. Facts only: the "what to do" copy for real
// problems lives on the strip/cards, these rows just state status (mainly
// for bug reports).

/** Row value when a check passed. */
export const INFO_OK = "ok";
/** Row value for valid stored settings. */
export const INFO_SETTINGS_VALID = "g\u00fcltig";
/** Row value when the chatframe injection runs degraded. */
export const INFO_INJECTION_DEGRADED = "eingeschr\u00e4nkt";
/** Freshness/last-message value when a source never delivered. */
export const INFO_NEVER = "nie";
/** Userscript-manager fallback when GM_info exposes none. */
export const INFO_MANAGER_UNKNOWN = "unbekannt";

export const INFO_LABEL_STATUS = "Status";
export const INFO_LABEL_LAST_MESSAGE = "Letzte Chat-Nachricht";
export const INFO_LABEL_BOOT = "Start";
export const INFO_LABEL_SEND_PATH = "Sendepfad";
export const INFO_LABEL_INJECTION = "Chatframe-Injektion";
export const INFO_LABEL_SETTINGS = "Einstellungen";
export const INFO_LABEL_PERSIST = "Speichern";
