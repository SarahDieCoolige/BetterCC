// ─── Poll cadences: the single source for HTTP poll intervals ─────────────
//
// Both sides read these: the poll loops (ulist-poll, global-userlist, stats)
// schedule from here, and health-core's stale thresholds derive from here, so
// tuning a cadence can't desync the loop from its staleness expectation.
//
// Scoped to cross-module cadences on purpose. Single-consumer thresholds
// (STUCK_MS, ECHO_TIMEOUT_MS, …) stay next to their logic in health-core; a
// different shared-const family gets its own module instead of moving in here.

export const POLL_CADENCES = {
  /** Current-channel userlist (ulist-poll.ts), replaces upstream's 20s get_info timer. */
  ulist: 20_000,
  /** Global userlist aw.js fetch (global-userlist.ts). */
  aw: 5_000,
  /** Freunde stats fetch (stats.ts), matches upstream cadence. */
  stats: 10_000,
} as const;
