// ─── v3 data-layer event bus (spec §2.2) ───────────────────────────────────
//
// A minimal typed pub/sub. Module-level singleton state (not a class) — matches
// the existing userStore singleton pattern in utils.ts. UI components
// subscribe() and re-render their fragment on relevant events; the data layer
// emits on session/userlist/config changes.
//
// Types (User, UserWithChannel, SessionState) moved to store.ts; re-exported
// here until S7 deletes this module. No DOM/WS/GM dependencies — pure in-memory,
// fully unit-testable.

// Re-export types that moved to store.ts (shim, dies in S7).
export type { User, UserWithChannel } from "./store";

import type { UserWithChannel } from "./store";

/** Events the data layer emits. Open union so future concerns extend it. */
export type BccEvent =
  | { type: "userlist"; users: import("./store").User[]; added: string[]; removed: string[] }
  | {
      type: "globalUserlist";
      channels: Map<string, import("./store").User[]>; // full snapshot: channel → users
      added: UserWithChannel[]; // users that just came online (any channel)
      removed: UserWithChannel[]; // users that just went offline (any channel)
    }
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
