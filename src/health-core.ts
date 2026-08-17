// ─── Health core: connection state machine + UI derivation ────────────────
//
// Pure module: imports only the cadences leaf; nothing from store, DOM, or
// upstream. The state machine models the WebSocket lifecycle; deriveUiState
// turns current state into booleans the health bar / status strip can render.

import { POLL_CADENCES } from "./cadences";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConnPhase = "connecting" | "connected" | "authdead";

export interface ConnState {
  phase: ConnPhase;
  attempt: number;
  since: number;
  lastMessageAt: number;
  /** Oldest send still awaiting its echo; 0 = none pending. New sends never
   * push it back, so a fired zombie banner can't be blinked away by sending
   * again; only an inbound message or a socket change clears it. */
  pendingSendAt: number;
  notice: string;
}

/** Machine codes for the latched boot error. The store carries these, never
 * the German display strings (those live in health-strings + the card). */
export type BootReasonCode = "structure-changed" | "ws-takeover" | "error";

export interface BccHealthState {
  bootError: BootReasonCode | null;
  sendPathBroken: string | null;
  injectionDegraded: boolean;
  signalsDegraded: boolean;
}

export interface FreshnessState {
  ulistAt: number;
  awAt: number;
  statsAt: number;
}

export type ConnEvent =
  | { type: "open"; at: number }
  | { type: "close"; at: number }
  | { type: "authdead"; at: number }
  | { type: "message"; at: number }
  | { type: "send"; at: number }
  | { type: "notice"; text: string };

// ─── Thresholds ────────────────────────────────────────────────────────────

/** Connecting for longer than this = stuck. Every failed retry fires a fresh
 * close event and resets conn.since, so this only trips on a silent hang (a
 * socket stuck mid-handshake, or upstream no longer retrying at all). Active
 * retrying is the attempt badge's job, not the stuck banner's. */
export const STUCK_MS = 30_000;

/** No server echo after send for longer than this = zombie. Never an idle
 * timer; only armed by a real send. Any inbound WS message counts as the
 * echo (we can't tell which message is ours without parsing the stream);
 * a frozen socket is silent both ways. */
export const ECHO_TIMEOUT_MS = 10_000;

/** Stale threshold = max(interval * factor, STALE_MIN_MS). */
export const STALE_FACTOR = 3;

/** Floor for the stale threshold so short-poll sources aren't too noisy. */
export const STALE_MIN_MS = 30_000;

// Nominal poll intervals live in cadences.ts, shared with the poll loops
// themselves.

// ─── State machine ────────────────────────────────────────────────────────

/** Advance connection state by one event. Authdead is terminal: nothing changes it. */
export function nextConn(prev: ConnState, ev: ConnEvent): ConnState {
  if (prev.phase === "authdead") return prev;

  switch (ev.type) {
    case "open":
      return { ...prev, phase: "connected", attempt: 0, since: ev.at, pendingSendAt: 0 };
    case "close":
      return {
        ...prev,
        phase: "connecting",
        attempt: prev.attempt + 1,
        since: ev.at,
        pendingSendAt: 0,
      };
    case "authdead":
      return { ...prev, phase: "authdead", since: ev.at };
    case "message":
      return { ...prev, lastMessageAt: ev.at, pendingSendAt: 0 };
    case "send":
      // Oldest pending send keeps the deadline; a newer send must not buy
      // the connection another quiet window.
      return { ...prev, pendingSendAt: prev.pendingSendAt > 0 ? prev.pendingSendAt : ev.at };
    case "notice":
      return { ...prev, notice: ev.text };
  }
}

// ─── UI derivation ────────────────────────────────────────────────────────

function staleThreshold(interval: number): number {
  return Math.max(interval * STALE_FACTOR, STALE_MIN_MS);
}

function isStale(stamp: number, now: number, interval: number): boolean {
  if (stamp === 0) return false; // never succeeded: boot
  return now - stamp > staleThreshold(interval);
}

export function deriveUiState(
  conn: ConnState,
  freshness: FreshnessState,
  now: number,
): { stuck: boolean; zombie: boolean; stale: { ulist: boolean; aw: boolean; stats: boolean } } {
  const stuck = conn.phase === "connecting" && conn.since > 0 && now - conn.since > STUCK_MS;
  const zombie =
    conn.phase === "connected" &&
    conn.pendingSendAt > 0 &&
    now - conn.pendingSendAt > ECHO_TIMEOUT_MS;

  return {
    stuck,
    zombie,
    stale: {
      ulist: isStale(freshness.ulistAt, now, POLL_CADENCES.ulist),
      aw: isStale(freshness.awAt, now, POLL_CADENCES.aw),
      stats: isStale(freshness.statsAt, now, POLL_CADENCES.stats),
    },
  };
}
