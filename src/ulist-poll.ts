// ─── v3-owned ulist poll — replaces get_info()'s loadjscssfile dance (migration Phase 1) ─
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
import { emit, type User } from "./store";
import { getChatId, getChatSid, getPChat } from "./upstream";
import { cclog } from "./utils";

let chatId = ""; // read ONCE at startUlistPoll — doesn't change per session
let chatSid = "";
let pchatBase = ""; // read ONCE at startUlistPoll — server-rendered, stable
let prevList: User[] = [];
let timerId: ReturnType<typeof setTimeout> | undefined;
let running = false;

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

/** Jitter range for the poll interval (±20% of base), so the server never
 *  sees a perfectly predictable request cadence. */
const JITTER_PCT = 0.2;

/**
 * One poll cycle: fetch ulist → parse → diff → emit. Errors are swallowed —
 * the next cycle retries silently (no cclog spam on a flaky network).
 * The empty-response guard prevents a transient bad response from blanking
 * the sidebar: if we had users before and the parse came back empty, we
 * keep the last snapshot.
 */
async function pollOnce(): Promise<void> {
  try {
    const url =
      pchatBase + "/ulist?AKTION=j&ID=" + chatId + "&SID=" + chatSid + "&x=" + Math.random();
    const resp = await fetch(url);
    const text = await resp.text();
    const chaMy = parseUlistResponse(text);
    // Empty-response guard: a transient bad response (parse fail, empty channel,
    // network blip returning HTML) must NOT blank the sidebar. If we had users
    // before and the parse came back empty, keep the last snapshot.
    if (chaMy.length === 0 && prevList.length > 0) return;
    const { newList, added, removed } = processUserlist(chaMy, prevList);
    prevList = newList;
    emit({ type: "userlist", users: newList, added, removed });
  } catch {
    // Silent retry next cycle — no cclog spam on a flaky network.
  }
}

function scheduleNext(intervalMs: number): void {
  const jitter = (Math.random() - 0.5) * 2 * intervalMs * JITTER_PCT;
  timerId = setTimeout(() => {
    pollOnce().finally(() => {
      if (running) scheduleNext(intervalMs);
    });
  }, intervalMs + jitter);
}

/**
 * Start the poll loop: read session data, immediate first fetch, then one cycle
 * roughly every intervalMs (±20% jitter). Starting while already running is a
 * no-op.
 */
export function startUlistPoll(intervalMs = 20000): void {
  chatId = getChatId();
  chatSid = getChatSid();
  pchatBase = getPChat();
  if (running) return;
  running = true;
  pollOnce().finally(() => {
    if (running) scheduleNext(intervalMs);
  });
  cclog("ulist-poll gestartet — alle ~" + intervalMs + " ms", "v3");
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
export function refreshUlistNow(intervalMs = 20000): void {
  if (timerId !== undefined) clearTimeout(timerId);
  pollOnce().finally(() => {
    if (running) scheduleNext(intervalMs);
  });
}

/** The most recent parsed userlist snapshot (empty before the first poll).
 *  Synchronous point-in-time read for callers that can't subscribe — mirrors
 *  global-userlist.ts getLastSnapshot(). */
export function getLastUserlist(): User[] {
  return prevList;
}
