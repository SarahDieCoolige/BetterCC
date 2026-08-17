// ─── v3-owned ulist poll — replaces get_info()'s loadjscssfile dance ────────
//
// The current-channel userlist arrives via cc_chat/ulist?AKTION=j, which upstream
// delivers by injecting a <script> that sets cha_my[] and calls set_uinfo1(). v3
// owns the fetch directly now — same endpoint, same data, parsed in-process and
// emitted as a "userlist" store event. Mirrors stats.ts and global-userlist.ts.
//
// The set_uinfo1 override (formerly userlist-wire.ts) is gone — this module is
// the sole driver of the current-channel userlist. processUserlist() moved here
// from userlist-wire.ts. refreshUlistNow() is the public trigger seam: Phase 1
// wires it to the /j channel-change event; future triggers (Phase 2's WS
// classifier, etc.) import and call it without the poll module knowing.

import { parseUserlist, diffUserlists } from "./userlist";
import { set, type User } from "./store";
import { getChatId, getChatSid, getPChat, getChaMy } from "./upstream";
import { cclog } from "./utils";
import { POLL_CADENCES } from "./cadences";

let chatId = ""; // read ONCE at startUlistPoll — doesn't change per session
let chatSid = "";
let pchatBase = ""; // read ONCE at startUlistPoll — server-rendered, stable
let prevList: User[] = [];
let timerId: ReturnType<typeof setTimeout> | undefined;
let running = false;
let stale = true; // true until first network poll with real data — drives 2s retry

// ─── parseUlistResponse ──────────────────────────────────────────────────────

/**
 * Extract the cha_my array from the ulist response by evaluating just the
 * `var cha_my = new Array(...)` declaration in a Function sandbox. The trailing
 * set_uinfo1() call in the response is excluded from the function body, so it
 * cannot execute as a side effect — we parse the data without running the
 * page's delivery script.
 *
 * Pure and unit-testable: string in, array out. Returns [] on malformed input
 * (missing declaration or eval failure) so a transient bad response doesn't
 * blank the sidebar — the store keeps the last good snapshot.
 */
export function parseUlistResponse(text: string): string[] {
  const decl = text.match(/var\s+cha_my\s*=\s*new\s+Array\([\s\S]*?\)\s*;/);
  if (!decl) return [];
  try {
    const fn = new Function(`${decl[0]} return cha_my;`) as () => string[];
    return fn();
  } catch {
    return [];
  }
}

// ─── processUserlist ─────────────────────────────────────────────────────────

/**
 * Pure core (tested): parse the flat cha_my array and diff against the
 * previous snapshot, returning everything the store event needs.
 */
export function processUserlist(chaMy: string[], prev: User[]) {
  const newList = parseUserlist(chaMy);
  const { added, removed } = diffUserlists(prev, newList);
  return { newList, added, removed };
}

// ─── Poll-Loop ──────────────────────────────────────────────────────────────

/**
 * One poll cycle: fetch ulist → parse → diff → emit. Errors are logged and
 * retried next cycle.
 *
 * Empty-response guard: a valid ulist response always contains at least our
 * own nick, so an "empty" response — new Array("") (the bare terminator, one
 * element, zero real users) or [] (a failed parse / bad HTML) — is NEVER a
 * legitimate snapshot. It means the daemon isn't ready (first join, channel
 * change), the response was garbage, or the parse failed. In all cases we
 * skip the emit entirely and retry next cycle, regardless of prevList state.
 *
 * The previous guard also required prevList.length > 0 before skipping, which
 * encoded the wrong assumption that an empty response could be legitimate. It
 * opened a hole: with no seed (prevList empty), the first empty daemon
 * response would fall through, set stale=false, and emit a bogus empty list.
 */
async function pollOnce(): Promise<void> {
  try {
    const url =
      pchatBase + "/ulist?AKTION=j&ID=" + chatId + "&SID=" + chatSid + "&x=" + Math.random();
    const resp = await fetch(url);
    const text = await resp.text();
    const chaMy = parseUlistResponse(text);
    // Guard: check for effective users, not raw array length. An empty response
    // is new Array("") — one element (the empty-string terminator) but zero
    // real users. A failed parse returns [] (zero elements, zero users). Both
    // are invalid; always skip + retry.
    if (!chaMy.some((s) => s !== "")) return;
    stale = false; // first successful network poll with real data — switch to normal interval
    const { newList, added, removed } = processUserlist(chaMy, prevList);
    prevList = newList;
    await set("userlist", { users: newList, added, removed });
  } catch (e) {
    cclog("ulist-poll: poll error — " + (e as Error).message, "v3");
  }
}

/** Stale-retry interval — used when no real user data has arrived yet (first
 *  join, channel change, transient empty response). Once real data arrives,
 *  scheduleNext switches to the normal poll interval. */
const STALE_RETRY_MS = 2000;

/**
 * Run one poll cycle, then reschedule the loop if still running. The shared
 * body of startUlistPoll / scheduleNext / refreshUlistNow — names the
 * "poll-then-rearm" concept so the three call sites don't drift apart.
 */
function pollAndReschedule(intervalMs: number): void {
  pollOnce().finally(() => {
    if (running) scheduleNext(intervalMs);
  });
}

function scheduleNext(intervalMs: number): void {
  // Retry at 2s until the first real network data arrives, then switch to
  // the normal interval. The seed from page-load cha_my populates prevList
  // immediately for the sidebar, but stale tracks whether we've received
  // fresh data from the daemon.
  const effectiveInterval = stale ? STALE_RETRY_MS : intervalMs;
  timerId = setTimeout(() => pollAndReschedule(intervalMs), effectiveInterval);
}

/**
 * Start the poll loop: read session data, immediate first fetch, then one cycle
 * every intervalMs. Starting while already running is a no-op.
 */
export function startUlistPoll(intervalMs = POLL_CADENCES.ulist): void {
  chatId = getChatId();
  chatSid = getChatSid();
  pchatBase = getPChat();
  if (running) return;
  running = true;
  // Seed the sidebar from the page-load cha_my so the userlist appears
  // immediately, while the first network poll is in flight (the fetch gets
  // queued behind the page-load request storm — up to 15s on live).
  // stale stays true so scheduleNext retries at 2s until real data arrives.
  const seed = getChaMy();
  if (seed.length > 0) {
    const { newList, added, removed } = processUserlist(seed, prevList);
    prevList = newList;
    void set("userlist", { users: newList, added, removed });
  }
  pollAndReschedule(intervalMs);
  cclog("ulist-poll started — every ~" + intervalMs + " ms", "v3");
}

/** Stop the poll loop. Idempotent — safe to call when not running. */
export function stopUlistPoll(): void {
  if (timerId !== undefined) clearTimeout(timerId);
  timerId = undefined;
  running = false;
}

/**
 * Immediate refresh — cancel any pending timer-fired poll, fetch now, reschedule.
 * The extensibility seam: future triggers import and call this without the poll
 * module knowing about them. Phase 1's only caller is the /j channel-change sub.
 */
export function refreshUlistNow(intervalMs = POLL_CADENCES.ulist): void {
  if (timerId !== undefined) clearTimeout(timerId);
  pollAndReschedule(intervalMs);
}
