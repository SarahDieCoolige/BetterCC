// v3 feature-flag selection.
//
// Pure decision: (stored GM flag value, current URL) → use v3 init?
// The IIFE in src/index.ts calls this; the helper itself has no side effects,
// which makes it unit-testable.

/**
 * Decide whether the v3 (rewritten parent-page UI) init path should run.
 *
 * Two independent enables, either of which turns v3 on:
 *   1. The GM-stored per-user flag `bcc_v3_{user}` is truthy (production toggle).
 *   2. The dev-server URL contains `?bcc=new` (dev-only override; mirrors the
 *      existing `?bcc=1` dev gate but selects the new UI).
 *
 * Default is OFF — the old init path is the safe default, so the rewrite only
 * activates when explicitly chosen. `?bcc=1` is intentionally NOT recognized
 * here: it selects the *old* UI on the dev server.
 *
 * @param storedFlag The value read from GM.getValue("bcc_v3_{user}"). May be
 *                   undefined/null/false when never set.
 * @param url        The page URL (window.location.href in production).
 */
export function shouldUseV3(storedFlag: unknown, url: string): boolean {
  if (isTruthy(storedFlag)) return true;

  // Dev-server override: ?bcc=new (exact value "new"). Must be a standalone
  // query param so "?bcc=newvalue" or "?newbcc=new" don't match.
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("bcc") === "new";
  } catch {
    return false;
  }
}

function isTruthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}
