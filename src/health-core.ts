// ─── Health core: connection state machine + staleness derivation ───────────
//
// Pure module: imports only the cadences leaf; nothing from store, DOM, or
// upstream. The state machine models the WebSocket lifecycle; the stale
// helpers turn freshness stamps into marker view models.

import { POLL_CADENCES } from "./cadences";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConnPhase = "connecting" | "connected" | "authdead";

export interface ConnState {
  phase: ConnPhase;
  attempt: number;
  since: number;
  lastMessageAt: number;
}

/** Machine codes for the latched boot error. The store carries these, never
 * the German display strings (those live in health-strings + the card). */
export type BootReasonCode = "structure-changed" | "ws-takeover" | "error";

/** A persisted key whose stored value failed validation at boot, with the
 * raw garbage value (shown verbatim in the notice). */
export interface InvalidSetting {
  key: string;
  value: unknown;
}

export interface BccHealthState {
  bootError: BootReasonCode | null;
  sendPathBroken: string | null;
  injectionDegraded: boolean;
  invalidSettings: InvalidSetting[];
  /** A set() persist to GM failed; latched until reload (D4). */
  persistFailed: boolean;
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
  | { type: "message"; at: number };

// ─── Thresholds ────────────────────────────────────────────────────────────

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
      return { ...prev, phase: "connected", attempt: 0, since: ev.at };
    case "close":
      return { ...prev, phase: "connecting", attempt: prev.attempt + 1, since: ev.at };
    case "authdead":
      return { ...prev, phase: "authdead", since: ev.at };
    case "message":
      return { ...prev, lastMessageAt: ev.at };
  }
}

// ─── Staleness derivation ────────────────────────────────────────────────────

/** Stale threshold in ms for a poll interval. */
export function staleThreshold(interval: number): number {
  return Math.max(interval * STALE_FACTOR, STALE_MIN_MS);
}

export interface StaleView {
  /** Channel userlist marker: age in ms, or null when fresh. */
  ulist: number | null;
  /** Global userlist (aw.js) marker: age in ms, or null when fresh. */
  aw: number | null;
  /** Stats marker: age in ms, or null when fresh. */
  stats: number | null;
}

/** Marker view models: age in ms when a marker should show, else null.
 * One marker per source; the two userlists are different feeds and never
 * merge. Stamp 0 = never succeeded = boot exclusion. */
export function staleMarkers(freshness: FreshnessState, now: number): StaleView {
  const staleAge = (stamp: number, interval: number) =>
    stamp > 0 && now - stamp > staleThreshold(interval) ? now - stamp : null;
  return {
    ulist: staleAge(freshness.ulistAt, POLL_CADENCES.ulist),
    aw: staleAge(freshness.awAt, POLL_CADENCES.aw),
    stats: staleAge(freshness.statsAt, POLL_CADENCES.stats),
  };
}

/** Next epoch at which any marker's visibility or displayed age can change,
 * or null when nothing is scheduled. Before a source goes stale that is its
 * threshold crossing (marker appears); once stale, whole-second boundaries
 * while the age still reads in seconds, then whole-minute boundaries after.
 * Failing polls write nothing, so renders rely on this schedule instead of
 * store events. */
export function nextStaleChange(freshness: FreshnessState, now: number): number | null {
  let next: number | null = null;
  const consider = (t: number) => {
    if (t > now && (next === null || t < next)) next = t;
  };
  const sources: Array<[number, number]> = [
    [freshness.ulistAt, POLL_CADENCES.ulist],
    [freshness.awAt, POLL_CADENCES.aw],
    [freshness.statsAt, POLL_CADENCES.stats],
  ];
  for (const [stamp, interval] of sources) {
    if (stamp === 0) continue;
    consider(stamp + staleThreshold(interval));
    const elapsed = now - stamp;
    const elapsedMinutes = Math.floor(elapsed / 60_000);
    consider(stamp + (elapsedMinutes + 1) * 60_000);
    const elapsedSeconds = Math.floor(elapsed / 1000);
    if (elapsed > staleThreshold(interval) && elapsedSeconds < 60) {
      consider(stamp + (elapsedSeconds + 1) * 1000);
    }
  }
  return next;
}
