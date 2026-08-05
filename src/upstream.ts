// ─── Upstream boundary layer — complete API for the ChatCity page ──────────
//
// Every read of page globals and every write of chat commands goes through
// this module. Exceptions (bootstrapping, WebSocket, AJAX) are documented
// and deliberate — not leaks.
//
import { cclog } from "./utils";

// ── State reads — typed getters for unsafeWindow globals.

/** The current user's nick (empty string if not set, e.g. before init). */
export function getChatNick(): string {
  return String((unsafeWindow as any).chat_nick ?? "");
}

/** The active channel name (empty string if not set). */
export function getChannel(): string {
  return String((unsafeWindow as any).chat_channel ?? "");
}

/** True when the session is dead (terminal — no auto-reconnect). */
export function isAuthDead(): boolean {
  return !!(unsafeWindow as any).chatout_auth_dead;
}

/** The chat WebSocket instance, or null before connect. */
export function getChatoutWs(): WebSocket | null {
  return (unsafeWindow as any).chatout_ws ?? null;
}

/** The BetterCC API object exposed on unsafeWindow.bettercc. */
export function getBettercc(): any {
  return (unsafeWindow as any).bettercc;
}

/** The chat UI mode string ("h" = guest, "R" = registered, etc.). */
export function getChatUi(): string {
  return String((unsafeWindow as any).chat_ui ?? "");
}

/** The numeric user ID. */
export function getChatId(): string {
  return String((unsafeWindow as any).chat_id ?? "");
}

/** The session ID string. */
export function getChatSid(): string {
  return String((unsafeWindow as any).chat_sid ?? "");
}

/** The channel user-list array (alternating nick/status from cha_my). */
export function getChaMy(): string[] {
  return (unsafeWindow as any).cha_my ?? [];
}

/** Channel categories — flat array of channel objects. */
export function getChannelCategories(): any[] {
  return (unsafeWindow as any).ccc ?? [];
}

/** Channel group labels — paired [id, label] array. */
export function getChannelGroups(): string[] {
  return (unsafeWindow as any).ccg ?? [];
}

// ── Commands — typed write helpers for upstream functions.

/** Send a slash command through upstream com_set.
 *  "/away", "/j Klassik", "/color AA0000", "/ignore Name", etc. */
export function sendCommand(cmd: string): void {
  const w = unsafeWindow as any;
  if (typeof w.com_set === "function") {
    w.com_set(cmd);
  } else {
    cclog("sendCommand: com_set unavailable — dropped: " + cmd, "v3");
  }
}

/** Leave the chat — send /bye, then close the window after 1s. */
export function leaveChat(): void {
  sendCommand("/bye");
  setTimeout(() => window.close(), 1000);
}
