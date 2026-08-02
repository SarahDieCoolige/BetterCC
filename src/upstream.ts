// ─── Upstream global accessors ─────────────────────────────────────────────
//
// Thin typed wrappers over the page's own globals (set by ChatCity on
// unsafeWindow). Centralizing the casts + fallbacks here means a shape change
// (e.g. a global getting renamed upstream) lands in one place, not ~12.
//
// One-shot FUNCTION calls (delout, com_set, color_set, bye, chatout_setstatus,
// resize_fix) are NOT wrapped here — they're called directly at their call
// sites, where the "this touches upstream" intent is part of the code's meaning.
// Only the read-only STATE reads that repeat across files get a getter.

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
