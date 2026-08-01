// ─── Patched submit-handler builder (spec §3.2.3 / T8 / O1) ─────────────────
//
// The upstream <form name="hold"> onsubmit is a ~4KB inline handler that does
// message normalization, German-alias mapping, IP/trustpilot blocking, channel
// age-gates, and the away-timer reset, then runs delout() → document.inf. We
// REUSE it via new Function() rather than rewrite it — replicating all that
// risks silent feature loss (spec §3.2.3, resolved in plan).
//
// The one patch we apply: extend the away-timer-reset condition so it also
// fires for "/w " (whisper) — today upstream only resets for non-"/" messages
// and "/me ". The old commands.ts:13-16 did this with a bare .replace() that
// silently no-ops if the needle changes; here we surface that as an error so
// an upstream onsubmit change is loud, not a silent regression (review O1).

const AWAY_TIMER_NEEDLE = 'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){';
const AWAY_TIMER_REPLACEMENT =
  'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){';

/**
 * Apply the away-timer /w patch to the upstream onsubmit source string.
 * Pure — no DOM. Throws if the needle isn't found (so an upstream change to
 * the onsubmit body surfaces immediately instead of silently dropping the
 * /w away-timer reset).
 */
export function patchAwayTimer(onSubmitOrigStr: string): string {
  if (!onSubmitOrigStr.includes(AWAY_TIMER_NEEDLE)) {
    throw new Error(
      "patchAwayTimer: upstream onsubmit needle not found — the away-timer " +
        'condition changed upstream; "/w" messages will no longer reset the ' +
        "away timer. Inspect the hold form's onsubmit and update AWAY_TIMER_NEEDLE."
    );
  }
  // String.replace(string, string) replaces the first occurrence — there is
  // exactly one away-timer condition in the handler, so first-match is correct.
  return onSubmitOrigStr.replace(AWAY_TIMER_NEEDLE, AWAY_TIMER_REPLACEMENT);
}

/**
 * Build a callable from the (patched) upstream onsubmit source. Returns null
 * if there's no onsubmit source to build from (the caller then sends without
 * the normalization path — degenerate, but won't throw).
 *
 * @param holdForm  the relocated <form name="hold"> (a <body> child under v3)
 */
export function buildPatchedHandler(
  holdForm: HTMLFormElement | null
): ((...args: any[]) => any) | null {
  const raw = holdForm?.getAttribute("onsubmit") || "";
  if (!raw) return null;
  return new Function(raw.includes(AWAY_TIMER_NEEDLE) ? patchAwayTimer(raw) : raw) as (
    ...args: any[]
  ) => any;
}
