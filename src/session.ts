// ─── v3 session module (spec §2.3) ─────────────────────────────────────────
//
// Reads the six session globals once at init and polls auth-dead + channel
// every 2s. The poll approach is simpler than extending the WS handler (that's
// iteration-2 scope): chatout_auth_dead is a plain boolean global, and
// channels change rarely (only on /j).
//
// S7a migration: this is now a pure store adapter. initSession() reads
// upstream globals and writes the snapshot to the store via set("session", ...).
// getSession() returns get("session"). No bus events emitted.

import { type SessionState, get, set } from "./store";
import { cclog } from "./utils";
import { getChatNick, getChannel, isAuthDead, getChatUi, getChatId, getChatSid } from "./upstream";

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Read session globals once at init and start the 2s poll for auth-dead and
 * channel changes. Writes the snapshot to the store on change.
 */
export function initSession(): void {
  // Idempotency guard: a re-init (HMR, double initV3) would otherwise stack a
  // second polling interval. Clear the old one.
  if (timer) clearInterval(timer);

  const snapshot: SessionState = {
    nick: getChatNick(),
    registered: getChatUi().includes("R"),
    guest: getChatUi().includes("h") && !getChatUi().includes("R"),
    userId: getChatId(),
    sessionId: getChatSid(),
    channel: getChannel(),
    authDead: isAuthDead(),
  };

  // Seed the store with the initial snapshot.
  set("session", snapshot);

  let prevChannel = snapshot.channel;
  let prevAuthDead = snapshot.authDead;
  timer = setInterval(() => {
    const newChannel = getChannel();
    const newAuthDead = isAuthDead();
    if (newChannel !== prevChannel || newAuthDead !== prevAuthDead) {
      prevChannel = newChannel;
      prevAuthDead = newAuthDead;
      set("session", {
        nick: getChatNick(),
        registered: getChatUi().includes("R"),
        guest: getChatUi().includes("h") && !getChatUi().includes("R"),
        userId: getChatId(),
        sessionId: getChatSid(),
        channel: newChannel,
        authDead: newAuthDead,
      });
    }
  }, 2000);

  cclog("session: init done — nick=" + snapshot.nick + " channel=" + snapshot.channel, "v3");
}

/**
 * Return the most recent session snapshot from the store. Non-reactive —
 * callers that need live updates should use store on()/react().
 */
export function getSession(): SessionState {
  return get("session");
}
