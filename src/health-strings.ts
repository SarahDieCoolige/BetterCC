// ─── German health-status UI strings ─────────────────────────────────────────
//
// Verbatim from the approved copy list (docs/ideas/error-handling.md, 2026-08-17).
// Components import from here and never invent wording.
// "Neu laden" = WS-bounce reloadChat; "Seite neu laden" = full page reload.

export const STATUS_BUTTON_TITLE = "Chat neu laden \u2014 {state}";

export const STATUS_TEXT = {
  connected: "verbunden",
  connecting: "verbinde\u2026",
  retry: "Versuch {n}",
  authdead: "Session abgelaufen",
  zombie: "reagiert nicht",
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
export const TOAST_COPIED = "Kopiert.";
export const STATE_UNAVAILABLE = "Zustand nicht verf\u00fcgbar";

// Warning banner + offline hint strings (T7).
export const BANNER_STUCK_TEXT = "Verbindung h\u00e4ngt \u2014 seit \u00fcber 30 Sekunden";
export const BANNER_OPTICS_TEXT = "BetterCC-Optik fehlt \u2014 Chat l\u00e4uft normal";
export const ACTION_RELOAD = "Neu laden";
export const INPUT_OFFLINE_HINT = "Offline \u2014 Nachrichten gehen evtl. verloren";
