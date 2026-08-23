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
  const secs = Math.floor(ageMs / 1000);
  const ago = secs < 60 ? secs + " s" : Math.floor(secs / 60) + " min";
  return label + " \u2014 zuletzt aktualisiert vor " + ago;
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
