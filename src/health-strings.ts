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
