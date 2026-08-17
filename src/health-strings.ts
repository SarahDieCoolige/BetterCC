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
