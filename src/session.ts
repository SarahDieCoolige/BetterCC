// ─── v3 session module (spec §2.3) ─────────────────────────────────────────
//
// Reads the six session globals once at init and polls auth-dead + channel
// every 2s. The poll approach is simpler than extending the WS handler (that's
// iteration-2 scope): chatout_auth_dead is a plain boolean global, and
// channels change rarely (only on /j).
//
// The sidebar (T7) subscribes for auth-dead context; the header channel label
// (T6 → T4b) subscribes to update on channel changes.

import { emit, type SessionState } from "./bus";
import { cclog } from "./utils";
import { getChatNick, getChannel, isAuthDead, getChatUi, getChatId, getChatSid } from "./upstream";

let session: SessionState;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Read session globals once at init and start the 2s poll for auth-dead and
 * channel changes. An initial "session" event fires synchronously so subscribers
 * can seed their state immediately.
 */
export function initSession(): void {
  // Idempotency guard: a re-init (HMR, double initV3) would otherwise stack a
  // second polling interval and double-emit on every change. Clear the old one.
  if (timer) clearInterval(timer);

  session = {
    nick: getChatNick(),
    registered: getChatUi().includes("R"),
    guest: getChatUi().includes("h") && !getChatUi().includes("R"),
    userId: getChatId(),
    sessionId: getChatSid(),
    channel: getChannel(),
    authDead: isAuthDead(),
  };

  // Seed all subscribers with the current state.
  emit({ type: "session", session: { ...session } });

  let prevChannel = session.channel;
  let prevAuthDead = session.authDead;
  timer = setInterval(() => {
    const newChannel = getChannel();
    const newAuthDead = isAuthDead();
    if (newChannel !== prevChannel || newAuthDead !== prevAuthDead) {
      prevChannel = session.channel = newChannel;
      prevAuthDead = session.authDead = newAuthDead;
      emit({ type: "session", session: { ...session } });
    }
  }, 2000);

  cclog("session: init done — nick=" + session.nick + " channel=" + session.channel, "v3");
}

/**
 * Return the most recently read session snapshot. Non-reactive — subscribers
 * get updates via the store; this is for callers that need a one-shot read.
 */
export function getSession(): SessionState {
  return session;
}
