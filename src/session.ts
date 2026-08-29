// ─── v3 session module (spec §2.3) ─────────────────────────────────────────
//
// Session adapter: reads the upstream session globals and writes snapshots to
// the store. Polls auth-dead + channel every 2s — simpler than extending the
// WS handler, and channels change rarely (only on /j).

import { type SessionState, get, set } from "./store";
import { cclog } from "./utils";
import { getChatNick, getChannel, isAuthDead, isGuest, getChatId, getChatSid } from "./upstream";

let timer: ReturnType<typeof setInterval> | null = null;

/** Read a fresh snapshot from the upstream globals. */
function readSnapshot(): SessionState {
  const guest = isGuest();
  return {
    nick: getChatNick(),
    registered: !guest,
    guest,
    userId: getChatId(),
    sessionId: getChatSid(),
    channel: getChannel(),
    authDead: isAuthDead(),
  };
}

/**
 * Read session globals once at init and start the 2s poll for auth-dead and
 * channel changes. Writes the snapshot to the store on change.
 */
export function initSession(): void {
  // Idempotency guard: a re-init (HMR, double initV3) would otherwise stack a
  // second polling interval. Clear the old one.
  if (timer) clearInterval(timer);

  const snapshot = readSnapshot();
  set("session", snapshot);

  let prevChannel = snapshot.channel;
  let prevAuthDead = snapshot.authDead;
  timer = setInterval(() => {
    const next = readSnapshot();
    if (next.channel !== prevChannel || next.authDead !== prevAuthDead) {
      prevChannel = next.channel;
      prevAuthDead = next.authDead;
      set("session", next);
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
