// ─── v3 data-layer event bus (spec §2.2) ───────────────────────────────────
//
// A minimal typed pub/sub. Module-level singleton state (not a class) — matches
// the existing userStore singleton pattern in utils.ts. UI components
// subscribe() and re-render their fragment on relevant events; the data layer
// emits on session/userlist/config changes.
//
// No DOM/WS/GM dependencies — pure in-memory, fully unit-testable.

/** A user as parsed from the upstream cha[]/cha_my[] arrays (spec §2.4). */
export interface User {
  name: string;
  registered: boolean; // status contains "hR"
  guest: boolean;      // status contains "h"  (without R)
  sep: boolean;        // status contains "S"
  away: boolean;       // status contains "A"
}

/** Session state read from unsafeWindow globals (spec §2.3). */
export interface SessionState {
  nick: string;
  registered: boolean;
  guest: boolean;
  userId: string;
  sessionId: string;
  channel: string;
  authDead: boolean;
}

/** Events the data layer emits. Open union so future concerns extend it. */
export type BccEvent =
  | { type: "session"; session: SessionState }
  | { type: "userlist"; users: User[]; added: string[]; removed: string[] }
  | { type: "config"; key: string };

type Listener = (e: BccEvent) => void;

const listeners = new Set<Listener>();

/** Subscribe to data-layer events. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Emit an event to every subscriber. */
export function emit(e: BccEvent): void {
  for (const fn of listeners) fn(e);
}
