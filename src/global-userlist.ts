// ─── v3 Globaler Userlist-Poll: aw.js → diff → emit (spec §cross-channel) ──
//
// Feature (German): Der globale Userlist-Poll lädt das aw.js von
// images.chatcity.de alle 5 Sekunden, parst es (parseAw), vergleicht es mit
// dem letzten Snapshot (diffGlobal) und meldet Änderungen als
// "globalUserlist"-Store-Event. Pinned-Benutzer in anderen Kanälen werden so
// in der Sidebar sichtbar. Ein fehlgeschlagener Fetch wird still übersprungen
// und im nächsten Zyklus erneut versucht — kein Log-Spam.
//
// Technical (English): Mirrors the userlist-wire pattern — module-level state
// via let, pure core (diffGlobal) exported for testing, impure wiring
// (startPolling) that calls the pure core + emit(). fetchAw is the GM
// boundary and is mocked at the seam in tests.

import { parseAw } from "./userlist";
import { emit, type User, type UserWithChannel } from "./store";
import { fetchAw } from "./upstream";
import { cclog } from "./utils";

let lastSnapshot: Map<string, User[]> = new Map();
let timerId: ReturnType<typeof setInterval> | undefined;
let running = false;

// ─── diffGlobal ────────────────────────────────────────────────────────────

export interface GlobalDiff {
  added: UserWithChannel[];
  removed: UserWithChannel[];
}

/**
 * Diff two channel snapshots by user key, per channel. A user moving from one
 * channel to another shows up as removed (old channel) AND added (new
 * channel). Status/guest-flag changes are NOT add/remove — like
 * diffUserlists, only presence per channel matters.
 */
export function diffGlobal(
  prev: Map<string, User[]>,
  next: Map<string, User[]>,
): GlobalDiff {
  const added: UserWithChannel[] = [];
  const removed: UserWithChannel[] = [];
  for (const [channel, users] of next) {
    const prevKeys = new Set((prev.get(channel) ?? []).map((u) => u.key));
    for (const user of users) {
      if (!prevKeys.has(user.key)) added.push({ user, channel });
    }
  }
  for (const [channel, users] of prev) {
    const nextKeys = new Set((next.get(channel) ?? []).map((u) => u.key));
    for (const user of users) {
      if (!nextKeys.has(user.key)) removed.push({ user, channel });
    }
  }
  return { added, removed };
}

// ─── Poll-Loop ─────────────────────────────────────────────────────────────

/**
 * One poll cycle: fetch aw.js → parse → diff → emit. Errors are swallowed —
 * the next cycle retries silently (no cclog spam on a flaky network).
 */
async function pollOnce(): Promise<void> {
  try {
    const raw = await fetchAw();
    const next = parseAw(raw);
    // Defend against a server error returning non-aw.js content: an empty parse
    // result when we already have a snapshot is almost certainly a transient
    // error — skip the update rather than emitting a spurious mass-removal.
    if (next.size === 0 && lastSnapshot.size > 0) return;
    const { added, removed } = diffGlobal(lastSnapshot, next);
    lastSnapshot = next;
    emit({ type: "globalUserlist", channels: next, added, removed });
  } catch {
    // Silent retry next cycle.
  }
}

/**
 * Start the poll loop: immediate first fetch (no intervalMs delay), then one
 * cycle every intervalMs. Starting while already running is a no-op.
 */
export function startPolling(intervalMs: number): void {
  if (running) return;
  running = true;
  pollOnce(); // immediate first fetch — no 5s wait
  timerId = setInterval(pollOnce, intervalMs);
  cclog("Globaler Userlist-Poll gestartet — aw.js alle " + intervalMs + " ms", "v3");
}

/** Stop the poll loop. Idempotent — safe to call when not running. */
export function stopPolling(): void {
  if (timerId !== undefined) clearInterval(timerId);
  timerId = undefined;
  running = false;
}

// ─── Snapshot-Zugriff ──────────────────────────────────────────────────────

/**
 * Find the channel a user (by lowercase key) is currently in, or null if the
 * user is not in the last snapshot. For superban/popup point queries.
 */
export function findUserChannel(key: string): string | null {
  for (const [channel, users] of lastSnapshot) {
    for (const user of users) {
      if (user.key === key) return channel;
    }
  }
  return null;
}

/** The most recent parsed snapshot (channel → users), empty before the first poll. */
export function getLastSnapshot(): Map<string, User[]> {
  return lastSnapshot;
}
